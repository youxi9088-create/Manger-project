"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import {
  Plus, GitBranch, UsersRound, AlertTriangle, Clock, CheckCircle2,
  Rocket, Pause, Loader2, Sparkles, ChevronRight, ChevronDown, ListTodo, Trash2,
  Target, Shield, RefreshCw, FolderOpen,
} from "lucide-react";

const API_BASE = "http://localhost:3001";

// ============ 类型 ============

interface DevTask {
  id: string;
  requirement_id: string;
  title: string;
  description: string | null;
  category: string;
  priority: string;
  status: string;
  assignee: string | null;
  estimated_hours: number | null;
  sort_order: number;
}

interface Requirement {
  id: string;
  title: string;
  status: string; // draft / analyzed / tasked / in_progress / done
  version_id: string | null;
  from_goal_id: string | null;
  computed_status?: string;
}

interface VersionGoal {
  id: string;
  title: string;
  description: string;
  requirement_id: string | null;
  created_at: string;
}

interface Version {
  id: string;
  name: string;
  status: string;
  risk_level: string;          // low / medium / high
  participants: string;         // JSON array of names
  expected_release_date: string | null;
  description: string | null;
  task_ids: string;             // JSON array of task IDs
  goals: string | null;         // JSON array of VersionGoal
  computed_risk: string | null; // safe / warning / critical / overdue / unknown
  risk_reasons: string | null;  // JSON array of reason strings
  last_check_at: string | null;
  project_id: string | null;
  created_at: string;
  updated_at: string;
}

interface ProjectBrief {
  id: string;
  title: string | null;
}

// ============ 状态配置 ============

const VERSION_STATUS_CONFIG: Record<string, {
  label: string;
  color: string; // bg + text classes
  icon: any;     // eslint-disable-line @typescript-eslint/no-explicit-any
}> = {
  pending_confirm:   { label: "待确认", color: "bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300", icon: Clock },
  confirmed:         { label: "已确认", color: "bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-300", icon: CheckCircle2 },
  in_progress:       { label: "进行中", color: "bg-amber-100 text-amber-700 dark:bg-amber-900 dark:text-amber-300", icon: Sparkles },
  testing:           { label: "测试中", color: "bg-cyan-100 text-cyan-700 dark:bg-cyan-900 dark:text-cyan-300", icon: Loader2 },
  ready_release:     { label: "待发布", color: "bg-purple-100 text-purple-700 dark:bg-purple-900 dark:text-purple-300", icon: Rocket },
  released:          { label: "已发布", color: "bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300", icon: CheckCircle2 },
  delayed:           { label: "已延期", color: "bg-red-100 text-red-700 dark:bg-red-900 dark:text-red-300", icon: AlertTriangle },
};

const VERSION_STATUS_ORDER = [
  "pending_confirm", "confirmed", "in_progress", "testing",
  "ready_release", "released", "delayed",
] as const;

// 预警配置（基于实时计算）
const COMPUTED_RISK_CONFIG: Record<string, { label: string; color: string; dot: string }> = {
  safe:     { label: "安全", color: "bg-green-500/10 text-green-600 border-green-500/30", dot: "bg-green-500" },
  warning:  { label: "预警", color: "bg-yellow-500/10 text-yellow-600 border-yellow-500/30", dot: "bg-yellow-500" },
  critical: { label: "严重", color: "bg-orange-500/10 text-orange-600 border-orange-500/30", dot: "bg-orange-500" },
  overdue:  { label: "逾期", color: "bg-red-500/10 text-red-600 border-red-500/30", dot: "bg-red-500" },
  unknown:  { label: "未计算", color: "bg-slate-500/10 text-slate-500 border-slate-500/30", dot: "bg-slate-400" },
};

function parseGoals(raw: string | null): VersionGoal[] {
  try { return JSON.parse(raw || "[]") as VersionGoal[]; } catch { return []; }
}

interface RiskData {
  reasons: string[];
  strategies: string[];
  stats?: { remaining_hours?: number; estimated_finish_days?: number; done_rate?: number };
}

function parseRiskData(raw: string | null): RiskData {
  try {
    const parsed = JSON.parse(raw || "[]");
    // 兼容旧格式（纯 string[]）和新格式（{ reasons, strategies, stats }）
    if (Array.isArray(parsed)) {
      return { reasons: parsed, strategies: [] };
    }
    return {
      reasons: parsed.reasons || [],
      strategies: parsed.strategies || [],
      stats: parsed.stats,
    };
  } catch { return { reasons: [], strategies: [] }; }
}

function parseReasons(raw: string | null): string[] {
  return parseRiskData(raw).reasons;
}

const PRIORITY_COLORS: Record<string, string> = {
  high: "border-l-red-500",
  medium: "border-l-yellow-500",
  low: "border-l-green-500",
};

const TASK_STATUS_MAP: Record<string, string> = {
  todo: "待开发", in_progress: "开发中", testing: "测试中", done: "已完成",
};

