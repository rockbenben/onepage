import { describe, it, expect } from "vitest";
import { parseOgImage, extFromContentType, ghUserFrom, slugify } from "../scripts/helpers.mjs";
import { repoFromUrl, fixUrl, loadConfig, TOP_ALIAS, WORK_ALIAS, LANG_NAME_ALIAS } from "../scripts/helpers.mjs";
import { selectOpensourceRepos } from "../scripts/helpers.mjs";
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

describe("selectOpensourceRepos：max 只削尾巴，高星组永远全显", () => {
  const repo = (stars, updated) => ({
    stars,
    updated,
    created: "2020-01-01T00:00:00Z",
    language: null,
    url: "https://github.com/u/r",
    description: null,
    fork: false,
    archived: false,
  });
  const repos = {
    "hi-a": repo(100, "2020-01-01T00:00:00Z"),
    "hi-b": repo(30, "2021-01-01T00:00:00Z"),
    // 正好等于星标线 → 属于尾巴（判定是严格大于）
    edge: repo(20, "2026-03-01T00:00:00Z"),
    "tail-a": repo(5, "2026-02-01T00:00:00Z"),
    "tail-b": repo(2, "2026-01-01T00:00:00Z"),
  };
  // align: 1 = 关闭「向上补到 3 的倍数」，让这组用例只测 max 的截断语义（对齐行为另有专组）
  const base = { usedRepos: new Set(), threshold: 1, starLine: 20, align: 1 };
  const names = (opts) => selectOpensourceRepos(repos, { ...base, ...opts }).map(([n]) => n);

  it("不传 max → 全部，且高星组在前、尾巴按最近更新降序", () => {
    expect(names({})).toEqual(["hi-a", "hi-b", "edge", "tail-a", "tail-b"]);
  });

  it("max 只截尾巴：高星组全显 + 尾巴前 max 个", () => {
    expect(names({ max: 2 })).toEqual(["hi-a", "hi-b", "edge", "tail-a"]);
  });

  it("max 小于高星组个数也不会砍到高星（回归：旧的「总共显示几个」语义会砍掉 hi-b）", () => {
    expect(names({ max: 1 })).toEqual(["hi-a", "hi-b", "edge"]);
  });

  it("max: 0 → 只留高星组（尾巴一个不列），不是「不限」", () => {
    expect(names({ max: 0 })).toEqual(["hi-a", "hi-b"]);
  });

  it("max 大于总数 → 等同于全部", () => {
    expect(names({ max: 99 })).toEqual(["hi-a", "hi-b", "edge", "tail-a", "tail-b"]);
  });

  it("高星线之上没有仓库时，max 退化成普通的「取前 max 个」", () => {
    const onlyTail = { "t1": repo(5, "2026-03-01T00:00:00Z"), "t2": repo(4, "2026-02-01T00:00:00Z") };
    expect(selectOpensourceRepos(onlyTail, { ...base, max: 1 }).map(([n]) => n)).toEqual(["t1"]);
  });

  it("不传 starLine → 用默认 30（31★ 算高星、30★ 落尾巴）", () => {
    const r = { a: repo(31, "2020-01-01T00:00:00Z"), b: repo(30, "2021-01-01T00:00:00Z") };
    // max: 0 → 只列高星组。若默认退回 20，b(30★) 也会算高星 → 结果会多出 "b"
    expect(selectOpensourceRepos(r, { usedRepos: new Set(), threshold: 1, max: 0 }).map(([n]) => n)).toEqual(["a"]);
  });
});

describe("selectOpensourceRepos：总数向上对齐到 3 的倍数（凑满网格末行）", () => {
  const repo = (stars, updated) => ({
    stars,
    updated,
    created: "2020-01-01T00:00:00Z",
    language: null,
    url: "https://github.com/u/r",
    description: null,
    fork: false,
    archived: false,
  });
  // 高星组 2（star > 20）+ 尾巴 5，共 7 个候选
  const repos = {
    h1: repo(100, "2020-01-01T00:00:00Z"),
    h2: repo(50, "2020-02-01T00:00:00Z"),
    t1: repo(5, "2026-05-01T00:00:00Z"),
    t2: repo(4, "2026-04-01T00:00:00Z"),
    t3: repo(3, "2026-03-01T00:00:00Z"),
    t4: repo(2, "2026-02-01T00:00:00Z"),
    t5: repo(1, "2026-01-01T00:00:00Z"),
  };
  const opts = { usedRepos: new Set(), threshold: 1, starLine: 20 };
  const names = (o) => selectOpensourceRepos(repos, { ...opts, ...o }).map(([n]) => n);

  it("默认 align=3：2 高星 + 上限 2 = 4，向上补到 6", () => {
    expect(names({ max: 2 })).toEqual(["h1", "h2", "t1", "t2", "t3", "t4"]);
  });

  it("已经整除就不补：2 高星 + 上限 1 = 3 → 3", () => {
    expect(names({ max: 1 })).toEqual(["h1", "h2", "t1"]);
  });

  it("候选不够时按实际数量，不凭空造卡：2 高星 + 上限 5 = 7（补到 9 也只有 7）", () => {
    expect(names({ max: 5 })).toEqual(["h1", "h2", "t1", "t2", "t3", "t4", "t5"]);
  });

  it("align: 1 关闭对齐：2 高星 + 上限 2 = 4，不补", () => {
    expect(names({ max: 2, align: 1 })).toEqual(["h1", "h2", "t1", "t2"]);
  });

  it("max: 0（只要高星组）不补——那是明确的「不要尾巴」", () => {
    expect(names({ max: 0 })).toEqual(["h1", "h2"]);
  });

  it("不传 max（不限）不对齐，原样全列", () => {
    expect(names({})).toEqual(["h1", "h2", "t1", "t2", "t3", "t4", "t5"]);
  });
});
