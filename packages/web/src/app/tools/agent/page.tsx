"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  Bot, Plus, Send, Trash2, Loader2, Sparkles, MessageSquare, History,
  Paperclip, X, Image, FileText,
} from "lucide-react";
import { ToolCallCard } from "@/components/agent/ToolCallCard";
import { ExecAgentCard } from "@/components/agent/ExecAgentCard";

const API_BASE = "http://localhost:3001";

// ============= 类型定义 =============
type AgentEventType =
  | "init" | "thinking" | "text" | "tool_call" | "tool_result"
  | "exec_start" | "exec_progress" | "exec_done" | "done" | "error";

interface AgentEvent {
  type: AgentEventType;
  session_id?: string;
  content?: string;
  id?: string;
  name?: string;
  params?: Record<string, unknown>;
  result?: unknown;
  error?: string;
  tool_call_id?: string;
  task_id?: string;
  description?: string;
  message?: string;
  duration_ms?: number;
}

type ToolCallState = {
  id: string; name: string;
  params?: Record<string, unknown>;
  result?: unknown; error?: string;
  status: "running" | "completed" | "error";
};

type ExecState = {
  task_id: string; description: string; logs: string[];
  status: "running" | "completed" | "failed"; result?: string;
};

interface ChatMessage {
  id: string; role: "user" | "assistant";
  content: string;
  _attachments?: ChatAttachment[];
  toolCalls?: ToolCallState[];
  execAgents?: ExecState[];
  isStreaming?: boolean;
  duration_ms?: number;
}

interface Session {
  id: string; title: string; createdAt: number;
}
interface ChatAttachment {
  id: string; name: string; type: string; size: number;
  base64: string; preview?: string;
}

const IMAGE_TYPES = ["image/png", "image/jpeg", "image/gif", "image/webp", "image/bmp"];
const MAX_FILE_SIZE = 20 * 1024 * 1024;
const MAX_ATTACHMENTS = 5;

function uid() { return `${Date.now()}-${Math.random().toString(16).slice(2)}`; }
const STORAGE_KEY = "agentChat.sessions.v1";
const ACTIVE_KEY = "agentChat.activeId.v1";

const QUICK_PROMPTS = [
  "帮我查看最近的项目进度和版本状态",
  "查询当前未完成的开发任务，并按优先级排列",
  "分析最近的 IM 聊天记录，提取关键决策和待办事项",
];

