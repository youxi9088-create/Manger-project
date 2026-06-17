"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  Bot, MessageSquare, Shield, Zap, Star, Plus, X, RefreshCw,
  Loader2, CheckCircle2, Clock, AlertCircle, Brain, Cpu,
} from "lucide-react";

const API_BASE = "http://localhost:3001";

// ============ 类型 ============

interface Employee {
  id: string;
  name: string;
  rank: string | null;
  skills: string | null;
  status: string | null;
  avatar_url: string | null;
  agent_type: string | null;
}

interface AgentRole {
  role_id: string;
  display_name: string;
  description: string;
  capabilities: string[];
  tools: string[];
}

interface AgentRuntimeStatus {
  main: {
    status: "idle" | "chatting" | "waiting_exec";
    total_chats: number;
    last_active: string | null;
  };
  exec: {
    status: "idle" | "running" | "completed" | "failed";
    current_task: { id: string; description: string; started_at: string } | null;
    total_tasks: number;
    success_rate: number;
    last_completed: string | null;
  };
}

interface AgentTask {
  id: string;
  session_id: string | null;
  description: string;
  status: string;
  agent_type: string;
  iterations: number | null;
  created_at: string;
  completed_at: string | null;
}

interface AgentKanbanData {
  running: AgentTask[];
  completed: AgentTask[];
  pending: AgentTask[];
}

// ============ Capability 中文映射 ============

const CAP_LABELS: Record<string, string> = {
  intent_understanding: "意图理解",
  tool_orchestration: "工具编排",
  result_synthesis: "结果汇总",
  task_dispatch: "任务派发",
  multi_step_execution: "多步骤执行",
  tool_chaining: "工具链式调用",
  autonomous_decision: "自主决策",
  progress_reporting: "进度回传",
  project_initiation: "项目立项",
  version_management: "版本管理",
  requirement_analysis: "需求分析",
  risk_assessment: "风险评估",
  code_development: "代码开发",
  tech_design: "技术方案",
  bug_fix: "Bug修复",
  code_review: "代码审查",
  unit_test: "单元测试",
};
function capLabel(k: string): string { return CAP_LABELS[k] || k; }

// ============ 主组件 ============

