"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import {
  Loader2, Sparkles, Save, ListTree, Plus, Trash2,
  ArrowRight, ChevronRight, CheckCircle, Circle, Clock, TestTube,
  FileSearch, ClipboardList, AlertTriangle, Target, Ban, User, FolderOpen,
} from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

const API_BASE = process.env.NEXT_PUBLIC_SERVER_API || (process.env.NODE_ENV === "production" ? "/a/openclaw" : "http://localhost:3001");

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

interface AiAnalysis {
  title?: string;
  summary?: string;
  features?: { name: string; description: string; priority: string }[];
  user_stories?: string[];
  tech_points?: Record<string, string>;
  risks?: { description: string; mitigation: string }[];
}

const TASK_STATUS = {
  todo: { label: "待开发", icon: Circle, color: "text-muted-foreground" },
  in_progress: { label: "开发中", icon: Clock, color: "text-blue-500" },
  testing: { label: "测试中", icon: TestTube, color: "text-orange-500" },
  done: { label: "已完成", icon: CheckCircle, color: "text-green-500" },
};

const TASK_STATUS_ORDER = ["todo", "in_progress", "testing", "done"] as const;

const CATEGORY_LABELS: Record<string, { label: string; color: string }> = {
  frontend: { label: "前端/UI", color: "bg-blue-500/20 text-blue-400" },
  backend: { label: "后端/C++", color: "bg-green-500/20 text-green-400" },
  design: { label: "美术/特效", color: "bg-pink-500/20 text-pink-400" },
  interaction: { label: "交互系统", color: "bg-yellow-500/20 text-yellow-400" },
  rendering: { label: "渲染优化", color: "bg-orange-500/20 text-orange-400" },
  test: { label: "测试", color: "bg-cyan-500/20 text-cyan-400" },
  other: { label: "其他", color: "bg-muted text-muted-foreground" },
};

const PRIORITY_COLORS: Record<string, string> = {
  high: "border-l-red-500",
  medium: "border-l-yellow-500",
  low: "border-l-green-500",
};

type SubPage = "input" | "analysis" | "tasks";

interface Props {
  requirementId: string;
  onBack?: () => void;
}

