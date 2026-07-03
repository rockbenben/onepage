# onepage · 一个文件，就是你的主页

> 365 开源计划 #022 —— 换掉一个文本文件里的内容，就有一个属于你自己的主页。适用于任何职业：开发者、设计师、写作者、播客主理人……

Read.cv 关了，Bento 也关了——托管在别人平台上的个人主页随时可能消失。onepage 的答案：**一个 YAML 文件 + 静态站 + 自己的地址**，全部资产归你所有。

**挑一种用法：**

- **完全不懂技术** → 看「方式一」，全程在浏览器点几下，不装任何软件、不碰命令行、连域名都不用买。
- **是开发者 / 想本地预览** → 看「方式二」。

## 方式一 · 零终端，全程浏览器（推荐给非开发者）

1. **复制模板**：点本页右上角绿色的 **「Use this template」→「Create a new repository」**。仓库名（Repository name）填 **`你的GitHub用户名.github.io`**——例如用户名是 `lisa`，就填 `lisa.github.io`。这样你的网址就是 `https://lisa.github.io`，免费、好记，也不用买域名。
2. **填你自己的内容并保存**：进新仓库，点开 **`src/data/projects.yaml`**，点右上角 ✏️ 铅笔图标编辑，把里面的名字、简介、项目换成你的。改完拉到页面底部点绿色的 **「Commit changes」**。
   > 诀窍：**只改冒号 `:` 后面的文字，每行开头的空格（缩进）一个都别动。** YAML 靠缩进对齐，删错一个空格页面就会白屏。拿不准就先只改文字、不加新行。
3. **开启网页显示**：第一次保存后等 1–2 分钟（仓库在后台自动构建，会生成一个 `gh-pages` 分支）。然后进 **Settings → Pages**，把 **Source** 选成 **「Deploy from a branch」**，分支选 **`gh-pages`**、目录选 **`/ (root)`**，点 Save。（只需设一次）
4. **打开你的主页**：再等 1–2 分钟，访问 `你的用户名.github.io` 就是你的主页了。
5. **以后想改**：随时回来编辑同一个文件，保存即自动重新上线。

> 想让别人转发你链接时预览图和标题也正确？把 `src/data/projects.yaml` 里的 `site.url`、以及 `astro.config.mjs` 里的 `site` 都改成你的网址（`https://你的用户名.github.io`）。只给自己看、不在乎分享预览的话，跳过也行。

## 方式二 · 本地预览 / 进阶（需 Node + 命令行）

```bash
npm install
npm run fetch     # 抓取 star 数 / 头像 / og 缩略图（可跳过）
npm run dev       # http://localhost:4321，改 projects.yaml 保存即热更新
npm run build     # fetch + 构建 → dist/
```

## 特性

- **四种区块自由编排**：featured（大卡带图）/ grid（网格墙）/ list(文字列表，适合文章、演讲、经历) / stats（数据条），想要几段、什么顺序全由 YAML 决定
- **手动优先，自动兜底**：缩略图、头像、star 数都可手动指定；不指定则构建时自动抓取（demo 页 og:image、GitHub API），下载缓存到本地
- **运行时零 JS、零外部请求**：Astro 5 + Tailwind 4 纯静态输出，字体图片全自托管
- **GitHub 能力可选**：填了 `profile.github` 就自动更新 star 数与头像；非开发者删掉即可，构建照常

## YAML 参考

### 顶层结构

```yaml
site: # 语言、域名、footer、主题色
profile: # 名字、头衔、头像、社交链接、CTA 按钮
sections: # 有序区块列表
```

### site / profile

