// 构建前的友好校验：非开发者最容易删错一个缩进空格，导致 YAML 语法错。
// 现在这类错误会以 vitest/astro 堆栈炸出、还盖住真正原因。本脚本抢在前面，
// 用人话指出大概第几行，并说明「网站没被破坏，还是上一次的样子」。
import { readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";
import { loadConfig, DEFAULT_STAR_LINE } from "./helpers.mjs";

const DIR = resolve(process.cwd(), "src/data");

// 终端里的显示宽度：CJK / 全角按 2 列算，其余 1 列。
// 用 [...l].length 会把中文当成 1 列，于是边框比文字窄一大截 —— 中文提示全都会撑出框。
function displayWidth(s) {
  let w = 0;
  for (const ch of s) {
    const cp = ch.codePointAt(0);
    const wide =
      (cp >= 0x1100 && cp <= 0x115f) || // 谚文字母
      (cp >= 0x2e80 && cp <= 0xa4cf) || // CJK 部首 … 彝文
      (cp >= 0xac00 && cp <= 0xd7a3) || // 谚文音节
      (cp >= 0xf900 && cp <= 0xfaff) || // CJK 兼容表意
      (cp >= 0xfe30 && cp <= 0xfe6f) || // CJK 兼容形式
      (cp >= 0xff00 && cp <= 0xff60) || // 全角字符
      (cp >= 0xffe0 && cp <= 0xffe6); // 全角符号
    w += wide ? 2 : 1;
  }
  return w;
}

function frame(lines) {
  // 处理空数组情况，防止 Math.max(...[]) 返回 -Infinity
  if (lines.length === 0) return;
  const width = Math.max(...lines.map(displayWidth));
  const bar = "─".repeat(width + 2);
  console.error(`\n┌${bar}┐`);
  // 每行补空格到同一显示宽度，右边框才会对齐
  for (const l of lines) console.error(`│ ${l}${" ".repeat(width - displayWidth(l))} │`);
  console.error(`└${bar}┘\n`);
}

// new URL(url) 成功且协议是 http/https：等价于 URL.canParse，但不要求 Node ≥18.17，
// 旧 Node 上不会自己抛原始堆栈
function isHttpUrl(url) {
  try {
    const protocol = new URL(url).protocol;
    return protocol === "http:" || protocol === "https:";
  } catch {
    return false;
  }
}

let bad = 0;
// 只查构建真正会用到的文件：主文件 + 语言码形状的翻译文件。
// projects.backup.yaml 这类误留文件构建本来就会忽略，它坏了也不该拦构建。
// （正则与 src/lib/locales.ts 的 LANG_RE 保持一致）
// v2 去掉了 site.languages 发布集开关（见 src/lib/locales.ts）：有 projects.<码>.yaml
// 就发布该语言，翻译文件永远是「全部发布」，坏了必须拦。
const LANG_FILE = /^projects\.([a-z]{2,3}(?:-[A-Za-z0-9]{2,8})?)\.yaml$/;
let files;
try {
  files = ["projects.yaml", ...readdirSync(DIR).filter((f) => LANG_FILE.test(f))];
} catch {
  frame([
    `找不到 src/data 目录`,
    `这是你的全部内容所在，缺了它没法构建。`,
    `请检查是否被误删。`
  ]);
  process.exit(1);
}
for (const f of [...new Set(files)]) {
  let text;
  try {
    text = readFileSync(resolve(DIR, f), "utf8");
  } catch {
    if (f === "projects.yaml") {
      frame([`找不到 src/data/${f}`, `这是你的全部内容所在，缺了它没法构建。`]);
      bad++;
    }
    continue;
  }
  let doc;
  try {
    // loadConfig 固定用 CORE_SCHEMA（见 helpers.mjs）：与构建/编辑器解析路径保持一致，
    // 防未加引号的「日期: 2024-01-15」在这里通过校验、到了构建路径才因类型不一致露馅
    doc = loadConfig(text);
  } catch (e) {
    const line = e?.mark?.line != null ? e.mark.line + 1 : null;
    const where = `大概在第 ${line} 行附近`;
    bad++;
    frame([
      `src/data/${f} 有个格式问题${line ? `，${where}` : ""}。`,
      `多半是某一行开头的空格（缩进）删多或删少了——YAML 全靠缩进对齐。`,
      `你的网站没有被破坏，还是上一次的样子；改回来保存即可。`,
      `不想手动改 YAML？用 /edit 页面可视化编辑，不会踩这种坑。`,
    ]);
    continue;
  }

  if (f === "projects.yaml") {
    // 只检查主文件的 网址/url（翻译文件没有 url 语义）。v2 拍平了配置，
    // 没有 site 块，直接读顶层字段（中英双认）。
    // Astro 的 site 校验只认完整网址；漏写 https:// 时它会用一句英文报错炸构建，
    // 这里提前用人话拦住。
    const url = doc?.网址 ?? doc?.url;
    const urlOk = url === undefined || (typeof url === "string" && isHttpUrl(url));
    if (!urlOk) {
      bad++;
      frame([
        `网址 要写完整网址，以 https:// 开头，`,
        `例如 https://你的用户名.github.io`,
      ]);
    }

    // 开源节的数值字段：写错时 schema 会静默丢弃（回落兜底值）或产出荒谬结果，
    // 症状是「改了配置却看不出变化」——和上面的 网址 同类，先用人话拦下。
    const isNum = (v) => typeof v === "number" && Number.isFinite(v);
    const problems = [];

    // 开源项目 还接受 true/false（true = 默认 10）；写成别的会被当成「不显示」
    const osVal = doc?.开源项目 ?? doc?.opensource;
    if (osVal !== undefined && osVal !== true && osVal !== false && !(isNum(osVal) && osVal >= 0)) {
      problems.push([
        `开源项目 要写数字（如 10）或 true / false，现在是 ${JSON.stringify(osVal)}。`,
        `写成别的值会被当成「不显示开源节」——页面上会安静地少一整节。`,
      ]);
    }

    for (const [zh, en, eg, hint] of [
      ["星标线", "star_line", DEFAULT_STAR_LINE, `写错会被忽略，悄悄用默认值 ${DEFAULT_STAR_LINE}`],
      ["开源上限", "opensource_max", 15, "写错会被忽略（＝不限）或变成 0（只列高星组）"],
    ]) {
      const v = doc?.[zh] ?? doc?.[en];
      if (v === undefined) continue;
      if (!isNum(v) || v < 0) {
        problems.push([
          `${zh} 要写不小于 0 的数字（如 ${eg}），现在是 ${JSON.stringify(v)}。`,
          `${hint}，页面上看不出你改过这个值。`,
        ]);
      }
    }

    for (const lines of problems) {
      bad++;
      frame(lines);
    }
  }
}

if (bad > 0) {
  console.error(`✗ 配置校验未通过（${bad} 处），已中止构建。`);
  process.exit(1);
}
console.log("✔ 配置 YAML 语法检查通过");
