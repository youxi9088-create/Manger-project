"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { CheckCircle2, Circle, Clock, Plus, Sparkles, Trash2, Loader2, Download, AlertTriangle, Ban, User, History, Calendar, Video } from "lucide-react";
import { useEffect, useMemo, useState, useCallback, useRef } from "react";

type Priority = "high" | "medium" | "low";
type Status = "pending" | "in_progress" | "completed" | "blocked" | "abandoned";

type Task = {
  id: string;
  title: string;
  status: Status;
  priority: Priority;
  assignee?: string;
  estimateMinutes?: number;
  notes?: string;
  completedAt?: string;
  createdAt: string;
  expectedCompletionAt?: string;
  sourceDate?: string; // 任务来源日期（继承自哪一天）
};

function uid() {
  return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

// 格式化日期时间为友好文本
function formatDateTime(iso: string): string {
  const d = new Date(iso);
  const month = d.getMonth() + 1;
  const day = d.getDate();
  const h = String(d.getHours()).padStart(2, "0");
  const m = String(d.getMinutes()).padStart(2, "0");
  const today = new Date();
  const isToday = d.toDateString() === today.toDateString();
  const tomorrow = new Date(today); tomorrow.setDate(today.getDate() + 1);
  const isTomorrow = d.toDateString() === tomorrow.toDateString();
  const yesterday = new Date(today); yesterday.setDate(today.getDate() - 1);
  const isYesterday = d.toDateString() === yesterday.toDateString();

  const prefix = isToday ? "今天" : isTomorrow ? "明天" : isYesterday ? "昨天" : `${month}月${day}日`;
  return `${prefix} ${h}:${m}`;
}

// 日期时间选择器组件
function DateTimePicker({ value, onChange, label, color = "text-muted-foreground", icon }: {
  value?: string;
  onChange: (iso: string) => void;
  label: string;
  color?: string;
  icon?: React.ReactNode;
}) {
  const inputRef = useRef<HTMLInputElement>(null);

  const handleClick = () => {
    inputRef.current?.showPicker?.();
    inputRef.current?.focus();
  };

  return (
    <span className={`inline-flex items-center gap-1.5 ${color}`}>
      {icon || <Calendar className="h-3 w-3" />}
      <button
        type="button"
        onClick={handleClick}
        className={`text-xs px-1.5 py-0.5 rounded hover:bg-muted transition-colors ${value ? "font-medium" : "text-muted-foreground border border-dashed border-muted-foreground/30"}`}
      >
        {value ? formatDateTime(value) : label}
      </button>
      <input
        ref={inputRef}
        type="datetime-local"
        value={value ? new Date(value).toISOString().slice(0, 16) : ""}
        onChange={e => e.target.value && onChange(new Date(e.target.value).toISOString())}
        className="sr-only"
        tabIndex={-1}
      />
      {value && (
        <button
          type="button"
          onClick={() => onChange("")}
          className="text-[10px] opacity-0 group-hover:opacity-100 hover:text-destructive transition-opacity"
          title="清除"
        >✕</button>
      )}
    </span>
  );
}

function formatDate(d: Date) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function todayKey() {
  return formatDate(new Date());
}

function storageKeyForDate(date: string) {
  return `dailyPlan.${date}.v1`;
}

const STATUS_LABELS: Record<Status, string> = {
  pending: "待办",
  in_progress: "进行中",
  blocked: "受阻",
  completed: "已完成",
  abandoned: "废弃",
};

const STATUS_FLOW: Status[] = ["pending", "in_progress", "blocked", "completed", "abandoned"];

// 获取已处理的继承任务记录（key: 源日期_源任务ID, value: true）
function getProcessedCarryOvers(): Set<string> {
  try {
    const raw = localStorage.getItem("dailyPlan.processedCarryOvers");
    if (!raw) return new Set();
    const arr = JSON.parse(raw);
    return new Set(Array.isArray(arr) ? arr : []);
  } catch {
    return new Set();
  }
}

// 标记任务为已处理（继承后调用）
function markCarryOverAsProcessed(sourceDate: string, sourceTaskId: string) {
  const processed = getProcessedCarryOvers();
  processed.add(`${sourceDate}_${sourceTaskId}`);
  // 只保留最近1000条记录，避免无限增长
  const arr = Array.from(processed).slice(-1000);
  localStorage.setItem("dailyPlan.processedCarryOvers", JSON.stringify(arr));
}

// 收集过去 N 天未完成的任务（排除已处理的）
function collectUnfinishedTasks(today: string, maxDays = 30): Task[] {
  const unfinished: Task[] = [];
  const seen = new Set<string>(); // 按标题去重
  const processed = getProcessedCarryOvers();

  for (let i = 1; i <= maxDays; i++) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    const dateKey = formatDate(d);
    const raw = localStorage.getItem(storageKeyForDate(dateKey));
    if (!raw) continue;

    try {
      const json = JSON.parse(raw);
      if (!Array.isArray(json?.tasks)) continue;

      for (const task of json.tasks as Task[]) {
        if (task.status === "completed" || task.status === "abandoned") continue;

        // 检查该任务是否已被继承处理过（通过源日期+ID标记）
        const processedKey = `${dateKey}_${task.id}`;
        if (processed.has(processedKey)) continue;

        const key = task.title.toLowerCase().trim();
        if (seen.has(key)) continue;
        seen.add(key);
        unfinished.push({ ...task, sourceDate: dateKey });
      }
    } catch { }
  }

  return unfinished;
}

