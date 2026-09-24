"use client";

import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Plus, Package, CheckCircle, Clock, AlertTriangle, Loader2, ArrowRight, RotateCcw } from "lucide-react";

const API_BASE = process.env.NEXT_PUBLIC_SERVER_API || "http://localhost:3001";

interface Version {
  id: string;
  name: string;
  status: string;
  risk_level: string;
  expected_release_date: string | null;
  description: string | null;
  task_ids: string;
  created_at: string;
}

interface DeliveryTabProps {
  projectId: string;
}

const STATUS_FLOW = [
  "pending_confirm",
  "confirmed",
  "in_progress",
  "testing",
  "ready_release",
  "released",
];

const STATUS_LABELS: Record<string, string> = {
  pending_confirm: "待确认",
  confirmed: "已确认",
  in_progress: "进行中",
  testing: "测试中",
  ready_release: "待发布",
  released: "已发布",
  delayed: "已延期",
};

const STATUS_COLORS: Record<string, string> = {
  pending_confirm: "bg-slate-500",
  confirmed: "bg-blue-500",
  in_progress: "bg-indigo-500",
  testing: "bg-amber-500",
  ready_release: "bg-cyan-500",
  released: "bg-green-500",
  delayed: "bg-red-500",
};

const DEFAULT_CHECKLIST = [
  { id: "tests_pass", label: "测试通过" },
  { id: "docs_updated", label: "文档已更新" },
  { id: "rollback_plan", label: "回滚方案就绪" },
  { id: "monitor_ready", label: "监控已配置" },
];

