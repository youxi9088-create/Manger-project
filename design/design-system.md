# openclaw Design System · Direction C

> 设计方向：**方向 C · Stripe 设计团队**  
> 视觉气质：温暖深炭黑底 + 琥珀金 accent（#c9a86c），沉静、精密、可信、智能、有秩序。

---

## 1. 设计哲学

openclaw 的视觉方向定义为：

> **「Stripe-inspired warm dark + precision + trust」**  
> 以温暖而深沉的暗色为底，用精确的间距、克制的色彩与可信赖的反馈，把复杂的 AI 协作与项目数据转化为清晰、高效、令人安心的企业级界面。

### 核心原则

1. **精确（Precision）**：每一处间距、字重、圆角都服务于信息层级，不冗余、不装饰。
2. **信任（Trust）**：沉稳的深炭色调、一致的反馈、真实的空态/错误态，让用户敢把关键项目数据交托于此。
3. **温度（Warmth）**：通过琥珀金 accent 与微妙的暖灰过渡，避免企业工具常见的冰冷感。
4. **密度与呼吸（Density & Breath）**：信息密度高，但层级清晰，眼睛能自然找到重点。

---

## 2. 色彩系统

### 2.1 基础色板

| Token | HEX | RGB | 使用场景 |
|-------|-----|-----|----------|
| `--bg-root` | `#0d0d0f` | `rgb(13, 13, 15)` | 页面最底层背景、主容器背景 |
| `--bg-surface` | `#131316` | `rgb(19, 19, 22)` | 卡片、侧边栏、面板背景 |
| `--bg-elevated` | `#1a1a1e` | `rgb(26, 26, 30)` | 输入框、hover 提升、下拉浮层 |
| `--bg-hover` | `#212125` | `rgb(33, 33, 37)` | 列表项 hover、按钮 hover |
| `--bg-active` | `#2a2a2f` | `rgb(42, 42, 47)` | 选中态、active 导航项 |
| `--border-subtle` | `#242429` | `rgb(36, 36, 41)` | 卡片边框、分割线、默认输入框边框 |
| `--border-strong` | `#33333a` | `rgb(51, 51, 58)` | hover 边框、选中边框、强调分割线 |
| `--text-primary` | `#f2f2f5` | `rgb(242, 242, 245)` | 主标题、正文、关键数据 |
| `--text-secondary` | `#9b9ba3` | `rgb(155, 155, 163)` | 次级说明、meta 信息、图标默认色 |
| `--text-tertiary` | `#6b6b74` | `rgb(107, 107, 116)` | 占位符、禁用态、时间戳、快捷键提示 |

### 2.2 Accent / 语义色

| Token | HEX | RGB | 使用场景 |
|-------|-----|-----|----------|
| `--accent` | `#c9a86c` | `rgb(201, 168, 108)` | 主按钮、active tab、选中指示、重点图标、进度条 |
| `--accent-hover` | `#d9bc86` | `rgb(217, 188, 134)` | 主按钮 hover、链接 hover |
| `--accent-soft` | `rgba(201, 168, 108, 0.12)` | — | accent 轻量背景、选中 chip、高亮遮罩 |
| `--success` | `#6a9e7f` | `rgb(106, 158, 127)` | 成功状态、正向 delta、低风险 |
| `--success-soft` | `rgba(106, 158, 127, 0.12)` | — | 成功状态背景 |
| `--warning` | `#c9a35c` | `rgb(201, 163, 92)` | 警告、中风险、进行中 |
| `--warning-soft` | `rgba(201, 163, 92, 0.12)` | — | 警告状态背景 |
| `--error` | `#c97b6d` | `rgb(201, 123, 109)` | 错误、高风险、负向 delta |
| `--error-soft` | `rgba(201, 123, 109, 0.12)` | — | 错误状态背景 |
| `--info` | `#7a9fc9` | `rgb(122, 159, 201)` | 信息提示、转写中、需求分析阶段 |
| `--info-soft` | `rgba(122, 159, 201, 0.12)` | — | 信息状态背景 |

### 2.3 暗色层级规则

openclaw 使用 4 层背景深度，形成清晰的「海拔」系统：

1. **Level 0 · Root（#0d0d0f）**：页面画布、空态区域、底层遮罩。
2. **Level 1 · Surface（#131316）**：侧边栏、卡片、面板、表格行背景。
3. **Level 2 · Elevated（#1a1a1e）**：输入框、按钮 hover、下拉菜单、浮层。
4. **Level 3 · Hover/Active（#212125 / #2a2a2f）**：交互反馈、选中态、 emphasized 行。

