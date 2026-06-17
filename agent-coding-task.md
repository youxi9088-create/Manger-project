# OpenClaw Phase 0 — AI 执行任务清单

> **执行说明**：按顺序执行，每个任务完成后验证再进行下一个。
> **项目路径**：`F:/个人/app/openclaw`
> **包管理器**：pnpm（工作区模式）

---

## TASK-01：DB Migration — 给 project_initiations 表追加5个字段

**文件**：`packages/server/src/services/db.ts`

**在第 324 行之后**（现有迁移代码块末尾，`// 迁移：work_cycles 表添加 queued 状态支持` 块之前）**追加以下代码**：

```typescript
// 迁移：project_initiations 表追加 Phase 0 所需字段
try {
  const piColumns = (db.prepare("PRAGMA table_info(project_initiations)").all() as { name: string }[]).map(c => c.name);
  const toAdd: [string, string][] = [
    ['current_phase',      `TEXT DEFAULT 'draft'`],
    ['phase_status',       `TEXT DEFAULT 'active'`],
    ['deadline',           `TEXT`],
    ['team_size_required', `INTEGER DEFAULT 1`],
    ['approved_at',        `TEXT`],
  ];
  for (const [col, def] of toAdd) {
    if (!piColumns.includes(col)) {
      db.exec(`ALTER TABLE project_initiations ADD COLUMN ${col} ${def}`);
      console.log(`[DB] project_initiations 已添加字段: ${col}`);
    }
  }
} catch (e: any) {
  console.error('[DB] project_initiations 字段迁移失败:', e);
}
```

**验证**：启动 server，查看控制台输出中含 `[DB] project_initiations 已添加字段` 或无报错。

---

## TASK-02：新增 3 个 API — 项目总览 + 阶段推进 + 快捷审批

**文件**：`packages/server/src/routes/project-initiation.ts`

在文件末尾 `export default router;` **之前**追加以下3个路由：

### 2-A：GET /api/projects/overview

```typescript
/** GET /api/projects/overview — 所有项目聚合概览 */
router.get("/api/projects/overview", (req, res) => {
  try {
    const rows = dbInstance.prepare(`
      SELECT
        pi.id,
        pi.title,
        pi.status,
        pi.current_phase,
        pi.phase_status,
        pi.deadline,
        pi.team_size_required,
        pi.approved_at,
        pi.created_at,
        pi.updated_at,
        COUNT(DISTINCT ra.id)   AS requirement_count,
        COUNT(DISTINCT dt.id)   AS task_total,
        SUM(CASE WHEN dt.status = 'done' THEN 1 ELSE 0 END) AS task_done
      FROM project_initiations pi
      LEFT JOIN requirement_analyses ra ON ra.initiation_id = pi.id
      LEFT JOIN dev_tasks dt ON dt.requirement_id = ra.id
      GROUP BY pi.id
      ORDER BY pi.created_at DESC
    `).all();
    res.json({ success: true, data: rows });
  } catch (error: any) {
    res.status(500).json({ error: error?.message });
  }
});
```

### 2-B：PATCH /api/project-initiation/:id/phase

```typescript
/** PATCH /api/project-initiation/:id/phase — 推进项目阶段 */
router.patch("/api/project-initiation/:id/phase", (req, res) => {
  try {
    const existing = dbInstance.prepare("SELECT * FROM project_initiations WHERE id = ?").get(req.params.id) as any;
    if (!existing) return res.status(404).json({ error: "立项记录不存在" });

    const { phase } = req.body as { phase: string };
    const validPhases = ['draft', 'approved', 'planning', 'recruiting', 'executing', 'delivering', 'archived'];
    if (!validPhases.includes(phase)) {
      return res.status(400).json({ error: `无效阶段值，允许值：${validPhases.join(', ')}` });
    }

    const ts = nowStr();
    const updates: Record<string, any> = { current_phase: phase, updated_at: ts };

    if (phase === 'approved') {
      updates.approved_at = ts;
      // 自动设置 deadline = 审批通过后 14 天
      const dl = new Date();
      dl.setDate(dl.getDate() + 14);
      updates.deadline = dl.toISOString().slice(0, 10);
    }

    const sets = Object.keys(updates).map(k => `${k} = ?`).join(', ');
    const values = [...Object.values(updates), req.params.id];
    dbInstance.prepare(`UPDATE project_initiations SET ${sets} WHERE id = ?`).run(...values);

    const row = dbInstance.prepare("SELECT * FROM project_initiations WHERE id = ?").get(req.params.id);
    res.json({ success: true, data: row });
  } catch (error: any) {
    res.status(500).json({ error: error?.message });
  }
});
```

