# projects

这是一个基于 [Next.js 16](https://nextjs.org) + [shadcn/ui](https://ui.shadcn.com) 的全栈应用项目，由扣子编程 CLI 创建。

## 快速开始

### 启动开发服务器

```bash
coze dev
```

启动后，在浏览器中打开 [http://localhost:5000](http://localhost:5000) 查看应用。

开发服务器支持热更新，修改代码后页面会自动刷新。

### 构建生产版本

```bash
coze build
```

### 启动生产服务器

```bash
coze start
```

## 项目结构

```
src/
├── app/                      # Next.js App Router 目录
│   ├── layout.tsx           # 根布局组件
│   ├── page.tsx             # 首页
│   ├── globals.css          # 全局样式（包含 shadcn 主题变量）
│   └── [route]/             # 其他路由页面
├── components/              # React 组件目录
│   └── ui/                  # shadcn/ui 基础组件（优先使用）
│       ├── button.tsx
│       ├── card.tsx
│       └── ...
├── lib/                     # 工具函数库
│   └── utils.ts            # cn() 等工具函数
└── hooks/                   # 自定义 React Hooks（可选）

server/
├── index.ts                 # 自定义服务器入口
├── tsconfig.json           # Server TypeScript 配置
└── dist/                    # 编译输出目录（自动生成）
```

## 核心开发规范

### 1. 组件开发

**优先使用 shadcn/ui 基础组件**

本项目已预装完整的 shadcn/ui 组件库，位于 `src/components/ui/` 目录。开发时应优先使用这些组件作为基础：

```tsx
// ✅ 推荐：使用 shadcn 基础组件
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Input } from '@/components/ui/input';

export default function MyComponent() {
  return (
    <Card>
      <CardHeader>标题</CardHeader>
      <CardContent>
        <Input placeholder="输入内容" />
        <Button>提交</Button>
      </CardContent>
    </Card>
  );
}
```

**可用的 shadcn 组件清单**

- 表单：`button`, `input`, `textarea`, `select`, `checkbox`, `radio-group`, `switch`, `slider`
- 布局：`card`, `separator`, `tabs`, `accordion`, `collapsible`, `scroll-area`
- 反馈：`alert`, `alert-dialog`, `dialog`, `toast`, `sonner`, `progress`
- 导航：`dropdown-menu`, `menubar`, `navigation-menu`, `context-menu`
- 数据展示：`table`, `avatar`, `badge`, `hover-card`, `tooltip`, `popover`
- 其他：`calendar`, `command`, `carousel`, `resizable`, `sidebar`

详见 `src/components/ui/` 目录下的具体组件实现。

### 2. 路由开发

Next.js 使用文件系统路由，在 `src/app/` 目录下创建文件夹即可添加路由：

```bash
# 创建新路由 /about
src/app/about/page.tsx

# 创建动态路由 /posts/[id]
src/app/posts/[id]/page.tsx

# 创建路由组（不影响 URL）
src/app/(marketing)/about/page.tsx

# 创建 API 路由
src/app/api/users/route.ts
```

**页面组件示例**

```tsx
// src/app/about/page.tsx
import { Button } from '@/components/ui/button';

export const metadata = {
  title: '关于我们',
  description: '关于页面描述',
};

export default function AboutPage() {
  return (
    <div>
      <h1>关于我们</h1>
      <Button>了解更多</Button>
    </div>
  );
}
```

**动态路由示例**

```tsx
// src/app/posts/[id]/page.tsx
export default async function PostPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  return <div>文章 ID: {id}</div>;
}
```

**API 路由示例**

```tsx
// src/app/api/users/route.ts
import { NextResponse } from 'next/server';

export async function GET() {
  return NextResponse.json({ users: [] });
}

export async function POST(request: Request) {
  const body = await request.json();
  return NextResponse.json({ success: true });
}
```

### 3. 依赖管理

**必须使用 pnpm 管理依赖**

```bash
# ✅ 安装依赖
pnpm install

# ✅ 添加新依赖
pnpm add package-name

# ✅ 添加开发依赖
pnpm add -D package-name

# ❌ 禁止使用 npm 或 yarn
# npm install  # 错误！
# yarn add     # 错误！
```

项目已配置 `preinstall` 脚本，使用其他包管理器会报错。

### 4. 样式开发

**使用 Tailwind CSS v4**

本项目使用 Tailwind CSS v4 进行样式开发，并已配置 shadcn 主题变量。

```tsx
// 使用 Tailwind 类名
<div className="flex items-center gap-4 p-4 rounded-lg bg-background">
  <Button className="bg-primary text-primary-foreground">
    主要按钮
  </Button>
</div>

// 使用 cn() 工具函数合并类名
import { cn } from '@/lib/utils';

<div className={cn(
  "base-class",
  condition && "conditional-class",
  className
)}>
  内容
</div>
```

**主题变量**

主题变量定义在 `src/app/globals.css` 中，支持亮色/暗色模式：

- `--background`, `--foreground`
- `--primary`, `--primary-foreground`
- `--secondary`, `--secondary-foreground`
- `--muted`, `--muted-foreground`
- `--accent`, `--accent-foreground`
- `--destructive`, `--destructive-foreground`
- `--border`, `--input`, `--ring`

### 5. 表单开发

推荐使用 `react-hook-form` + `zod` 进行表单开发：

```tsx
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

const formSchema = z.object({
  username: z.string().min(2, '用户名至少 2 个字符'),
  email: z.string().email('请输入有效的邮箱'),
});

export default function MyForm() {
  const form = useForm({
    resolver: zodResolver(formSchema),
    defaultValues: { username: '', email: '' },
  });

  const onSubmit = (data: z.infer<typeof formSchema>) => {
    console.log(data);
  };

  return (
    <form onSubmit={form.handleSubmit(onSubmit)}>
      <Input {...form.register('username')} />
      <Input {...form.register('email')} />
      <Button type="submit">提交</Button>
    </form>
  );
}
```

### 6. 数据获取

**服务端组件（推荐）**

```tsx
// src/app/posts/page.tsx
async function getPosts() {
  const res = await fetch('https://api.example.com/posts', {
    cache: 'no-store', // 或 'force-cache'
  });
  return res.json();
}

export default async function PostsPage() {
  const posts = await getPosts();

  return (
    <div>
      {posts.map(post => (
        <div key={post.id}>{post.title}</div>
      ))}
    </div>
  );
}
```

**客户端组件**

```tsx
'use client';

import { useEffect, useState } from 'react';

export default function ClientComponent() {
  const [data, setData] = useState(null);

  useEffect(() => {
    fetch('/api/data')
      .then(res => res.json())
      .then(setData);
  }, []);

  return <div>{JSON.stringify(data)}</div>;
}
```

## 常见开发场景

### 添加新页面

1. 在 `src/app/` 下创建文件夹和 `page.tsx`
2. 使用 shadcn 组件构建 UI
3. 根据需要添加 `layout.tsx` 和 `loading.tsx`

### 创建业务组件

1. 在 `src/components/` 下创建组件文件（非 UI 组件）
2. 优先组合使用 `src/components/ui/` 中的基础组件
3. 使用 TypeScript 定义 Props 类型

### 添加全局状态

推荐使用 React Context 或 Zustand：

```tsx
// src/lib/store.ts
import { create } from 'zustand';

interface Store {
  count: number;
  increment: () => void;
}

export const useStore = create<Store>((set) => ({
  count: 0,
  increment: () => set((state) => ({ count: state.count + 1 })),
}));
```

### 集成数据库

推荐使用 Prisma 或 Drizzle ORM，在 `src/lib/db.ts` 中配置。

## 技术栈

- **框架**: Next.js 16.1.1 (App Router)
- **UI 组件**: shadcn/ui (基于 Radix UI)
- **样式**: Tailwind CSS v4
- **表单**: React Hook Form + Zod
- **图标**: Lucide React
- **字体**: Geist Sans & Geist Mono
- **包管理器**: pnpm 9+
- **TypeScript**: 5.x

## 参考文档

- [Next.js 官方文档](https://nextjs.org/docs)
- [shadcn/ui 组件文档](https://ui.shadcn.com)
- [Tailwind CSS 文档](https://tailwindcss.com/docs)
- [React Hook Form](https://react-hook-form.com)

## 重要提示

1. **必须使用 pnpm** 作为包管理器
2. **优先使用 shadcn/ui 组件** 而不是从零开发基础组件
3. **遵循 Next.js App Router 规范**，正确区分服务端/客户端组件
4. **使用 TypeScript** 进行类型安全开发
5. **使用 `@/` 路径别名** 导入模块（已配置）

## 会议助手（Meeting Assistant）

> 目标：从网龙会议「会议记录」页面获取真实录音 → 下载落盘 → 自动语音识别（ASR）→ 生成会议纪要与待办 → 刷新后保持已转录状态。

### 一、整体链路

1. **抓取音频直链映射（一次性/定期）**
   - 在网龙会议记录页逐行点击「下载音频」，捕获 `gcdncs` 下载 URL（带 `dentryId`/`name`）。
   - 同时读取该行 `title/startTime/meetingNo`，形成映射。
   - 输出 `meeting-audio-links.json`：用于后端按标题匹配真实音频。

2. **会议列表展示**
   - 前端请求 `POST /api/meetings` 获取会议记录列表。
   - 后端从真实数据源取列表，并合并本地已转录结果（`*_result.json`），决定状态是「待处理 / 已转录」。

3. **下载真实音频**
   - 点击「下载真实音频」会调用 `POST /api/meetings/process`（不转录）。
   - 后端根据 `title/startTime` 从映射表匹配 `gcdncs mp3`，下载落盘到 `data/meetings/`。

4. **转录与纪要生成**
   - 点击「转录」会调用 `POST /api/meetings/process` 并带 `transcribe=true`。
   - 后端：下载音频 → ASR 转写 → LLM 生成纪要/待办 → 结果持久化到 `*_result.json`。

5. **刷新后保持已转录**
   - 转录结果会写入 `data/meetings/<meetingId>_result.json`。
   - 刷新列表时会读取该文件并把该条会议标记为 `completed`。

### 二、关键页面与接口

- 页面：`src/app/tools/meeting-assistant/page.tsx`
  - 列表、转录按钮、下载按钮、纪要弹窗展示。

- 会议列表：`src/app/api/meetings/route.ts`
  - `POST /api/meetings`

- 处理/转录：`src/app/api/meetings/process/route.ts`
  - `POST /api/meetings/process`
  - 入参：`meetingId`, `title`, `startTime`, `transcribe?: boolean`
  - 出参：`audioPath`, `audioUrl`, `transcript`, `summary`, `todos` 等

- 文件下载：`src/app/api/meetings/download/route.ts`
  - `GET /api/meetings/download?meetingId=...&format=audio`
  - **优先读取已落盘文件**，避免重复下载。

- 服务层：`src/lib/meeting-service.ts`
  - `downloadMedia()`：支持 `gcdncs` 直链下载并落盘
  - `persistMeetingResult()`：持久化转录结果到 `*_result.json`

### 三、ASR 与纪要生成

- 火山豆包录音文件识别（长音频 submit/query）：`src/lib/volc-asr.ts`
- 腾讯云短语音（备用）：`src/lib/tencent-asr.ts`
- 纪要生成：Moonshot/Kimi（OpenAI 兼容 `chat.completions`）

### 四、配置项（环境变量）

#### 1）映射文件（音频直链表）
- `MEETING_LINKS_FILE`：映射文件绝对路径（优先读取）

#### 2）音频落盘目录
- `MEETING_DATA_DIR`：默认 `F:/个人/app/claw studio/data/meetings`

#### 3）ASR（火山豆包录音文件识别）
- `VOLC_ASR_API_KEY`
- `VOLC_ASR_RESOURCE_ID`（默认 `volc.seedasr.auc`）
- `VOLC_ASR_SUBMIT_URL`（默认 `https://openspeech.bytedance.com/api/v3/auc/bigmodel/submit`）
- `VOLC_ASR_QUERY_URL`（默认 `https://openspeech.bytedance.com/api/v3/auc/bigmodel/query`）
- `VOLC_ASR_TIMEOUT_MS`（默认 180000，长音频可调大）
- `VOLC_ASR_POLL_INTERVAL_MS`（默认 1500）

#### 4）LLM（会议纪要生成）
- `MOONSHOT_API_KEY`
- `MOONSHOT_BASE_URL`（如 `https://api.moonshot.cn/v1`）
- `MOONSHOT_CHAT_MODEL`（推荐 `moonshot-v1-8k`）

> 注意：`.env.local` 已在 `.gitignore` 中，避免误提交。

### 五、当前能力与边界

**已具备：**
- 拉取真实会议列表
- 真实音频（mp3）下载落盘
- 长音频 ASR 转写（火山 submit/query）
- 会议纪要/待办自动生成（Moonshot）
- 刷新后保持已转录状态（本地 `*_result.json`）

**边界/注意：**
- 映射文件需要维护（新增会议需增量抓取）
- ASR 轮询超时需按音频时长调整 `VOLC_ASR_TIMEOUT_MS`
- 当前持久化为单机本地文件，若需要多端同步建议接入数据库
