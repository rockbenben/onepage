/** 与 src/lib/schema.ts 的 slugify 保持同步（TS/MJS 无法互引，两处一致维护） */
export function slugify(name) {
  return String(name)
    .toLowerCase()
    .replace(/[^a-z0-9一-龥]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

export function ghUserFrom(url) {
  return url?.match(/github\.com\/([^/?#]+)/)?.[1] ?? null;
}

/** 从 HTML 提取 og:image 内容；容忍属性顺序、引号风格（含压缩后的无引号属性）、name= 写法 */
export function parseOgImage(html) {
  const tag = html.match(
    /<meta[^>]*(?:property|name)\s*=\s*["']?og:image(?:["']|(?=[\s/>]))[^>]*>/i,
  )?.[0];
  if (!tag) return null;
  const m = tag.match(/content\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'>]+))/i);
  return m?.[1] ?? m?.[2] ?? m?.[3] ?? null;
}

/**
 * 缩略图来源判定（手动优先，自动兜底）：
 * image 本地 → local；image 远程 → remote；demo → og 抓取；repo → GitHub 社交卡片
 */
export function pickThumbSource(item, ghUser) {
  if (item.image) {
    return /^https?:/.test(item.image)
      ? { kind: "remote", url: item.image }
      : { kind: "local", path: item.image };
  }
  if (item.demo) return { kind: "og", url: item.demo };
  if (item.repo && ghUser)
    return { kind: "remote", url: `https://opengraph.githubassets.com/1/${ghUser}/${item.repo}` };
  return null;
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
