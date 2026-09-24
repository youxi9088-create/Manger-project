"use client";

import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import {
  TrendingUp,
  Flag,
  Clock,
  Users,
  BarChart3,
  CheckCircle,
  ArrowRight,
  Lightbulb,
  Loader2,
  Calendar,
  BookOpen,
  FileText,
  ChevronRight,
  Target,
  X,
} from "lucide-react";
import type { ProjectDetail } from "../../ProjectHeader";
import {
  cardSurface,
  metricCard,
  btnSecondary,
  btnGhost,
  PHASE_STYLES,
  oc,
} from "@/app/projects/_lib/styles";

const API_BASE = process.env.NEXT_PUBLIC_SERVER_API || "http://localhost:3001";

interface KbStageObjective {
  name?: string;
  target: string;
  important?: string;
  progress: string;
  version?: string;
  check_status?: string;
  status?: string;
}

interface KbWeeklyVersion {
  week?: string;
  time?: string;
  plan: string;
  importance?: string;
  effect?: string;
  progress: string;
  completion?: string;
}

interface KbGoalUserAttribute {
  type?: string;
  name: string;
  desc: string;
  inspiration?: string;
}

interface KbGoalUser {
  type?: string;
  desc?: string;
  attributes: KbGoalUserAttribute[];
}

interface KbSummary {
  project?: {
    id?: string;
    name?: string;
    status?: string;
    phase?: string;
    deadline?: string;
    vp?: string;
  };
  project_profile?: {
    name?: string;
    code?: string;
    project_id?: string | number;
    status_name?: string;
    lifecycle_phase_name?: string;
    plan_finish_date?: string;
    manage_vp?: string;
    importance?: number;
    summary?: string;
    original_intention?: string;
  };
  summary?: {
    overview?: string;
    mvp_goal?: string;
    current_progress?: string;
    delay_rate?: string;
  };
  core_values?: any[];
  goal_users?: KbGoalUser[];
  stage_objectives?:
    | KbStageObjective[]
    | {
        average?: string;
        delay_rate?: string;
        now_rate?: string;
        items?: KbStageObjective[];
      };
  weekly_versions?: KbWeeklyVersion[];
  monthly_plan?: any[];
  budget?: string;
}

function parseProgress(val: string): number {
  const n = parseFloat(String(val).replace("%", ""));
  return isNaN(n) ? 0 : Math.min(100, Math.max(0, n));
}

function fmtDate(iso: string): string {
  if (!iso) return "--";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return iso;
  return `${d.getMonth() + 1}月${d.getDate()}日`;
}

interface ProjectStats {
  task_total: number;
  task_done: number;
  task_in_progress: number;
  progress_percent: number;
  days_remaining: number | null;
  is_delayed: boolean;
  members_count: number;
}

interface PhaseLog {
  id: string;
  from_phase: string;
  to_phase: string;
  triggered_by: string | null;
  reason: string | null;
  created_at: string;
}

interface OverviewTabProps {
  projectId: string;
  project: ProjectDetail;
  onProjectUpdate: (p: ProjectDetail) => void;
  kbRefreshKey?: number;
}

