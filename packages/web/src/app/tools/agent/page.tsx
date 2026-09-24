"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Bot, Plus, Send, Loader2, Trash2, SlidersHorizontal, Settings2 } from "lucide-react";
import { cn } from "@/lib/utils";

const API_BASE = process.env.NEXT_PUBLIC_API_URL || process.env.NEXT_PUBLIC_SERVER_API || (process.env.NODE_ENV === "production" ? "/a/openclaw" : "http://localhost:3001");

interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
}

interface Session {
  id: string;
  title: string;
  createdAt: number;
}

const QUICK_PROMPTS = [
  "帮我查看最近的项目进度和版本状态",
  "查询当前未完成的开发任务",
  "创建一个叫 Hermes 测试的项目立项",
];

function uid() {
  return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function formatTime(ts: number) {
  const d = new Date(ts);
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

function messageCountText(n: number) {
  return `${n} 条消息`;
}

export default function HermesAgentPage() {
  const [sessions, setSessions] = useState<Session[]>([]);
  const [activeId, setActiveId] = useState("");
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [loadingHistory, setLoadingHistory] = useState(false);
  const listRef = useRef<HTMLDivElement>(null);

  // 加载会话列表
  useEffect(() => {
    (async () => {
      try {
        const r = await fetch(`${API_BASE}/api/sessions`);
        if (r.ok) {
          const d = await r.json();
          const dbSess: Session[] = (d.sessions || [])
            .filter((s: { messageCount?: number }) => (s.messageCount ?? 0) > 0)
            .map((s: { id: string; title: string; created_at: string }) => ({
              id: s.id,
              title: s.title,
              createdAt: new Date(s.created_at).getTime(),
            }))
            .sort((a: Session, b: Session) => b.createdAt - a.createdAt);
          setSessions(dbSess);
          if (dbSess.length > 0 && !activeId) {
            setActiveId(dbSess[0].id);
          }
        }
      } catch (e) {
        console.error("加载会话失败", e);
      }
    })();
  }, [activeId]);

  // 加载当前会话历史
  const loadMessages = useCallback(async (sid: string) => {
    if (!sid) return;
    setLoadingHistory(true);
    try {
      const r = await fetch(`${API_BASE}/api/sessions/${sid}`);
      if (!r.ok) {
        setMessages([]);
        return;
      }
      const d = await r.json();
      setMessages(
        (d.messages || []).map((m: ChatMessage) => ({
          id: m.id || uid(),
          role: m.role,
          content: m.content,
        }))
      );
    } catch {
      setMessages([]);
    } finally {
      setLoadingHistory(false);
    }
  }, []);

  useEffect(() => {
    if (activeId) loadMessages(activeId);
  }, [activeId, loadMessages]);

  useEffect(() => {
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight, behavior: "smooth" });
  }, [messages]);

  const createSession = () => {
    const s: Session = { id: uid(), title: "新对话", createdAt: Date.now() };
    setSessions((prev) => [s, ...prev]);
    setActiveId(s.id);
    setMessages([]);
  };

  const deleteSession = async (sid: string, e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      await fetch(`${API_BASE}/api/sessions/${sid}`, { method: "DELETE" });
      setSessions((prev) => prev.filter((s) => s.id !== sid));
      if (activeId === sid) {
        setActiveId("");
        setMessages([]);
      }
    } catch (err) {
      console.error("删除会话失败", err);
    }
  };

  const sendMessage = async () => {
    const text = input.trim();
    if (!text || loading) return;

    const userMsg: ChatMessage = { id: uid(), role: "user", content: text };
    setMessages((prev) => [...prev, userMsg]);
    setInput("");
    setLoading(true);

    try {
      const r = await fetch(`${API_BASE}/api/agent/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sessionId: activeId || undefined, message: text }),
      });
      const d = await r.json();

      if (!d.success) {
        throw new Error(d.error || "请求失败");
      }

      setMessages((prev) => [...prev, { id: uid(), role: "assistant", content: d.response }]);

      if (d.session_id && d.session_id !== activeId) {
        setActiveId(d.session_id);
        setSessions((prev) => {
          if (prev.some((s) => s.id === d.session_id)) return prev;
          return [{ id: d.session_id, title: text.slice(0, 30), createdAt: Date.now() }, ...prev];
        });
      }
    } catch (err: any) {
      setMessages((prev) => [
        ...prev,
        { id: uid(), role: "assistant", content: `出错了：${err.message || "请稍后重试"}` },
      ]);
    } finally {
      setLoading(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  };

  const activeSession = sessions.find((s) => s.id === activeId);

  return (
    <div className="flex h-[calc(100vh-64px)] flex-col p-7">
      {/* Header */}
      <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-[var(--oc-text-primary)]">Hermes Agent 对话</h1>
          <p className="mt-1.5 text-[13px] text-[var(--oc-text-secondary)]">
            让 AI 执行复杂查询、跨项目分析与自动化操作
          </p>
        </div>
        <div className="flex items-center gap-2.5">
          <Button
            variant="ghost"
            size="sm"
            className="h-9 gap-1.5 rounded-[10px] border border-[var(--oc-border-subtle)] bg-[var(--oc-bg-elevated)] px-3 text-[13px] font-semibold text-[var(--oc-text-primary)] hover:border-[var(--oc-border-strong)] hover:bg-[var(--oc-bg-hover)]"
          >
            <SlidersHorizontal className="h-4 w-4" />
            能力配置
          </Button>
          <Button
            size="sm"
            onClick={createSession}
            className="h-9 gap-1.5 rounded-[10px] bg-[var(--oc-accent)] px-4 text-[13px] font-semibold text-[var(--oc-bg-root)] shadow-[0_1px_0_rgba(255,255,255,0.12)_inset,0_1px_2px_rgba(0,0,0,0.24)] transition-all hover:-translate-y-px hover:bg-[var(--oc-accent-hover)] hover:shadow-[0_2px_0_rgba(255,255,255,0.12)_inset,0_4px_16px_rgba(0,0,0,0.32)] active:translate-y-0"
          >
            <Plus className="h-4 w-4" />
            新会话
          </Button>
        </div>
      </div>

      {/* 主布局 */}
      <div className="grid flex-1 gap-5 overflow-hidden md:grid-cols-[260px_1fr]">
        {/* 会话列表 */}
        <aside className="flex h-full flex-col overflow-hidden rounded-[14px] border border-[var(--oc-border-subtle)] bg-[var(--oc-bg-surface)]">
          <div className="flex shrink-0 items-center justify-between border-b border-[var(--oc-border-subtle)] px-4 py-3.5">
            <span className="text-[13px] font-bold text-[var(--oc-text-primary)]">会话列表</span>
            <span className="rounded-full border border-[var(--oc-border-subtle)] bg-[var(--oc-bg-elevated)] px-2 py-0.5 text-[11px] font-semibold text-[var(--oc-text-secondary)]">
              {sessions.length}
            </span>
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto p-2">
            {sessions.length === 0 && (
              <div className="py-8 text-center text-sm text-[var(--oc-text-secondary)]">暂无历史对话</div>
            )}
            {sessions.map((s) => (
              <div
                key={s.id}
                onClick={() => setActiveId(s.id)}
                className={cn(
                  "group cursor-pointer rounded-lg border border-transparent px-3 py-3 transition-all",
                  activeId === s.id
                    ? "border-[var(--oc-border-strong)] bg-[var(--oc-bg-active)]"
                    : "hover:border-[var(--oc-border-subtle)] hover:bg-[var(--oc-bg-elevated)]"
                )}
              >
                <div className="flex items-center justify-between gap-2">
                  <span
                    className={cn(
                      "truncate text-[13px] font-semibold",
                      activeId === s.id ? "text-[var(--oc-text-primary)]" : "text-[var(--oc-text-primary)]"
                    )}
                  >
                    {s.title}
                  </span>
                  <button
                    onClick={(e) => deleteSession(s.id, e)}
                    className="rounded-md border border-transparent p-1.5 text-[var(--oc-text-tertiary)] opacity-0 transition-all hover:border-[var(--oc-border-subtle)] hover:bg-[var(--oc-bg-hover)] hover:text-[var(--oc-error)] group-hover:opacity-100"
                    title="删除会话"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
                <div className="mt-1 text-[11px] text-[var(--oc-text-secondary)]">
                  {messageCountText(messages.length)} · {formatTime(s.createdAt)}
                </div>
              </div>
            ))}
          </div>
        </aside>

        {/* 主聊天区 */}
        <main className="flex h-full flex-col overflow-hidden rounded-[14px] border border-[var(--oc-border-subtle)] bg-[var(--oc-bg-surface)]">
          {/* 头部 */}
          <header className="flex shrink-0 items-center justify-between border-b border-[var(--oc-border-subtle)] px-5 py-4">
            <div className="flex items-center gap-3">
              <div className="flex h-9 w-9 items-center justify-center rounded-full bg-[var(--oc-accent-soft)] text-[11px] font-bold text-[var(--oc-accent)]">
                H
              </div>
              <div>
                <h2 className="text-sm font-bold text-[var(--oc-text-primary)]">
                  {activeSession?.title || "Hermes Agent"}
                </h2>
                <p className="text-[11px] text-[var(--oc-text-secondary)]">
                  Hermes Agent · 已启用项目分析、任务查询工具
                </p>
              </div>
            </div>
            <Button
              variant="ghost"
              size="sm"
              className="h-8 gap-1.5 rounded-lg border border-transparent bg-transparent px-3 text-xs font-semibold text-[var(--oc-text-secondary)] hover:border-[var(--oc-border-subtle)] hover:bg-[var(--oc-bg-hover)] hover:text-[var(--oc-text-primary)]"
            >
              <Settings2 className="h-3.5 w-3.5" />
              设置
            </Button>
          </header>

          {/* 消息列表 */}
          <div
            ref={listRef}
            className="min-h-0 flex-1 overflow-y-auto scroll-smooth p-5"
          >
            {messages.length === 0 && !loadingHistory && (
              <div className="flex h-full flex-col items-center justify-center space-y-5 text-[var(--oc-text-secondary)]">
                <div className="flex h-16 w-16 items-center justify-center rounded-full bg-[var(--oc-accent-soft)]">
                  <Bot className="h-8 w-8 text-[var(--oc-accent)]" />
                </div>
                <p className="text-base font-medium">有什么可以帮你的？</p>
                <div className="flex max-w-2xl flex-wrap justify-center gap-2">
                  {QUICK_PROMPTS.map((p) => (
                    <button
                      key={p}
                      onClick={() => setInput(p)}
                      className="rounded-full border border-[var(--oc-border-subtle)] bg-[var(--oc-bg-elevated)] px-3 py-1.5 text-[13px] text-[var(--oc-text-secondary)] transition-all hover:border-[var(--oc-border-strong)] hover:text-[var(--oc-text-primary)]"
                    >
                      {p}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {loadingHistory && (
              <div className="flex h-full items-center justify-center text-[var(--oc-text-secondary)]">
                <Loader2 className="mr-2 h-5 w-5 animate-spin" />
                加载历史中…
              </div>
            )}

            <div className="flex flex-col gap-4">
              {messages.map((m) => (
                <div
                  key={m.id}
                  className={cn(
                    "flex max-w-[85%] gap-3",
                    m.role === "user" ? "self-end flex-row-reverse" : "self-start"
                  )}
                >
                  <div
                    className={cn(
                      "flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-[11px] font-bold",
                      m.role === "user"
                        ? "bg-[var(--oc-bg-hover)] text-[var(--oc-text-secondary)]"
                        : "bg-[var(--oc-accent-soft)] text-[var(--oc-accent)]"
                    )}
                  >
                    {m.role === "user" ? "LZ" : "H"}
                  </div>
                  <div className="min-w-0">
                    <div
                      className={cn(
                        "rounded-[10px] border px-3.5 py-2.5 text-[13px] leading-[1.7] whitespace-pre-wrap",
                        m.role === "user"
                          ? "border-[rgba(201,168,108,0.22)] bg-[var(--oc-accent-soft)] text-[var(--oc-text-primary)]"
                          : "border-[var(--oc-border-subtle)] bg-[var(--oc-bg-elevated)] text-[var(--oc-text-primary)]"
                      )}
                    >
                      {m.content}
                    </div>
                    <div
                      className={cn(
                        "mt-1 text-[11px] text-[var(--oc-text-tertiary)]",
                        m.role === "user" ? "text-right" : "text-left"
                      )}
                    >
                      {formatTime(Date.now())}
                    </div>
                  </div>
                </div>
              ))}

              {loading && (
                <div className="flex max-w-[85%] gap-3 self-start">
                  <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[var(--oc-accent-soft)] text-[11px] font-bold text-[var(--oc-accent)]">
                    H
                  </div>
                  <div className="rounded-[10px] border border-[var(--oc-border-subtle)] bg-[var(--oc-bg-elevated)] px-3.5 py-2.5 text-[13px] text-[var(--oc-text-secondary)]">
                    <Loader2 className="mr-2 inline h-4 w-4 animate-spin" />
                    Hermes 思考中…
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* 输入区 */}
          <div className="shrink-0 border-t border-[var(--oc-border-subtle)] px-5 py-4">
            <div className="flex items-end gap-3">
              <Input
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="输入消息，让 Hermes 帮你处理…"
                disabled={loading}
                className="h-11 flex-1 rounded-[10px] border-[var(--oc-border-subtle)] bg-[var(--oc-bg-elevated)] px-4 text-[13px] text-[var(--oc-text-primary)] placeholder:text-[var(--oc-text-tertiary)] focus:border-[var(--oc-accent)] focus:ring-[var(--oc-accent-soft)] focus:ring-[3px]"
              />
              <Button
                onClick={sendMessage}
                disabled={loading || !input.trim()}
                className="h-11 gap-1.5 rounded-[10px] bg-[var(--oc-accent)] px-5 text-[13px] font-semibold text-[var(--oc-bg-root)] shadow-[0_1px_0_rgba(255,255,255,0.12)_inset,0_1px_2px_rgba(0,0,0,0.24)] transition-all hover:-translate-y-px hover:bg-[var(--oc-accent-hover)] hover:shadow-[0_2px_0_rgba(255,255,255,0.12)_inset,0_4px_16px_rgba(0,0,0,0.32)] active:translate-y-0 disabled:opacity-50"
              >
                {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                发送
              </Button>
            </div>
            <p className="mt-2 text-[11px] text-[var(--oc-text-tertiary)]">
              Hermes 会直接执行写入/阶段流转等操作，删除类工具默认不开放。
            </p>
          </div>
        </main>
      </div>
    </div>
  );
}
