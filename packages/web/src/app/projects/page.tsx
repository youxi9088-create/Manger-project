"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Plus,
  Search,
  AlertTriangle,
  Clock,
  RefreshCw,
  Loader2,
  Zap,
  Filter,
} from "lucide-react";
import {
  cardInteractive,
  cardSurface,
  metricCard,
  pageHeader,
  pageTitle,
  pageSubtitle,
  btnPrimary,
  btnSecondary,
  inputOc,
  PHASE_STYLES,
  RISK_STYLES,
  oc,
} from "@/app/projects/_lib/styles";

const API_BASE = process.env.NEXT_PUBLIC_SERVER_API || "http://localhost:3001";

interface Project {
  id: string;
  title: string;
  current_phase: string;
  phase_status: string;
  risk_level: "low" | "medium" | "high";
  deadline: string | null;
  team_size_required: number;
  team_size_current: number;
  external_project_id: string | null;
  vp: string | null;
  knowledge_base_path: string | null;
  created_at: string;
  updated_at: string;
  last_synced_at: string | null;
}

const PHASE_CHIPS = [
  { value: "all", label: "全部阶段" },
  { value: "planning", label: "需求分析" },
  { value: "executing", label: "开发中" },
  { value: "reviewing", label: "测试验收" },
  { value: "accepted", label: "已上线" },
];

function formatDeadline(deadline: string | null): {
  text: string;
  isOverdue: boolean;
  daysLeft: number | null;
} {
  if (!deadline) return { text: "无截止日", isOverdue: false, daysLeft: null };

  const deadlineDate = new Date(deadline);
  const today = new Date();
  const daysLeft = Math.ceil(
    (deadlineDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24)
  );

  if (daysLeft < 0) {
    return { text: `延期 ${Math.abs(daysLeft)} 天`, isOverdue: true, daysLeft };
  } else if (daysLeft === 0) {
    return { text: "今天截止", isOverdue: false, daysLeft: 0 };
  } else if (daysLeft <= 3) {
    return { text: `还剩 ${daysLeft} 天`, isOverdue: false, daysLeft };
  } else {
    return { text: `${daysLeft} 天`, isOverdue: false, daysLeft };
  }
}

function formatSyncLabel(iso: string | null): { text: string; stale: boolean } {
  if (!iso) return { text: "从未同步", stale: true };
  const d = new Date(iso);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const syncDay = new Date(d);
  syncDay.setHours(0, 0, 0, 0);
  const diffDays = Math.floor(
    (today.getTime() - syncDay.getTime()) / (1000 * 60 * 60 * 24)
  );
  if (diffDays === 0)
    return {
      text: `今日 ${String(d.getHours()).padStart(2, "0")}:${String(
        d.getMinutes()
      ).padStart(2, "0")} 同步`,
      stale: false,
    };
  if (diffDays === 1) return { text: "昨天同步", stale: true };
  return { text: `${diffDays} 天前同步`, stale: true };
}