const SERVER_API = process.env.NEXT_PUBLIC_SERVER_API || "http://localhost:3001";

// 从后端获取某日计划
async function fetchPlanFromServer(date: string): Promise<{ goalText: string; tasks: Task[] } | null> {
  try {
    const resp = await fetch(`${SERVER_API}/api/daily-plans/${date}`);
    if (!resp.ok) return null;
    const json = await resp.json();
    if (!json.success) return null;
    const goalText = json.plan?.goal_text || '';
    const tasks: Task[] = (json.tasks || []).map((t: any) => ({
      id: t.id,
      title: t.title,
      status: t.status,
      priority: t.priority,
      assignee: t.assignee || '',
      estimateMinutes: t.estimate_minutes,
      notes: t.notes || undefined,
      completedAt: t.completed_at || undefined,
      createdAt: t.created_at || new Date().toISOString(),
      expectedCompletionAt: t.expected_completion_at || undefined,
      sourceDate: t.source_date || undefined,
    }));
    return { goalText, tasks };
  } catch {
    return null;
  }
}

// 保存整日计划到后端
async function savePlanToServer(date: string, goalText: string, tasks: Task[]): Promise<boolean> {
  try {
    const resp = await fetch(`${SERVER_API}/api/daily-plans/${date}`, {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        goalText,
        tasks: tasks.map(t => ({
          id: t.id,
          title: t.title,
          status: t.status,
          priority: t.priority,
          assignee: t.assignee || null,
          estimate_minutes: t.estimateMinutes || null,
          notes: t.notes || null,
          completed_at: t.completedAt || null,
          expected_completion_at: t.expectedCompletionAt || null,
          source_date: t.sourceDate || null,
        })),
      }),
    });
    return resp.ok;
  } catch {
    return false;
  }
}

