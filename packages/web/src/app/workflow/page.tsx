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
import {
  Inbox,
  RefreshCw,
  FileText,
  Clock,
  FolderOpen,
  Trash2,
  Play,
  Loader2,
  ChevronDown,
  ChevronRight,
  AlertCircle,
  CheckCircle2,
} from "lucide-react";

const API_BASE = process.env.NEXT_PUBLIC_SERVER_API || "http://localhost:3001";

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

interface WorkflowFile {
  filename: string;
  size: number;
  modified: string;
}

interface RunResult {
  answer: string;
  title: string;
  proid: string;
  workflow_run_id?: string;
  task_id?: string;
  raw?: unknown;
}

/* ───────────── Helpers ───────────── */
function formatDate(iso: string) {
  const d = new Date(iso);
  return `${d.getMonth() + 1}月${d.getDate()}日 ${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

/* ───────────── Markdown 渲染组件 ───────────── */
function MarkdownContent({ content }: { content: string }) {
  return (
    <div className="prose prose-sm dark:prose-invert max-w-none text-sm leading-relaxed
      [&_h1]:text-lg [&_h1]:font-bold [&_h1]:mt-4 [&_h1]:mb-2
      [&_h2]:text-base [&_h2]:font-semibold [&_h2]:mt-3 [&_h2]:mb-1.5
      [&_h3]:text-sm [&_h3]:font-medium [&_h3]:mt-2 [&_h3]:mb-1
      [&_ul]:pl-4 [&_ul]:space-y-1
      [&_ol]:pl-4 [&_ol]:space-y-1
      [&_li]:leading-relaxed
      [&_p]:leading-relaxed [&_p]:mb-2
      [&_code]:bg-muted [&_code]:px-1.5 [&_code]:py-0.5 [&_code]:rounded [&_code]:text-xs [&_code]:font-mono
      [&_pre]:bg-muted [&_pre]:p-3 [&_pre]:rounded-lg [&_pre]:overflow-x-auto [&_pre]:text-xs
      [&_pre_code]:bg-transparent [&_pre_code]:p-0
      [&_blockquote]:border-l-2 [&_blockquote]:border-primary/40 [&_blockquote]:pl-3 [&_blockquote]:text-muted-foreground [&_blockquote]:italic
      [&_table]:w-full [&_table]:border-collapse [&_table]:text-sm
      [&_th]:border [&_th]:border-border [&_th]:bg-muted [&_th]:px-3 [&_th]:py-1.5 [&_th]:text-left [&_th]:font-medium
      [&_td]:border [&_td]:border-border [&_td]:px-3 [&_td]:py-1.5
      [&_hr]:border-border [&_hr]:my-3
      [&_strong]:font-semibold [&_em]:italic
    ">
      <ReactMarkdown remarkPlugins={[remarkGfm]}>{content}</ReactMarkdown>
    </div>
  );
}

/* ───────────── 触发面板 ───────────── */
const BTS_TOKEN_KEY = "aihub_bts_token";

function RunPanel({ onSuccess }: { onSuccess: (r: RunResult) => void }) {
  const [proid, setProid] = useState("");
  const [btsToken, setBtsToken] = useState("");
  useEffect(() => {
    setBtsToken(localStorage.getItem(BTS_TOKEN_KEY) || "");
  }, []);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showTokenHelp, setShowTokenHelp] = useState(false);
  const proidRef = useRef<HTMLInputElement>(null);

  // BTS Token 变动时存 localStorage
  const handleBtsChange = (v: string) => {
    setBtsToken(v);
    if (typeof window !== "undefined") {
      if (v.trim()) localStorage.setItem(BTS_TOKEN_KEY, v.trim());
      else localStorage.removeItem(BTS_TOKEN_KEY);
    }
  };

  const handleRun = async () => {
    if (!proid.trim()) {
      setError("请输入 proid");
      proidRef.current?.focus();
      return;
    }
    if (!btsToken.trim()) {
      setError("请输入 BTS Token");
      return;
    }
    setError(null);
    setRunning(true);
    try {
      const resp = await fetch(`${API_BASE}/api/workflow/run`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ proid: proid.trim(), bts_token: btsToken.trim() }),
      });
      const json = await resp.json();
      if (json.success) {
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

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !running) handleRun();
  };

  return (
    <Card className="border-primary/30 bg-gradient-to-r from-primary/5 to-transparent">
      <CardHeader className="pb-3">
        <CardTitle className="text-sm flex items-center gap-2">
          <Play className="h-4 w-4 text-primary" />
          触发工作流
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {/* BTS Token 输入 */}
        <div className="space-y-1.5">
          <div className="flex items-center gap-2">
            <Label htmlFor="bts-token-input" className="text-xs text-muted-foreground">
              BTS Token <span className="text-destructive">*</span>
            </Label>
            <button
              className="text-xs text-primary hover:underline"
              onClick={() => setShowTokenHelp(!showTokenHelp)}
            >
              怎么获取？
            </button>
            {btsToken.trim() && (
              <span className="text-xs text-green-500 ml-auto">✓ 已填入</span>
            )}
          </div>
          <Input
            id="bts-token-input"
            type="password"
            value={btsToken}
            onChange={(e) => handleBtsChange(e.target.value)}
            placeholder="粘贴内网 BTS Token（自动保存到本地）"
            disabled={running}
            className="h-9 text-sm font-mono"
          />
          {showTokenHelp && (
            <div className="text-xs text-muted-foreground bg-muted/50 rounded-lg p-3 space-y-1.5 leading-relaxed">
              <p className="font-medium text-foreground">获取 BTS Token 步骤：</p>
              <p>1. 打开浏览器，登录内网 AI-Hub（<span className="font-mono">ai-hub.aiae.ndhy.com</span>）</p>
              <p>2. 按 <kbd className="bg-muted border rounded px-1">F12</kbd> 打开 DevTools → Application → Cookies</p>
              <p>3. 找到 <span className="font-mono">bts_token</span> 或 <span className="font-mono">token</span> 字段，复制 Value</p>
              <p className="text-amber-500">⚠ Token 有效期较短，失效后需重新获取粘贴</p>
            </div>
          )}
        </div>

        {/* proid + 执行按钮 */}
        <div className="flex items-end gap-3">
          <div className="flex-1 space-y-1.5">
            <Label htmlFor="proid-input" className="text-xs text-muted-foreground">
              proid <span className="text-destructive">*</span>
            </Label>
            <Input
              id="proid-input"
              ref={proidRef}
              value={proid}
              onChange={(e) => setProid(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="输入项目 ID，例如：PRJ-001"
              disabled={running}
              className="h-9 text-sm font-mono"
            />
          </div>
          <Button
            onClick={handleRun}
            disabled={running || !proid.trim() || !btsToken.trim()}
            className="h-9 min-w-24 shrink-0"
          >
            {running ? (
              <>
                <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />
                执行中…
              </>
            ) : (
              <>
                <Play className="h-3.5 w-3.5 mr-1.5" />
                执行
              </>
            )}
          </Button>
        </div>

        {error && (
          <div className="flex items-start gap-2 text-sm text-destructive bg-destructive/10 rounded-lg px-3 py-2">
            <AlertCircle className="h-4 w-4 mt-0.5 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        <p className="text-xs text-muted-foreground">
          执行后结果实时展示，并自动保存到历史记录。BTS Token 自动保存在浏览器本地，下次无需重填。
        </p>
      </CardContent>
    </Card>
  );
}

/* ───────────── 结果展示卡片 ───────────── */
function ResultCard({
  result,
  onClose,
}: {
  result: RunResult;
  onClose: () => void;
}) {
  const [showRaw, setShowRaw] = useState(false);

  return (
    <Card className="border-green-500/30 bg-green-500/5">
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="h-4 w-4 text-green-500" />
            <CardTitle className="text-sm font-medium">{result.title}</CardTitle>
          </div>
          <div className="flex items-center gap-2">
            {result.workflow_run_id && (
              <Badge variant="outline" className="text-xs font-mono">
                {result.workflow_run_id.slice(0, 8)}…
              </Badge>
            )}
            <Button
              variant="ghost"
              size="sm"
              className="h-6 text-xs text-muted-foreground"
              onClick={onClose}
            >
              关闭
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <div className="bg-background rounded-lg border p-4 min-h-24">
          <MarkdownContent content={result.answer} />
        </div>

        {/* 原始 JSON 折叠 */}
        <button
          className="mt-3 flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
          onClick={() => setShowRaw(!showRaw)}
        >
          {showRaw ? (
            <ChevronDown className="h-3 w-3" />
          ) : (
            <ChevronRight className="h-3 w-3" />
          )}
          原始响应
        </button>
        {showRaw && (
          <ScrollArea className="mt-2 h-48">
            <pre className="text-xs text-muted-foreground bg-muted/50 p-3 rounded-lg whitespace-pre-wrap break-all">
              {JSON.stringify(result.raw, null, 2)}
            </pre>
          </ScrollArea>
        )}
      </CardContent>
    </Card>
  );
}

/* ───────────── 主页面 ───────────── */
export default function WorkflowPage() {
  const [outputs, setOutputs] = useState<WorkflowOutput[]>([]);
  const [files, setFiles] = useState<WorkflowFile[]>([]);
  const [loading, setLoading] = useState(false);
  const [selectedFile, setSelectedFile] = useState<string | null>(null);
  const [fileContent, setFileContent] = useState<string | null>(null);
  const [latestResult, setLatestResult] = useState<RunResult | null>(null);

  const loadOutputs = async () => {
    setLoading(true);
    try {
      const resp = await fetch(`${API_BASE}/api/workflow/outputs?limit=50`);
      const json = await resp.json();
      if (json.success) setOutputs(json.data);
    } catch (e) {
      console.error("加载工作流输出失败:", e);
    } finally {
      setLoading(false);
    }
  };

  const loadFiles = async () => {
    try {
      const resp = await fetch(`${API_BASE}/api/workflow/inbox`);
      const json = await resp.json();
      if (json.success) setFiles(json.data);
    } catch (e) {
      console.error("加载文件列表失败:", e);
    }
  };

  const loadFileContent = async (filename: string) => {
    try {
      const resp = await fetch(
        `${API_BASE}/api/workflow/inbox/${encodeURIComponent(filename)}`
      );
      const json = await resp.json();
      if (json.success) {
        setFileContent(json.data.content);
        setSelectedFile(filename);
      }
    } catch (e) {
      console.error("加载文件内容失败:", e);
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

  const handleRunSuccess = (result: RunResult) => {
    setLatestResult(result);
    // 稍后刷新历史记录
    setTimeout(() => loadOutputs(), 500);
  };

  useEffect(() => {
    loadOutputs();
    loadFiles();
  }, []);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Inbox className="h-6 w-6" />
            工作流输出
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            触发 AI-Hub 工作流，结果 Markdown 渲染展示
          </p>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={() => {
            loadOutputs();
            loadFiles();
          }}
          disabled={loading}
        >
          <RefreshCw
            className={`h-4 w-4 mr-1 ${loading ? "animate-spin" : ""}`}
          />
          刷新
        </Button>
      </div>

      {/* 触发面板 */}
      <RunPanel onSuccess={handleRunSuccess} />

      {/* 最新结果展示 */}
      {latestResult && (
        <ResultCard
          result={latestResult}
          onClose={() => setLatestResult(null)}
        />
      )}

      {/* 历史记录 & 文件 Tabs */}
      <Tabs defaultValue="db" className="space-y-4">
        <TabsList>
          <TabsTrigger value="db">
            <FileText className="h-3.5 w-3.5 mr-1" />
            历史记录 ({outputs.length})
          </TabsTrigger>
          <TabsTrigger value="files">
            <FolderOpen className="h-3.5 w-3.5 mr-1" />
            文件中转 ({files.length})
          </TabsTrigger>
        </TabsList>

        {/* 历史记录 Tab */}
        <TabsContent value="db" className="space-y-4">
          {outputs.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              <Inbox className="h-12 w-12 mx-auto mb-3 opacity-30" />
              <p>暂无历史记录</p>
              <p className="text-xs mt-1">触发工作流后结果会自动保存在这里</p>
            </div>
          ) : (
            <div className="grid gap-4">
              {outputs.map((o) => (
                <HistoryCard
                  key={o.id}
                  output={o}
                  formatDate={formatDate}
                  onDelete={deleteOutput}
                />
              ))}
            </div>
          )}
        </TabsContent>

        {/* 文件中转 Tab */}
        <TabsContent value="files" className="space-y-4">
          <div className="grid gap-4 md:grid-cols-3">
            {/* 文件列表 */}
            <div className="md:col-span-1">
              <Card>
                <CardHeader>
                  <CardTitle className="text-sm">文件列表</CardTitle>
                </CardHeader>
                <CardContent>
                  {files.length === 0 ? (
                    <p className="text-sm text-muted-foreground text-center py-4">
                      暂无文件
                    </p>
                  ) : (
                    <div className="space-y-1">
                      {files.map((f) => (
                        <button
                          key={f.filename}
                          className={`w-full text-left p-2 rounded-lg text-sm transition-colors ${
                            selectedFile === f.filename
                              ? "bg-primary/10 text-primary"
                              : "hover:bg-muted/50"
                          }`}
                          onClick={() => loadFileContent(f.filename)}
                        >
                          <div className="font-medium truncate">{f.filename}</div>
                          <div className="text-xs text-muted-foreground">
                            {formatDate(f.modified)} ·{" "}
                            {(f.size / 1024).toFixed(1)} KB
                          </div>
                        </button>
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>
            </div>

            {/* 文件内容 */}
            <div className="md:col-span-2">
              <Card className="h-full">
                <CardHeader>
                  <CardTitle className="text-sm">
                    {selectedFile || "选择文件查看内容"}
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  {fileContent ? (
                    <ScrollArea className="h-[60vh]">
                      <pre className="text-sm whitespace-pre-wrap text-muted-foreground">
                        {fileContent}
                      </pre>
                    </ScrollArea>
                  ) : (
                    <div className="text-sm text-muted-foreground text-center py-12">
                      <FolderOpen className="h-10 w-10 mx-auto mb-2 opacity-30" />
                      点击左侧文件查看内容
                    </div>
                  )}
                </CardContent>
              </Card>
            </div>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}

/* ───────────── 历史记录卡片 ───────────── */
function HistoryCard({
  output: o,
  formatDate,
  onDelete,
}: {
  output: WorkflowOutput;
  formatDate: (s: string) => string;
  onDelete: (id: number) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const isMarkdown = o.type === "markdown" || o.source === "ai-hub-workflow";

  return (
    <Card>
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 flex-1 min-w-0">
            <button
              onClick={() => setExpanded(!expanded)}
              className="flex items-center gap-1 text-muted-foreground hover:text-foreground transition-colors shrink-0"
            >
              {expanded ? (
                <ChevronDown className="h-3.5 w-3.5" />
              ) : (
                <ChevronRight className="h-3.5 w-3.5" />
              )}
            </button>
            <CardTitle className="text-sm font-medium truncate">
              {o.title || "无标题"}
            </CardTitle>
            <Badge variant="outline" className="text-xs shrink-0">
              {o.source}
            </Badge>
            <Badge variant="secondary" className="text-xs shrink-0">
              {o.type}
            </Badge>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <span className="text-xs text-muted-foreground flex items-center gap-1">
              <Clock className="h-3 w-3" />
              {formatDate(o.created_at)}
            </span>
            <Button
              variant="ghost"
              size="icon"
              className="h-6 w-6"
              onClick={() => onDelete(o.id)}
            >
              <Trash2 className="h-3 w-3 text-muted-foreground hover:text-destructive" />
            </Button>
          </div>
        </div>
      </CardHeader>

      {/* 折叠内容 */}
      {expanded && (
        <CardContent>
          <div className="bg-muted/30 rounded-lg p-4">
            {isMarkdown ? (
              <MarkdownContent content={o.content} />
            ) : (
              <div className="text-sm text-muted-foreground whitespace-pre-wrap max-h-80 overflow-auto">
                {o.content}
              </div>
            )}
          </div>
          {o.metadata && o.metadata !== "{}" && (
            <div className="text-xs text-muted-foreground mt-2 font-mono">
              元数据: {o.metadata}
            </div>
          )}
        </CardContent>
      )}

      {/* 未展开时显示摘要 */}
      {!expanded && (
        <CardContent className="pt-0">
          <p className="text-xs text-muted-foreground line-clamp-2 pl-5">
            {o.content.replace(/#{1,6}\s/g, "").slice(0, 120)}
            {o.content.length > 120 ? "…" : ""}
          </p>
        </CardContent>
      )}
    </Card>
  );
}
