"use client";

import { useEffect, useState, useMemo } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Calendar,
  CheckSquare,
  Clock,
  AlertTriangle,
  MessageSquare,
  Video,
  ArrowRight,
  Sparkles,
  FolderKanban,
  RefreshCw,
  FileText,
  Users,
  Mic,
  ClipboardList,
  Search,
  HeartPulse,
  Zap,
  MessageSquareText,
} from "lucide-react";
import { cn } from "@/lib/utils";

const API_BASE = process.env.NEXT_PUBLIC_SERVER_API || "http://localhost:3001";

function localDateKey(date = new Date()): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function formatDateLabel(iso: string): string {
  const d = new Date(iso);
  const today = new Date();
  const yesterday = new Date(today);
  yesterday.setDate(today.getDate() - 1);
  if (d.toDateString() === today.toDateString()) return "今天";
  if (d.toDateString() === yesterday.toDateString()) return "昨天";
  return `${d.getMonth() + 1}月${d.getDate()}日`;
}

function formatTime(iso: string): string {
  const d = new Date(iso);
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

interface Meeting {
  id?: string;
  meetingId?: string;
  title?: string;
  startTime?: string;
  status?: string;
  hasIntelligence?: boolean;
}

interface DailyTask {
  id: string;
  title: string;
  status: string;
  priority: string;
  expected_completion_at?: string;
  assignee?: string | null;
  notes?: string | null;
}

interface AnalysisReport {
  id?: string;
  report_date: string;
  summary?: string;
  work_priorities?: string[];
  completed_tasks?: any[];
  pending_tasks?: Array<
    | { task?: string; priority?: string; deadline?: string; group?: string; owner?: string }
    | string
  >;
  key_decisions?: Array<
    | { decision?: string; participants?: string[]; impact?: string; group?: string; content?: string }
    | string
  >;
  follow_ups?: Array<
    | { item?: string; person?: string; deadline?: string; group?: string }
    | string
  >;
  meeting_notes?: any[];
  statistics?: any;
  group_summaries?: Array<{ group: string; summary: string; key_topics?: string[]; active_members?: string[] }>;
  sender_activities?: any[];
  raw_chat_count?: number;
  important_chat_count?: number;
}

interface ProjectSummary {
  id: string;
  title: string;
  current_phase: string;
  phase_status?: string;
  risk_level: string;
  deadline: string | null;
  progress?: number;
}

interface DashboardData {
  todayMeetings: Meeting[];
  todayTasks: DailyTask[];
  unfinishedTasks: DailyTask[];
  latestReport: AnalysisReport | null;
  projects: ProjectSummary[];
  isLoading: boolean;
}

export default function HomePage() {
  const [data, setData] = useState<DashboardData>({
    todayMeetings: [],
    todayTasks: [],
    unfinishedTasks: [],
    latestReport: null,
    projects: [],
    isLoading: true,
  });

  const today = useMemo(() => localDateKey(), []);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const [meetingsRes, dailyRes, reportsRes, projectsRes] = await Promise.all([
          fetch(`${API_BASE}/api/meetings`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({}),
          }).then(r => r.json()).catch(() => ({ records: [] })),
          fetch(`${API_BASE}/api/daily-plans/${today}`).then(r => r.json()).catch(() => ({ tasks: [], unfinishedTasks: [] })),
          fetch(`${API_BASE}/api/analysis/reports`).then(r => r.json()).catch(() => ({ reports: [] })),
          fetch(`${API_BASE}/api/projects?limit=50`).then(r => r.json()).catch(() => ({ projects: [] })),
        ]);

        if (cancelled) return;

        const meetings: Meeting[] = (meetingsRes.records || [])
          .filter((meeting: Meeting) => meeting.startTime && localDateKey(new Date(meeting.startTime)) === today)
          .slice(0, 5);
        const todayTasks: DailyTask[] = dailyRes.tasks || [];
        const unfinished: DailyTask[] = dailyRes.unfinishedTasks || [];
        const reports: AnalysisReport[] = reportsRes.reports || [];
        const latest = reports[0] || null;
        const rawProjects = projectsRes.projects || [];
        const projects: ProjectSummary[] = rawProjects.map((p: any) => {
          const phaseStatus = typeof p.phase_status === "string" ? JSON.parse(p.phase_status || "{}") : p.phase_status || {};
          const progress = Math.round(
            (((phaseStatus.initiation || 0) +
              (phaseStatus.requirement || 0) +
              (phaseStatus.planning || 0) +
              (phaseStatus.execution || 0) +
              (phaseStatus.delivery || 0)) / 5) * 100
          );
          return { id: p.id, title: p.title, current_phase: p.current_phase, phase_status: p.phase_status, risk_level: p.risk_level, deadline: p.deadline, progress };
        });

        setData({
          todayMeetings: meetings,
          todayTasks,
          unfinishedTasks: unfinished,
          latestReport: latest,
          projects,
          isLoading: false,
        });
      } catch {
        setData(prev => ({ ...prev, isLoading: false }));
      }
    }
    load();
    return () => { cancelled = true; };
  }, [today]);

  const todayMeetingsCount = data.todayMeetings.filter((m) => {
    if (!m.startTime) return false;
    const d = new Date(m.startTime);
    return d.toISOString().slice(0, 10) === today;
  }).length;

  const filteredTodayTasks = useMemo(() => {
    return data.todayTasks.filter((t) => {
      if (t.status === "completed" || t.status === "abandoned") return false;
      if (!t.expected_completion_at) return true;
      const dueDate = new Date(t.expected_completion_at).toISOString().slice(0, 10);
      return dueDate <= today;
    });
  }, [data.todayTasks, today]);

  const totalTasks = filteredTodayTasks.length;
  const overdueTasks = filteredTodayTasks.filter(
    (t) => t.expected_completion_at && new Date(t.expected_completion_at) < new Date()
  );
  const highRiskProjects = data.projects.filter((p) => p.risk_level === "high").length;

  const overallHealth = useMemo(() => {
    if (data.projects.length === 0) return 0;
    const total = data.projects.reduce((sum, p) => sum + (p.progress || 0), 0);
    return Math.round(total / data.projects.length);
  }, [data.projects]);

  const pendingImports = data.latestReport?.pending_tasks?.length || 0;
  const nextMeeting = data.todayMeetings
    .filter((m) => m.startTime && new Date(m.startTime) >= new Date())
    .sort((a, b) => new Date(a.startTime || 0).getTime() - new Date(b.startTime || 0).getTime())[0];

  const pendingAnalysisItems = useMemo(() => {
    if (!data.latestReport) return [];
    const items: { title: string; subtitle: string }[] = [];

    for (const t of (data.latestReport.pending_tasks || []).slice(0, 5)) {
      const taskText = typeof t === "string" ? t : t.task || "";
      const group = typeof t === "object" ? t.group || "" : "";
      if (!taskText) continue;
      items.push({
        title: taskText,
        subtitle: group ? `${group} · 待办` : "待办任务",
      });
    }

    return items;
  }, [data.latestReport]);

  const metricCards = [
    {
      label: "今日会议",
      value: todayMeetingsCount,
      meta: nextMeeting?.startTime ? `下一场 ${formatTime(nextMeeting.startTime)}` : "暂无会议",
      icon: Video,
      accent: "text-[var(--oc-text-primary)]",
    },
    {
      label: "待办任务",
      value: totalTasks,
      meta: overdueTasks.length > 0
        ? `${overdueTasks.length} 项已逾期`
        : data.unfinishedTasks.length > 0
          ? `${data.unfinishedTasks.length} 个历史未完成`
          : "今日无逾期",
      icon: CheckSquare,
      accent: overdueTasks.length > 0 ? "text-[var(--oc-error)]" : "text-[var(--oc-success)]",
    },
    {
      label: "风险项目",
      value: highRiskProjects,
      meta: highRiskProjects > 0 ? `${highRiskProjects} 个高风险项目` : "暂无高风险",
      icon: AlertTriangle,
      accent: highRiskProjects > 0 ? "text-[var(--oc-error)]" : "text-[var(--oc-text-secondary)]",
    },
    {
      label: "项目健康度",
      value: `${overallHealth}%`,
      meta: `${data.projects.length} 个项目平均进度`,
      icon: HeartPulse,
      accent: "text-[var(--oc-success)]",
    },
  ];

  function getMeetingStatusBadge(m: Meeting) {
    if (!m.startTime) return { label: "时间待定", variant: "outline" as const };
    const isPast = new Date(m.startTime) < new Date();
    if (m.hasIntelligence) return { label: "已同步", variant: "success" as const };
    if (isPast) return { label: "待转写", variant: "warning" as const };
    return { label: "待开始", variant: "default" as const };
  }

  function getTaskPriorityBadge(priority: string) {
    switch (priority) {
      case "high":
      case "P0":
        return { label: "P0", className: "bg-[var(--oc-error-soft)] text-[var(--oc-error)] border-transparent" };
      case "medium":
      case "P1":
        return { label: "P1", className: "bg-[var(--oc-warning-soft)] text-[var(--oc-warning)] border-transparent" };
      default:
        return { label: "P2", className: "bg-[var(--oc-bg-elevated)] text-[var(--oc-text-secondary)] border-transparent" };
    }
  }

  return (
    <div className="p-8">
      {/* Header */}
      <div className="mb-8 flex items-start justify-between">
        <div>
          <h1 className="text-[24px] font-bold tracking-tight text-[var(--oc-text-primary)]">
            今日工作驾驶舱
          </h1>
          <p className="mt-1 text-sm text-[var(--oc-text-secondary)]">
            {new Date().toLocaleDateString("zh-CN", { year: "numeric", month: "long", day: "numeric", weekday: "long" })} · {data.latestReport?.report_date ? `最新聊天分析：${data.latestReport.report_date}` : "暂无聊天分析报告"}
          </p>
        </div>
        <div className="flex items-center gap-3">
          <Button
            variant="outline"
            size="sm"
            className="h-9 gap-2 border-[var(--oc-border-subtle)] bg-[var(--oc-bg-surface)] text-[var(--oc-text-primary)] hover:bg-[var(--oc-bg-hover)] hover:text-[var(--oc-text-primary)]"
          >
            <RefreshCw className="h-4 w-4" strokeWidth={1.75} />
            同步数据
          </Button>
          <Button
            size="sm"
            className="h-9 gap-2 bg-[var(--oc-accent)] text-[var(--oc-bg-root)] hover:bg-[var(--oc-accent-hover)]"
          >
            <FileText className="h-4 w-4" strokeWidth={1.75} />
            生成日报
          </Button>
        </div>
      </div>

      {/* Metric Cards */}
      <div className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {metricCards.map((card) => {
          const Icon = card.icon;
          return (
            <div
              key={card.label}
              className="rounded-xl border border-[var(--oc-border-subtle)] bg-[var(--oc-bg-surface)] p-5 transition-all hover:border-[var(--oc-border-strong)]"
            >
              <div className="flex items-center gap-2 text-sm text-[var(--oc-text-secondary)]">
                <Icon className="h-4 w-4" strokeWidth={1.75} />
                {card.label}
              </div>
              <div className="mt-3 text-[32px] font-bold leading-none tracking-tight text-[var(--oc-text-primary)]">
                {data.isLoading ? "—" : card.value}
              </div>
              <div className={cn("mt-2 text-xs", card.accent)}>
                {data.isLoading ? "加载中..." : card.meta}
              </div>
            </div>
          );
        })}
      </div>

      {/* Middle Section: Meetings + Tasks */}
      <div className="mb-6 grid grid-cols-1 gap-6 lg:grid-cols-2">
        {/* Today's Meetings */}
        <div className="rounded-xl border border-[var(--oc-border-subtle)] bg-[var(--oc-bg-surface)]">
          <div className="flex items-center justify-between border-b border-[var(--oc-border-subtle)] px-5 py-4">
            <div className="flex items-center gap-2 text-[15px] font-semibold text-[var(--oc-text-primary)]">
              <Calendar className="h-[18px] w-[18px] text-[var(--oc-text-secondary)]" strokeWidth={1.75} />
              今日会议
            </div>
            <Link
              href="/tools/meeting-assistant"
              className="flex items-center gap-1 text-xs text-[var(--oc-text-secondary)] hover:text-[var(--oc-accent)]"
            >
              查看全部 <ArrowRight className="h-3 w-3" />
            </Link>
          </div>
          <div className="p-2">
            {data.isLoading ? (
              <div className="p-4 text-sm text-[var(--oc-text-secondary)]">加载中...</div>
            ) : data.todayMeetings.length === 0 ? (
              <div className="p-4 text-sm text-[var(--oc-text-secondary)]">今天暂无会议。</div>
            ) : (
              <ul className="space-y-1">
                {data.todayMeetings.slice(0, 5).map((m, i) => {
                  const status = getMeetingStatusBadge(m);
                  return (
                    <li
                      key={i}
                      className="flex items-center gap-3 rounded-lg p-3 transition-colors hover:bg-[var(--oc-bg-hover)]"
                    >
                      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-[var(--oc-bg-elevated)] text-[var(--oc-text-secondary)]">
                        <Users className="h-5 w-5" strokeWidth={1.75} />
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium text-[var(--oc-text-primary)]">
                          {m.title || "未命名会议"}
                        </p>
                        <p className="text-xs text-[var(--oc-text-tertiary)]">
                          {m.startTime
                            ? `${formatDateLabel(m.startTime)} ${formatTime(m.startTime)} · 腾讯会议`
                            : "时间待定"}
                        </p>
                      </div>
                      <Badge
                        variant="outline"
                        className={cn(
                          "shrink-0 text-[10px]",
                          status.variant === "success" && "border-transparent bg-[var(--oc-success-soft)] text-[var(--oc-success)]",
                          status.variant === "warning" && "border-transparent bg-[var(--oc-warning-soft)] text-[var(--oc-warning)]",
                          status.variant === "default" && "border-transparent bg-[var(--oc-bg-elevated)] text-[var(--oc-text-secondary)]"
                        )}
                      >
                        {status.label}
                      </Badge>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        </div>

        {/* Today's Tasks */}
        <div className="rounded-xl border border-[var(--oc-border-subtle)] bg-[var(--oc-bg-surface)]">
          <div className="flex items-center justify-between border-b border-[var(--oc-border-subtle)] px-5 py-4">
            <div className="flex items-center gap-2 text-[15px] font-semibold text-[var(--oc-text-primary)]">
              <CheckSquare className="h-[18px] w-[18px] text-[var(--oc-text-secondary)]" strokeWidth={1.75} />
              今日任务
            </div>
            <div className="flex items-center gap-2">
              <button className="rounded-full bg-[var(--oc-bg-elevated)] px-2.5 py-1 text-[10px] font-medium text-[var(--oc-text-primary)]">
                全部
              </button>
              <button className="rounded-full px-2.5 py-1 text-[10px] font-medium text-[var(--oc-text-tertiary)] hover:text-[var(--oc-text-secondary)]">
                P0
              </button>
              <button className="rounded-full px-2.5 py-1 text-[10px] font-medium text-[var(--oc-text-tertiary)] hover:text-[var(--oc-text-secondary)]">
                已逾期
              </button>
            </div>
          </div>
          <div className="p-2">
            {data.isLoading ? (
              <div className="p-4 text-sm text-[var(--oc-text-secondary)]">加载中...</div>
            ) : filteredTodayTasks.length === 0 && data.unfinishedTasks.length === 0 ? (
              <div className="p-4">
                <p className="text-sm text-[var(--oc-text-secondary)]">今天还没有计划任务。</p>
                <Link href="/daily">
                  <Button
                    variant="outline"
                    size="sm"
                    className="mt-3 border-[var(--oc-border-subtle)] text-[var(--oc-text-primary)] hover:bg-[var(--oc-bg-hover)]"
                  >
                    <Sparkles className="mr-1 h-3.5 w-3.5" />
                    去 Daily Plan 规划
                  </Button>
                </Link>
              </div>
            ) : (
              <ul className="space-y-1">
                {filteredTodayTasks.slice(0, 6).map((t) => {
                  const priority = getTaskPriorityBadge(t.priority);
                  const isOverdue =
                    t.status !== "completed" &&
                    t.expected_completion_at &&
                    new Date(t.expected_completion_at) < new Date();
                  return (
                    <li
                      key={t.id}
                      className="flex items-center gap-3 rounded-lg p-3 transition-colors hover:bg-[var(--oc-bg-hover)]"
                    >
                      <div
                        className={cn(
                          "flex h-5 w-5 shrink-0 cursor-pointer items-center justify-center rounded border transition-colors",
                          t.status === "completed"
                            ? "border-[var(--oc-success)] bg-[var(--oc-success)] text-[var(--oc-bg-root)]"
                            : "border-[var(--oc-border-strong)] hover:border-[var(--oc-accent)]"
                        )}
                      >
                        {t.status === "completed" && <CheckSquare className="h-3 w-3" />}
                      </div>
                      <div className="min-w-0 flex-1">
                        <p
                          className={cn(
                            "truncate text-sm",
                            t.status === "completed"
                              ? "text-[var(--oc-text-tertiary)] line-through"
                              : "text-[var(--oc-text-primary)]"
                          )}
                        >
                          {t.title}
                        </p>
                        <p className="text-xs text-[var(--oc-text-tertiary)]">
                          {t.expected_completion_at
                            ? `截止 ${formatDateLabel(t.expected_completion_at)} ${formatTime(t.expected_completion_at)}`
                            : t.notes || t.assignee || "无截止时间"}
                        </p>
                      </div>
                      <Badge className={cn("shrink-0 text-[10px]", priority.className)}>{priority.label}</Badge>
                    </li>
                  );
                })}
                {data.unfinishedTasks.length > 0 && (
                  <li className="border-t border-[var(--oc-border-subtle)] px-3 py-2">
                    <Link
                      href="/daily"
                      className="flex items-center gap-1 text-xs text-[var(--oc-text-tertiary)] hover:text-[var(--oc-accent)]"
                    >
                      还有 {data.unfinishedTasks.length} 个历史未完成任务 <ArrowRight className="h-3 w-3" />
                    </Link>
                  </li>
                )}
              </ul>
            )}
          </div>
        </div>
      </div>

      {/* Bottom Section: Health + Analysis + Quick Actions */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        {/* Project Health */}
        <div className="rounded-xl border border-[var(--oc-border-subtle)] bg-[var(--oc-bg-surface)] p-5">
          <div className="mb-4 flex items-center justify-between">
            <div className="flex items-center gap-2 text-[15px] font-semibold text-[var(--oc-text-primary)]">
              <HeartPulse className="h-[18px] w-[18px] text-[var(--oc-text-secondary)]" strokeWidth={1.75} />
              项目健康度
            </div>
            <span className="rounded-full bg-[var(--oc-success-soft)] px-2 py-0.5 text-[10px] font-medium text-[var(--oc-success)]">
              实时
            </span>
          </div>
          <div className="flex items-baseline gap-2">
            <span className="text-[40px] font-bold leading-none tracking-tight text-[var(--oc-text-primary)]">
              {data.isLoading ? "—" : `${overallHealth}%`}
            </span>
          </div>
          <div className="mt-3 h-1.5 w-full overflow-hidden rounded-full bg-[var(--oc-bg-elevated)]">
            <div
              className="h-full rounded-full bg-[var(--oc-accent)]"
              style={{ width: `${data.isLoading ? 0 : overallHealth}%` }}
            />
          </div>
          <p className="mt-3 text-xs text-[var(--oc-text-secondary)]">
            {data.isLoading ? "加载中..." : `${data.projects.length} 个执行中项目 · ${highRiskProjects} 个需关注`}
          </p>
        </div>

        {/* AI Pending Analysis */}
        <div className="rounded-xl border border-[var(--oc-border-subtle)] bg-[var(--oc-bg-surface)] p-5">
          <div className="mb-4 flex items-center justify-between">
            <div className="flex items-center gap-2 text-[15px] font-semibold text-[var(--oc-text-primary)]">
              <MessageSquare className="h-[18px] w-[18px] text-[var(--oc-text-secondary)]" strokeWidth={1.75} />
              AI 待分析
            </div>
            <span className="rounded-full bg-[var(--oc-bg-elevated)] px-2 py-0.5 text-[10px] font-medium text-[var(--oc-text-secondary)]">
              {pendingImports} 条
            </span>
          </div>
          {data.isLoading ? (
            <p className="text-sm text-[var(--oc-text-secondary)]">加载中...</p>
          ) : pendingAnalysisItems.length === 0 ? (
            <div className="text-sm text-[var(--oc-text-secondary)]">
              暂无 AI 提取的待确认事项。
              <Link
                href="/tools/chat-analyzer"
                className="ml-1 inline-flex items-center gap-0.5 text-[var(--oc-accent)] hover:underline"
              >
                去 Chat Analyzer <ArrowRight className="h-3 w-3" />
              </Link>
            </div>
          ) : (
            <>
              <p className="text-sm text-[var(--oc-text-secondary)]">
                最新报告（{data.latestReport?.report_date}）识别到以下待确认事项：
              </p>
              <ul className="mt-3 space-y-2">
                {pendingAnalysisItems.map((item, i) => (
                  <li key={i} className="flex items-start gap-2 text-sm text-[var(--oc-text-primary)]">
                    <MessageSquareText className="mt-0.5 h-4 w-4 shrink-0 text-[var(--oc-text-tertiary)]" strokeWidth={1.75} />
                    <div className="min-w-0 flex-1">
                      <p className="line-clamp-2">{item.title}</p>
                      <p className="text-xs text-[var(--oc-text-tertiary)]">{item.subtitle}</p>
                    </div>
                  </li>
                ))}
              </ul>
              <Link
                href="/tools/chat-analyzer"
                className="mt-3 inline-flex items-center gap-1 text-xs text-[var(--oc-accent)] hover:underline"
              >
                查看完整报告 <ArrowRight className="h-3 w-3" />
              </Link>
            </>
          )}
        </div>

        {/* Quick Actions */}
        <div className="rounded-xl border border-[var(--oc-border-subtle)] bg-[var(--oc-bg-surface)] p-5">
          <div className="mb-4 flex items-center gap-2 text-[15px] font-semibold text-[var(--oc-text-primary)]">
            <Zap className="h-[18px] w-[18px] text-[var(--oc-text-secondary)]" strokeWidth={1.75} />
            快捷操作
          </div>
          <div className="space-y-2">
            <Link
              href="/daily"
              className="flex items-center justify-between rounded-lg bg-[var(--oc-bg-elevated)] px-4 py-3 text-sm text-[var(--oc-text-primary)] transition-colors hover:bg-[var(--oc-bg-hover)]"
            >
              <span className="flex items-center gap-2">
                <ClipboardList className="h-4 w-4 text-[var(--oc-accent)]" strokeWidth={1.75} />
                生成今日日报
              </span>
              <ArrowRight className="h-4 w-4 text-[var(--oc-text-tertiary)]" />
            </Link>
            <Link
              href="/tools/meeting-assistant"
              className="flex items-center justify-between rounded-lg bg-[var(--oc-bg-elevated)] px-4 py-3 text-sm text-[var(--oc-text-primary)] transition-colors hover:bg-[var(--oc-bg-hover)]"
            >
              <span className="flex items-center gap-2">
                <Mic className="h-4 w-4 text-[var(--oc-accent)]" strokeWidth={1.75} />
                分析最新会议
              </span>
              <ArrowRight className="h-4 w-4 text-[var(--oc-text-tertiary)]" />
            </Link>
            <Link
              href="/projects"
              className="flex items-center justify-between rounded-lg bg-[var(--oc-bg-elevated)] px-4 py-3 text-sm text-[var(--oc-text-primary)] transition-colors hover:bg-[var(--oc-bg-hover)]"
            >
              <span className="flex items-center gap-2">
                <Search className="h-4 w-4 text-[var(--oc-accent)]" strokeWidth={1.75} />
                扫描项目风险
              </span>
              <ArrowRight className="h-4 w-4 text-[var(--oc-text-tertiary)]" />
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
