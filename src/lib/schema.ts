export type SectionType = "featured" | "grid" | "list" | "stats";

export interface Social { label: string; url: string; icon?: string }
export interface Cta { label: string; url: string; primary?: boolean }

export interface Profile {
  name: string;
  title?: string;
  intro?: string;
  avatar?: string;
  github?: string;
  eyebrow: string;
  socials: Social[];
  ctas: Cta[];
}

export interface WorkItem {
  // featured / grid / list 通用
  name?: string;
  desc?: string;
  tagline?: string;
  repo?: string;
  demo?: string;
  demoLabel?: string;
  image?: string;
  tags: string[];
  // list 专用
  date?: string;
  url?: string;
  meta?: string;
  // stats 专用
  label?: string;
  value?: number;
  suffix?: string;
  auto?: string;
}

export interface Section {
  type: SectionType;
  title?: string;
  hint?: string;
  count?: boolean; // 标题旁自动显示条目数
  more?: string;
  moreLabel: string;
  items: WorkItem[];
}

export interface SiteData {
  lang: string;
  url?: string;
  footer?: string;
  theme: { accent: string; accent2: string };
  plan?: { total: number; done: number; label?: string };
  profile: Profile;
  sections: Section[];
}

const SECTION_TYPES: SectionType[] = ["featured", "grid", "list", "stats"];

export function slugify(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9一-龥]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function normalizeSite(raw: any): SiteData {
  if (!raw?.profile?.name) throw new Error("projects.yaml: profile.name 必填");

  const sections: Section[] = (raw.sections ?? []).map((s: any, i: number) => {
    if (!SECTION_TYPES.includes(s?.type)) {
      throw new Error(
        `projects.yaml: sections[${i}].type 无效（"${s?.type}"），可选：${SECTION_TYPES.join(" / ")}`,
      );
    }
    const items: WorkItem[] = (s.items ?? []).map((it: any, j: number) => {
      if (s.type === "stats") {
        if (!it?.label || it?.value == null)
          throw new Error(`projects.yaml: sections[${i}].items[${j}] stats 条目需要 label 和 value`);
      } else if (!it?.name) {
        throw new Error(`projects.yaml: sections[${i}].items[${j}] 缺少 name`);
      }
      return { tags: [], ...it };
    });
    return { moreLabel: "更多 →", ...s, items };
  });

  let plan: SiteData["plan"];
  if (raw.site?.plan != null) {
    const p = raw.site.plan;
    if (typeof p?.total !== "number" || typeof p?.done !== "number") {
      throw new Error("projects.yaml: site.plan 需要数字类型的 total 和 done");
    }
    plan = { total: p.total, done: p.done, label: p.label };
  }

  return {
    lang: raw.site?.lang ?? "zh-CN",
    url: raw.site?.url,
    footer: raw.site?.footer,
    theme: {
      accent: raw.site?.theme?.accent ?? "#c8402e",
      accent2: raw.site?.theme?.accent2 ?? "#a33524",
    },
    plan,
    profile: { eyebrow: "Portfolio", socials: [], ctas: [], ...raw.profile },
    sections,
  };
}