export default function DailyPage() {
  const date = todayKey();
  const storageKey = storageKeyForDate(date);

  const [goalText, setGoalText] = useState("");
  const [tasks, setTasks] = useState<Task[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isLoaded, setIsLoaded] = useState(false);
  const [filterStatus, setFilterStatus] = useState<Status | "all" | "carryover">("all");
  const [importing, setImporting] = useState(false);
  const [importError, setImportError] = useState<string | null>(null);
  const [unfinishedTasks, setUnfinishedTasks] = useState<Task[]>([]);

  // 加载今日数据：优先从后端获取，fallback 到 localStorage；同时收集历史未完成任务
  useEffect(() => {
    let mounted = true;
    const load = async () => {
      // 优先尝试后端，但只有后端有实际任务数据或目标文本时才采用
      const serverData = await fetchPlanFromServer(date);
      if (mounted && serverData && (serverData.tasks.length > 0 || serverData.goalText)) {
        setGoalText(serverData.goalText);
        setTasks(serverData.tasks);
      } else {
        // fallback 到 localStorage
        const raw = localStorage.getItem(storageKey);
        if (raw) {
          try {
            const json = JSON.parse(raw);
            if (typeof json?.goalText === "string") setGoalText(json.goalText);
            if (Array.isArray(json?.tasks)) setTasks(json.tasks);
          } catch { }
        }
      }
      if (mounted) {
        setUnfinishedTasks(collectUnfinishedTasks(date));
        setIsLoaded(true);
      }
    };
    load();
    return () => { mounted = false; };
  }, [storageKey, date]);

  // 自动保存（双写：localStorage + 后端）
  useEffect(() => {
    if (isLoaded) {
      localStorage.setItem(storageKey, JSON.stringify({ goalText, tasks }));
      savePlanToServer(date, goalText, tasks); // 后台同步到后端（不阻塞）
    }
  }, [storageKey, goalText, tasks, isLoaded, date]);

  // 过滤掉已存在于今日列表中的历史未完成任务
  const filteredUnfinished = useMemo(() => {
    const todayTitles = new Set(tasks.map(t => t.title.toLowerCase().trim()));
    return unfinishedTasks.filter(t => !todayTitles.has(t.title.toLowerCase().trim()));
  }, [unfinishedTasks, tasks]);

  const stats = useMemo(() => {
    const total = tasks.length;
    const done = tasks.filter(t => t.status === "completed").length;
    const pending = tasks.filter(t => t.status === "pending").length;
    const inProgress = tasks.filter(t => t.status === "in_progress").length;
    const blocked = tasks.filter(t => t.status === "blocked").length;
    const abandoned = tasks.filter(t => t.status === "abandoned").length;
    const carryover = tasks.filter(t => t.sourceDate && t.sourceDate !== date).length;
    return { total, done, pending, inProgress, blocked, abandoned, carryover };
  }, [tasks, date]);

  const filteredTasks = useMemo(() => {
    if (filterStatus === "all") return tasks;
    if (filterStatus === "carryover") return tasks.filter(t => t.sourceDate && t.sourceDate !== date);
    return tasks.filter(t => t.status === filterStatus);
  }, [tasks, filterStatus, date]);

  const addTask = () => {
    setTasks(prev => [{
      id: uid(), title: "新任务", status: "pending", priority: "medium",
      assignee: "", createdAt: new Date().toISOString(),
    }, ...prev]);
  };

  // 继承单个历史任务到今天
  const carryOverTask = useCallback((task: Task) => {
    setTasks(prev => [{
      ...task, id: uid(), sourceDate: task.sourceDate || date,
      notes: task.notes ? task.notes : `继承自 ${task.sourceDate}`,
    }, ...prev]);
  }, [date]);

  // 一键继承所有历史未完成任务
  const carryOverAll = useCallback(() => {
    const todayTitles = new Set(tasks.map(t => t.title.toLowerCase().trim()));
    const toAdd = filteredUnfinished.filter(t => !todayTitles.has(t.title.toLowerCase().trim()));
    setTasks(prev => [
      ...toAdd.map(t => ({
        ...t, id: uid(), sourceDate: t.sourceDate || date,
        notes: t.notes ? t.notes : `继承自 ${t.sourceDate}`,
      })),
      ...prev,
    ]);
  }, [filteredUnfinished, tasks, date]);

  const toggleTask = (id: string) => {
    setTasks(prev => prev.map(t => {
      if (t.id !== id) return t;
      const newStatus = t.status === "completed" ? "pending" : "completed";
      return { ...t, status: newStatus, completedAt: newStatus === "completed" ? new Date().toISOString() : undefined };
    }));
  };

  const deleteTask = (id: string) => {
    setTasks(prev => prev.filter(t => t.id !== id));
  };

  const updateTask = (id: string, patch: Partial<Task>) => {
    setTasks(prev => prev.map(t => (t.id === id ? { ...t, ...patch } : t)));
  };

  const generate = async () => {
    setLoading(true);
    setError(null);
    try {
      const resp = await fetch("/api/daily-plan/generate", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ date, goalText }),
      });
      const json = await resp.json().catch(() => null);
      if (!resp.ok || !json?.success) throw new Error(json?.error || `HTTP ${resp.status}`);

      const planTasks = Array.isArray(json?.plan?.tasks) ? json.plan.tasks : [];
      const mapped: Task[] = planTasks.map((x: any) => ({
        id: uid(),
        title: String(x?.title || "").trim() || "(无标题任务)",
        status: "pending" as Status,
        priority: (["high", "low", "medium"].includes(x?.priority)) ? x.priority : "medium",
        assignee: x?.assignee || "",
        estimateMinutes: typeof x?.estimateMinutes === "number" ? x.estimateMinutes : undefined,
        notes: typeof x?.notes === "string" ? x.notes : undefined,
        createdAt: new Date().toISOString(),
      }));

      setTasks(prev => {
        const existing = new Set(prev.map(t => t.title));
        return [...prev, ...mapped.filter(t => !existing.has(t.title))];
      });
    } catch (e: any) {
      setError(e?.message || "生成失败");
    } finally {
      setLoading(false);
    }
  };

  const importFromAnalysis = async () => {
    setImporting(true);
    setImportError(null);
    try {
      const resp = await fetch(`${SERVER_API}/api/analysis/reports?limit=1`);
      if (!resp.ok) throw new Error(`获取分析报告失败: HTTP ${resp.status}`);
      const json = await resp.json();
      const reports = json?.reports || [];
      if (reports.length === 0) { setImportError("暂无可用的分析报告"); return; }

      const latestReport = reports[0];
      const pendingTasks = Array.isArray(latestReport.pending_tasks) ? latestReport.pending_tasks : [];
      if (pendingTasks.length === 0) { setImportError("最新报告中没有待办事项"); return; }

      const mapped: Task[] = pendingTasks.map((x: any) => ({
        id: uid(),
        title: String(x?.task || x?.title || "").trim() || "(无标题任务)",
        status: "pending" as Status,
        priority: "medium" as Priority,
        assignee: x?.owner || "",
        notes: `来自聊天分析 (${latestReport.report_date})`,
        createdAt: new Date().toISOString(),
      }));

      setTasks(prev => {
        const existing = new Set(prev.map(t => t.title.toLowerCase()));
        return [...prev, ...mapped.filter(t => !existing.has(t.title.toLowerCase()))];
      });
      if (mapped.length > 0) { setImportError(`成功导入 ${mapped.length} 个待办事项`); setTimeout(() => setImportError(null), 3000); }
    } catch (e: any) {
      setImportError(e?.message || "导入失败");
    } finally {
      setImporting(false);
    }
  };

  const importFromMeetings = async () => {
    setImporting(true);
    setImportError(null);
    try {
      const resp = await fetch(`${SERVER_API}/api/meetings`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({}) });
      if (!resp.ok) throw new Error(`获取会议列表失败: HTTP ${resp.status}`);
      const json = await resp.json();
      const records = (json?.records || []).slice(0, 10);
      if (records.length === 0) { setImportError("暂无可用的会议记录"); return; }

      const importedTasks: Task[] = [];
      for (const rec of records) {
        const id = rec.meetingId || rec.title;
        if (!id) continue;
        try {
          const intelResp = await fetch(`${SERVER_API}/api/meetings/intelligence/${encodeURIComponent(id)}`);
          if (!intelResp.ok) continue;
          const intel = await intelResp.json();
          if (!intel.success || !intel.result) continue;
          const items = Array.isArray(intel.result.action_items) ? intel.result.action_items : [];
          for (const x of items) {
            const title = String(x?.task || "").trim();
            if (!title) continue;
            importedTasks.push({
              id: uid(),
              title,
              status: "pending" as Status,
              priority: (x?.priority === "high" ? "high" : x?.priority === "low" ? "low" : "medium") as Priority,
              assignee: x?.owner || "",
              notes: `来自会议《${rec.title || "未命名"}》`,
              createdAt: new Date().toISOString(),
            });
          }
        } catch { /* ignore single meeting failure */ }
      }

      setTasks(prev => {
        const existing = new Set(prev.map(t => t.title.toLowerCase()));
        const unique = importedTasks.filter(t => !existing.has(t.title.toLowerCase()));
        return [...prev, ...unique];
      });
      if (importedTasks.length > 0) {
        setImportError(`成功从会议导入 ${importedTasks.length} 个待办事项`);
        setTimeout(() => setImportError(null), 3000);
      } else {
        setImportError("未找到可导入的会议待办");
      }
    } catch (e: any) {
      setImportError(e?.message || "导入失败");
    } finally {
      setImporting(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">每日工作安排</h1>
          <p className="text-muted-foreground mt-1">{date} 的任务清单</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={addTask}>
            <Plus className="h-4 w-4 mr-2" />新建任务
          </Button>
          <Button variant="outline" onClick={importFromMeetings} disabled={importing}>
            {importing ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Video className="h-4 w-4 mr-2" />}
            从会议导入
          </Button>
          <Button variant="outline" onClick={importFromAnalysis} disabled={importing}>
            {importing ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Download className="h-4 w-4 mr-2" />}
            从聊天导入
          </Button>
          <Button onClick={generate} disabled={loading} className="gap-2">
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
            AI 生成
          </Button>
        </div>
      </div>

      {/* 历史未完成任务提醒 */}
      {filteredUnfinished.length > 0 && (
        <Card className="border-amber-500/30 bg-amber-500/5">
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center justify-between">
              <span className="flex items-center gap-2">
                <History className="h-4 w-4 text-amber-500" />
                历史未完成任务（{filteredUnfinished.length} 项）
              </span>
              <Button size="sm" variant="outline" onClick={carryOverAll} className="text-xs">
                全部继承到今天
              </Button>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {filteredUnfinished.slice(0, 10).map(task => (
                <div key={task.id + task.sourceDate} className="flex items-center gap-3 text-sm p-2 rounded-lg hover:bg-muted/50">
                  <Badge variant="outline" className="text-xs shrink-0">{task.sourceDate}</Badge>
                  <span className="flex-1 truncate">{task.title}</span>
                  {task.assignee && <span className="text-xs text-muted-foreground">👤 {task.assignee}</span>}
                  <Badge variant={task.status === "blocked" ? "destructive" : "secondary"} className="text-xs">
                    {STATUS_LABELS[task.status]}
                  </Badge>
                  <Button size="sm" variant="ghost" className="text-xs h-7 px-2" onClick={() => carryOverTask(task)}>
                    继承
                  </Button>
                </div>
              ))}
              {filteredUnfinished.length > 10 && (
                <p className="text-xs text-muted-foreground text-center pt-1">还有 {filteredUnfinished.length - 10} 项...</p>
              )}
            </div>
          </CardContent>
        </Card>
      )}

      {/* 目标 */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Sparkles className="h-5 w-5" />今日目标 / 背景（可选）
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <Textarea value={goalText} onChange={e => setGoalText(e.target.value)}
            placeholder="例如：今天要完成 quick-search 联调、修复 daily 页面并写一份简短周报..." />
          {error && <div className="text-sm text-destructive">{error}</div>}
          {importError && (
            <div className={`text-sm ${importError.includes("成功") ? "text-green-600" : "text-destructive"}`}>{importError}</div>
          )}
        </CardContent>
      </Card>

      {/* 统计卡片 */}
      <div className="grid gap-3 grid-cols-2 md:grid-cols-3 lg:grid-cols-6">
        {([
          { key: "pending", label: "待办", color: "blue", icon: Circle, count: stats.pending },
          { key: "in_progress", label: "进行中", color: "orange", icon: Clock, count: stats.inProgress },
          { key: "blocked", label: "受阻", color: "red", icon: AlertTriangle, count: stats.blocked },
          { key: "completed", label: "已完成", color: "green", icon: CheckCircle2, count: stats.done },
          { key: "abandoned", label: "废弃", color: "slate", icon: Ban, count: stats.abandoned },
          { key: "carryover", label: "继承", color: "amber", icon: History, count: stats.carryover },
        ] as const).map(item => (
          <Card key={item.key}
            className={`border-l-4 border-l-${item.color}-500 cursor-pointer transition-all hover:shadow-md ${filterStatus === item.key ? `ring-2 ring-${item.color}-500` : ""}`}
            onClick={() => setFilterStatus(filterStatus === item.key ? "all" : item.key)}
          >
            <CardContent className="pt-4 pb-3 px-4">
              <div className="flex items-center justify-between">
                <item.icon className={`h-4 w-4 text-${item.color}-500`} />
                <span className="text-2xl font-bold">{item.count}</span>
              </div>
              <p className="text-xs text-muted-foreground mt-1">{item.label}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* 任务列表 */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Clock className="h-5 w-5" />
            任务列表
            {filterStatus !== "all" && (
              <Badge variant="outline" className="ml-2">
                筛选: {filterStatus === "carryover" ? "继承任务" : STATUS_LABELS[filterStatus as Status]}
                <button onClick={() => setFilterStatus("all")} className="ml-1 hover:text-destructive">✕</button>
              </Badge>
            )}
            <span className="text-sm font-normal text-muted-foreground ml-auto">{filteredTasks.length} / {tasks.length} 项</span>
          </CardTitle>
        </CardHeader>
        <CardContent>
          {filteredTasks.length === 0 ? (
            <div className="text-sm text-muted-foreground text-center py-8">
              {filterStatus === "all"
                ? "暂无任务。你可以手动新增，或点击「AI 生成」。"
                : `暂无${filterStatus === "carryover" ? "继承" : STATUS_LABELS[filterStatus as Status]}的任务。`}
            </div>
          ) : (
            <div className="space-y-3">
              {filteredTasks.map(task => (
                <div key={task.id} className={`rounded-lg border p-3 space-y-2 transition-all ${task.status === "abandoned" ? "opacity-50" :
                  task.status === "completed" ? "opacity-75" : ""
                  } ${task.sourceDate && task.sourceDate !== date ? "border-l-4 border-l-amber-500/50" : ""}`}>
                  {/* 主行 */}
                  <div className="flex items-center gap-3">
                    <button type="button" onClick={() => toggleTask(task.id)} className="shrink-0" aria-label="toggle">
                      {task.status === "completed" ? <CheckCircle2 className="h-5 w-5 text-green-500" /> :
                        task.status === "abandoned" ? <Ban className="h-5 w-5 text-slate-500" /> :
                          <Circle className="h-5 w-5 text-muted-foreground" />}
                    </button>

                    <Input value={task.title} onChange={e => updateTask(task.id, { title: e.target.value })}
                      className={`flex-1 ${task.status === "completed" ? "line-through text-muted-foreground" : task.status === "abandoned" ? "line-through text-muted-foreground" : ""}`} />

                    {/* 执行人 */}
                    <div className="flex items-center gap-1 shrink-0">
                      <User className="h-3.5 w-3.5 text-muted-foreground" />
                      <Input value={task.assignee || ""} onChange={e => updateTask(task.id, { assignee: e.target.value })}
                        placeholder="执行人" className="w-20 h-8 text-xs" />
                    </div>

                    {/* 状态 */}
                    <Badge
                      variant={
                        task.status === "completed" ? "default" :
                          task.status === "in_progress" ? "secondary" :
                            task.status === "blocked" ? "destructive" :
                              task.status === "abandoned" ? "outline" : "outline"
                      }
                      className={`cursor-pointer shrink-0 ${task.status === "abandoned" ? "opacity-60" : ""}`}
                      onClick={() => {
                        const idx = STATUS_FLOW.indexOf(task.status);
                        const next = STATUS_FLOW[(idx + 1) % STATUS_FLOW.length];
                        const completedAt = next === "completed" ? new Date().toISOString() : undefined;
                        updateTask(task.id, { status: next, completedAt });
                      }}
                      title="点击切换状态"
                    >
                      {STATUS_LABELS[task.status]}
                    </Badge>

                    {/* 优先级 */}
                    <Badge
                      variant={task.priority === "high" ? "destructive" : task.priority === "low" ? "outline" : "secondary"}
                      className="cursor-pointer shrink-0"
                      onClick={() => updateTask(task.id, {
                        priority: task.priority === "high" ? "medium" : task.priority === "medium" ? "low" : "high",
                      })}
                      title="点击切换优先级"
                    >
                      {task.priority === "high" ? "高" : task.priority === "medium" ? "中" : "低"}
                    </Badge>

                    <Button variant="ghost" size="icon" onClick={() => deleteTask(task.id)} className="shrink-0">
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>

                  {/* 详情行 */}
                  <div className="text-xs text-muted-foreground pl-8 flex flex-wrap items-center gap-x-4 gap-y-1 group">
                    {task.sourceDate && task.sourceDate !== date && (
                      <span className="text-amber-500">📌 继承自 {task.sourceDate}</span>
                    )}
                    {task.estimateMinutes && <span>预估 {task.estimateMinutes} 分钟</span>}
                    {task.notes && <span>{task.notes}</span>}

                    {/* 预期完成时间 */}
                    {task.status !== "completed" && task.status !== "abandoned" && (
                      <DateTimePicker
                        value={task.expectedCompletionAt}
                        onChange={v => updateTask(task.id, { expectedCompletionAt: v || undefined })}
                        label="设置预期时间"
                        color="text-sky-400"
                        icon={<span>📅</span>}
                      />
                    )}

                    {/* 完成时间 */}
                    {task.completedAt && (
                      <DateTimePicker
                        value={task.completedAt}
                        onChange={v => updateTask(task.id, { completedAt: v || undefined })}
                        label="设置完成时间"
                        color="text-green-500"
                        icon={<span>✓</span>}
                      />
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
