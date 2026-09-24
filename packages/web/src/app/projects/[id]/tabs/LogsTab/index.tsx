"use client";

import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ArrowRight, FileText, Loader2 } from "lucide-react";

const API_BASE = process.env.NEXT_PUBLIC_SERVER_API || "http://localhost:3001";

const PHASE_LABELS: Record<string, string> = {
  draft: "草稿",
  submitted: "待审批",
  approved: "已批准",
  planning: "规划中",
  plan_locked: "计划锁定",
  recruiting: "招募中",
  executing: "执行中",
  delivering: "交付中",
  reviewing: "验收中",
  accepted: "已完成",
  rejected: "已驳回",
  archived: "已归档",
};

interface PhaseLog {
  id: string;
  from_phase: string;
  to_phase: string;
  triggered_by: string | null;
  reason: string | null;
  created_at: string;
}

interface LogsTabProps {
  projectId: string;
}

export default function LogsTab({ projectId }: LogsTabProps) {
  const [logs, setLogs] = useState<PhaseLog[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadLogs();
  }, [projectId]);

  const loadLogs = async () => {
    setLoading(true);
    try {
      const resp = await fetch(`${API_BASE}/api/projects/${projectId}`);
      const json = await resp.json();
      if (json.success) {
        setLogs(json.data.phase_logs || []);
      }
    } catch (e) {
      console.error("加载日志失败:", e);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold">项目变更日志</h2>
      </div>

      {loading ? (
        <div className="text-center py-8 text-muted-foreground">加载中...</div>
      ) : logs.length === 0 ? (
        <Card className="border-dashed">
          <CardContent className="py-10 text-center text-muted-foreground">
            <FileText className="h-10 w-10 mx-auto mb-3 text-muted-foreground/40" />
            <p>暂无变更记录</p>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardContent className="p-4">
            <div className="space-y-3">
              {logs.map((log) => (
                <div key={log.id} className="flex items-start gap-3 text-sm">
                  <div className="mt-0.5 w-2 h-2 rounded-full bg-primary shrink-0" />
                  <div className="flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-muted-foreground">{PHASE_LABELS[log.from_phase] || log.from_phase}</span>
                      <ArrowRight className="h-3 w-3 text-muted-foreground" />
                      <span className="font-medium">{PHASE_LABELS[log.to_phase] || log.to_phase}</span>
                    </div>
                    {log.reason && <p className="text-xs text-muted-foreground mt-1">{log.reason}</p>}
                    <div className="flex items-center gap-2 mt-1">
                      <span className="text-xs text-muted-foreground">
                        {new Date(log.created_at).toLocaleString("zh-CN")}
                      </span>
                      {log.triggered_by && (
                        <span className="text-xs text-muted-foreground">by {log.triggered_by}</span>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