边框使用 2 级：subtle 用于默认分割，strong 用于 hover/选中。  
文字使用 3 级：primary 承载关键信息，secondary 承载说明，tertiary 承载占位与元数据。

---

## 3. 字体系统

### 3.1 字体家族

| Token | 字体栈 | 用途 |
|-------|--------|------|
| `--font-body` | `-apple-system, BlinkMacSystemFont, "PingFang SC", "Hiragino Sans GB", "Microsoft YaHei", "Helvetica Neue", sans-serif` | 中文正文、界面文案、段落 |
| `--font-display` | `"DM Sans", -apple-system, BlinkMacSystemFont, sans-serif` | 英文/数字标题、metric 数据、品牌名 |
| `--font-mono` | `"JetBrains Mono", "SF Mono", "Fira Code", monospace` | 代码、项目 ID、时间、版本号、数据标签 |

### 3.2 字号层级

| 层级 | 字号 | 字重 | 行高 | 字间距 | 用途 |
|------|------|------|------|--------|------|
| H1 页面标题 | `24px` | 700 | 1.2 | `-0.02em` | 页面主标题 |
| H2 区块标题 | `18px` | 700 | 1.3 | `-0.01em` | 大模块标题 |
| H3 卡片标题 | `15px` | 700 | 1.3 | 0 | 卡片、面板标题 |
| H4 小标题 | `13px` | 600 | 1.4 | 0 | 列表标题、子标题 |
| Body 正文 | `14px` | 400 | 1.5 | 0 | 默认正文 |
| Body-S 辅助文 | `12px` | 400 / 500 | 1.5 | 0 | meta、说明、标签 |
| Caption | `11px` | 500 / 600 | 1.4 | `0.02em` | 时间戳、小标签 |
| Data / Metric | `28px` | 700 | 1.1 | `-0.03em` | 关键数据指标 |
| Mono Code | `12px` | 400 | 1.5 | 0 | 项目 ID、代码片段 |

### 3.3 排版规范

- 中文标题不使用过大字号，保持 24px 以内，避免压迫感。
- 正文行高 1.5，列表与说明文字可适当收紧至 1.4。
- 数字与英文使用 DM Sans，在 metric 中形成精致对比。
- 代码与 ID 使用 JetBrains Mono，字号 11–12px。
- 中文使用「」引号，避免直角引号与英文引号混用。

---

## 4. 间距系统

基础单位为 **4px**，所有间距均为 4 的倍数。

| Token | 值 | 使用场景 |
|-------|-----|----------|
| `--space-1` | `4px` | 紧凑内联间距、图标与文字间隙 |
| `--space-2` | `8px` | 行内元素间距、小按钮内边距 |
| `--space-3` | `12px` | 卡片内边距、列表项 padding |
| `--space-4` | `16px` | 卡片内边距、模块间隙 |
| `--space-5` | `20px` | 页面 padding、侧边栏水平内边距 |
| `--space-6` | `24px` | 页面 header 下边距、大模块间距 |
| `--space-8` | `32px` | 页面大区块间距 |
| `--space-10` | `40px` | 空态插图与文字间距 |

### 组件常用间距

- 卡片内边距：`18px`（约 1.125rem）
- 列表项内边距：`12px`
- 按钮内边距：`8px 14px`
- 输入框内边距：`10px 12px`
- 栅格间隙：`16px` / `20px`
- 页面水平 padding：`28px`
- 侧边栏宽度：`220px`
- 顶部栏高度：`60px`

---

## 5. 圆角与阴影

### 5.1 圆角

| Token | 值 | 使用场景 |
|-------|-----|----------|
| `--radius-sm` | `6px` | 小按钮、输入框、小标签、列表项 |
| `--radius-md` | `10px` | 按钮、卡片、导航项、搜索框 |
| `--radius-lg` | `14px` | 大卡片、面板、模态框 |
| `--radius-full` | `999px` | badge、tag、chip、头像、进度条 |

### 5.2 阴影

| Token | 值 | 使用场景 |
|-------|-----|----------|
| `--shadow-sm` | `0 1px 2px rgba(0, 0, 0, 0.24)` | 轻微提升，按钮、小元素 |
| `--shadow-md` | `0 4px 16px rgba(0, 0, 0, 0.32)` | 卡片 hover、下拉浮层、模态框 |
| `--shadow-backdrop` | `rgba(13, 13, 15, 0.7)` + `backdrop-filter: blur(4px)` | 模态遮罩、loading 遮罩 |

