"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  ArrowLeft,
  Calendar,
  RefreshCw,
  Loader2,
  AlertTriangle,
  BookOpen,
  FolderSync,
} from "lucide-react";
import {
  btnSecondary,
  btnPrimary,
  btnGhost,
  PHASE_STYLES,
  RISK_STYLES,
  oc,
} from "@/app/projects/_lib/styles";

const API_BASE = process.env.NEXT_PUBLIC_SERVER_API || "http://localhost:3001";

function fmtDateFull(iso: string): string {
  if (!iso) return "--";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return iso;
  return `${d.getFullYear()}.${String(d.getMonth() + 1).padStart(2, "0")}.${String(
    d.getDate()
  ).padStart(2, "0")}`;
}

export interface ProjectDetail {
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

interface ProjectHeaderProps {
  project: ProjectDetail;
  syncing: boolean;
  syncMsg: string | null;
  onSync: () => void;
  syncingInfo: boolean;
  syncInfoMsg: string | null;
  onSyncInfo: () => void;
  kbRefreshKey?: number;
}

export default function ProjectHeader({
  project,
  syncing,
  syncMsg,
  onSync,
  syncingInfo,
  syncInfoMsg,
  onSyncInfo,
  kbRefreshKey = 0,
}: ProjectHeaderProps) {
  const router = useRouter();
  const phase =
    PHASE_STYLES[project.current_phase] || {
      label: project.current_phase,
      classes: `${oc.bgHover} ${oc.textSecondary} ${oc.borderSubtle}`,
    };
  const risk =
    RISK_STYLES[project.risk_level] || {
      label: project.risk_level,
      classes: `${oc.bgHover} ${oc.textSecondary} ${oc.borderSubtle}`,
    };

  const [kbSummary, setKbSummary] = useState<any>(null);
  const [kbLoading, setKbLoading] = useState(false);

  const loadKbSummary = async () => {
    if (!project.knowledge_base_path) return;
    setKbLoading(true);
    try {
      const r = await fetch(
        `${API_BASE}/api/projects/${project.id}/kb-summary?t=${Date.now()}`
      );
      const j = await r.json();
      if (j.success) setKbSummary(j.data);
    } catch {
      // ignore
    } finally {
      setKbLoading(false);
    }
  };

  useEffect(() => {
    loadKbSummary();
  }, [project.id, project.knowledge_base_path, kbRefreshKey]);

  const kbStatus =
    kbSummary?.project_profile?.status_name ||
    kbSummary?.project?.status ||
    "";
  const kbCode =
    kbSummary?.project_profile?.code || kbSummary?.project?.id || "";
  const isWarning =
    kbStatus.includes("预警") || kbStatus.includes("风险");

  return (
    <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
      <div className="flex items-start gap-3 min-w-0">
        <Button
          variant="ghost"
          size="icon"
          onClick={() => router.back()}
          className={`${btnGhost} shrink-0`}
        >
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <div className="min-w-0">
          <div className="flex items-center gap-2.5 flex-wrap">
            <h1 className="text-2xl font-bold tracking-[-0.02em] text-[var(--oc-text-primary)]">
              {project.title || "（无标题）"}
            </h1>
            <Badge className={`${phase.classes} text-[11px] font-semibold`}>
              {phase.label}
            </Badge>
            <Badge className={`${risk.classes} text-[11px] font-semibold`}>
              {risk.label}
            </Badge>
          </div>
          <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-[13px] text-[var(--oc-text-secondary)]">
            {kbCode ? (
              <span className="font-mono text-[var(--oc-text-tertiary)]">
                {kbCode}
              </span>
            ) : project.external_project_id ? (
              <span className="font-mono text-[var(--oc-text-tertiary)]">
                {project.external_project_id}
              </span>
            ) : (
              <span className="font-mono text-[var(--oc-text-tertiary)]">
                {project.id}
              </span>
            )}
            <span>·</span>
            <span>
              {project.type === "quick_validation" ? "快速验证" : "预立项转正式"}
            </span>
            {project.vp && (
              <>
                <span>·</span>
                <span>负责人 {project.vp}</span>
              </>
            )}
            {project.deadline && (
              <>
                <span>·</span>
                <span className="flex items-center gap-1">
                  <Calendar className="h-3.5 w-3.5" />
                  {fmtDateFull(project.start_date || "")} -{" "}
                  {fmtDateFull(project.deadline)}
                </span>
              </>
            )}
            {project.knowledge_base_path && (
              <>
                <span>·</span>
                <span className="flex items-center gap-1 text-[var(--oc-accent)]">
                  <BookOpen className="h-3.5 w-3.5" />
                  已关联知识库
                </span>
              </>
            )}
          </div>
          {isWarning && kbStatus && (
            <div className="mt-2 flex items-center gap-1.5 text-xs text-[var(--oc-error)]">
              <AlertTriangle className="h-3.5 w-3.5" />
              {kbStatus}
            </div>
          )}
        </div>
      </div>

      <div className="flex flex-col items-start lg:items-end gap-2 shrink-0">
        <div className="flex items-center gap-2 flex-wrap">
          <Button
            size="sm"
            variant="outline"
            className={btnSecondary}
            onClick={onSyncInfo}
            disabled={syncingInfo || syncing}
          >
            {syncingInfo ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <FolderSync className="h-3.5 w-3.5" />
            )}
            同步知识库
          </Button>
          <Button
            size="sm"
            variant="outline"
            className={btnSecondary}
            onClick={onSync}
            disabled={syncing || syncingInfo}
          >
            {syncing ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <RefreshCw className="h-3.5 w-3.5" />
            )}
            同步状态
          </Button>
        </div>
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-[var(--oc-text-tertiary)]">
          {project.last_synced_at ? (
            <span>
              上次同步{" "}
              {new Date(project.last_synced_at).toLocaleString("zh-CN", {
                month: "numeric",
                day: "numeric",
                hour: "2-digit",
                minute: "2-digit",
              })}
            </span>
          ) : (
            <span className="text-[var(--oc-warning)]">尚未同步</span>
          )}
          {syncMsg && (
            <span className="text-[var(--oc-success)]">{syncMsg}</span>
          )}
          {syncInfoMsg && (
            <span className="text-[var(--oc-success)]">{syncInfoMsg}</span>
          )}
          {kbLoading && <span>知识库摘要加载中…</span>}
        </div>
      </div>
    </div>
  );
}
