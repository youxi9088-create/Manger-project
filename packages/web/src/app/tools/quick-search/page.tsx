"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Search as SearchIcon, Loader2, Send, Plus, Trash2 } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

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

type UpstreamResponse = unknown;

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

export default function QuickSearchPage() {
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [raw, setRaw] = useState<UpstreamResponse | null>(null);

  const [sessions, setSessions] = useState<Session[]>([]);
  const [activeSessionId, setActiveSessionId] = useState<string>("");

  const listRef = useRef<HTMLDivElement | null>(null);

  const activeSession = useMemo(
    () => sessions.find((s) => s.id === activeSessionId) || null,
    [sessions, activeSessionId],
  );

  const messages = activeSession?.messages ?? [];

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
          if (s.messages.length > 0) return s; // 已有消息则不改（避免并发）
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
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">快速搜索</h1>
        <p className="text-muted-foreground mt-1">以对话的方式快速提问与获取答案（自动保存会话）</p>
      </div>

      <div className="grid gap-4 md:grid-cols-[280px_1fr]">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0">
            <CardTitle className="text-base">会话列表</CardTitle>
            <Button variant="outline" size="sm" className="gap-2" onClick={newSession}>
              <Plus className="h-4 w-4" />
              新建
            </Button>
          </CardHeader>
          <CardContent className="space-y-2">
            <div className="max-h-[60vh] overflow-auto space-y-2 pr-1">
              {sessions.map((s) => (
                <div
                  key={s.id}
                  className={
                    s.id === activeSessionId
                      ? "flex items-center gap-2 rounded-md border bg-muted px-2 py-2"
                      : "flex items-center gap-2 rounded-md border px-2 py-2"
                  }
                >
                  <button
                    type="button"
                    className="flex-1 text-left text-sm"
                    onClick={() => setActiveSessionId(s.id)}
                    title={s.title}
                  >
                    <div className="truncate font-medium">{s.title || "新会话"}</div>
                    <div className="truncate text-xs text-muted-foreground">{s.messages.length} 条消息</div>
                  </button>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8"
                    onClick={() => deleteSession(s.id)}
                    aria-label="删除会话"
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <SearchIcon className="h-5 w-5" />
              对话
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div ref={listRef} className="h-[52vh] overflow-auto rounded-md border bg-background p-4 space-y-3">
              {messages.length === 0 ? <div className="text-sm text-muted-foreground">输入问题开始对话。</div> : null}

              {messages.map((m) => (
                <div key={m.id} className={m.role === "user" ? "flex justify-end" : "flex justify-start"}>
                  <div
                    className={
                      m.role === "user"
                        ? "max-w-[85%] rounded-2xl bg-primary px-3 py-2 text-primary-foreground whitespace-pre-wrap"
                        : "max-w-[85%] rounded-2xl bg-muted px-3 py-2 text-foreground whitespace-pre-wrap"
                    }
                  >
                    {m.content}
                  </div>
                </div>
              ))}

              {loading ? (
                <div className="flex justify-start">
                  <div className="max-w-[85%] rounded-2xl bg-muted px-3 py-2 text-foreground inline-flex items-center gap-2">
                    <Loader2 className="h-4 w-4 animate-spin" />
                    正在思考…
                  </div>
                </div>
              ) : null}
            </div>

            <div className="flex gap-2">
              <Input
                value={input}
                placeholder="输入问题后回车发送..."
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") send();
                }}
              />
              <Button onClick={send} disabled={!canSend} className="gap-2">
                <Send className="h-4 w-4" />
                发送
              </Button>
            </div>

            {error ? <div className="text-sm text-destructive whitespace-pre-wrap">{error}</div> : null}

            {raw ? (
              <details className="text-xs text-muted-foreground">
                <summary className="cursor-pointer">查看原始响应</summary>
                <pre className="mt-2 overflow-auto rounded-md bg-muted p-3">{JSON.stringify(raw, null, 2)}</pre>
              </details>
            ) : null}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
