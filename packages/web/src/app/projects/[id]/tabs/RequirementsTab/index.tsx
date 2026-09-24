"use client";

import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Loader2, Calendar, Target, CheckCircle2, Clock } from "lucide-react";

const API_BASE = process.env.NEXT_PUBLIC_SERVER_API || "http://localhost:3001";

interface KbWeeklyVersion {
  time?: string;
  week?: string;
  plan: string;
  importance?: string;
  progress: string;
  completion?: string;
}

interface KbSummary {
  weekly_versions?: KbWeeklyVersion[];
}

interface RequirementsTabProps {
  projectId: string;
  kbRefreshKey?: number;
}

function parseProgress(val: string): number {
  const n = parseFloat(String(val).replace('%', ''));
  return isNaN(n) ? 0 : Math.min(100, Math.max(0, n));
}

function fmtDate(iso: string): string {
  if (!iso) return '--';
  const d = new Date(iso);
  if (isNaN(d.getTime())) return iso;
  return `${d.getMonth() + 1}月${d.getDate()}日`;
}

export default function RequirementsTab({ projectId, kbRefreshKey = 0 }: RequirementsTabProps) {
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
      console.error("加载知识库需求失败:", e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadKbSummary();
  }, [projectId, kbRefreshKey]);

  const versions = kbSummary?.weekly_versions || [];
  const completedCount = versions.filter(v => parseProgress(v.progress) >= 100).length;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold">周版本需求 ({versions.length})</h2>
          <p className="text-xs text-muted-foreground">来自工作流同步的 weekly_versions 数据</p>
        </div>
        <Button size="sm" variant="outline" onClick={loadKbSummary} disabled={loading}>
          {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : "刷新"}
        </Button>
      </div>

      {loading ? (
        <div className="text-center py-8 text-muted-foreground">加载中...</div>
      ) : versions.length === 0 ? (
        <Card className="border-dashed">
          <CardContent className="py-10 text-center text-muted-foreground">
            <Target className="h-10 w-10 mx-auto mb-3 text-muted-foreground/40" />
            <p>暂无周版本需求数据</p>
            <p className="text-xs mt-1">请先在「工作流输出」页面触发项目信息查询</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          <div className="flex items-center gap-4 text-sm text-muted-foreground">
            <span className="flex items-center gap-1">
              <CheckCircle2 className="h-4 w-4 text-green-500" />
              已完成 {completedCount}
            </span>
            <span className="flex items-center gap-1">
              <Clock className="h-4 w-4 text-amber-500" />
              进行中 {versions.length - completedCount}
            </span>
          </div>
          {versions.map((v, idx) => {
            const progress = parseProgress(v.progress);
            const isDone = progress >= 100;
            return (
              <Card key={idx} className={isDone ? "border-green-200/50" : undefined}>
                <CardContent className="p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex-1 min-w-0 space-y-2">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-medium">{v.plan || "(无标题)"}</span>
                        {v.importance && (
                          <Badge variant="outline" className="text-xs">{v.importance}</Badge>
                        )}
                        <Badge variant={isDone ? "default" : "secondary"} className="text-xs">
                          {v.progress || "0%"}
                        </Badge>
                      </div>
                      <div className="flex items-center gap-3 text-xs text-muted-foreground">
                        {(v.time || v.week) && (
                          <span className="flex items-center gap-1">
                            <Calendar className="h-3 w-3" />
                            {fmtDate(v.time || v.week || "")}
                          </span>
                        )}
                      </div>
                      {v.completion && (
                        <div className="text-sm text-muted-foreground whitespace-pre-wrap line-clamp-4 bg-muted/40 rounded p-2">
                          {v.completion}
                        </div>
                      )}
                    </div>
                  </div>
                  <div className="mt-3 h-1.5 w-full bg-muted rounded-full overflow-hidden">
                    <div
                      className={`h-full rounded-full ${isDone ? "bg-green-500" : "bg-primary"}`}
                      style={{ width: `${progress}%` }}
                    />
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