function ProjectCard({ project }: { project: Project }) {
  const deadlineInfo = formatDeadline(project.deadline);
  const phase = PHASE_STYLES[project.current_phase] || {
    label: project.current_phase,
    classes: oc.bgHover + " " + oc.textSecondary + " " + oc.borderSubtle,
  };
  const risk = RISK_STYLES[project.risk_level] || {
    label: project.risk_level,
    classes: oc.bgHover + " " + oc.textSecondary + " " + oc.borderSubtle,
  };
  const phaseStatus = JSON.parse(project.phase_status || "{}");
  const overallProgress = Math.round(
    ((phaseStatus.initiation || 0) +
      (phaseStatus.requirement || 0) +
      (phaseStatus.planning || 0) +
      (phaseStatus.execution || 0) +
      (phaseStatus.delivery || 0)) /
      5
  );
  const sync = formatSyncLabel(project.last_synced_at);

  return (
    <Link href={`/projects/${project.id}`}>
      <Card className={cardInteractive}>
        <CardContent className="p-[18px] flex flex-col gap-3.5">
          {/* Header */}
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0 flex-1">
              <div className="font-bold text-sm text-[var(--oc-text-primary)] leading-snug line-clamp-2">
                {project.title || "（无标题）"}
              </div>
              {project.external_project_id && (
                <div className="font-mono text-[11px] text-[var(--oc-text-tertiary)] mt-0.5">
                  {project.external_project_id}
                </div>
              )}
            </div>
            <Badge className={`${phase.classes} text-[11px] font-semibold shrink-0`}>
              {phase.label}
            </Badge>
          </div>

          {/* 进度 */}
          <div>
            <div className="flex items-center justify-between text-xs text-[var(--oc-text-secondary)] mb-1.5">
              <span>整体进度</span>
              <span className="font-display font-semibold text-[var(--oc-text-primary)]">
                {overallProgress}%
              </span>
            </div>
            <div className="h-1.5 bg-[var(--oc-bg-hover)] rounded-full overflow-hidden">
              <div
                className="h-full bg-[var(--oc-accent)] rounded-full transition-[width] duration-500"
                style={{ width: `${overallProgress}%` }}
              />
            </div>
          </div>

          {/* Meta rows */}
          <div className="space-y-1">
            <div className="flex items-center justify-between text-xs text-[var(--oc-text-secondary)]">
              <span className="flex items-center gap-1">
                <Clock className="h-3 w-3" />
                截止剩余
              </span>
              <span className={deadlineInfo.isOverdue ? oc.error : ""}>
                {deadlineInfo.text}
              </span>
            </div>
            <div className="flex items-center justify-between text-xs text-[var(--oc-text-secondary)]">
              <span className="flex items-center gap-1">
                <AlertTriangle className="h-3 w-3" />
                风险
              </span>
              <Badge className={`${risk.classes} text-[11px] font-semibold`}>
                {risk.label}
              </Badge>
            </div>
            <div className="flex items-center justify-between text-xs text-[var(--oc-text-secondary)]">
              <span className="flex items-center gap-1">
                <RefreshCw className="h-3 w-3" />
                最后同步
              </span>
              <span className={sync.stale ? oc.warning : oc.success}>{sync.text}</span>
            </div>
          </div>
        </CardContent>
      </Card>
    </Link>
  );
}

