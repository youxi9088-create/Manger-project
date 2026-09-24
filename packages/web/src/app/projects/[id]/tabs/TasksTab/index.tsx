"use client";

import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Loader2, ListTodo } from "lucide-react";

const API_BASE = process.env.NEXT_PUBLIC_SERVER_API || "http://localhost:3001";

interface KbSummary {
  todo_list?: string;
}

interface TasksTabProps {
  projectId: string;
  kbRefreshKey?: number;
}

export default function TasksTab({ projectId, kbRefreshKey = 0 }: TasksTabProps) {
  const [kbSummary, setKbSummary] = useState<KbSummary | null>(null);
  const [loading, setLoading] = useState(true);

  const loadKbSummary = async () => {
    setLoading(true);
    try {
      const resp = await fetch(`${API_BASE}/api/projects/${projectId}/kb-summary?t=${Date.now()}`);
      const json = await resp.json();
      if (json.success) {
        setKbSummary(json.data);
      }
    } catch (e) {
      console.error("加载知识库任务失败:", e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadKbSummary();
  }, [projectId, kbRefreshKey]);

  const todoText = kbSummary?.todo_list || "";

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold">执行中任务</h2>
          <p className="text-xs text-muted-foreground">来自工作流同步的 zxzdb（执行中待办）数据</p>
        </div>
        <Button size="sm" variant="outline" onClick={loadKbSummary} disabled={loading}>
          {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : "刷新"}
        </Button>
      </div>

      {loading ? (
        <div className="text-center py-8 text-muted-foreground">加载中...</div>
      ) : !todoText.trim() ? (
        <Card className="border-dashed">
          <CardContent className="py-10 text-center text-muted-foreground">
            <ListTodo className="h-10 w-10 mx-auto mb-3 text-muted-foreground/40" />
            <p>暂无执行中任务数据</p>
            <p className="text-xs mt-1">请先在「工作流输出」页面触发项目信息查询</p>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <ListTodo className="h-4 w-4" />
              待办列表
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="prose prose-sm dark:prose-invert max-w-none">
              <pre className="text-sm whitespace-pre-wrap font-mono text-muted-foreground leading-relaxed bg-muted/30 p-4 rounded-lg">
                {todoText}
              </pre>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
