"use client";

import * as React from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Search as SearchIcon, Loader2, Send, Plus, Trash2, History, Sparkles, Link2, Copy, Share2 } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { cn } from "@/lib/utils";

type Role = "user" | "assistant" | "system";

type ChatMessage = {
  id: string;
  role: Exclude<Role, "system">;
  content: string;
};

type Session = {
  id: string;
  title: string;
  createdAt: number;
  messages: ChatMessage[];
};

type UpstreamResponse = any;

const STORAGE_KEY = "quickSearch.sessions.v1";
const ACTIVE_KEY = "quickSearch.activeSessionId.v1";

function uid() {
  return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function safeJsonParse<T>(text: string, fallback: T): T {
  try {
    return JSON.parse(text) as T;
  } catch {
    return fallback;
  }
}

function getDefaultTitle(firstUserText: string) {
  const t = firstUserText.trim().replace(/\s+/g, " ");
  return t.length > 16 ? `${t.slice(0, 16)}…` : t || "新会话";
}

function formatDateTime(ts: number) {
  const d = new Date(ts);
  return `${d.getFullYear()}.${String(d.getMonth() + 1).padStart(2, "0")}.${String(d.getDate()).padStart(2, "0")} ${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

export default function QuickSearchPage() {
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [raw, setRaw] = useState<UpstreamResponse | null>(null);
  const [searchQuery, setSearchQuery] = useState("");

  const [sessions, setSessions] = useState<Session[]>([]);
  const [activeSessionId, setActiveSessionId] = useState<string>("");

  const listRef = useRef<HTMLDivElement | null>(null);

  const activeSession = useMemo(
    () => sessions.find((s) => s.id === activeSessionId) || null,
    [sessions, activeSessionId],
  );

  const messages = activeSession?.messages ?? [];

  const firstUserMessage = useMemo(
    () => messages.find((m) => m.role === "user")?.content || activeSession?.title || "",
    [messages, activeSession],
  );

  const lastAssistantContent = useMemo<string>(
    () => messages.filter((m) => m.role === "assistant").at(-1)?.content || "",
    [messages],
  );

  const filteredSessions = useMemo(() => {
    if (!searchQuery.trim()) return sessions;
    const q = searchQuery.toLowerCase();
    return sessions.filter((s) => s.title.toLowerCase().includes(q));
  }, [sessions, searchQuery]);

  // 初始化：从 localStorage 载入
  useEffect(() => {
    const saved = safeJsonParse<Session[]>(localStorage.getItem(STORAGE_KEY) || "[]", []);
    let active = (localStorage.getItem(ACTIVE_KEY) || "").trim();

    if (saved.length === 0) {
      const id = uid();
      const fresh: Session = { id, title: "新会话", createdAt: Date.now(), messages: [] };
      localStorage.setItem(STORAGE_KEY, JSON.stringify([fresh]));
      localStorage.setItem(ACTIVE_KEY, id);
      setSessions([fresh]);
      setActiveSessionId(id);
      return;
    }

    if (!active || !saved.some((s) => s.id === active)) {
      active = saved[0].id;
      localStorage.setItem(ACTIVE_KEY, active);
    }

    setSessions(saved);
    setActiveSessionId(active);
  }, []);

  // 持久化 sessions
  useEffect(() => {
    if (sessions.length === 0) return;
    localStorage.setItem(STORAGE_KEY, JSON.stringify(sessions));
  }, [sessions]);

  // 持久化 activeSessionId
  useEffect(() => {
    if (!activeSessionId) return;
    localStorage.setItem(ACTIVE_KEY, activeSessionId);
  }, [activeSessionId]);

  const canSend = useMemo(() => input.trim().length > 0 && !loading, [input, loading]);

  const scrollToBottom = useCallback(() => {
    const el = listRef.current;
    if (!el) return;
    el.scrollTop = el.scrollHeight;
  }, []);

  const newSession = useCallback(() => {
    const id = uid();
    const s: Session = { id, title: "新会话", createdAt: Date.now(), messages: [] };
    setSessions((prev) => [s, ...prev]);
    setActiveSessionId(id);
    setError(null);
    setRaw(null);
    setInput("");
    setTimeout(scrollToBottom, 0);
  }, [scrollToBottom]);

  const deleteSession = useCallback(
    (id: string) => {
      setSessions((prev) => {
        const next = prev.filter((s) => s.id !== id);
        const nextActive = id === activeSessionId ? next[0]?.id || "" : activeSessionId;
        setActiveSessionId(nextActive);
        return next.length ? next : [{ id: uid(), title: "新会话", createdAt: Date.now(), messages: [] }];
      });
    },
    [activeSessionId],
  );

  const updateActiveMessages = useCallback(
    (updater: (prev: ChatMessage[]) => ChatMessage[]) => {
      setSessions((prev) =>
        prev.map((s) => (s.id === activeSessionId ? { ...s, messages: updater(s.messages) } : s)),
      );
    },
    [activeSessionId],
  );

  const maybeSetTitle = useCallback(
    (firstUserText: string) => {
      setSessions((prev) =>
        prev.map((s) => {
          if (s.id !== activeSessionId) return s;
          if (s.title && s.title !== "新会话") return s;
          if (s.messages.length > 0) return s;
          return { ...s, title: getDefaultTitle(firstUserText) };
        }),
      );
    },
    [activeSessionId],
  );

  const send = useCallback(async () => {
    const text = input.trim();
    if (!text || loading) return;
    if (!activeSessionId) return;

    setInput("");
    setLoading(true);
    setError(null);
    setRaw(null);

    const userMsg: ChatMessage = { id: uid(), role: "user", content: text };
    const assistantId = uid();

    // 如果是该会话第一条消息，用它做标题
    if ((activeSession?.messages?.length ?? 0) === 0) {
      maybeSetTitle(text);
    }

    updateActiveMessages((prev) => [...prev, userMsg, { id: assistantId, role: "assistant", content: "" }]);

    const reqMessages = [
      { role: "system", content: "你是一个快速搜索助手。用对话形式回答，尽量简洁清晰。" },
      ...messages.map((m) => ({ role: m.role, content: m.content })),
      { role: "user", content: text },
    ];

    try {
      const payload = {
        model: "gpt-3.5-turbo",
        stream: true,
        messages: reqMessages,
        temperature: 0.2,
      };

      const resp = await fetch("/api/quick-search", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (!resp.ok || !resp.body) {
        const t = await resp.text().catch(() => "");
        const j = t ? safeJsonParse<any>(t, null) : null;
        const msg = (j && (j.error?.message || j.error || j.message)) || t || `HTTP ${resp.status}`;
        throw new Error(msg);
      }

      const reader = resp.body.getReader();
      const decoder = new TextDecoder("utf-8");
      let buffer = "";
      let done = false;

      while (!done) {
        const { value, done: d } = await reader.read();
        done = d;
        if (value) buffer += decoder.decode(value, { stream: true });

        const parts = buffer.split("\n\n");
        buffer = parts.pop() || "";

        for (const part of parts) {
          const line = part
            .split("\n")
            .map((l) => l.trim())
            .find((l) => l.startsWith("data:"));
          if (!line) continue;

          const dataStr = line.replace(/^data:\s?/, "").trim();
          if (!dataStr) continue;
          if (dataStr === "[DONE]") {
            done = true;
            break;
          }

          let evt: any;
          try {
            evt = JSON.parse(dataStr);
          } catch {
            continue;
          }

          const delta = evt?.choices?.[0]?.delta?.content;
          if (typeof delta === "string" && delta.length > 0) {
            updateActiveMessages((prev) =>
              prev.map((m) => (m.id === assistantId ? { ...m, content: m.content + delta } : m)),
            );
          }
        }
      }

      setRaw({ ok: true });
    } catch (e: any) {
      // 移除空 assistant 气泡
      updateActiveMessages((prev) => prev.filter((m) => m.id !== assistantId));
      setError(e?.message || "请求失败");
    } finally {
      setLoading(false);
      setTimeout(scrollToBottom, 0);
    }
  }, [input, loading, activeSessionId, activeSession?.messages?.length, maybeSetTitle, updateActiveMessages, messages, scrollToBottom]);

  return (
    <div className="flex h-[calc(100vh-64px)] flex-col p-7">
      {/* Header */}
      <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-[var(--oc-text-primary)]">快速搜索</h1>
          <p className="mt-1.5 text-[13px] text-[var(--oc-text-secondary)]">
            轻量 AI 搜索，快速定位项目、任务、知识与决策
          </p>
        </div>
        <Button
          variant="ghost"
          size="sm"
          className="h-9 gap-1.5 rounded-[10px] border border-[var(--oc-border-subtle)] bg-[var(--oc-bg-elevated)] px-3 text-[13px] font-semibold text-[var(--oc-text-primary)] hover:border-[var(--oc-border-strong)] hover:bg-[var(--oc-bg-hover)]"
        >
          <History className="h-4 w-4" />
          搜索历史
        </Button>
      </div>

      {/* 主布局 */}
      <div className="grid flex-1 gap-5 overflow-hidden md:grid-cols-[280px_1fr]">
        {/* 搜索列表 */}
        <aside className="flex h-full flex-col overflow-hidden rounded-[14px] border border-[var(--oc-border-subtle)] bg-[var(--oc-bg-surface)]">
          <div className="shrink-0 border-b border-[var(--oc-border-subtle)] p-3.5">
            <div className="flex items-center gap-2 rounded-[10px] border border-[var(--oc-border-subtle)] bg-[var(--oc-bg-elevated)] px-3 py-2 text-[var(--oc-text-secondary)] transition-all focus-within:border-[var(--oc-border-strong)] focus-within:bg-[var(--oc-bg-elevated)] focus-within:text-[var(--oc-text-primary)] hover:border-[var(--oc-border-strong)]">
              <SearchIcon className="h-3.5 w-3.5 shrink-0" />
              <input
                type="search"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="输入问题开始搜索…"
                className="min-w-0 flex-1 bg-transparent text-[13px] text-[var(--oc-text-primary)] placeholder:text-[var(--oc-text-tertiary)] outline-none"
              />
            </div>
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto">
            {filteredSessions.length === 0 ? (
              <div className="py-8 text-center text-sm text-[var(--oc-text-secondary)]">暂无搜索记录</div>
            ) : (
              <div className="p-2">
                {filteredSessions.map((s) => (
                  <div
                    key={s.id}
                    onClick={() => setActiveSessionId(s.id)}
                    className={cn(
                      "cursor-pointer rounded-lg border border-transparent px-3 py-2.5 transition-all",
                      s.id === activeSessionId
                        ? "border-[var(--oc-border-strong)] bg-[var(--oc-bg-active)]"
                        : "hover:border-[var(--oc-border-subtle)] hover:bg-[var(--oc-bg-elevated)]"
                    )}
                  >
                    <div className="truncate text-[13px] font-semibold text-[var(--oc-text-primary)]">
                      {s.title || "新会话"}
                    </div>
                    <div className="mt-1 text-[11px] text-[var(--oc-text-secondary)]">
                      {s.messages.length} 条消息 · {formatDateTime(s.createdAt)}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </aside>

        {/* 详情区 */}
        <main className="flex h-full flex-col overflow-hidden rounded-[14px] border border-[var(--oc-border-subtle)] bg-[var(--oc-bg-surface)]">
          {/* 详情头部 */}
          <div className="flex shrink-0 items-center justify-between border-b border-[var(--oc-border-subtle)] px-5 py-4">
            <div className="min-w-0 flex-1">
              <h2 className="truncate text-[15px] font-bold text-[var(--oc-text-primary)]">
                {firstUserMessage || "开始一次新搜索"}
              </h2>
              <div className="mt-1 text-xs text-[var(--oc-text-secondary)]">
                {activeSession ? (
                  <>
                    基于 {messages.filter((m) => m.role === "user").length} 轮对话生成 · {formatDateTime(activeSession.createdAt)}
                  </>
                ) : (
                  "选择左侧搜索记录或输入新问题"
                )}
              </div>
            </div>
            <div className="flex shrink-0 items-center gap-2 pl-4">
              <Button
                variant="ghost"
                size="sm"
                className="h-8 gap-1.5 rounded-lg border border-[var(--oc-border-subtle)] bg-[var(--oc-bg-elevated)] px-3 text-xs font-semibold text-[var(--oc-text-primary)] hover:border-[var(--oc-border-strong)] hover:bg-[var(--oc-bg-hover)]"
              >
                <Copy className="h-3.5 w-3.5" />
                复制
              </Button>
              <Button
                variant="ghost"
                size="sm"
                className="h-8 gap-1.5 rounded-lg bg-[var(--oc-accent)] px-3 text-xs font-semibold text-[var(--oc-bg-root)] shadow-[0_1px_0_rgba(255,255,255,0.12)_inset,0_1px_2px_rgba(0,0,0,0.24)] transition-all hover:-translate-y-px hover:bg-[var(--oc-accent-hover)] hover:shadow-[0_2px_0_rgba(255,255,255,0.12)_inset,0_4px_16px_rgba(0,0,0,0.32)] active:translate-y-0"
              >
                <Share2 className="h-3.5 w-3.5" />
                分享
              </Button>
            </div>
          </div>

          {/* 详情主体 */}
          <div ref={listRef} className="min-h-0 flex-1 overflow-y-auto p-5">
            {messages.length === 0 && !loading ? (
              <div className="flex h-full flex-col items-center justify-center text-[var(--oc-text-secondary)]">
                <div className="mb-3 flex h-14 w-14 items-center justify-center rounded-full bg-[var(--oc-accent-soft)]">
                  <SearchIcon className="h-7 w-7 text-[var(--oc-accent)]" />
                </div>
                <p className="text-sm font-medium">输入问题开始搜索</p>
                <p className="mt-1 text-xs text-[var(--oc-text-tertiary)]">AI 会基于项目数据生成简洁回答</p>
              </div>
            ) : (
              <div className="space-y-4">
                {/* AI 回答 */}
                <Card className="rounded-[14px] border-[var(--oc-border-subtle)] bg-[var(--oc-bg-surface)]">
                  <CardHeader className="flex flex-row items-center gap-2 px-5 py-4">
                    <Sparkles className="h-4 w-4 text-[var(--oc-accent)]" />
                    <CardTitle className="text-[13px] font-bold text-[var(--oc-text-primary)]">AI 回答</CardTitle>
                  </CardHeader>
                  <CardContent className="px-5 pb-5 pt-0">
                    {lastAssistantContent ? (
                      <div className="text-[14px] leading-[1.8] text-[var(--oc-text-primary)] whitespace-pre-wrap">
                        {lastAssistantContent}
                        {loading && <span className="ml-0.5 inline-block h-4 w-2 animate-pulse bg-[var(--oc-accent)]" />}
                      </div>
                    ) : (
                      <div className="flex items-center gap-2 text-sm text-[var(--oc-text-secondary)]">
                        <Loader2 className="h-4 w-4 animate-spin" />
                        正在生成回答…
                      </div>
                    )}
                  </CardContent>
                </Card>

                {/* 参考来源占位 */}
                <div className="rounded-[14px] border border-[var(--oc-border-subtle)] bg-[var(--oc-bg-surface)]">
                  <div className="flex flex-row items-center gap-2 px-5 py-4">
                    <Link2 className="h-4 w-4 text-[var(--oc-accent)]" />
                    <span className="text-[13px] font-bold text-[var(--oc-text-primary)]">参考来源</span>
                  </div>
                  <div className="px-5 pb-5 pt-0">
                    <div className="rounded-[10px] border border-dashed border-[var(--oc-border-subtle)] bg-[var(--oc-bg-elevated)] px-4 py-6 text-center text-sm text-[var(--oc-text-secondary)]">
                      来源信息将在接入知识库后展示
                    </div>
                  </div>
                </div>

                {error && (
                  <div className="rounded-[10px] border border-[rgba(201,123,109,0.25)] bg-[var(--oc-error-soft)] px-3 py-2 text-sm text-[var(--oc-error)]">
                    {error}
                  </div>
                )}

                {raw && (
                  <details className="text-xs text-[var(--oc-text-secondary)]">
                    <summary className="cursor-pointer text-[var(--oc-text-secondary)] hover:text-[var(--oc-text-primary)]">
                      查看原始响应
                    </summary>
                    <pre className="mt-2 overflow-auto rounded-[10px] border border-[var(--oc-border-subtle)] bg-[var(--oc-bg-root)] p-3 text-[var(--oc-text-secondary)]">
                      {JSON.stringify(raw, null, 2)}
                    </pre>
                  </details>
                )}
              </div>
            )}
          </div>

          {/* 输入区 */}
          <div className="shrink-0 border-t border-[var(--oc-border-subtle)] px-5 py-4">
            <div className="flex items-end gap-3">
              <Input
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") send();
                }}
                placeholder="输入问题后回车发送…"
                disabled={loading}
                className="h-11 flex-1 rounded-[10px] border-[var(--oc-border-subtle)] bg-[var(--oc-bg-elevated)] px-4 text-[13px] text-[var(--oc-text-primary)] placeholder:text-[var(--oc-text-tertiary)] focus:border-[var(--oc-accent)] focus:ring-[var(--oc-accent-soft)] focus:ring-[3px]"
              />
              <Button
                onClick={send}
                disabled={!canSend}
                className="h-11 gap-1.5 rounded-[10px] bg-[var(--oc-accent)] px-5 text-[13px] font-semibold text-[var(--oc-bg-root)] shadow-[0_1px_0_rgba(255,255,255,0.12)_inset,0_1px_2px_rgba(0,0,0,0.24)] transition-all hover:-translate-y-px hover:bg-[var(--oc-accent-hover)] hover:shadow-[0_2px_0_rgba(255,255,255,0.12)_inset,0_4px_16px_rgba(0,0,0,0.32)] active:translate-y-0 disabled:opacity-50"
              >
                {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                发送
              </Button>
            </div>
          </div>
        </main>
      </div>
    </div>
  );
}