---

## 6. 组件规范

### 6.1 Button

#### 类型

| 类型 | 背景 | 边框 | 文字 | 用途 |
|------|------|------|------|------|
| Primary | `--accent` | 透明 | `#0d0d0f` | 主行动：生成、创建、提交 |
| Secondary | `--bg-elevated` | `--border-subtle` | `--text-primary` | 次要行动：筛选、同步、上传 |
| Ghost | 透明 | 透明 | `--text-secondary` | 低优先级：查看全部、取消 |
| Danger | `--error-soft` | `rgba(201,123,109,0.25)` | `--error` | 删除、断开同步 |

#### 状态

- **Hover**：Primary → `--accent-hover` 并轻微上移 `-1px`；Secondary → `--bg-hover` + `--border-strong`；Ghost → `--bg-hover` + `--text-primary`。
- **Active**：所有按钮回弹 `translateY(0)`，Primary 阴影减弱。
- **Disabled**：透明度 `0.5`，cursor `not-allowed`，无 hover 效果。
- **Loading**：按钮内显示 14px spinner，替换原有文字，禁用点击。

### 6.2 Card

- 背景：`--bg-surface`
- 边框：`1px solid --border-subtle`
- 圆角：`--radius-lg`（14px）
- 内边距：`18px`
- Hover（可选 `.card-hover`）：边框变为 `--border-strong`，出现 `--shadow-md`，轻微上移 `-1px`。
- 标题行使用 `.card-header`：flex 两端对齐，下边距 `14px`。

### 6.3 Input / Textarea / Select

- 背景：`--bg-elevated`
- 边框：`1px solid --border-subtle`
- 圆角：`--radius-md`（10px）
- 内边距：`10px 12px`
- 文字色：`--text-primary`
- Placeholder：`--text-tertiary`
- Focus：`border-color: --accent`，`box-shadow: 0 0 0 3px --accent-soft`
- Hover（未 focus）：`border-color: --border-strong`
- Disabled：背景 `--bg-hover`，文字 `--text-tertiary`

### 6.4 Badge / Tag

- 默认：`--bg-elevated` 背景 + `--border-subtle` 边框 + `--text-secondary` 文字
- Accent：`--accent-soft` + accent 边框 + `--accent` 文字
- Success / Warning / Error / Info：对应 soft 背景 + 对应色文字
- 圆角：`999px`；内边距：`3px 8px`；字号：`11px`；字重：`600`

### 6.5 Tab

- 容器底部边框：`1px solid --border-subtle`
- Tab 项：`padding: 10px 14px`，`margin-bottom: -1px`
- 默认：`--text-secondary`
- Hover：`--text-primary`
- Active：`--accent` + 底部 2px accent 边框
- 过渡：`--transition-fast`

### 6.6 Table / List item

- 列表项：`padding: 12px`，圆角 `--radius-md`，边框 `1px solid transparent`
- Hover：`background: --bg-elevated`，`border-color: --border-subtle`
- Active/Selected：`background: --bg-active`，`border-color: --border-strong`
- 表格：表头文字 `--text-secondary` 11px 大写，行底部分割线 `--border-subtle`，hover 背景 `--bg-elevated`

### 6.7 Modal / Dialog

- 遮罩：`background: rgba(13, 13, 15, 0.7)`，`backdrop-filter: blur(4px)`
- 容器：`--bg-surface` 背景，`--radius-lg` 圆角，`--shadow-md` 阴影
- 最大宽度：默认 `560px`，大模态 `720px`
- 内边距：`24px`
- 标题：`H3` 样式，关闭按钮右上角 ghost icon-btn
- 进入动画：`opacity 0→1` + `translateY(8px)→0`，180ms ease-out

### 6.8 Sidebar / Navigation

- 宽度：`220px`（桌面端）
- 背景：`--bg-surface`
- 右分割线：`1px solid --border-subtle`
- 导航项：`padding: 9px 10px`，圆角 `--radius-md`
- Active：背景 `--bg-active`，边框 `--border-strong`，左侧 3px accent 竖线指示
- 折叠态（<900px）：宽度 `64px`，仅保留图标

### 6.9 Toast / Alert

