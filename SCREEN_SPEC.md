# SCREEN_SPEC.md

页面级意图，全局规则见 `DESIGN.md`。

## Screen: `home`（`/`、`/[lang]/`）

### Goal

访客 5 秒内知道「这是谁、在做什么、能点什么」，并能顺着链接走到作品或源码。

### Primary user path

1. 落地看到站名 / 头衔 / 一句介绍。
2. 点链接排里的第一个（主）按钮，或滚动看代表作。
3. 顺着开源节进到某个仓库或 GitHub 主页。

### Layout rules

- 桌面 1440：内容列居中 `max-w-5xl`，左右 20px 内边距；代表作 3 列、开源 3 列。
- 平板 768：代表作 / 开源 2 列，数据条单排。
- 手机 390：全部单列，数据条 2 列网格，**无横向滚动**。
- 顺序固定：Hero →（数据条）→（代表作）→（分组清单…）→（开源节）→ 页脚。空 section 整块不渲染，不留空节点。
- 分组清单的日期列宽度固定，未写日期的条目留空占位，保证名字左缘对齐成一列。

### Required states

- Loading: 图片 `loading="lazy"`，占位底色 `{colors.cell}`，不做骨架屏。
- Empty: 无作品时开源节仍独立成立；`开源排除` 命中全部仓库时整节不渲染。
- Error: 静态站无运行时错误态；构建期由 `npm run validate` 拦住非法配置。
- Success: 不适用（无表单提交）。
- Disabled: 不适用。

### Content rules

- Heading: 站名唯一 `h1`；节标题 `h2`；卡标题 `h3`。不跳级。
- Primary CTA: 链接排第一条 = `.btn-primary`（墨底），其余 `.btn`。
- Secondary actions: `源码 ↗`、`在 GitHub 看更多 →`、语言切换。
- 缩略图 alt 必须有内容（`{name} 预览图`），装饰性图标 `aria-hidden`。
- 星标数 < 10 不显示 chip，避免小数字抢注意力。

### QA notes

- 动态区域（不需逐像素比对）：星标数、fork 数、`数据更新于` 日期、开源节条目集合。
- 可接受差异：不同主题下强调色与纸色变化；GitHub 自动卡片图与自定义 social preview 图的观感差异。
- 必须人工看：中文长站名换行、暗色下 `.card` 描边是否还分得清、开源节末行是否补齐。

## Screen: `edit`（`/edit`）

### Goal

不碰命令行的人，填完表就能拿到可提交的 `projects.yaml`。

### Primary user path

1. 填「你」→「链接」→「作品」。
2. 右侧「校样」实时看 YAML，必要时直接改文本再「导入这段 YAML」。
3. 「复制 YAML」或「下载 projects.yaml」交回仓库。

### Layout rules

- 桌面 1440：`max-w-6xl`，左稿右校样两栏，校样 `sticky top-24`。
- 手机 390：单列，校样由「看 YAML / 收起」按钮展开；顶栏允许换行成三排。
- 顶栏吸顶，纸色 85% + `backdrop-blur`，是全站唯一毛玻璃。

### Required states

- Loading: 岛水合前是空壳，需要 `<noscript>` 说明。
- Empty: 链接 / 作品为空时给一句引导 + 一个「加一条」按钮，且同屏不重复出现第二个同名按钮。
- Error: YAML 解析或 schema 校验失败 → 校样上方 `{components.callout-error}` 左线提示，不弹阻断式对话框（导入失败仍用 `alert`，见 Known gaps）。
- Success: 「复制 YAML」按钮文案变「已复制」，并作为 `aria-live` 播报。
- Disabled: 不适用。

### Content rules

- 界面语言中英双语，岛内可切并记在 `localStorage`；导出键跟随界面语言。
- 字段标签写给「不懂 YAML 的人」：不用内部术语，占位提示给具体例子。
- 数字（条目数、行数）用 `.mono` + 朱砂。

### QA notes

- 键盘必须能走完全部主操作，包括「上传文件」。
- 五套主题 / 明暗两版下编辑器跟随同一套令牌，不额外写色值。
- 动态区域：载入当前站配置的内容、残留检测结果。