### 2-C：POST /api/project-initiation/:id/approve

```typescript
/** POST /api/project-initiation/:id/approve — 审批通过立项，一键推进到 approved 阶段 */
router.post("/api/project-initiation/:id/approve", (req, res) => {
  try {
    const existing = dbInstance.prepare("SELECT * FROM project_initiations WHERE id = ?").get(req.params.id) as any;
    if (!existing) return res.status(404).json({ error: "立项记录不存在" });

    const ts = nowStr();
    const dl = new Date();
    dl.setDate(dl.getDate() + 14);
    const deadline = dl.toISOString().slice(0, 10);

    dbInstance.prepare(`
      UPDATE project_initiations
      SET status = 'approved', current_phase = 'approved', approved_at = ?, deadline = ?, updated_at = ?
      WHERE id = ?
    `).run(ts, deadline, ts, req.params.id);

    const row = dbInstance.prepare("SELECT * FROM project_initiations WHERE id = ?").get(req.params.id);
    res.json({ success: true, data: row });
  } catch (error: any) {
    res.status(500).json({ error: error?.message });
  }
});
```

**验证**：curl 测试3个接口均正常响应 `{ success: true }`。

---

## TASK-03：新建项目总览页面

**新建文件**：`packages/web/src/app/projects/page.tsx`

完整文件内容如下：

```tsx
'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { FolderKanban, Clock, Users, CheckCircle2, AlertTriangle } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';

// ─── 类型 ───────────────────────────────────────────────────
interface ProjectOverview {
  id: string;
  title: string | null;
  status: string;
  current_phase: string | null;
  phase_status: string | null;
  deadline: string | null;
  team_size_required: number;
  approved_at: string | null;
  created_at: string;
  requirement_count: number;
  task_total: number;
  task_done: number;
}

// ─── 常量 ───────────────────────────────────────────────────
const PHASE_STEPS = [
  { key: 'draft',      label: '草稿' },
  { key: 'approved',   label: '已立项' },
  { key: 'planning',   label: '规划中' },
  { key: 'recruiting', label: '招募中' },
  { key: 'executing',  label: '执行中' },
  { key: 'delivering', label: '交付中' },
  { key: 'archived',   label: '已归档' },
];

const ACTION_MAP: Record<string, { label: string; url: string }> = {
  draft:      { label: '查看立项', url: '/tasks/project-initiation' },
  approved:   { label: '开始规划', url: '/tasks/task-breakdown' },
  planning:   { label: '查看计划', url: '/tasks/task-breakdown' },
  recruiting: { label: '招募看板', url: '/company/board' },
  executing:  { label: '执行看板', url: '/company/kanban' },
  delivering: { label: '交付管理', url: '/tasks/delivery' },
  archived:   { label: '查看归档', url: '/tasks/project-initiation' },
};

const PHASE_COLOR: Record<string, string> = {
  draft:      'bg-gray-100 text-gray-600',
  approved:   'bg-blue-100 text-blue-700',
  planning:   'bg-purple-100 text-purple-700',
  recruiting: 'bg-yellow-100 text-yellow-700',
  executing:  'bg-orange-100 text-orange-700',
  delivering: 'bg-green-100 text-green-700',
  archived:   'bg-slate-100 text-slate-500',
};

// ─── 子组件：7步进度条 ────────────────────────────────────────
function PhaseStepper({ current }: { current: string | null }) {
  const idx = PHASE_STEPS.findIndex(s => s.key === current);
  return (
    <div className="flex items-center gap-0.5 mt-2">
      {PHASE_STEPS.map((step, i) => (
        <React.Fragment key={step.key}>
          <div
            className={`h-1.5 flex-1 rounded-full transition-colors ${
              i <= idx ? 'bg-blue-500' : 'bg-gray-200'
            }`}
            title={step.label}
          />
          {i < PHASE_STEPS.length - 1 && <div className="w-px" />}
        </React.Fragment>
      ))}
    </div>
  );
}

// ─── 子组件：截止日期徽章 ────────────────────────────────────
function DeadlineBadge({ deadline }: { deadline: string | null }) {
  if (!deadline) return null;
  const now = new Date();
  const dl = new Date(deadline);
  const diffDays = Math.ceil((dl.getTime() - now.getTime()) / 86400000);

  let cls = 'bg-green-100 text-green-700';
  let label = `${diffDays}天后截止`;
  if (diffDays < 0) { cls = 'bg-red-100 text-red-700'; label = `已逾期 ${-diffDays} 天`; }
  else if (diffDays <= 3) { cls = 'bg-red-100 text-red-700'; label = `⚠️ ${diffDays}天后截止`; }
  else if (diffDays <= 7) { cls = 'bg-yellow-100 text-yellow-700'; label = `${diffDays}天后截止`; }

  return (
    <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${cls}`}>{label}</span>
  );
}

