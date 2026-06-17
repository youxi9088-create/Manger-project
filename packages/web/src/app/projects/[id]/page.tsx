"use client";

import { useEffect, useState, use } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Progress } from "@/components/ui/progress";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import {
  ArrowLeft,
  Users,
  CheckCircle,
  Clock,
  AlertTriangle,
  ArrowRight,
  Lightbulb,
  Target,
  BarChart3,
  Package,
  Calendar,
  Plus,
  PlayCircle,
  BookOpen,
  Flag,
  TrendingUp,
  ChevronRight,
  FileText,
  Zap,
  Contact,
  MessageSquareWarning,
  RefreshCw,
  Loader2,
} from "lucide-react";

/* ─── 接口 ─── */
interface SprintTask {
  id: string;
  title: string;
  description: string | null;
  status: string;
  priority: string;
  estimated_hours: number | null;
  actual_hours: number | null;
  start_date: string | null;
  due_date: string | null;
  sprint_week: number | null;
  requirement_id: string;
  sort_order: number;
  created_at: string;
}

interface SprintWeeks {
  [week: number]: SprintTask[];
}

const API_BASE = process.env.NEXT_PUBLIC_SERVER_API || "http://localhost:3001";

interface ProjectDetail {
  id: string;
  title: string;
  type: string;
  current_phase: string;
  phase_status: string;
  risk_level: string;
  risk_reason: string | null;
  deadline: string | null;
  start_date: string | null;
  team_size_required: number;
  team_size_current: number;
  external_project_id: string | null;
  vp: string | null;
  knowledge_base_path: string | null;
  created_at: string;
  last_synced_at: string | null;
}

interface ProjectMember {
  id: string;
  employee_id: string;
  employee_name: string;
  employee_avatar: string | null;
  role: string;
  joined_at: string;
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

/* ─── 知识库摘要接口 ─── */
interface KbStageObjective {
  target: string;
  important: string;
  progress: string;
  version: string;
  check_status: string;
}

interface KbWeeklyVersion {
  time: string;
  plan: string;
  importance: string;
  effect: string;
  progress: string;
  completion: string;
}

interface KbGoalUserAttribute {
  type: string;
  name: string;
  desc: string;
  inspiration: string;
}

interface KbGoalUser {
  type: string;
  desc: string;
  attributes: KbGoalUserAttribute[];
}

interface KbSummary {
  project_profile: {
    name: string;
    code: string;
    project_id: number;
    status_name: string;
    lifecycle_phase_name: string;
    plan_finish_date: string;
    manage_vp: string;
    importance: number;
    summary: string;
    original_intention: string;
  };
  core_values: any[];
  goal_users: KbGoalUser[];
  stage_objectives: {
    average: string;
    delay_rate: string;
    now_rate: string;
    items: KbStageObjective[];
  };
  weekly_versions: KbWeeklyVersion[];
  monthly_plan: any[];
  budget: string;
}

interface PageProps {
  params: Promise<{ id: string }>;
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

/* ─── 解析进度百分比 ─── */
function parseProgress(val: string): number {
  const n = parseFloat(val.replace('%', ''));
  return isNaN(n) ? 0 : Math.min(100, Math.max(0, n));
}

/* ─── 格式化日期 ─── */
function fmtDate(iso: string): string {
  if (!iso) return '--';
  const d = new Date(iso);
  if (isNaN(d.getTime())) return iso;
  return `${d.getMonth() + 1}月${d.getDate()}日`;
}

function fmtDateFull(iso: string): string {
  if (!iso) return '--';
  const d = new Date(iso);
  if (isNaN(d.getTime())) return iso;
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/* ─── 主组件 ─── */
export default function ProjectDetailPage({ params }: PageProps) {
  const { id } = use(params);
  const router = useRouter();

  /* 状态 */
  const [project, setProject] = useState<ProjectDetail | null>(null);
  const [members, setMembers] = useState<ProjectMember[]>([]);
  const [stats, setStats] = useState<ProjectStats | null>(null);
  const [phaseLogs, setPhaseLogs] = useState<PhaseLog[]>([]);
  const [sprintWeeks, setSprintWeeks] = useState<SprintWeeks>({});
  const [sprintLoading, setSprintLoading] = useState(false);
  const [generatingPlan, setGeneratingPlan] = useState(false);
  const [planGenerated, setPlanGenerated] = useState(false);
  const [loading, setLoading] = useState(true);
  const [transitioning, setTransitioning] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [syncMsg, setSyncMsg] = useState<string | null>(null);

  /* 知识库 */
  const [kbContent, setKbContent] = useState<string | null>(null);
  const [kbLoading, setKbLoading] = useState(false);
  const [kbOpen, setKbOpen] = useState(false);
  const [kbSummary, setKbSummary] = useState<KbSummary | null>(null);
  const [kbSummaryLoading, setKbSummaryLoading] = useState(false);
  const [kbActiveSection, setKbActiveSection] = useState("profile");

  /* 干系人 */
  interface Stakeholder {
    name: string;
    role: string;
    level: string;
    department: string;
    tags: string[];
    personality_traits: string[];
    meeting_notes: string;
    category: string;
  }
  const [stakeholders, setStakeholders] = useState<Stakeholder[]>([]);
  const [stakeholdersLoading, setStakeholdersLoading] = useState(false);
  const [selectedStakeholder, setSelectedStakeholder] = useState<Stakeholder | null>(null);
  const [stakeholderDetailOpen, setStakeholderDetailOpen] = useState(false);
  const [stakeholderDetail, setStakeholderDetail] = useState<any>(null);
  const [stakeholderDetailLoading, setStakeholderDetailLoading] = useState(false);

  /* 添加干系人 */
  const [addStakeholderOpen, setAddStakeholderOpen] = useState(false);
  const [allPeople, setAllPeople] = useState<Record<string, { name: string; role: string; level: string; tags: string[] }[]>>({});
  const [allPeopleLoading, setAllPeopleLoading] = useState(false);
  const [addingStakeholder, setAddingStakeholder] = useState(false);

  /* ── 加载项目详情 ── */
  const loadProject = async () => {
    setLoading(true);
    try {
      const resp = await fetch(`${API_BASE}/api/projects/${id}`);
      const json = await resp.json();
      if (json.success) {
        setProject(json.data.project);
        setMembers(json.data.members || []);
        setStats(json.data.stats);
        setPhaseLogs(json.data.phase_logs || []);
      }
    } catch (e) {
      console.error("加载失败:", e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadProject();
    loadSprintTasks();
  }, [id]);

  const handleSync = async () => {
    setSyncing(true);
    setSyncMsg(null);
    try {
      const resp = await fetch(`${API_BASE}/api/projects/${id}/sync`, { method: "POST" });
      const json = await resp.json();
      if (json.success) {
        setSyncMsg(`已同步：${json.data.reason}`);
        await loadProject();
        await loadSprintTasks();
      } else {
        setSyncMsg("同步失败");
      }
    } catch {
      setSyncMsg("同步失败");
    } finally {
      setSyncing(false);
      setTimeout(() => setSyncMsg(null), 5000);
    }
  };

  /* ── 加载知识库摘要（异步） ── */
  const loadKbSummary = async () => {
    if (!project?.knowledge_base_path) return;
    setKbSummaryLoading(true);
    try {
      const resp = await fetch(`${API_BASE}/api/projects/${id}/kb-summary`);
      const json = await resp.json();
      if (json.success) {
        // 标准化数据：适配不同来源的 schema（项目管理系统 vs 工作流输出）
        const raw = json.data;
        const normalized: KbSummary = {
          project_profile: raw.project_profile || {
            name: raw.project?.name || '',
            code: raw.project?.code || '',
            project_id: Number(raw.project?.external_id) || 0,
            status_name: raw.project?.status || '',
            lifecycle_phase_name: raw.project?.phase || '',
            plan_finish_date: raw.project?.deadline || '',
            manage_vp: raw.project?.vp || '',
            importance: 0,
            summary: raw.summary?.overview || '',
            original_intention: raw.summary?.mvp_goal || '',
          },
          core_values: raw.core_values || [],
          goal_users: raw.goal_users || [],
          stage_objectives: raw.stage_objectives?.items ? raw.stage_objectives : {
            average: raw.summary?.current_progress || '0%',
            delay_rate: raw.summary?.delay_rate || '0%',
            now_rate: raw.summary?.current_progress || '0%',
            items: Array.isArray(raw.stage_objectives)
              ? raw.stage_objectives.map((s: any) => ({
                target: s.target || s.name || '',
                important: '',
                progress: s.progress || '0%',
                version: s.version || '',
                check_status: s.status || '',
              }))
              : [],
          },
          weekly_versions: Array.isArray(raw.weekly_versions)
            ? raw.weekly_versions.map((w: any) => ({
              time: w.time || w.week || '',
              plan: w.plan || '',
              importance: w.importance || '',
              effect: w.effect || '',
              progress: w.progress || '0%',
              completion: w.completion || '',
            }))
            : [],
          monthly_plan: raw.monthly_plan || [],
          budget: typeof raw.budget === 'string' ? raw.budget : JSON.stringify(raw.budget || {}, null, 2),
        };
        setKbSummary(normalized);
      }
    } catch (e) {
      console.error("加载知识库摘要失败:", e);
    } finally {
      setKbSummaryLoading(false);
    }
  };

  /* 项目加载完成后尝试加载摘要 */
  useEffect(() => {
    if (project?.knowledge_base_path) {
      loadKbSummary();
    }
  }, [project?.knowledge_base_path]);

  /* ── 加载项目干系人 ── */
  const loadStakeholders = async () => {
    setStakeholdersLoading(true);
    try {
      const resp = await fetch(`${API_BASE}/api/projects/${id}/stakeholders`);
      const json = await resp.json();
      if (json.success) {
        setStakeholders(json.data);
      }
    } catch (e) {
      console.error("加载干系人失败:", e);
    } finally {
      setStakeholdersLoading(false);
    }
  };

  useEffect(() => {
    loadStakeholders();
  }, [id]);

  /* ── 加载所有人员（用于添加） ── */
  const loadAllPeople = async () => {
    setAllPeopleLoading(true);
    try {
      const resp = await fetch(`${API_BASE}/api/people`);
      const json = await resp.json();
      if (json.success) {
        setAllPeople(json.data);
      }
    } catch (e) {
      console.error("加载人员列表失败:", e);
    } finally {
      setAllPeopleLoading(false);
    }
  };

  /* ── 添加干系人 ── */
  const handleAddStakeholder = async (personName: string, personCategory: string) => {
    setAddingStakeholder(true);
    try {
      const resp = await fetch(`${API_BASE}/api/projects/${id}/stakeholders`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ person_name: personName, person_category: personCategory }),
      });
      const json = await resp.json();
      if (json.success) {
        loadStakeholders();
        setAddStakeholderOpen(false);
      } else {
        alert(json.error || "添加失败");
      }
    } catch (e) {
      console.error("添加干系人失败:", e);
      alert("添加干系人失败");
    } finally {
      setAddingStakeholder(false);
    }
  };