export default function ProjectsPage() {
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [phaseFilter, setPhaseFilter] = useState<string>("all");
  const [total, setTotal] = useState(0);
  const [syncingAll, setSyncingAll] = useState(false);
  const [syncMsg, setSyncMsg] = useState<string | null>(null);

  const loadProjects = async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (search) params.set("search", search);
      if (phaseFilter !== "all") params.set("phase", phaseFilter);

      const resp = await fetch(`${API_BASE}/api/projects?${params}`);
      const json = await resp.json();
      if (json.success) {
        setProjects(json.data || json.projects || []);
        setTotal(json.total || (json.data?.length || 0));
      }
    } catch (e) {
      console.error("加载失败:", e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadProjects();
  }, [search, phaseFilter]);

  const handleSyncAll = async () => {
    setSyncingAll(true);
    setSyncMsg(null);
    try {
      const resp = await fetch(`${API_BASE}/api/projects/sync-all`, {
        method: "POST",
      });
      const json = await resp.json();
      if (json.success) {
        setSyncMsg(`已同步 ${json.data.updated}/${json.data.total} 个项目`);
        await loadProjects();
      } else {
        setSyncMsg("同步失败");
      }
    } catch {
      setSyncMsg("同步失败");
    } finally {
      setSyncingAll(false);
      setTimeout(() => setSyncMsg(null), 4000);
    }
  };

  const handleSearch = useMemo(
    () => (e: React.ChangeEvent<HTMLInputElement>) => {
      setSearch(e.target.value);
    },
    []
  );

  const stats = useMemo(() => {
    const executing = projects.filter((p) => p.current_phase === "executing").length;
    const recruiting = projects.filter((p) => p.current_phase === "recruiting").length;
    const highRisk = projects.filter((p) => p.risk_level === "high").length;
    return { total, executing, recruiting, highRisk };
  }, [projects, total]);

  return (
    <div className="p-7 space-y-6">
      {/* Header */}
      <div className={pageHeader}>
        <div>
          <h1 className={pageTitle}>项目列表</h1>
          <p className={pageSubtitle}>
            管理全部项目进度、阶段、风险与同步状态
          </p>
        </div>
        <div className="flex items-center gap-2.5 flex-wrap">
          <Button
            variant="outline"
            size="sm"
            className={btnSecondary}
            onClick={handleSyncAll}
            disabled={syncingAll}
          >
            {syncingAll ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Zap className="h-4 w-4" />
            )}
            同步全部状态
          </Button>
          <Link href="/tasks/project-initiation">
            <Button size="sm" className={btnPrimary}>
              <Plus className="h-4 w-4" />
              新建项目
            </Button>
          </Link>
        </div>
      </div>

      {/* Metrics */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className={metricCard}>
          <div className="text-xs text-[var(--oc-text-secondary)] mb-2 flex items-center gap-1.5">
            总项目
          </div>
          <div className="font-display text-[28px] font-bold tracking-[-0.03em] text-[var(--oc-text-primary)]">
            {stats.total}
          </div>
          <div className={`text-xs mt-1.5 font-medium ${oc.success}`}>
            占总数 {stats.total ? "100%" : "0%"}
          </div>
        </div>
        <div className={metricCard}>
          <div className="text-xs text-[var(--oc-text-secondary)] mb-2 flex items-center gap-1.5">
            执行中
          </div>
          <div className="font-display text-[28px] font-bold tracking-[-0.03em] text-[var(--oc-text-primary)]">
            {stats.executing}
          </div>
          <div className={`text-xs mt-1.5 font-medium ${oc.warning}`}>
            占总数 {stats.total ? Math.round((stats.executing / stats.total) * 100) : 0}%
          </div>
        </div>
        <div className={metricCard}>
          <div className="text-xs text-[var(--oc-text-secondary)] mb-2 flex items-center gap-1.5">
            招募中
          </div>
          <div className="font-display text-[28px] font-bold tracking-[-0.03em] text-[var(--oc-text-primary)]">
            {stats.recruiting}
          </div>
          <div className="text-xs mt-1.5 font-medium text-[var(--oc-text-secondary)]">
            {stats.recruiting > 0 ? "等待资源到位" : "暂无招募需求"}
          </div>
        </div>
        <div className={metricCard}>
          <div className="text-xs text-[var(--oc-text-secondary)] mb-2 flex items-center gap-1.5">
            高风险
          </div>
          <div className="font-display text-[28px] font-bold tracking-[-0.03em] text-[var(--oc-text-primary)]">
            {stats.highRisk}
          </div>
          <div className={`text-xs mt-1.5 font-medium ${oc.error}`}>
            {stats.highRisk > 0 ? "需本周内处理" : "暂无高风险项"}
          </div>
        </div>
      </div>

      {/* Filter bar */}
      <Card className={`${cardSurface} py-0`}>
        <CardContent className="p-[18px]">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div className="relative w-full max-w-[320px]">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-[var(--oc-text-tertiary)]" />
              <Input
                placeholder="搜索项目名称、ID、负责人…"
                value={search}
                onChange={handleSearch}
                className={`${inputOc} pl-9 h-10`}
              />
            </div>
            <div className="flex items-center gap-2 flex-wrap">
              <Filter className="h-4 w-4 text-[var(--oc-text-tertiary)]" />
              {PHASE_CHIPS.map((chip) => {
                const active = phaseFilter === chip.value;
                return (
                  <button
                    key={chip.value}
                    onClick={() => setPhaseFilter(chip.value)}
                    className={`px-2.5 py-1.5 rounded-full text-[13px] font-semibold border transition-colors ${
                      active
                        ? `${oc.accentSoft} ${oc.accent} ${oc.accentBorder}`
                        : `${oc.bgElevated} ${oc.borderSubtle} ${oc.textSecondary} hover:${oc.bgHover} hover:${oc.textPrimary}`
                    }`}
                  >
                    {chip.label}
                  </button>
                );
              })}
            </div>
          </div>
        </CardContent>
      </Card>

      {syncMsg && (
        <div className="text-xs text-[var(--oc-success)]">{syncMsg}</div>
      )}

      {/* Project grid */}
      {loading ? (
        <div className="text-center py-12 text-[var(--oc-text-secondary)]">
          加载中…
        </div>
      ) : projects.length === 0 ? (
        <div className="text-center py-12 text-[var(--oc-text-secondary)]">
          暂无项目，点击「新建项目」开始
        </div>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {projects.map((project) => (
            <ProjectCard key={project.id} project={project} />
          ))}
        </div>
      )}
    </div>
  );
}