export default function AgentsPage() {
  const router = useRouter();
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [agentRoles, setAgentRoles] = useState<AgentRole[]>([]);
  const [runtimeStatus, setRuntimeStatus] = useState<AgentRuntimeStatus | null>(null);
  const [kanban, setKanban] = useState<AgentKanbanData>({ running: [], completed: [], pending: [] });
  const [loading, setLoading] = useState(true);

  // 弹窗状态
  const [dialogEmpId, setDialogEmpId] = useState<string | null>(null);
  const [dialogMode, setDialogMode] = useState<"enable" | "view" | null>(null);
  const [selectedRoleId, setSelectedRoleId] = useState<string>("");
  const [dialogLoading, setDialogLoading] = useState(false);

  const fetchData = useCallback(async () => {
    try {
      setLoading(true);
      const [empRes, rolesRes, runtimeRes, kanbanRes] = await Promise.all([
        fetch(`${API_BASE}/api/employees`),
        fetch(`${API_BASE}/api/agent-roles`),
        fetch(`${API_BASE}/api/agent/runtime-status`),
        fetch(`${API_BASE}/api/agent/tasks/kanban`),
      ]);
      const empJson = await empRes.json();
      const rolesJson = await rolesRes.json();
      const runtimeJson = await runtimeRes.json();
      const kanbanJson = await kanbanRes.json();
      if (empJson.success) setEmployees(empJson.data || []);
      if (rolesJson.success) setAgentRoles(rolesJson.data || []);
      if (runtimeJson.success) setRuntimeStatus(runtimeJson.data);
      if (kanbanJson.success) setKanban(kanbanJson.data);
    } catch (err) {
      console.error("加载 Agent 数据失败:", err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  // 筛选出所有已启用 Agent 的员工（Agent）
  const agents = employees.filter(e => !!e.agent_type);
  // 未启用 Agent 的员工（可以启用）
  const normalEmployees = employees.filter(e => !e.agent_type);

  // ============ Agent 操作 ============

  const openEnableDialog = () => {
    setDialogMode("enable");
    setDialogEmpId(null);
    setSelectedRoleId("");
  };

  const openViewDialog = (empId: string) => {
    setDialogEmpId(empId);
    setDialogMode("view");
    // 刷新运行时
    fetch(`${API_BASE}/api/agent/runtime-status`)
      .then(r => r.json())
      .then(j => j.success && setRuntimeStatus(j.data))
      .catch(() => {});
  };

  const closeDialog = () => {
    setDialogEmpId(null);
    setDialogMode(null);
    setSelectedRoleId("");
  };

  const handleEnableAgent = async () => {
    if (!dialogEmpId || !selectedRoleId) return;
    setDialogLoading(true);
    try {
      const res = await fetch(`${API_BASE}/api/employees/${dialogEmpId}/enable-agent`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ role_id: selectedRoleId }),
      });
      const json = await res.json();
      if (json.success) {
        closeDialog();
        fetchData();
      } else {
        alert(json.error || "启用失败");
      }
    } catch (err) {
      console.error(err);
      alert("启用失败");
    } finally {
      setDialogLoading(false);
    }
  };

  const handleDisableAgent = async (empId: string) => {
    if (!confirm("确定要禁用该 Agent 吗？（员工记录会保留，仅移除 Agent 属性）")) return;
    try {
      const res = await fetch(`${API_BASE}/api/employees/${empId}/disable-agent`, { method: "POST" });
      const json = await res.json();
      if (json.success) {
        closeDialog();
        fetchData();
      } else {
        alert(json.error || "禁用失败");
      }
    } catch (err) {
      console.error(err);
    }
  };

  // 当前被查看的 Agent
  const selectedAgent = dialogMode === "view" ? agents.find(e => e.id === dialogEmpId) : null;

  // ============ 渲染 ============

  function formatRelativeTime(isoStr: string | null): string {
    if (!isoStr) return "--";
    const diff = (Date.now() - new Date(isoStr).getTime()) / 60000;
    if (diff < 1) return "刚刚";
    if (diff < 60) return `${Math.round(diff)}分钟前`;
    if (diff < 1440) return `${Math.round(diff / 60)}小时前`;
    return `${Math.round(diff / 1440)}天前`;
  }

  // ============ Agent 卡片 ============
  const renderAgentCard = (emp: Employee) => {
    const role = agentRoles.find(r => r.role_id === emp.agent_type);
    const isMain = emp.agent_type === "main";
    const isExec = emp.agent_type === "exec";
    const runtimeKey = isMain ? "main" : isExec ? "exec" : null;
    const runtime = runtimeKey ? runtimeStatus?.[runtimeKey] : null;

    const accent = isMain ? "sky" : isExec ? "amber" : "violet";
    const accentClass = {
      sky: { bg: "bg-sky-500/5", border: "border-sky-500/25", text: "text-sky-400", badge: "bg-sky-500/15 text-sky-400 border-sky-500/25", iconBg: "bg-sky-500/10" },
      amber: { bg: "bg-amber-500/5", border: "border-amber-500/25", text: "text-amber-400", badge: "bg-amber-500/15 text-amber-400 border-amber-500/25", iconBg: "bg-amber-500/10" },
      violet: { bg: "bg-violet-500/5", border: "border-violet-500/25", text: "text-violet-400", badge: "bg-violet-500/15 text-violet-400 border-violet-500/25", iconBg: "bg-violet-500/10" },
    }[accent];

    const statusLabel = runtime
      ? (runtimeKey === "main"
        ? { idle: "空闲", chatting: "对话中", waiting_exec: "等待执行" }[(runtime as NonNullable<typeof runtimeStatus>["main"]).status] || "空闲"
        : { idle: "空闲", running: "执行中", completed: "已完成", failed: "失败" }[(runtime as NonNullable<typeof runtimeStatus>["exec"]).status] || "空闲")
      : "未知";

    const isRunning = runtimeKey === "exec" && runtimeStatus?.exec.status === "running";
    const typeLabel = isMain ? "🧠 PM Agent" : isExec ? "⚡ Exec Agent" : emp.agent_type;

    return (
      <Card
        key={emp.id}
        className={`group hover:shadow-md transition-all cursor-pointer border ${accentClass.border}`}
        onClick={() => openViewDialog(emp.id)}
      >
        <CardContent className="p-4 space-y-3">
          {/* 头部：头像 + 名称 + Agent 类型 */}
          <div className="flex items-center gap-3">
            <div className={`h-12 w-12 rounded-xl ${accentClass.iconBg} border ${accentClass.border} flex items-center justify-center shrink-0 overflow-hidden`}>
              {emp.avatar_url ? (
                <img src={emp.avatar_url} alt="" className="h-full w-full object-cover" />
              ) : (
                <Bot className={`h-6 w-6 ${accentClass.text}`} />
              )}
            </div>
            <div className="flex-1 min-w-0">
              <p className="font-semibold text-sm truncate">{emp.name}</p>
              <p className={`text-xs font-mono ${accentClass.text} truncate`}>{typeLabel}</p>
            </div>
            <Badge className={`${accentClass.badge} ${isRunning ? "animate-pulse" : ""} shrink-0 text-[10px]`}>
              {isRunning ? "⚡ " : ""}{statusLabel}
            </Badge>
          </div>

          {/* 运行时统计 */}
          {runtime && (
            <div className="grid grid-cols-2 gap-2">
              {runtimeKey === "main" ? (
                <>
                  <div className="rounded-lg border border-border/40 p-2 text-center">
                    <p className="text-xl font-bold tabular-nums">{(runtime as NonNullable<typeof runtimeStatus>["main"]).total_chats}</p>
                    <p className="text-[10px] text-muted-foreground mt-0.5">历史对话</p>
                  </div>
                  <div className="rounded-lg border border-border/40 p-2 text-center">
                    <p className="text-[11px] font-mono text-muted-foreground">
                      {formatRelativeTime((runtime as NonNullable<typeof runtimeStatus>["main"]).last_active)}
                    </p>
                    <p className="text-[10px] text-muted-foreground mt-0.5">最近活跃</p>
                  </div>
                </>
              ) : (
                <>
                  <div className="rounded-lg border border-border/40 p-2 text-center">
                    <p className="text-xl font-bold tabular-nums">{(runtime as NonNullable<typeof runtimeStatus>["exec"]).total_tasks}</p>
                    <p className="text-[10px] text-muted-foreground mt-0.5">历史执行</p>
                  </div>
                  <div className="rounded-lg border border-border/40 p-2 text-center">
                    <p className="text-xl font-bold tabular-nums text-emerald-400">
                      {(runtime as NonNullable<typeof runtimeStatus>["exec"]).success_rate}%
                    </p>
                    <p className="text-[10px] text-muted-foreground mt-0.5">成功率</p>
                  </div>
                </>
              )}
            </div>
          )}

          {/* 当前执行任务 */}
          {isExec && runtimeStatus?.exec.current_task && (
            <div className={`rounded-lg border ${accentClass.border} ${accentClass.bg} p-2 space-y-0.5`}>
              <p className={`text-[10px] font-medium ${accentClass.text}`}>⚡ 正在执行</p>
              <p className="text-xs truncate">{runtimeStatus.exec.current_task.description}</p>
            </div>
          )}

          {/* 能力标签 */}
          {role?.capabilities && role.capabilities.length > 0 && (
            <div className="flex flex-wrap gap-1">
              {role.capabilities.slice(0, 4).map(c => (
                <span
                  key={c}
                  className={`inline-flex items-center gap-0.5 text-[10px] px-1.5 py-0.5 rounded-full border ${accentClass.badge}`}
                >
                  <Shield className="h-2.5 w-2.5" />
                  {capLabel(c)}
                </span>
              ))}
              {role.capabilities.length > 4 && (
                <span className="text-[10px] text-muted-foreground px-1 py-0.5">+{role.capabilities.length - 4}</span>
              )}
            </div>
          )}

          {/* 操作按钮 */}
          <div className="flex items-center gap-2 pt-1" onClick={(e) => e.stopPropagation()}>
            <Button
              size="sm"
              variant="outline"
              className="h-7 text-xs flex-1"
              onClick={() => router.push(`/tools/agent?employeeId=${emp.id}`)}
            >
              <MessageSquare className="h-3 w-3 mr-1" />
              对话
            </Button>
            <Button
              size="sm"
              variant="outline"
              className="h-7 text-xs flex-1"
              onClick={() => openViewDialog(emp.id)}
            >
              详情
            </Button>
          </div>
        </CardContent>
      </Card>
    );
  };

  // ============ Agent 任务面板 ============
  const renderTaskPanel = () => {
    const total = kanban.running.length + kanban.completed.length + kanban.pending.length;
    return (
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="text-base flex items-center gap-2">
              <Bot className="h-4 w-4 text-sky-400" />
              Agent 任务面板
              {total > 0 && <span className="text-xs font-normal text-muted-foreground">共 {total} 条</span>}
            </CardTitle>
            <Button size="sm" variant="outline" onClick={fetchData} disabled={loading}>
              <RefreshCw className={`h-3.5 w-3.5 mr-1 ${loading ? "animate-spin" : ""}`} />
              刷新
            </Button>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* 正在执行 */}
          <div>
            <div className="flex items-center gap-2 mb-2">
              <Loader2 className="h-3.5 w-3.5 text-amber-400 animate-spin" />
              <span className="text-xs font-medium text-amber-400">正在执行（{kanban.running.length}）</span>
            </div>
            {kanban.running.length === 0 ? (
              <p className="text-xs text-muted-foreground/40 pl-5">暂无正在执行的任务</p>
            ) : (
              <div className="space-y-1.5">
                {kanban.running.map(task => (
                  <div key={task.id} className="flex items-center gap-3 px-3 py-2 rounded-lg bg-amber-500/5 border border-amber-500/20">
                    <p className="flex-1 text-sm truncate">{task.description}</p>
                    <span className="shrink-0 text-[10px] px-1.5 py-0.5 rounded-full bg-amber-500/15 text-amber-400 border border-amber-500/25">
                      {task.agent_type === "exec" ? "执行Agent" : "主Agent"}
                    </span>
                    <span className="shrink-0 text-xs text-muted-foreground">{formatRelativeTime(task.created_at)}</span>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* 近期完成 */}
          <div>
            <div className="flex items-center gap-2 mb-2">
              <CheckCircle2 className="h-3.5 w-3.5 text-emerald-400" />
              <span className="text-xs font-medium text-emerald-400">近期完成（{kanban.completed.length}）</span>
            </div>
            {kanban.completed.length === 0 ? (
              <p className="text-xs text-muted-foreground/40 pl-5">暂无完成记录</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="border-b border-border/30">
                      <th className="text-left py-1.5 px-2 font-medium text-muted-foreground">任务描述</th>
                      <th className="text-left py-1.5 px-2 font-medium text-muted-foreground">Agent</th>
                      <th className="text-left py-1.5 px-2 font-medium text-muted-foreground">状态</th>
                      <th className="text-left py-1.5 px-2 font-medium text-muted-foreground">工具调用</th>
                      <th className="text-left py-1.5 px-2 font-medium text-muted-foreground">完成时间</th>
                    </tr>
                  </thead>
                  <tbody>
                    {kanban.completed.map(task => (
                      <tr key={task.id} className="border-b border-border/20 hover:bg-white/[0.02]">
                        <td className="py-2 px-2 max-w-[260px] truncate" title={task.description}>{task.description}</td>
                        <td className="py-2 px-2 text-muted-foreground">{task.agent_type === "exec" ? "执行Agent" : "主Agent"}</td>
                        <td className="py-2 px-2">
                          {task.status === "completed" ? (
                            <span className="inline-flex items-center gap-0.5 text-emerald-400">
                              <CheckCircle2 className="h-3 w-3" /> 成功
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-0.5 text-red-400">
                              <AlertCircle className="h-3 w-3" /> 失败
                            </span>
                          )}
                        </td>
                        <td className="py-2 px-2 text-muted-foreground">{task.iterations ?? 0} 次</td>
                        <td className="py-2 px-2 text-muted-foreground">{formatRelativeTime(task.completed_at)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {/* 待执行 */}
          <div>
            <div className="flex items-center gap-2 mb-2">
              <Clock className="h-3.5 w-3.5 text-blue-400" />
              <span className="text-xs font-medium text-blue-400">待执行（{kanban.pending.length}）</span>
            </div>
            {kanban.pending.length === 0 ? (
              <p className="text-xs text-muted-foreground/40 pl-5">暂无排队任务</p>
            ) : (
              <div className="space-y-1.5">
                {kanban.pending.map(task => (
                  <div key={task.id} className="flex items-center gap-3 px-3 py-2 rounded-lg bg-blue-500/5 border border-blue-500/20">
                    <p className="flex-1 text-sm truncate text-muted-foreground">{task.description}</p>
                    <span className="shrink-0 text-xs text-muted-foreground">等待 {formatRelativeTime(task.created_at)}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </CardContent>
      </Card>
    );
  };

  // ============ 主渲染 ============
  return (
    <div className="space-y-5">
      {/* 头部 */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight flex items-center gap-3">
            <Bot className="h-8 w-8 text-primary" />
            Agent 列表
          </h1>
          <p className="text-muted-foreground mt-1">AI Agent 管理与监控：PM Agent（主 Agent）+ 执行 Agent</p>
        </div>
        <Button onClick={openEnableDialog} disabled={normalEmployees.length === 0}>
          <Plus className="h-4 w-4 mr-1.5" />
          启用新 Agent
        </Button>
      </div>

      {/* 概览统计 */}
      <div className="grid grid-cols-4 gap-3">
        <Card>
          <CardContent className="pt-5 pb-4">
            <div className="flex items-center justify-between">
              <Bot className="h-4 w-4 text-muted-foreground" />
              <span className="text-2xl font-bold tabular-nums">{agents.length}</span>
            </div>
            <p className="text-xs text-muted-foreground mt-1">Agent 总数</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-5 pb-4">
            <div className="flex items-center justify-between">
              <Brain className="h-4 w-4 text-sky-500" />
              <span className="text-2xl font-bold tabular-nums">{agents.filter(a => a.agent_type === "main").length}</span>
            </div>
            <p className="text-xs text-muted-foreground mt-1">PM Agent</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-5 pb-4">
            <div className="flex items-center justify-between">
              <Cpu className="h-4 w-4 text-amber-500" />
              <span className="text-2xl font-bold tabular-nums">{agents.filter(a => a.agent_type === "exec").length}</span>
            </div>
            <p className="text-xs text-muted-foreground mt-1">执行 Agent</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-5 pb-4">
            <div className="flex items-center justify-between">
              <Zap className="h-4 w-4 text-emerald-500" />
              <span className="text-2xl font-bold tabular-nums">{kanban.running.length}</span>
            </div>
            <p className="text-xs text-muted-foreground mt-1">正在执行</p>
          </CardContent>
        </Card>
      </div>

      {/* Agent 卡片网格 */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">已启用的 Agent</CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="text-sm text-muted-foreground text-center py-8">
              <Loader2 className="h-5 w-5 mx-auto mb-2 animate-spin" />
              加载中...
            </div>
          ) : agents.length === 0 ? (
            <div className="text-center py-10 text-muted-foreground">
              <Bot className="h-10 w-10 mx-auto mb-3 opacity-30" />
              <p className="text-sm">暂无 Agent</p>
              <p className="text-xs mt-1">点击右上角「启用新 Agent」把员工升级为 Agent</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
              {agents.map(renderAgentCard)}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Agent 任务面板 */}
      {renderTaskPanel()}

      {/* ============ 启用 Agent 弹窗 ============ */}
      <Dialog open={dialogMode === "enable"} onOpenChange={(o) => !o && closeDialog()}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Plus className="h-5 w-5" />
              启用新 Agent
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 pt-2">
            {/* 选员工 */}
            <div className="space-y-2">
              <Label>选择员工</Label>
              <div className="max-h-[200px] overflow-y-auto space-y-1 border rounded-lg p-2">
                {normalEmployees.length === 0 ? (
                  <p className="text-xs text-muted-foreground text-center py-4">所有员工都已启用 Agent</p>
                ) : normalEmployees.map(emp => (
                  <button
                    key={emp.id}
                    className={`w-full flex items-center gap-3 p-2 rounded-lg text-left transition-colors ${
                      dialogEmpId === emp.id ? "bg-primary/10 border border-primary/30" : "hover:bg-muted/50"
                    }`}
                    onClick={() => setDialogEmpId(emp.id)}
                  >
                    <div className="h-8 w-8 rounded-full bg-muted flex items-center justify-center shrink-0 overflow-hidden">
                      {emp.avatar_url ? <img src={emp.avatar_url} alt="" className="h-full w-full object-cover" /> : <Bot className="h-4 w-4" />}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate">{emp.name}</p>
                      <p className="text-xs text-muted-foreground truncate">{emp.rank || "未设置职级"}</p>
                    </div>
                  </button>
                ))}
              </div>
            </div>

            {/* 选 Agent 类型 */}
            <div className="space-y-2">
              <Label>选择 Agent 类型</Label>
              <div className="space-y-2">
                {agentRoles.map(role => (
                  <button
                    key={role.role_id}
                    className={`w-full p-3 rounded-lg border text-left transition-colors ${
                      selectedRoleId === role.role_id
                        ? "border-primary bg-primary/5"
                        : "border-border hover:border-primary/50"
                    }`}
                    onClick={() => setSelectedRoleId(role.role_id)}
                  >
                    <div className="flex items-center gap-2">
                      <span className="font-semibold text-sm">
                        {role.role_id === "main" ? "🧠 PM Agent" : role.role_id === "exec" ? "⚡ Exec Agent" : role.display_name}
                      </span>
                      <Badge variant="outline" className="text-[10px]">{role.capabilities.length} 项能力</Badge>
                    </div>
                    <p className="text-xs text-muted-foreground mt-1">{role.description}</p>
                  </button>
                ))}
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <Button variant="outline" size="sm" onClick={closeDialog}>取消</Button>
              <Button size="sm" onClick={handleEnableAgent} disabled={!dialogEmpId || !selectedRoleId || dialogLoading}>
                {dialogLoading ? <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" /> : <Plus className="h-3.5 w-3.5 mr-1" />}
                启用 Agent
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* ============ 查看 Agent 详情弹窗 ============ */}
      <Dialog open={dialogMode === "view"} onOpenChange={(o) => !o && closeDialog()}>
        <DialogContent className="sm:max-w-xl">
          <DialogHeader>
            <DialogTitle>Agent 详情</DialogTitle>
          </DialogHeader>
          {selectedAgent && (() => {
            const role = agentRoles.find(r => r.role_id === selectedAgent.agent_type);
            const isMain = selectedAgent.agent_type === "main";
            const isExec = selectedAgent.agent_type === "exec";
            const runtimeKey = isMain ? "main" : isExec ? "exec" : null;
            const runtime = runtimeKey ? runtimeStatus?.[runtimeKey] : null;
            const accent = isMain ? "sky" : isExec ? "amber" : "violet";
            const ac = {
              sky: { bg: "bg-sky-500/5", border: "border-sky-500/25", text: "text-sky-400", badge: "bg-sky-500/15 text-sky-400 border-sky-500/25" },
              amber: { bg: "bg-amber-500/5", border: "border-amber-500/25", text: "text-amber-400", badge: "bg-amber-500/15 text-amber-400 border-amber-500/25" },
              violet: { bg: "bg-violet-500/5", border: "border-violet-500/25", text: "text-violet-400", badge: "bg-violet-500/15 text-violet-400 border-violet-500/25" },
            }[accent];
            const statusLabel = runtime
              ? (runtimeKey === "main"
                ? { idle: "空闲", chatting: "对话中", waiting_exec: "等待执行" }[(runtime as NonNullable<typeof runtimeStatus>["main"]).status] || "空闲"
                : { idle: "空闲", running: "执行中", completed: "已完成", failed: "失败" }[(runtime as NonNullable<typeof runtimeStatus>["exec"]).status] || "空闲")
              : "未知";

            return (
              <div className="space-y-4 pt-2">
                {/* 标识卡 */}
                <div className={`flex items-center gap-3 p-3 rounded-lg ${ac.bg} border ${ac.border}`}>
                  <div className="h-12 w-12 rounded-xl overflow-hidden border border-border/40 flex items-center justify-center shrink-0">
                    {selectedAgent.avatar_url ? <img src={selectedAgent.avatar_url} alt="" className="h-full w-full object-cover" /> : <Bot className={`h-6 w-6 ${ac.text}`} />}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-semibold text-sm">{selectedAgent.name}</p>
                    <p className={`text-xs font-mono ${ac.text}`}>
                      {isMain ? "🧠 PM Agent（主 Agent）" : isExec ? "⚡ Exec Agent（执行 Agent）" : selectedAgent.agent_type}
                    </p>
                    {selectedAgent.rank && <p className="text-xs text-muted-foreground mt-0.5">{selectedAgent.rank}</p>}
                  </div>
                  <Badge className={`${ac.badge} shrink-0`}>{statusLabel}</Badge>
                </div>

                {/* 统计 */}
                {runtime && (
                  <div className="grid grid-cols-2 gap-2">
                    {runtimeKey === "main" ? (
                      <>
                        <div className="rounded-lg border border-border/50 p-3 text-center">
                          <p className="text-2xl font-bold tabular-nums">{(runtime as NonNullable<typeof runtimeStatus>["main"]).total_chats}</p>
                          <p className="text-xs text-muted-foreground mt-0.5">历史对话</p>
                        </div>
                        <div className="rounded-lg border border-border/50 p-3 text-center">
                          <p className="text-xs text-muted-foreground mb-1">最近活跃</p>
                          <p className="text-xs font-mono">{formatRelativeTime((runtime as NonNullable<typeof runtimeStatus>["main"]).last_active)}</p>
                        </div>
                      </>
                    ) : (
                      <>
                        <div className="rounded-lg border border-border/50 p-3 text-center">
                          <p className="text-2xl font-bold tabular-nums">{(runtime as NonNullable<typeof runtimeStatus>["exec"]).total_tasks}</p>
                          <p className="text-xs text-muted-foreground mt-0.5">历史执行</p>
                        </div>
                        <div className="rounded-lg border border-border/50 p-3 text-center">
                          <p className="text-2xl font-bold tabular-nums text-emerald-400">{(runtime as NonNullable<typeof runtimeStatus>["exec"]).success_rate}%</p>
                          <p className="text-xs text-muted-foreground mt-0.5">成功率</p>
                        </div>
                      </>
                    )}
                  </div>
                )}

                {/* 当前执行任务 */}
                {isExec && runtimeStatus?.exec.current_task && (
                  <div className={`rounded-lg border ${ac.border} ${ac.bg} p-3 space-y-1`}>
                    <p className={`text-xs font-medium ${ac.text}`}>⚡ 当前执行任务</p>
                    <p className="text-sm">{runtimeStatus.exec.current_task.description}</p>
                  </div>
                )}

                {/* 能力范围 */}
                {role?.capabilities && role.capabilities.length > 0 && (
                  <div className="space-y-2">
                    <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">能力范围</p>
                    <div className="flex flex-wrap gap-1.5">
                      {role.capabilities.map(c => (
                        <span key={c} className={`inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full border ${ac.badge}`}>
                          <Shield className="h-3 w-3" />
                          {capLabel(c)}
                        </span>
                      ))}
                    </div>
                  </div>
                )}

                {/* 工具数量 */}
                {role?.tools.length ? (
                  <div className="flex items-center gap-2 text-xs text-muted-foreground">
                    <Zap className="h-3.5 w-3.5" />
                    <span>可用工具 <strong className="text-foreground">{role.tools.length}</strong> 个</span>
                    {isMain && <span className="text-sky-400/60">（含 dispatch_exec_agent）</span>}
                  </div>
                ) : null}

                {/* Skill */}
                <div className="flex items-center gap-2 text-xs text-muted-foreground/50 italic">
                  <Star className="h-3.5 w-3.5" />
                  <span>Skill 注入（Phase 2 后开放）</span>
                </div>

                {/* 底部操作 */}
                <div className="flex justify-end gap-2 pt-2 border-t">
                  <Button
                    variant="outline"
                    size="sm"
                    className="text-destructive border-destructive/30 hover:bg-destructive/10"
                    onClick={() => handleDisableAgent(selectedAgent.id)}
                  >
                    <X className="h-3.5 w-3.5 mr-1" />
                    禁用 Agent
                  </Button>
                  <Button
                    size="sm"
                    onClick={() => router.push(`/tools/agent?employeeId=${selectedAgent.id}`)}
                  >
                    <MessageSquare className="h-3.5 w-3.5 mr-1" />
                    与 Agent 对话
                  </Button>
                </div>
              </div>
            );
          })()}
        </DialogContent>
      </Dialog>
    </div>
  );
}
