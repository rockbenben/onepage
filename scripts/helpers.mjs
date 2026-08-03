import yaml from "js-yaml";

/**
 * 配置 YAML 的唯一解析入口：构建（src/lib/data.ts）、
 * 抓取（fetch-github.mjs）、校验（validate-config.mjs）、编辑器（importer.ts / edit.astro）
 * 全部必须走这里，不再各写一份 `yaml.load(text, { schema: ... })`。
 *
 * 固定用 CORE_SCHEMA（YAML 1.2 核心 schema）而非 js-yaml 默认 schema：默认 schema 会把
 * 未加引号的 日期: 2024-01-15（合法且常见的写法）解析成 JS Date 对象，之后但凡被
 * String(date) 或模板拼接就会产出带时区的乱码（如 "Mon Jan 15 2024 08:00:00 GMT+0800…"），
 * 而且解析阶段没有任何告警——正式页面会悄悄出现这种乱码。CORE_SCHEMA 没有
 * timestamp/merge 这类隐式类型，日期、版本号等值一律原样保留成字符串。
 */
export function loadConfig(text) {
  return yaml.load(text, { schema: yaml.CORE_SCHEMA });
}

/** 唯一权威实现：src/lib/schema.ts 直接从本文件导入，不再各写一份 */
export function slugify(name) {
  return String(name)
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, "-")
    .replace(/^-+|-+$/g, "");
}

/**
 * 条目身份键的唯一权威公式：repo 优先，其次 slugify(name)，最后兜底原名字符串。
 * repo: "" 也会回退（空字符串不是有效身份键）；纯标点名字 slugify 后会变成空串，
 * 用原名兜底避免塌缩成 ""；name 非字符串（YAML 数字/日期）一律先转字符串，不崩构建。
 * schema.ts 与 fetch-github.mjs 都从这里调用，不再各写一份手写公式。
 */
export function itemKey(repo, name) {
  return repo || slugify(name ?? "") || String(name ?? "");
}

