/**
 * 构建时抓取一切远程资源，页面运行时零请求：
 *   1) GitHub 仓库数据（stars 等）→ src/data/github.json （无 GitHub 配置则跳过）
 *   2) 头像（头像 远程 URL 或 GitHub 头像）→ public/avatar-auto.*
 *   3) 全部作品缩略图（图 字段 > 仓库自定义 Social preview > 链接 的 og:image > GitHub 社交卡片）→ public/shots/
 * 资源映射写入 src/data/assets.json。已存在的文件增量跳过，--force 重抓。
 * 任何单项失败只 warn，不中断构建。
 *
 * 用法：node scripts/fetch-github.mjs [--force]
 * 可选：GITHUB_TOKEN 提升 API 限额（Actions 里自动有）。
 */
import { writeFile, mkdir, readFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";
import {
  parseOgImage,
  extFromContentType,
  ghUserFrom,
  itemKey,
  repoFromUrl,
  fixUrl,
  loadConfig,
  selectOpensourceRepos,
  TOP_ALIAS,
  WORK_ALIAS,
} from "./helpers.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const FORCE = process.argv.includes("--force");
const EXTS = [".png", ".jpg", ".jpeg", ".webp", ".gif", ".avif"];
const TIMEOUT = 15000;

// 按别名表把中英键归一成内部键，中文优先（简化版，够本脚本用；
// 完整版含告警见 src/lib/schema.ts 的 normalizeKeys）
function normalize(raw, alias) {
  const out = {};
  for (const [k, v] of Object.entries(raw ?? {})) {
    const canon = alias[k];
    if (!canon) continue;
    const isZh = /[^\x00-\x7f]/.test(k);
    if (canon in out && !isZh) continue; // 已有值且当前键是英文 → 保留已有（中文优先）
    out[canon] = v;
  }
  return out;
}

// loadConfig 固定用 CORE_SCHEMA 解析（见 helpers.mjs）：防未加引号的「日期: 2024-01-15」
// 被解析成 JS Date
const rawSite = loadConfig(await readFile(resolve(ROOT, "src/data/projects.yaml"), "utf8"));
const top = normalize(rawSite, TOP_ALIAS);

// 链接：单键映射列表（- 标签: 网址），取第一条含 github.com 的算站主用户名
const links = (Array.isArray(top.links) ? top.links : [])
  .flatMap((l) => (l && typeof l === "object" ? Object.values(l) : []))
  .filter((v) => typeof v === "string");
const ghLink = links.find((u) => /github\.com/i.test(u));
const ghUser = ghLink ? ghUserFrom(ghLink) : null;

// 作品：逐条归一字段名；链接/源码 过一遍 fixUrl——裸域名（如 example.com）不补协议
// 会让后面的 fetch/new URL 直接失败，抓图整条跳过
const works = (Array.isArray(top.works) ? top.works : [])
  .filter((w) => w && typeof w === "object" && !Array.isArray(w))
  .map((w) => normalize(w, WORK_ALIAS))
  .map((w) => ({
    ...w,
    ...(w.link !== undefined && { link: fixUrl(w.link) }),
    ...(w.source !== undefined && { source: fixUrl(w.source) }),
  }));

// 数据：单键映射列表，值为 自动/auto 才需要 GitHub API
const stats = (Array.isArray(top.stats) ? top.stats : []).filter(
  (s) => s && typeof s === "object" && !Array.isArray(s),
);
const hasAutoStat = stats.some((s) => Object.values(s).some((v) => v === "自动" || v === "auto"));

// 某作品的 源码/链接 是否指向站主本人的仓库（github.com/<ghUser>/<repo> 形状）
function ownRepo(item) {
  const r = repoFromUrl(item.source) || repoFromUrl(item.link);
  return r && ghUser && r.owner.toLowerCase() === ghUser.toLowerCase() ? r.repo : null;
}

// 429 退避重试：Actions 里连抓十几张时 opengraph.githubassets.com 会突发限流。
// 请求间均匀加间隙没用（本就隔 ~0.6s，限的是窗口配额），只在挨限流时等，认 Retry-After。
const get = async (url, headers = {}, init = {}, left = 2) => {
  const res = await fetch(url, {
    redirect: "follow",
    signal: AbortSignal.timeout(TIMEOUT),
    headers: { "User-Agent": "Mozilla/5.0 (compatible; portfolio-build)", ...headers },
    ...init,
  });
  if (res.status !== 429 || left <= 0) return res;
  // GitHub 官方：有 retry-after 就等够，否则指数退避；加抖动防多任务撞同一窗口
  const after = Number(res.headers.get("retry-after"));
  const wait =
    Number.isFinite(after) && after > 0
      ? Math.min(after, 60) * 1000
      : [5000, 20000][2 - left] * (1 + Math.random()); // 5–10s → 20–40s
  await new Promise((r) => setTimeout(r, wait));
  return get(url, headers, init, left - 1);
};

/* ---------- 1) GitHub 仓库数据 ---------- */
// 开源节配置（供下方抓开源缩略图用，与 src/lib/schema.ts / data.ts 同义）
const osThreshold = typeof top.opensource === "number" ? top.opensource : top.opensource === true ? 10 : undefined;
const osSince = top.opensourceSince !== undefined ? String(top.opensourceSince) : undefined;
const osStarLine = typeof top.starLine === "number" ? top.starLine : 20;
const osMax = typeof top.opensourceMax === "number" ? top.opensourceMax : undefined;
const osExclude = new Set((Array.isArray(top.opensourceExclude) ? top.opensourceExclude : []).filter((s) => typeof s === "string").map((s) => s.toLowerCase()));
let ghMap = {}; // github.json 的 repos 映射，抓好后供开源缩略图循环复用
const wantGh = Boolean(ghUser && (hasAutoStat || top.opensource !== undefined || works.some((w) => ownRepo(w))));
if (wantGh) {
  try {
    const headers = {
      Accept: "application/vnd.github+json",
      ...(process.env.GITHUB_TOKEN ? { Authorization: `Bearer ${process.env.GITHUB_TOKEN}` } : {}),
    };
    const repos = [];
    for (let page = 1; page <= 5; page++) {
      const res = await get(
        `https://api.github.com/users/${ghUser}/repos?per_page=100&page=${page}&type=owner`,
        headers,
      );
      if (!res.ok) throw new Error(`GitHub API ${res.status}: ${await res.text()}`);
      const batch = await res.json();
      repos.push(...batch);
      if (batch.length < 100) break;
    }
    const map = {};
    let totalStars = 0;
    let repoCount = 0; // 非 fork/归档的公开仓库数（数据条「项目数」自动值用）
    let totalForks = 0; // 累计 Fork 数（数据条「forks」自动值用）
    for (const r of repos) {
      if (r.private) continue;
      totalStars += r.stargazers_count;
      if (!r.fork && !r.archived) {
        repoCount++;
        totalForks += r.forks_count;
      }
      map[r.name] = {
        stars: r.stargazers_count,
        language: r.language,
        updated: r.pushed_at,
        url: r.html_url,
        description: r.description,
        homepage: r.homepage || null,
        fork: r.fork,
        archived: r.archived,
        created: r.created_at,
      };
    }
    ghMap = map;
    await mkdir(resolve(ROOT, "src/data"), { recursive: true });
    await writeFile(
      resolve(ROOT, "src/data/github.json"),
      JSON.stringify({ fetched: new Date().toISOString(), totalStars, repoCount, totalForks, repos: map }, null, 2),
    );
    console.log(`✔ ${Object.keys(map).length} repos, ${totalStars} stars → src/data/github.json`);
  } catch (e) {
    console.warn(`⚠ GitHub API 失败：${e.message}（star 数据将缺省，构建继续）`);
  }
} else {
  console.log("· 未配置 GitHub 或未引用仓库，跳过 GitHub API");
}

/* ---------- 1.5) 开源节选仓 + 批量查自定义 Social preview ---------- */
// 选仓提前到这里，好和作品仓库一起进下面那次 GraphQL 批量查询
const picked =
  osThreshold !== undefined && ghUser && Object.keys(ghMap).length
    ? selectOpensourceRepos(ghMap, {
        usedRepos: new Set(works.map((w) => ownRepo(w)).filter(Boolean).map((s) => s.toLowerCase())),
        threshold: osThreshold,
        since: osSince,
        starLine: osStarLine,
        max: osMax,
        exclude: osExclude,
      })
    : [];

/**
 * 一次 GraphQL 批量拿「哪些仓库设了自定义 Social preview、图在哪」。
 * GitHub 的 usesCustomOpenGraphImage / openGraphImageUrl 是权威答案，省掉逐仓库抓
 * github.com 页面正则解析 og:image（每仓库多一次 HTTP，且实测同一仓库两次能返回不同结果）。
 * 只收 usesCustomOpenGraphImage 为真的——没设的留空，好让作品继续走「站点 og > 自动卡」优先级。
 * 需要 token（GraphQL 强制鉴权）；无 token / 查询失败返回 null，调用方回退抓页面。
 * ponytail: 预签名 URL 5 分钟过期，仓库多到下载跑超 5 分钟会 401，到时改成分批查。
 */
async function fetchCustomPreviews(user, repos) {
  if (!process.env.GITHUB_TOKEN || !user || !repos.length) return null;
  try {
    const q = `{${repos.map((r, i) => `r${i}:repository(owner:"${user}",name:"${r}"){usesCustomOpenGraphImage openGraphImageUrl}`).join(" ")}}`;
    const res = await get("https://api.github.com/graphql", {
      Authorization: `Bearer ${process.env.GITHUB_TOKEN}`,
      "Content-Type": "application/json",
    }, { method: "POST", body: JSON.stringify({ query: q }) });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const { data } = await res.json();
    if (!data) throw new Error("无 data 字段");
    const map = {};
    repos.forEach((r, i) => {
      const n = data[`r${i}`];
      if (n?.usesCustomOpenGraphImage && n.openGraphImageUrl) map[r] = n.openGraphImageUrl;
    });
    console.log(`✔ ${Object.keys(map).length}/${repos.length} 个仓库有自定义 Social preview（GraphQL）`);
    return map;
  } catch (e) {
    console.warn(`⚠ GraphQL 查 Social preview 失败：${e.message}（回退逐仓库抓页面）`);
    return null;
  }
}

const ogMap = await fetchCustomPreviews(ghUser, [
  ...new Set([...works.map((w) => ownRepo(w)).filter(Boolean), ...picked.map(([n]) => n)]),
]);

/* ---------- 通用下载（增量缓存 + 构建时优化） ---------- */
// 缩略图卡片显示 ~330px，留 2x 视网膜余量 → 上限 800px 宽；转 WebP 质量 80，
// 把 1200×630 原图（实测常 60–150K）压到 ~12–25K，砍掉 ~70–85% 首屏图片重量。
const THUMB_MAX_W = 800;
const THUMB_QUALITY = 80;
async function download(url, dir, name) {
  const out = name + ".webp";
  if (!FORCE && existsSync(resolve(dir, out))) return out; // 已缓存（优化后固定 .webp）
  const res = await get(url);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  // 不按 content-type 拦：GitHub 自定义 Social preview 走 S3 预签名 URL，回的是
  // binary/octet-stream，拦下来的恰好全是设了 preview 的仓库。由 sharp 判断是不是图片。
  const ct = res.headers.get("content-type") ?? "";
  const input = Buffer.from(await res.arrayBuffer());
  try {
    // 缩到卡片尺寸（不放大）+ 压成 WebP（animated 兼容极少数动图预览）
    const webp = await sharp(input, { animated: true })
      .resize({ width: THUMB_MAX_W, withoutEnlargement: true })
      .webp({ quality: THUMB_QUALITY })
      .toBuffer();
    await writeFile(resolve(dir, out), webp);
    return out;
  } catch (e) {
    // sharp 读不了：确是图片响应就退回原图保证有图，否则是 HTML/错误页，别写成 .png
    if (!ct.startsWith("image/")) throw new Error(`非图片响应（${ct}）：${e.message}`);
    const raw = name + extFromContentType(ct);
    await writeFile(resolve(dir, raw), input);
    return raw;
  }
}

/* ---------- 缩略图来源解析（作品与开源节共用） ---------- */
// 抓页面的 og:image，返回绝对 URL；无则抛错。
async function ogImageUrl(pageUrl) {
  const res = await get(pageUrl);
  if (!res.ok) throw new Error(`页面 HTTP ${res.status}`);
  const og = parseOgImage(await res.text());
  if (!og) throw new Error("页面无 og:image");
  return new URL(og, res.url || pageUrl).href;
}

// 缩略图来源优先级：手动远程图 > 仓库自定义 Social preview（作者在 GitHub Settings
// 上传的图，仓库页 og 落在 repository-images.githubusercontent.com）> 站点 og
// （作品的 demo 站；开源节传 null 跳过——长尾仓库的 homepage 常是通用图/商店图）
// > GitHub 自动卡片（opengraph.githubassets.com，永远仓库专属）。返回最终图片 URL。
async function resolveThumbUrl({ imageRemote = null, repo = null, site = null }, ghUser) {
  if (imageRemote) return imageRemote;
  let autoCard = null;
  if (repo && ghUser) {
    autoCard = `https://opengraph.githubassets.com/1/${ghUser}/${repo}`;
    if (ogMap) {
      if (ogMap[repo]) return ogMap[repo]; // GraphQL 已确认有自定义 Social preview
      // 没有就直接落到站点 og / 自动卡片，不必再抓页面
    } else {
      try {
        const og = await ogImageUrl(`https://github.com/${ghUser}/${repo}`);
        if (og.includes("repository-images.githubusercontent.com")) return og; // 自定义 Social preview
      } catch {
        /* 仓库页抓取失败，落到站点 og / 自动卡片 */
      }
    }
  }
  if (site) {
    try {
      return await ogImageUrl(fixUrl(site));
    } catch {
      /* 站点 og 失败，落到自动卡片 */
    }
  }
  if (autoCard) return autoCard;
  throw new Error("无可用缩略图来源");
}

const assets = { shots: {} };

/* ---------- 2) 头像 ---------- */
try {
  let avatarUrl = null;
  if (typeof top.avatar === "string" && /^https?:/.test(top.avatar)) avatarUrl = top.avatar;
  else if (!top.avatar && ghUser) avatarUrl = `https://github.com/${ghUser}.png?size=240`;
  if (avatarUrl) {
    const f = await download(avatarUrl, resolve(ROOT, "public"), "avatar-auto");
    assets.avatar = `/${f}`;
    console.log(`✔ 头像 → public/${f}`);
  }
} catch (e) {
  console.warn(`⚠ 头像下载失败：${e.message}`);
}

/* ---------- 3) 全部作品缩略图（不只重点） ---------- */
const shotsDir = resolve(ROOT, "public/shots");
await mkdir(shotsDir, { recursive: true });

for (const item of works) {
  if (!item.link && !item.source && !item.image) continue; // 链接/源码/图 全无才跳过——只写远程「图」的纯图作品（摄影等）也要下载缓存
  const name = item.name !== undefined && item.name !== null ? String(item.name) : "";
  // 缓存键必须与 src/lib/schema.ts 的 WorkItem.key 公式一致：slugify(名字)||原名，
  // 不掺 repo——否则清单页按 item.key 查表会查不到，缩略图静默消失
  const slug = itemKey(null, name);
  if (!slug) continue;
  try {
    const cached = EXTS.map((e) => slug + e).find((f) => existsSync(resolve(shotsDir, f)));
    if (cached && !FORCE) {
      assets.shots[slug] = `/shots/${cached}`;
      continue;
    }
    if (item.image && !/^https?:/.test(item.image)) continue; // 本地 image 由页面直接引用
    // 优先仓库自定义 Social preview（作者上传的项目专属图），其次 demo 站 og，最后 GitHub 自动卡片
    const imgUrl = await resolveThumbUrl(
      { imageRemote: item.image && /^https?:/.test(item.image) ? item.image : null, repo: ownRepo(item), site: item.link },
      ghUser,
    );
    const f = await download(imgUrl, shotsDir, slug);
    assets.shots[slug] = `/shots/${f}`;
    console.log(`✔ 缩略图 ${slug} → public/shots/${f}`);
  } catch (e) {
    console.warn(`⚠ 缩略图 ${slug} 失败：${e.message}（该卡退回纯文字）`);
  }
}

/* ---------- 4) 开源节缩略图（picked 见 1.5；键 = 仓库名，与 data.ts 的 item.key 一致）---------- */
for (const [name] of picked) {
  if (assets.shots[name]) continue; // 已在作品循环缓存过（同名）
  try {
    const cached = EXTS.map((e) => name + e).find((f) => existsSync(resolve(shotsDir, f)));
    if (cached && !FORCE) {
      assets.shots[name] = `/shots/${cached}`;
      continue;
    }
    // 仓库自定义 Social preview 优先，否则 GitHub 自动卡片；长尾仓库 homepage 常是通用图/商店图，故跳过（site: null）
    const imgUrl = await resolveThumbUrl({ repo: name, site: null }, ghUser);
    const f = await download(imgUrl, shotsDir, name);
    assets.shots[name] = `/shots/${f}`;
    console.log(`✔ 开源缩略图 ${name} → public/shots/${f}`);
  } catch (e) {
    console.warn(`⚠ 开源缩略图 ${name} 失败：${e.message}`);
  }
}

await writeFile(resolve(ROOT, "src/data/assets.json"), JSON.stringify(assets, null, 2));
console.log(`✔ 资源映射 → src/data/assets.json`);