// ─── 统计卡 ────────────────────────────────────────────────
function StatCard({ icon: Icon, label, value, color }: {
  icon: React.ElementType; label: string; value: number; color: string;
}) {
  return (
    <Card>
      <CardContent className="flex items-center gap-3 p-4">
        <div className={`p-2 rounded-lg ${color}`}>
          <Icon className="w-5 h-5" />
        </div>
        <div>
          <div className="text-2xl font-bold">{value}</div>
          <div className="text-xs text-muted-foreground">{label}</div>
        </div>
      </CardContent>
    </Card>
  );
}

// ─── 主页面 ────────────────────────────────────────────────
export default function ProjectsPage() {
  const [projects, setProjects] = useState<ProjectOverview[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch('http://localhost:3001/api/projects/overview')
      .then(r => r.json())
      .then(d => { if (d.success) setProjects(d.data); })
      .finally(() => setLoading(false));
  }, []);

  // 统计
  const active    = projects.filter(p => ['planning','executing','delivering','recruiting'].includes(p.current_phase || '')).length;
  const dueThisWeek = projects.filter(p => {
    if (!p.deadline) return false;
    const diff = Math.ceil((new Date(p.deadline).getTime() - Date.now()) / 86400000);
    return diff >= 0 && diff <= 7;
  }).length;
  const recruiting = projects.filter(p => p.current_phase === 'recruiting').length;
  const delivering = projects.filter(p => p.current_phase === 'delivering').length;

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64 text-muted-foreground">
        加载中...
      </div>
    );
  }

  return (
    <div className="p-6 max-w-6xl mx-auto space-y-6">
      {/* 页头 */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <FolderKanban className="w-6 h-6 text-blue-600" />
          <h1 className="text-2xl font-bold">项目总览</h1>
          <Badge variant="secondary">{projects.length} 个项目</Badge>
        </div>
        <Link href="/tasks/project-initiation">
          <Button size="sm">+ 新建立项</Button>
        </Link>
      </div>

      {/* 统计卡片 */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <StatCard icon={FolderKanban}   label="进行中"   value={active}       color="bg-blue-100 text-blue-600" />
        <StatCard icon={Clock}          label="本周截止"  value={dueThisWeek}  color="bg-yellow-100 text-yellow-600" />
        <StatCard icon={Users}          label="待招募"   value={recruiting}   color="bg-purple-100 text-purple-600" />
        <StatCard icon={CheckCircle2}   label="待验收"   value={delivering}   color="bg-green-100 text-green-600" />
      </div>

      {/* 项目卡片列表 */}
      {projects.length === 0 ? (
        <div className="text-center py-16 text-muted-foreground">
          <FolderKanban className="w-12 h-12 mx-auto mb-3 opacity-30" />
          <p>暂无项目，去创建第一个立项吧</p>
          <Link href="/tasks/project-initiation" className="mt-3 inline-block">
            <Button variant="outline" size="sm">前往立项</Button>
          </Link>
        </div>
      ) : (
        <div className="grid gap-4">
          {projects.map(p => {
            const phase = p.current_phase || 'draft';
            const action = ACTION_MAP[phase] || ACTION_MAP.draft;
            const phaseMeta = PHASE_STEPS.find(s => s.key === phase);
            const progress = p.task_total > 0 ? Math.round((p.task_done / p.task_total) * 100) : 0;

            return (
              <Card key={p.id} className="hover:shadow-md transition-shadow">
                <CardHeader className="pb-2">
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-xs font-mono text-muted-foreground">{p.id}</span>
                        <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${PHASE_COLOR[phase] || ''}`}>
                          {phaseMeta?.label || phase}
                        </span>
                        <DeadlineBadge deadline={p.deadline} />
                      </div>
                      <CardTitle className="text-base mt-1 truncate">
                        {p.title || '（未命名项目）'}
                      </CardTitle>
                    </div>
                    <Link href={`${action.url}?id=${p.id}`}>
                      <Button size="sm" variant="outline">{action.label}</Button>
                    </Link>
                  </div>
                </CardHeader>
                <CardContent className="pt-0 space-y-2">
                  {/* 阶段进度条 */}
                  <PhaseStepper current={phase} />

                  {/* 任务进度 */}
                  <div className="flex items-center justify-between text-xs text-muted-foreground">
                    <span>任务进度：{p.task_done}/{p.task_total}（{progress}%）</span>
                    <span>需求 {p.requirement_count} 个 · 团队 {p.team_size_required} 人</span>
                  </div>

                  {p.task_total > 0 && (
                    <div className="w-full bg-gray-100 rounded-full h-1.5">
                      <div
                        className="bg-blue-500 h-1.5 rounded-full transition-all"
                        style={{ width: `${progress}%` }}
                      />
                    </div>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
```

**验证**：访问 `http://localhost:3000/projects`，页面正常渲染，统计卡 + 项目卡片显示正确。

---

## TASK-04：侧边栏改造 — 添加「项目总览」入口

**文件**：`packages/web/src/components/app-sidebar.tsx`

### 4-A：在顶部 import 行追加 `FolderKanban` 图标

找到现有 import：
```typescript
import {
  Calendar,
  CheckSquare,
  ClipboardList,
  FileSearch,
  LayoutDashboard,
  MessageSquare,
  Package,
  Search,
  ShoppingCart,
  Users,
  ChevronDown,
  Sparkles,
  MessageSquareText,
  Building2,
  UserPlus,
  UserRound,
  Bot,
  BrainCircuit,
  List,
} from 'lucide-react';
```

将 `List,` 改为：
```typescript
  List,
  FolderKanban,
```

### 4-B：在 `menuData.navMain` 数组头部插入新条目

找到：
```typescript
  navMain: [
    {
      title: '每日工作安排',
```

在 `navMain: [` 之后、`每日工作安排` 之前插入：
```typescript
    {
      title: '项目总览',
      url: '/projects',
      icon: FolderKanban,
    },
```

**验证**：侧边栏第一项显示「项目总览」，点击跳转 `/projects` 正常。

---

## TASK-05：联调验证

按以下步骤验证整体流程：

1. **重启 server**：`cd packages/server && pnpm dev`，观察控制台无报错，`[DB] project_initiations 已添加字段` 出现一次。
2. **API 测试**：
   - `GET http://localhost:3001/api/projects/overview` → 返回 `{ success: true, data: [...] }`
   - `POST http://localhost:3001/api/project-initiation/:id/approve` → 返回 approved 状态、deadline 为今天+14天
   - `PATCH http://localhost:3001/api/project-initiation/:id/phase` 传 `{ "phase": "executing" }` → 正常更新
3. **页面测试**：访问 `http://localhost:3000/projects`，确认：
   - 统计卡数据与现有立项数一致
   - 项目卡片显示阶段进度条、截止日期、任务进度
   - 「新建立项」按钮跳转 `/tasks/project-initiation`
   - 侧边栏第一个条目是「项目总览」

---

## 执行顺序总结

```
TASK-01（DB）→ TASK-02（API）→ TASK-03（新页面）→ TASK-04（侧边栏）→ TASK-05（联调）
```

每个任务独立，TASK-01 和 TASK-02 必须在 TASK-03 之前完成（前端依赖接口数据）。

---

## 附：修改文件清单

| 文件 | 操作类型 |
|------|---------|
| `packages/server/src/services/db.ts` | 追加（在现有迁移块末尾） |
| `packages/server/src/routes/project-initiation.ts` | 追加（在 `export default router` 之前） |
| `packages/web/src/app/projects/page.tsx` | 新建 |
| `packages/web/src/components/app-sidebar.tsx` | 修改（2处：import + menuData） |
