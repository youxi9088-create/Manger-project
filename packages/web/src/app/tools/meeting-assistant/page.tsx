"use client";

import { useState, useEffect, useMemo, useCallback, useRef } from "react";
import { cn } from "@/lib/utils";

const API_BASE = process.env.NEXT_PUBLIC_SERVER_API
  || (process.env.NODE_ENV === "production" ? "/a/openclaw" : "http://localhost:3001");
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Video,
  RefreshCw,
  Loader2,
  CheckCircle,
  Clock,
  Sparkles,
  Download,
  FileText,
  AlertTriangle,
  Target,
  Ban,
  Brain,
  Save,
  CheckSquare,
  ArrowRightLeft,
  Upload,
  Mic,
  ListChecks,
  FileAudio,
  BarChart2,
  GitBranch,
  HelpCircle,
  X,
} from "lucide-react";

interface IntelligenceResult {
  executive_summary?: string;
  decisions?: { content: string; owner?: string; impact?: string }[];
  action_items?: { task: string; owner?: string; due?: string; priority?: string }[];
  risks?: { description: string; severity?: string; impact?: string; mitigation?: string }[];
  blockers?: { description: string; owner?: string; suggestion?: string }[];
  open_questions?: { question: string; owner?: string; needed_by?: string }[];
  dependencies?: { item: string; owner?: string; status?: string }[];
  key_topics?: string[];
  sentiment?: string;
  follow_up_needed?: string;
  next_meeting_suggestion?: string;
}

type PendingIntelligenceJob = {
  jobId: string;
  meetingId: string;
  startedAt: number;
};

