/**
 * 构建时抓取一切远程资源，页面运行时零请求：
 *   1) GitHub 仓库数据（stars 等）→ src/data/github.json （无 GitHub 配置则跳过）
 *   2) 头像（profile.avatar 远程 URL 或 GitHub 头像）→ public/avatar-auto.*
 *   3) featured 区块缩略图（image 字段 > demo 的 og:image > GitHub 社交卡片）→ public/shots/
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
import yaml from "js-yaml";
import { parseOgImage, pickThumbSource, extFromContentType, ghUserFrom, slugify } from "./helpers.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const FORCE = process.argv.includes("--force");
const EXTS = [".png", ".jpg", ".jpeg", ".webp", ".gif", ".avif"];
const TIMEOUT = 15000;

const site = yaml.load(await readFile(resolve(ROOT, "src/data/projects.yaml"), "utf8"));
const ghUser = ghUserFrom(site.profile?.github);
const sections = site.sections ?? [];
const allItems = sections.flatMap((s) => s.items ?? []);

const get = (url, headers = {}) =>
  fetch(url, {
    redirect: "follow",
    signal: AbortSignal.timeout(TIMEOUT),
    headers: { "User-Agent": "Mozilla/5.0 (compatible; portfolio-build)", ...headers },
  });

/* ---------- 1) GitHub 仓库数据 ---------- */
const wantGh = ghUser && allItems.some((i) => i.repo || i.auto === "total_stars");
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
    for (const r of repos) {
      if (r.private) continue;
      totalStars += r.stargazers_count;
      map[r.name] = {
        stars: r.stargazers_count,
        language: r.language,
        updated: r.pushed_at,
        url: r.html_url,
        description: r.description,
      };
    }
    await mkdir(resolve(ROOT, "src/data"), { recursive: true });
    await writeFile(
      resolve(ROOT, "src/data/github.json"),
      JSON.stringify({ fetched: new Date().toISOString(), totalStars, repos: map }, null, 2),
    );
    console.log(`✔ ${Object.keys(map).length} repos, ${totalStars} stars → src/data/github.json`);
  } catch (e) {
    console.warn(`⚠ GitHub API 失败：${e.message}（star 数据将缺省，构建继续）`);
  }
} else {
  console.log("· 未配置 GitHub 或未引用 repo，跳过 GitHub API");
}

/* ---------- 通用下载（增量缓存） ---------- */
async function download(url, dir, name) {
  for (const e of EXTS) {
    if (!FORCE && existsSync(resolve(dir, name + e))) return name + e; // 已缓存
  }
  const res = await get(url);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const ct = res.headers.get("content-type") ?? "";
  if (!ct.startsWith("image/")) throw new Error(`非图片响应（${ct}）`);
  const file = name + extFromContentType(ct);
  await writeFile(resolve(dir, file), Buffer.from(await res.arrayBuffer()));
  return file;
}

const assets = { shots: {} };

/* ---------- 2) 头像 ---------- */
try {
  let avatarUrl = null;
  if (site.profile?.avatar && /^https?:/.test(site.profile.avatar)) avatarUrl = site.profile.avatar;
  else if (!site.profile?.avatar && ghUser) avatarUrl = `https://github.com/${ghUser}.png?size=240`;
  if (avatarUrl) {
    const f = await download(avatarUrl, resolve(ROOT, "public"), "avatar-auto");
    assets.avatar = `/${f}`;
    console.log(`✔ 头像 → public/${f}`);
  }
} catch (e) {
  console.warn(`⚠ 头像下载失败：${e.message}`);
}

/* ---------- 3) featured 缩略图 ---------- */
const shotsDir = resolve(ROOT, "public/shots");
await mkdir(shotsDir, { recursive: true });
const featuredItems = sections.filter((s) => s.type === "featured").flatMap((s) => s.items ?? []);

for (const item of featuredItems) {
  const slug = item.repo ?? slugify(item.name ?? "");
  if (!slug) continue;
  try {
    const cached = EXTS.map((e) => slug + e).find((f) => existsSync(resolve(shotsDir, f)));
    if (cached && !FORCE) {
      assets.shots[slug] = `/shots/${cached}`;
      continue;
    }
    const src = pickThumbSource(item, ghUser);
    if (!src || src.kind === "local") continue; // 本地 image 由页面直接引用
    let imgUrl = src.url;
    if (src.kind === "og") {
      try {
        const res = await get(src.url);
        if (!res.ok) throw new Error(`demo 页 HTTP ${res.status}`);
        const og = parseOgImage(await res.text());
        if (!og) throw new Error("页面无 og:image");
        imgUrl = new URL(og, res.url || src.url).href;
      } catch (e) {
        if (item.repo && ghUser) {
          console.warn(`⚠ 缩略图 ${slug} og 抓取失败，回退 GitHub 社交卡片：${e.message}`);
          imgUrl = `https://opengraph.githubassets.com/1/${ghUser}/${item.repo}`;
        } else {
          throw e;
        }
      }
    }
    const f = await download(imgUrl, shotsDir, slug);
    assets.shots[slug] = `/shots/${f}`;
    console.log(`✔ 缩略图 ${slug} → public/shots/${f}`);
  } catch (e) {
    console.warn(`⚠ 缩略图 ${slug} 失败：${e.message}（该卡退回纯文字）`);
  }
}

await writeFile(resolve(ROOT, "src/data/assets.json"), JSON.stringify(assets, null, 2));
console.log(`✔ 资源映射 → src/data/assets.json`);
