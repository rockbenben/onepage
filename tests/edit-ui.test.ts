import { describe, it, expect } from "vitest";
import { EDITOR_STRINGS, resolveEditorLang, type EditorUI } from "../src/edit/ui";

describe("编辑器界面文案表", () => {
  const zh = EDITOR_STRINGS["zh-CN"];
  const en = EDITOR_STRINGS.en;

  it("中英两表键完全一致", () => {
    expect(Object.keys(zh).sort()).toEqual(Object.keys(en).sort());
  });

  it("两表所有值都是非空字符串", () => {
    for (const table of [zh, en]) {
      for (const [k, v] of Object.entries(table)) {
        expect(typeof v, `${k} 应为字符串`).toBe("string");
        expect((v as string).length, `${k} 不该为空`).toBeGreaterThan(0);
      }
    }
  });

  it("残留文案键齐全（github/url/name/footer/enYaml）", () => {
    const need: (keyof EditorUI)[] = [
      "residueGithub",
      "residueUrl",
      "residueName",
      "residueFooter",
      "residueEnYaml",
    ];
    for (const k of need) {
      expect(zh[k]).toBeTruthy();
      expect(en[k]).toBeTruthy();
    }
  });
});

describe("resolveEditorLang", () => {
  it("zh 开头 → zh-CN", () => {
    expect(resolveEditorLang("zh-CN")).toBe("zh-CN");
    expect(resolveEditorLang("zh-TW")).toBe("zh-CN");
  });
  it("其余 / 缺失 → en", () => {
    expect(resolveEditorLang("en")).toBe("en");
    expect(resolveEditorLang("ja")).toBe("en");
    expect(resolveEditorLang(undefined)).toBe("en");
  });
});