```yaml
site:
  lang: zh-CN # 可选，默认 zh-CN
  url: https://your.domain # 可选，用于 og:image / og:url
  footer: "自定义落款，支持 <a> 链接" # 可选
  theme: { accent: "#c8402e", accent2: "#a33524" } # 可选，一处换全站强调色（默认朱砂红）
  plan: { total: 365, done: 22, label: 本站是第 22 号作品 } # 可选，进度打卡网格（footer 前的小模块，任意目标都行：年度文章数、案例数…）；删掉即不显示

profile:
  name: 你的名字 # 唯一必填项
  title: 头衔 # 可选，建议写可验证的事实
  intro: 一段话简介 # 可选
  avatar: /avatar.jpg # 可选；手动头像放 public/ 下任意路径（如 /avatar.jpg）即可，不与自动抓取冲突；不填且有 github 时自动抓 GitHub 头像，存为 public/avatar-auto.*（构建产物，勿提交）
  github: https://github.com/xx # 可选；驱动 star 数、源码链接、头像
  eyebrow: 顶部小标签 # 可选，默认 Portfolio
  socials: # 可选；icon 可省略（按 url 自动识别 github/x/email/rss）
    - { label: GitHub, url: https://github.com/xx }
    - { label: Email, url: mailto:hi@example.com }
  ctas: # 可选；primary 为白底主按钮
    - { label: 联系我, url: mailto:hi@example.com, primary: true }
```

### 四种区块

```yaml
sections:
  - type: stats # 数据条
    items:
      - { label: GitHub Stars, value: 10000, suffix: "+", auto: total_stars } # auto 表示构建时用 API 实际值覆盖

  - type: featured # 大卡带图（缩略图自动抓 demo 的 og:image，或用 image 指定）
    title: 代表作
    hint: 点开即用
    items:
      - name: 项目名 # 必填
        desc: 描述 # 必填语义上建议填
        tagline: 副标题
        repo: my-repo # 可选：显示 star 与源码链接
        demo: https://... # 可选：主链接，任意 URL
        demoLabel: 阅读全文 # 可选：主链接文案
        image: /covers/x.png # 可选：手动指定缩略图（本地或 URL），优先级最高
        tags: [标签1, 标签2]

  - type: grid # 网格墙（纯文字轻卡片）
    title: 工具线
    count: true # 可选：标题旁自动显示条目数
    more: https://... # 可选：右上"更多"链接
    moreLabel: 完整索引 →
    items: [{ name, desc, repo?, demo? }]

  - type: list # 文字列表（文章 / 演讲 / 项目清单 / 工作经历）
    title: 文章
    items:
      - name: 文章标题 # 有 repo 时标题指向源码仓库，否则指向 url
        date: "2026-05" # 可选，原样显示的字符串
        url: https://...
        meta: 刊物名 # 可选，右侧小字
        desc: 一句话摘要
        repo: my-repo # 可选：自动显示 ★ 数，右侧按需出 Demo（取 demo 字段）
```

### 非开发者示例

不写代码的人也能用：写作者的完整可用配置见 `tests/fixtures/writer.yaml`——没有任何 GitHub 字段，featured + list + stats 三段即成站。

## 换成你自己的

- `src/data/projects.yaml` — 你的全部内容（仓库自带的是作者本人的作品集示例，直接改）
- **域名要改两处**：`astro.config.mjs` 的 `site` 与 `projects.yaml` 的 `site.url`——都填你自己的网址，否则 canonical / og:image / sitemap 会指向示例站（方式一用 `用户名.github.io` 的填这个即可）
- `public/favicon.svg` — 站点图标（默认是朱砂章）
- `public/og.png` — 社交分享图（见下）
- `LICENSE` — MIT，改成你的名字

## 部署到其他平台

方式一的 GitHub Pages 已是零配置首选。也可换：

- **Cloudflare Pages**：后台连仓库，构建命令 `npm run build`，输出目录 `dist`，环境变量可选 `GITHUB_TOKEN`。

> `public/shots/` 与 `public/avatar-auto.*` 为构建时生成的资源，已被 `.gitignore` 忽略，无需（也不应）提交。

## OG 分享图

`public/og.png` 是社交分享卡片图。改 `scripts/og-template.html` 后用浏览器以 1200×630 截图替换，或直接放一张自己设计的图。