function MeetingIntelligence({
  transcript,
  title,
  startTime,
  meetingId,
  record,
  onResultChange,
}: {
  transcript?: string;
  title?: string;
  startTime?: string;
  meetingId?: string;
  record?: MeetingRecord;
  onResultChange?: (result: IntelligenceResult | null, saved: boolean) => void;
}) {
  const [result, setResult] = useState<IntelligenceResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [logMsg, setLogMsg] = useState("");
  const [saved, setSaved] = useState(false);
  const [loadingSaved, setLoadingSaved] = useState(false);
  const [confirmed, setConfirmed] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [syncMsg, setSyncMsg] = useState<string | null>(null);

  const confirmKey = useMemo(() => `meeting-confirmed-${meetingId || title || "unknown"}`, [meetingId, title]);
  const analysisJobKey = useMemo(() => `meeting-analysis-job-${meetingId || title || "unknown"}`, [meetingId, title]);
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    return () => { mountedRef.current = false; };
  }, []);

  const clearPendingJob = () => {
    if (typeof window !== "undefined") localStorage.removeItem(analysisJobKey);
  };

  const applyAnalysisResult = (analysis: IntelligenceResult) => {
    if (!mountedRef.current) return;
    setResult(analysis);
    setSaved(true);
    setLogMsg("");
    onResultChange?.(analysis, true);
  };

  const pollAnalysisJob = async (job: PendingIntelligenceJob) => {
    for (let attempt = 0; attempt < 200; attempt += 1) {
      await new Promise(resolve => setTimeout(resolve, 3000));
      if (!mountedRef.current) return;

      const jobResponse = await fetch(`${API_BASE}/api/meetings/intelligence/jobs/${encodeURIComponent(job.jobId)}`);
      const jobData = await jobResponse.json().catch(() => ({}));
      if (!jobResponse.ok || !jobData.success) throw new Error(errorMessage(jobData));
      if (jobData.job?.status === "failed") {
        clearPendingJob();
        throw new Error(errorMessage(jobData.job.error));
      }
      if (jobData.job?.status === "queued") setLogMsg("分析任务已排队…");
      if (jobData.job?.status === "analyzing") setLogMsg("AI 正在分析会议内容…");

      const savedResponse = await fetch(`${API_BASE}/api/meetings/intelligence/${encodeURIComponent(job.meetingId)}`);
      const savedData = await savedResponse.json().catch(() => ({}));
      const updatedAt = Date.parse(savedData.updated_at || "");
      if (savedData.success && savedData.result && (!updatedAt || updatedAt >= job.startedAt - 1000)) {
        clearPendingJob();
        applyAnalysisResult(savedData.result as IntelligenceResult);
        return;
      }
    }
    throw new Error("分析耗时较长，请稍后重新打开该会议查看结果");
  };

  // Restore either a saved result or a background job after this tab remounts.
  useEffect(() => {
    const id = meetingId || title;
    if (!id) return;
    let cancelled = false;
    setLoadingSaved(true);
    setResult(null);
    setSaved(false);
    onResultChange?.(null, false);
    if (typeof window !== "undefined") {
      setConfirmed(localStorage.getItem(confirmKey) === "1");
    }

    const restore = async () => {
      try {
        const savedResponse = await fetch(`${API_BASE}/api/meetings/intelligence/${encodeURIComponent(id)}`);
        const savedData = await savedResponse.json().catch(() => ({}));
        if (cancelled) return;
        if (savedData.success && savedData.result) {
          applyAnalysisResult(savedData.result as IntelligenceResult);
          return;
        }

        const pendingRaw = typeof window !== "undefined" ? localStorage.getItem(analysisJobKey) : null;
        const pending = pendingRaw ? JSON.parse(pendingRaw) as PendingIntelligenceJob : null;
        if (!pending || pending.meetingId !== id) return;

        setLoading(true);
        setLogMsg("正在恢复后台分析任务…");
        try {
          await pollAnalysisJob(pending);
        } catch (error) {
          if (!cancelled) setLogMsg(`失败: ${error instanceof Error ? error.message : errorMessage(error)}`);
        } finally {
          if (!cancelled) setLoading(false);
        }
      } catch {
        // The user can retry manually when the status endpoint is unavailable.
      } finally {
        if (!cancelled) setLoadingSaved(false);
      }
    };
    void restore();
    return () => { cancelled = true; };
  }, [meetingId, title, confirmKey, analysisJobKey, onResultChange]);

  if (!transcript) return null;

  const handleAnalyze = async () => {
    setLoading(true); setLogMsg(""); setResult(null);
    onResultChange?.(null, false);
    try {
      const res = await fetch(`${API_BASE}/api/meetings/intelligence`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ transcript, title, startTime, meetingId, async: true }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(errorMessage(data));
      }
      const accepted = await res.json() as { jobId?: string; meetingId?: string; startedAt?: string };
      const id = accepted.meetingId || meetingId || title;
      if (!id || !accepted.jobId) throw new Error("会议分析任务创建失败");
      const job: PendingIntelligenceJob = {
        jobId: accepted.jobId,
        meetingId: id,
        startedAt: Date.parse(accepted.startedAt || "") || Date.now(),
      };
      if (typeof window !== "undefined") localStorage.setItem(analysisJobKey, JSON.stringify(job));
      setLogMsg("正在后台分析会议内容…");
      await pollAnalysisJob(job);
    } catch (err: unknown) {
      if (mountedRef.current) setLogMsg(`失败: ${err instanceof Error ? err.message : errorMessage(err)}`);
    } finally {
      if (mountedRef.current) setLoading(false);
    }
  };

  const SEVERITY_STYLE: Record<string, string> = {
    high: "border-transparent bg-[var(--oc-error-soft)] text-[var(--oc-error)]",
    medium: "border-transparent bg-[var(--oc-warning-soft)] text-[var(--oc-warning)]",
    low: "border-transparent bg-[var(--oc-success-soft)] text-[var(--oc-success)]",
  };

  const PRIORITY_STYLE: Record<string, string> = {
    high: "border-transparent bg-[var(--oc-error-soft)] text-[var(--oc-error)]",
    medium: "border-transparent bg-[var(--oc-warning-soft)] text-[var(--oc-warning)]",
    low: "border-transparent bg-[var(--oc-success-soft)] text-[var(--oc-success)]",
  };

  if (!result) {
    return (
      <div className="flex flex-col items-center justify-center rounded-[14px] border border-dashed border-[var(--oc-border-strong)] bg-[var(--oc-bg-surface)] p-8 text-center">
        <BarChart2 className="h-10 w-10 text-[var(--oc-text-tertiary)]" />
        <h3 className="mt-4 text-[15px] font-bold text-[var(--oc-text-primary)]">深度分析</h3>
        <p className="mt-1 max-w-md text-[13px] leading-relaxed text-[var(--oc-text-secondary)]">
          从转录文本中提取关键决策、行动项、风险评估与后续跟进建议。
        </p>
        <div className="mt-4 flex items-center gap-3">
          {loadingSaved && <span className="text-xs text-[var(--oc-text-secondary)]">加载已保存结果…</span>}
          {logMsg && <span className="text-xs text-[var(--oc-text-secondary)]">{logMsg}</span>}
          <Button
            size="sm"
            onClick={handleAnalyze}
            disabled={loading || loadingSaved}
            className="bg-[var(--oc-accent)] text-[var(--oc-bg-root)] hover:bg-[var(--oc-accent-hover)]"
          >
            {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1" /> : <Brain className="h-3.5 w-3.5 mr-1" />}
            {loading ? "分析中…" : "开始分析"}
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="rounded-[14px] border border-[var(--oc-border-subtle)] bg-[var(--oc-bg-surface)] p-5 space-y-5">
      <div className="flex items-center justify-between">
        <h3 className="flex items-center gap-2 text-[13px] font-bold text-[var(--oc-text-primary)]">
          <Brain className="h-4 w-4 text-[var(--oc-accent)]" />
          AI 深度分析
          {saved && (
            <span className="ml-2 inline-flex items-center gap-1 rounded-full border border-[var(--oc-success)]/25 bg-[var(--oc-success-soft)] px-2 py-0.5 text-[10px] font-normal text-[var(--oc-success)]">
              <Save className="h-3 w-3" /> 已保存
            </span>
          )}
        </h3>
        <Button
          size="sm"
          variant="ghost"
          onClick={handleAnalyze}
          disabled={loading}
          className="text-xs text-[var(--oc-text-secondary)] hover:bg-[var(--oc-bg-hover)] hover:text-[var(--oc-text-primary)]"
        >
          {loading ? <Loader2 className="h-3 w-3 animate-spin mr-1" /> : <RefreshCw className="h-3 w-3 mr-1" />}
          重新分析
        </Button>
      </div>

      {result.executive_summary && (
        <div className="rounded-[10px] border border-[var(--oc-border-subtle)] bg-[var(--oc-bg-elevated)] p-3 text-[13px] leading-[1.8] text-[var(--oc-text-primary)]">
          {result.executive_summary}
        </div>
      )}

      {/* 核心议题 */}
      {result.key_topics && result.key_topics.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {result.key_topics.map((t, i) => (
            <span key={i} className="rounded-full border border-[var(--oc-border-subtle)] bg-[var(--oc-bg-elevated)] px-2 py-0.5 text-[11px] text-[var(--oc-text-secondary)]">
              {t}
            </span>
          ))}
        </div>
      )}

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        {/* 关键决策 */}
        {result.decisions && result.decisions.length > 0 && (
          <div className="space-y-2">
            <h4 className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-[var(--oc-accent)]">
              <Target className="h-3.5 w-3.5" /> 关键决策（{result.decisions.length}）
            </h4>
            {result.decisions.map((d, i) => (
              <div key={i} className="rounded-[10px] border border-[var(--oc-border-subtle)] bg-[var(--oc-bg-elevated)] p-3 space-y-1">
                <p className="text-[13px] text-[var(--oc-text-primary)]">{d.content}</p>
                <div className="flex flex-wrap gap-2 text-[11px] text-[var(--oc-text-secondary)]">
                  {d.owner && <span>决策者：{d.owner}</span>}
                  {d.impact && <span>· 影响：{d.impact}</span>}
                </div>
              </div>
            ))}
          </div>
        )}

        {/* 行动项 */}
        {result.action_items && result.action_items.length > 0 && (
          <div className="space-y-2">
            <h4 className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-[var(--oc-success)]">
              <CheckSquare className="h-3.5 w-3.5" /> 行动项（{result.action_items.length}）
            </h4>
            {result.action_items.map((a, i) => (
              <div key={i} className="rounded-[10px] border border-[var(--oc-border-subtle)] bg-[var(--oc-bg-elevated)] p-3 space-y-1.5">
                <p className="text-[13px] text-[var(--oc-text-primary)]">{a.task}</p>
                <div className="flex flex-wrap gap-1.5">
                  {a.priority && <span className={`rounded px-1.5 py-0.5 text-[10px] font-medium ${PRIORITY_STYLE[a.priority] || ""}`}>{a.priority === "high" ? "紧急" : a.priority === "medium" ? "中等" : "一般"}</span>}
                  {a.owner && <span className="rounded bg-[var(--oc-info-soft)] px-1.5 py-0.5 text-[10px] text-[var(--oc-info)]">{a.owner}</span>}
                  {a.due && <span className="rounded bg-[var(--oc-bg-hover)] px-1.5 py-0.5 text-[10px] text-[var(--oc-text-secondary)]">{a.due}</span>}
                </div>
              </div>
            ))}
          </div>
        )}

        {/* 风险评估 */}
        {result.risks && result.risks.length > 0 && (
          <div className="space-y-2">
            <h4 className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-[var(--oc-warning)]">
              <AlertTriangle className="h-3.5 w-3.5" /> 风险评估（{result.risks.length}）
            </h4>
            {result.risks.map((r, i) => (
              <div key={i} className={`rounded-[10px] border p-3 space-y-1 ${SEVERITY_STYLE[r.severity || "medium"] || ""}`}>
                <p className="text-[13px] font-medium">{r.description}</p>
                {r.impact && <p className="text-[11px] opacity-80">影响：{r.impact}</p>}
                {r.mitigation && <p className="text-[11px] opacity-80">应对：{r.mitigation}</p>}
              </div>
            ))}
          </div>
        )}

        {/* 阻塞项 */}
        {result.blockers && result.blockers.length > 0 && (
          <div className="space-y-2">
            <h4 className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-[var(--oc-error)]">
              <Ban className="h-3.5 w-3.5" /> 阻塞项（{result.blockers.length}）
            </h4>
            {result.blockers.map((b, i) => (
              <div key={i} className="rounded-[10px] border border-[var(--oc-error)]/20 bg-[var(--oc-bg-elevated)] p-3 space-y-1">
                <p className="text-[13px] text-[var(--oc-text-primary)]">{b.description}</p>
                <div className="flex flex-wrap gap-2 text-[11px] text-[var(--oc-text-secondary)]">
                  {b.owner && <span>负责人：{b.owner}</span>}
                  {b.suggestion && <span>· 建议：{b.suggestion}</span>}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {(result.open_questions?.length || result.dependencies?.length) ? (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          {result.open_questions?.length ? (
            <div className="space-y-2">
              <h4 className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-[var(--oc-info)]">
                <HelpCircle className="h-3.5 w-3.5" /> 待澄清问题（{result.open_questions.length}）
              </h4>
              {result.open_questions.map((item, index) => (
                <div key={index} className="rounded-[10px] border border-[var(--oc-border-subtle)] bg-[var(--oc-bg-elevated)] p-3 text-[13px] text-[var(--oc-text-primary)]">
                  <p>{item.question}</p>
                  {(item.owner || item.needed_by) && <p className="mt-1 text-[11px] text-[var(--oc-text-secondary)]">{item.owner ? `跟进：${item.owner}` : ''}{item.owner && item.needed_by ? ' · ' : ''}{item.needed_by ? `需要在 ${item.needed_by} 前明确` : ''}</p>}
                </div>
              ))}
            </div>
          ) : null}
          {result.dependencies?.length ? (
            <div className="space-y-2">
              <h4 className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-[var(--oc-warning)]">
                <GitBranch className="h-3.5 w-3.5" /> 外部依赖（{result.dependencies.length}）
              </h4>
              {result.dependencies.map((item, index) => (
                <div key={index} className="rounded-[10px] border border-[var(--oc-border-subtle)] bg-[var(--oc-bg-elevated)] p-3 text-[13px] text-[var(--oc-text-primary)]">
                  <p>{item.item}</p>
                  {(item.owner || item.status) && <p className="mt-1 text-[11px] text-[var(--oc-text-secondary)]">{item.owner ? `依赖方：${item.owner}` : ''}{item.owner && item.status ? ' · ' : ''}{item.status || ''}</p>}
                </div>
              ))}
            </div>
          ) : null}
        </div>
      ) : null}

      {/* 后续跟进 */}
      {result.next_meeting_suggestion && (
        <div className="rounded-[10px] border border-[var(--oc-border-subtle)] bg-[var(--oc-bg-elevated)] p-3 text-xs text-[var(--oc-text-secondary)]">
          <span className="font-medium text-[var(--oc-accent)]">后续建议：</span>{result.next_meeting_suggestion}
        </div>
      )}

      {/* 同步操作 */}
      {saved && result.action_items && result.action_items.length > 0 && (
        <div className="space-y-2 border-t border-[var(--oc-border-subtle)] pt-4">
          {!confirmed ? (
            <>
              <p className="text-xs text-[var(--oc-text-secondary)]">请确认 AI 提取的纪要内容准确无误：</p>
              <Button
                size="sm"
                onClick={() => {
                  setConfirmed(true);
                  if (typeof window !== "undefined") {
                    localStorage.setItem(confirmKey, "1");
                  }
                }}
                className="bg-[var(--oc-accent)] text-[var(--oc-bg-root)] hover:bg-[var(--oc-accent-hover)]"
              >
                <CheckSquare className="h-3.5 w-3.5 mr-1" />
                确认纪要
              </Button>
            </>
          ) : (
            <>
              <p className="flex items-center gap-1 text-xs text-[var(--oc-success)]">
                <CheckSquare className="h-3 w-3" /> 已确认，可将行动项同步到其他模块：
              </p>
              <div className="flex flex-wrap gap-2">
                <Button
                  size="sm"
                  disabled={syncing}
                  onClick={async () => {
                    setSyncing(true);
                    setSyncMsg(null);
                    try {
                      const today = new Date().toISOString().slice(0, 10);
                      const dailyResp = await fetch(`${API_BASE}/api/daily-plans/${today}`);
                      const dailyJson = await dailyResp.json().catch(() => ({ tasks: [] }));
                      const existing = new Set((dailyJson.tasks || []).map((t: any) => String(t.title).toLowerCase()));
                      const newTasks = (result.action_items || [])
                        .map((a: any) => ({
                          id: `${Date.now()}-${Math.random().toString(16).slice(2)}`,
                          title: String(a?.task || "").trim() || "(无标题)",
                          status: "pending",
                          priority: a?.priority === "high" ? "high" : a?.priority === "low" ? "low" : "medium",
                          assignee: a?.owner || null,
                          notes: `来自会议《${title || "未命名"}》`,
                          completed_at: null,
                          expected_completion_at: a?.due ? new Date(a.due).toISOString() : null,
                          source_date: null,
                        }))
                        .filter((t: any) => t.title && !existing.has(t.title.toLowerCase()));

                      const saveResp = await fetch(`${API_BASE}/api/daily-plans/${today}`, {
                        method: "PUT",
                        headers: { "content-type": "application/json" },
                        body: JSON.stringify({
                          goalText: dailyJson.plan?.goal_text || `会议《${title || ""}》待办`,
                          tasks: [...(dailyJson.tasks || []), ...newTasks],
                        }),
                      });
                      if (!saveResp.ok) throw new Error("同步失败");
                      setSyncMsg(`已同步 ${newTasks.length} 个行动项到日报计划`);
                      setTimeout(() => setSyncMsg(null), 3000);
                    } catch (e: any) {
                      setSyncMsg(e?.message || "同步失败");
                    } finally {
                      setSyncing(false);
                    }
                  }}
                  className="bg-[var(--oc-accent)] text-[var(--oc-bg-root)] hover:bg-[var(--oc-accent-hover)]"
                >
                  {syncing ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1" /> : <ArrowRightLeft className="h-3.5 w-3.5 mr-1" />}
                  同步待办到日报计划
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={async () => {
                    const text = result.action_items?.map((a: any, i: number) => `${i + 1}. ${a.task}${a.owner ? ` (@${a.owner})` : ""}${a.due ? ` 截止：${a.due}` : ""}`).join("\n") || "";
                    try {
                      if (navigator.clipboard && window.isSecureContext) {
                        await navigator.clipboard.writeText(text);
                      } else {
                        const textarea = document.createElement("textarea");
                        textarea.value = text;
                        textarea.style.position = "fixed";
                        textarea.style.left = "-9999px";
                        document.body.appendChild(textarea);
                        textarea.select();
                        document.execCommand("copy");
                        document.body.removeChild(textarea);
                      }
                      setSyncMsg("已复制行动项清单");
                      setTimeout(() => setSyncMsg(null), 2000);
                    } catch {
                      setSyncMsg("复制失败");
                    }
                  }}
                  className="border-[var(--oc-border-subtle)] bg-[var(--oc-bg-elevated)] text-[var(--oc-text-primary)] hover:border-[var(--oc-border-strong)] hover:bg-[var(--oc-bg-hover)]"
                >
                  <CheckSquare className="h-3.5 w-3.5 mr-1" /> 复制行动项
                </Button>
              </div>
              {syncMsg && (
                <p className={`text-xs ${syncMsg.includes("失败") ? "text-[var(--oc-error)]" : "text-[var(--oc-success)]"}`}>{syncMsg}</p>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}

interface MeetingRecord {
  meetingId: string;
  title: string;
  startTime: string;
  recorder: string;
  duration: string;
  fileSize: string;
  audioUrl?: string;
  _rowIndex?: number;
  status: 'pending' | 'transcribing' | 'completed';
  transcript?: string;
  summary?: string;
  todos?: string[];
}

function errorMessage(error: unknown): string {
  if (typeof error === "string" && error.trim()) return error;
  if (error && typeof error === "object") {
    const value = error as Record<string, unknown>;
    return errorMessage(value.message || value.error || value.detail || value.code);
  }
  return "服务请求失败";
}

function RecordingStatusBadge({ status }: { status: MeetingRecord['status'] }) {
  if (status === 'completed') {
    return <span className="rounded-full bg-[var(--oc-success-soft)] px-2 py-0.5 text-[10px] font-medium text-[var(--oc-success)]">已生成</span>;
  }
  if (status === 'transcribing') {
    return <span className="rounded-full bg-[var(--oc-info-soft)] px-2 py-0.5 text-[10px] font-medium text-[var(--oc-info)]">转写中</span>;
  }
  return <span className="rounded-full bg-[var(--oc-warning-soft)] px-2 py-0.5 text-[10px] font-medium text-[var(--oc-warning)]">待分析</span>;
}

export default function MeetingAssistantPage() {
  const [records, setRecords] = useState<MeetingRecord[]>([]);
  const [loading, setLoading] = useState(false);
  const [transcribing, setTranscribing] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [intelResult, setIntelResult] = useState<IntelligenceResult | null>(null);
  const [syncing, setSyncing] = useState(false);
  const [syncMsg, setSyncMsg] = useState<string | null>(null);
  const [processMsg, setProcessMsg] = useState<string | null>(null);
  const handleIntelligenceResult = useCallback((result: IntelligenceResult | null) => {
    setIntelResult(result);
  }, []);

  const selectedRecord = useMemo(() => {
    return records.find(r => r.meetingId === selectedId) || records[0] || null;
  }, [records, selectedId]);

  const fetchRecords = async () => {
    setLoading(true);
    try {
      const res = await fetch(`${API_BASE}/api/meetings?t=${Date.now()}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({})
      });
      const data = await res.json();
      if (data.records && data.records.length > 0) {
        setRecords(data.records);
        setSelectedId(prev => prev || data.records[0].meetingId);
      } else {
        setRecords([]);
      }
    } catch (error) {
      console.error('获取会议列表失败:', error);
    } finally {
      setLoading(false);
    }
  };

  // 选中会议变化时加载已保存的智能分析结果，供摘要页决策/风险展示
  useEffect(() => {
    if (!selectedRecord) {
      setIntelResult(null);
      return;
    }
    let cancelled = false;
    setIntelResult(null);
    fetch(`${API_BASE}/api/meetings/intelligence/${encodeURIComponent(selectedRecord.meetingId)}`)
      .then(r => r.json())
      .then(data => {
        if (!cancelled && data.success && data.result) {
          setIntelResult(data.result);
        }
      })
      .catch(() => { /* ignore */ });
    return () => { cancelled = true; };
  }, [selectedRecord?.meetingId]);

  const processRecording = async (record: MeetingRecord, opts?: { audioDirectUrl?: string; transcribe?: boolean; regenerate?: boolean; forceRefresh?: boolean }) => {
    setTranscribing(record.meetingId);
    setProcessMsg(opts?.transcribe ? "正在创建转录任务…" : null);

    try {
      const res = await fetch(`${API_BASE}/api/meetings/process`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          meetingId: record.meetingId,
          format: 'audio',
          title: record.title,
          startTime: record.startTime,
          audioDirectUrl: opts?.audioDirectUrl || record.audioUrl,
          rowIndex: record._rowIndex,
          transcribe: Boolean(opts?.transcribe),
          regenerate: Boolean(opts?.regenerate),
          forceRefresh: Boolean(opts?.forceRefresh),
          transcript: opts?.regenerate ? record.transcript : undefined,
        })
      });
      let data = await res.json().catch(() => ({}));

      if (res.status === 202 && data.jobId) {
        const deadline = Date.now() + 10 * 60 * 1000;
        while (Date.now() < deadline) {
          await new Promise(resolve => setTimeout(resolve, 3000));
          const statusRes = await fetch(`${API_BASE}/api/meetings/process/${encodeURIComponent(data.jobId)}`);
          const statusData = await statusRes.json().catch(() => ({}));
          if (!statusRes.ok || !statusData.success) throw new Error(errorMessage(statusData.error));
          if (statusData.status === "failed") throw new Error(errorMessage(statusData.error));
          if (statusData.status === "completed") {
            data = { success: true, meetingId: record.meetingId, ...statusData.result };
            break;
          }
          const labels: Record<string, string> = {
            queued: "转录任务已排队…",
            downloading: "正在下载真实会议音频…",
            transcribing: "正在进行语音转写…",
            summarizing: "正在生成会议纪要…",
          };
          setProcessMsg(labels[statusData.status] || "正在处理…");
        }
        if (!data.transcript) throw new Error("转录任务等待超时，请稍后刷新会议列表查看结果");
      }

      if (data.success) {
        if (process.env.NODE_ENV !== 'production') {
          if (data.matchDebug) console.log('matchDebug:', data.matchDebug);
        }

        setRecords(records => records.map(r => {
          if (r.meetingId === record.meetingId) {
            return {
              ...r,
              status: data.transcript ? 'completed' : r.status,
              transcript: data.transcript,
              summary: data.summary,
              todos: data.todos
            };
          }
          return r;
        }));

        const downloadUrl = data.audioUrl;
        if (downloadUrl && !opts?.transcribe) {
          const link = document.createElement('a');
          link.href = downloadUrl;
          link.download = '';
          document.body.appendChild(link);
          link.click();
          document.body.removeChild(link);
        }
      } else {
        const errMsg = errorMessage(data.error);
        console.error('转录/处理失败:', errMsg);
        alert(`处理失败: ${errMsg}`);
      }
    } catch (error) {
      console.error('处理失败:', error);
      alert(`处理失败: ${error instanceof Error ? error.message : errorMessage(error)}`);
    } finally {
      setTranscribing(null);
      setProcessMsg(null);
    }
  };

  const syncToDaily = async (record: MeetingRecord) => {
    setSyncing(true);
    setSyncMsg(null);
    try {
      let result = intelResult;
      if (!result) {
        const resp = await fetch(`${API_BASE}/api/meetings/intelligence/${encodeURIComponent(record.meetingId)}`);
        const data = await resp.json();
        if (data.success && data.result) result = data.result;
      }
      const items = result?.action_items || [];
      if (items.length === 0) {
        setSyncMsg('暂无可同步的会议待办');
        setTimeout(() => setSyncMsg(null), 3000);
        return;
      }
      const today = new Date().toISOString().slice(0, 10);
      const dailyResp = await fetch(`${API_BASE}/api/daily-plans/${today}`);
      const dailyJson = await dailyResp.json().catch(() => ({ tasks: [] }));
      const existing = new Set((dailyJson.tasks || []).map((t: any) => String(t.title).toLowerCase()));
      const newTasks = items
        .map((a: any) => ({
          id: `${Date.now()}-${Math.random().toString(16).slice(2)}`,
          title: String(a?.task || "").trim() || "(无标题)",
          status: "pending",
          priority: a?.priority === "high" ? "high" : a?.priority === "low" ? "low" : "medium",
          assignee: a?.owner || null,
          notes: `来自会议《${record.title || "未命名"}》`,
          completed_at: null,
          expected_completion_at: a?.due ? new Date(a.due).toISOString() : null,
          source_date: null,
        }))
        .filter((t: any) => t.title && !existing.has(t.title.toLowerCase()));

      const saveResp = await fetch(`${API_BASE}/api/daily-plans/${today}`, {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          goalText: dailyJson.plan?.goal_text || `会议《${record.title || ""}》待办`,
          tasks: [...(dailyJson.tasks || []), ...newTasks],
        }),
      });
      if (!saveResp.ok) throw new Error("同步失败");
      setSyncMsg(`已同步 ${newTasks.length} 个行动项到日报计划`);
      setTimeout(() => setSyncMsg(null), 3000);
    } catch (e: any) {
      setSyncMsg(e?.message || "同步失败");
    } finally {
      setSyncing(false);
    }
  };

  const copyAll = async (record: MeetingRecord) => {
    const text = `# ${record.title}\n\n## 会议总结\n${record.summary || ''}\n\n## 待办事项\n${(record.todos || []).map((t, i) => `${i + 1}. ${t}`).join('\n')}\n\n## 转录内容\n${record.transcript || ''}`;
    try {
      if (navigator.clipboard && window.isSecureContext) {
        await navigator.clipboard.writeText(text);
      } else {
        const textarea = document.createElement('textarea');
        textarea.value = text;
        textarea.style.position = 'fixed';
        textarea.style.left = '-9999px';
        document.body.appendChild(textarea);
        textarea.select();
        document.execCommand('copy');
        document.body.removeChild(textarea);
      }
      setSyncMsg('已复制会议全部内容');
      setTimeout(() => setSyncMsg(null), 2000);
    } catch {
      setSyncMsg('复制失败');
    }
  };

  useEffect(() => {
    fetchRecords();
  }, []);

  const decisions = intelResult?.decisions || [];
  const risks = intelResult?.risks || [];

  return (
    <div className="flex min-h-[calc(100vh-144px)] flex-col space-y-5 lg:h-[calc(100vh-144px)]">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-[var(--oc-text-primary)]">会议助手</h1>
          <p className="mt-1 text-sm text-[var(--oc-text-secondary)]">录音、转写、纪要、待办一站式管理</p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            className="border-[var(--oc-border-subtle)] bg-[var(--oc-bg-elevated)] text-[var(--oc-text-primary)] hover:border-[var(--oc-border-strong)] hover:bg-[var(--oc-bg-hover)]"
          >
            <Upload className="h-4 w-4" />
            上传录音
          </Button>
          <Button className="bg-[var(--oc-accent)] text-[var(--oc-bg-root)] hover:bg-[var(--oc-accent-hover)]">
            <Mic className="h-4 w-4" />
            开始新会议
          </Button>
        </div>
      </div>

      <div className="grid min-h-0 flex-1 gap-5 lg:grid-cols-[320px_1fr]">
        {/* 录音列表 */}
        <Card className="flex min-h-0 flex-col overflow-hidden rounded-[14px] border-[var(--oc-border-subtle)] bg-[var(--oc-bg-surface)]">
          <div className="flex items-center justify-between border-b border-[var(--oc-border-subtle)] px-4 py-3.5">
            <span className="text-[13px] font-bold text-[var(--oc-text-primary)]">最近录音</span>
            <Button
              variant="ghost"
              size="icon"
              onClick={fetchRecords}
              disabled={loading}
              className="h-7 w-7 text-[var(--oc-text-secondary)] hover:bg-[var(--oc-bg-hover)] hover:text-[var(--oc-text-primary)]"
            >
              <RefreshCw className={cn("h-3.5 w-3.5", loading && "animate-spin")} />
            </Button>
          </div>
          <ScrollArea className="flex-1">
            {records.length === 0 ? (
              <div className="p-6 text-center text-sm text-[var(--oc-text-secondary)]">
                暂无会议录音
              </div>
            ) : (
              <div className="divide-y divide-[var(--oc-border-subtle)]">
                {records.map(record => {
                  const active = selectedRecord?.meetingId === record.meetingId;
                  return (
                    <button
                      key={record.meetingId}
                      type="button"
                      onClick={() => setSelectedId(record.meetingId)}
                      className={cn(
                        "w-full px-4 py-3.5 text-left transition-colors",
                        active ? "bg-[var(--oc-bg-active)]" : "hover:bg-[var(--oc-bg-elevated)]"
                      )}
                    >
                      <div className="text-[13px] font-semibold text-[var(--oc-text-primary)]">{record.title}</div>
                      <div className="mt-1 flex flex-wrap items-center gap-2.5 text-[11px] text-[var(--oc-text-secondary)]">
                        <span>{record.startTime}</span>
                        <span>{record.duration}</span>
                        <RecordingStatusBadge status={record.status} />
                      </div>
                    </button>
                  );
                })}
              </div>
            )}
          </ScrollArea>
        </Card>

        {/* 会议详情 */}
        {selectedRecord ? (
          <Card className="flex min-h-0 flex-col overflow-hidden rounded-[14px] border-[var(--oc-border-subtle)] bg-[var(--oc-bg-surface)]">
            <div className="flex flex-col gap-4 border-b border-[var(--oc-border-subtle)] px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
              <div className="min-w-0">
                <div className="truncate text-[15px] font-bold text-[var(--oc-text-primary)]">{selectedRecord.title}</div>
                <div className="mt-1 flex flex-wrap items-center gap-3 text-xs text-[var(--oc-text-secondary)]">
                  <span className="flex items-center gap-1">
                    <Clock className="h-3 w-3" />
                    {selectedRecord.startTime}
                  </span>
                  <span>{selectedRecord.duration}</span>
                  <span>{selectedRecord.recorder}</span>
                  <RecordingStatusBadge status={selectedRecord.status} />
                  {selectedRecord.transcript && (
                    <span className="font-mono text-[10px]">{selectedRecord.transcript.length.toLocaleString()} 字</span>
                  )}
                </div>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                {selectedRecord.status === 'completed' ? (
                  <>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => syncToDaily(selectedRecord)}
                      disabled={syncing}
                      className="border-[var(--oc-border-subtle)] bg-[var(--oc-bg-elevated)] text-[var(--oc-text-primary)] hover:border-[var(--oc-border-strong)] hover:bg-[var(--oc-bg-hover)]"
                    >
                      {syncing ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <ArrowRightLeft className="h-3.5 w-3.5" />}
                      同步待办到日报
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => {
                        if (window.confirm('将重新从会议平台下载最新音频、重新转写并生成纪要，耗时较长且会覆盖当前纪要，确定继续吗？')) {
                          processRecording(selectedRecord, { transcribe: true, forceRefresh: true });
                        }
                      }}
                      disabled={transcribing === selectedRecord.meetingId}
                      className="border-[var(--oc-border-subtle)] bg-[var(--oc-bg-elevated)] text-[var(--oc-text-primary)] hover:border-[var(--oc-border-strong)] hover:bg-[var(--oc-bg-hover)]"
                    >
                      {transcribing === selectedRecord.meetingId ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
                      重新拉取并生成
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => processRecording(selectedRecord, { regenerate: true })}
                      disabled={transcribing === selectedRecord.meetingId}
                      className="border-[var(--oc-border-subtle)] bg-[var(--oc-bg-elevated)] text-[var(--oc-text-primary)] hover:border-[var(--oc-border-strong)] hover:bg-[var(--oc-bg-hover)]"
                    >
                      <Sparkles className="h-3.5 w-3.5" />
                      重新生成纪要
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => copyAll(selectedRecord)}
                      className="text-[var(--oc-text-secondary)] hover:bg-[var(--oc-bg-hover)] hover:text-[var(--oc-text-primary)]"
                    >
                      <FileText className="h-3.5 w-3.5" />
                      复制全部
                    </Button>
                    <Button
                      size="sm"
                      onClick={() => processRecording(selectedRecord, { audioDirectUrl: selectedRecord.audioUrl })}
                      disabled={transcribing === selectedRecord.meetingId}
                      className="bg-[var(--oc-accent)] text-[var(--oc-bg-root)] hover:bg-[var(--oc-accent-hover)]"
                    >
                      <Download className="h-3.5 w-3.5" />
                      下载音频
                    </Button>
                  </>
                ) : (
                  <>
                    <Button
                      size="sm"
                      onClick={() => processRecording(selectedRecord, { transcribe: true })}
                      disabled={transcribing === selectedRecord.meetingId}
                      className="bg-[var(--oc-accent)] text-[var(--oc-bg-root)] hover:bg-[var(--oc-accent-hover)]"
                    >
                      {transcribing === selectedRecord.meetingId ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Sparkles className="h-3.5 w-3.5" />}
                      开始转录
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => processRecording(selectedRecord, { audioDirectUrl: selectedRecord.audioUrl })}
                      disabled={transcribing === selectedRecord.meetingId}
                      className="border-[var(--oc-border-subtle)] bg-[var(--oc-bg-elevated)] text-[var(--oc-text-primary)] hover:border-[var(--oc-border-strong)] hover:bg-[var(--oc-bg-hover)]"
                    >
                      <Download className="h-3.5 w-3.5" />
                      下载音频
                    </Button>
                  </>
                )}
              </div>
            </div>

            {syncMsg && (
              <div className={`mx-5 mt-3 flex items-center gap-2 rounded-[10px] border px-3 py-2 text-xs ${syncMsg.includes("失败") ? "border-[rgba(201,123,109,0.25)] bg-[var(--oc-error-soft)] text-[var(--oc-error)]" : "border-[var(--oc-success)]/25 bg-[var(--oc-success-soft)] text-[var(--oc-success)]"}`}>
                {syncMsg.includes("失败") ? <AlertTriangle className="h-3.5 w-3.5" /> : <CheckCircle className="h-3.5 w-3.5" />}
                {syncMsg}
              </div>
            )}
            {processMsg && (
              <div className="mx-5 mt-3 flex items-center gap-2 rounded-[10px] border border-[var(--oc-info)]/25 bg-[var(--oc-info-soft)] px-3 py-2 text-xs text-[var(--oc-info)]">
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                {processMsg}
              </div>
            )}

            <Tabs defaultValue="summary" className="flex min-h-0 flex-1 flex-col">
              <TabsList className="h-auto w-full justify-start gap-0 rounded-none border-b border-[var(--oc-border-subtle)] bg-transparent p-0">
                {[
                  { value: "summary", label: "摘要" },
                  { value: "todos", label: "待办" },
                  { value: "transcript", label: "原文" },
                  { value: "analysis", label: "深度分析" },
                ].map(tab => (
                  <TabsTrigger
                    key={tab.value}
                    value={tab.value}
                    className="rounded-none border-b-2 border-transparent px-4 py-2.5 text-sm font-medium text-[var(--oc-text-secondary)] transition-colors hover:text-[var(--oc-text-primary)] data-[state=active]:border-[var(--oc-accent)] data-[state=active]:bg-transparent data-[state=active]:text-[var(--oc-accent)] data-[state=active]:shadow-none"
                  >
                    {tab.label}
                  </TabsTrigger>
                ))}
              </TabsList>

              <ScrollArea className="min-h-0 flex-1 px-5 py-4">
                <TabsContent value="summary" className="mt-0 space-y-4 pb-5">
                  <Card className="rounded-[14px] border-[var(--oc-border-subtle)] bg-[var(--oc-bg-elevated)]">
                    <CardHeader className="pb-3">
                      <CardTitle className="flex items-center gap-2 text-[13px] font-bold text-[var(--oc-text-primary)]">
                        <FileText className="h-4 w-4 text-[var(--oc-accent)]" />
                        会议纪要
                      </CardTitle>
                    </CardHeader>
                    <CardContent>
                      <p className="whitespace-pre-line text-[13px] leading-[1.8] text-[var(--oc-text-secondary)]">
                        {selectedRecord.summary || '暂无总结'}
                      </p>
                    </CardContent>
                  </Card>

                  <div className="grid gap-4 lg:grid-cols-2">
                    <Card className="rounded-[14px] border-[var(--oc-border-subtle)] bg-[var(--oc-bg-elevated)]">
                      <CardHeader className="pb-3">
                        <CardTitle className="flex items-center gap-2 text-[13px] font-bold text-[var(--oc-text-primary)]">
                          <CheckSquare className="h-4 w-4 text-[var(--oc-success)]" />
                          关键决策
                        </CardTitle>
                      </CardHeader>
                      <CardContent>
                        {decisions.length > 0 ? (
                          <ul className="list-disc space-y-1.5 pl-4 text-[13px] leading-[1.8] text-[var(--oc-text-secondary)]">
                            {decisions.map((d, i) => (
                              <li key={i}>{d.content}{d.owner ? <span className="ml-1 text-[var(--oc-text-tertiary)]">（{d.owner}）</span> : null}</li>
                            ))}
                          </ul>
                        ) : (
                          <p className="text-sm text-[var(--oc-text-secondary)]">暂无关键决策，可在「深度分析」标签页生成。</p>
                        )}
                      </CardContent>
                    </Card>

                    <Card className="rounded-[14px] border-[var(--oc-border-subtle)] bg-[var(--oc-bg-elevated)]">
                      <CardHeader className="pb-3">
                        <CardTitle className="flex items-center gap-2 text-[13px] font-bold text-[var(--oc-text-primary)]">
                          <AlertTriangle className="h-4 w-4 text-[var(--oc-warning)]" />
                          风险提示
                        </CardTitle>
                      </CardHeader>
                      <CardContent>
                        {risks.length > 0 ? (
                          <div className="space-y-2">
                            {risks.map((r, i) => (
                              <div key={i} className="text-[13px] leading-[1.7] text-[var(--oc-warning)]">
                                {r.description}
                                {r.mitigation && <p className="mt-1 text-[11px] text-[var(--oc-text-secondary)]">应对：{r.mitigation}</p>}
                              </div>
                            ))}
                          </div>
                        ) : (
                          <p className="text-sm text-[var(--oc-text-secondary)]">暂无风险提示，可在「深度分析」标签页生成。</p>
                        )}
                      </CardContent>
                    </Card>
                  </div>
                </TabsContent>

                <TabsContent value="todos" className="mt-0 pb-5">
                  <Card className="rounded-[14px] border-[var(--oc-border-subtle)] bg-[var(--oc-bg-elevated)]">
                    <CardHeader className="pb-3">
                      <CardTitle className="flex items-center gap-2 text-[13px] font-bold text-[var(--oc-text-primary)]">
                        <ListChecks className="h-4 w-4 text-[var(--oc-accent)]" />
                        会议待办
                        {selectedRecord.todos?.length ? (
                          <span className="ml-2 rounded-full border border-[var(--oc-success)]/25 bg-[var(--oc-success-soft)] px-2 py-0.5 text-[10px] text-[var(--oc-success)]">
                            {selectedRecord.todos.length} 项
                          </span>
                        ) : null}
                      </CardTitle>
                    </CardHeader>
                    <CardContent>
                      {selectedRecord.todos?.length ? (
                        <div className="space-y-2">
                          {selectedRecord.todos.map((todo, i) => {
                            const match = typeof todo === 'string' ? todo.match(/^(.+?)(?:（(.+)）)?$/) : null;
                            const task = match ? match[1].trim() : String(todo);
                            const meta = match?.[2] || '';
                            const owner = meta.match(/负责人[:：]([^，,]+)/)?.[1]?.trim();
                            const due = meta.match(/截止[:：]([^，,]+)/)?.[1]?.trim();
                            const priority = meta.match(/优先级[:：]([^，,]+)/)?.[1]?.trim();

                            return (
                              <div key={i} className="group flex items-start gap-3 rounded-[10px] border border-transparent p-3 transition-all hover:border-[var(--oc-border-subtle)] hover:bg-[var(--oc-bg-hover)]">
                                <input type="checkbox" className="mt-0.5 h-4 w-4 shrink-0 rounded border-2 border-[var(--oc-border-strong)] bg-[var(--oc-bg-elevated)] accent-[var(--oc-accent)]" />
                                <div className="flex-1 min-w-0">
                                  <div className="text-[13px] leading-relaxed text-[var(--oc-text-primary)]">{task}</div>
                                  {(owner || due || priority) && (
                                    <div className="mt-2 flex flex-wrap gap-1.5">
                                      {priority && (
                                        <span className={`inline-flex items-center rounded px-1.5 py-0.5 text-[10px] font-medium ${priority === 'high' ? 'bg-[var(--oc-error-soft)] text-[var(--oc-error)]' : priority === 'medium' ? 'bg-[var(--oc-warning-soft)] text-[var(--oc-warning)]' : 'bg-[var(--oc-success-soft)] text-[var(--oc-success)]'}`}>
                                          {priority === 'high' ? '紧急' : priority === 'medium' ? '中等' : '一般'}
                                        </span>
                                      )}
                                      {owner && (
                                        <span className="inline-flex items-center rounded bg-[var(--oc-info-soft)] px-1.5 py-0.5 text-[10px] text-[var(--oc-info)]">
                                          {owner}
                                        </span>
                                      )}
                                      {due && (
                                        <span className="inline-flex items-center rounded bg-[var(--oc-bg-hover)] px-1.5 py-0.5 text-[10px] text-[var(--oc-text-secondary)]">
                                          {due}
                                        </span>
                                      )}
                                    </div>
                                  )}
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      ) : (
                        <div className="py-8 text-center text-sm text-[var(--oc-text-secondary)]">暂无待办事项</div>
                      )}
                    </CardContent>
                  </Card>
                </TabsContent>

                <TabsContent value="transcript" className="mt-0 pb-5">
                  <Card className="rounded-[14px] border-[var(--oc-border-subtle)] bg-[var(--oc-bg-elevated)]">
                    <CardHeader className="pb-3">
                      <CardTitle className="flex items-center gap-2 text-[13px] font-bold text-[var(--oc-text-primary)]">
                        <FileAudio className="h-4 w-4 text-[var(--oc-info)]" />
                        会议内容转录
                      </CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div className="rounded-[10px] border border-[var(--oc-border-subtle)] bg-[var(--oc-bg-root)] p-4">
                        <div className="whitespace-pre-wrap text-[13px] leading-[1.8] text-[var(--oc-text-primary)]">
                          {selectedRecord.transcript || '暂无转录内容'}
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                </TabsContent>

                <TabsContent value="analysis" className="mt-0 pb-5">
                  <MeetingIntelligence
                    transcript={selectedRecord.transcript}
                    title={selectedRecord.title}
                    startTime={selectedRecord.startTime}
                    meetingId={selectedRecord.meetingId}
                    record={selectedRecord}
                    onResultChange={handleIntelligenceResult}
                  />
                </TabsContent>
              </ScrollArea>
            </Tabs>
          </Card>
        ) : (
          <Card className="flex flex-col items-center justify-center rounded-[14px] border-[var(--oc-border-subtle)] bg-[var(--oc-bg-surface)] p-8 text-center">
            <Video className="h-10 w-10 text-[var(--oc-text-tertiary)]" />
            <h3 className="mt-4 text-[15px] font-bold text-[var(--oc-text-primary)]">选择一条会议录音</h3>
            <p className="mt-1 text-sm text-[var(--oc-text-secondary)]">在左侧列表中选择会议，查看纪要、待办与深度分析。</p>
          </Card>
        )}
      </div>
    </div>
  );
}