- Error Banner：`--error-soft` 背景，`rgba(201,123,109,0.25)` 边框，`--error` 文字，圆角 `--radius-md`
- Toast：固定右下角，背景 `--bg-elevated`，边框 `--border-strong`，阴影 `--shadow-md`，圆角 `--radius-md`
- Alert 图标 16px，左侧放置，文字 13px

### 6.10 Progress bar

- 轨道：`height: 6px`，背景 `--bg-hover`，圆角 `999px`
- 填充：背景 `--accent`，圆角 `999px`
- 动画：`width` 变化使用 `600ms cubic-bezier(0.22, 1, 0.36, 1)`

---

## 7. 布局规范

### 7.1 整体布局

```
┌─────────────────────────────────────────────┐
│ Sidebar (220px) │ Topbar (60px)             │
│                 ├───────────────────────────┤
│                 │ Page Content (scrollable) │
│                 │ padding: 28px             │
└─────────────────────────────────────────────┘
```

### 7.2 内容区最大宽度

- 页面内容区无固定最大宽度，采用响应式栅格。
- 推荐最大内容宽度：`1400px`，居中时两侧留白。
- 单页 Dashboard 等密集页面使用全宽布局。

### 7.3 栅格建议

| 类名 | 列数 | 间隙 | 用途 |
|------|------|------|------|
| `.grid-2` | 2 | `20px` | 概览 + 时间线、摘要 + 风险 |
| `.grid-3` | 3 | `16px` | metric cards、快捷操作、健康度卡片 |
| `.grid-4` | 4 | `16px` | 项目卡片网格、员工卡片 |
| `.metrics-row` | 4 | `16px` | 顶部统计指标 |

响应式断点：

- `≤1200px`：`.grid-4` → 2 列，`.metrics-row` → 2 列
- `≤900px`：侧边栏折叠为 64px，栅格全部单列

---

## 8. 交互规范

### 8.1 过渡时长

| Token | 时长 | 用途 |
|-------|------|------|
| `--transition-fast` | `120ms` | 按钮、图标、列表项、chip |
| `--transition-base` | `180ms` | 卡片 hover、边框变化、背景变化 |
| `--transition-slow` | `240ms` | 模态进入、页面切换、面板展开 |

### 8.2 Easing

- 默认：`cubic-bezier(0.25, 0.1, 0.25, 1)`（ease 等价，柔和稳定）
- 弹性/展开：`cubic-bezier(0.22, 1, 0.36, 1)`（outQuint，用于进度条、面板展开）

### 8.3 Hover / Active 反馈模式

| 元素 | Hover | Active / Selected |
|------|-------|-------------------|
| 导航项 | `bg-hover` + 文字变白 | `bg-active` + 边框 + 左侧 accent 指示 |
| 按钮 Primary | `accent-hover` + 上移 + 阴影加深 | 回弹 |
| 按钮 Secondary | `bg-hover` + 边框加深 | `bg-active` |
| 卡片 | 边框加深 + 阴影 + 上移 | 背景 `bg-active` + 边框加深 |
| 列表项 | `bg-elevated` + 边框 | `bg-active` + 边框 |
| 输入框 | 边框加深 | accent border + focus ring |
| Chip | 边框加深 + 文字变白 | accent soft 背景 + accent 文字 |

### 8.4 焦点与键盘

- 所有可交互元素需有可见 focus 状态。
- 输入框 focus ring：`0 0 0 3px --accent-soft`。
- 全局快捷键：`⌘K` / `Ctrl+K` 聚焦搜索框。

---

## 9. 图标规范

- **图标库**：Lucide（线条风格，简洁几何）
- **默认尺寸**：
  - 导航/列表图标：`17px`，`stroke-width: 1.8`
  - 按钮内图标：`15px`
  - 小标签/inline 图标：`13–14px`
  - 空态/装饰图标：`40px`
- **颜色**：默认 `--text-secondary`；active/强调时使用 `--accent`、`--success`、`--warning`、`--error`、`--info`。
- **原则**：不使用 emoji、不使用手绘/插画 SVG、不使用彩色渐变图标背景。

---

## 10. React / Tailwind 映射（实现建议）

### 10.1 颜色 → Tailwind CSS Variables

```css
@layer base {
  :root {
    --bg-root: 13 13 15;
    --bg-surface: 19 19 22;
    --bg-elevated: 26 26 30;
    --bg-hover: 33 33 37;
    --bg-active: 42 42 47;
    --border-subtle: 36 36 41;
    --border-strong: 51 51 58;
    --text-primary: 242 242 245;
    --text-secondary: 155 155 163;
    --text-tertiary: 107 107 116;
    --accent: 201 168 108;
    --accent-hover: 217 188 134;
    --success: 106 158 127;
    --warning: 201 163 92;
    --error: 201 123 109;
    --info: 122 159 201;
  }
}
```

