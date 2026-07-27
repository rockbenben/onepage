// scripts/validate-config.mjs 的冒烟测试：用真实子进程跑脚本，
// 校验退出码与人话提示，而不是只测内部函数。
// 脚本硬编码 process.cwd()/src/data，所以每个用例都造一个临时工作目录，
// 里面放好 src/data/projects.yaml，再用 spawnSync(..., { cwd }) 指过去。
import { describe, it, expect, afterEach } from "vitest";
import { spawnSync } from "node:child_process";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

const SCRIPT = resolve(process.cwd(), "scripts/validate-config.mjs");

const tmpDirs = [];

function makeFixture(yamlText, extraFiles = {}) {
  const dir = mkdtempSync(join(tmpdir(), "onepage-validate-"));
  tmpDirs.push(dir);
  mkdirSync(join(dir, "src/data"), { recursive: true });
  writeFileSync(join(dir, "src/data/projects.yaml"), yamlText, "utf8");
  for (const [name, text] of Object.entries(extraFiles)) {
    writeFileSync(join(dir, "src/data", name), text, "utf8");
  }
  return dir;
}

function runValidate(cwd) {
  return spawnSync(process.execPath, [SCRIPT], { cwd, encoding: "utf8" });
}

afterEach(() => {
  while (tmpDirs.length) {
    const d = tmpDirs.pop();
    rmSync(d, { recursive: true, force: true });
  }
});

describe("scripts/validate-config.mjs 冒烟测试（真跑子进程）", () => {
  it("好 YAML：exit 0", () => {
    const dir = makeFixture("名字: 张三\n");
    const res = runValidate(dir);
    expect(res.status).toBe(0);
  });

  it("坏缩进 YAML：exit 1 且 stderr 含「格式问题」", () => {
    const dir = makeFixture("名字: x\n bad-indent: 1\n");
    const res = runValidate(dir);
    expect(res.status).toBe(1);
    expect(res.stderr).toMatch(/格式问题/);
  });

  it("网址漏协议头（网址: lisa.github.io）：exit 1 且 stderr 含「https://」", () => {
    const dir = makeFixture("网址: lisa.github.io\n名字: 张三\n");
    const res = runValidate(dir);
    expect(res.status).toBe(1);
    expect(res.stderr).toMatch(/https:\/\//);
  });

  it("坏翻译文件：exit 1（v2 没有发布集开关，翻译文件坏了就该拦）", () => {
    const dir = makeFixture(
      "名字: 张三\n",
      { "projects.en.yaml": "名字: x\n bad-indent: 1\n" },
    );
    const res = runValidate(dir);
    expect(res.status).toBe(1);
    expect(res.stderr).toMatch(/格式问题/);
  });
});
