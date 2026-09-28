"use client";

import { useEffect, useMemo, useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Loader2, RefreshCw, ListTodo, CalendarDays } from "lucide-react";
import { projectApi } from "@/app/projects/_lib/api";

interface Task {
  id: string;
  title: string;
  description: string | null;
  category: string;
  priority: string;
  status: string;
  assignee: string | null;
  estimated_hours: number | null;
  start_date: string | null;
  due_date: string | null;
  sprint_week: number | null;
  req_title: string | null;
}

interface TasksTabProps {
  projectId: string;
  kbRefreshKey?: number;
}

const STATUS_LABELS: Record<string, string> = {
  todo: "待开始",
  in_progress: "进行中",
  testing: "测试中",
  done: "已完成",
};

const PRIORITY_LABELS: Record<string, string> = { high: "P0", medium: "P1", low: "P2" };

function fmtDate(value: string | null): string {
  if (!value) return "未排期";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleDateString("zh-CN");
}

export default function TasksTab({ projectId, kbRefreshKey = 0 }: TasksTabProps) {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [loading, setLoading] = useState(true);

  const loadTasks = async () => {
    setLoading(true);
    try {
      const response = await fetch(projectApi(`/api/projects/${projectId}/tasks`));
      const json = await response.json();
      if (json.success) setTasks(json.data || []);
    } catch (error) {
      console.error("加载项目任务失败:", error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadTasks();
  }, [projectId, kbRefreshKey]);

  const stats = useMemo(() => ({
    total: tasks.length,
    done: tasks.filter((task) => task.status === "done").length,
    active: tasks.filter((task) => ["in_progress", "testing"].includes(task.status)).length,
  }), [tasks]);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold">开发任务 ({stats.total})</h2>
          <p className="text-xs text-muted-foreground">来自项目关联需求的真实开发任务，包含负责人、排期与状态</p>
        </div>
        <Button size="sm" variant="outline" onClick={loadTasks} disabled={loading}>
          {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
          刷新
        </Button>
      </div>

      <div className="grid grid-cols-3 gap-3">
        <Card><CardContent className="p-3"><div className="text-xs text-muted-foreground">任务总数</div><div className="mt-1 text-xl font-semibold">{stats.total}</div></CardContent></Card>
        <Card><CardContent className="p-3"><div className="text-xs text-muted-foreground">进行中</div><div className="mt-1 text-xl font-semibold">{stats.active}</div></CardContent></Card>
        <Card><CardContent className="p-3"><div className="text-xs text-muted-foreground">已完成</div><div className="mt-1 text-xl font-semibold">{stats.done}</div></CardContent></Card>
      </div>

      {loading ? (
        <div className="py-10 text-center text-muted-foreground">加载中...</div>
      ) : tasks.length === 0 ? (
        <Card className="border-dashed">
          <CardContent className="py-10 text-center text-muted-foreground">
            <ListTodo className="mx-auto mb-3 h-10 w-10 text-muted-foreground/40" />
            <p>暂无开发任务</p>
            <p className="mt-1 text-xs">先在需求分析中完成任务拆解，任务会自动出现在这里</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-2">
          {tasks.map((task) => (
            <Card key={task.id}>
              <CardContent className="p-4">
                <div className="flex items-start gap-3">
                  <div className="mt-1 h-2.5 w-2.5 shrink-0 rounded-full bg-primary" />
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <h3 className="font-medium">{task.title}</h3>
                      <Badge variant="secondary" className="text-xs">{STATUS_LABELS[task.status] || task.status}</Badge>
                      <Badge variant="outline" className="text-xs">{PRIORITY_LABELS[task.priority] || task.priority}</Badge>
                    </div>
                    <div className="mt-1 flex flex-wrap gap-x-3 gap-y-1 text-xs text-muted-foreground">
                      <span className="font-mono">{task.id}</span>
                      {task.req_title && <span>需求：{task.req_title}</span>}
                      <span>负责人：{task.assignee || "未分配"}</span>
                      {task.estimated_hours != null && <span>{task.estimated_hours} 小时</span>}
                    </div>
                    {task.description && <p className="mt-2 text-sm text-muted-foreground">{task.description}</p>}
                    <div className="mt-2 flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
                      <span className="flex items-center gap-1"><CalendarDays className="h-3.5 w-3.5" />{fmtDate(task.start_date)} - {fmtDate(task.due_date)}</span>
                      {task.sprint_week && <span>第 {task.sprint_week} 周</span>}
                      <span>{task.category}</span>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
