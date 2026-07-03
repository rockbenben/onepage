import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import yaml from "js-yaml";
import { normalizeSite, slugify, type SiteData, type WorkItem } from "./schema";

// 以项目根目录为基准（构建时 import.meta.url 会指向 dist，不可靠）
const p = (rel: string) => resolve(process.cwd(), rel);

export interface GhRepo {
  stars: number;
  language: string | null;
  updated: string;
  url: string;
  description: string | null;
}

export interface GhData {
  fetched: string;
  totalStars: number;
  repos: Record<string, GhRepo>;
}

export interface Assets {
  avatar?: string;
  shots: Record<string, string>;
}

export const site: SiteData = normalizeSite(
  yaml.load(readFileSync(p("src/data/projects.yaml"), "utf8")),
);

export const gh: GhData = existsSync(p("src/data/github.json"))
  ? JSON.parse(readFileSync(p("src/data/github.json"), "utf8"))
  : { fetched: "", totalStars: 0, repos: {} };

export const assets: Assets = existsSync(p("src/data/assets.json"))
  ? JSON.parse(readFileSync(p("src/data/assets.json"), "utf8"))
  : { shots: {} };

const ghUser = site.profile.github?.match(/github\.com\/([^/?#]+)/)?.[1];

export function repoOf(name?: string): GhRepo | undefined {
  return name ? gh.repos[name] : undefined;
}

export function fmtStars(n?: number): string {
  if (!n) return "";
  return n >= 1000 ? `${(n / 1000).toFixed(1)}k` : String(n);
}

export function ghUrl(repo?: string): string | undefined {
  if (!repo) return undefined;
  return repoOf(repo)?.url ?? (ghUser ? `https://github.com/${ghUser}/${repo}` : undefined);
}

/** 缩略图：本地 image 直用；否则查构建时缓存（含远程 image 下载结果） */
export function thumbOf(item: WorkItem): string | undefined {
  if (item.image && !/^https?:/.test(item.image)) return item.image;
  const slug = item.repo ?? slugify(item.name ?? "");
  return assets.shots[slug];
}