  /* ── 删除干系人 ── */
  const handleRemoveStakeholder = async (personName: string) => {
    if (!confirm(`确定要移除干系人「${personName}」吗？`)) return;
    try {
      const resp = await fetch(`${API_BASE}/api/projects/${id}/stakeholders/${encodeURIComponent(personName)}`, {
        method: "DELETE",
      });
      const json = await resp.json();
      if (json.success) {
        loadStakeholders();
      } else {
        alert(json.error || "删除失败");
      }
    } catch (e) {
      console.error("删除干系人失败:", e);
      alert("删除干系人失败");
    }
  };

  /* ── 加载干系人详情 ── */
  const loadStakeholderDetail = async (name: string) => {
    setStakeholderDetailLoading(true);
    try {
      const resp = await fetch(`${API_BASE}/api/people/${encodeURIComponent(name)}`);
      const json = await resp.json();
      if (json.success) {
        setStakeholderDetail(json.data);
        setStakeholderDetailOpen(true);
      }
    } catch (e) {
      console.error("加载干系人详情失败:", e);
    } finally {
      setStakeholderDetailLoading(false);
    }
  };

  /* ── 触发状态流转 ── */
  const handleTransition = async (action: string) => {
    setTransitioning(true);
    try {
      const resp = await fetch(`${API_BASE}/api/projects/${id}/transition`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action }),
      });
      const json = await resp.json();
      if (json.success) {
        const refresh = await fetch(`${API_BASE}/api/projects/${id}`);
        const refreshed = await refresh.json();
        if (refreshed.success) setProject(refreshed.data.project);
      }
    } catch (e) {
      console.error("状态流转失败:", e);
    } finally {
      setTransitioning(false);
    }
  };

  /* ── 生成2周交付计划 ── */
  const handleGeneratePlan = async () => {
    setGeneratingPlan(true);
    try {
      const resp = await fetch(`${API_BASE}/api/projects/${id}/generate-sprint-plan`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sprint_days: 14 }),
      });
      const json = await resp.json();
      if (json.success) {
        setPlanGenerated(true);
        loadSprintTasks();
      } else {
        alert(json.error || "生成计划失败");
      }
    } catch (e) {
      console.error("生成计划失败:", e);
    } finally {
      setGeneratingPlan(false);
    }
  };

  /* ── 加载知识库完整内容 ── */
  const loadKnowledgeBase = async () => {
    if (!project?.knowledge_base_path) return;
    setKbLoading(true);
    try {
      const resp = await fetch(`${API_BASE}/api/projects/${id}/knowledge-base`);
      const json = await resp.json();
      if (json.success) {
        setKbContent(json.data.content);
        setKbOpen(true);
      } else {
        alert(json.error || '加载知识库失败');
      }
    } catch (e) {
      console.error('加载知识库失败:', e);
      alert('加载知识库失败');
    } finally {
      setKbLoading(false);
    }
  };

  /* ── 加载冲刺任务 ── */
  const loadSprintTasks = async () => {
    setSprintLoading(true);
    try {
      const resp = await fetch(`${API_BASE}/api/projects/${id}/sprint-tasks`);
      const json = await resp.json();
      if (json.success && json.data?.weeks) {
        setSprintWeeks(json.data.weeks);
        const weeksArray = Object.values(json.data.weeks) as unknown[][];
        const hasScheduled = weeksArray.some(
          (weekTasks) => weekTasks.some((t: any) => t.start_date)
        );
        setPlanGenerated(hasScheduled);
      }
    } catch (e) {
      console.error("加载冲刺任务失败:", e);
    } finally {
      setSprintLoading(false);
    }
  };

  /* ── 获取可执行操作 ── */
  const getAvailableActions = () => {
    if (!project) return [];
    const actions: { label: string; action: string; primary?: boolean }[] = [];
    switch (project.current_phase) {
      case "draft": actions.push({ label: "提交立项", action: "submit", primary: true }); break;
      case "submitted": actions.push({ label: "审批通过", action: "approve", primary: true }); break;
      case "approved": actions.push({ label: "开始规划", action: "start_planning", primary: true }); break;
      case "planning": actions.push({ label: "锁定计划", action: "lock_plan", primary: true }); break;
      case "plan_locked":
        if (project.team_size_current < project.team_size_required) {
          actions.push({ label: "去招募", action: "recruiting", primary: true });
        } else {
          actions.push({ label: "开始执行", action: "start_execution", primary: true });
        }
        break;
      case "executing": actions.push({ label: "提交交付", action: "submit_delivery", primary: true }); break;
      case "delivering": actions.push({ label: "开始验收", action: "start_review", primary: true }); break;
      case "reviewing":
        actions.push({ label: "验收通过", action: "accept", primary: true });
        actions.push({ label: "验收驳回", action: "reject" });
        break;
      case "accepted": actions.push({ label: "归档项目", action: "archive" }); break;
    }
    return actions;
  };

  /* ── 计算阶段目标完成数 ── */
  const stageCompleteCount = kbSummary?.stage_objectives?.items?.filter(
    (s) => parseProgress(s.progress) >= 100
  ).length ?? 0;
  const stageTotalCount = kbSummary?.stage_objectives?.items?.length ?? 0;

  /* ── 最近周计划 ── */
  const recentWeeks = kbSummary?.weekly_versions?.slice(0, 3) ?? [];

  if (loading) {
    return <div className="p-6 text-center text-muted-foreground">加载中...</div>;
  }
  if (!project) {
    return <div className="p-6 text-center text-red-500">项目不存在</div>;
  }

  const phaseInfo = PHASE_LABELS[project.current_phase] || { label: project.current_phase, color: "bg-slate-500" };
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
    <div className="space-y-6">
      {/* ═══ Header ═══ */}
      <div className="flex items-start justify-between">
        <div className="flex items-start gap-4">
          <Button variant="ghost" size="icon" onClick={() => router.back()}>
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <div>
            <div className="flex items-center gap-3">
              <h1 className="text-2xl font-bold">{project.title || "(无标题)"}</h1>
              {project.external_project_id && (
                <Badge variant="outline" className="font-mono text-xs">
                  {project.external_project_id}
                </Badge>
              )}
            </div>
            <div className="flex items-center gap-3 mt-1.5 text-sm text-muted-foreground">
              <span>{project.type === "quick_validation" ? "快速验证" : "预立项转正式"}</span>
              <span>•</span>
              <span>代号: {kbSummary?.project_profile?.code || '--'}</span>
              {project.vp && (
                <>
                  <span>•</span>
                  <span>VP: {project.vp}</span>
                </>
              )}
              {project.deadline && (
                <>
                  <span>•</span>
                  <span className="flex items-center gap-1">
                    <Calendar className="h-3.5 w-3.5" />
                    截止 {fmtDateFull(project.deadline)}
                  </span>
                </>
              )}
            </div>
          </div>
        </div>
        <div className="flex flex-col items-end gap-1.5">
          <div className="flex items-center gap-2">
            <Button size="sm" variant="outline" onClick={handleSync} disabled={syncing}>
              {syncing ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1" /> : <RefreshCw className="h-3.5 w-3.5 mr-1" />}
              同步状态
            </Button>
            <Badge className={`${phaseInfo.color} text-white`}>{phaseInfo.label}</Badge>
          </div>
          {project.last_synced_at ? (
            <span className="text-[10px] text-muted-foreground">
              上次同步: {new Date(project.last_synced_at).toLocaleString('zh-CN', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
            </span>
          ) : (
            <span className="text-[10px] text-amber-500">尚未同步</span>
          )}
          {syncMsg && <span className="text-[10px] text-emerald-600">{syncMsg}</span>}
          {project.risk_level === "high" && (
            <Badge variant="destructive">
              <AlertTriangle className="h-3 w-3 mr-1" />
              高风险
            </Badge>
          )}
          {kbSummary?.project_profile?.status_name && (
            <div className="flex items-center gap-1.5">
              <span className="text-[10px] text-muted-foreground">项目健康度</span>
              <Badge variant={kbSummary.project_profile.status_name.includes('预警') || kbSummary.project_profile.status_name.includes('风险') ? 'destructive' : 'outline'} className="text-[10px]">
                {kbSummary.project_profile.status_name}
              </Badge>
            </div>
          )}
        </div>
      </div>

      {/* ═══ 快速操作 ═══ */}
      {actions.length > 0 && (
        <Card className="border-primary/20">
          <CardContent className="pt-4 flex items-center gap-2 flex-wrap">
            <span className="text-sm text-muted-foreground">下一步操作：</span>
            {actions.map((a) => (
              <Button
                key={a.action}
                size="sm"
                variant={a.primary ? "default" : "outline"}
                onClick={() => handleTransition(a.action)}
                disabled={transitioning}
              >
                {a.label}
              </Button>
            ))}
          </CardContent>
        </Card>
      )}

      {/* ═══ 统计面板 ═══ */}
      <div className="grid gap-4 md:grid-cols-4">
        {/* 整体进度 */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
              <TrendingUp className="h-4 w-4" />
              整体进度
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold">{stats?.progress_percent || 0}%</div>
            <div className="h-2 bg-muted rounded-full mt-2">
              <div className="h-full bg-primary rounded-full" style={{ width: `${stats?.progress_percent || 0}%` }} />
            </div>
          </CardContent>
        </Card>

        {/* 阶段目标 */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
              <Flag className="h-4 w-4" />
              阶段目标
            </CardTitle>
          </CardHeader>
          <CardContent>
            {kbSummaryLoading ? (
              <div className="text-sm text-muted-foreground">加载中...</div>
            ) : kbSummary ? (
              <>
                <div className="text-3xl font-bold">
                  {stageCompleteCount}<span className="text-lg text-muted-foreground">/{stageTotalCount}</span>
                </div>
                <div className="text-xs text-muted-foreground mt-1">
                  当前进度 {kbSummary?.stage_objectives?.now_rate}
                </div>
              </>
            ) : (
              <div className="text-3xl font-bold text-muted-foreground">--</div>
            )}
          </CardContent>
        </Card>

        {/* 截止倒计时 */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
              <Clock className="h-4 w-4" />
              截止倒计时
            </CardTitle>
          </CardHeader>
          <CardContent>
            {project.deadline ? (
              <div className={`text-3xl font-bold ${stats?.is_delayed ? "text-red-500" : ""}`}>
                {stats?.days_remaining !== null && stats?.days_remaining !== undefined
                  ? stats.days_remaining > 0
                    ? `${stats.days_remaining} 天`
                    : stats.days_remaining === 0
                      ? "今天截止"
                      : `已过期 ${Math.abs(stats.days_remaining)} 天`
                  : "--"}
              </div>
            ) : (
              <div className="text-3xl font-bold text-muted-foreground">--</div>
            )}
            <div className="text-xs text-muted-foreground mt-1">
              {stats?.is_delayed ? "已延期" : stats?.days_remaining === 0 ? "今日截止" : "剩余"}
            </div>
          </CardContent>
        </Card>

        {/* 团队规模 */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
              <Users className="h-4 w-4" />
              团队规模
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold">
              {project.team_size_current}
              <span className="text-sm text-muted-foreground">/{project.team_size_required}</span>
            </div>
            <div className="text-xs text-muted-foreground mt-1">当前/需求</div>
          </CardContent>
        </Card>
      </div>

      {/* ═══ 阶段时间线 ═══ */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <BarChart3 className="h-4 w-4" />
            阶段进度
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-between relative">
            <div className="absolute top-5 left-0 right-0 h-0.5 bg-muted -z-10" />
            {phases.map((phase, idx) => (
              <div key={phase.key} className="flex flex-col items-center">
                <div
                  className={`w-10 h-10 rounded-full flex items-center justify-center border-2 ${phase.status >= 1
                      ? "bg-primary text-primary-foreground border-primary"
                      : phase.status > 0
                        ? "bg-primary/50 text-primary-foreground border-primary"
                        : "bg-background border-muted text-muted-foreground"
                    }`}
                >
                  {phase.status >= 1 ? <CheckCircle className="h-5 w-5" /> : <span className="text-sm font-medium">{idx + 1}</span>}
                </div>
                <span className="text-xs mt-2 text-muted-foreground">{phase.label}</span>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* ═══ Tabs ═══ */}
      <Tabs defaultValue="execution" className="space-y-4">
        <TabsList>
          <TabsTrigger value="execution">
            <Zap className="h-3.5 w-3.5 mr-1" />
            执行
          </TabsTrigger>
          <TabsTrigger value="planning">
            <Target className="h-3.5 w-3.5 mr-1" />
            规划
          </TabsTrigger>
          <TabsTrigger value="members">成员</TabsTrigger>
          <TabsTrigger value="tasks">任务</TabsTrigger>
          <TabsTrigger value="close">
            <Flag className="h-3.5 w-3.5 mr-1" />
            收尾
          </TabsTrigger>
        </TabsList>

        {/* ─── 执行 Tab ─── */}
        <TabsContent value="execution" className="space-y-4">
          {/* 无知识库提示 */}
          {!project.knowledge_base_path && (
            <Card className="border-dashed border-border/60 bg-transparent">
              <CardContent className="pt-4">
                <div className="flex items-center gap-3">
                  <BookOpen className="h-5 w-5 text-muted-foreground/40" />
                  <div>
                    <p className="text-sm font-medium text-muted-foreground">暂无知识库数据</p>
                    <p className="text-xs text-muted-foreground/60 mt-0.5">该项目未关联知识库，无法展示项目画像、周计划、阶段目标等信息。</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          )}

          {/* 最近周计划 -->
          {kbSummary && recentWeeks.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="text-base flex items-center gap-2">
                  <Calendar className="h-4 w-4" />
                  最近周计划
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  {recentWeeks.map((w, idx) => (
                    <div key={idx} className="flex items-start gap-3 p-3 rounded-lg bg-muted/30">
                      <div className="flex flex-col items-center mt-0.5">
                        <div className={`w-2.5 h-2.5 rounded-full ${parseProgress(w.progress) >= 100 ? 'bg-green-500' : parseProgress(w.progress) > 0 ? 'bg-blue-500' : 'bg-muted-foreground'}`} />
                        {idx < recentWeeks.length - 1 && <div className="w-0.5 h-8 bg-muted mt-1" />}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-medium text-sm">{fmtDate(w.time)}</span>
                          <Badge variant="outline" className="text-xs">{w.importance}</Badge>
                          {w.progress && (
                            <Badge variant={parseProgress(w.progress) >= 100 ? "default" : "secondary"} className="text-xs">
                              {w.progress}
                            </Badge>
                          )}
                        </div>
                        <p className="text-sm text-muted-foreground mt-1 line-clamp-2">{w.plan}</p>
                        {w.completion && (
                          <p className="text-xs text-muted-foreground mt-1 line-clamp-1">{w.completion.split('\n')[0]}</p>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
                <Button variant="ghost" size="sm" className="mt-3 gap-1 text-muted-foreground" onClick={() => { loadKnowledgeBase(); }}>
                  查看全部周计划 <ChevronRight className="h-3.5 w-3.5" />
                </Button>
              </CardContent>
            </Card>
          )}

          {/* 知识库入口 */}
          {project.knowledge_base_path && (
            <Card className="border-primary/30 bg-primary/5">
              <CardContent className="pt-4">
                <div className="flex items-center justify-between">
                  <div>
                    <h3 className="text-sm font-medium flex items-center gap-2">
                      <BookOpen className="h-4 w-4 text-primary" />
                      AI游浠知识库
                    </h3>
                    <p className="text-xs text-muted-foreground mt-1">
                      项目画像、目标用户、阶段目标、周计划、预算等完整资料
                    </p>
                  </div>
                  <Button variant="outline" size="sm" onClick={loadKnowledgeBase} disabled={kbLoading}>
                    {kbLoading ? '加载中...' : '打开知识库'}
                  </Button>
                </div>
              </CardContent>
            </Card>
          )}

          {/* 关键干系人 */}
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle className="text-base flex items-center gap-2">
                <Contact className="h-4 w-4" />
                关键干系人
                {stakeholders.length > 0 && (
                  <Badge variant="secondary" className="text-xs">{stakeholders.length}</Badge>
                )}
              </CardTitle>
              <Button variant="outline" size="sm" onClick={() => { loadAllPeople(); setAddStakeholderOpen(true); }}>
                <Plus className="h-3.5 w-3.5 mr-1" />添加
              </Button>
            </CardHeader>
            <CardContent>
              {stakeholders.length === 0 ? (
                <div className="text-sm text-muted-foreground text-center py-4">
                  暂无干系人，点击右上角"添加"按钮添加
                </div>
              ) : (
                <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
                  {stakeholders.map((s) => (
                    <div
                      key={s.name}
                      className="p-3 rounded-lg border hover:border-primary/50 cursor-pointer transition-colors relative group"
                      onClick={() => { setSelectedStakeholder(s); loadStakeholderDetail(s.name); }}
                    >
                      {/* 删除按钮 */}
                      <button
                        className="absolute top-1.5 right-1.5 opacity-0 group-hover:opacity-100 transition-opacity p-1 rounded hover:bg-destructive/10 text-muted-foreground hover:text-destructive"
                        onClick={(e) => { e.stopPropagation(); handleRemoveStakeholder(s.name); }}
                        title="移除干系人"
                      >
                        ✕
                      </button>
                      <div className="flex items-center gap-2">
                        <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center text-sm font-medium">
                          {s.name[0]}
                        </div>
                        <div className="flex-1 min-w-0 pr-4">
                          <div className="text-sm font-medium truncate">{s.name}</div>
                          <div className="text-xs text-muted-foreground">{s.role} · {s.level}</div>
                        </div>
                      </div>
                      {s.personality_traits.length > 0 && (
                        <div className="flex flex-wrap gap-1 mt-2">
                          {s.personality_traits.map((t, i) => (
                            <Badge key={i} variant="secondary" className="text-xs">{t}</Badge>
                          ))}
                        </div>
                      )}
                      {s.meeting_notes && (
                        <p className="text-xs text-muted-foreground mt-2 line-clamp-2">{s.meeting_notes}</p>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          {/* 下一步行动建议 */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <Lightbulb className="h-4 w-4 text-yellow-500" />
                下一步行动建议
              </CardTitle>
            </CardHeader>
            <CardContent>
              {project.current_phase === "planning" && (
                <p className="text-sm">建议点击"开始规划"，在需求分析页面完成任务拆解，并制定2周交付计划。</p>
              )}
              {project.current_phase === "plan_locked" && project.team_size_current < project.team_size_required && (
                <p className="text-sm">团队人数不足，建议发布招募公告或调整团队规模要求。</p>
              )}
              {project.current_phase === "executing" && stats && stats.days_remaining !== null && stats.days_remaining <= 3 && (
                <p className="text-sm text-amber-600">距离截止仅剩 {stats.days_remaining} 天，建议优先完成核心任务。</p>
              )}
              {project.current_phase === "accepted" && (
                <p className="text-sm">项目已完成，可以归档。</p>
              )}
              {!["draft", "submitted", "approved", "planning", "plan_locked", "executing", "accepted"].includes(project.current_phase) && (
                <p className="text-sm text-muted-foreground">按阶段提示进行操作</p>
              )}
            </CardContent>
          </Card>

          {/* 阶段流转记录 */}
          {phaseLogs.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="text-base">阶段流转记录</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-2">
                  {phaseLogs.slice(0, 5).map((log) => (
                    <div key={log.id} className="flex items-center gap-2 text-sm">
                      <ArrowRight className="h-4 w-4 text-muted-foreground" />
                      <span className="text-muted-foreground">{PHASE_LABELS[log.from_phase]?.label || log.from_phase}</span>
                      <span>→</span>
                      <span>{PHASE_LABELS[log.to_phase]?.label || log.to_phase}</span>
                      <span className="text-muted-foreground text-xs ml-auto">{new Date(log.created_at).toLocaleDateString()}</span>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}
        </TabsContent>

        {/* ─── 规划 Tab ─── */}
        <TabsContent value="planning" className="space-y-4">
          {/* 无知识库提示 */}
          {!project.knowledge_base_path && (
            <Card className="border-dashed border-border/60 bg-transparent">
              <CardContent className="pt-4">
                <div className="flex items-center gap-3">
                  <Target className="h-5 w-5 text-muted-foreground/40" />
                  <div>
                    <p className="text-sm font-medium text-muted-foreground">暂无知识库数据</p>
                    <p className="text-xs text-muted-foreground/60 mt-0.5">该项目未关联知识库，无法展示项目画像、目标用户、阶段目标等规划信息。</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          )}

          {/* 项目画像摘要 */}
          {kbSummary && (
            <Card>
              <CardHeader>
                <CardTitle className="text-base flex items-center gap-2">
                  <FileText className="h-4 w-4" />
                  项目画像
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                  <div>
                    <div className="text-muted-foreground text-xs">项目代号</div>
                    <div className="font-medium">{kbSummary?.project_profile?.code}</div>
                  </div>
                  <div>
                    <div className="text-muted-foreground text-xs">项目健康度</div>
                    <div className="font-medium">{kbSummary?.project_profile?.status_name}</div>
                  </div>
                  <div>
                    <div className="text-muted-foreground text-xs">生命周期</div>
                    <div className="font-medium">{kbSummary?.project_profile?.lifecycle_phase_name}</div>
                  </div>
                  <div>
                    <div className="text-muted-foreground text-xs">重要度</div>
                    <div className="font-medium">{kbSummary?.project_profile?.importance}</div>
                  </div>
                </div>
                {kbSummary?.project_profile?.summary && (
                  <>
                    <Separator />
                    <div>
                      <div className="text-muted-foreground text-xs mb-1">项目概述</div>
                      <p className="text-sm text-muted-foreground leading-relaxed whitespace-pre-wrap">{kbSummary?.project_profile?.summary}</p>
                    </div>
                  </>
                )}
              </CardContent>
            </Card>
          )}

          {/* 阶段目标详情 */}
          {kbSummary && kbSummary?.stage_objectives?.items && kbSummary?.stage_objectives?.items?.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="text-base flex items-center gap-2">
                  <Flag className="h-4 w-4" />
                  阶段目标
                  <span className="text-xs text-muted-foreground font-normal ml-1">
                    整体 {kbSummary?.stage_objectives?.now_rate} · 延期率 {kbSummary?.stage_objectives?.delay_rate}
                  </span>
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                {kbSummary?.stage_objectives?.items?.map((s, idx) => {
                  const pct = parseProgress(s.progress);
                  return (
                    <div key={idx}>
                      <div className="flex items-center justify-between mb-1.5">
                        <span className="text-sm font-medium line-clamp-1 flex-1 mr-2">{s.target}</span>
                        <div className="flex items-center gap-2 shrink-0">
                          <Badge variant="outline" className="text-xs">{s.important}</Badge>
                          <span className="text-xs text-muted-foreground w-10 text-right">{s.progress}</span>
                        </div>
                      </div>
                      <Progress value={pct} className="h-2" />
                      <div className="flex items-center justify-between mt-1">
                        <span className="text-xs text-muted-foreground">{s.version}</span>
                        <span className="text-xs text-muted-foreground">{s.check_status}</span>
                      </div>
                    </div>
                  );
                })}
              </CardContent>
            </Card>
          )}

          {/* 目标用户摘要 */}
          {kbSummary && kbSummary?.goal_users && kbSummary?.goal_users?.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="text-base flex items-center gap-2">
                  <Users className="h-4 w-4" />
                  目标用户
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  {kbSummary?.goal_users?.map((u, idx) => (
                    <div key={idx} className="p-3 rounded-lg bg-muted/30">
                      <div className="font-medium text-sm mb-1">{u.type || '未命名用户群'}</div>
                      <p className="text-xs text-muted-foreground line-clamp-3">{u.desc}</p>
                      {u.attributes.length > 0 && (
                        <div className="flex flex-wrap gap-1 mt-2">
                          {u.attributes.slice(0, 4).map((a, i) => (
                            <Badge key={i} variant="secondary" className="text-xs">{a.name}</Badge>
                          ))}
                          {u.attributes.length > 4 && (
                            <Badge variant="secondary" className="text-xs">+{u.attributes.length - 4}</Badge>
                          )}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
                <Button variant="ghost" size="sm" className="mt-3 gap-1 text-muted-foreground" onClick={loadKnowledgeBase}>
                  查看完整用户画像 <ChevronRight className="h-3.5 w-3.5" />
                </Button>
              </CardContent>
            </Card>
          )}
        </TabsContent>

        {/* ─── 成员 Tab ─── */}
        <TabsContent value="members">
          <Card>
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <Users className="h-4 w-4" />
                项目成员 ({members.length})
              </CardTitle>
            </CardHeader>
            <CardContent>
              {members.length === 0 ? (
                <p className="text-sm text-muted-foreground">暂无成员</p>
              ) : (
                <div className="space-y-2">
                  {members.map((member) => (
                    <div key={member.id} className="flex items-center gap-3 p-2 rounded-lg hover:bg-muted/50">
                      <div className="w-8 h-8 rounded-full bg-primary/20 flex items-center justify-center">
                        {member.employee_avatar ? (
                          <img src={member.employee_avatar} className="w-8 h-8 rounded-full" />
                        ) : (
                          <span className="text-sm font-medium">{member.employee_name?.[0] || "?"}</span>
                        )}
                      </div>
                      <div className="flex-1">
                        <div className="font-medium">{member.employee_name || member.employee_id}</div>
                        <div className="text-xs text-muted-foreground">{member.role}</div>
                      </div>
                      <Badge variant="outline">{member.role}</Badge>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* ─── 任务 Tab ─── */}
        <TabsContent value="tasks" className="space-y-4">
          {!planGenerated && (
            <Card className="border-primary/20 bg-primary/5">
              <CardHeader>
                <CardTitle className="text-base flex items-center gap-2">
                  <Calendar className="h-4 w-4" />
                  2周交付计划
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-sm text-muted-foreground mb-3">生成2周交付计划，将任务按顺序分配到工作日并按周分组展示</p>
                <Button onClick={handleGeneratePlan} disabled={generatingPlan} className="gap-2">
                  {generatingPlan ? <>生成中...</> : <><Plus className="h-4 w-4" />生成2周交付计划</>}
                </Button>
              </CardContent>
            </Card>
          )}

          {planGenerated && (
            <>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <PlayCircle className="h-5 w-5 text-primary" />
                  <span className="font-medium">冲刺时间轴</span>
                </div>
                <Button variant="outline" size="sm" onClick={loadSprintTasks} disabled={sprintLoading}>刷新</Button>
              </div>

              {sprintLoading ? (
                <div className="text-center py-8 text-muted-foreground">加载中...</div>
              ) : Object.keys(sprintWeeks).length > 0 ? (
                <div className="grid gap-4">
                  {Object.entries(sprintWeeks)
                    .sort(([a], [b]) => Number(a) - Number(b))
                    .map(([week, tasks]) => (
                      <Card key={week}>
                        <CardHeader className="pb-2">
                          <CardTitle className="text-sm flex items-center gap-2">
                            <Badge variant="outline">第 {week} 周</Badge>
                            <span className="text-muted-foreground">{(tasks as SprintTask[]).length} 个任务</span>
                          </CardTitle>
                        </CardHeader>
                        <CardContent>
                          <div className="space-y-2">
                            {(tasks as SprintTask[]).map((task, idx) => (
                              <div key={task.id} className="flex items-start gap-3 p-2 rounded-lg hover:bg-muted/50">
                                <div className="flex flex-col items-center">
                                  <div className={`w-3 h-3 rounded-full mt-1.5 ${task.status === "done" ? "bg-green-500" : task.status === "in_progress" ? "bg-blue-500" : "bg-muted-foreground"}`} />
                                  {idx < (tasks as SprintTask[]).length - 1 && <div className="w-0.5 h-8 bg-muted" />}
                                </div>
                                <div className="flex-1 min-w-0">
                                  <div className="flex items-center gap-2">
                                    <span className="font-medium truncate">{task.title}</span>
                                    <Badge variant={task.priority === "high" ? "destructive" : task.priority === "medium" ? "default" : "secondary"} className="text-xs">
                                      {task.priority === "high" ? "高" : task.priority === "medium" ? "中" : "低"}
                                    </Badge>
                                    <Badge variant={task.status === "done" ? "default" : task.status === "in_progress" ? "outline" : "secondary"} className="text-xs">
                                      {task.status === "done" ? "完成" : task.status === "in_progress" ? "进行中" : "待开始"}
                                    </Badge>
                                  </div>
                                  {task.start_date && (
                                    <div className="text-xs text-muted-foreground mt-1 flex items-center gap-1">
                                      <Clock className="h-3 w-3" />
                                      {new Date(task.start_date).toLocaleDateString()}
                                      {task.due_date && ` → ${new Date(task.due_date).toLocaleDateString()}`}
                                    </div>
                                  )}
                                  {task.estimated_hours && (
                                    <div className="text-xs text-muted-foreground">预估: {task.estimated_hours}h {task.actual_hours && `/ 实际: ${task.actual_hours}h`}</div>
                                  )}
                                </div>
                              </div>
                            ))}
                          </div>
                        </CardContent>
                      </Card>
                    ))}
                </div>
              ) : (
                <div className="text-center py-8 text-muted-foreground">暂无已排期的任务</div>
              )}
            </>
          )}

          <div className="mt-4 pt-4 border-t">
            <Link href={`/tasks/requirements?project=${project.id}`}>
              <Button variant="outline" size="sm" className="gap-2">
                <Package className="h-4 w-4" />
                查看完整任务列表
              </Button>
            </Link>
          </div>
        </TabsContent>

        {/* ─── 收尾 Tab ─── */}
        <TabsContent value="close" className="space-y-4">
          {(() => {
            const allTasks: SprintTask[] = Object.values(sprintWeeks).flat();
            const now = new Date();
            const threeDaysLater = new Date(now); threeDaysLater.setDate(now.getDate() + 3);
            const pendingClose = allTasks
              .filter((t) => t.status !== "done")
              .map((t) => {
                const due = t.due_date ? new Date(t.due_date) : null;
                const isOverdue = !!due && due < now;
                const isNear = !!due && due >= now && due <= threeDaysLater;
                return { ...t, isOverdue, isNear };
              })
              .sort((a, b) => {
                if (a.isOverdue && !b.isOverdue) return -1;
                if (!a.isOverdue && b.isOverdue) return 1;
                if (a.isNear && !b.isNear) return -1;
                if (!a.isNear && b.isNear) return 1;
                if (a.priority === "high" && b.priority !== "high") return -1;
                if (a.priority !== "high" && b.priority === "high") return 1;
                return 0;
              });

            return (
              <>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Flag className="h-5 w-5 text-amber-500" />
                    <span className="font-medium">待收尾项</span>
                    {pendingClose.length > 0 && <Badge variant="secondary">{pendingClose.length}</Badge>}
                  </div>
                  <Button variant="outline" size="sm" onClick={loadSprintTasks} disabled={sprintLoading}>刷新</Button>
                </div>

                {sprintLoading ? (
                  <div className="text-center py-8 text-muted-foreground">加载中...</div>
                ) : pendingClose.length === 0 ? (
                  <Card>
                    <CardContent className="py-10 text-center text-muted-foreground">
                      <CheckCircle className="h-10 w-10 mx-auto mb-3 text-green-500" />
                      <p>暂无待收尾项，项目状态良好</p>
                    </CardContent>
                  </Card>
                ) : (
                  <div className="grid gap-3">
                    {pendingClose.map((task) => (
                      <Card key={task.id} className={task.isOverdue ? "border-red-500/30" : task.isNear ? "border-amber-500/30" : ""}>
                        <CardContent className="p-4">
                          <div className="flex items-start justify-between gap-3">
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2 flex-wrap">
                                <span className="font-medium">{task.title}</span>
                                <Badge variant={task.priority === "high" ? "destructive" : task.priority === "medium" ? "default" : "secondary"} className="text-xs">
                                  {task.priority === "high" ? "高" : task.priority === "medium" ? "中" : "低"}
                                </Badge>
                                <Badge variant={task.status === "in_progress" ? "outline" : "secondary"} className="text-xs">
                                  {task.status === "in_progress" ? "进行中" : task.status === "testing" ? "测试中" : "待开始"}
                                </Badge>
                              </div>
                              {task.due_date && (
                                <div className="flex items-center gap-2 mt-2 text-xs">
                                  <Clock className="h-3.5 w-3.5 text-muted-foreground" />
                                  <span className={task.isOverdue ? "text-red-500 font-medium" : task.isNear ? "text-amber-500 font-medium" : "text-muted-foreground"}>
                                    {task.isOverdue ? `已逾期 ${Math.ceil((now.getTime() - new Date(task.due_date).getTime()) / (1000 * 60 * 60 * 24))} 天` : task.isNear ? `即将到期: ${new Date(task.due_date).toLocaleDateString()}` : `截止: ${new Date(task.due_date).toLocaleDateString()}`}
                                  </span>
                                </div>
                              )}
                              {task.estimated_hours && (
                                <div className="text-xs text-muted-foreground mt-1">预估: {task.estimated_hours}h {task.actual_hours ? `/ 实际: ${task.actual_hours}h` : ""}</div>
                              )}
                            </div>
                            <Link href={`/tasks/requirements?project=${project.id}`}>
                              <Button size="sm" variant="outline">
                                去处理
                              </Button>
                            </Link>
                          </div>
                        </CardContent>
                      </Card>
                    ))}
                  </div>
                )}
              </>
            );
          })()}
        </TabsContent>
      </Tabs>

      {/* ═══ 干系人详情弹窗 ═══ */}
      {stakeholderDetailOpen && selectedStakeholder && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4">
          <div className="bg-background rounded-lg border shadow-lg w-full max-w-lg max-h-[85vh] flex flex-col">
            <div className="flex items-center justify-between p-4 border-b">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center text-lg font-medium">
                  {selectedStakeholder.name[0]}
                </div>
                <div>
                  <h2 className="text-lg font-semibold">{selectedStakeholder.name}</h2>
                  <p className="text-xs text-muted-foreground">{selectedStakeholder.role} · {selectedStakeholder.level} · {selectedStakeholder.department}</p>
                </div>
              </div>
              <Button variant="ghost" size="sm" onClick={() => setStakeholderDetailOpen(false)}>✕</Button>
            </div>

            <div className="flex-1 overflow-auto p-4 space-y-4">
              {stakeholderDetailLoading ? (
                <div className="text-center text-muted-foreground py-8">加载中...</div>
              ) : stakeholderDetail ? (
                <>
                  {/* 标签 */}
                  <div className="flex flex-wrap gap-1">
                    {stakeholderDetail.tags?.map((t: string, i: number) => (
                      <Badge key={i} variant="secondary" className="text-xs">{t}</Badge>
                    ))}
                  </div>

                  {/* 会议习惯 */}
                  <div>
                    <h3 className="text-sm font-medium flex items-center gap-2 mb-2">
                      <Calendar className="h-4 w-4 text-muted-foreground" />
                      会议习惯
                    </h3>
                    <div className="text-sm text-muted-foreground space-y-1">
                      <p>需要预约：{stakeholderDetail.meeting_style?.needs_appointment ? '是' : '否'}</p>
                      {stakeholderDetail.meeting_style?.max_duration_minutes && (
                        <p>建议时长：不超过 {stakeholderDetail.meeting_style.max_duration_minutes} 分钟</p>
                      )}
                      <p>需要提前准备：{stakeholderDetail.meeting_style?.preparation_required ? '是' : '否'}</p>
                      {stakeholderDetail.meeting_style?.assistant_contact && (
                        <p>助理联系人：{stakeholderDetail.meeting_style.assistant_contact}</p>
                      )}
                      <p className="text-xs bg-muted/50 p-2 rounded mt-1">{stakeholderDetail.meeting_style?.notes}</p>
                    </div>
                  </div>

                  <Separator />

                  {/* 沟通风格 */}
                  <div>
                    <h3 className="text-sm font-medium flex items-center gap-2 mb-2">
                      <MessageSquareWarning className="h-4 w-4 text-muted-foreground" />
                      沟通风格
                    </h3>
                    <div className="text-sm text-muted-foreground space-y-1">
                      <p>风格：{stakeholderDetail.communication?.style}</p>
                      {stakeholderDetail.communication?.prefers?.length > 0 && (
                        <p>偏好：{stakeholderDetail.communication.prefers.join('、')}</p>
                      )}
                      {stakeholderDetail.communication?.avoids?.length > 0 && (
                        <p className="text-red-500/80">忌讳：{stakeholderDetail.communication.avoids.join('、')}</p>
                      )}
                    </div>
                  </div>

                  <Separator />

                  {/* AI 注意事项 */}
                  <div>
                    <h3 className="text-sm font-medium flex items-center gap-2 mb-2">
                      <Lightbulb className="h-4 w-4 text-yellow-500" />
                      AI 沟通注意事项
                    </h3>
                    <ul className="text-sm text-muted-foreground space-y-1 list-disc list-inside">
                      {stakeholderDetail.notes_for_ai?.map((note: string, i: number) => (
                        <li key={i}>{note}</li>
                      ))}
                    </ul>
                  </div>
                </>
              ) : (
                <p className="text-sm text-muted-foreground">无法加载详情</p>
              )}
            </div>

            <div className="p-4 border-t flex justify-end">
              <Button variant="outline" size="sm" onClick={() => setStakeholderDetailOpen(false)}>关闭</Button>
            </div>
          </div>
        </div>
      )}

      {/* ═══ 添加干系人弹窗 ═══ */}
      {addStakeholderOpen && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4">
          <div className="bg-background rounded-lg border shadow-lg w-full max-w-md max-h-[80vh] flex flex-col">
            <div className="flex items-center justify-between p-4 border-b">
              <h2 className="text-lg font-semibold">添加干系人</h2>
              <Button variant="ghost" size="sm" onClick={() => setAddStakeholderOpen(false)}>✕</Button>
            </div>
            <div className="flex-1 overflow-auto p-4">
              {allPeopleLoading ? (
                <div className="text-center text-muted-foreground py-8">加载中...</div>
              ) : (
                <div className="space-y-4">
                  {Object.entries(allPeople).map(([category, people]) => {
                    if (people.length === 0) return null;
                    const categoryLabel = { leaders: '管理层', stakeholders: '核心干系人', colleagues: '同事', vendors: '外部合作方' }[category] || category;
                    // 过滤掉已添加的人员
                    const existingNames = new Set(stakeholders.map(s => s.name));
                    const available = people.filter(p => !existingNames.has(p.name));
                    if (available.length === 0) return null;
                    return (
                      <div key={category}>
                        <h3 className="text-sm font-medium text-muted-foreground mb-2">{categoryLabel}</h3>
                        <div className="space-y-1">
                          {available.map((p) => (
                            <button
                              key={p.name}
                              className="w-full flex items-center gap-3 p-2 rounded-lg hover:bg-muted/50 text-left transition-colors"
                              onClick={() => handleAddStakeholder(p.name, category)}
                              disabled={addingStakeholder}
                            >
                              <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center text-sm font-medium shrink-0">
                                {p.name[0]}
                              </div>
                              <div className="flex-1 min-w-0">
                                <div className="text-sm font-medium">{p.name}</div>
                                <div className="text-xs text-muted-foreground">{p.role} · {p.level}</div>
                              </div>
                              <Plus className="h-4 w-4 text-muted-foreground shrink-0" />
                            </button>
                          ))}
                        </div>
                      </div>
                    );
                  })}
                  {Object.values(allPeople).flat().filter(p => !stakeholders.find(s => s.name === p.name)).length === 0 && (
                    <p className="text-sm text-muted-foreground text-center py-4">所有人员都已添加</p>
                  )}
                </div>
              )}
            </div>
            <div className="p-4 border-t flex justify-end">
              <Button variant="outline" size="sm" onClick={() => setAddStakeholderOpen(false)}>取消</Button>
            </div>
          </div>
        </div>
      )}

      {/* ═══ 知识库弹窗 ═══ */}
      {kbOpen && kbContent && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4">
          <div className="bg-background rounded-lg border shadow-lg w-full max-w-4xl max-h-[90vh] flex flex-col">
            {/* 弹窗 Header */}
            <div className="flex items-center justify-between p-4 border-b">
              <div>
                <h2 className="text-lg font-semibold">{project.title} — 知识库</h2>
                <p className="text-xs text-muted-foreground">项目管理系统同步数据</p>
              </div>
              <Button variant="ghost" size="sm" onClick={() => setKbOpen(false)}>✕</Button>
            </div>

            {/* 弹窗内容：分章节 Tabs */}
            <div className="flex-1 overflow-hidden flex flex-col">
              <Tabs value={kbActiveSection} onValueChange={setKbActiveSection} className="flex-1 flex flex-col">
                <div className="border-b px-4">
                  <TabsList className="mt-2">
                    <TabsTrigger value="profile">项目画像</TabsTrigger>
                    <TabsTrigger value="users">目标用户</TabsTrigger>
                    <TabsTrigger value="stages">阶段目标</TabsTrigger>
                    <TabsTrigger value="weekly">周计划</TabsTrigger>
                    <TabsTrigger value="budget">预算</TabsTrigger>
                    <TabsTrigger value="raw">原始</TabsTrigger>
                  </TabsList>
                </div>

                <div className="flex-1 overflow-hidden">
                  <ScrollArea className="h-full">
                    <div className="p-4">
                      {/* 项目画像 */}
                      <TabsContent value="profile" className="mt-0 space-y-4">
                        {kbSummary && (
                          <>
                            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                              <div><div className="text-muted-foreground text-xs">代号</div><div className="font-medium">{kbSummary?.project_profile?.code}</div></div>
                              <div><div className="text-muted-foreground text-xs">状态</div><div className="font-medium">{kbSummary?.project_profile?.status_name}</div></div>
                              <div><div className="text-muted-foreground text-xs">阶段</div><div className="font-medium">{kbSummary?.project_profile?.lifecycle_phase_name}</div></div>
                              <div><div className="text-muted-foreground text-xs">VP</div><div className="font-medium">{kbSummary?.project_profile?.manage_vp}</div></div>
                            </div>
                            <Separator />
                            <div>
                              <h3 className="text-sm font-medium mb-2">项目概述</h3>
                              <div className="text-sm text-muted-foreground whitespace-pre-wrap leading-relaxed">{kbSummary?.project_profile?.summary}</div>
                            </div>
                            {kbSummary?.project_profile?.original_intention && (
                              <>
                                <Separator />
                                <div>
                                  <h3 className="text-sm font-medium mb-2">立项初衷</h3>
                                  <div className="text-sm text-muted-foreground whitespace-pre-wrap leading-relaxed">{kbSummary?.project_profile?.original_intention}</div>
                                </div>
                              </>
                            )}
                          </>
                        )}
                      </TabsContent>

                      {/* 目标用户 */}
                      <TabsContent value="users" className="mt-0 space-y-4">
                        {!kbSummary?.goal_users || kbSummary.goal_users.length === 0 ? (
                          <p className="text-sm text-muted-foreground text-center py-8">暂无目标用户数据</p>
                        ) : (
                          kbSummary?.goal_users?.map((u, idx) => (
                            <div key={idx} className="p-4 rounded-lg border">
                              <h3 className="text-sm font-medium mb-2">{u.type || '未命名用户群'}</h3>
                              <p className="text-sm text-muted-foreground whitespace-pre-wrap mb-3">{u.desc}</p>
                              {u.attributes.length > 0 && (
                                <div className="space-y-2">
                                  {u.attributes.map((a, i) => (
                                    <div key={i} className="p-2 rounded bg-muted/50">
                                      <div className="text-xs font-medium">{a.type} · {a.name}</div>
                                      <p className="text-xs text-muted-foreground mt-1">{a.desc}</p>
                                      {a.inspiration && <p className="text-xs text-primary mt-1">设计启发: {a.inspiration}</p>}
                                    </div>
                                  ))}
                                </div>
                              )}
                            </div>
                          )))}
                      </TabsContent>

                      {/* 阶段目标 */}
                      <TabsContent value="stages" className="mt-0 space-y-4">
                        {kbSummary && (
                          <div className="text-sm text-muted-foreground mb-2">
                            整体进度: {kbSummary?.stage_objectives?.now_rate} · 平均: {kbSummary?.stage_objectives?.average} · 延期率: {kbSummary?.stage_objectives?.delay_rate}
                          </div>
                        )}
                        {!kbSummary?.stage_objectives?.items || kbSummary.stage_objectives.items.length === 0 ? (
                          <p className="text-sm text-muted-foreground text-center py-8">暂无阶段目标数据</p>
                        ) : (
                          kbSummary?.stage_objectives?.items?.map((s, idx) => (
                            <div key={idx} className="p-4 rounded-lg border">
                              <div className="flex items-center justify-between mb-2">
                                <span className="text-sm font-medium">{s.target}</span>
                                <div className="flex items-center gap-2">
                                  <Badge variant="outline" className="text-xs">{s.important}</Badge>
                                  <span className="text-xs font-mono">{s.progress}</span>
                                </div>
                              </div>
                              <Progress value={parseProgress(s.progress)} className="h-2" />
                              <div className="flex items-center justify-between mt-1 text-xs text-muted-foreground">
                                <span>{s.version}</span>
                                <span>{s.check_status}</span>
                              </div>
                            </div>
                          )))}
                      </TabsContent>

                      {/* 周计划 */}
                      <TabsContent value="weekly" className="mt-0 space-y-3">
                        {!kbSummary?.weekly_versions || kbSummary.weekly_versions.length === 0 ? (
                          <p className="text-sm text-muted-foreground text-center py-8">暂无周计划数据</p>
                        ) : (
                          kbSummary?.weekly_versions?.map((w, idx) => (
                            <div key={idx} className="p-4 rounded-lg border">
                              <div className="flex items-center justify-between mb-2">
                                <span className="text-sm font-medium">{fmtDateFull(w.time)}</span>
                                <div className="flex items-center gap-2">
                                  <Badge variant="outline" className="text-xs">{w.importance}</Badge>
                                  <Badge variant={parseProgress(w.progress) >= 100 ? "default" : "secondary"} className="text-xs">{w.progress || '0%'}</Badge>
                                </div>
                              </div>
                              <p className="text-sm text-muted-foreground whitespace-pre-wrap">{w.plan}</p>
                              {w.effect && <p className="text-xs text-primary mt-2">预期效果: {w.effect}</p>}
                              {w.completion && (
                                <div className="mt-2 p-2 rounded bg-muted/50 text-xs text-muted-foreground whitespace-pre-wrap">{w.completion}</div>
                              )}
                            </div>
                          )))}
                      </TabsContent>

                      {/* 预算 */}
                      <TabsContent value="budget" className="mt-0">
                        {kbSummary?.budget ? (
                          <div className="text-sm text-muted-foreground whitespace-pre-wrap">{kbSummary?.budget}</div>
                        ) : (
                          <p className="text-sm text-muted-foreground">暂无预算数据</p>
                        )}
                      </TabsContent>

                      {/* 原始 Markdown */}
                      <TabsContent value="raw" className="mt-0">
                        <pre className="whitespace-pre-wrap text-sm font-mono leading-relaxed text-muted-foreground">{kbContent}</pre>
                      </TabsContent>
                    </div>
                  </ScrollArea>
                </div>
              </Tabs>
            </div>

            {/* 弹窗 Footer */}
            <div className="p-4 border-t flex justify-end">
              <Button variant="outline" size="sm" onClick={() => setKbOpen(false)}>关闭</Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
