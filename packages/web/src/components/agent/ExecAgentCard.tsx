"use client";

import { Bot, Loader2, CheckCircle2, XCircle, ChevronDown, ChevronRight } from "lucide-react";
import { useState } from "react";
import { cn } from "@/lib/utils";

interface ExecAgentCardProps {
  taskId: string;
  description: string;
  logs: string[];
  status: "running" | "completed" | "failed";
  result?: string;
}

export function ExecAgentCard({ taskId: _taskId, description, logs, status, result }: ExecAgentCardProps) {
  const [showLogs, setShowLogs] = useState(true);
  const [showFullResult, setShowFullResult] = useState(false);
  const displayLogs = logs.slice(-8);

  const statusConfig = {
    running: {
      border: "border-[rgba(122,159,201,0.3)]",
      bg: "bg-[var(--oc-info-soft)]",
      icon: <Loader2 className="h-4 w-4 shrink-0 animate-spin text-[var(--oc-info)]" />,
      label: "执行中…",
      text: "text-[var(--oc-info)]",
    },
    completed: {
      border: "border-[rgba(106,158,127,0.3)]",
      bg: "bg-[var(--oc-success-soft)]",
      icon: <CheckCircle2 className="h-4 w-4 shrink-0 text-[var(--oc-success)]" />,
      label: "已完成",
      text: "text-[var(--oc-success)]",
    },
    failed: {
      border: "border-[rgba(201,123,109,0.3)]",
      bg: "bg-[var(--oc-error-soft)]",
      icon: <XCircle className="h-4 w-4 shrink-0 text-[var(--oc-error)]" />,
      label: "执行失败",
      text: "text-[var(--oc-error)]",
    },
  };

  const config = statusConfig[status];

  return (
    <div
      className={cn(
        "my-2 overflow-hidden rounded-[10px] border text-xs",
        config.border,
        "bg-[var(--oc-bg-surface)]"
      )}
    >
      {/* 头部 */}
      <div className="flex items-center gap-2 px-3 py-2.5">
        <Bot className="h-4 w-4 shrink-0 text-[var(--oc-accent)]" />
        <div className="min-w-0 flex-1">
          <p className="truncate text-[13px] font-semibold text-[var(--oc-text-primary)]">执行 Agent</p>
          <p className="truncate text-[11px] text-[var(--oc-text-secondary)]">{description}</p>
        </div>
        <div className="flex shrink-0 items-center gap-1.5">
          {config.icon}
          <span className={cn("text-[11px] font-semibold", config.text)}>{config.label}</span>
        </div>
      </div>

      {/* 日志区 */}
      {logs.length > 0 && (
        <div className="border-t border-[var(--oc-border-subtle)]">
          <button
            onClick={() => setShowLogs(!showLogs)}
            className="flex w-full items-center gap-1.5 px-3 py-1.5 text-left text-[11px] text-[var(--oc-text-secondary)] transition-colors hover:text-[var(--oc-text-primary)]"
          >
            {showLogs ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
            执行日志 ({logs.length} 条)
          </button>
          {showLogs && (
            <div className="space-y-0.5 px-3 pb-2">
              {displayLogs.map((log, i) => (
                <p key={i} className="leading-relaxed text-[var(--oc-text-tertiary)]">
                  <span className="mr-1.5 text-[var(--oc-border-strong)]">▸</span>
                  {log}
                </p>
              ))}
            </div>
          )}
        </div>
      )}

      {/* 完成结果 */}
      {result && status === "completed" && (
        <div className="border-t border-[var(--oc-border-subtle)] px-3 py-2">
          <button
            onClick={() => setShowFullResult(!showFullResult)}
            className="mb-1 flex items-center gap-1.5 text-[11px] font-semibold text-[var(--oc-success)] transition-colors hover:text-[var(--oc-success)]/80"
          >
            {showFullResult ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
            执行摘要
          </button>
          <p
            className={cn(
              "leading-relaxed text-[var(--oc-text-secondary)] whitespace-pre-wrap",
              showFullResult ? "" : "line-clamp-3"
            )}
          >
            {result}
          </p>
        </div>
      )}

      {/* 失败摘要 */}
      {result && status === "failed" && (
        <div className="border-t border-[var(--oc-border-subtle)] px-3 py-2">
          <p className="mb-1 text-[11px] font-semibold text-[var(--oc-error)]">失败原因</p>
          <p className="leading-relaxed text-[var(--oc-error)]/80">{result}</p>
        </div>
      )}
    </div>
  );
}