// ============= 主组件 =============
export default function AgentPage() {
  const [sessions, setSessions] = useState<Session[]>([]);
  const [activeId, setActiveId] = useState("");
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [loadingHistory, setLoadingHistory] = useState(false);
  const [attachments, setAttachments] = useState<ChatAttachment[]>([]);
  const [isDragging, setIsDragging] = useState(false);

  const listRef = useRef<HTMLDivElement>(null);
  const abortRef = useRef<AbortController | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // ---- DB 消息转前端格式 ----
  const dbMsgToChatMsg = useCallback((m: { id: string; role: string; content: string; tool_calls?: unknown[] | null }): ChatMessage => {
    const toolCalls: ToolCallState[] = [];
    const execAgents: ExecState[] = [];
    if (m.tool_calls && Array.isArray(m.tool_calls)) {
      for (const tc of m.tool_calls) {
        const t = tc as Record<string, unknown>;
        toolCalls.push({
          id: (t.id as string) || uid(), name: (t.name as string) || "unknown",
          params: (t.params ?? t.input) as Record<string, unknown> | undefined,
          result: t.result as unknown, error: t.error as string | undefined,
          status: t.error ? "error" : "completed",
        });
        if ((t.name === "dispatch_exec_agent") && t.result && typeof t.result === "object") {
          const r = t.result as Record<string, unknown>;
          if (r.task_id) {
            const ts = (r.task_status as string) ?? (r.summary ? "completed" : "running");
            execAgents.push({
              task_id: r.task_id as string,
              description: (t.params as Record<string, unknown>)?.description as string || "执行任务",
              logs: [], status: ts === "failed" ? "failed" : ts === "completed" ? "completed" : "running",
              result: (r.summary as string) || undefined,
            });
          }
        }
      }
    }
    return {
      id: m.id, role: m.role as "user" | "assistant", content: m.content,
      toolCalls: toolCalls.length > 0 ? toolCalls : undefined,
      execAgents: execAgents.length > 0 ? execAgents : undefined,
    };
  }, []);

  // ---- 加载历史 ----
  const loadMessages = useCallback(async (sid: string) => {
    if (!sid) return;
    setLoadingHistory(true);
    try {
      const r = await fetch(`${API_BASE}/api/sessions/${sid}`);
      if (!r.ok) { setMessages([]); return; }
      const d = await r.json();
      setMessages(d.messages?.map(dbMsgToChatMsg) || []);
    } catch { setMessages([]); }
    finally { setLoadingHistory(false); }
  }, [dbMsgToChatMsg]);

  // ---- 初始化会话列表 ----
  useEffect(() => {
    (async () => {
      const cachedActive = localStorage.getItem(ACTIVE_KEY) || "";
      try {
        const r = await fetch(`${API_BASE}/api/sessions`);
        if (r.ok) {
          const d = await r.json();
          const dbSess: Session[] = (d.sessions || []).filter((s: { messageCount?: number }) => (s.messageCount ?? 0) > 0)
            .map((s: { id: string; title: string; created_at: string }) => ({
              id: s.id, title: s.title, createdAt: new Date(s.created_at).getTime(),
            }));
          if (dbSess.length > 0) {
            setSessions(dbSess); const a = dbSess.find(s => s.id === cachedActive) ? cachedActive : dbSess[0].id;
            setActiveId(a); localStorage.setItem(STORAGE_KEY, JSON.stringify(dbSess)); localStorage.setItem(ACTIVE_KEY, a); return;
          }
        }
      } catch { /* ignore */ }

      const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || "[]") as Session[];
      if (!saved.length) {
        const s: Session = { id: uid(), title: "新对话", createdAt: Date.now() };
        localStorage.setItem(STORAGE_KEY, JSON.stringify([s])); localStorage.setItem(ACTIVE_KEY, s.id);
        setSessions([s]); setActiveId(s.id); return;
      }
      const a = saved.find(s => s.id === cachedActive) ? cachedActive : saved[0].id;
      setSessions(saved); setActiveId(a);
    })();
  }, []);

  useEffect(() => { if (activeId) loadMessages(activeId); }, [activeId, loadMessages]);
  useEffect(() => { if (sessions.length) localStorage.setItem(STORAGE_KEY, JSON.stringify(sessions)); }, [sessions]);
  useEffect(() => { if (activeId) localStorage.setItem(ACTIVE_KEY, activeId); }, [activeId]);
  useEffect(() => { listRef.current?.scrollTo({ top: listRef.current.scrollHeight, behavior: "smooth" }); }, [messages]);

  // ---- 文件处理 ----
  const fileToAttachment = useCallback((f: File): Promise<ChatAttachment> =>
    new Promise((resolve, reject) => {
      if (f.size > MAX_FILE_SIZE) reject(new Error(`文件过大 (${(f.size / 1024 / 1024).toFixed(1)}MB)`));
      const reader = new FileReader();
      reader.onload = () => {
        const base64 = (reader.result as string).split(",")[1] ?? "";
        const isImg = IMAGE_TYPES.includes(f.type);
        resolve({ id: uid(), name: f.name, type: f.type || "application/octet-stream", size: f.size, base64,
          preview: isImg ? `data:${f.type};base64,${base64}` : undefined });
      };
      reader.onerror = () => reject(new Error("读取失败"));
      reader.readAsDataURL(f);
    }), []);

  const handleFileSelect = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    if (!files.length) return;
    if (attachments.length + files.length > MAX_ATTACHMENTS) { alert(`最多 ${MAX_ATTACHMENTS} 个`); e.target.value = ""; return; }
    try {
      const newAtts: ChatAttachment[] = [];
      for (const f of files) newAtts.push(await fileToAttachment(f));
      setAttachments(p => [...p, ...newAtts]);
    } catch (err) { alert(err instanceof Error ? err.message : "失败"); }
    e.target.value = "";
  }, [attachments.length, fileToAttachment]);
  const removeAttachment = useCallback((id: string) => setAttachments(p => p.filter(a => a.id !== id)), []);
  const clearAttachments = useCallback(() => setAttachments([]), []);

  const onDragOver = (e: React.DragEvent) => { e.preventDefault(); e.stopPropagation(); setIsDragging(true); };
  const onDragLeave = (e: React.DragEvent) => { e.preventDefault(); e.stopPropagation(); setIsDragging(false); };
  const onDrop = useCallback(async (e: React.DragEvent) => {
    e.preventDefault(); e.stopPropagation(); setIsDragging(false);
    const files = Array.from(e.dataTransfer.files);
    if (!files.length || attachments.length + files.length > MAX_ATTACHMENTS) { alert(`最多 ${MAX_ATTACHMENTS}`); return; }
    try {
      const newAtts: ChatAttachment[] = [];
      for (const f of files) newAtts.push(await fileToAttachment(f));
      setAttachments(p => [...p, ...newAtts]);
    } catch (err) { alert(err instanceof Error ? err.message : "失败"); }
  }, [attachments.length, fileToAttachment]);

  // ---- 会话操作 ----
  const newSession = useCallback(() => {
    const s: Session = { id: uid(), title: "新对话", createdAt: Date.now() };
    setSessions(p => [s, ...p]); setActiveId(s.id); setMessages([]); setInput(""); clearAttachments();
  }, [clearAttachments]);

  const deleteSession = useCallback(async (id: string) => {
    try { const r = await fetch(`${API_BASE}/api/sessions/${id}`, { method: "DELETE" }); if (!r.ok) return; } catch { return; }
    setSessions(p => {
      const n = p.filter(s => s.id !== id);
      if (id === activeId) { const na = n[0]?.id || ""; setActiveId(na); if (!na) setMessages([]); }
      const result = n.length ? n : [{ id: uid(), title: "新对话", createdAt: Date.now() }];
      localStorage.setItem(STORAGE_KEY, JSON.stringify(result)); return result;
    });
  }, [activeId]);

  // ---- 发送消息（核心） ----
  const sendMessage = useCallback(async (text: string) => {
    if ((!text.trim() && attachments.length === 0) || loading) return;

    const sendText = text.trim() || (attachments.length > 0 ? "（附带了文件）" : "");
    setInput(""); setLoading(true);

    // 构建带附件的消息文本
    let msgText = sendText;
    if (attachments.length > 0) {
      const attInfo = attachments.map(a => `[附件: ${a.name} (${(a.size / 1024).toFixed(1)}KB)]`).join(" ");
      msgText += "\n\n" + attInfo;
    }

    const userMsg: ChatMessage = { id: uid(), role: "user", content: msgText, ...(attachments.length > 0 ? { _attachments: [...attachments] } : {}) };
    const aid = uid();
    const assistantMsg: ChatMessage = { id: aid, role: "assistant", content: "", isStreaming: true, toolCalls: [], execAgents: [] };
    setMessages(p => [...p, userMsg, assistantMsg]);

    const curAtts = [...attachments]; clearAttachments();

    // 更新标题
    setSessions(p => p.map(s => s.id === activeId && s.title === "新对话" ? { ...s, title: sendText.slice(0, 20) } : s));

    const ctrl = new AbortController();
    abortRef.current = ctrl;

    try {
      const body: Record<string, unknown> = { sessionId: activeId || undefined, message: msgText };
      if (curAtts.length > 0) {
        body.attachments = curAtts.map(a => ({ name: a.name, type: a.type, size: a.size, base64: a.base64 }));
      }

      const resp = await fetch(`${API_BASE}/api/agent/chat`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body), signal: ctrl.signal,
      });

      if (!resp.ok) {
        const et = await resp.text().catch(() => "");
        throw new Error(`${resp.status}: ${(et.slice(0, 150))}`);
      }
      if (!resp.body) throw new Error("空响应体");

      const reader = resp.body.getReader();
      const dec = new TextDecoder();
      let buf = "";

      const updateA = (updater: (prev: ChatMessage) => ChatMessage) => setMessages(p => p.map(m => m.id === aid ? updater(m) : m));

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buf += dec.decode(value, { stream: true });
        const lines = buf.split("\n"); buf = lines.pop() ?? "";

        for (const line of lines) {
          if (!line.startsWith("data:")) continue;
          const raw = line.slice(5).trim(); if (!raw) continue;
          let evt: AgentEvent;
          try { evt = JSON.parse(raw) as AgentEvent; } catch { continue; }

          switch (evt.type) {
            case "text":
              if (evt.content) updateA(m => ({ ...m, content: m.content + evt.content }));
              break;
            case "tool_call":
              if (evt.id && evt.name)
                updateA(m => ({ ...m, toolCalls: [...(m.toolCalls ?? []), { id: evt.id!, name: evt.name!, params: evt.params, status: "running" }] }));
              break;
            case "tool_result":
              if (evt.tool_call_id)
                updateA(m => ({ ...m, toolCalls: (m.toolCalls ?? []).map(tc => {
                  if (tc.id !== evt.tool_call_id!) return tc;
                  return { ...tc, result: evt.result, error: evt.error, status: evt.error ? "error" as const : "completed" as const };
                }) }));
              break;
            case "exec_start":
              if (evt.task_id && evt.description)
                updateA(m => ({ ...m, execAgents: [...(m.execAgents ?? []), { task_id: evt.task_id!, description: evt.description!, logs: [], status: "running" }] }));
              break;
            case "exec_progress":
              if (evt.task_id && evt.message)
                updateA(m => ({ ...m, execAgents: (m.execAgents ?? []).map(e =>
                  e.task_id === evt.task_id ? { ...e, logs: [...e.logs, evt.message!] } : e) }));
              break;
            case "exec_done":
              if (evt.task_id) {
                const rd = evt.result as { summary?: string; error?: string } | undefined;
                updateA(m => ({ ...m, execAgents: (m.execAgents ?? []).map(e =>
                  e.task_id === evt.task_id ? { ...e, status: rd?.error ? "failed" : "completed", result: rd?.summary ?? rd?.error } : e) }));
              }
              break;
            case "done":
              updateA(m => ({ ...m, isStreaming: false, duration_ms: evt.duration_ms }));
              break;
            case "error":
              updateA(m => ({ ...m, isStreaming: false, content: m.content || `❌ ${evt.message ?? "请求失败"}` }));
              break;
          }
        }
      }
    } catch (err: unknown) {
      if ((err as Error).name !== "AbortError")
        setMessages(p => p.map(m => m.id === aid ? { ...m, isStreaming: false, content: "❌ 请求失败" } : m));
    } finally {
      setLoading(false); abortRef.current = null;
      try {
        const sr = await fetch(`${API_BASE}/api/sessions`);
        if (sr.ok) {
          const sd = await sr.json();
          const dbSess: Session[] = (sd.sessions || []).filter((s: { messageCount?: number }) => (s.messageCount ?? 0) > 0)
            .map((s: { id: string; title: string; created_at: string }) => ({ id: s.id, title: s.title, createdAt: new Date(s.created_at).getTime() }));
          if (dbSess.length > 0) setSessions(dbSess);
        }
      } catch { /* ignore */ }
    }
  }, [loading, activeId, attachments]);

  const handleSend = useCallback(() => {
    if (attachments.length > 0 && !input.trim()) sendMessage(input || "（附带了文件）");
    else sendMessage(input);
  }, [sendMessage, input, attachments.length]);

  const handleKeyDown = useCallback((e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); handleSend(); }
  }, [handleSend]);

  // ============= 渲染 =============
  return (
    <div className="flex h-[calc(100vh-56px)] gap-0">
      {/* 左侧会话列表 */}
      <div className="w-56 shrink-0 border-r border-border/50 flex flex-col bg-background/50">
        <div className="p-3 border-b border-border/50">
          <Button variant="outline" size="sm" className="w-full gap-2" onClick={newSession}>
            <Plus className="h-3.5 w-3.5" /> 新对话
          </Button>
        </div>
        <div className="flex-1 overflow-y-auto py-1">
          {sessions.map(s => (
            <div key={s.id} onClick={() => { if (s.id !== activeId) setActiveId(s.id); }}
              className={`group flex items-center gap-2 px-3 py-2.5 cursor-pointer rounded mx-1 my-0.5 text-sm transition-colors ${
                s.id === activeId ? "bg-white/[0.06] text-foreground" : "text-muted-foreground hover:bg-white/[0.03] hover:text-foreground"
              }`}>
              <MessageSquare className="h-3.5 w-3.5 shrink-0" />
              <span className="flex-1 truncate text-xs">{s.title}</span>
              <button onClick={(e) => { e.stopPropagation(); deleteSession(s.id); }}
                className="opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-red-400 transition-all">
                <Trash2 className="h-3 w-3" />
              </button>
            </div>
          ))}
        </div>
      </div>

      {/* 右侧对话区 */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* 消息列表 */}
        <div ref={listRef} className="flex-1 overflow-y-auto px-6 py-4 space-y-4">
          {loadingHistory && (
            <div className="flex items-center justify-center h-full gap-2 text-muted-foreground">
              <History className="h-4 w-4 animate-pulse" /><span className="text-sm">加载中...</span>
            </div>
          )}
          {!loadingHistory && messages.length === 0 && (
            <div className="flex flex-col items-center justify-center h-full gap-6 text-center">
              <div className="flex flex-col items-center gap-3">
                <div className="h-14 w-14 rounded-2xl bg-sky-500/10 border border-sky-500/20 flex items-center justify-center">
                  <Bot className="h-7 w-7 text-sky-400" />
                </div>
                <div>
                  <p className="font-semibold text-foreground">PM Agent</p>
                  <p className="text-sm text-muted-foreground">项目管理 AI 助手 · CodeBuddy AI 驱动 · GLM-5 Turbo</p>
                </div>
              </div>
              <div className="flex flex-col gap-2 w-full max-w-md">
                {QUICK_PROMPTS.map((p, i) => (
                  <button key={i} onClick={() => sendMessage(p)}
                    className="text-left text-sm px-4 py-3 rounded-lg border border-border/50 hover:border-sky-500/40 hover:bg-sky-500/5 text-muted-foreground hover:text-foreground transition-all">
                    <Sparkles className="h-3.5 w-3.5 inline mr-2 text-sky-400" />{p}
                  </button>
                ))}
              </div>
            </div>
          )}

          {messages.map(msg => (
            <div key={msg.id} className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}>
              {msg.role === "user" ? (
                <div className="max-w-[70%] rounded-2xl rounded-tr-sm bg-sky-500/15 border border-sky-500/20 px-4 py-2.5 text-sm space-y-2">
                  {msg._attachments?.filter(a => a.type.startsWith("image/")).map(att => (
                    <img key={att.id} src={att.preview || `data:${att.type};base64,${att.base64}`} alt={att.name}
                      className="rounded-lg max-w-full max-h-[280px] object-contain cursor-pointer hover:opacity-90"
                      onClick={() => window.open(att.preview || `data:${att.type};base64,${att.base64}`, "_blank")} />
                  ))}
                  {msg._attachments?.filter(a => !a.type.startsWith("image/")).map(att => (
                    <div key={att.id} className="flex items-center gap-2 bg-black/10 rounded-lg px-3 py-2 text-xs">
                      <FileText className="h-3.5 w-3.5 text-sky-400 shrink-0" />
                      <span className="truncate">{att.name}</span>
                      <span className="text-muted-foreground ml-auto">{(att.size / 1024).toFixed(1)}KB</span>
                    </div>
                  ))}
                  {sendTextOnly(msg.content)}
                </div>
              ) : (
                <div className="max-w-[85%] min-w-0">
                  <div className="flex items-center gap-2 mb-1.5">
                    <Bot className="h-4 w-4 text-sky-400 shrink-0" />
                    <span className="text-xs text-muted-foreground">PM Agent</span>
                    {msg.isStreaming && <Loader2 className="h-3 w-3 animate-spin text-muted-foreground" />}
                  </div>

                  {(msg.toolCalls ?? []).map(tc => <ToolCallCard key={tc.id} {...tc} />)}
                  {(msg.execAgents ?? []).map(ea => <ExecAgentCard key={ea.task_id} taskId={ea.task_id} {...ea} />)}

                  {msg.content && (
                    <Card className="border-border/50">
                      <CardContent className="px-4 py-3 text-sm whitespace-pre-wrap leading-relaxed">{msg.content}</CardContent>
                    </Card>
                  )}
                  {msg.duration_ms != null && (
                    <p className="text-[10px] text-muted-foreground/40 mt-1 px-1">耗时 {(msg.duration_ms / 1000).toFixed(1)}s</p>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>

        {/* 输入区 */}
        <div className={`border-t border-border/50 px-6 py-4 transition-colors ${isDragging ? "bg-sky-500/5 border-sky-500/30" : ""}`}
          onDragOver={onDragOver} onDragLeave={onDragLeave} onDrop={onDrop}>
          {isDragging && (
            <div className="flex items-center justify-center py-3 mb-2 rounded-lg border-2 border-dashed border-sky-500/40 bg-sky-500/5 text-sky-400 text-sm">
              <Image className="h-4 w-4 mr-2" />松开上传文件
            </div>
          )}
          {attachments.length > 0 && (
            <div className="flex flex-wrap gap-2 mb-3">
              {attachments.map(att => (
                <div key={att.id} className="group flex items-center gap-1.5 bg-white/[0.06] border border-border/50 rounded-lg px-2.5 py-1.5 text-xs max-w-[180px]">
                  {att.type.startsWith("image/") && att.preview ? (
                    <img src={att.preview} alt="" className="h-6 w-6 rounded object-cover shrink-0" />
                  ) : att.type.startsWith("image/") ? (
                    <Image className="h-4 w-4 shrink-0 text-sky-400" />
                  ) : (
                    <FileText className="h-4 w-4 shrink-0 text-muted-foreground" />
                  )}
                  <span className="truncate font-medium">{att.name}</span>
                  <button onClick={() => removeAttachment(att.id)} disabled={loading}
                    className="opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-red-400 ml-auto"><X className="h-3 w-3" /></button>
                </div>
              ))}
            </div>
          )}
          <div className="flex gap-3 items-end">
            <div className="relative">
              <Button variant="ghost" size="icon" className="h-10 w-10 shrink-0 text-muted-foreground hover:text-foreground"
                onClick={() => fileInputRef.current?.click()} disabled={loading || attachments.length >= MAX_ATTACHMENTS}
                title={`上传附件（最多${MAX_ATTACHMENTS}个）`}>
                <Paperclip className="h-4 w-4" />
              </Button>
              <input ref={fileInputRef} type="file" multiple
                accept="image/*,.pdf,.doc,.docx,.txt,.md,.csv,.xlsx,.xls,.json,.xml,.html,.css,.js,.ts,.tsx,.jsx,.py,.java,.c,.cpp,.h,.go,.rs,.rb,.php,.sql,.yaml,.yml,.toml,.ini,.log,.rtf,.odt"
                className="hidden" onChange={handleFileSelect} />
            </div>
            <Textarea value={input} onChange={e => setInput(e.target.value)} onKeyDown={handleKeyDown}
              placeholder="输入问题... (Enter 发送，Shift+Enter 换行，可拖拽或📎上传)"
              className="flex-1 min-h-[60px] max-h-[160px] resize-none text-sm" disabled={loading} />
            <Button onClick={handleSend} disabled={loading || (!input.trim() && attachments.length === 0)}
              size="icon" className="h-10 w-10 shrink-0">
              {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}

/** 提取用户消息中的纯文本（去除附件描述） */
function sendTextOnly(content: string): string {
  const idx = content.indexOf("\n\n[");
  return idx > 0 ? content.substring(0, idx) : content;
}