Tailwind config 示例：

```js
module.exports = {
  theme: {
    extend: {
      colors: {
        root: 'rgb(var(--bg-root))',
        surface: 'rgb(var(--bg-surface))',
        elevated: 'rgb(var(--bg-elevated))',
        hover: 'rgb(var(--bg-hover))',
        active: 'rgb(var(--bg-active))',
        'border-subtle': 'rgb(var(--border-subtle))',
        'border-strong': 'rgb(var(--border-strong))',
        'text-primary': 'rgb(var(--text-primary))',
        'text-secondary': 'rgb(var(--text-secondary))',
        'text-tertiary': 'rgb(var(--text-tertiary))',
        accent: 'rgb(var(--accent))',
        'accent-hover': 'rgb(var(--accent-hover))',
        success: 'rgb(var(--success))',
        warning: 'rgb(var(--warning))',
        error: 'rgb(var(--error))',
        info: 'rgb(var(--info))',
      },
      borderRadius: {
        sm: '6px',
        md: '10px',
        lg: '14px',
      },
      boxShadow: {
        sm: '0 1px 2px rgba(0, 0, 0, 0.24)',
        md: '0 4px 16px rgba(0, 0, 0, 0.32)',
      },
      fontFamily: {
        sans: ['-apple-system', 'BlinkMacSystemFont', 'PingFang SC', 'Hiragino Sans GB', 'Microsoft YaHei', 'Helvetica Neue', 'sans-serif'],
        display: ['"DM Sans"', '-apple-system', 'BlinkMacSystemFont', 'sans-serif'],
        mono: ['"JetBrains Mono"', '"SF Mono"', '"Fira Code"', 'monospace'],
      },
      transitionTimingFunction: {
        'openclaw': 'cubic-bezier(0.25, 0.1, 0.25, 1)',
        'openclaw-out': 'cubic-bezier(0.22, 1, 0.36, 1)',
      },
    },
  },
}
```

### 10.2 常用组件 → shadcn/ui 映射

| 设计组件 | shadcn/ui 组件 | 需要覆盖的样式 |
|----------|----------------|----------------|
| Button | `Button` | 自定义 variant：`primary`（accent 背景）、`ghost`、`danger`；调整圆角为 10px |
| Card | `Card` | 背景改为 `--bg-surface`，边框 `--border-subtle`，圆角 14px |
| Input | `Input` | 背景 `--bg-elevated`，focus ring 使用 accent-soft |
| Textarea | `Textarea` | 同上 |
| Select | `Select` | trigger 背景 `--bg-elevated`，content 背景 `--bg-surface` |
| Badge | `Badge` | 扩展 success/warning/error/info/accent 变体，使用 soft 背景 |
| Tabs | `Tabs` | active 指示器改为底部 2px accent 线 |
| Table | `Table` | 行 hover `--bg-elevated`，表头大写 11px |
| Dialog | `Dialog` | 遮罩使用 `--backdrop`，内容圆角 14px，阴影 md |
| Sheet | `Sheet` | 侧边抽屉，背景 `--bg-surface` |
| Toast | `Sonner` / `Toast` | 背景 `--bg-elevated`，边框 `--border-strong` |
| Tooltip | `Tooltip` | 背景 `--bg-elevated`，边框 subtle |
| Dropdown Menu | `DropdownMenu` | 背景 `--bg-surface`，item hover `--bg-hover` |
| Avatar | `Avatar` | fallback 使用 accent-soft + accent 文字 |
| Skeleton | `Skeleton` | 使用自定义 shimmer 动画替代默认脉冲 |
| Progress | `Progress` | 填充色 accent，轨道 `--bg-hover` |

### 10.3 建议目录结构

```
app/
├── components/ui/          # shadcn 基础组件（按上述覆盖）
├── components/openclaw/    # 业务组件：ProjectCard、TaskRow、MeetingItem 等
├── styles/
│   └── globals.css         # CSS variables + 基础样式
├── lib/
│   └── utils.ts
└── tailwind.config.ts      # 扩展 colors / radius / shadow / fontFamily
```

---

*文档版本：v1.0*  
*最后更新：2026-07-02*  
*关联原型：`openclaw-design-v1.html`*
