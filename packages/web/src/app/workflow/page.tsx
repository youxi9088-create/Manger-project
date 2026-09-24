"use client";

import { useEffect, useState, useRef } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import {
  Inbox,
  RefreshCw,
  Clock,
  FolderOpen,
  Trash2,
  Play,
  Loader2,
  ChevronDown,
  ChevronRight,
  AlertCircle,
  CheckCircle2,
  History,
  Building2,
  Rocket,
  BookOpen,
} from "lucide-react";
import { cn } from "@/lib/utils";

const API_BASE = process.env.NEXT_PUBLIC_SERVER_API
  || (process.env.NODE_ENV === "production" ? "/a/openclaw" : "http://localhost:3001");

/* ───────────── Types ───────────── */
interface WorkflowOutput {
  id: number;
  source: string;
  type: string;
  title: string | null;
  content: string;
  metadata: string;
  created_at: string;
}

interface ProjectInfoFile {
  id: number;
  proid: string;
  title: string | null;
  content: string;
  raw_content: string | null;
  ask: string | null;
  workflow_run_id: string | null;
  metadata: string;
  created_at: string;
  updated_at: string;
}

interface RunResult {
  answer: string;
  title: string;
  proid: string;
  workflow_run_id?: string;
  task_id?: string;
  analyzed_by_llm?: boolean;
  llm_error?: string;
  raw?: unknown;
}

