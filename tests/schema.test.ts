import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import yaml from "js-yaml";
import { normalizeSite, slugify } from "../src/lib/schema";

const minimal = { profile: { name: "张三" } };

describe("normalizeSite", () => {
  it("最小配置也能出站，默认值 = 现状", () => {
    const s = normalizeSite(minimal);
    expect(s.lang).toBe("zh-CN");
    expect(s.theme).toEqual({ accent: "#c8402e", accent2: "#a33524" });
    expect(s.plan).toBeUndefined();
    expect(s.profile.eyebrow).toBe("Portfolio");
    expect(s.profile.socials).toEqual([]);
    expect(s.profile.ctas).toEqual([]);
    expect(s.sections).toEqual([]);
  });

  it("缺 profile.name 报错", () => {
    expect(() => normalizeSite({})).toThrow(/profile\.name/);
  });

  it("site.plan 解析与校验", () => {
    const s = normalizeSite({ ...minimal, site: { plan: { total: 365, done: 22, label: "x" } } });
    expect(s.plan).toEqual({ total: 365, done: 22, label: "x" });
    expect(() =>
      normalizeSite({ ...minimal, site: { plan: { total: "365" } } }),
    ).toThrow(/site\.plan/);
  });

  it("未知 section.type 报错并带下标", () => {
    expect(() =>
      normalizeSite({ ...minimal, sections: [{ type: "bento", items: [] }] }),
    ).toThrow(/sections\[0\].*bento/);
  });

  it("featured/grid/list 条目缺 name 报错", () => {
    expect(() =>
      normalizeSite({ ...minimal, sections: [{ type: "grid", items: [{ desc: "无名" }] }] }),
    ).toThrow(/sections\[0\].items\[0\].*name/);
  });

  it("stats 条目缺 label 或 value 报错", () => {
    expect(() =>
      normalizeSite({ ...minimal, sections: [{ type: "stats", items: [{ label: "x" }] }] }),
    ).toThrow(/sections\[0\].items\[0\].*value/);
  });

  it("写作者假数据（无 repo、list 为主）可完整解析", () => {
    const raw = yaml.load(readFileSync("tests/fixtures/writer.yaml", "utf8"));
    const s = normalizeSite(raw);
    expect(s.sections.map((x) => x.type)).toEqual(["featured", "list", "stats"]);
    expect(s.sections[1].items[0].date).toBe("2026-05");
    expect(s.profile.socials.length).toBeGreaterThan(0);
    // 全站无 repo 字段
    expect(s.sections.flatMap((x) => x.items).some((i) => i.repo)).toBe(false);
  });
});

describe("slugify", () => {
  it("空格标点转连字符、保留中文、小写", () => {
    expect(slugify("My Great Essay!")).toBe("my-great-essay");
    expect(slugify("千世书 Thousand Lives")).toBe("千世书-thousand-lives");
  });
});