export function RequirementDetail({ requirementId, onBack }: Props) {
  const [rawInput, setRawInput] = useState("");
  const [title, setTitle] = useState("");
  const [status, setStatus] = useState("draft");
  const [projectId, setProjectId] = useState<string>("");
  const [projects, setProjects] = useState<{ id: string; title: string | null }[]>([]);
  const [analysis, setAnalysis] = useState<AiAnalysis | null>(null);
  const [tasks, setTasks] = useState<DevTask[]>([]);
  const [saving, setSaving] = useState(false);
  const [analyzing, setAnalyzing] = useState(false);
  const [generatingTasks, setGeneratingTasks] = useState(false);
  const [logMsg, setLogMsg] = useState("");
  const [activePage, setActivePage] = useState<SubPage>("input");
  // 执行人确认弹窗
  const [assigneeConfirm, setAssigneeConfirm] = useState<{ taskId: string; taskTitle: string; employeeName: string; estimatedHours?: number | null } | null>(null);
  const [startingWork, setStartingWork] = useState(false);
  // 追踪每个任务上次确认过的执行人，避免重复弹窗
  const confirmedAssigneesRef = useRef<Record<string, string>>({});

  const loadData = useCallback(async () => {
    try {
      const [reqRes, taskRes, projRes] = await Promise.all([
        fetch(`${API_BASE}/api/requirements/${requirementId}`),
        fetch(`${API_BASE}/api/dev-tasks?requirement_id=${requirementId}`),
        fetch(`${API_BASE}/api/projects`),
      ]);
      const reqJson = await reqRes.json();
      const taskJson = await taskRes.json();
      const projJson = await projRes.json();
      if (reqJson.success && reqJson.data) {
        const d = reqJson.data;
        setRawInput(d.raw_input || "");
        setTitle(d.title || "");
        setStatus(d.computed_status || d.status);
        setProjectId(d.project_id || "");
        if (d.ai_analysis) {
          try { setAnalysis(JSON.parse(d.ai_analysis)); } catch { /* skip */ }
        }
      }
      if (taskJson.success) setTasks(taskJson.data);
      if (projJson.success) setProjects(projJson.data || []);
    } catch (err) { console.error("加载失败:", err); }
  }, [requirementId]);

  useEffect(() => { loadData(); }, [loadData]);

  const handleSave = async () => {
    setSaving(true);
    try {
      await fetch(`${API_BASE}/api/requirements/${requirementId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ raw_input: rawInput, title, project_id: projectId && projectId !== "_none" ? projectId : null }),
      });
    } catch (err) { console.error("保存失败:", err); }
    finally { setSaving(false); }
  };

  const readSSE = async (url: string, onDone: (result: any) => void) => { // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const res = await fetch(url, { method: "POST" });
    const reader = res.body?.getReader();
    if (!reader) return;
    const decoder = new TextDecoder();
    let buffer = "";
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n"); buffer = lines.pop() || "";
      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed.startsWith("data: ")) continue;
        try {
          const data = JSON.parse(trimmed.slice(6));
          if (data.type === "log") setLogMsg(data.message);
          else if (data.type === "chunk") setLogMsg("AI 正在生成...");
          else if (data.type === "done") { setLogMsg("完成"); onDone(data.result); }
          else if (data.type === "error") setLogMsg(`错误: ${data.message}`);
        } catch { /* skip */ }
      }
    }
  };

  const handleAnalyze = async () => {
    if (!rawInput.trim()) { alert("请先填写需求描述"); return; }
    await handleSave();
    setAnalyzing(true); setLogMsg("");
    try {
      await readSSE(`${API_BASE}/api/requirements/${requirementId}/analyze`, (result) => {
        if (result) { setAnalysis(result); setTitle(result.title || title); setStatus("analyzed"); setActivePage("analysis"); }
      });
    } catch (err: any) { setLogMsg(`失败: ${err?.message}`); } // eslint-disable-next-line @typescript-eslint/no-explicit-any
    finally { setAnalyzing(false); loadData(); }
  };

  const handleGenerateTasks = async () => {
    setGeneratingTasks(true); setLogMsg("");
    try {
      await readSSE(`${API_BASE}/api/requirements/${requirementId}/generate-tasks`, (result) => {
        if (result?.tasks) { setTasks(result.tasks); setStatus("tasked"); setActivePage("tasks"); }
      });
    } catch (err: any) { setLogMsg(`失败: ${err?.message}`); } // eslint-disable-next-line @typescript-eslint/no-explicit-any
    finally { setGeneratingTasks(false); loadData(); }
  };

  const handleTaskStatusChange = async (taskId: string, newStatus: string) => {
    try {
      await fetch(`${API_BASE}/api/dev-tasks/${taskId}`, {
        method: "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: newStatus }),
      });
      setTasks((prev) => prev.map((t) => t.id === taskId ? { ...t, status: newStatus } : t));
    } catch (err) { console.error("更新失败:", err); }
  };

  const handleDeleteTask = async (taskId: string) => {
    try {
      await fetch(`${API_BASE}/api/dev-tasks/${taskId}`, { method: "DELETE" });
      setTasks((prev) => prev.filter((t) => t.id !== taskId));
    } catch (err) { console.error("删除失败:", err); }
  };

  // 安全的 JSON 解析
  const safeJson = async (res: Response): Promise<any> => { // eslint-disable-line @typescript-eslint/no-explicit-any
    const ct = res.headers.get('content-type') || '';
    if (!ct.includes('application/json')) throw new Error(`API 返回非 JSON (${res.status}, ${ct})`);
    return res.json();
  };

  const handleTaskUpdate = async (taskId: string, field: string, value: string | number) => {
    try {
      const url = `${API_BASE}/api/dev-tasks/${taskId}`;
      const res = await fetch(url, {
        method: "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ [field]: value }),
      });
      if (!res.ok) { console.error(`[handleTaskUpdate] API ${res.status}`); return; }
      setTasks(prev => prev.map(t => t.id === taskId ? { ...t, [field]: value } : t));
    } catch (err) { console.error("更新失败:", err); }
  };

  // 清除执行人时，自动结束该员工的 active 工作周期
  const handleEndWorkForEmployee = async (employeeName: string) => {
    try {
      const empRes = await fetch(`${API_BASE}/api/employees`);
      const empData = await safeJson(empRes);
      const employee = (empData.data || []).find((e: { name: string }) => e.name === employeeName);
      if (!employee) return;
      await fetch(`${API_BASE}/api/employees/${employee.id}/complete-work`, { method: "POST" });
    } catch (err) { console.error("结束工作失败:", err); }
  };

  // 检查员工是否在工作区（有 active work_cycle）
  const checkIfEmployeeBusy = async (employeeName: string): Promise<boolean> => {
    try {
      const empRes = await fetch(`${API_BASE}/api/employees`);
      const empData = await safeJson(empRes);
      const employee = (empData.data || []).find((e: { name: string }) => e.name === employeeName);
      if (!employee) return false;
      const cycleRes = await fetch(`${API_BASE}/api/work-cycles/active`);
      const cycleData = await safeJson(cycleRes);
      return (cycleData.data || []).some((c: { employee_id: string }) => c.employee_id === employee.id);
    } catch { return false; }
  };

  // 分配任务给执行人（智能判断：Agent自动执行 / 在工作区则排队 / 否则弹窗确认）
  const handleAssignTask = async (taskId: string, taskTitle: string, employeeName: string, estimatedHours?: number | null) => {
    await handleTaskUpdate(taskId, "assignee", employeeName);

    // 查员工信息（含 agent_type）
    const empRes = await fetch(`${API_BASE}/api/employees`);
    const empData = await safeJson(empRes);
    const employee = (empData.data || []).find((e: { name: string }) => e.name === employeeName);
    if (!employee) { alert("未找到该员工"); return; }

    // 检测是否是 Agent 员工
    if (employee.agent_type) {
      // Agent 模式：直接创建 work_cycle 并触发执行，不弹窗
      const hours = estimatedHours ?? undefined;
      const startRes = await fetch(`${API_BASE}/api/employees/${employee.id}/start-work`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ task_id: taskId, task_title: taskTitle, estimated_hours: hours }),
      });
      if (!startRes.ok) return;
      confirmedAssigneesRef.current[taskId] = employeeName;
      alert(`🤌 ${employeeName}(AI Agent) 已接取任务「${taskTitle}」，正在执行中...`);
      return;
    }

    // 普通员工逻辑：检查是否已在工作区
    const isBusy = await checkIfEmployeeBusy(employeeName);

    if (isBusy) {
      // 员工忙碌 → 直接调 start-work（后端会自动 queued），提示用户
      const res = await fetch(`${API_BASE}/api/employees/${employee.id}/start-work`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ task_id: taskId, task_title: taskTitle, estimated_hours: estimatedHours }),
      });
      if (!res.ok) return;
      const result = await safeJson(res);
      confirmedAssigneesRef.current[taskId] = employeeName;
      alert(result.queued ? `${employeeName} 当前工作中，任务已排队，完成后自动继续` : `${employeeName} 任务已安排`);
    } else {
      // 员工空闲 → 弹窗确认移入工作区
      setAssigneeConfirm({ taskId, taskTitle, employeeName, estimatedHours });
    }
  };
  const handleConfirmStartWork = async () => {
    if (!assigneeConfirm) return;
    setStartingWork(true);
    try {
      // 查找员工 ID
      const empRes = await fetch(`${API_BASE}/api/employees`);
      if (!empRes.ok) { alert(`获取员工列表失败 (${empRes.status})`); return; }
      const empData = await safeJson(empRes);
      const employee = (empData.data || []).find((e: { name: string }) => e.name === assigneeConfirm.employeeName);
      if (!employee) { alert("未找到该员工，请先在员工看板创建"); return; }

      const cycleRes = await fetch(`${API_BASE}/api/employees/${employee.id}/start-work`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          task_id: assigneeConfirm.taskId,
          task_title: assigneeConfirm.taskTitle,
          estimated_hours: assigneeConfirm.estimatedHours,
        }),
      });
      if (!cycleRes.ok) { alert(`启动工作失败 (${cycleRes.status})`); return; }
      const result = await safeJson(cycleRes);
      if (result.success) {
        confirmedAssigneesRef.current[assigneeConfirm.taskId] = assigneeConfirm.employeeName;
        if (result.queued) {
          alert(`${assigneeConfirm.employeeName} 当前忙碌中，任务已加入排队（待执行），完成当前任务后自动继续`);
        }
      } else {
        alert(result.error || "启动工作失败");
      }
    } catch (err: any) { // eslint-disable-line @typescript-eslint/no-explicit-any
      alert(`操作失败: ${err?.message}`);
    } finally {
      setStartingWork(false);
      setAssigneeConfirm(null);
    }
  };

  const getNextStatus = (current: string): string | null => {
    const idx = TASK_STATUS_ORDER.indexOf(current as any); // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return idx >= 0 && idx < TASK_STATUS_ORDER.length - 1 ? TASK_STATUS_ORDER[idx + 1] : null;
  };
  const getPrevStatus = (current: string): string | null => {
    const idx = TASK_STATUS_ORDER.indexOf(current as any); // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return idx > 0 ? TASK_STATUS_ORDER[idx - 1] : null;
  };

  const doneCount = tasks.filter((t) => t.status === "done").length;
  const totalHours = tasks.reduce((sum, t) => sum + (t.estimated_hours || 0), 0);

  // 子导航配置
  const navItems: { key: SubPage; label: string; icon: any; badge?: string }[] = [ // eslint-disable-next-line @typescript-eslint/no-explicit-any
    { key: "input", label: "需求输入", icon: FileSearch },
    { key: "analysis", label: "AI 需求分析结果", icon: Sparkles, badge: analysis ? "✓" : undefined },
    { key: "tasks", label: `开发任务 (${doneCount}/${tasks.length})`, icon: ClipboardList, badge: tasks.length > 0 ? `${Math.round((doneCount / tasks.length) * 100)}%` : undefined },
  ];

  return (
    <div className="space-y-4">
      {/* 头部 */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <code className="text-sm font-mono bg-muted px-3 py-1 rounded-md">{requirementId}</code>
          <Badge variant={status === "tasked" || status === "in_progress" || status === "done" ? "default" : "secondary"}>
            {{ pending: "待开始", draft: "草稿", analyzed: "已分析", tasked: "已拆解", in_progress: "开发中", done: "已完成" }[status] || status}
          </Badge>
          {title && <span className="text-sm text-muted-foreground truncate max-w-[300px]">{title}</span>}
        </div>
      </div>

      {/* 左侧子导航 + 右侧内容 */}
      <div className="flex gap-4">
        {/* 左侧子导航 */}
        <div className="w-56 shrink-0 space-y-1">
          {navItems.map((item) => {
            const Icon = item.icon;
            const isActive = activePage === item.key;
            return (
              <button
                key={item.key}
                onClick={() => setActivePage(item.key)}
                className={`w-full flex items-center gap-2.5 px-3 py-2.5 rounded-lg text-sm transition-colors text-left ${
                  isActive
                    ? "bg-accent text-foreground font-medium"
                    : "text-muted-foreground hover:bg-accent/50 hover:text-foreground"
                }`}
              >
                <Icon className="h-4 w-4 shrink-0" />
                <span className="flex-1 truncate">{item.label}</span>
                {item.badge && (
                  <span className={`text-[10px] px-1.5 py-0.5 rounded ${
                    item.badge === "✓" ? "bg-green-500/20 text-green-400" : "bg-muted text-muted-foreground"
                  }`}>{item.badge}</span>
                )}
              </button>
            );
          })}

          {/* 快捷操作 */}
          <Separator className="my-3" />
          <div className="space-y-1.5 px-1">
            {logMsg && <p className="text-[10px] text-muted-foreground px-2 break-all">{logMsg}</p>}
          </div>
        </div>

        {/* 右侧内容区 */}
        <div className="flex-1 min-w-0">
          {/* 需求输入 */}
          {activePage === "input" && (
            <Card>
              <CardHeader><CardTitle className="text-base">需求输入</CardTitle></CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <Label>需求标题</Label>
                  <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="AI 将自动提炼..." />
                </div>
                <div className="space-y-2">
                  <Label>所属项目</Label>
                  <Select value={projectId || "_none"} onValueChange={(v) => setProjectId(v === "_none" ? "" : v)}>
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
                  <Label>需求描述（支持文本描述、Figma 链接、蓝湖链接等）</Label>
                  <Textarea
                    className="min-h-[160px]"
                    value={rawInput}
                    onChange={(e) => setRawInput(e.target.value)}
                    placeholder="输入一句话需求描述、粘贴 Figma/蓝湖链接、或详细描述..."
                  />
                  {rawInput && (() => {
                    const links: { type: string; url: string }[] = [];
                    const urlRegex = /https?:\/\/[^\s)]+/g;
                    let m;
                    while ((m = urlRegex.exec(rawInput)) !== null) {
                      const url = m[0];
                      if (url.includes("figma.com")) links.push({ type: "Figma", url });
                      else if (url.includes("lanhuapp.com") || url.includes("lanhu.com") || url.includes("app.lanhu.com")) links.push({ type: "蓝湖", url });
                    }
                    if (links.length === 0) return null;
                    return (
                      <div className="flex flex-wrap gap-2">
                        {links.map((l, i) => (
                          <a key={i} href={l.url} target="_blank" rel="noopener noreferrer"
                            className="inline-flex items-center gap-1 text-xs px-2 py-1 rounded-full bg-blue-500/10 text-blue-400 hover:bg-blue-500/20 transition-colors">
                            {l.type === "Figma" ? "🎨" : "📐"} {l.type} 链接 ↗
                          </a>
                        ))}
                      </div>
                    );
                  })()}
                </div>
                <div className="flex items-center gap-3">
                  <Button onClick={handleAnalyze} disabled={analyzing || !rawInput.trim()}>
                    {analyzing ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Sparkles className="h-4 w-4 mr-2" />}
                    AI 分析需求
                  </Button>
                  <Button variant="outline" onClick={handleSave} disabled={saving} size="sm">
                    {saving ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : <Save className="h-4 w-4 mr-1" />}
                    保存
                  </Button>
                </div>
              </CardContent>
            </Card>
          )}

          {/* AI 需求分析结果 */}
          {activePage === "analysis" && (
            <div className="space-y-4">
              {!analysis ? (
                <Card>
                  <CardContent className="flex flex-col items-center justify-center py-16 text-muted-foreground">
                    <Sparkles className="h-10 w-10 mb-3" />
                    <p className="text-sm">暂无分析结果</p>
                    <p className="text-xs mt-1">请先在「需求输入」中填写需求并点击「AI 分析需求」</p>
                    <Button size="sm" variant="outline" className="mt-4" onClick={() => setActivePage("input")}>
                      去输入需求
                    </Button>
                  </CardContent>
                </Card>
              ) : (
                <Card>
                  <CardHeader>
                    <div className="flex items-center justify-between">
                      <CardTitle className="text-base">AI 需求分析结果</CardTitle>
                      <div className="flex gap-2">
                        <Button onClick={() => { setActivePage("input"); handleAnalyze(); }} disabled={analyzing} size="sm" variant="outline">
                          {analyzing ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1" /> : <Sparkles className="h-3.5 w-3.5 mr-1" />}
                          重新分析
                        </Button>
                        <Button onClick={handleGenerateTasks} disabled={generatingTasks} size="sm">
                          {generatingTasks ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1" /> : <ListTree className="h-3.5 w-3.5 mr-1" />}
                          拆解开发任务
                        </Button>
                      </div>
                    </div>
                  </CardHeader>
                  <CardContent className="space-y-6">
                    {analysis.summary && (
                      <div className="p-3 rounded-lg bg-muted/50">
                        <p className="text-sm">{analysis.summary}</p>
                      </div>
                    )}

                    {analysis.features && analysis.features.length > 0 && (
                      <div className="space-y-2">
                        <Label className="text-sm font-medium">功能点拆解</Label>
                        <div className="space-y-2">
                          {analysis.features.map((f, i) => (
                            <div key={i} className="flex items-start gap-3 p-3 rounded-lg border">
                              <Badge variant={f.priority === "high" ? "destructive" : f.priority === "medium" ? "secondary" : "outline"} className="shrink-0 mt-0.5">
                                {f.priority === "high" ? "高" : f.priority === "medium" ? "中" : "低"}
                              </Badge>
                              <div>
                                <p className="font-medium text-sm">{f.name}</p>
                                <p className="text-xs text-muted-foreground mt-1">{f.description}</p>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {analysis.user_stories && analysis.user_stories.length > 0 && (
                      <div className="space-y-2">
                        <Label className="text-sm font-medium">用户故事</Label>
                        <div className="space-y-1">
                          {analysis.user_stories.map((s, i) => (
                            <p key={i} className="text-sm text-muted-foreground pl-3 border-l-2 border-muted">{s}</p>
                          ))}
                        </div>
                      </div>
                    )}

                    {analysis.tech_points && (
                      <div className="space-y-2">
                        <Label className="text-sm font-medium">技术要点</Label>
                        <div className="grid grid-cols-2 gap-3">
                          {Object.entries(analysis.tech_points).filter(([, v]) => v).map(([k, v]) => (
                            <div key={k} className="p-3 rounded-lg border space-y-1">
                              <p className="text-xs font-medium text-muted-foreground uppercase">{k}</p>
                              <p className="text-sm">{v}</p>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {analysis.risks && analysis.risks.length > 0 && (
                      <div className="space-y-2">
                        <Label className="text-sm font-medium">风险与应对</Label>
                        <div className="space-y-2">
                          {analysis.risks.map((r, i) => (
                            <div key={i} className="p-3 rounded-lg border border-red-500/20">
                              <p className="text-sm font-medium text-red-400">{r.description}</p>
                              <p className="text-xs text-muted-foreground mt-1">应对：{r.mitigation}</p>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </CardContent>
                </Card>
              )}
            </div>
          )}

          {/* 开发任务看板 */}
          {activePage === "tasks" && (
            <div className="space-y-4">
              {tasks.length === 0 ? (
                <Card>
                  <CardContent className="flex flex-col items-center justify-center py-16 text-muted-foreground">
                    <ClipboardList className="h-10 w-10 mb-3" />
                    <p className="text-sm">暂无开发任务</p>
                    <p className="text-xs mt-1">请先完成需求分析，然后点击「拆解开发任务」</p>
                    {analysis && (
                      <Button size="sm" className="mt-4" onClick={handleGenerateTasks} disabled={generatingTasks}>
                        {generatingTasks ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1" /> : <ListTree className="h-3.5 w-3.5 mr-1" />}
                        AI 拆解任务
                      </Button>
                    )}
                  </CardContent>
                </Card>
              ) : (
                <Card>
                  <CardHeader>
                    <div className="flex items-center justify-between">
                      <CardTitle className="text-base">开发任务 ({doneCount}/{tasks.length}) · {totalHours}h</CardTitle>
                      <Button onClick={handleGenerateTasks} disabled={generatingTasks} size="sm" variant="outline">
                        {generatingTasks ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1" /> : <ListTree className="h-3.5 w-3.5 mr-1" />}
                        重新拆解
                      </Button>
                    </div>
                  </CardHeader>
                  <CardContent>
                    <div className="grid grid-cols-4 gap-4">
                      {TASK_STATUS_ORDER.map((col) => {
                        const colTasks = tasks.filter((t) => t.status === col);
                        const statusInfo = TASK_STATUS[col];
                        const Icon = statusInfo.icon;
                        return (
                          <div key={col} className="space-y-3">
                            <div className="flex items-center gap-2 pb-2 border-b">
                              <Icon className={`h-4 w-4 ${statusInfo.color}`} />
                              <span className="text-sm font-medium">{statusInfo.label}</span>
                              <Badge variant="secondary" className="text-xs ml-auto">{colTasks.length}</Badge>
                            </div>
                            <div className="space-y-2 min-h-[100px]">
                              {colTasks.map((task) => {
                                const cat = CATEGORY_LABELS[task.category] || CATEGORY_LABELS.other;
                                const nextStatus = getNextStatus(task.status);
                                const prevStatus = getPrevStatus(task.status);
                                return (
                                  <div key={task.id} className={`p-3 rounded-lg border border-l-4 ${PRIORITY_COLORS[task.priority] || ""} space-y-2`}>
                                    <div className="flex items-start justify-between gap-1">
                                      <p className="text-sm font-medium leading-tight">{task.title}</p>
                                      <Button variant="ghost" size="icon" className="h-6 w-6 shrink-0" onClick={() => handleDeleteTask(task.id)}>
                                        <Trash2 className="h-3 w-3" />
                                      </Button>
                                    </div>
                                    {task.description && <p className="text-xs text-muted-foreground line-clamp-2">{task.description}</p>}
                                    <div className="flex items-center gap-2 flex-wrap">
                                      <span className={`text-[10px] px-1.5 py-0.5 rounded ${cat.color}`}>{cat.label}</span>
                                      {/* 工时 - 可编辑 */}
                                      <div className="flex items-center gap-1">
                                        <Clock className="h-3 w-3 text-muted-foreground shrink-0" />
                                        <Input
                                          className="h-5 w-14 text-[10px] px-1.5 py-0 text-muted-foreground"
                                          type="number"
                                          min={0}
                                          step={0.5}
                                          placeholder="工时"
                                          value={task.estimated_hours ?? ""}
                                          onChange={(e) => {
                                            const v = e.target.value === "" ? null : parseFloat(e.target.value);
                                            setTasks((prev) => prev.map((t) => t.id === task.id ? { ...t, estimated_hours: v } : t));
                                          }}
                                          onBlur={(e) => {
                                            const v = e.target.value === "" ? 0 : parseFloat(e.target.value);
                                            handleTaskUpdate(task.id, "estimated_hours", v);
                                          }}
                                          onKeyDown={(e) => {
                                            if (e.key === "Enter") (e.target as HTMLInputElement).blur();
                                            if (e.key === "Escape") {
                                              (e.target as HTMLInputElement).blur();
                                            }
                                          }}
                                        />
                                        <span className="text-[10px] text-muted-foreground">h</span>
                                      </div>
                                    </div>
                                    {/* 执行人 */}
                                    <div className="flex items-center gap-2">
                                      <User className="h-3 w-3 text-muted-foreground shrink-0" />
                                      <Label className="text-[10px] text-muted-foreground shrink-0 whitespace-nowrap">执行人</Label>
                                      <Input
                                        className="h-6 text-xs px-2 py-0"
                                        placeholder="点击输入..."
                                        value={task.assignee || ""}
                                        onChange={(e) => setTasks((prev) => prev.map((t) => t.id === task.id ? { ...t, assignee: e.target.value } : t))}
                                        onBlur={async (e) => {
                                          const val = e.target.value.trim();
                                          const lastConfirmed = confirmedAssigneesRef.current[task.id] || "";

                                          if (!val && lastConfirmed) {
                                            await handleTaskUpdate(task.id, "assignee", "");
                                            await handleEndWorkForEmployee(lastConfirmed);
                                            delete confirmedAssigneesRef.current[task.id];
                                          } else if (val && val !== lastConfirmed) {
                                            // 智能分配：自动判断员工状态
                                            await handleAssignTask(task.id, task.title, val, task.estimated_hours);
                                          }
                                        }}
                                        onKeyDown={(e) => {
                                          if (e.key === "Enter") {
                                            e.preventDefault();
                                            (e.target as HTMLInputElement).blur();
                                          }
                                        }}
                                      />
                                    </div>
                                    <div className="flex items-center gap-1 pt-1">
                                      {prevStatus && (
                                        <Button variant="ghost" size="sm" className="h-6 text-[10px] px-1.5"
                                          onClick={() => handleTaskStatusChange(task.id, prevStatus)}>
                                          ← {TASK_STATUS[prevStatus as keyof typeof TASK_STATUS]?.label}
                                        </Button>
                                      )}
                                      {nextStatus && (
                                        <Button variant="outline" size="sm" className="h-6 text-[10px] px-1.5 ml-auto"
                                          onClick={() => handleTaskStatusChange(task.id, nextStatus)}>
                                          {TASK_STATUS[nextStatus as keyof typeof TASK_STATUS]?.label} →
                                        </Button>
                                      )}
                                    </div>
                                  </div>
                                );
                              })}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </CardContent>
                </Card>
              )}
            </div>
          )}
        </div>
      </div>

      {/* 执行人确认弹窗 - 移入工作区 */}
      <Dialog open={!!assigneeConfirm} onOpenChange={(open) => { if (!open) setAssigneeConfirm(null); }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <User className="h-4 w-4 text-amber-400" />
              移入工作区
            </DialogTitle>
          </DialogHeader>
          {assigneeConfirm && (
            <div className="space-y-3 py-2">
              <p className="text-sm text-muted-foreground">
                已将任务「<span className="font-medium text-foreground">{assigneeConfirm.taskTitle}</span>」的执行人设为
                <span className="font-medium text-amber-400">{assigneeConfirm.employeeName}</span>
              </p>
              <p className="text-sm">是否将该员工移入工作区（状态变为忙碌）？</p>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setAssigneeConfirm(null)} disabled={startingWork}>
              仅保存，不移入
            </Button>
            <Button onClick={handleConfirmStartWork} disabled={startingWork}>
              {startingWork ? <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" /> : null}
              确认移入工作区
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