/* ───────────── Helpers ───────────── */
function formatDate(iso: string) {
  const d = new Date(iso);
  return `${d.getMonth() + 1}月${d.getDate()}日 ${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

const WORKFLOW_TYPES = [
  { key: "risk", label: "风险分析" },
  { key: "progress", label: "进度诊断" },
  { key: "task", label: "任务拆解" },
  { key: "meeting", label: "会议纪要" },
];

/* ───────────── Markdown 渲染组件 ───────────── */
function MarkdownContent({ content }: { content: string }) {
  return (
    <div
      className="prose prose-sm dark:prose-invert max-w-none text-[13px] leading-[1.7]
        [&_h1]:text-lg [&_h1]:font-bold [&_h1]:mt-4 [&_h1]:mb-2 [&_h1]:text-[var(--oc-text-primary)]
        [&_h2]:text-base [&_h2]:font-semibold [&_h2]:mt-3 [&_h2]:mb-1.5 [&_h2]:text-[var(--oc-text-primary)]
        [&_h3]:text-sm [&_h3]:font-medium [&_h3]:mt-2 [&_h3]:mb-1 [&_h3]:text-[var(--oc-text-primary)]
        [&_ul]:pl-4 [&_ul]:space-y-1
        [&_ol]:pl-4 [&_ol]:space-y-1
        [&_li]:leading-[1.7] [&_li]:text-[var(--oc-text-secondary)]
        [&_p]:leading-[1.7] [&_p]:mb-2 [&_p]:text-[var(--oc-text-secondary)]
        [&_code]:bg-[var(--oc-bg-hover)] [&_code]:px-1.5 [&_code]:py-0.5 [&_code]:rounded [&_code]:text-xs [&_code]:font-mono [&_code]:text-[var(--oc-accent)]
        [&_pre]:bg-[var(--oc-bg-hover)] [&_pre]:p-3 [&_pre]:rounded-lg [&_pre]:overflow-x-auto [&_pre]:text-xs
        [&_pre_code]:bg-transparent [&_pre_code]:p-0 [&_pre_code]:text-[var(--oc-text-secondary)]
        [&_blockquote]:border-l-2 [&_blockquote]:border-[var(--oc-accent)]/40 [&_blockquote]:pl-3 [&_blockquote]:text-[var(--oc-text-secondary)] [&_blockquote]:italic
        [&_table]:w-full [&_table]:border-collapse [&_table]:text-sm
        [&_th]:border [&_th]:border-[var(--oc-border-subtle)] [&_th]:bg-[var(--oc-bg-hover)] [&_th]:px-3 [&_th]:py-1.5 [&_th]:text-left [&_th]:font-medium [&_th]:text-[var(--oc-text-primary)]
        [&_td]:border [&_td]:border-[var(--oc-border-subtle)] [&_td]:px-3 [&_td]:py-1.5 [&_td]:text-[var(--oc-text-secondary)]
        [&_hr]:border-[var(--oc-border-subtle)] [&_hr]:my-3
        [&_strong]:font-semibold [&_strong]:text-[var(--oc-text-primary)]
        [&_em]:italic
      "
    >
      <ReactMarkdown remarkPlugins={[remarkGfm]}>{content}</ReactMarkdown>
    </div>
  );
}

/* ───────────── 触发面板 ───────────── */
function RunPanel({ onSuccess }: { onSuccess: (r: RunResult) => void }) {
  const [proid, setProid] = useState("");
  const [ask, setAsk] = useState("");
  const [typeKey, setTypeKey] = useState("risk");
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const proidRef = useRef<HTMLInputElement>(null);

  const handleRun = async () => {
    if (!proid.trim()) {
      setError("请输入 proid");
      proidRef.current?.focus();
      return;
    }
    if (!ask.trim()) {
      setError("请输入 ask");
      return;
    }
    setError(null);
    setRunning(true);
    try {
      const resp = await fetch(`${API_BASE}/api/workflow/run`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          proid: proid.trim(),
          extra_inputs: { ask: ask.trim(), analysis_type: typeKey },
          async: true,
        }),
      });
      const json = await resp.json();
      if (json.success && json.accepted && json.jobId) {
        for (let attempt = 0; attempt < 200; attempt += 1) {
          await new Promise(resolve => setTimeout(resolve, 3000));
          const jobResp = await fetch(`${API_BASE}/api/workflow/jobs/${encodeURIComponent(json.jobId)}`);
          const jobJson = await jobResp.json().catch(() => ({}));
          if (!jobResp.ok || !jobJson.success) throw new Error(jobJson.error || "读取工作流状态失败");
          if (jobJson.job?.status === "failed") throw new Error(jobJson.job.error || "工作流执行失败");
          if (jobJson.job?.status === "completed" && jobJson.job.result) {
            onSuccess(jobJson.job.result as RunResult);
            return;
          }
        }
        throw new Error("工作流执行时间较长，请稍后在历史记录中查看结果");
      } else if (json.success) {
        onSuccess(json.data as RunResult);
      } else {
        setError(json.error || "工作流执行失败");
      }
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "网络错误");
    } finally {
      setRunning(false);
    }
  };

  return (
    <Card className="h-fit rounded-[14px] border-[var(--oc-border-subtle)] bg-[var(--oc-bg-surface)] p-[18px]">
      <div className="space-y-4">
        {/* proid */}
        <div className="space-y-2">
          <Label htmlFor="proid-input" className="block text-xs font-semibold text-[var(--oc-text-secondary)]">
            项目 ID
          </Label>
          <Input
            id="proid-input"
            ref={proidRef}
            value={proid}
            onChange={(e) => setProid(e.target.value)}
            placeholder="输入项目 ID，例如：PRJ-001"
            disabled={running}
            className="h-10 rounded-[10px] border-[var(--oc-border-subtle)] bg-[var(--oc-bg-elevated)] px-3 text-sm text-[var(--oc-text-primary)] placeholder:text-[var(--oc-text-tertiary)] focus:border-[var(--oc-accent)] focus:ring-[var(--oc-accent-soft)] focus:ring-[3px]"
          />
        </div>

        {/* ask */}
        <div className="space-y-2">
          <Label htmlFor="ask-input" className="block text-xs font-semibold text-[var(--oc-text-secondary)]">
            询问内容
          </Label>
          <Textarea
            id="ask-input"
            value={ask}
            onChange={(e) => setAsk(e.target.value)}
            placeholder="例如：分析当前项目风险并给出下周行动建议…"
            disabled={running}
            rows={6}
            className="resize-none rounded-[10px] border-[var(--oc-border-subtle)] bg-[var(--oc-bg-elevated)] px-3 py-2.5 text-sm text-[var(--oc-text-primary)] placeholder:text-[var(--oc-text-tertiary)] focus:border-[var(--oc-accent)] focus:ring-[var(--oc-accent-soft)] focus:ring-[3px]"
          />
        </div>

        {/* 工作流类型 */}
        <div className="space-y-2">
          <span className="block text-xs font-semibold text-[var(--oc-text-secondary)]">工作流类型</span>
          <div className="flex flex-wrap gap-2">
            {WORKFLOW_TYPES.map((t) => (
              <button
                key={t.key}
                type="button"
                onClick={() => setTypeKey(t.key)}
                className={cn(
                  "rounded-full border px-2.5 py-1 text-xs font-medium transition-all",
                  typeKey === t.key
                    ? "border-[rgba(201,168,108,0.25)] bg-[var(--oc-accent-soft)] text-[var(--oc-accent)]"
                    : "border-[var(--oc-border-subtle)] bg-[var(--oc-bg-elevated)] text-[var(--oc-text-secondary)] hover:border-[var(--oc-border-strong)] hover:text-[var(--oc-text-primary)]"
                )}
              >
                {t.label}
              </button>
            ))}
          </div>
        </div>

        {/* 执行按钮 */}
        <Button
          onClick={handleRun}
          disabled={running || !proid.trim() || !ask.trim()}
          className="h-10 w-full gap-1.5 rounded-[10px] bg-[var(--oc-accent)] px-4 text-sm font-semibold text-[var(--oc-bg-root)] shadow-[0_1px_0_rgba(255,255,255,0.12)_inset,0_1px_2px_rgba(0,0,0,0.24)] transition-all hover:-translate-y-px hover:bg-[var(--oc-accent-hover)] hover:shadow-[0_2px_0_rgba(255,255,255,0.12)_inset,0_4px_16px_rgba(0,0,0,0.32)] active:translate-y-0 disabled:opacity-50"
        >
          {running ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Play className="h-4 w-4" />
          )}
          {running ? "运行中…" : "运行工作流"}
        </Button>

        {error && (
          <div className="flex items-start gap-2 rounded-[10px] border border-[rgba(201,123,109,0.25)] bg-[var(--oc-error-soft)] px-3 py-2.5 text-[13px] text-[var(--oc-error)]">
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        <p className="text-xs text-[var(--oc-text-tertiary)]">
          执行后结果会经大模型分析后展示，并自动保存到历史记录与项目信息。
        </p>
      </div>
    </Card>
  );
}

/* ───────────── 结果展示面板 ───────────── */
function ResultPanel({
  result,
  onClear,
}: {
  result: RunResult;
  onClear: () => void;
}) {
  const [showRaw, setShowRaw] = useState(false);

  return (
    <Card className="absolute inset-0 flex h-full flex-col overflow-hidden rounded-[14px] border-[var(--oc-border-subtle)] bg-[var(--oc-bg-surface)]">
      <CardHeader className="flex flex-row items-center justify-between border-b border-[var(--oc-border-subtle)] px-5 py-4">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <CardTitle className="truncate text-[15px] font-bold text-[var(--oc-text-primary)]">
              {result.title}
            </CardTitle>
            {result.analyzed_by_llm && (
              <Badge
                variant="outline"
                className="shrink-0 rounded-full border-[rgba(106,158,127,0.25)] bg-[var(--oc-success-soft)] text-[11px] font-semibold text-[var(--oc-success)]"
              >
                LLM 分析
              </Badge>
            )}
            {result.llm_error && (
              <Badge
                variant="outline"
                className="shrink-0 rounded-full border-[rgba(201,163,92,0.25)] bg-[var(--oc-warning-soft)] text-[11px] font-semibold text-[var(--oc-warning)]"
              >
                原始输出
              </Badge>
            )}
          </div>
          <div className="mt-1 flex items-center gap-2 text-xs text-[var(--oc-text-secondary)]">
            <span>{result.proid}</span>
            {result.workflow_run_id && (
              <>
                <span className="text-[var(--oc-border-strong)]">·</span>
                <span className="font-mono">{result.workflow_run_id.slice(0, 8)}…</span>
              </>
            )}
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setShowRaw(!showRaw)}
            className="h-8 gap-1.5 rounded-lg border border-transparent bg-transparent px-3 text-xs font-semibold text-[var(--oc-text-secondary)] hover:border-[var(--oc-border-subtle)] hover:bg-[var(--oc-bg-hover)] hover:text-[var(--oc-text-primary)]"
          >
            {showRaw ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
            原始响应
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={onClear}
            className="h-8 rounded-lg border border-transparent bg-transparent px-3 text-xs font-semibold text-[var(--oc-text-secondary)] hover:border-[var(--oc-border-subtle)] hover:bg-[var(--oc-bg-hover)] hover:text-[var(--oc-text-primary)]"
          >
            关闭
          </Button>
        </div>
      </CardHeader>

      <CardContent className="flex-1 min-h-0 overflow-hidden p-0">
        <ScrollArea className="h-full">
          <div className="space-y-3 p-5">
            <div className="rounded-[10px] border border-[var(--oc-border-subtle)] bg-[var(--oc-bg-elevated)] p-4">
              <MarkdownContent content={result.answer} />
            </div>

            {result.llm_error && (
              <div className="rounded-[10px] border border-[rgba(201,163,92,0.25)] bg-[var(--oc-warning-soft)] px-3 py-2 text-xs text-[var(--oc-warning)]">
                LLM 分析未生效：{result.llm_error}，已展示原始工作流输出。
              </div>
            )}

            {showRaw && (
              <pre className="whitespace-pre-wrap break-all rounded-[10px] border border-[var(--oc-border-subtle)] bg-[var(--oc-bg-root)] p-3 text-xs text-[var(--oc-text-secondary)]">
                {JSON.stringify(result.raw, null, 2)}
              </pre>
            )}
          </div>
        </ScrollArea>
      </CardContent>
    </Card>
  );
}

/* ───────────── 历史记录卡片 ───────────── */
function HistoryCard({
  output: o,
  onDelete,
}: {
  output: WorkflowOutput;
  onDelete: (id: number) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const isMarkdown = o.type === "markdown" || o.source === "ai-hub-workflow";
  let meta: Record<string, any> = {};
  try {
    meta = JSON.parse(o.metadata || "{}");
  } catch {}

  return (
    <div className="rounded-[10px] border border-[var(--oc-border-subtle)] bg-[var(--oc-bg-surface)] transition-all hover:border-[var(--oc-border-strong)]">
      <div
        role="button"
        tabIndex={0}
        aria-expanded={expanded}
        onClick={() => setExpanded(!expanded)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            setExpanded(!expanded);
          }
        }}
        className="flex w-full cursor-pointer items-center justify-between gap-3 px-4 py-3 text-left"
      >
        <div className="flex min-w-0 flex-1 items-center gap-3">
          {expanded ? (
            <ChevronDown className="h-3.5 w-3.5 shrink-0 text-[var(--oc-text-tertiary)]" />
          ) : (
            <ChevronRight className="h-3.5 w-3.5 shrink-0 text-[var(--oc-text-tertiary)]" />
          )}
          <div className="min-w-0 flex-1">
            <div className="truncate text-sm font-semibold text-[var(--oc-text-primary)]">
              {o.title || "无标题"}
            </div>
            <div className="mt-0.5 flex items-center gap-2 text-xs text-[var(--oc-text-secondary)]">
              {meta.proid && <span className="font-mono">{meta.proid}</span>}
              <span
                className={cn(
                  "rounded-full px-2 py-0.5 text-[11px] font-semibold",
                  o.type === "markdown"
                    ? "bg-[var(--oc-accent-soft)] text-[var(--oc-accent)]"
                    : "border border-[var(--oc-border-subtle)] bg-[var(--oc-bg-elevated)] text-[var(--oc-text-secondary)]"
                )}
              >
                {o.type}
              </span>
            </div>
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <span className="flex items-center gap-1 text-xs text-[var(--oc-text-tertiary)]">
            <Clock className="h-3 w-3" />
            {formatDate(o.created_at)}
          </span>
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7 rounded-lg border border-transparent text-[var(--oc-text-secondary)] hover:border-[var(--oc-border-subtle)] hover:bg-[var(--oc-bg-hover)] hover:text-[var(--oc-error)]"
            onClick={(e) => {
              e.stopPropagation();
              onDelete(o.id);
            }}
          >
            <Trash2 className="h-3.5 w-3.5" />
          </Button>
        </div>
      </div>

      {expanded && (
        <div className="border-t border-[var(--oc-border-subtle)] px-4 pb-4 pt-3">
          <div className="rounded-[10px] border border-[var(--oc-border-subtle)] bg-[var(--oc-bg-elevated)] p-4">
            {isMarkdown ? (
              <MarkdownContent content={o.content} />
            ) : (
              <div className="max-h-80 overflow-auto whitespace-pre-wrap text-sm leading-relaxed text-[var(--oc-text-secondary)]">
                {o.content}
              </div>
            )}
          </div>
          {meta.ask && (
            <div className="mt-2 text-xs text-[var(--oc-text-tertiary)]">
              查询：{meta.ask}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

/* ───────────── 项目信息 Tab ───────────── */
function ProjectInfoPanel({
  files,
  selectedProid,
  onSelect,
  onRefresh,
  onDelete,
}: {
  files: ProjectInfoFile[];
  selectedProid: string | null;
  onSelect: (proid: string) => void;
  onRefresh: () => void;
  onDelete: (proid: string) => void;
}) {
  const selected = files.find((f) => f.proid === selectedProid) || files[0];

  return (
    <div className="absolute inset-0 grid min-h-0 gap-4 md:grid-cols-[280px_1fr]">
      {/* 项目列表 */}
      <Card className="flex h-full min-h-0 flex-col overflow-hidden rounded-[14px] border-[var(--oc-border-subtle)] bg-[var(--oc-bg-surface)]">
        <CardHeader className="flex flex-row items-center justify-between border-b border-[var(--oc-border-subtle)] px-4 py-3.5">
          <CardTitle className="text-[13px] font-bold text-[var(--oc-text-primary)]">项目列表</CardTitle>
          <Button
            variant="ghost"
            size="icon"
            onClick={onRefresh}
            className="h-7 w-7 rounded-lg border border-transparent text-[var(--oc-text-secondary)] hover:border-[var(--oc-border-subtle)] hover:bg-[var(--oc-bg-hover)] hover:text-[var(--oc-text-primary)]"
          >
            <RefreshCw className="h-3.5 w-3.5" />
          </Button>
        </CardHeader>
        <CardContent className="flex-1 min-h-0 overflow-hidden p-0">
          <ScrollArea className="h-full">
            {files.length === 0 ? (
              <p className="py-8 text-center text-sm text-[var(--oc-text-secondary)]">暂无项目信息</p>
            ) : (
              <div className="p-2">
                {files.map((f) => (
                  <button
                    key={f.proid}
                    className={cn(
                      "w-full rounded-lg p-2.5 text-left transition-all",
                      selected?.proid === f.proid
                        ? "border border-[var(--oc-border-strong)] bg-[var(--oc-bg-active)]"
                        : "border border-transparent hover:border-[var(--oc-border-subtle)] hover:bg-[var(--oc-bg-elevated)]"
                    )}
                    onClick={() => onSelect(f.proid)}
                  >
                    <div className="flex items-center gap-1.5 truncate text-sm font-semibold text-[var(--oc-text-primary)]">
                      <Building2 className="h-3.5 w-3.5 shrink-0 text-[var(--oc-text-secondary)]" />
                      {f.proid}
                    </div>
                    <div className="mt-0.5 text-xs text-[var(--oc-text-secondary)]">
                      更新于 {formatDate(f.updated_at)}
                    </div>
                  </button>
                ))}
              </div>
            )}
          </ScrollArea>
        </CardContent>
      </Card>

      {/* 项目信息内容 */}
      <Card className="flex h-full min-h-0 flex-col overflow-hidden rounded-[14px] border-[var(--oc-border-subtle)] bg-[var(--oc-bg-surface)]">
        <CardHeader className="flex flex-row items-center justify-between border-b border-[var(--oc-border-subtle)] px-5 py-4">
          <CardTitle className="text-[15px] font-bold text-[var(--oc-text-primary)]">
            {selected ? `项目信息：${selected.proid}` : "选择项目查看信息"}
          </CardTitle>
          {selected && (
            <Button
              variant="ghost"
              size="icon"
              onClick={() => onDelete(selected.proid)}
              className="h-7 w-7 rounded-lg border border-transparent text-[var(--oc-text-secondary)] hover:border-[var(--oc-border-subtle)] hover:bg-[var(--oc-bg-hover)] hover:text-[var(--oc-error)]"
            >
              <Trash2 className="h-3.5 w-3.5" />
            </Button>
          )}
        </CardHeader>
        <CardContent className="flex-1 min-h-0 overflow-hidden p-0">
          {selected ? (
            <div className="h-full overflow-y-auto">
              <div className="space-y-4 p-5">
                {selected.ask && (
                  <div className="rounded-[10px] border border-[var(--oc-border-subtle)] bg-[var(--oc-bg-elevated)] px-3 py-2 text-xs text-[var(--oc-text-secondary)]">
                    最近查询：{selected.ask}
                  </div>
                )}
                <MarkdownContent content={selected.content} />
              </div>
            </div>
          ) : (
            <div className="flex h-full flex-col items-center justify-center text-[var(--oc-text-secondary)]">
              <FolderOpen className="mb-3 h-10 w-10 text-[var(--oc-text-tertiary)]" />
              <p className="text-sm">点击左侧项目查看信息</p>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

/* ───────────── 主页面 ───────────── */
export default function WorkflowPage() {
  const [outputs, setOutputs] = useState<WorkflowOutput[]>([]);
  const [projectInfoFiles, setProjectInfoFiles] = useState<ProjectInfoFile[]>([]);
  const [loading, setLoading] = useState(false);
  const [selectedProid, setSelectedProid] = useState<string | null>(null);
  const [latestResult, setLatestResult] = useState<RunResult | null>(null);
  const [activeTab, setActiveTab] = useState("result");

  const loadOutputs = async () => {
    setLoading(true);
    try {
      const resp = await fetch(`${API_BASE}/api/workflow/outputs?limit=50`);
      const json = await resp.json();
      if (json.success) {
        setOutputs(json.data);
        // 页面刷新后 latestResult 会丢失，用最新一条历史记录恢复“分析结果”
        if (json.data.length > 0 && !latestResult) {
          const latest = json.data[0] as WorkflowOutput;
          try {
            const meta = JSON.parse(latest.metadata || '{}');
            setLatestResult({
              answer: latest.content,
              title: latest.title || '工作流结果',
              proid: meta.proid || '',
              workflow_run_id: meta.workflow_run_id,
              analyzed_by_llm: meta.analyzed_by_llm,
              llm_error: meta.llm_error,
              raw: meta,
            });
          } catch {
            console.warn('解析最新历史记录 metadata 失败');
          }
        }
      }
    } catch (e) {
      console.error("加载工作流输出失败:", e);
    } finally {
      setLoading(false);
    }
  };

  const loadProjectInfo = async () => {
    try {
      const resp = await fetch(`${API_BASE}/api/workflow/project-info?limit=50`);
      const json = await resp.json();
      if (json.success) {
        setProjectInfoFiles(json.data);
        if (selectedProid && !json.data.find((f: ProjectInfoFile) => f.proid === selectedProid)) {
          setSelectedProid(null);
        }
      }
    } catch (e) {
      console.error("加载项目信息失败:", e);
    }
  };

  const deleteOutput = async (id: number) => {
    if (!confirm("确定删除这条记录？")) return;
    try {
      await fetch(`${API_BASE}/api/workflow/outputs/${id}`, { method: "DELETE" });
      loadOutputs();
    } catch (e) {
      console.error("删除失败:", e);
    }
  };

  const deleteProjectInfo = async (proid: string) => {
    if (!confirm(`确定删除项目 ${proid} 的信息？`)) return;
    try {
      await fetch(`${API_BASE}/api/workflow/project-info/${encodeURIComponent(proid)}`, {
        method: "DELETE",
      });
      loadProjectInfo();
    } catch (e) {
      console.error("删除项目信息失败:", e);
    }
  };

  const handleRunSuccess = (result: RunResult) => {
    setLatestResult(result);
    setActiveTab("result");
    setTimeout(() => {
      loadOutputs();
      loadProjectInfo();
      if (result.proid) setSelectedProid(result.proid);
    }, 500);
  };

  useEffect(() => {
    loadOutputs();
    loadProjectInfo();
  }, []);

  return (
    <div className="flex h-[calc(100vh-64px)] flex-col p-7">
      {/* Header */}
      <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-[var(--oc-text-primary)]">工作流</h1>
          <p className="mt-1.5 text-[13px] text-[var(--oc-text-secondary)]">
            触发 AIHub 工作流，获取项目综合分析与执行建议
          </p>
        </div>
        <div className="flex items-center gap-2.5">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              loadOutputs();
              loadProjectInfo();
            }}
            disabled={loading}
            className="h-9 gap-1.5 rounded-[10px] border border-[var(--oc-border-subtle)] bg-[var(--oc-bg-elevated)] px-3 text-[13px] font-semibold text-[var(--oc-text-primary)] hover:border-[var(--oc-border-strong)] hover:bg-[var(--oc-bg-hover)]"
          >
            <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
            刷新
          </Button>
          <Button
            variant="ghost"
            size="sm"
            className="h-9 gap-1.5 rounded-[10px] border border-[var(--oc-border-subtle)] bg-[var(--oc-bg-elevated)] px-3 text-[13px] font-semibold text-[var(--oc-text-primary)] hover:border-[var(--oc-border-strong)] hover:bg-[var(--oc-bg-hover)]"
          >
            <BookOpen className="h-4 w-4" />
            工作流文档
          </Button>
        </div>
      </div>

      {/* 主布局 */}
      <div className="grid flex-1 gap-5 overflow-hidden md:grid-cols-[360px_1fr]">
        {/* 触发面板 */}
        <RunPanel onSuccess={handleRunSuccess} />

        {/* 右侧面板 */}
        <Tabs value={activeTab} onValueChange={setActiveTab} className="flex h-full flex-col gap-0">
          <TabsList className="mb-4 h-auto w-fit gap-1 rounded-[10px] border-b border-[var(--oc-border-subtle)] bg-transparent p-0">
            <TabsTrigger
              value="result"
              className="rounded-none border-b-2 border-transparent px-3.5 py-2.5 text-[13px] font-semibold text-[var(--oc-text-secondary)] data-[state=active]:border-[var(--oc-accent)] data-[state=active]:bg-transparent data-[state=active]:text-[var(--oc-accent)] data-[state=active]:shadow-none hover:text-[var(--oc-text-primary)]"
            >
              <CheckCircle2 className="mr-1.5 h-3.5 w-3.5" />
              分析结果
            </TabsTrigger>
            <TabsTrigger
              value="history"
              className="rounded-none border-b-2 border-transparent px-3.5 py-2.5 text-[13px] font-semibold text-[var(--oc-text-secondary)] data-[state=active]:border-[var(--oc-accent)] data-[state=active]:bg-transparent data-[state=active]:text-[var(--oc-accent)] data-[state=active]:shadow-none hover:text-[var(--oc-text-primary)]"
            >
              <History className="mr-1.5 h-3.5 w-3.5" />
              历史记录
              <span className="ml-1.5 rounded-full bg-[var(--oc-bg-elevated)] px-1.5 py-0 text-[10px] text-[var(--oc-text-secondary)]">
                {outputs.length}
              </span>
            </TabsTrigger>
            <TabsTrigger
              value="project"
              className="rounded-none border-b-2 border-transparent px-3.5 py-2.5 text-[13px] font-semibold text-[var(--oc-text-secondary)] data-[state=active]:border-[var(--oc-accent)] data-[state=active]:bg-transparent data-[state=active]:text-[var(--oc-accent)] data-[state=active]:shadow-none hover:text-[var(--oc-text-primary)]"
            >
              <Building2 className="mr-1.5 h-3.5 w-3.5" />
              项目信息
              <span className="ml-1.5 rounded-full bg-[var(--oc-bg-elevated)] px-1.5 py-0 text-[10px] text-[var(--oc-text-secondary)]">
                {projectInfoFiles.length}
              </span>
            </TabsTrigger>
          </TabsList>

          <TabsContent value="result" className="relative mt-0 flex-1 min-h-0 overflow-hidden data-[state=inactive]:hidden">
            {latestResult ? (
              <ResultPanel result={latestResult} onClear={() => setLatestResult(null)} />
            ) : (
              <Card className="absolute inset-0 flex h-full flex-col items-center justify-center rounded-[14px] border-[var(--oc-border-subtle)] bg-[var(--oc-bg-surface)]">
                <Rocket className="mb-3 h-12 w-12 text-[var(--oc-text-tertiary)]" />
                <p className="text-sm font-medium text-[var(--oc-text-secondary)]">暂无分析结果</p>
                <p className="mt-1 text-xs text-[var(--oc-text-tertiary)]">在左侧填写项目 ID 与询问内容后运行工作流</p>
              </Card>
            )}
          </TabsContent>

          <TabsContent value="history" className="relative mt-0 flex-1 min-h-0 overflow-hidden data-[state=inactive]:hidden">
            <Card className="absolute inset-0 flex h-full min-h-0 flex-col overflow-hidden rounded-[14px] border-[var(--oc-border-subtle)] bg-[var(--oc-bg-surface)]">
              <CardHeader className="border-b border-[var(--oc-border-subtle)] px-5 py-4">
                <CardTitle className="text-[15px] font-bold text-[var(--oc-text-primary)]">历史记录</CardTitle>
              </CardHeader>
              <CardContent className="flex-1 min-h-0 overflow-hidden p-0">
                <ScrollArea className="h-full">
                  {outputs.length === 0 ? (
                    <div className="flex h-full flex-col items-center justify-center text-[var(--oc-text-secondary)]">
                      <Inbox className="mb-3 h-12 w-12 text-[var(--oc-text-tertiary)]" />
                      <p className="text-sm">暂无历史记录</p>
                      <p className="mt-1 text-xs text-[var(--oc-text-tertiary)]">触发工作流后结果会自动保存在这里</p>
                    </div>
                  ) : (
                    <div className="space-y-3 p-4">
                      {outputs.map((o) => (
                        <HistoryCard key={o.id} output={o} onDelete={deleteOutput} />
                      ))}
                    </div>
                  )}
                </ScrollArea>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="project" className="relative mt-0 flex-1 min-h-0 overflow-hidden data-[state=inactive]:hidden">
            <ProjectInfoPanel
              files={projectInfoFiles}
              selectedProid={selectedProid}
              onSelect={setSelectedProid}
              onRefresh={loadProjectInfo}
              onDelete={deleteProjectInfo}
            />
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}