export default function DeliveryTab({ projectId }: DeliveryTabProps) {
  const [versions, setVersions] = useState<Version[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [newName, setNewName] = useState("");
  const [newDate, setNewDate] = useState("");
  const [creating, setCreating] = useState(false);
  const [advancing, setAdvancing] = useState<string | null>(null);
  const [checklistMap, setChecklistMap] = useState<Record<string, Record<string, boolean>>>({});

  const loadVersions = async () => {
    setLoading(true);
    try {
      const resp = await fetch(`${API_BASE}/api/projects/${projectId}/deliveries`);
      const json = await resp.json();
      if (json.success) {
        setVersions(json.data || []);
      }
    } catch (e) {
      console.error("加载版本失败:", e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadVersions();
  }, [projectId]);

  const handleCreate = async () => {
    if (!newName.trim()) return;
    setCreating(true);
    try {
      const resp = await fetch(`${API_BASE}/api/projects/${projectId}/deliveries`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: newName, expected_release_date: newDate || null }),
      });
      const json = await resp.json();
      if (json.success) {
        setNewName("");
        setNewDate("");
        setDialogOpen(false);
        loadVersions();
      }
    } catch (e) {
      console.error("创建版本失败:", e);
    } finally {
      setCreating(false);
    }
  };

  const getNextStatus = (current: string) => {
    const idx = STATUS_FLOW.indexOf(current);
    if (idx >= 0 && idx < STATUS_FLOW.length - 1) return STATUS_FLOW[idx + 1];
    return null;
  };

  const handleAdvance = async (version: Version) => {
    const next = getNextStatus(version.status);
    if (!next) return;
    setAdvancing(version.id);
    try {
      const resp = await fetch(`${API_BASE}/api/projects/${projectId}/deliveries/${version.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: next }),
      });
      const json = await resp.json();
      if (json.success) {
        loadVersions();
      }
    } catch (e) {
      console.error("推进版本失败:", e);
    } finally {
      setAdvancing(null);
    }
  };

  const handleDelay = async (version: Version) => {
    setAdvancing(version.id);
    try {
      const resp = await fetch(`${API_BASE}/api/projects/${projectId}/deliveries/${version.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "delayed" }),
      });
      const json = await resp.json();
      if (json.success) {
        loadVersions();
      }
    } catch (e) {
      console.error("标记延期失败:", e);
    } finally {
      setAdvancing(null);
    }
  };

  const toggleChecklist = (versionId: string, itemId: string) => {
    setChecklistMap((prev) => ({
      ...prev,
      [versionId]: {
        ...prev[versionId],
        [itemId]: !prev[versionId]?.[itemId],
      },
    }));
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold">版本交付 ({versions.length})</h2>
        <Button size="sm" onClick={() => setDialogOpen(true)}>
          <Plus className="h-4 w-4 mr-1" /> 新建版本
        </Button>
      </div>

      {loading ? (
        <div className="text-center py-8 text-muted-foreground">加载中...</div>
      ) : versions.length === 0 ? (
        <Card className="border-dashed">
          <CardContent className="py-10 text-center text-muted-foreground">
            <Package className="h-10 w-10 mx-auto mb-3 text-muted-foreground/40" />
            <p>暂无版本记录，点击「新建版本」开始交付管理</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {versions.map((ver) => {
            const nextStatus = getNextStatus(ver.status);
            const isDone = ver.status === "released";
            const isDelayed = ver.status === "delayed";

            return (
              <Card key={ver.id}>
                <CardContent className="p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-medium">{ver.name}</span>
                        <Badge className={`${STATUS_COLORS[ver.status] || "bg-muted"} text-white text-xs`}>
                          {STATUS_LABELS[ver.status] || ver.status}
                        </Badge>
                        {ver.risk_level && (
                          <Badge variant={ver.risk_level === "high" ? "destructive" : "secondary"} className="text-xs">
                            {ver.risk_level === "high" ? "高风险" : ver.risk_level === "medium" ? "中风险" : "低风险"}
                          </Badge>
                        )}
                      </div>
                      {ver.expected_release_date && (
                        <div className="flex items-center gap-1 text-xs text-muted-foreground mt-1">
                          <Clock className="h-3 w-3" />
                          预计发布: {new Date(ver.expected_release_date).toLocaleDateString()}
                        </div>
                      )}

                      {/* Checklist */}
                      <div className="mt-3 space-y-1">
                        {DEFAULT_CHECKLIST.map((item) => (
                          <label key={item.id} className="flex items-center gap-2 text-sm cursor-pointer">
                            <Checkbox
                              checked={!!checklistMap[ver.id]?.[item.id]}
                              onCheckedChange={() => toggleChecklist(ver.id, item.id)}
                            />
                            <span className={checklistMap[ver.id]?.[item.id] ? "line-through text-muted-foreground" : ""}>
                              {item.label}
                            </span>
                          </label>
                        ))}
                      </div>
                    </div>

                    <div className="flex flex-col gap-1.5 shrink-0">
                      {!isDone && !isDelayed && nextStatus && (
                        <Button
                          size="sm"
                          onClick={() => handleAdvance(ver)}
                          disabled={advancing === ver.id}
                        >
                          {advancing === ver.id ? (
                            <Loader2 className="h-3.5 w-3.5 animate-spin" />
                          ) : (
                            <>
                              <ArrowRight className="h-3.5 w-3.5 mr-1" />
                              推进到{STATUS_LABELS[nextStatus]}
                            </>
                          )}
                        </Button>
                      )}
                      {!isDone && !isDelayed && (
                        <Button
                          size="sm"
                          variant="outline"
                          className="text-destructive hover:text-destructive"
                          onClick={() => handleDelay(ver)}
                          disabled={advancing === ver.id}
                        >
                          <RotateCcw className="h-3.5 w-3.5 mr-1" />
                          标记延期
                        </Button>
                      )}
                      {isDone && (
                        <Badge className="bg-green-500 text-white">
                          <CheckCircle className="h-3 w-3 mr-1" />
                          已发布
                        </Badge>
                      )}
                      {isDelayed && (
                        <Badge className="bg-red-500 text-white">
                          <AlertTriangle className="h-3 w-3 mr-1" />
                          已延期
                        </Badge>
                      )}
                    </div>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {/* 新建版本弹窗 */}
      {dialogOpen && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4">
          <div className="bg-background rounded-lg border shadow-lg w-full max-w-md flex flex-col">
            <div className="flex items-center justify-between p-4 border-b">
              <h2 className="text-lg font-semibold">新建版本</h2>
              <Button variant="ghost" size="sm" onClick={() => setDialogOpen(false)}>✕</Button>
            </div>
            <div className="p-4 space-y-3">
              <div>
                <label className="text-sm font-medium">版本名称</label>
                <Input value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="如 v1.0.0" />
              </div>
              <div>
                <label className="text-sm font-medium">预计发布日期</label>
                <Input type="date" value={newDate} onChange={(e) => setNewDate(e.target.value)} />
              </div>
            </div>
            <div className="p-4 border-t flex justify-end gap-2">
              <Button variant="outline" size="sm" onClick={() => setDialogOpen(false)}>取消</Button>
              <Button size="sm" onClick={handleCreate} disabled={creating || !newName.trim()}>
                {creating ? <Loader2 className="h-4 w-4 animate-spin" /> : "创建"}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
