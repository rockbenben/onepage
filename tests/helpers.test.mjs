import { describe, it, expect } from "vitest";
import { parseOgImage, extFromContentType, ghUserFrom, slugify } from "../scripts/helpers.mjs";
import { repoFromUrl, fixUrl, loadConfig, TOP_ALIAS, WORK_ALIAS, LANG_NAME_ALIAS } from "../scripts/helpers.mjs";
import { slugify as schemaSlugify } from "../src/lib/schema";

describe("repoFromUrl", () => {
  it("仓库形状解析、纯主页/非 github 为 null", () => {
    expect(repoFromUrl("https://github.com/a/b")).toEqual({ owner: "a", repo: "b" });
    expect(repoFromUrl("https://github.com/a/b/tree/main/x")).toEqual({ owner: "a", repo: "b" });
    expect(repoFromUrl("https://github.com/a")).toBeNull();
    expect(repoFromUrl("https://example.com/a/b")).toBeNull();
    expect(repoFromUrl(undefined)).toBeNull();
  });
});

describe("fixUrl 零配置纠错", () => {
  it("裸邮箱补 mailto:、裸域名补 https://、其余原样", () => {
    expect(fixUrl("hi@example.com")).toBe("mailto:hi@example.com");
    expect(fixUrl("example.com")).toBe("https://example.com");
    expect(fixUrl("example.com/page")).toBe("https://example.com/page");
    expect(fixUrl("https://a.com")).toBe("https://a.com");
    expect(fixUrl("mailto:a@b.c")).toBe("mailto:a@b.c");
    expect(fixUrl("/resume.pdf")).toBe("/resume.pdf"); // 站内路径不动
  });
});

describe("别名表", () => {
  it("中英双认指向同一内部键", () => {
    expect(TOP_ALIAS["名字"]).toBe("name");
    expect(TOP_ALIAS.name).toBe("name");
    expect(WORK_ALIAS["重点"]).toBe("star");
    expect(WORK_ALIAS.star).toBe("star");
    expect(LANG_NAME_ALIAS["中文"]).toBe("zh-CN");
  });
});

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
  it("反转义 HTML 实体（GitHub 预签名 Social preview 的 &amp; 不还原会 401）", () => {
    expect(
      parseOgImage(
        `<meta property="og:image" content="https://repository-images.githubusercontent.com/1/x?X-Amz-Expires=300&amp;X-Amz-Signature=abc&amp;jwt=ey.z" />`,
      ),
    ).toBe("https://repository-images.githubusercontent.com/1/x?X-Amz-Expires=300&X-Amz-Signature=abc&jwt=ey.z");
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

describe("loadConfig：统一走 CORE_SCHEMA", () => {
  it("无引号日期解析成字符串，不吞成 JS Date", () => {
    const doc = loadConfig("日期: 2026-05-01");
    expect(doc.日期).toBe("2026-05-01");
    expect(doc.日期).not.toBeInstanceOf(Date);
  });
});
