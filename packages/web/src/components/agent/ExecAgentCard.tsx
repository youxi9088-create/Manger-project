"use client";

import { Bot, Loader2, CheckCircle2, XCircle, ChevronDown, ChevronRight } from "lucide-react";
import { useState } from "react";

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
  const displayLogs = logs.slice(-8); // 最多展示最近 8 条

  const borderColor =
    status === "running"
      ? "border-sky-500/40 bg-sky-500/5"
      : status === "completed"
      ? "border-emerald-500/40 bg-emerald-500/5"
      : "border-red-500/40 bg-red-500/5";

  const statusLabel =
    status === "running" ? "执行中..." : status === "completed" ? "已完成" : "执行失败";

  const statusIcon =
    status === "running" ? (
      <Loader2 className="h-4 w-4 animate-spin text-sky-400 shrink-0" />
    ) : status === "completed" ? (
      <CheckCircle2 className="h-4 w-4 text-emerald-400 shrink-0" />
    ) : (
      <XCircle className="h-4 w-4 text-red-400 shrink-0" />
    );

  return (
    <div className={`rounded-lg border ${borderColor} my-2 text-xs`}>
      {/* 头部 */}
      <div className="flex items-center gap-2 px-3 py-2.5">
        <Bot className="h-4 w-4 text-sky-400 shrink-0" />
        <div className="flex-1 min-w-0">
          <p className="font-medium text-foreground/80 truncate">执行 Agent</p>
          <p className="text-muted-foreground truncate">{description}</p>
        </div>
        <div className="flex items-center gap-1.5 shrink-0">
          {statusIcon}
          <span
            className={
              status === "running"
                ? "text-sky-400"
                : status === "completed"
                ? "text-emerald-400"
                : "text-red-400"
            }
          >
            {statusLabel}
          </span>
        </div>
      </div>

      {/* 日志区 */}
      {logs.length > 0 && (
        <div className="border-t border-border/30">
          <button
            onClick={() => setShowLogs(!showLogs)}
            className="flex items-center gap-1.5 px-3 py-1.5 text-muted-foreground w-full text-left hover:text-foreground/60 transition-colors"
          >
            {showLogs ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
            执行日志 ({logs.length} 条)
          </button>
          {showLogs && (
            <div className="px-3 pb-2 space-y-0.5">
              {displayLogs.map((log, i) => (
                <p key={i} className="text-muted-foreground/70 leading-relaxed">
                  <span className="text-muted-foreground/40 mr-1.5">▸</span>
                  {log}
                </p>
              ))}
            </div>
          )}
        </div>
      )}

      {/* 完成结果 */}
      {result && status === "completed" && (
        <div className="border-t border-emerald-500/20 px-3 py-2">
          <button
            onClick={() => setShowFullResult(!showFullResult)}
            className="flex items-center gap-1.5 text-emerald-400/80 mb-1 hover:text-emerald-400 transition-colors"
          >
            {showFullResult ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
            执行摘要
          </button>
          <p className={`text-foreground/70 leading-relaxed whitespace-pre-wrap ${showFullResult ? "" : "line-clamp-3"}`}>{result}</p>
        </div>
      )}

      {/* 失败摘要 */}
      {result && status === "failed" && (
        <div className="border-t border-red-500/20 px-3 py-2">
          <p className="text-red-400/80 mb-1">失败原因</p>
          <p className="text-red-300/70 leading-relaxed">{result}</p>
        </div>
      )}
    </div>
  );
}
