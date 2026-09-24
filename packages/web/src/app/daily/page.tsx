"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { CheckCircle2, Circle, Clock, Plus, Sparkles, Trash2, Loader2, Download, AlertTriangle, Ban, User, History, Calendar, Video, MessageCircle, ListChecks, AlertCircle } from "lucide-react";
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
function DateTimePicker({ value, onChange, label, color = "text-[var(--oc-text-secondary)]", icon }: {
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
        className={`text-xs px-1.5 py-0.5 rounded-md transition-colors hover:bg-[var(--oc-bg-hover)] ${value ? "font-medium text-[var(--oc-text-primary)]" : "text-[var(--oc-text-tertiary)] border border-dashed border-[var(--oc-border-strong)]"}`}
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
          className="text-[10px] opacity-0 group-hover:opacity-100 text-[var(--oc-text-tertiary)] hover:text-[var(--oc-error)] transition-opacity"
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

// 从后端获取某日计划（含历史未完成任务）
async function fetchPlanFromServer(date: string): Promise<{ goalText: string; tasks: Task[]; unfinishedTasks: Task[] } | null> {
  try {
    const resp = await fetch(`${SERVER_API}/api/daily-plans/${date}`);
    if (!resp.ok) return null;
    const json = await resp.json();
    if (!json.success) return null;
    const goalText = json.plan?.goal_text || '';
    const mapTask = (t: any): Task => ({
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
      sourceDate: t.source_date || t.plan_date || undefined,
    });
    const tasks: Task[] = (json.tasks || []).map(mapTask);
    const unfinishedTasks: Task[] = (json.unfinishedTasks || []).map(mapTask);
    return { goalText, tasks, unfinishedTasks };
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

  // 加载今日数据：后端为单一事实来源；后端失败时 fallback 到 localStorage
  // 若后端为空但 localStorage 有数据，则迁移到后端并保持后端优先
  useEffect(() => {
    let mounted = true;
    const load = async () => {
      const serverData = await fetchPlanFromServer(date);
      if (mounted) {
        if (serverData) {
          const hasServerData = serverData.tasks.length > 0 || serverData.goalText.trim().length > 0;
          if (hasServerData) {
            setGoalText(serverData.goalText);
            setTasks(serverData.tasks);
          } else {
            // 后端为空时，尝试迁移 localStorage 数据（一次性）
            const raw = localStorage.getItem(storageKey);
            if (raw) {
              try {
                const json = JSON.parse(raw);
                const localGoalText = typeof json?.goalText === "string" ? json.goalText : "";
                const localTasks = Array.isArray(json?.tasks) ? json.tasks : [];
                if (localTasks.length > 0 || localGoalText) {
                  setGoalText(localGoalText);
                  setTasks(localTasks);
                  savePlanToServer(date, localGoalText, localTasks);
                }
              } catch { }
            }
          }
          // 以后端数据库为历史未完成任务的事实来源
          setUnfinishedTasks(serverData.unfinishedTasks);
        } else {
          // 后端不可用，fallback 到 localStorage
          const raw = localStorage.getItem(storageKey);
          if (raw) {
            try {
              const json = JSON.parse(raw);
              if (typeof json?.goalText === "string") setGoalText(json.goalText);
              if (Array.isArray(json?.tasks)) setTasks(json.tasks);
            } catch { }
          }
          setUnfinishedTasks(collectUnfinishedTasks(date));
        }
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
      const resp = await fetch(`${SERVER_API}/api/meetings/saved?limit=200`);
      if (!resp.ok) throw new Error(`获取已保存会议纪要失败: HTTP ${resp.status}`);
      const json = await resp.json();
      const records = Array.isArray(json?.records) ? json.records : [];
      if (records.length === 0) { setImportError("暂无已生成待办的会议纪要"); return; }

      const importedTasks: Task[] = [];
      for (const rec of records) {
        const todos = Array.isArray(rec.todos) ? rec.todos : [];
        for (const todo of todos) {
          const title = typeof todo === "string" ? todo.trim() : String(todo?.task || todo?.title || "").trim();
          if (!title) continue;
          importedTasks.push({
            id: uid(),
            title,
            status: "pending" as Status,
            priority: "medium" as Priority,
            assignee: typeof todo === "object" && todo ? String(todo.owner || "") : "",
            notes: `来自会议纪要《${rec.title || "未命名"}》`,
            createdAt: new Date().toISOString(),
          });
        }
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

  const filterChips: { key: Status | "all" | "carryover"; label: string }[] = [
    { key: "all", label: "全部" },
    { key: "pending", label: "待办" },
    { key: "in_progress", label: "进行中" },
    { key: "blocked", label: "受阻" },
    { key: "completed", label: "已完成" },
    { key: "abandoned", label: "废弃" },
    { key: "carryover", label: "继承" },
  ];

  const getStatusBadgeClass = (status: Status) => {
    switch (status) {
      case "completed": return "border-transparent bg-[var(--oc-success-soft)] text-[var(--oc-success)]";
      case "in_progress": return "border-transparent bg-[var(--oc-info-soft)] text-[var(--oc-info)]";
      case "blocked": return "border-transparent bg-[var(--oc-error-soft)] text-[var(--oc-error)]";
      case "abandoned": return "border-transparent bg-[var(--oc-bg-hover)] text-[var(--oc-text-tertiary)]";
      default: return "border-[var(--oc-border-strong)] bg-transparent text-[var(--oc-text-secondary)]";
    }
  };

  const getPriorityBadgeClass = (priority: Priority) => {
    switch (priority) {
      case "high": return "border-transparent bg-[var(--oc-error-soft)] text-[var(--oc-error)]";
      case "low": return "border-transparent bg-[var(--oc-success-soft)] text-[var(--oc-success)]";
      default: return "border-transparent bg-[var(--oc-warning-soft)] text-[var(--oc-warning)]";
    }
  };

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-[var(--oc-text-primary)]">日报计划</h1>
          <p className="mt-1 text-sm text-[var(--oc-text-secondary)]">输入今日目标与背景，让 AI 生成可执行的任务清单</p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            onClick={addTask}
            className="border-[var(--oc-border-subtle)] bg-[var(--oc-bg-elevated)] text-[var(--oc-text-primary)] hover:border-[var(--oc-border-strong)] hover:bg-[var(--oc-bg-hover)]"
          >
            <Plus className="h-4 w-4" />
            新建任务
          </Button>
          <Button onClick={generate} disabled={loading} className="gap-2 bg-[var(--oc-accent)] text-[var(--oc-bg-root)] hover:bg-[var(--oc-accent-hover)]">
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
            AI 生成今日计划
          </Button>
        </div>
      </div>

      <div className="grid gap-5 lg:grid-cols-[360px_1fr]">
        {/* 左侧：目标与导入 */}
        <div className="space-y-5">
          <div className="rounded-[14px] border border-[var(--oc-border-subtle)] bg-[var(--oc-bg-surface)] p-[18px]">
            <label className="mb-2 block text-xs font-semibold text-[var(--oc-text-secondary)]">今日目标 / 背景</label>
            <Textarea
              value={goalText}
              onChange={e => setGoalText(e.target.value)}
              rows={6}
              placeholder="例如：今天要完成 quick-search 联调、修复日报计划页面并写一份简短周报…"
              className="resize-y border-[var(--oc-border-subtle)] bg-[var(--oc-bg-elevated)] text-[var(--oc-text-primary)] placeholder:text-[var(--oc-text-tertiary)] focus-visible:border-[var(--oc-accent)] focus-visible:ring-[var(--oc-accent-soft)]"
            />

            <label className="mb-2 mt-4 block text-xs font-semibold text-[var(--oc-text-secondary)]">从其他来源导入</label>
            <button
              type="button"
              onClick={importFromMeetings}
              disabled={importing}
              className="mb-2 flex w-full items-center gap-3 rounded-[10px] border border-[var(--oc-border-subtle)] bg-[var(--oc-bg-elevated)] p-2.5 text-left transition-colors hover:border-[var(--oc-border-strong)] hover:bg-[var(--oc-bg-hover)] disabled:opacity-50"
            >
              <Video className="h-[15px] w-[15px] text-[var(--oc-accent)]" />
              <div className="flex-1 min-w-0">
                <div className="text-xs font-semibold text-[var(--oc-text-primary)]">从会议导入待办</div>
                <div className="text-[11px] text-[var(--oc-text-secondary)]">拉取最近会议的待办并合并到今日计划</div>
              </div>
              <div className="flex h-5 w-5 items-center justify-center rounded-full border border-[var(--oc-border-strong)] text-[var(--oc-text-tertiary)]">
                <Plus className="h-3 w-3" />
              </div>
            </button>
            <button
              type="button"
              onClick={importFromAnalysis}
              disabled={importing}
              className="mb-2 flex w-full items-center gap-3 rounded-[10px] border border-[var(--oc-border-subtle)] bg-[var(--oc-bg-elevated)] p-2.5 text-left transition-colors hover:border-[var(--oc-border-strong)] hover:bg-[var(--oc-bg-hover)] disabled:opacity-50"
            >
              <MessageCircle className="h-[15px] w-[15px] text-[var(--oc-accent)]" />
              <div className="flex-1 min-w-0">
                <div className="text-xs font-semibold text-[var(--oc-text-primary)]">从聊天导入行动项</div>
                <div className="text-[11px] text-[var(--oc-text-secondary)]">基于聊天记录分析结果导入待办</div>
              </div>
              <div className="flex h-5 w-5 items-center justify-center rounded-full border border-[var(--oc-border-strong)] text-[var(--oc-text-tertiary)]">
                <Plus className="h-3 w-3" />
              </div>
            </button>
            <button
              type="button"
              onClick={carryOverAll}
              disabled={filteredUnfinished.length === 0}
              className="flex w-full items-center gap-3 rounded-[10px] border border-[var(--oc-border-subtle)] bg-[var(--oc-bg-elevated)] p-2.5 text-left transition-colors hover:border-[var(--oc-border-strong)] hover:bg-[var(--oc-bg-hover)] disabled:opacity-50"
            >
              <History className="h-[15px] w-[15px] text-[var(--oc-accent)]" />
              <div className="flex-1 min-w-0">
                <div className="text-xs font-semibold text-[var(--oc-text-primary)]">继承昨日未完成</div>
                <div className="text-[11px] text-[var(--oc-text-secondary)]">
                  {filteredUnfinished.length > 0 ? `${filteredUnfinished.length} 项任务未关闭 · 建议优先处理` : "暂无历史未关闭任务"}
                </div>
              </div>
              <div className="flex h-5 w-5 items-center justify-center rounded-full border border-[var(--oc-accent)] bg-[var(--oc-accent-soft)] text-[var(--oc-accent)]">
                <CheckCircle2 className="h-3 w-3" />
              </div>
            </button>

            {error && (
              <div className="mt-3 flex items-center gap-2 rounded-[10px] border border-[rgba(201,123,109,0.25)] bg-[var(--oc-error-soft)] p-3 text-xs text-[var(--oc-error)]">
                <AlertCircle className="h-4 w-4 shrink-0" />
                <span>{error}</span>
              </div>
            )}
            {importError && (
              <div className={`mt-3 flex items-center gap-2 rounded-[10px] border p-3 text-xs ${importError.includes("成功") ? "border-[var(--oc-success)]/25 bg-[var(--oc-success-soft)] text-[var(--oc-success)]" : "border-[rgba(201,123,109,0.25)] bg-[var(--oc-error-soft)] text-[var(--oc-error)]"}`}>
                <AlertCircle className="h-4 w-4 shrink-0" />
                <span>{importError}</span>
              </div>
            )}

            {filteredUnfinished.length > 0 && (
              <div className="mt-3 rounded-[10px] border border-[var(--oc-border-subtle)] bg-[var(--oc-bg-surface)] p-3">
                <div className="flex items-center gap-2 text-xs text-[var(--oc-warning)]">
                  <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
                  <span>昨日有 {filteredUnfinished.length} 项任务未关闭，可一键继承到今天。</span>
                </div>
              </div>
            )}
          </div>

          {/* 历史未完成任务列表 */}
          {filteredUnfinished.length > 0 && (
            <Card className="border-[var(--oc-border-subtle)] bg-[var(--oc-bg-surface)] rounded-[14px]">
              <CardHeader className="pb-3">
                <CardTitle className="text-[13px] font-bold flex items-center justify-between text-[var(--oc-text-primary)]">
                  <span className="flex items-center gap-2">
                    <History className="h-4 w-4 text-[var(--oc-accent)]" />
                    历史未完成任务（{filteredUnfinished.length} 项）
                  </span>
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-2">
                  {filteredUnfinished.slice(0, 8).map(task => (
                    <div
                      key={task.id + task.sourceDate}
                      className="flex items-center gap-3 rounded-[10px] border border-transparent p-2.5 text-sm transition-all hover:border-[var(--oc-border-subtle)] hover:bg-[var(--oc-bg-elevated)]"
                    >
                      <Badge variant="outline" className="shrink-0 border-[var(--oc-border-strong)] bg-[var(--oc-bg-elevated)] text-[var(--oc-text-secondary)] text-[10px]">
                        {task.sourceDate}
                      </Badge>
                      <span className="flex-1 truncate text-[var(--oc-text-primary)]">{task.title}</span>
                      <Badge className={`shrink-0 text-[10px] ${getStatusBadgeClass(task.status)}`}>
                        {STATUS_LABELS[task.status]}
                      </Badge>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => carryOverTask(task)}
                        className="h-7 px-2 text-xs text-[var(--oc-accent)] hover:bg-[var(--oc-accent-soft)] hover:text-[var(--oc-accent)]"
                      >
                        继承
                      </Button>
                    </div>
                  ))}
                  {filteredUnfinished.length > 8 && (
                    <p className="text-center text-xs text-[var(--oc-text-tertiary)] pt-1">还有 {filteredUnfinished.length - 8} 项…</p>
                  )}
                </div>
              </CardContent>
            </Card>
          )}
        </div>

        {/* 右侧：任务列表 */}
        <Card className="relative border-[var(--oc-border-subtle)] bg-[var(--oc-bg-surface)] rounded-[14px]">
          {loading && (
            <div className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-3 rounded-[14px] bg-[var(--oc-bg-root)]/70 backdrop-blur-sm">
              <Loader2 className="h-8 w-8 animate-spin text-[var(--oc-accent)]" />
              <span className="text-sm text-[var(--oc-text-secondary)]">Hermes 正在分析上下文…</span>
            </div>
          )}

          <CardHeader className="flex flex-col gap-4 pb-4 sm:flex-row sm:items-center sm:justify-between">
            <CardTitle className="flex items-center gap-2 text-[15px] font-bold text-[var(--oc-text-primary)]">
              <ListChecks className="h-5 w-5 text-[var(--oc-accent)]" />
              今日任务
            </CardTitle>
            <div className="flex flex-wrap items-center gap-2">
              {filterChips.map(chip => {
                const active = filterStatus === chip.key;
                const count = chip.key === "all" ? tasks.length : chip.key === "carryover" ? stats.carryover : tasks.filter(t => t.status === chip.key).length;
                return (
                  <button
                    key={chip.key}
                    type="button"
                    onClick={() => setFilterStatus(active ? "all" : chip.key)}
                    className={`rounded-full border px-2.5 py-1 text-xs font-medium transition-colors ${active ? "border-[rgba(201,168,108,0.25)] bg-[var(--oc-accent-soft)] text-[var(--oc-accent)]" : "border-[var(--oc-border-subtle)] bg-[var(--oc-bg-elevated)] text-[var(--oc-text-secondary)] hover:border-[var(--oc-border-strong)] hover:text-[var(--oc-text-primary)]"}`}
                  >
                    {chip.label} {count > 0 && <span className="ml-0.5 opacity-70">{count}</span>}
                  </button>
                );
              })}
            </div>
          </CardHeader>

          <CardContent>
            {filteredTasks.length === 0 ? (
              <div className="py-10 text-center text-sm text-[var(--oc-text-secondary)]">
                {filterStatus === "all"
                  ? "暂无任务。你可以手动新增，或点击「AI 生成」。"
                  : `暂无${filterStatus === "carryover" ? "继承" : STATUS_LABELS[filterStatus as Status]}的任务。`}
              </div>
            ) : (
              <div className="space-y-2">
                {filteredTasks.map(task => (
                  <div
                    key={task.id}
                    className={`group rounded-[10px] border p-3 transition-all ${task.status === "abandoned" ? "opacity-50" : task.status === "completed" ? "opacity-75" : ""} ${task.sourceDate && task.sourceDate !== date ? "border-l-4 border-l-[var(--oc-accent)]/50" : "border-[var(--oc-border-subtle)]"} hover:border-[var(--oc-border-strong)] hover:bg-[var(--oc-bg-elevated)]`}
                  >
                    {/* 主行 */}
                    <div className="flex items-center gap-3">
                      <button type="button" onClick={() => toggleTask(task.id)} className="shrink-0" aria-label="toggle">
                        {task.status === "completed" ? <CheckCircle2 className="h-5 w-5 text-[var(--oc-success)]" /> :
                          task.status === "abandoned" ? <Ban className="h-5 w-5 text-[var(--oc-text-tertiary)]" /> :
                            <Circle className="h-5 w-5 text-[var(--oc-text-tertiary)]" />}
                      </button>

                      <Input
                        value={task.title}
                        onChange={e => updateTask(task.id, { title: e.target.value })}
                        className={`flex-1 border-transparent bg-transparent px-0 text-sm text-[var(--oc-text-primary)] transition-colors focus-visible:bg-[var(--oc-bg-elevated)] focus-visible:px-2 focus-visible:ring-[var(--oc-accent-soft)] ${task.status === "completed" || task.status === "abandoned" ? "line-through text-[var(--oc-text-tertiary)]" : ""}`}
                      />

                      {/* 执行人 */}
                      <div className="hidden items-center gap-1 shrink-0 sm:flex">
                        <User className="h-3.5 w-3.5 text-[var(--oc-text-tertiary)]" />
                        <Input
                          value={task.assignee || ""}
                          onChange={e => updateTask(task.id, { assignee: e.target.value })}
                          placeholder="执行人"
                          className="h-8 w-20 border-[var(--oc-border-subtle)] bg-[var(--oc-bg-elevated)] text-xs text-[var(--oc-text-primary)] placeholder:text-[var(--oc-text-tertiary)] focus-visible:border-[var(--oc-accent)] focus-visible:ring-[var(--oc-accent-soft)]"
                        />
                      </div>

                      {/* 状态 */}
                      <Badge
                        className={`cursor-pointer shrink-0 text-[10px] ${getStatusBadgeClass(task.status)} ${task.status === "abandoned" ? "opacity-60" : ""}`}
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
                        className={`cursor-pointer shrink-0 text-[10px] ${getPriorityBadgeClass(task.priority)}`}
                        onClick={() => updateTask(task.id, {
                          priority: task.priority === "high" ? "medium" : task.priority === "medium" ? "low" : "high",
                        })}
                        title="点击切换优先级"
                      >
                        {task.priority === "high" ? "高" : task.priority === "medium" ? "中" : "低"}
                      </Badge>

                      <Button variant="ghost" size="icon" onClick={() => deleteTask(task.id)} className="shrink-0 text-[var(--oc-text-tertiary)] hover:bg-[var(--oc-bg-hover)] hover:text-[var(--oc-error)]">
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>

                    {/* 详情行 */}
                    <div className="flex flex-wrap items-center gap-x-4 gap-y-1 pl-8 pt-2 text-xs text-[var(--oc-text-secondary)]">
                      {task.sourceDate && task.sourceDate !== date && (
                        <span className="text-[var(--oc-accent)]">继承自 {task.sourceDate}</span>
                      )}
                      {task.estimateMinutes && <span>预估 {task.estimateMinutes} 分钟</span>}
                      {task.notes && <span>{task.notes}</span>}

                      {task.status !== "completed" && task.status !== "abandoned" && (
                        <DateTimePicker
                          value={task.expectedCompletionAt}
                          onChange={v => updateTask(task.id, { expectedCompletionAt: v || undefined })}
                          label="设置预期时间"
                          color="text-[var(--oc-info)]"
                          icon={<Clock className="h-3 w-3" />}
                        />
                      )}

                      {task.completedAt && (
                        <DateTimePicker
                          value={task.completedAt}
                          onChange={v => updateTask(task.id, { completedAt: v || undefined })}
                          label="设置完成时间"
                          color="text-[var(--oc-success)]"
                          icon={<CheckCircle2 className="h-3 w-3" />}
                        />
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}

            <div className="mt-4 border-t border-[var(--oc-border-subtle)] pt-3">
              <Button
                variant="ghost"
                onClick={addTask}
                className="w-full text-[var(--oc-text-secondary)] hover:bg-[var(--oc-bg-hover)] hover:text-[var(--oc-text-primary)]"
              >
                <Plus className="h-4 w-4" />
                添加任务
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
