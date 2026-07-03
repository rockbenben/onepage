import { describe, it, expect } from "vitest";
import { parseOgImage, pickThumbSource, extFromContentType, ghUserFrom, slugify } from "../scripts/helpers.mjs";
import { slugify as schemaSlugify } from "../src/lib/schema";

describe("parseOgImage", () => {
  it("解析 property 在前", () => {
    expect(parseOgImage(`<meta property="og:image" content="https://a.com/x.png">`))
      .toBe("https://a.com/x.png");
  });
  it("解析 content 在前 / name= / 单引号", () => {
    expect(parseOgImage(`<meta content='/y.jpg' name='og:image'/>`)).toBe("/y.jpg");
  });
  it("无标签返回 null", () => {
    expect(parseOgImage("<html><head></head></html>")).toBeNull();
  });
  it("解析无引号的压缩属性（Docusaurus 等构建产物）", () => {
    expect(
      parseOgImage(`<meta data-rh=true property=og:image content=https://a.com/social-card.png />`),
    ).toBe("https://a.com/social-card.png");
    // og:image:width 不能被误当成 og:image
    expect(parseOgImage(`<meta property=og:image:width content=1280 />`)).toBeNull();
  });
});

describe("pickThumbSource", () => {
  it("image 本地路径 → local", () => {
    expect(pickThumbSource({ image: "/covers/a.png" }, "u")).toEqual({ kind: "local", path: "/covers/a.png" });
  });
  it("image 远程 URL → remote（优先级最高）", () => {
    expect(pickThumbSource({ image: "https://a.com/x.png", demo: "https://d.com" }, "u"))
      .toEqual({ kind: "remote", url: "https://a.com/x.png" });
  });
  it("无 image 有 demo → og", () => {
    expect(pickThumbSource({ demo: "https://d.com" }, "u")).toEqual({ kind: "og", url: "https://d.com" });
  });
  it("只有 repo → GitHub 社交卡片", () => {
    expect(pickThumbSource({ repo: "r" }, "u"))
      .toEqual({ kind: "remote", url: "https://opengraph.githubassets.com/1/u/r" });
  });
  it("啥都没有 → null；有 repo 无 ghUser → null", () => {
    expect(pickThumbSource({}, "u")).toBeNull();
    expect(pickThumbSource({ repo: "r" }, null)).toBeNull();
  });
});

describe("extFromContentType", () => {
  it("常见类型映射，未知/svg 回退 .png（svg 不在自动下载白名单内）", () => {
    expect(extFromContentType("image/jpeg")).toBe(".jpg");
    expect(extFromContentType("image/webp")).toBe(".webp");
    expect(extFromContentType("image/svg+xml")).toBe(".png");
    expect(extFromContentType("image/whatever")).toBe(".png");
  });
});

describe("ghUserFrom", () => {
  it("从主页 URL 提取用户名", () => {
    expect(ghUserFrom("https://github.com/rockbenben")).toBe("rockbenben");
    expect(ghUserFrom(undefined)).toBeNull();
  });
});

describe("slugify", () => {
  it("空格标点转连字符、保留中文、小写", () => {
    expect(slugify("My Great Essay!")).toBe("my-great-essay");
    expect(slugify("千世书 Thousand Lives")).toBe("千世书-thousand-lives");
  });

  it("与 src/lib/schema.ts 的 slugify 输出一致（防两份实现漂移）", () => {
    const samples = ["My Great Essay!", "千世书 Thousand Lives", "  --Edge--Case!! ", "A_B.C/D", "中文123abc"];
    for (const s of samples) expect(slugify(s)).toBe(schemaSlugify(s));
  });
});