export default function VersionsPage() {
  const [versions, setVersions] = useState<Version[]>([]);
  const [allTasks, setAllTasks] = useState<DevTask[]>([]);
  const [allRequirements, setAllRequirements] = useState<Requirement[]>([]);
  const [projects, setProjects] = useState<ProjectBrief[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [detailOpen, setDetailOpen] = useState(false);
  const [selectedVersion, setSelectedVersion] = useState<Version | null>(null);

  // 表单状态
  const [formName, setFormName] = useState("");
  const [formDate, setFormDate] = useState("");
  const [formDesc, setFormDesc] = useState("");
  const [formGoals, setFormGoals] = useState<Array<{ title: string; description: string }>>([]);
  const [formProjectId, setFormProjectId] = useState<string>("");

  // 获取所有数据
  const fetchData = useCallback(async () => {
    try {
      setLoading(true);
      const [verRes, taskRes, reqRes, projRes] = await Promise.all([
        fetch(`${API_BASE}/api/versions`),
        fetch(`${API_BASE}/api/dev-tasks`),
        fetch(`${API_BASE}/api/requirements`),
        fetch(`${API_BASE}/api/projects`),
      ]);
      const verJson = await verRes.json();
      const taskJson = await taskRes.json();
      const reqJson = await reqRes.json();
      const projJson = await projRes.json();
      if (verJson.success) setVersions(verJson.data || []);
      if (taskJson.success) setAllTasks(taskJson.data || []);
      if (reqJson.success) setAllRequirements(reqJson.data || []);
      if (projJson.success) setProjects((projJson.data || []).map((p: { id: string; title: string | null }) => ({ id: p.id, title: p.title })));
    } catch (err) {
      console.error("加载数据失败:", err);
      setVersions(getMockVersions());
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  // 创建版本
  const handleCreate = async () => {
    if (!formName.trim()) return;
    try {
      const cleanedGoals = formGoals
        .filter(g => g.title.trim())
        .map(g => ({ title: g.title.trim(), description: g.description.trim() }));
      const res = await fetch(`${API_BASE}/api/versions`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: formName.trim(),
          expected_release_date: formDate || null,
          description: formDesc || null,
          participants: JSON.stringify([]),
          task_ids: JSON.stringify([]),
          goals: cleanedGoals,
          project_id: formProjectId && formProjectId !== "_none" ? formProjectId : null,
        }),
      });
      const json = await res.json();
      if (json.success) {
        setDialogOpen(false);
        resetForm();
        fetchData();
      }
    } catch (err) {
      console.error("创建版本失败:", err);
    }
  };

  const resetForm = () => {
    setFormName(""); setFormDate(""); setFormDesc(""); setFormProjectId("");
    setFormGoals([]);
  };

  // ---- 版本目标操作 ----
  const addGoalToVersion = async (verId: string, title: string, description: string) => {
    if (!title.trim()) return;
    try {
      const res = await fetch(`${API_BASE}/api/versions/${verId}/goals`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: title.trim(), description }),
      });
      const json = await res.json();
      if (json.success) {
        await fetchData();
        // 更新选中版本
        setSelectedVersion(prev => prev && prev.id === verId
          ? { ...prev, goals: JSON.stringify(json.goals) }
          : prev);
      }
    } catch (err) { console.error(err); }
  };

  const deleteGoalFromVersion = async (verId: string, goalId: string) => {
    try {
      const res = await fetch(`${API_BASE}/api/versions/${verId}/goals/${goalId}`, { method: "DELETE" });
      const json = await res.json();
      if (json.success) {
        await fetchData();
        setSelectedVersion(prev => prev && prev.id === verId
          ? { ...prev, goals: JSON.stringify(json.goals) }
          : prev);
      }
    } catch (err) { console.error(err); }
  };

  const convertGoalToRequirement = async (verId: string, goalId: string) => {
    try {
      const res = await fetch(`${API_BASE}/api/versions/${verId}/goals/${goalId}/convert`, { method: "POST" });
      const json = await res.json();
      if (json.success && json.requirement) {
        await fetchData();
        // 重新拉选中版本的最新数据
        const verRes = await fetch(`${API_BASE}/api/versions/${verId}`);
        const verJson = await verRes.json();
        if (verJson.success) setSelectedVersion(verJson.data.version);
        alert(`已转化为需求 ${json.requirement.id}`);
      } else if (json.error) {
        alert(json.error);
      }
    } catch (err) { console.error(err); }
  };

  // 删除版本
  const handleDeleteVersion = async (verId: string, verName: string) => {
    if (!confirm(`确认删除版本「${verName}」？\n（关联的需求不会被删除，仅解除与版本的关联）`)) return;
    try {
      const res = await fetch(`${API_BASE}/api/versions/${verId}`, { method: "DELETE" });
      const json = await res.json();
      if (json.success) {
        // 如果删除的是当前打开的详情，关闭弹窗
        if (selectedVersion?.id === verId) {
          setDetailOpen(false);
          setSelectedVersion(null);
        }
        fetchData();
      } else {
        alert(json.error || "删除失败");
      }
    } catch (err) {
      console.error("删除版本失败:", err);
      alert("删除失败，请检查网络");
    }
  };

  // 手动刷新风险监测
  const [refreshingRisk, setRefreshingRisk] = useState<string | null>(null); // 存储正在刷新的版本 ID
  const handleRefreshRisk = async (verId: string) => {
    setRefreshingRisk(verId);
    try {
      const res = await fetch(`${API_BASE}/api/versions/${verId}/recompute-risk`, { method: "POST" });
      const json = await res.json();
      if (json.success) {
        // 更新列表中的版本预警数据
        setVersions(prev => prev.map(v =>
          v.id === verId
            ? { ...v, computed_risk: json.data.computed_risk, risk_reasons: json.data.risk_reasons, last_check_at: json.data.last_check_at }
            : v
        ));
        // 如果正在查看这个版本的详情，也更新
        if (selectedVersion?.id === verId) {
          setSelectedVersion(prev => prev
            ? { ...prev, computed_risk: json.data.computed_risk, risk_reasons: json.data.risk_reasons, last_check_at: json.data.last_check_at }
            : prev
          );
        }
      }
    } catch (err) { console.error("刷新风险监测失败:", err); }
    finally { setRefreshingRisk(null); }
  };

  // 更新任务字段（如 estimated_hours）
  const handleTaskUpdate = async (taskId: string, field: string, value: string | number) => {
    try {
      const res = await fetch(`${API_BASE}/api/dev-tasks/${taskId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ [field]: value }),
      });
      if (!res.ok) { console.error(`更新任务失败: ${res.status}`); return; }
      setAllTasks(prev => prev.map(t => t.id === taskId ? { ...t, [field]: value } : t));
    } catch (err) { console.error("更新任务失败:", err); }
  };

  // 更新版本状态
  const handleStatusUpdate = async (verId: string, newStatus: string) => {
    try {
      await fetch(`${API_BASE}/api/versions/${verId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: newStatus }),
      });
    } catch (err) { /* ignore */ }
    setVersions(prev => prev.map(v => v.id === verId ? { ...v, status: newStatus } : v));
  };

  // 获取下一个状态
  const getNextStatuses = (current: string): string[] => {
    const idx = VERSION_STATUS_ORDER.indexOf(current as typeof VERSION_STATUS_ORDER[number]);
    if (idx < 0) return [];
    const nexts: string[] = [];
    for (let i = idx + 1; i < VERSION_STATUS_ORDER.length; i++) {
      nexts.push(VERSION_STATUS_ORDER[i]);
    }
    // 已延期可以回到进行中
    if (current === "delayed") {
      nexts.push("in_progress");
    }
    return nexts.slice(0, 3); // 最多显示 3 个可流转的状态
  };

  // 打开版本详情弹窗
  const openDetail = (ver: Version) => {
    setSelectedVersion(ver);
    setDetailOpen(true);
  };

  // 获取版本内的任务列表
  const getVersionTasks = (ver: Version): DevTask[] => {
    try {
      const ids = JSON.parse(ver.task_ids || "[]") as string[];
      return ids.map(id => allTasks.find(t => t.id === id)).filter(Boolean) as DevTask[];
    } catch {
      return [];
    }
  };

  // 统计卡片数据
  const stats = {
    total: versions.length,
    inProgress: versions.filter(v => ["in_progress", "testing"].includes(v.status)).length,
    released: versions.filter(v => v.status === "released").length,
    delayed: versions.filter(v => v.status === "delayed").length,
  };

  // 项目名称映射
  const projectMap = useMemo(() => {
    const m = new Map<string, string>();
    projects.forEach(p => m.set(p.id, p.title || p.id));
    return m;
  }, [projects]);

  // ============ 渲染 ============
  return (
    <div className="space-y-6">
      {/* 头部 */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight flex items-center gap-3">
            <GitBranch className="h-8 w-8 text-primary" />
            版本管理
          </h1>
          <p className="text-muted-foreground mt-1">根据配置规则自动规划版本内容，跟踪每个版本的交付进度</p>
        </div>
        <Button onClick={() => setDialogOpen(true)}>
          <Plus className="h-4 w-4 mr-1.5" />
          新建版本
        </Button>
      </div>

      {/* 统计卡片区 */}
      <div className="grid grid-cols-4 gap-4">
        {[
          { label: "全部版本", value: stats.total, icon: GitBranch, color: "text-muted-foreground" },
          { label: "进行中", value: stats.inProgress, icon: Sparkles, color: "text-amber-500" },
          { label: "已发布", value: stats.released, icon: CheckCircle2, color: "text-green-500" },
          { label: "已延期", value: stats.delayed, icon: AlertTriangle, color: "text-red-500" },
        ].map((s) => (
          <Card key={s.label}>
            <CardContent className="pt-6 pb-4">
              <div className="flex items-center gap-3">
                <div className={`p-2 rounded-lg bg-muted ${s.color}`}>
                  <s.icon className="h-5 w-5" />
                </div>
                <div>
                  <p className="text-2xl font-bold">{s.value}</p>
                  <p className="text-xs text-muted-foreground">{s.label}</p>
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* 版本卡片列表 */}
      {loading ? (
        <div className="flex justify-center py-16">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      ) : versions.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center py-20 text-muted-foreground">
            <GitBranch className="h-12 w-12 mb-4 opacity-40" />
            <p className="font-medium">暂无版本</p>
            <p className="text-sm mt-1">点击「新建版本」开始规划你的第一个版本</p>
            <Button variant="outline" size="sm" className="mt-4" onClick={() => setDialogOpen(true)}>
              <Plus className="h-4 w-4 mr-1.5" />
              新建版本
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">
          {versions.map((ver) => {
            const config = VERSION_STATUS_CONFIG[ver.status] || VERSION_STATUS_CONFIG.pending_confirm;
            const StatusIcon = config.icon;
            const participants = (() => { try { return JSON.parse(ver.participants || "[]"); } catch { return []; } })();
            const tasks = getVersionTasks(ver);
            const doneCount = tasks.filter(t => t.status === "done").length;
            const nextStatuses = getNextStatuses(ver.status);

            return (
              <Card
                key={ver.id}
                className={`group hover:shadow-lg transition-all cursor-pointer border-l-4 ${
                  ver.status === "delayed" ? "border-l-red-500" :
                  ver.status === "released" ? "border-l-green-500" :
                  "border-l-transparent"
                }`}
                onClick={() => openDetail(ver)}
              >
                <CardHeader className="pb-3">
                  <div className="flex items-start justify-between">
                    <div className="flex-1 min-w-0">
                      <CardTitle className="text-base font-semibold leading-tight">{ver.name}</CardTitle>
                      <p className="text-xs text-muted-foreground mt-1 font-mono opacity-60">{ver.id}</p>
                    </div>
                    <div className="flex items-center gap-1.5 shrink-0">
                      <Badge className={config.color}>
                        <StatusIcon className="h-3 w-3 mr-1" />
                        {config.label}
                      </Badge>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7 opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-destructive transition-opacity"
                        onClick={(e) => { e.stopPropagation(); handleDeleteVersion(ver.id, ver.name); }}
                        title="删除版本"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="space-y-4">
                  {/* 预警（自动计算） */}
                  {ver.computed_risk && ver.computed_risk !== 'unknown' && (() => {
                    const rr = COMPUTED_RISK_CONFIG[ver.computed_risk] || COMPUTED_RISK_CONFIG.unknown;
                    const riskData = parseRiskData(ver.risk_reasons);
                    const isSafe = ver.computed_risk === 'safe';
                    const isRefreshing = refreshingRisk === ver.id;
                    return (
                      <div className={`px-3 py-2 rounded-md border text-xs space-y-1 ${rr.color}`}>
                        <div className="flex items-center gap-1.5 font-semibold">
                          <span className={`inline-block h-2 w-2 rounded-full ${rr.dot}`} />
                          预警：{rr.label}
                          <button
                            onClick={(e) => { e.stopPropagation(); handleRefreshRisk(ver.id); }}
                            disabled={isRefreshing}
                            className="ml-auto p-0.5 rounded hover:bg-black/5 dark:hover:bg-white/10 transition-colors disabled:opacity-50"
                            title="刷新风险监测"
                          >
                            <RefreshCw className={`h-3 w-3 ${isRefreshing ? 'animate-spin' : ''}`} />
                          </button>
                        </div>
                        {riskData.reasons.length > 0 && (
                          <ul className="space-y-0.5 pl-3.5 opacity-90">
                            {riskData.reasons.slice(0, 2).map((r, i) => (
                              <li key={i} className="list-disc">{r}</li>
                            ))}
                            {riskData.reasons.length > 2 && (
                              <li className="opacity-60">+{riskData.reasons.length - 2} 更多...</li>
                            )}
                          </ul>
                        )}
                        {!isSafe && riskData.strategies.length > 0 && (
                          <div className="pt-1 border-t border-current/10 opacity-80">
                            <span className="font-medium">策略: </span>
                            {riskData.strategies[0]}
                          </div>
                        )}
                      </div>
                    );
                  })()}

                  {/* 版本目标数量 */}
                  {(() => {
                    const goals = parseGoals(ver.goals);
                    if (goals.length === 0) return null;
                    const converted = goals.filter(g => g.requirement_id).length;
                    return (
                      <div className="flex items-center justify-between text-xs text-muted-foreground">
                        <span className="flex items-center gap-1"><Sparkles className="h-3 w-3" />版本目标</span>
                        <span>{converted}/{goals.length} 已转为需求</span>
                      </div>
                    );
                  })()}

                  {/* 所属项目 */}
                  {ver.project_id && (
                    <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                      <FolderOpen className="h-3 w-3 text-emerald-500" />
                      <span className="text-emerald-600 dark:text-emerald-400">{projectMap.get(ver.project_id) || ver.project_id}</span>
                    </div>
                  )}

                  {/* 参与人 & 上线时间 */}
                  <div className="flex items-center gap-4 text-sm text-muted-foreground">
                    {participants.length > 0 && (
                        <span className="flex items-center gap-1.5">
                          <UsersRound className="h-3.5 w-3.5" />
                        <span>{participants.join(", ")}</span>
                      </span>
                    )}
                    {ver.expected_release_date && (
                      <span className="flex items-center gap-1.5 ml-auto">
                        <Clock className="h-3.5 w-3.5" />
                        <span>{ver.expected_release_date.split("T")[0]}</span>
                      </span>
                    )}
                  </div>

                  {/* 任务进度 */}
                  {tasks.length > 0 && (
                    <div className="space-y-2">
                      <div className="flex items-center justify-between text-xs text-muted-foreground">
                        <span className="flex items-center gap-1"><ListTodo className="h-3 w-3" />任务进度</span>
                        <span>{doneCount}/{tasks.length}</span>
                      </div>
                      <div className="h-1.5 rounded-full bg-muted overflow-hidden">
                        <div
                          className="h-full rounded-full bg-primary transition-all"
                          style={{ width: `${tasks.length ? (doneCount / tasks.length * 100) : 0}%` }}
                        />
                      </div>
                    </div>
                  )}

                  {/* 操作按钮 */}
                  {nextStatuses.length > 0 && (
                    <div className="flex items-center gap-2 pt-1" onClick={(e) => e.stopPropagation()}>
                      <span className="text-[11px] text-muted-foreground">流转至:</span>
                      {nextStatuses.map((ns) => {
                        const nsConfig = VERSION_STATUS_CONFIG[ns];
                        return (
                          <button
                            key={ns}
                            onClick={(e) => { e.stopPropagation(); handleStatusUpdate(ver.id, ns); }}
                            className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] font-medium transition-colors hover:brightness-110 ${nsConfig?.color}`}
                          >
                            <nsConfig.icon className="h-3 w-3" />
                            {nsConfig?.label}
                          </button>
                        );
                      })}
                    </div>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {/* ========== 新建版本弹窗 ========== */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <GitBranch className="h-5 w-5" />
              新建版本
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label>版本名称 *</Label>
              <Input placeholder="例如: v1.0.0、Sprint-202604-W2" value={formName} onChange={(e) => setFormName(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label>所属项目</Label>
              <Select value={formProjectId} onValueChange={setFormProjectId}>
                <SelectTrigger className="h-9 text-sm">
                  <SelectValue placeholder="选择关联项目（可选）" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="_none">不关联项目</SelectItem>
                  {projects.map(p => (
                    <SelectItem key={p.id} value={p.id}>{p.title || p.id}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>预期上线时间</Label>
              <Input type="date" value={formDate} onChange={(e) => setFormDate(e.target.value)} />
            </div>

            <div className="space-y-2">
              <Label>描述（可选）</Label>
              <textarea
                className="w-full min-h-[80px] px-3 py-2 rounded-md border bg-transparent text-sm resize-none focus:outline-none focus:ring-2 focus:ring-ring"
                placeholder="版本目标、包含的主要功能等..."
                value={formDesc}
                onChange={(e) => setFormDesc(e.target.value)}
              />
            </div>

            {/* 版本目标列表 */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label>版本目标（可选，每个目标可在创建后单独转换为需求）</Label>
                <Button
                  variant="outline"
                  size="sm"
                  className="h-7 text-xs"
                  onClick={() => setFormGoals(prev => [...prev, { title: "", description: "" }])}
                >
                  <Plus className="h-3 w-3 mr-1" />
                  添加目标
                </Button>
              </div>
              {formGoals.length === 0 && (
                <p className="text-xs text-muted-foreground px-1">暂无目标。点击"添加目标"以规划本次版本交付内容。</p>
              )}
              <div className="space-y-2">
                {formGoals.map((g, idx) => (
                  <div key={idx} className="flex gap-2 items-start p-2 rounded border bg-muted/30">
                    <div className="flex-1 space-y-1.5">
                      <Input
                        placeholder={`目标 ${idx + 1} 标题（必填）`}
                        value={g.title}
                        onChange={(e) => setFormGoals(prev => prev.map((x, i) => i === idx ? { ...x, title: e.target.value } : x))}
                      />
                      <Input
                        placeholder="目标描述（可选）"
                        value={g.description}
                        onChange={(e) => setFormGoals(prev => prev.map((x, i) => i === idx ? { ...x, description: e.target.value } : x))}
                      />
                    </div>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8 shrink-0 text-muted-foreground hover:text-destructive"
                      onClick={() => setFormGoals(prev => prev.filter((_, i) => i !== idx))}
                    >
                      ✕
                    </Button>
                  </div>
                ))}
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>取消</Button>
            <Button onClick={handleCreate} disabled={!formName.trim()}>
              <Plus className="h-4 w-4 mr-1.5" />
              创建版本
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ========== 版本详情弹窗 ========== */}
      <Dialog open={detailOpen} onOpenChange={setDetailOpen}>
        <DialogContent className="sm:max-w-2xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <GitBranch className="h-5 w-5" />
              {selectedVersion?.name}
              {selectedVersion && (
                <Badge className={`${VERSION_STATUS_CONFIG[selectedVersion.status]?.color || ""}`}>
                  {VERSION_STATUS_CONFIG[selectedVersion.status]?.label || selectedVersion.status}
                </Badge>
              )}
            </DialogTitle>
          </DialogHeader>
          {selectedVersion && (
            <div className="space-y-5 py-2">
              {/* 元信息 */}
              <div className="grid grid-cols-2 gap-4 text-sm">
                <div>
                  <span className="text-muted-foreground text-xs">版本 ID</span>
                  <p className="mt-0.5 font-mono text-xs opacity-70">{selectedVersion.id}</p>
                </div>
                <div>
                  <span className="text-muted-foreground text-xs">所属项目</span>
                  <p className="mt-0.5 font-medium flex items-center gap-1">
                    {selectedVersion.project_id ? (
                      <>
                        <FolderOpen className="h-3.5 w-3.5 text-emerald-500" />
                        {projectMap.get(selectedVersion.project_id) || selectedVersion.project_id}
                      </>
                    ) : (
                      <span className="text-muted-foreground">未关联</span>
                    )}
                  </p>
                </div>
                <div>
                  <span className="text-muted-foreground text-xs">预期上线</span>
                  <p className="mt-0.5 font-medium">{selectedVersion.expected_release_date?.split("T")[0] || "未设定"}</p>
                </div>
                <div>
                  <span className="text-muted-foreground text-xs">参与人</span>
                  <p className="mt-0.5">
                    {(() => {
                      try {
                        const ps = JSON.parse(selectedVersion.participants || "[]");
                        return ps.length > 0 ? ps.join("、") : "未分配";
                      } catch { return "未分配"; }
                    })()}
                  </p>
                </div>
                <div>
                  <span className="text-muted-foreground text-xs">创建时间</span>
                  <p className="mt-0.5">{new Date(selectedVersion.created_at).toLocaleDateString()}</p>
                </div>
              </div>

              {/* 描述 */}
              {selectedVersion.description && (
                <div>
                  <span className="text-xs text-muted-foreground">版本描述</span>
                  <p className="mt-1 text-sm p-3 rounded-lg bg-muted/50">{selectedVersion.description}</p>
                </div>
              )}

              {/* 预警详情 + 策略建议 */}
              {(() => {
                const risk = selectedVersion.computed_risk || 'unknown';
                const rr = COMPUTED_RISK_CONFIG[risk] || COMPUTED_RISK_CONFIG.unknown;
                const riskData = parseRiskData(selectedVersion.risk_reasons);
                const isSafe = risk === 'safe';
                const isRefreshing = refreshingRisk === selectedVersion.id;
                return (
                  <div className={`px-3 py-2 rounded-md border text-sm space-y-2 ${risk !== 'unknown' ? rr.color : 'bg-muted/30 border-border/50'}`}>
                    <div className="flex items-center gap-1.5 font-semibold">
                      <span className={`inline-block h-2 w-2 rounded-full ${rr.dot}`} />
                      预警：{rr.label}
                      <div className="ml-auto flex items-center gap-2">
                        {selectedVersion.last_check_at && (
                          <span className="text-[11px] opacity-60 font-normal">
                            检测于 {selectedVersion.last_check_at.slice(5, 16)}
                          </span>
                        )}
                        <button
                          onClick={() => handleRefreshRisk(selectedVersion.id)}
                          disabled={isRefreshing}
                          className="p-1 rounded hover:bg-black/5 dark:hover:bg-white/10 transition-colors disabled:opacity-50"
                          title="手动刷新风险监测"
                        >
                          <RefreshCw className={`h-3.5 w-3.5 ${isRefreshing ? 'animate-spin' : ''}`} />
                        </button>
                      </div>
                    </div>
                    {/* 风险原因 */}
                    {risk !== 'unknown' && riskData.reasons.length > 0 && (
                      <ul className="space-y-0.5 pl-3.5 opacity-90 text-xs">
                        {riskData.reasons.map((r, i) => (
                          <li key={i} className="list-disc">{r}</li>
                        ))}
                      </ul>
                    )}
                    {/* 统计快照 */}
                    {risk !== 'unknown' && riskData.stats && !isSafe && (
                      <div className="flex items-center gap-3 text-[11px] opacity-75 pt-1 border-t border-current/10">
                        {riskData.stats.remaining_hours != null && (
                          <span>剩余工时: {riskData.stats.remaining_hours}h</span>
                        )}
                        {riskData.stats.estimated_finish_days != null && (
                          <span>预估需 {riskData.stats.estimated_finish_days} 工作日</span>
                        )}
                        {riskData.stats.done_rate != null && (
                          <span>完成率: {riskData.stats.done_rate}%</span>
                        )}
                      </div>
                    )}
                    {/* 策略建议 */}
                    {risk !== 'unknown' && !isSafe && riskData.strategies.length > 0 && (
                      <div className="pt-1 border-t border-current/10">
                        <div className="flex items-center gap-1 text-xs font-medium mb-1">
                          <Shield className="h-3 w-3" />
                          应对策略
                        </div>
                        <ul className="space-y-0.5 pl-3.5 text-xs opacity-90">
                          {riskData.strategies.map((s, i) => (
                            <li key={i} className="list-decimal">{s}</li>
                          ))}
                        </ul>
                      </div>
                    )}
                  </div>
                );
              })()}

              {/* 版本目标 */}
              <VersionGoalsSection
                version={selectedVersion}
                allTasks={allTasks}
                allRequirements={allRequirements}
                onAdd={(title, desc) => addGoalToVersion(selectedVersion.id, title, desc)}
                onConvert={(goalId) => convertGoalToRequirement(selectedVersion.id, goalId)}
                onDelete={(goalId) => deleteGoalFromVersion(selectedVersion.id, goalId)}
              />

              {/* 任务清单 */}
              <div>
                <span className="text-xs text-muted-foreground font-medium">版本内任务清单</span>
                <div className="mt-2 space-y-2">
                  {(() => {
                    const vt = getVersionTasks(selectedVersion);
                    if (vt.length === 0) {
                      return (
                        <div className="py-8 text-center text-sm text-muted-foreground">
                          <ListTodo className="h-8 w-8 mx-auto mb-2 opacity-30" />
                          暂无关联任务，可在需求分析中分配到此版本
                        </div>
                      );
                    }
                    return vt.map((t) => (
                      <div key={t.id} className={`flex items-center gap-3 p-3 rounded-lg border border-l-4 ${PRIORITY_COLORS[t.priority] || ""}`}>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium truncate">{t.title}</p>
                          <div className="flex items-center gap-3 mt-1 text-xs text-muted-foreground">
                            <span>TASK-{t.id}</span>
                            {t.assignee && <span>@{t.assignee}</span>}
                            <div className="flex items-center gap-1">
                              <input
                                type="number"
                                min={0}
                                step={0.5}
                                className="w-12 h-5 text-xs px-1 py-0 rounded border border-border/50 bg-transparent focus:outline-none focus:ring-1 focus:ring-ring tabular-nums"
                                defaultValue={t.estimated_hours ?? ""}
                                placeholder="-"
                                onClick={(e) => e.stopPropagation()}
                                onBlur={(e) => {
                                  const v = e.target.value === "" ? 0 : parseFloat(e.target.value);
                                  if (v !== (t.estimated_hours ?? 0)) {
                                    handleTaskUpdate(t.id, "estimated_hours", v);
                                  }
                                }}
                                onKeyDown={(e) => {
                                  if (e.key === "Enter") (e.target as HTMLInputElement).blur();
                                }}
                              />
                              <span>h</span>
                            </div>
                          </div>
                        </div>
                        <Badge variant="secondary" className="text-[10px] shrink-0">
                          {TASK_STATUS_MAP[t.status] || t.status}
                        </Badge>
                      </div>
                    ));
                  })()}
                </div>
              </div>

              {/* 底部操作栏 */}
              <div className="flex justify-end pt-3 border-t">
                <Button
                  variant="outline"
                  size="sm"
                  className="text-destructive border-destructive/30 hover:bg-destructive/10 hover:text-destructive"
                  onClick={() => handleDeleteVersion(selectedVersion.id, selectedVersion.name)}
                >
                  <Trash2 className="h-3.5 w-3.5 mr-1.5" />
                  删除版本
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ============ 需求状态配置 ============

const REQ_STATUS_MAP: Record<string, { label: string; color: string }> = {
  pending:     { label: "待开始", color: "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300" },
  draft:       { label: "草稿", color: "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300" },
  analyzed:    { label: "已分析", color: "bg-blue-100 text-blue-600 dark:bg-blue-900 dark:text-blue-300" },
  tasked:      { label: "已拆解", color: "bg-purple-100 text-purple-600 dark:bg-purple-900 dark:text-purple-300" },
  in_progress: { label: "开发中", color: "bg-amber-100 text-amber-600 dark:bg-amber-900 dark:text-amber-300" },
  done:        { label: "已完成", color: "bg-green-100 text-green-600 dark:bg-green-900 dark:text-green-300" },
};

// ============ 版本目标子组件 ============

function VersionGoalsSection({ version, allTasks, allRequirements, onAdd, onConvert, onDelete }: {
  version: Version;
  allTasks: DevTask[];
  allRequirements: Requirement[];
  onAdd: (title: string, description: string) => void;
  onConvert: (goalId: string) => void;
  onDelete: (goalId: string) => void;
}) {
  const [showAddForm, setShowAddForm] = useState(false);
  const [newTitle, setNewTitle] = useState("");
  const [newDesc, setNewDesc] = useState("");
  const [expandedGoals, setExpandedGoals] = useState<Set<string>>(new Set());
  const goals = parseGoals(version.goals);

  const handleAdd = () => {
    if (!newTitle.trim()) return;
    onAdd(newTitle, newDesc);
    setNewTitle("");
    setNewDesc("");
    setShowAddForm(false);
  };

  const toggleExpand = (goalId: string) => {
    setExpandedGoals(prev => {
      const next = new Set(prev);
      if (next.has(goalId)) next.delete(goalId); else next.add(goalId);
      return next;
    });
  };

  // 获取目标关联的需求和任务
  const getGoalProgress = (goal: VersionGoal) => {
    if (!goal.requirement_id) return null;
    const req = allRequirements.find(r => r.id === goal.requirement_id);
    if (!req) return null;
    const tasks = allTasks.filter(t => t.requirement_id === goal.requirement_id);
    const doneTasks = tasks.filter(t => t.status === "done").length;
    return { req, tasks, doneTasks, total: tasks.length };
  };

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <span className="text-xs text-muted-foreground font-medium flex items-center gap-1">
          <Target className="h-3.5 w-3.5" />
          版本目标（{goals.length}）
        </span>
        {!showAddForm && (
          <Button
            variant="outline"
            size="sm"
            className="h-7 text-xs"
            onClick={() => setShowAddForm(true)}
          >
            <Plus className="h-3 w-3 mr-1" />
            添加目标
          </Button>
        )}
      </div>

      {/* 添加新目标 —— 点击后展开 */}
      {showAddForm && (
        <div className="flex gap-2 items-start p-3 rounded-lg border border-dashed border-primary/30 bg-primary/5">
          <div className="flex-1 space-y-1.5">
            <Input
              placeholder="新目标标题"
              value={newTitle}
              onChange={(e) => setNewTitle(e.target.value)}
              className="h-8 text-sm"
              autoFocus
              onKeyDown={(e) => { if (e.key === "Enter" && newTitle.trim()) handleAdd(); if (e.key === "Escape") setShowAddForm(false); }}
            />
            <Input
              placeholder="描述（可选）"
              value={newDesc}
              onChange={(e) => setNewDesc(e.target.value)}
              className="h-8 text-sm"
              onKeyDown={(e) => { if (e.key === "Enter" && newTitle.trim()) handleAdd(); if (e.key === "Escape") setShowAddForm(false); }}
            />
          </div>
          <div className="flex flex-col gap-1">
            <Button size="sm" onClick={handleAdd} disabled={!newTitle.trim()} className="h-8 text-xs">
              <Plus className="h-3 w-3 mr-1" />
              确认
            </Button>
            <Button size="sm" variant="ghost" onClick={() => { setShowAddForm(false); setNewTitle(""); setNewDesc(""); }} className="h-8 text-xs text-muted-foreground">
              取消
            </Button>
          </div>
        </div>
      )}

      {/* 目标列表 */}
      {goals.length === 0 ? (
        <p className="text-xs text-muted-foreground px-1 py-2 text-center">暂无目标。点击"添加目标"开始规划版本交付内容。</p>
      ) : (
        <div className="space-y-2">
          {goals.map((g) => {
            const converted = !!g.requirement_id;
            const progress = getGoalProgress(g);
            const isExpanded = expandedGoals.has(g.id);

            return (
              <div key={g.id} className="rounded-lg border bg-background overflow-hidden">
                {/* 目标头部 */}
                <div
                  className="flex items-start gap-2 p-2.5 cursor-pointer hover:bg-muted/30 transition-colors"
                  onClick={() => converted && toggleExpand(g.id)}
                >
                  {/* 展开箭头 */}
                  <div className="mt-0.5 w-4 shrink-0">
                    {converted && progress && progress.total > 0 ? (
                      isExpanded ? <ChevronDown className="h-4 w-4 text-muted-foreground" /> : <ChevronRight className="h-4 w-4 text-muted-foreground" />
                    ) : (
                      <div className="h-4 w-4" />
                    )}
                  </div>

                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium">{g.title}</p>
                    {g.description && (
                      <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">{g.description}</p>
                    )}

                    {/* 进展状态 */}
                    {converted && progress ? (
                      <div className="flex items-center gap-2 mt-1.5 flex-wrap">
                        <Badge variant="outline" className={`text-[10px] ${REQ_STATUS_MAP[progress.req.computed_status || progress.req.status]?.color || ""}`}>
                          需求: {REQ_STATUS_MAP[progress.req.computed_status || progress.req.status]?.label || progress.req.computed_status || progress.req.status}
                        </Badge>
                        {progress.total > 0 && (
                          <div className="flex items-center gap-1.5">
                            <div className="w-16 h-1.5 rounded-full bg-muted overflow-hidden">
                              <div
                                className="h-full rounded-full bg-primary transition-all"
                                style={{ width: `${progress.total > 0 ? (progress.doneTasks / progress.total * 100) : 0}%` }}
                              />
                            </div>
                            <span className="text-[10px] text-muted-foreground tabular-nums">
                              {progress.doneTasks}/{progress.total} 任务
                            </span>
                          </div>
                        )}
                        {progress.total === 0 && (
                          <span className="text-[10px] text-muted-foreground">尚未拆分任务</span>
                        )}
                      </div>
                    ) : converted ? (
                      <Badge variant="outline" className="mt-1.5 text-[10px] bg-green-500/10 text-green-600 border-green-500/30">
                        已转为需求 {g.requirement_id}
                      </Badge>
                    ) : (
                      <span className="text-[10px] text-muted-foreground/60 mt-1 inline-block">未转化</span>
                    )}
                  </div>

                  {/* 操作按钮 */}
                  <div className="flex items-center gap-1 shrink-0" onClick={(e) => e.stopPropagation()}>
                    {!converted && (
                      <Button
                        size="sm"
                        variant="outline"
                        className="h-7 text-xs"
                        onClick={() => onConvert(g.id)}
                      >
                        <Sparkles className="h-3 w-3 mr-1" />
                        转为需求
                      </Button>
                    )}
                    <Button
                      size="icon"
                      variant="ghost"
                      className="h-7 w-7 text-muted-foreground hover:text-destructive"
                      onClick={() => onDelete(g.id)}
                      title={converted ? "删除目标（不会删除已生成的需求）" : "删除目标"}
                    >
                      ✕
                    </Button>
                  </div>
                </div>

                {/* 关联任务清单 —— 展开后显示 */}
                {isExpanded && converted && progress && progress.total > 0 && (
                  <div className="border-t bg-muted/10 px-3 py-2 space-y-1.5">
                    <span className="text-[10px] text-muted-foreground font-medium">关联任务</span>
                    {progress.tasks.map((t) => (
                      <div key={t.id} className={`flex items-center gap-2 px-2 py-1.5 rounded border-l-2 text-xs ${
                        t.priority === "high" ? "border-l-red-500" : t.priority === "medium" ? "border-l-yellow-500" : "border-l-green-500"
                      } bg-background`}>
                        <span className="flex-1 truncate">{t.title}</span>
                        {t.assignee && <span className="text-muted-foreground shrink-0">@{t.assignee}</span>}
                        {t.estimated_hours != null && <span className="text-muted-foreground shrink-0 tabular-nums">{t.estimated_hours}h</span>}
                        <Badge variant="secondary" className="text-[9px] shrink-0">
                          {TASK_STATUS_MAP[t.status] || t.status}
                        </Badge>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// 模拟数据（当后端 API 不存在时使用）
function getMockVersions(): Version[] {
  const base = {
    goals: '[]',
    computed_risk: 'unknown',
    risk_reasons: '[]',
    last_check_at: null,
  };
  return [
    {
      ...base,
      id: "V-202604-V1",
      name: "v1.0.0 - 核心功能版",
      status: "in_progress",
      risk_level: "medium",
      participants: JSON.stringify(["张三", "李四"]),
      expected_release_date: "2026-05-01",
      description: "首版本，包含用户注册登录、基础功能模块",
      task_ids: '["DT-20260416-001", "DT-20260416-002"]',
      project_id: null,
      created_at: "2026-04-01T00:00:00",
      updated_at: "2026-04-16T00:00:00",
    },
    {
      ...base,
      id: "V-202604-V2",
      name: "v1.1.0 - 社交功能版",
      status: "pending_confirm",
      risk_level: "high",
      participants: JSON.stringify(["王五"]),
      expected_release_date: "2026-06-01",
      description: "社交互动相关功能",
      task_ids: '["DT-20260416-003"]',
      project_id: null,
      created_at: "2026-04-10T00:00:00",
      updated_at: "2026-04-16T00:00:00",
    },
    {
      ...base,
      id: "V-202604-V3",
      name: "v0.9.0 - 内测预热版",
      status: "released",
      risk_level: "low",
      participants: JSON.stringify(["赵六"]),
      expected_release_date: "2026-03-15",
      description: "小规模内测版本",
      task_ids: "[]",
      project_id: null,
      created_at: "2026-02-20T00:00:00",
      updated_at: "2026-03-15T00:00:00",
    },
  ];
}
