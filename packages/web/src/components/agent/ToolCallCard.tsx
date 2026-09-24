"use client";

import { useState } from "react";
import { ChevronDown, ChevronRight, Loader2, CheckCircle2, XCircle, Wrench, AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const TOOL_LABELS: Record<string, string> = {
  get_system_status: "查询系统状态",
  query_projects: "查询项目立项",
  query_requirements: "查询需求分析",
  query_dev_tasks: "查询开发任务",
  query_employees: "查询员工列表",
  query_versions: "查询版本列表",
  query_work_cycles: "查询工作周期",
  query_chat_records: "查询聊天记录",
  query_reports: "查询分析报告",
  create_project: "创建项目立项",
  update_project: "更新项目立项",
  transition_project_phase: "项目阶段流转",
  add_project_member: "添加项目成员",
  sync_project_status: "同步项目状态",
  create_requirement: "创建需求分析",
  update_requirement: "更新需求分析",
  delete_requirement: "删除需求分析",
  create_dev_task: "创建开发任务",
  update_dev_task: "更新开发任务",
  assign_employee: "分配员工",
  delete_dev_task: "删除开发任务",
  upsert_daily_plan: "更新每日计划",
  update_daily_plan_task: "更新每日计划任务",
  delete_daily_plan_task: "删除每日计划任务",
  dispatch_exec_agent: "派发执行 Agent",
};

interface ToolCallCardProps {
  id: string;
  name: string;
  params?: Record<string, unknown>;
  result?: unknown;
  error?: string;
  status: "running" | "completed" | "error" | "pending";
  onConfirm?: (approved: boolean) => void;
}

export function ToolCallCard({ name, params, result, error, status, onConfirm }: ToolCallCardProps) {
  const [open, setOpen] = useState(false);
  const label = TOOL_LABELS[name] ?? name;

  const statusConfig = {
    running: {
      border: "border-[rgba(122,159,201,0.3)]",
      icon: <Loader2 className="h-3.5 w-3.5 shrink-0 animate-spin text-[var(--oc-info)]" />,
      badge: null,
    },
    pending: {
      border: "border-[rgba(201,163,92,0.3)]",
      icon: <AlertTriangle className="h-3.5 w-3.5 shrink-0 text-[var(--oc-warning)]" />,
      badge: <span className="mr-2 text-[11px] font-semibold text-[var(--oc-warning)]">待确认</span>,
    },
    completed: {
      border: "border-[rgba(106,158,127,0.3)]",
      icon: <CheckCircle2 className="h-3.5 w-3.5 shrink-0 text-[var(--oc-success)]" />,
      badge: null,
    },
    error: {
      border: "border-[rgba(201,123,109,0.3)]",
      icon: <XCircle className="h-3.5 w-3.5 shrink-0 text-[var(--oc-error)]" />,
      badge: null,
    },
  };

  const config = statusConfig[status];

  return (
    <div
      className={cn(
        "my-1.5 overflow-hidden rounded-[10px] border text-xs",
        config.border,
        "bg-[var(--oc-bg-root)]"
      )}
    >
      <button
        onClick={() => setOpen(!open)}
        className="flex w-full items-center gap-2 px-3 py-2 text-left"
      >
        {config.icon}
        <Wrench className="h-3 w-3 shrink-0 text-[var(--oc-text-tertiary)]" />
        <span className="flex-1 truncate text-[13px] font-medium text-[var(--oc-text-primary)]">{label}</span>
        {config.badge}
        {open ? (
          <ChevronDown className="h-3.5 w-3.5 shrink-0 text-[var(--oc-text-tertiary)]" />
        ) : (
          <ChevronRight className="h-3.5 w-3.5 shrink-0 text-[var(--oc-text-tertiary)]" />
        )}
      </button>

      {open && (
        <div className="space-y-2 border-t border-[var(--oc-border-subtle)] px-3 pb-3 pt-2">
          {params && Object.keys(params).length > 0 && (
            <div>
              <p className="mb-1 text-[11px] font-semibold text-[var(--oc-text-secondary)]">参数</p>
              <pre className="overflow-x-auto rounded-lg bg-[var(--oc-bg-surface)] p-2 text-[11px] leading-relaxed text-[var(--oc-text-secondary)]">
                {JSON.stringify(params, null, 2)}
              </pre>
            </div>
          )}
          {error && (
            <div>
              <p className="mb-1 text-[11px] font-semibold text-[var(--oc-error)]">错误</p>
              <p className="rounded-lg bg-[var(--oc-error-soft)] p-2 text-[var(--oc-error)]">{error}</p>
            </div>
          )}
          {result !== undefined && result !== null && !error && (
            <div>
              <p className="mb-1 text-[11px] font-semibold text-[var(--oc-text-secondary)]">返回结果</p>
              <pre className="max-h-48 overflow-x-auto overflow-y-auto rounded-lg bg-[var(--oc-bg-surface)] p-2 text-[11px] leading-relaxed text-[var(--oc-text-secondary)]">
                {typeof result === "string" ? result : JSON.stringify(result, null, 2)}
              </pre>
            </div>
          )}
          {status === "pending" && onConfirm && (
            <div className="flex items-center gap-2 pt-1">
              <Button
                size="sm"
                onClick={() => onConfirm(true)}
                className="h-7 rounded-lg bg-[var(--oc-accent)] px-3 text-xs font-semibold text-[var(--oc-bg-root)] hover:bg-[var(--oc-accent-hover)]"
              >
                确认执行
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={() => onConfirm(false)}
                className="h-7 rounded-lg border-[var(--oc-border-subtle)] bg-[var(--oc-bg-elevated)] px-3 text-xs font-semibold text-[var(--oc-text-primary)] hover:border-[var(--oc-border-strong)] hover:bg-[var(--oc-bg-hover)]"
              >
                拒绝
              </Button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