export function ghUserFrom(url) {
  return url?.match(/github\.com\/([^/?#]+)/)?.[1] ?? null;
}

const ENTITIES = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", "#39": "'" };

/**
 * 从 HTML 提取 og:image 内容；容忍属性顺序、引号风格（含压缩后的无引号属性）、name= 写法。
 * 必须反转义 HTML 实体：GitHub 仓库自定义 Social preview 的 og:image 现在是带签名的
 * 预签名 URL（X-Amz-Signature… &jwt=…），属性里 & 一律写成 &amp;，不还原就会把查询参数
 * 粘成一个，下载直接 401，整站缩略图静默消失。
 */
export function parseOgImage(html) {
  const tag = html.match(
    /<meta[^>]*(?:property|name)\s*=\s*["']?og:image(?:["']|(?=[\s/>]))[^>]*>/i,
  )?.[0];
  if (!tag) return null;
  const m = tag.match(/content\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'>]+))/i);
  const raw = m?.[1] ?? m?.[2] ?? m?.[3] ?? null;
  return raw === null ? null : raw.replace(/&(amp|lt|gt|quot|apos|#39);/g, (_, e) => ENTITIES[e]);
}

const CT_EXT = {
  "image/png": ".png",
  "image/jpeg": ".jpg",
  "image/webp": ".webp",
  "image/gif": ".gif",
  "image/avif": ".avif",
};

export function extFromContentType(ct) {
  return CT_EXT[(ct ?? "").split(";")[0].trim()] ?? ".png";
}

/** schema v2 别名表：输入键（中/英）→ 内部键。TS 与 node 脚本共用，单一权威 */
export const TOP_ALIAS = {
  名字: "name", name: "name", 头衔: "title", title: "title",
  介绍: "intro", intro: "intro", 头像: "avatar", avatar: "avatar",
  链接: "links", links: "links", 作品: "works", works: "works",
  数据: "stats", stats: "stats", 网址: "url", url: "url",
  颜色: "color", color: "color", 页脚: "footer", footer: "footer",
  语言: "lang", lang: "lang",
  主题: "theme", theme: "theme",
  外观: "appearance", appearance: "appearance",
  开源项目: "opensource", opensource: "opensource",
  开源项目起始: "opensourceSince", opensource_since: "opensourceSince",
  星标线: "starLine", star_line: "starLine",
  开源上限: "opensourceMax", opensource_max: "opensourceMax",
  开源命名: "opensourceNames", opensource_names: "opensourceNames",
  开源描述: "opensourceDescriptions", opensource_descriptions: "opensourceDescriptions",
  开源排除: "opensourceExclude", opensource_exclude: "opensourceExclude",
  标记: "mark", mark: "mark",
};
export const WORK_ALIAS = {
  名字: "name", name: "name", 介绍: "desc", intro: "desc",
  链接: "link", link: "link", 源码: "source", source: "source",
  图: "image", image: "image", 日期: "date", date: "date",
  出处: "via", via: "via", 分类: "group", group: "group",
  重点: "star", star: "star",
};
/** 语言名双认：防「语言: 中文」被当未知码回退成英文界面 */
export const LANG_NAME_ALIAS = {
  中文: "zh-CN", 简体: "zh-CN", 繁体: "zh-TW", 繁體: "zh-TW",
  英文: "en", English: "en", english: "en",
  日语: "ja", 日本語: "ja", 韩语: "ko", 한국어: "ko",
};

/** 主题名双认：中文规范名 ↔ 英文别名，输入都归一到中文规范值 */
export const THEME_ALIAS = {
  朱砂: "朱砂", cinnabar: "朱砂",
  靛蓝: "靛蓝", indigo: "靛蓝",
  森绿: "森绿", pine: "森绿",
  暖褐: "暖褐", sepia: "暖褐",
  墨黑: "墨黑", mono: "墨黑",
};
/** 外观值双认 */
export const APPEARANCE_ALIAS = {
  自动: "自动", auto: "自动",
  亮: "亮", light: "亮",
  暗: "暗", dark: "暗",
};

/**
 * 开源节的仓库选取（过滤/去重/排序/可选上限），供 src/lib/data.ts 渲染与 fetch-github.mjs 抓图共用，
 * 单一权威避免两处逻辑跑偏。repos = github.json 形状 {name: {stars, created, updated, fork, archived, …}}。
 * usedRepos = 已被重点/手列占用的仓库名集合（小写）。exclude = 手动排除的仓库名集合（小写）。
 * 排序：star>starLine 的按 star 降序在前，其余按最近 updated 降序。
 */
export function selectOpensourceRepos(repos, { usedRepos, threshold, since, starLine = 20, max, exclude } = {}) {
  const excluded = exclude ?? new Set();
  const entries = Object.entries(repos).filter(
    ([name, r]) =>
      !r.fork &&
      !r.archived &&
      !usedRepos.has(name.toLowerCase()) &&
      !excluded.has(name.toLowerCase()) &&
      (r.stars >= threshold || (since !== undefined && (r.created ?? "") >= since)),
  );
  entries.sort((a, b) => {
    const aHi = a[1].stars > starLine;
    const bHi = b[1].stars > starLine;
    if (aHi !== bHi) return aHi ? -1 : 1;
    if (aHi) return b[1].stars - a[1].stars || a[0].localeCompare(b[0]);
    return (b[1].updated ?? "").localeCompare(a[1].updated ?? "") || a[0].localeCompare(b[0]);
  });
  return max ? entries.slice(0, max) : entries;
}

/** github.com/<用户>/<仓库> 形状才算仓库；纯用户主页/其他站返回 null */
export function repoFromUrl(u) {
  const m = /github\.com\/([^/?#]+)\/([^/?#]+)/.exec(String(u ?? ""));
  return m ? { owner: m[1], repo: m[2].replace(/\.git$/, "") } : null;
}

/** 零配置纠错：裸邮箱补 mailto:、裸域名补 https://；带协议/站内路径原样 */
export function fixUrl(u) {
  const s = String(u ?? "").trim();
  if (!s || /^[a-z][a-z0-9+.-]*:/i.test(s) || s.startsWith("/") || s.startsWith("#")) return s;
  if (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s)) return `mailto:${s}`;
  if (/^[\w-]+(\.[\w-]+)+([/?#].*)?$/.test(s)) return `https://${s}`;
  return s;
}
