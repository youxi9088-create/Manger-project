"use client";

import { useEffect, useState, useMemo } from "react";
import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  LayoutDashboard,
  Plus,
  Search,
  AlertTriangle,
  CheckCircle,
  Clock,
  Users,
  ArrowRight,
  Filter,
  RefreshCw,
  Loader2,
  Zap,
} from "lucide-react";

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

const PHASE_LABELS: Record<string, { label: string; color: string }> = {
  draft: { label: "草稿", color: "bg-slate-500" },
  submitted: { label: "待审批", color: "bg-yellow-500" },
  approved: { label: "已批准", color: "bg-blue-500" },
  planning: { label: "规划中", color: "bg-indigo-500" },
  plan_locked: { label: "计划锁定", color: "bg-purple-500" },
  recruiting: { label: "招募中", color: "bg-pink-500" },
  executing: { label: "执行中", color: "bg-cyan-500" },
  delivering: { label: "交付中", color: "bg-orange-500" },
  reviewing: { label: "验收中", color: "bg-amber-500" },
  accepted: { label: "已完成", color: "bg-green-500" },
  rejected: { label: "已驳回", color: "bg-red-500" },
  archived: { label: "已归档", color: "bg-gray-500" },
};

function formatDeadline(deadline: string | null): { text: string; isOverdue: boolean; daysLeft: number | null } {
  if (!deadline) return { text: "无截止日", isOverdue: false, daysLeft: null };

  const deadlineDate = new Date(deadline);
  const today = new Date();
  const daysLeft = Math.ceil((deadlineDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));

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

function ProjectCard({ project }: { project: Project }) {
  const deadlineInfo = formatDeadline(project.deadline);
  const phaseInfo = PHASE_LABELS[project.current_phase] || { label: project.current_phase, color: "bg-slate-500" };
  const phaseStatus = JSON.parse(project.phase_status || "{}");
  const overallProgress = Math.round(
    ((phaseStatus.initiation || 0) +
      (phaseStatus.requirement || 0) +
      (phaseStatus.planning || 0) +
      (phaseStatus.execution || 0) +
      (phaseStatus.delivery || 0)) /
      5
  );

  return (
    <Link href={`/projects/${project.id}`}>
      <Card className="hover:shadow-lg transition-all cursor-pointer border-l-4 border-l-transparent hover:border-l-4 hover:scale-[1.01]">
        <CardHeader className="pb-2">
          <div className="flex items-start justify-between">
            <div className="flex-1 min-w-0">
              <CardTitle className="text-lg font-semibold line-clamp-2">{project.title || "(无标题)"}</CardTitle>
              {project.external_project_id && (
                <span className="text-xs text-muted-foreground mt-0.5 block">
                  ID: {project.external_project_id}
                </span>
              )}
            </div>
            {project.risk_level === "high" && (
              <AlertTriangle className="h-5 w-5 text-red-500 shrink-0" />
            )}
            {project.risk_level === "medium" && (
              <AlertTriangle className="h-5 w-5 text-yellow-500 shrink-0" />
            )}
          </div>
        </CardHeader>
        <CardContent className="space-y-3">
          {/* 进度条 */}
          <div className="space-y-1">
            <div className="flex justify-between text-xs text-muted-foreground">
              <span>整体进度</span>
              <span>{overallProgress}%</span>
            </div>
            <div className="h-2 bg-muted rounded-full overflow-hidden">
              <div
                className="h-full bg-primary transition-all"
                style={{ width: `${overallProgress}%` }}
              />
            </div>
          </div>

          {/* 阶段标签 */}
          <div className="flex items-center gap-2">
            <Badge className={`${phaseInfo.color} text-white`}>{phaseInfo.label}</Badge>
            <span className="text-xs text-muted-foreground">
              {project.team_size_current}/{project.team_size_required} 人
            </span>
          </div>

          {/* 截止倒计时 */}
          <div
            className={`text-sm flex items-center gap-1 ${
              deadlineInfo.isOverdue ? "text-red-500 font-medium" : "text-muted-foreground"
            }`}
          >
            <Clock className="h-4 w-4" />
            {deadlineInfo.text}
          </div>

          {/* 同步状态 */}
          {(() => {
            const sync = formatSyncLabel(project.last_synced_at);
            return (
              <div className={`text-xs flex items-center gap-1 ${sync.stale ? "text-amber-500" : "text-muted-foreground"}`}>
                <RefreshCw className={`h-3 w-3 ${sync.stale ? "" : "text-emerald-500"}`} />
                {sync.text}
              </div>
            );
          })()}

          {/* 箭头 */}
          <ArrowRight className="h-4 w-4 text-muted-foreground absolute bottom-4 right-4" />
        </CardContent>
      </Card>
    </Link>
  );
}

function formatSyncLabel(iso: string | null): { text: string; stale: boolean } {
  if (!iso) return { text: "从未同步", stale: true };
  const d = new Date(iso);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const syncDay = new Date(d);
  syncDay.setHours(0, 0, 0, 0);
  const diffDays = Math.floor((today.getTime() - syncDay.getTime()) / (1000 * 60 * 60 * 24));
  if (diffDays === 0) return { text: `今日 ${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")} 同步`, stale: false };
  if (diffDays === 1) return { text: "昨天同步", stale: true };
  return { text: `${diffDays} 天前同步`, stale: true };
}

export default function ProjectsPage() {
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [phaseFilter, setPhaseFilter] = useState<string>("all");
  const [total, setTotal] = useState(0);
  const [syncingAll, setSyncingAll] = useState(false);
  const [syncMsg, setSyncMsg] = useState<string | null>(null);

  // 加载项目列表
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
      const resp = await fetch(`${API_BASE}/api/projects/sync-all`, { method: "POST" });
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

  // 防抖搜索
  const handleSearch = useMemo(
    () => (e: React.ChangeEvent<HTMLInputElement>) => {
      setSearch(e.target.value);
    },
    []
  );

  // 统计
  const stats = useMemo(() => {
    const executing = projects.filter((p) => p.current_phase === "executing").length;
    const recruiting = projects.filter((p) => p.current_phase === "recruiting").length;
    const highRisk = projects.filter((p) => p.risk_level === "high").length;
    return { total, executing, recruiting, highRisk };
  }, [projects, total]);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight flex items-center gap-2">
            <LayoutDashboard className="h-8 w-8" />
            我的项目
          </h1>
          <p className="text-muted-foreground mt-1">项目总览</p>
        </div>
        <Link href="/tasks/project-initiation">
          <Button>
            <Plus className="h-4 w-4 mr-2" />
            新建项目
          </Button>
        </Link>
      </div>

      {/* 统计卡片 */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="pt-4">
            <div className="text-2xl font-bold">{stats.total}</div>
            <div className="text-sm text-muted-foreground">全部项目</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4">
            <div className="text-2xl font-bold text-cyan-500">{stats.executing}</div>
            <div className="text-sm text-muted-foreground">执行中</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4">
            <div className="text-2xl font-bold text-pink-500">{stats.recruiting}</div>
            <div className="text-sm text-muted-foreground">招募中</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4">
            <div className="text-2xl font-bold text-red-500">{stats.highRisk}</div>
            <div className="text-sm text-muted-foreground">高风险</div>
          </CardContent>
        </Card>
      </div>

      {/* 筛选栏 + 同步 */}
      <div className="flex items-center gap-4 flex-wrap">
        <div className="relative flex-1 max-w-sm">
          <Search className="h-4 w-4 absolute left-3 top-3 text-muted-foreground" />
          <Input
            placeholder="搜索项目..."
            value={search}
            onChange={handleSearch}
            className="pl-9"
          />
        </div>
        <select
          value={phaseFilter}
          onChange={(e) => setPhaseFilter(e.target.value)}
          className="h-10 px-3 rounded-md border bg-background"
        >
          <option value="all">所有阶段</option>
          <option value="draft">草稿</option>
          <option value="submitted">待审批</option>
          <option value="approved">已批准</option>
          <option value="planning">规划中</option>
          <option value="plan_locked">计划锁定</option>
          <option value="recruiting">招募中</option>
          <option value="executing">执行中</option>
          <option value="delivering">交付中</option>
          <option value="reviewing">验收中</option>
          <option value="accepted">已完成</option>
        </select>
        <Button variant="outline" size="sm" onClick={handleSyncAll} disabled={syncingAll}>
          {syncingAll ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : <Zap className="h-4 w-4 mr-1" />}
          同步全部状态
        </Button>
        {syncMsg && <span className="text-xs text-emerald-600">{syncMsg}</span>}
      </div>

      {/* 项目列表 */}
      {loading ? (
        <div className="text-center py-12 text-muted-foreground">加载中...</div>
      ) : projects.length === 0 ? (
        <div className="text-center py-12 text-muted-foreground">
          暂无项目，去新建一个吧
        </div>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {projects.map((project) => (
            <ProjectCard key={project.id} project={project} />
          ))}
        </div>
      )}
    </div>
  );
}