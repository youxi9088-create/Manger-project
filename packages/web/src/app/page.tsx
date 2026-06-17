"use client";

import { useEffect, useState, useMemo } from "react";
import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Calendar,
  CheckCircle2,
  Clock,
  AlertTriangle,
  MessageSquare,
  Video,
  ArrowRight,
  Sparkles,
  LayoutDashboard,
  Target,
  FolderKanban,
  TrendingUp,
} from "lucide-react";

const API_BASE = process.env.NEXT_PUBLIC_SERVER_API || "http://localhost:3001";

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
}

interface AnalysisReport {
  date: string;
  pending_tasks?: Array<{ task: string; owner?: string; due?: string; priority?: string }>;
  follow_ups?: Array<{ item: string; owner?: string; due?: string }>;
  risks?: Array<{ description: string; severity?: string }>;
  key_decisions?: Array<{ content: string }>;
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

  const today = useMemo(() => new Date().toISOString().slice(0, 10), []);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const [meetingsRes, dailyRes, reportsRes, projectsRes] = await Promise.all([
          fetch(`${API_BASE}/api/meetings`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({}) }).then(r => r.json()).catch(() => ({ records: [] })),
          fetch(`${API_BASE}/api/daily-plans/${today}`).then(r => r.json()).catch(() => ({ tasks: [], unfinishedTasks: [] })),
          fetch(`${API_BASE}/api/analysis/reports`).then(r => r.json()).catch(() => ({ reports: [] })),
          fetch(`${API_BASE}/api/projects?limit=50`).then(r => r.json()).catch(() => ({ projects: [] })),
        ]);

        if (cancelled) return;

        const meetings: Meeting[] = (meetingsRes.records || []).slice(0, 5);
        const todayTasks: DailyTask[] = dailyRes.tasks || [];
        const unfinished: DailyTask[] = dailyRes.unfinishedTasks || [];
        const reports: AnalysisReport[] = reportsRes.reports || [];
        const latest = reports[0] || null;
        const rawProjects = projectsRes.projects || [];
        const projects: ProjectSummary[] = rawProjects.map((p: any) => {
          const phaseStatus = typeof p.phase_status === "string" ? JSON.parse(p.phase_status || "{}") : p.phase_status || {};
          const progress = Math.round(
            ((phaseStatus.initiation || 0) +
              (phaseStatus.requirement || 0) +
              (phaseStatus.planning || 0) +
              (phaseStatus.execution || 0) +
              (phaseStatus.delivery || 0)) / 5 * 100
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

  const pendingMeetingConfirmations = data.todayMeetings.filter(
    (m) => m.startTime && new Date(m.startTime) < new Date() && !m.hasIntelligence
  );

  const overdueTasks = data.todayTasks.filter(
    (t) =>
      t.status !== "completed" &&
      t.expected_completion_at &&
      new Date(t.expected_completion_at) < new Date()
  );

  const pendingImports = data.latestReport?.pending_tasks?.length || 0;

  type Concern = { icon: typeof Video; label: string; href: string; tone: "warning" | "danger" | "info" };
  const concerns: Concern[] = [
    pendingMeetingConfirmations.length > 0 && {
      icon: Video,
      label: `${pendingMeetingConfirmations.length} 场会议纪要待确认`,
      href: "/tools/meeting-assistant",
      tone: "warning" as const,
    },
    overdueTasks.length > 0 && {
      icon: AlertTriangle,
      label: `${overdueTasks.length} 个任务已逾期`,
      href: "/daily",
      tone: "danger" as const,
    },
    pendingImports > 0 && {
      icon: MessageSquare,
      label: `聊天分析发现 ${pendingImports} 条待办可导入`,
      href: "/tools/chat-analyzer",
      tone: "info" as const,
    },
  ].filter((c): c is Concern => Boolean(c));

  const todayMeetingsCount = data.todayMeetings.filter((m) => {
    if (!m.startTime) return false;
    const d = new Date(m.startTime);
    return d.toISOString().slice(0, 10) === today;
  }).length;

  const completedTasks = data.todayTasks.filter((t) => t.status === "completed").length;
  const totalTasks = data.todayTasks.length;

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <LayoutDashboard className="h-6 w-6" />
            今日工作驾驶舱
          </h1>
          <p className="text-muted-foreground text-sm mt-1">
            {new Date().toLocaleDateString("zh-CN", { month: "long", day: "numeric", weekday: "long" })}
          </p>
        </div>
        <div className="flex gap-2">
          <Link href="/daily">
            <Button variant="outline" size="sm">
              <Target className="h-4 w-4 mr-1" />
              今日任务
            </Button>
          </Link>
          <Link href="/tools/meeting-assistant">
            <Button variant="outline" size="sm">
              <Video className="h-4 w-4 mr-1" />
              会议助手
            </Button>
          </Link>
        </div>
      </div>

      {/* 今日关注 */}
      <Card className={concerns.length > 0 ? "border-amber-500/30" : "border-green-500/30"}>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            {concerns.length > 0 ? (
              <>
                <AlertTriangle className="h-5 w-5 text-amber-500" />
                今日关注（{concerns.length} 项）
              </>
            ) : (
              <>
                <CheckCircle2 className="h-5 w-5 text-green-500" />
                今日暂无紧急关注项
              </>
            )}
          </CardTitle>
        </CardHeader>
        <CardContent>
          {concerns.length > 0 ? (
            <ul className="space-y-2">
              {concerns.map((c, i) => (
                <li key={i}>
                  <Link href={c.href} className="flex items-center gap-3 p-2 rounded-lg hover:bg-muted transition-colors">
                    <c.icon className={`h-4 w-4 ${c.tone === "danger" ? "text-red-500" : c.tone === "warning" ? "text-amber-500" : "text-blue-500"}`} />
                    <span className="text-sm">{c.label}</span>
                    <ArrowRight className="h-3 w-3 ml-auto text-muted-foreground" />
                  </Link>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-muted-foreground">会议、任务、聊天分析均无紧急事项，可以安心推进重点工作。</p>
          )}
        </CardContent>
      </Card>

      {/* 两栏：今日会议 + 今日任务 */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <Calendar className="h-5 w-5" />
              今日会议（{todayMeetingsCount} 场）
            </CardTitle>
          </CardHeader>
          <CardContent>
            {data.isLoading ? (
              <p className="text-sm text-muted-foreground">加载中...</p>
            ) : data.todayMeetings.length === 0 ? (
              <p className="text-sm text-muted-foreground">今天暂无会议。</p>
            ) : (
              <ul className="space-y-2">
                {data.todayMeetings.slice(0, 5).map((m, i) => {
                  const isPast = m.startTime ? new Date(m.startTime) < new Date() : false;
                  return (
                    <li key={i} className="flex items-center justify-between p-2 rounded-lg hover:bg-muted transition-colors">
                      <div className="flex items-center gap-3">
                        <div className={`w-1.5 h-8 rounded-full ${isPast ? "bg-muted" : "bg-blue-500"}`} />
                        <div>
                          <p className="text-sm font-medium">{m.title || "未命名会议"}</p>
                          <p className="text-xs text-muted-foreground">
                            {m.startTime ? `${formatDateLabel(m.startTime)} ${formatTime(m.startTime)}` : "时间待定"}
                          </p>
                        </div>
                      </div>
                      <Link href="/tools/meeting-assistant">
                        <Button size="sm" variant={m.hasIntelligence ? "ghost" : "outline"}>
                          {m.hasIntelligence ? "查看" : isPast ? "生成纪要" : "详情"}
                        </Button>
                      </Link>
                    </li>
                  );
                })}
              </ul>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <CheckCircle2 className="h-5 w-5" />
              今日任务（{completedTasks}/{totalTasks || 0}）
            </CardTitle>
          </CardHeader>
          <CardContent>
            {data.isLoading ? (
              <p className="text-sm text-muted-foreground">加载中...</p>
            ) : data.todayTasks.length === 0 && data.unfinishedTasks.length === 0 ? (
              <div className="space-y-3">
                <p className="text-sm text-muted-foreground">今天还没有计划任务。</p>
                <Link href="/daily">
                  <Button size="sm" variant="outline">
                    <Sparkles className="h-3.5 w-3.5 mr-1" />
                    去 Daily Plan 规划
                  </Button>
                </Link>
              </div>
            ) : (
              <ul className="space-y-2">
                {data.todayTasks.slice(0, 6).map((t) => (
                  <li key={t.id} className="flex items-center gap-2 p-2 rounded-lg hover:bg-muted transition-colors">
                    <div
                      className={`w-2 h-2 rounded-full ${
                        t.status === "completed"
                          ? "bg-green-500"
                          : t.priority === "high"
                          ? "bg-red-500"
                          : t.priority === "medium"
                          ? "bg-amber-500"
                          : "bg-blue-500"
                      }`}
                    />
                    <span className={`text-sm flex-1 ${t.status === "completed" ? "line-through text-muted-foreground" : ""}`}>
                      {t.title}
                    </span>
                    {t.status !== "completed" && t.expected_completion_at && new Date(t.expected_completion_at) < new Date() && (
                      <Badge variant="destructive" className="text-xs">逾期</Badge>
                    )}
                  </li>
                ))}
                {data.unfinishedTasks.length > 0 && (
                  <li className="pt-2 border-t">
                    <Link href="/daily" className="text-xs text-muted-foreground hover:text-foreground flex items-center gap-1">
                      还有 {data.unfinishedTasks.length} 个历史未完成任务 <ArrowRight className="h-3 w-3" />
                    </Link>
                  </li>
                )}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>

      {/* 项目健康度 */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <FolderKanban className="h-5 w-5" />
            项目健康度
            {data.projects.length > 0 && <Badge variant="secondary" className="text-xs">{data.projects.length}</Badge>}
          </CardTitle>
        </CardHeader>
        <CardContent>
          {data.isLoading ? (
            <p className="text-sm text-muted-foreground">加载中...</p>
          ) : data.projects.length === 0 ? (
            <p className="text-sm text-muted-foreground">暂无项目数据。</p>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
              {data.projects.slice(0, 6).map((p) => {
                const deadlineText = p.deadline
                  ? formatDateLabel(p.deadline)
                  : "无截止日";
                const isOverdue = p.deadline ? new Date(p.deadline) < new Date() : false;
                return (
                  <Link key={p.id} href={`/projects/${p.id}`}>
                    <div className={`p-3 rounded-lg border hover:bg-muted/50 transition-colors ${p.risk_level === "high" ? "border-red-500/30 bg-red-500/5" : ""}`}>
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-sm font-medium truncate flex-1">{p.title || "(无标题)"}</span>
                        {p.risk_level === "high" && <AlertTriangle className="h-4 w-4 text-red-500 shrink-0" />}
                      </div>
                      <div className="mt-2 flex items-center gap-2 text-xs text-muted-foreground">
                        <span className="px-1.5 py-0.5 rounded bg-muted">{p.current_phase}</span>
                        <span className={isOverdue ? "text-red-500" : ""}>{deadlineText}</span>
                      </div>
                      <div className="mt-2 flex items-center gap-2">
                        <div className="flex-1 h-1.5 bg-muted rounded-full overflow-hidden">
                          <div
                            className={`h-full rounded-full ${p.risk_level === "high" ? "bg-red-500" : "bg-emerald-500"}`}
                            style={{ width: `${Math.max(0, Math.min(100, p.progress || 0))}%` }}
                          />
                        </div>
                        <span className="text-[10px] text-muted-foreground w-8 text-right">{p.progress || 0}%</span>
                      </div>
                    </div>
                  </Link>
                );
              })}
            </div>
          )}
          <div className="mt-3">
            <Link href="/projects" className="text-xs text-muted-foreground hover:text-foreground flex items-center gap-1">
              查看全部项目 <ArrowRight className="h-3 w-3" />
            </Link>
          </div>
        </CardContent>
      </Card>

      {/* 一键处理 */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <Sparkles className="h-5 w-5" />
            一键处理
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap gap-3">
            <Link href="/daily">
              <Button variant="outline" size="sm">
                <Target className="h-4 w-4 mr-1" />
                规划今日任务
              </Button>
            </Link>
            <Link href="/tools/meeting-assistant">
              <Button variant="outline" size="sm">
                <Video className="h-4 w-4 mr-1" />
                处理会议纪要
              </Button>
            </Link>
            <Link href="/tools/chat-analyzer">
              <Button variant="outline" size="sm">
                <MessageSquare className="h-4 w-4 mr-1" />
                查看聊天情报
              </Button>
            </Link>
            <Link href="/projects">
              <Button variant="outline" size="sm">
                <Clock className="h-4 w-4 mr-1" />
                查看项目进展
              </Button>
            </Link>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