export default function OverviewTab({
  projectId,
  project,
  onProjectUpdate,
  kbRefreshKey = 0,
}: OverviewTabProps) {
  const [stats, setStats] = useState<ProjectStats | null>(null);
  const [phaseLogs, setPhaseLogs] = useState<PhaseLog[]>([]);
  const [transitioning, setTransitioning] = useState(false);
  const [loading, setLoading] = useState(true);

  const [kbSummary, setKbSummary] = useState<KbSummary | null>(null);
  const [kbSummaryLoading, setKbSummaryLoading] = useState(false);
  const [kbContent, setKbContent] = useState<string | null>(null);
  const [kbLoading, setKbLoading] = useState(false);
  const [kbOpen, setKbOpen] = useState(false);
  const [kbActiveSection, setKbActiveSection] = useState("profile");

  useEffect(() => {
    loadData();
    if (project.knowledge_base_path) {
      loadKbSummary();
    }
  }, [projectId, project.knowledge_base_path, kbRefreshKey]);

  const loadData = async () => {
    setLoading(true);
    try {
      const [statsResp, logsResp] = await Promise.all([
        fetch(`${API_BASE}/api/projects/${projectId}`),
        fetch(`${API_BASE}/api/projects/${projectId}/phase-progress`),
      ]);
      const statsJson = await statsResp.json();
      const logsJson = await logsResp.json();
      if (statsJson.success) {
        setStats(statsJson.data.stats);
        setPhaseLogs(statsJson.data.phase_logs || []);
      }
    } catch (e) {
      console.error("加载概览数据失败:", e);
    } finally {
      setLoading(false);
    }
  };

  const loadKbSummary = async () => {
    setKbSummaryLoading(true);
    try {
      const resp = await fetch(
        `${API_BASE}/api/projects/${projectId}/kb-summary?t=${Date.now()}`
      );
      const json = await resp.json();
      if (json.success) {
        setKbSummary(json.data);
      }
    } catch (e) {
      console.error("加载知识库摘要失败:", e);
    } finally {
      setKbSummaryLoading(false);
    }
  };

  const loadKnowledgeBase = async () => {
    if (!project.knowledge_base_path) return;
    setKbLoading(true);
    try {
      const resp = await fetch(
        `${API_BASE}/api/projects/${projectId}/knowledge-base`
      );
      const json = await resp.json();
      if (json.success) {
        setKbContent(json.data.content);
        setKbOpen(true);
      }
    } catch (e) {
      console.error("加载知识库失败:", e);
    } finally {
      setKbLoading(false);
    }
  };

  const handleTransition = async (action: string) => {
    setTransitioning(true);
    try {
      const resp = await fetch(`${API_BASE}/api/projects/${projectId}/transition`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action }),
      });
      const json = await resp.json();
      if (json.success) {
        const refresh = await fetch(`${API_BASE}/api/projects/${projectId}`);
        const refreshed = await refresh.json();
        if (refreshed.success) onProjectUpdate(refreshed.data.project);
      }
    } catch (e) {
      console.error("状态流转失败:", e);
    } finally {
      setTransitioning(false);
    }
  };

  const getAvailableActions = () => {
    const actions: { label: string; action: string; primary?: boolean }[] = [];
    switch (project.current_phase) {
      case "draft":
        actions.push({ label: "提交立项", action: "submit", primary: true });
        break;
      case "submitted":
        actions.push({ label: "审批通过", action: "approve", primary: true });
        break;
      case "approved":
        actions.push({ label: "开始规划", action: "start_planning", primary: true });
        break;
      case "planning":
        actions.push({ label: "锁定计划", action: "lock_plan", primary: true });
        break;
      case "plan_locked":
        if (project.team_size_current < project.team_size_required) {
          actions.push({ label: "去招募", action: "recruiting", primary: true });
        } else {
          actions.push({ label: "开始执行", action: "start_execution", primary: true });
        }
        break;
      case "executing":
        actions.push({ label: "提交交付", action: "submit_delivery", primary: true });
        break;
      case "delivering":
        actions.push({ label: "开始验收", action: "start_review", primary: true });
        break;
      case "reviewing":
        actions.push({ label: "验收通过", action: "accept", primary: true });
        actions.push({ label: "验收驳回", action: "reject" });
        break;
      case "accepted":
        actions.push({ label: "归档项目", action: "archive" });
        break;
    }
    return actions;
  };

  const stageItems = (() => {
    const so = kbSummary?.stage_objectives;
    if (Array.isArray(so)) return so;
    if (so && typeof so === "object" && "items" in so) return so.items || [];
    return [];
  })();

  const stageCompleteCount = stageItems.filter(
    (s) => parseProgress(s.progress) >= 100
  ).length;
  const stageTotalCount = stageItems.length;
  const nowRate = (() => {
    const so = kbSummary?.stage_objectives;
    if (so && typeof so === "object" && "now_rate" in so) return (so as any).now_rate;
    return "";
  })();

  const recentWeeks = (kbSummary?.weekly_versions || []).slice(0, 3);

  const phaseStatus = JSON.parse(project.phase_status || "{}");
  const actions = getAvailableActions();
  const phases = [
    { key: "initiation", label: "立项", status: phaseStatus.initiation || 0 },
    { key: "requirement", label: "需求", status: phaseStatus.requirement || 0 },
    { key: "planning", label: "计划", status: phaseStatus.planning || 0 },
    { key: "execution", label: "执行", status: phaseStatus.execution || 0 },
    { key: "delivery", label: "交付", status: phaseStatus.delivery || 0 },
  ];

  return (
    <div className="space-y-4">
      {/* 快速操作 */}
      {actions.length > 0 && (
        <Card className={`${cardSurface} ${oc.accentBorder}`}>
          <CardContent className="p-[18px] flex items-center gap-3 flex-wrap">
            <span className="text-sm text-[var(--oc-text-secondary)]">
              下一步操作：
            </span>
            {actions.map((a) => (
              <Button
                key={a.action}
                size="sm"
                variant={a.primary ? "default" : "outline"}
                className={a.primary ? "" : btnSecondary}
                onClick={() => handleTransition(a.action)}
                disabled={transitioning}
              >
                {a.label}
              </Button>
            ))}
          </CardContent>
        </Card>
      )}

      {/* 统计面板 */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <div className={metricCard}>
          <div className="text-xs text-[var(--oc-text-secondary)] mb-2 flex items-center gap-1.5">
            <TrendingUp className="h-3.5 w-3.5" />
            整体进度
          </div>
          <div className="font-display text-[28px] font-bold tracking-[-0.03em] text-[var(--oc-text-primary)]">
            {stats?.progress_percent || 0}%
          </div>
          <div className="h-1.5 bg-[var(--oc-bg-hover)] rounded-full mt-2.5">
            <div
              className="h-full bg-[var(--oc-accent)] rounded-full transition-[width] duration-500"
              style={{ width: `${stats?.progress_percent || 0}%` }}
            />
          </div>
        </div>

        <div className={metricCard}>
          <div className="text-xs text-[var(--oc-text-secondary)] mb-2 flex items-center gap-1.5">
            <Flag className="h-3.5 w-3.5" />
            剩余任务
          </div>
          <div className="font-display text-[28px] font-bold tracking-[-0.03em] text-[var(--oc-text-primary)]">
            {(stats?.task_total || 0) - (stats?.task_done || 0)}
          </div>
          <div
            className={`text-xs mt-1.5 font-medium ${
              stats && stats.task_total - stats.task_done > 0
                ? oc.warning
                : oc.success
            }`}
          >
            已完成 {stats?.task_done || 0} / {stats?.task_total || 0}
          </div>
        </div>

        <div className={metricCard}>
          <div className="text-xs text-[var(--oc-text-secondary)] mb-2 flex items-center gap-1.5">
            <Clock className="h-3.5 w-3.5" />
            截止倒计时
          </div>
          <div
            className={`font-display text-[28px] font-bold tracking-[-0.03em] ${
              stats?.is_delayed ? oc.error : "text-[var(--oc-text-primary)]"
            }`}
          >
            {project.deadline
              ? stats?.days_remaining !== null && stats?.days_remaining !== undefined
                ? stats.days_remaining > 0
                  ? `${stats.days_remaining} 天`
                  : stats.days_remaining === 0
                    ? "今天截止"
                    : `已过期 ${Math.abs(stats.days_remaining)} 天`
                : "--"
              : "--"}
          </div>
          <div className="text-xs mt-1.5 font-medium text-[var(--oc-text-secondary)]">
            {stats?.is_delayed ? "已延期" : "剩余"}
          </div>
        </div>

        <div className={metricCard}>
          <div className="text-xs text-[var(--oc-text-secondary)] mb-2 flex items-center gap-1.5">
            <Users className="h-3.5 w-3.5" />
            团队规模
          </div>
          <div className="font-display text-[28px] font-bold tracking-[-0.03em] text-[var(--oc-text-primary)]">
            {project.team_size_current}
            <span className="text-base text-[var(--oc-text-secondary)] ml-1">
              / {project.team_size_required}
            </span>
          </div>
          <div className="text-xs mt-1.5 font-medium text-[var(--oc-text-secondary)]">
            当前 / 需求
          </div>
        </div>
      </div>

      {/* 阶段进度 */}
      <Card className={cardSurface}>
        <CardHeader className="pb-2">
          <CardTitle className="text-[13px] font-semibold text-[var(--oc-text-primary)] flex items-center gap-2">
            <BarChart3 className="h-4 w-4 text-[var(--oc-accent)]" />
            阶段进度
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-between relative px-2">
            <div className="absolute top-5 left-4 right-4 h-0.5 bg-[var(--oc-border-subtle)] -z-10" />
            {phases.map((phase, idx) => (
              <div key={phase.key} className="flex flex-col items-center z-0">
                <div
                  className={`w-10 h-10 rounded-full flex items-center justify-center border-2 text-sm font-semibold transition-colors ${
                    phase.status >= 1
                      ? "bg-[var(--oc-accent)] text-[var(--oc-bg-root)] border-[var(--oc-accent)]"
                      : phase.status > 0
                        ? "bg-[var(--oc-accent-soft)] text-[var(--oc-accent)] border-[var(--oc-accent)]"
                        : `${oc.bgSurface} border-[var(--oc-border-strong)] text-[var(--oc-text-tertiary)]`
                  }`}
                >
                  {phase.status >= 1 ? (
                    <CheckCircle className="h-5 w-5" />
                  ) : (
                    <span>{idx + 1}</span>
                  )}
                </div>
                <span className="text-xs mt-2 text-[var(--oc-text-secondary)]">
                  {phase.label}
                </span>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* 无知识库提示 */}
      {!project.knowledge_base_path && (
        <Card className={`${cardSurface} border-dashed bg-transparent`}>
          <CardContent className="p-[18px]">
            <div className="flex items-center gap-3">
              <BookOpen className="h-5 w-5 text-[var(--oc-text-tertiary)]" />
              <div>
                <p className="text-sm font-medium text-[var(--oc-text-secondary)]">
                  暂无知识库数据
                </p>
                <p className="text-xs text-[var(--oc-text-tertiary)] mt-0.5">
                  该项目未关联知识库，无法展示项目画像、周计划、阶段目标等信息。
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* 项目画像摘要 */}
      {kbSummary && (
        <Card className={cardSurface}>
          <CardHeader>
            <CardTitle className="text-[13px] font-semibold text-[var(--oc-text-primary)] flex items-center gap-2">
              <FileText className="h-4 w-4 text-[var(--oc-accent)]" />
              项目画像
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
              <div>
                <div className="text-[var(--oc-text-secondary)] text-xs mb-1">
                  项目代号
                </div>
                <div className="font-medium text-[var(--oc-text-primary)]">
                  {kbSummary?.project_profile?.code ||
                    kbSummary?.project?.id ||
                    "--"}
                </div>
              </div>
              <div>
                <div className="text-[var(--oc-text-secondary)] text-xs mb-1">
                  项目健康度
                </div>
                <div className="font-medium text-[var(--oc-text-primary)]">
                  {kbSummary?.project_profile?.status_name ||
                    kbSummary?.project?.status ||
                    kbSummary?.summary?.overview ||
                    "--"}
                </div>
              </div>
              <div>
                <div className="text-[var(--oc-text-secondary)] text-xs mb-1">
                  生命周期
                </div>
                <div className="font-medium text-[var(--oc-text-primary)]">
                  {kbSummary?.project_profile?.lifecycle_phase_name ||
                    kbSummary?.project?.phase ||
                    "--"}
                </div>
              </div>
              <div>
                <div className="text-[var(--oc-text-secondary)] text-xs mb-1">
                  重要度
                </div>
                <div className="font-medium text-[var(--oc-text-primary)]">
                  {kbSummary?.project_profile?.importance || "--"}
                </div>
              </div>
            </div>
            {kbSummary?.project_profile?.summary && (
              <>
                <Separator className="bg-[var(--oc-border-subtle)]" />
                <div>
                  <div className="text-[var(--oc-text-secondary)] text-xs mb-1.5">
                    项目概述
                  </div>
                  <p className="text-sm text-[var(--oc-text-secondary)] leading-relaxed whitespace-pre-wrap">
                    {kbSummary.project_profile.summary}
                  </p>
                </div>
              </>
            )}
            {kbSummary?.summary?.mvp_goal && (
              <>
                <Separator className="bg-[var(--oc-border-subtle)]" />
                <div>
                  <div className="text-[var(--oc-text-secondary)] text-xs mb-1.5">
                    MVP 目标
                  </div>
                  <p className="text-sm text-[var(--oc-text-secondary)] leading-relaxed">
                    {kbSummary.summary.mvp_goal}
                  </p>
                </div>
              </>
            )}
          </CardContent>
        </Card>
      )}

      {/* 最近周计划 */}
      {kbSummary && recentWeeks.length > 0 && (
        <Card className={cardSurface}>
          <CardHeader>
            <CardTitle className="text-[13px] font-semibold text-[var(--oc-text-primary)] flex items-center gap-2">
              <Calendar className="h-4 w-4 text-[var(--oc-accent)]" />
              最近周计划
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {recentWeeks.map((w, idx) => (
                <div key={idx} className="flex items-start gap-3">
                  <div className="flex flex-col items-center mt-1">
                    <div
                      className={`w-2.5 h-2.5 rounded-full ${
                        parseProgress(w.progress) >= 100
                          ? "bg-[var(--oc-success)]"
                          : parseProgress(w.progress) > 0
                            ? "bg-[var(--oc-accent)]"
                            : "bg-[var(--oc-border-strong)]"
                      }`}
                    />
                    {idx < recentWeeks.length - 1 && (
                      <div className="w-0.5 h-8 bg-[var(--oc-border-subtle)] mt-1" />
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-medium text-sm text-[var(--oc-text-primary)]">
                        {fmtDate(w.week || w.time || "")}
                      </span>
                      {w.importance && (
                        <Badge
                          variant="outline"
                          className="text-[11px] border-[var(--oc-border-subtle)] text-[var(--oc-text-secondary)]"
                        >
                          {w.importance}
                        </Badge>
                      )}
                      {w.progress && (
                        <Badge
                          className={`text-[11px] font-semibold ${
                            parseProgress(w.progress) >= 100
                              ? `${oc.successSoft} ${oc.success} ${oc.successBorder}`
                              : `${oc.accentSoft} ${oc.accent} ${oc.accentBorder}`
                          }`}
                        >
                          {w.progress}
                        </Badge>
                      )}
                    </div>
                    <p className="text-sm text-[var(--oc-text-secondary)] mt-1 line-clamp-2">
                      {w.plan}
                    </p>
                    {w.completion && (
                      <p className="text-xs text-[var(--oc-text-tertiary)] mt-1 line-clamp-1">
                        {w.completion.split("\n")[0]}
                      </p>
                    )}
                  </div>
                </div>
              ))}
            </div>
            <Button
              variant="ghost"
              size="sm"
              className={`${btnGhost} mt-3 gap-1 px-0`}
              onClick={loadKnowledgeBase}
              disabled={kbLoading}
            >
              查看全部 <ChevronRight className="h-3.5 w-3.5" />
            </Button>
          </CardContent>
        </Card>
      )}

      {/* 阶段目标详情 */}
      {kbSummary && stageItems.length > 0 && (
        <Card className={cardSurface}>
          <CardHeader>
            <CardTitle className="text-[13px] font-semibold text-[var(--oc-text-primary)] flex items-center gap-2">
              <Target className="h-4 w-4 text-[var(--oc-accent)]" />
              阶段目标详情
              <span className="text-xs text-[var(--oc-text-secondary)] font-normal ml-1">
                整体 {nowRate || "--"}
              </span>
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {stageItems.map((s, idx) => {
              const pct = parseProgress(s.progress);
              return (
                <div key={idx}>
                  <div className="flex items-center justify-between mb-1.5">
                    <span className="text-sm font-medium text-[var(--oc-text-primary)] line-clamp-1 flex-1 mr-2">
                      {s.name || s.target}
                    </span>
                    <div className="flex items-center gap-2 shrink-0">
                      {s.important && (
                        <Badge
                          variant="outline"
                          className="text-[11px] border-[var(--oc-border-subtle)] text-[var(--oc-text-secondary)]"
                        >
                          {s.important}
                        </Badge>
                      )}
                      <span className="text-xs text-[var(--oc-text-secondary)] w-10 text-right">
                        {s.progress}
                      </span>
                    </div>
                  </div>
                  <div className="h-1.5 bg-[var(--oc-bg-hover)] rounded-full overflow-hidden">
                    <div
                      className="h-full bg-[var(--oc-accent)] rounded-full transition-[width] duration-500"
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                  <div className="flex items-center justify-between mt-1">
                    <span className="text-xs text-[var(--oc-text-tertiary)]">
                      {s.version || s.status || ""}
                    </span>
                    <span className="text-xs text-[var(--oc-text-tertiary)]">
                      {s.check_status || ""}
                    </span>
                  </div>
                </div>
              );
            })}
          </CardContent>
        </Card>
      )}

      {/* 目标用户摘要 */}
      {kbSummary && kbSummary.goal_users && kbSummary.goal_users.length > 0 && (
        <Card className={cardSurface}>
          <CardHeader>
            <CardTitle className="text-[13px] font-semibold text-[var(--oc-text-primary)] flex items-center gap-2">
              <Users className="h-4 w-4 text-[var(--oc-accent)]" />
              目标用户
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {kbSummary.goal_users.map((u, idx) => (
                <div
                  key={idx}
                  className="p-3 rounded-[10px] bg-[var(--oc-bg-elevated)] border border-[var(--oc-border-subtle)]"
                >
                  <div className="font-medium text-sm text-[var(--oc-text-primary)] mb-1">
                    {u.type || "未命名用户群"}
                  </div>
                  <p className="text-xs text-[var(--oc-text-secondary)] line-clamp-3">
                    {u.desc}
                  </p>
                  {u.attributes.length > 0 && (
                    <div className="flex flex-wrap gap-1.5 mt-2">
                      {u.attributes.slice(0, 4).map((a, i) => (
                        <Badge
                          key={i}
                          className={`text-[11px] font-semibold ${oc.bgHover} ${oc.textSecondary} ${oc.borderSubtle}`}
                        >
                          {a.name}
                        </Badge>
                      ))}
                      {u.attributes.length > 4 && (
                        <Badge
                          className={`text-[11px] font-semibold ${oc.bgHover} ${oc.textSecondary} ${oc.borderSubtle}`}
                        >
                          +{u.attributes.length - 4}
                        </Badge>
                      )}
                    </div>
                  )}
                </div>
              ))}
            </div>
            <Button
              variant="ghost"
              size="sm"
              className={`${btnGhost} mt-3 gap-1 px-0`}
              onClick={loadKnowledgeBase}
              disabled={kbLoading}
            >
              查看完整用户画像 <ChevronRight className="h-3.5 w-3.5" />
            </Button>
          </CardContent>
        </Card>
      )}

      {/* 知识库入口 */}
      {project.knowledge_base_path && (
        <Card
          className={`${cardSurface} ${oc.accentBorder}`}
          style={{ background: "var(--oc-accent-soft)" }}
        >
          <CardContent className="p-[18px]">
            <div className="flex items-center justify-between gap-4">
              <div>
                <h3 className="text-sm font-semibold text-[var(--oc-accent)] flex items-center gap-2">
                  <BookOpen className="h-4 w-4" />
                  项目知识库
                </h3>
                <p className="text-xs text-[var(--oc-text-secondary)] mt-1">
                  项目画像、目标用户、阶段目标、周计划、预算等完整资料（每日自动刷新）
                </p>
              </div>
              <Button
                variant="outline"
                size="sm"
                className={btnSecondary}
                onClick={loadKnowledgeBase}
                disabled={kbLoading}
              >
                {kbLoading ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  "打开知识库"
                )}
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* 下一步行动建议 */}
      <Card className={cardSurface}>
        <CardHeader>
          <CardTitle className="text-[13px] font-semibold text-[var(--oc-text-primary)] flex items-center gap-2">
            <Lightbulb className="h-4 w-4 text-[var(--oc-accent)]" />
            下一步行动建议
          </CardTitle>
        </CardHeader>
        <CardContent>
          {project.current_phase === "planning" && (
            <p className="text-sm text-[var(--oc-text-secondary)]">
              建议点击「开始规划」，在需求分析页面完成任务拆解，并制定 2 周交付计划。
            </p>
          )}
          {project.current_phase === "plan_locked" &&
            project.team_size_current < project.team_size_required && (
              <p className="text-sm text-[var(--oc-text-secondary)]">
                团队人数不足，建议发布招募公告或调整团队规模要求。
              </p>
            )}
          {project.current_phase === "executing" &&
            stats &&
            stats.days_remaining !== null &&
            stats.days_remaining <= 3 && (
              <p className={`text-sm ${oc.warning}`}>
                距离截止仅剩 {stats.days_remaining} 天，建议优先完成核心任务。
              </p>
            )}
          {project.current_phase === "accepted" && (
            <p className="text-sm text-[var(--oc-text-secondary)]">
              项目已完成，可以归档。
            </p>
          )}
          {!project.current_phase && (
            <p className="text-sm text-[var(--oc-text-secondary)]">
              按阶段提示进行操作
            </p>
          )}
        </CardContent>
      </Card>

      {/* 阶段流转记录 */}
      {phaseLogs.length > 0 && (
        <Card className={cardSurface}>
          <CardHeader>
            <CardTitle className="text-[13px] font-semibold text-[var(--oc-text-primary)]">
              阶段流转记录
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {phaseLogs.slice(0, 5).map((log) => (
                <div
                  key={log.id}
                  className="flex items-center gap-2 text-sm"
                >
                  <ArrowRight className="h-4 w-4 text-[var(--oc-text-tertiary)]" />
                  <span className="text-[var(--oc-text-secondary)]">
                    {PHASE_STYLES[log.from_phase]?.label || log.from_phase}
                  </span>
                  <span className="text-[var(--oc-text-tertiary)]">→</span>
                  <span className="font-medium text-[var(--oc-text-primary)]">
                    {PHASE_STYLES[log.to_phase]?.label || log.to_phase}
                  </span>
                  <span className="text-[var(--oc-text-tertiary)] text-xs ml-auto">
                    {new Date(log.created_at).toLocaleDateString()}
                  </span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* 知识库弹窗 */}
      {kbOpen && kbContent && (
        <div className="fixed inset-0 z-50 bg-[rgba(13,13,15,0.7)] backdrop-blur-sm flex items-center justify-center p-4">
          <div className={`${cardSurface} w-full max-w-3xl flex flex-col max-h-[85vh]`}>
            <div className="flex items-center justify-between p-4 border-b border-[var(--oc-border-subtle)]">
              <div className="flex items-center gap-3">
                <h2 className="text-lg font-semibold text-[var(--oc-text-primary)]">
                  项目知识库
                </h2>
                <span className="text-xs text-[var(--oc-text-tertiary)]">
                  每日自动刷新
                </span>
              </div>
              <Button
                variant="ghost"
                size="icon"
                className={btnGhost}
                onClick={() => setKbOpen(false)}
              >
                <X className="h-4 w-4" />
              </Button>
            </div>
            <div className="flex border-b border-[var(--oc-border-subtle)]">
              {[
                { key: "profile", label: "项目画像" },
                { key: "users", label: "目标用户" },
                { key: "stages", label: "阶段目标" },
                { key: "weekly", label: "周计划" },
                { key: "raw", label: "原始内容" },
              ].map((tab) => (
                <button
                  key={tab.key}
                  className={`px-4 py-2.5 text-sm border-b-2 transition-colors ${
                    kbActiveSection === tab.key
                      ? "border-[var(--oc-accent)] text-[var(--oc-accent)]"
                      : "border-transparent text-[var(--oc-text-secondary)] hover:text-[var(--oc-text-primary)]"
                  }`}
                  onClick={() => setKbActiveSection(tab.key)}
                >
                  {tab.label}
                </button>
              ))}
            </div>
            <div className="p-4 overflow-auto flex-1">
              {kbActiveSection === "raw" ? (
                <pre className="text-sm whitespace-pre-wrap font-mono text-[var(--oc-text-secondary)] leading-relaxed">
                  {kbContent}
                </pre>
              ) : kbActiveSection === "profile" ? (
                <div className="space-y-4">
                  {kbSummary?.project_profile && (
                    <>
                      <div className="grid grid-cols-2 gap-4 text-sm text-[var(--oc-text-primary)]">
                        <div>
                          <span className="text-[var(--oc-text-secondary)]">代号：</span>
                          {kbSummary.project_profile.code}
                        </div>
                        <div>
                          <span className="text-[var(--oc-text-secondary)]">健康度：</span>
                          {kbSummary.project_profile.status_name}
                        </div>
                        <div>
                          <span className="text-[var(--oc-text-secondary)]">生命周期：</span>
                          {kbSummary.project_profile.lifecycle_phase_name}
                        </div>
                        <div>
                          <span className="text-[var(--oc-text-secondary)]">重要度：</span>
                          {kbSummary.project_profile.importance}
                        </div>
                        <div>
                          <span className="text-[var(--oc-text-secondary)]">计划完成：</span>
                          {fmtDate(kbSummary.project_profile.plan_finish_date || "")}
                        </div>
                        <div>
                          <span className="text-[var(--oc-text-secondary)]">VP：</span>
                          {kbSummary.project_profile.manage_vp}
                        </div>
                      </div>
                      <Separator className="bg-[var(--oc-border-subtle)]" />
                      <div>
                        <div className="font-medium text-sm text-[var(--oc-text-primary)] mb-1">
                          项目概述
                        </div>
                        <p className="text-sm text-[var(--oc-text-secondary)] whitespace-pre-wrap">
                          {kbSummary.project_profile.summary}
                        </p>
                      </div>
                    </>
                  )}
                </div>
              ) : kbActiveSection === "users" ? (
                <div className="space-y-3">
                  {kbSummary?.goal_users?.map((u, idx) => (
                    <div
                      key={idx}
                      className="p-3 rounded-[10px] border border-[var(--oc-border-subtle)]"
                    >
                      <div className="font-medium text-sm text-[var(--oc-text-primary)]">
                        {u.type}
                      </div>
                      <p className="text-sm text-[var(--oc-text-secondary)] mt-1">
                        {u.desc}
                      </p>
                      {u.attributes.map((a, i) => (
                        <div key={i} className="mt-2">
                          <Badge
                            className={`text-[11px] font-semibold ${oc.bgHover} ${oc.textSecondary} ${oc.borderSubtle}`}
                          >
                            {a.name}
                          </Badge>
                          <p className="text-xs text-[var(--oc-text-tertiary)] mt-0.5">
                            {a.desc}
                          </p>
                        </div>
                      ))}
                    </div>
                  )) || (
                    <p className="text-sm text-[var(--oc-text-secondary)]">
                      暂无目标用户数据
                    </p>
                  )}
                </div>
              ) : kbActiveSection === "stages" ? (
                <div className="space-y-3">
                  {stageItems.map((s, idx) => (
                    <div
                      key={idx}
                      className="p-3 rounded-[10px] border border-[var(--oc-border-subtle)]"
                    >
                      <div className="flex items-center justify-between">
                        <span className="font-medium text-sm text-[var(--oc-text-primary)]">
                          {s.name || s.target}
                        </span>
                        <Badge
                          className={`text-[11px] font-semibold ${oc.accentSoft} ${oc.accent} ${oc.accentBorder}`}
                        >
                          {s.progress}
                        </Badge>
                      </div>
                      <div className="h-1.5 bg-[var(--oc-bg-hover)] rounded-full mt-2">
                        <div
                          className="h-full bg-[var(--oc-accent)] rounded-full transition-[width] duration-500"
                          style={{ width: `${parseProgress(s.progress)}%` }}
                        />
                      </div>
                      <div className="flex items-center justify-between mt-1 text-xs text-[var(--oc-text-tertiary)]">
                        <span>{s.version}</span>
                        <span>{s.check_status || s.status}</span>
                      </div>
                    </div>
                  )) || (
                    <p className="text-sm text-[var(--oc-text-secondary)]">
                      暂无阶段目标数据
                    </p>
                  )}
                </div>
              ) : (
                <div className="space-y-3">
                  {kbSummary?.weekly_versions?.map((w, idx) => (
                    <div
                      key={idx}
                      className="p-3 rounded-[10px] border border-[var(--oc-border-subtle)]"
                    >
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-medium text-sm text-[var(--oc-text-primary)]">
                          {fmtDate(w.week || w.time || "")}
                        </span>
                        {w.importance && (
                          <Badge
                            variant="outline"
                            className="text-[11px] border-[var(--oc-border-subtle)] text-[var(--oc-text-secondary)]"
                          >
                            {w.importance}
                          </Badge>
                        )}
                        <Badge
                          className={`text-[11px] font-semibold ${
                            parseProgress(w.progress) >= 100
                              ? `${oc.successSoft} ${oc.success} ${oc.successBorder}`
                              : `${oc.bgHover} ${oc.textSecondary} ${oc.borderSubtle}`
                          }`}
                        >
                          {w.progress}
                        </Badge>
                      </div>
                      <p className="text-sm text-[var(--oc-text-secondary)] mt-1">
                        {w.plan}
                      </p>
                      {w.completion && (
                        <p className="text-xs text-[var(--oc-text-tertiary)] mt-1">
                          {w.completion}
                        </p>
                      )}
                    </div>
                  )) || (
                    <p className="text-sm text-[var(--oc-text-secondary)]">
                      暂无周计划数据
                    </p>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
