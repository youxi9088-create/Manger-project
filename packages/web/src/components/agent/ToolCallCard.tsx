"use client";

import { useState } from "react";
import { ChevronDown, ChevronRight, Loader2, CheckCircle2, XCircle, Wrench } from "lucide-react";

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
  create_requirement: "创建需求分析",
  create_dev_task: "创建开发任务",
  update_requirement_status: "更新需求状态",
  assign_employee: "分配员工",
  dispatch_exec_agent: "派发执行 Agent",
};

interface ToolCallCardProps {
  id: string;
  name: string;
  params?: Record<string, unknown>;
  result?: unknown;
  error?: string;
  status: "running" | "completed" | "error";
}

export function ToolCallCard({ name, params, result, error, status }: ToolCallCardProps) {
  const [open, setOpen] = useState(false);
  const label = TOOL_LABELS[name] ?? name;

  const statusIcon =
    status === "running" ? (
      <Loader2 className="h-3.5 w-3.5 animate-spin text-sky-400 shrink-0" />
    ) : status === "completed" ? (
      <CheckCircle2 className="h-3.5 w-3.5 text-emerald-400 shrink-0" />
    ) : (
      <XCircle className="h-3.5 w-3.5 text-red-400 shrink-0" />
    );

  const borderColor =
    status === "running"
      ? "border-sky-500/30 bg-sky-500/5"
      : status === "completed"
      ? "border-emerald-500/30 bg-emerald-500/5"
      : "border-red-500/30 bg-red-500/5";

  return (
    <div className={`rounded-lg border ${borderColor} text-xs my-1.5`}>
      <button
        onClick={() => setOpen(!open)}
        className="flex items-center gap-2 w-full px-3 py-2 text-left"
      >
        {statusIcon}
        <Wrench className="h-3 w-3 text-muted-foreground shrink-0" />
        <span className="font-medium text-foreground/80 flex-1 truncate">{label}</span>
        {open ? (
          <ChevronDown className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
        ) : (
          <ChevronRight className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
        )}
      </button>

      {open && (
        <div className="px-3 pb-3 space-y-2 border-t border-border/30 pt-2">
          {params && Object.keys(params).length > 0 && (
            <div>
              <p className="text-muted-foreground mb-1">参数</p>
              <pre className="bg-black/20 rounded p-2 overflow-x-auto text-[11px] leading-relaxed">
                {JSON.stringify(params, null, 2)}
              </pre>
            </div>
          )}
          {error && (
            <div>
              <p className="text-red-400 mb-1">错误</p>
              <p className="text-red-300/80 bg-red-500/10 rounded p-2">{error}</p>
            </div>
          )}
          {result !== undefined && result !== null && !error && (
            <div>
              <p className="text-muted-foreground mb-1">返回结果</p>
              <pre className="bg-black/20 rounded p-2 overflow-x-auto text-[11px] leading-relaxed max-h-48">
                {typeof result === "string" ? result : JSON.stringify(result, null, 2)}
              </pre>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
