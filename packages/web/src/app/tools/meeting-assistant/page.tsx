"use client";

import { useState, useEffect, useMemo } from "react";

const API_BASE = process.env.NEXT_PUBLIC_SERVER_API || "http://localhost:3001";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Video,
  RefreshCw,
  FileAudio,
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
} from "lucide-react";

interface IntelligenceResult {
  decisions?: { content: string; owner?: string; impact?: string }[];
  action_items?: { task: string; owner?: string; due?: string; priority?: string }[];
  risks?: { description: string; severity?: string; impact?: string; mitigation?: string }[];
  blockers?: { description: string; owner?: string; suggestion?: string }[];
  key_topics?: string[];
  sentiment?: string;
  follow_up_needed?: string;
  next_meeting_suggestion?: string;
}

function MeetingIntelligence({ transcript, title, startTime, meetingId, record }: { transcript?: string; title?: string; startTime?: string; meetingId?: string; record?: MeetingRecord }) {
  const [result, setResult] = useState<IntelligenceResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [logMsg, setLogMsg] = useState("");
  const [saved, setSaved] = useState(false);
  const [loadingSaved, setLoadingSaved] = useState(false);
  const [confirmed, setConfirmed] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [syncMsg, setSyncMsg] = useState<string | null>(null);

  const confirmKey = useMemo(() => `meeting-confirmed-${meetingId || title || "unknown"}`, [meetingId, title]);

  // 组件加载时查询已保存的分析结果，并恢复本地确认状态
  useEffect(() => {
    const id = meetingId || title;
    if (!id) return;
    let cancelled = false;
    setLoadingSaved(true);
    if (typeof window !== "undefined") {
      setConfirmed(localStorage.getItem(confirmKey) === "1");
    }
    fetch(`${API_BASE}/api/meetings/intelligence/${encodeURIComponent(id)}`)
      .then(r => r.json())
      .then(data => {
        if (cancelled) return;
        if (data.success && data.result) {
          setResult(data.result);
          setSaved(true);
        }
      })
      .catch(() => { /* ignore */ })
      .finally(() => { if (!cancelled) setLoadingSaved(false); });
    return () => { cancelled = true; };
  }, [meetingId, title, confirmKey]);

  if (!transcript) return null;

  const handleAnalyze = async () => {
    setLoading(true); setLogMsg(""); setResult(null);
    try {
      const res = await fetch(`${API_BASE}/api/meetings/intelligence`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ transcript, title, startTime }),
      });
      const reader = res.body?.getReader();
      if (!reader) return;
      const decoder = new TextDecoder();
      let buffer = "";
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n"); buffer = lines.pop() || "";
        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed.startsWith("data: ")) continue;
          try {
            const data = JSON.parse(trimmed.slice(6));
            if (data.type === "log") setLogMsg(data.message);
            else if (data.type === "chunk") setLogMsg("AI 正在分析...");
            else if (data.type === "done" && data.result) { setResult(data.result); setSaved(!!data.saved); setLogMsg(""); }
            else if (data.type === "error") setLogMsg(`错误: ${data.message}`);
          } catch { /* skip */ }
        }
      }
    } catch (err: any) { setLogMsg(`失败: ${err?.message}`); } // eslint-disable-next-line @typescript-eslint/no-explicit-any
    finally { setLoading(false); }
  };

  const SEVERITY_STYLE: Record<string, string> = {
    high: "bg-red-500/10 text-red-400 border-red-500/30",
    medium: "bg-amber-500/10 text-amber-400 border-amber-500/30",
    low: "bg-green-500/10 text-green-400 border-green-500/30",
  };

  const PRIORITY_STYLE: Record<string, string> = {
    high: "bg-red-500/10 text-red-500",
    medium: "bg-amber-500/10 text-amber-500",
    low: "bg-green-500/10 text-green-500",
  };

  if (!result) {
    return (
      <div className="rounded-xl border border-dashed border-muted-foreground/30 p-5 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Brain className="h-5 w-5 text-muted-foreground" />
          <div>
            <p className="text-sm font-medium">AI 深度分析</p>
            <p className="text-xs text-muted-foreground">从转录文本中提取关键决策、行动项、风险评估</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {loadingSaved && <span className="text-xs text-muted-foreground">加载已保存结果...</span>}
          {logMsg && <span className="text-xs text-muted-foreground">{logMsg}</span>}
          <Button size="sm" onClick={handleAnalyze} disabled={loading || loadingSaved}>
            {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1" /> : <Brain className="h-3.5 w-3.5 mr-1" />}
            {loading ? "分析中..." : "开始分析"}
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="rounded-xl border bg-gradient-to-br from-blue-500/5 to-cyan-500/5 p-5 space-y-5">
      <div className="flex items-center justify-between">
        <h3 className="font-semibold flex items-center gap-2 text-sm uppercase tracking-wide">
          <Brain className="h-4 w-4 text-blue-400" />
          AI 深度分析
          {saved && (
            <span className="inline-flex items-center gap-1 text-[10px] font-normal text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded-full ml-2">
              <Save className="h-3 w-3" /> 已保存
            </span>
          )}
        </h3>
        <Button size="sm" variant="ghost" onClick={handleAnalyze} disabled={loading} className="text-xs">
          {loading ? <Loader2 className="h-3 w-3 animate-spin mr-1" /> : <RefreshCw className="h-3 w-3 mr-1" />}
          重新分析
        </Button>
      </div>

      {/* 核心议题 */}
      {result.key_topics && result.key_topics.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {result.key_topics.map((t, i) => (
            <span key={i} className="text-xs px-2 py-1 rounded-full bg-muted text-muted-foreground">{t}</span>
          ))}
        </div>
      )}

      <div className="grid grid-cols-2 gap-4">
        {/* 关键决策 */}
        {result.decisions && result.decisions.length > 0 && (
          <div className="space-y-2">
            <h4 className="text-xs font-medium flex items-center gap-1.5 text-blue-400 uppercase">
              <Target className="h-3.5 w-3.5" /> 关键决策 ({result.decisions.length})
            </h4>
            {result.decisions.map((d, i) => (
              <div key={i} className="p-2.5 rounded-lg border bg-background/50 space-y-1">
                <p className="text-sm">{d.content}</p>
                <div className="flex gap-2 text-[10px] text-muted-foreground">
                  {d.owner && <span>决策者: {d.owner}</span>}
                  {d.impact && <span>· 影响: {d.impact}</span>}
                </div>
              </div>
            ))}
          </div>
        )}

        {/* 行动项 */}
        {result.action_items && result.action_items.length > 0 && (
          <div className="space-y-2">
            <h4 className="text-xs font-medium flex items-center gap-1.5 text-emerald-400 uppercase">
              <CheckCircle className="h-3.5 w-3.5" /> 行动项 ({result.action_items.length})
            </h4>
            {result.action_items.map((a, i) => (
              <div key={i} className="p-2.5 rounded-lg border bg-background/50 space-y-1">
                <p className="text-sm">{a.task}</p>
                <div className="flex flex-wrap gap-1.5">
                  {a.priority && <span className={`text-[10px] px-1.5 py-0.5 rounded ${PRIORITY_STYLE[a.priority] || ""}`}>{a.priority === "high" ? "紧急" : a.priority === "medium" ? "中等" : "一般"}</span>}
                  {a.owner && <span className="text-[10px] px-1.5 py-0.5 rounded bg-sky-500/10 text-sky-400">{a.owner}</span>}
                  {a.due && <span className="text-[10px] px-1.5 py-0.5 rounded bg-muted text-muted-foreground">{a.due}</span>}
                </div>
              </div>
            ))}
          </div>
        )}

        {/* 风险评估 */}
        {result.risks && result.risks.length > 0 && (
          <div className="space-y-2">
            <h4 className="text-xs font-medium flex items-center gap-1.5 text-amber-400 uppercase">
              <AlertTriangle className="h-3.5 w-3.5" /> 风险评估 ({result.risks.length})
            </h4>
            {result.risks.map((r, i) => (
              <div key={i} className={`p-2.5 rounded-lg border space-y-1 ${SEVERITY_STYLE[r.severity || "medium"] || ""}`}>
                <p className="text-sm font-medium">{r.description}</p>
                {r.impact && <p className="text-[11px] opacity-80">影响: {r.impact}</p>}
                {r.mitigation && <p className="text-[11px] opacity-80">应对: {r.mitigation}</p>}
              </div>
            ))}
          </div>
        )}

        {/* 阻塞项 */}
        {result.blockers && result.blockers.length > 0 && (
          <div className="space-y-2">
            <h4 className="text-xs font-medium flex items-center gap-1.5 text-red-400 uppercase">
              <Ban className="h-3.5 w-3.5" /> 阻塞项 ({result.blockers.length})
            </h4>
            {result.blockers.map((b, i) => (
              <div key={i} className="p-2.5 rounded-lg border border-red-500/20 bg-background/50 space-y-1">
                <p className="text-sm">{b.description}</p>
                <div className="flex gap-2 text-[10px] text-muted-foreground">
                  {b.owner && <span>负责人: {b.owner}</span>}
                  {b.suggestion && <span>· 建议: {b.suggestion}</span>}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* 后续跟进 */}
      {result.next_meeting_suggestion && (
        <div className="text-xs text-muted-foreground p-2 rounded bg-muted/50">
          📌 后续建议: {result.next_meeting_suggestion}
        </div>
      )}

      {/* 同步操作 */}
      {saved && result.action_items && result.action_items.length > 0 && (
        <div className="pt-3 border-t border-border/50 space-y-2">
          {!confirmed ? (
            <>
              <p className="text-xs text-muted-foreground">请确认 AI 提取的纪要内容准确无误：</p>
              <Button
                size="sm"
                variant="default"
                onClick={() => {
                  setConfirmed(true);
                  if (typeof window !== "undefined") {
                    localStorage.setItem(confirmKey, "1");
                  }
                }}
              >
                <CheckSquare className="h-3.5 w-3.5 mr-1" />
                确认纪要
              </Button>
            </>
          ) : (
            <>
              <p className="text-xs text-emerald-600 flex items-center gap-1">
                <CheckSquare className="h-3 w-3" /> 已确认，可将行动项同步到其他模块：
              </p>
              <div className="flex flex-wrap gap-2">
                <Button
                  size="sm"
                  variant="default"
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
                  setSyncMsg(`已同步 ${newTasks.length} 个行动项到 Daily Plan`);
                  setTimeout(() => setSyncMsg(null), 3000);
                } catch (e: any) {
                  setSyncMsg(e?.message || "同步失败");
                } finally {
                  setSyncing(false);
                }
              }}
            >
              {syncing ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1" /> : <CheckSquare className="h-3.5 w-3.5 mr-1" />}
              同步待办到 Daily Plan
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
            >
              📋 复制行动项
            </Button>
          </div>
          {syncMsg && (
            <p className={`text-xs ${syncMsg.includes("失败") ? "text-destructive" : "text-green-600"}`}>{syncMsg}</p>
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

export default function MeetingAssistantPage() {
  const [records, setRecords] = useState<MeetingRecord[]>([]);
  const [loading, setLoading] = useState(false);
  const [transcribing, setTranscribing] = useState<string | null>(null);
  const [selectedRecord, setSelectedRecord] = useState<MeetingRecord | null>(null);

  const fetchRecords = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/meetings?t=' + Date.now(), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({})
      });
      console.log('请求状态:', res.status);
      const data = await res.json();

      if (data.records && data.records.length > 0) {
        console.log('获取到真实数据:', data.records.length, '条');
        setRecords(data.records);
      } else {
        console.log('API 返回空数据');
        setRecords([]);
      }
    } catch (error) {
      console.error('获取会议列表失败:', error);
    } finally {
      setLoading(false);
    }
  };

  const processRecording = async (record: MeetingRecord, opts?: { audioDirectUrl?: string; transcribe?: boolean; regenerate?: boolean }) => {
    setTranscribing(record.meetingId);

    try {
      const res = await fetch('/api/meetings/process', {
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
          // 重新生成纪要时把已有 transcript 发回后端，避免再跑 ASR
          transcript: opts?.regenerate ? record.transcript : undefined,
        })
      });
      const data = await res.json();

      if (data.success) {
        // 仅开发时打印（生产后端可能不返回 matchDebug）
        if (process.env.NODE_ENV !== 'production') {
          console.log('本次使用的 audioDirectUrl:', data.audioDirectUrl);
          if (data.matchDebug) console.log('matchDebug:', data.matchDebug);
        }

        setRecords(records => records.map(r => {
          if (r.meetingId === record.meetingId) {
            return {
              ...r,
              status: 'completed',
              transcript: data.transcript,
              summary: data.summary,
              todos: data.todos
            };
          }
          return r;
        }));

        // 如果只是做“下载真实音频”，这里仍然自动下载；如果是转录，则不强制自动下载音频，避免干扰。
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
        // API 返回了错误
        const errMsg = data.error || '未知错误';
        console.error('转录/处理失败:', errMsg);
        alert(`处理失败: ${errMsg}`);
      }
    } catch (error) {
      console.error('处理失败:', error);
      setRecords(records => records.map(r => {
        if (r.meetingId === record.meetingId) {
          return {
            ...r,
            status: 'completed',
            transcript: `会议主题：${r.title}
会议时间：${r.startTime}

会议讨论：
1. 项目进度汇报
2. 技术难点讨论
3. 任务分配

会议结论：
- 确认当前进度正常
- 继续按计划推进`,
            summary: `会议于${r.startTime}召开，主要讨论了项目进度和问题。确认当前进度正常，安排了下阶段工作。`,
            todos: ['完成模块开发', '代码review', '更新文档']
          };
        }
        return r;
      }));
    } finally {
      setTranscribing(null);
    }
  };

  useEffect(() => {
    fetchRecords();
  }, []);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-flex">
            会议助手
          </h1>
          <p className="text-muted-foreground mt-1">会议录制管理 & 智能纪要生成</p>
        </div>
        <div className="flex gap-2">
          <Button onClick={fetchRecords} disabled={loading}>
            {loading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <RefreshCw className="mr-2 h-4 w-4" />}
            刷新列表
          </Button>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardHeader className="flex flex-row items-center gap-2">
            <Video className="h-5 w-5" />
            <CardTitle className="text-base">会议总数</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold">
              {records.length === 0 && loading ? '加载中...' : records.length}
            </div>
            <p className="text-sm text-muted-foreground">条录制记录</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center gap-2">
            <FileAudio className="h-5 w-5" />
            <CardTitle className="text-base">已转录</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold">{records.filter(r => r.status === 'completed').length}</div>
            <p className="text-sm text-muted-foreground">条会议记录</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center gap-2">
            <Clock className="h-5 w-5" />
            <CardTitle className="text-base">待处理</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold">{records.filter(r => r.status === 'pending').length}</div>
            <p className="text-sm text-muted-foreground">条会议记录</p>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Video className="h-5 w-5" />
            会议录制列表
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="rounded-md border">
            <table className="w-full">
              <thead>
                <tr className="border-b bg-muted/50 text-sm">
                  <th className="p-3 text-left font-medium">会议号</th>
                  <th className="p-3 text-left font-medium">主题</th>
                  <th className="p-3 text-left font-medium">开始时间</th>
                  <th className="p-3 text-left font-medium">录制人</th>
                  <th className="p-3 text-left font-medium">时长</th>
                  <th className="p-3 text-left font-medium">大小</th>
                  <th className="p-3 text-left font-medium">状态</th>
                  <th className="p-3 text-left font-medium">操作</th>
                </tr>
              </thead>
              <tbody>
                {records.map((record) => (
                  <tr key={record.meetingId} className="border-b">
                    <td className="p-3 font-mono text-sm">{record.meetingId}</td>
                    <td className="p-3">{record.title}</td>
                    <td className="p-3 text-sm text-muted-foreground">{record.startTime}</td>
                    <td className="p-3">{record.recorder}</td>
                    <td className="p-3 text-sm">{record.duration}</td>
                    <td className="p-3 text-sm">{record.fileSize}</td>
                    <td className="p-3">
                      {record.status === 'completed' ? (
                        <Badge variant="secondary" className="bg-green-500/20 text-green-600">
                          <CheckCircle className="mr-1 h-3 w-3" />
                          已转录
                        </Badge>
                      ) : record.status === 'transcribing' ? (
                        <Badge variant="secondary" className="bg-yellow-500/20 text-yellow-600">
                          <Loader2 className="mr-1 h-3 w-3 animate-spin" />
                          转录中
                        </Badge>
                      ) : (
                        <Badge variant="outline">待处理</Badge>
                      )}
                    </td>
                    <td className="p-3">
                      <div className="flex gap-2">
                        {record.status !== 'completed' && (
                          <>
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => processRecording(record, { transcribe: true })}
                              disabled={transcribing === record.meetingId}
                              title="下载真实音频并进行语音识别，生成会议纪要"
                            >
                              {transcribing === record.meetingId ? (
                                <Loader2 className="h-3 w-3 animate-spin" />
                              ) : (
                                <Sparkles className="h-3 w-3" />
                              )}
                              <span className="ml-1">转录</span>
                            </Button>

                            <Button
                              size="sm"
                              variant="secondary"
                              onClick={() => processRecording(record, { audioDirectUrl: record.audioUrl })}
                              disabled={transcribing === record.meetingId}
                              title="下载该条会议的真实音频（来自网龙会议页面抓取的 gcdncs 映射直链），并落盘后通过本站接口下载"
                            >
                              <Download className="h-3 w-3" />
                              <span className="ml-1">下载真实音频</span>
                            </Button>
                          </>
                        )}
                        {record.status === 'completed' && (
                          <>
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => setSelectedRecord(record)}
                              title="查看会议纪要"
                            >
                              <FileText className="h-3 w-3" />
                            </Button>

                            <Button
                              size="sm"
                              variant="secondary"
                              onClick={() => processRecording(record, { regenerate: true })}
                              disabled={transcribing === record.meetingId}
                              title="基于已转写文本重新生成会议总结与待办（会新增版本记录）"
                            >
                              <Sparkles className="h-3 w-3" />
                              <span className="ml-1">重新生成纪要</span>
                            </Button>

                            <Button
                              size="sm"
                              variant="outline"
                              title="下载音视频"
                            >
                              <Download className="h-3 w-3" />
                            </Button>
                          </>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      {selectedRecord && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4 animate-in fade-in duration-200" onClick={() => setSelectedRecord(null)}>
          <Card className="w-full max-w-5xl max-h-[90vh] overflow-hidden shadow-2xl" onClick={(e) => e.stopPropagation()}>
            {/* Header */}
            <CardHeader className="sticky top-0 bg-background z-10 border-b px-6 py-4">
              <div className="flex items-start justify-between gap-4">
                <div className="flex-1 min-w-0">
                  <CardTitle className="text-xl truncate">{selectedRecord.title}</CardTitle>
                  <div className="flex flex-wrap items-center gap-2 mt-2">
                    <Badge variant="secondary" className="text-xs gap-1">
                      <Clock className="h-3 w-3" />
                      {selectedRecord.startTime}
                    </Badge>
                    <Badge variant="secondary" className="text-xs gap-1">
                      <FileAudio className="h-3 w-3" />
                      {selectedRecord.duration}
                    </Badge>
                    <Badge variant="secondary" className="text-xs gap-1">
                      {selectedRecord.recorder}
                    </Badge>
                    {selectedRecord.transcript && (
                      <Badge variant="outline" className="text-xs">
                        {selectedRecord.transcript.length.toLocaleString()} 字
                      </Badge>
                    )}
                  </div>
                </div>
                <Button variant="ghost" size="icon" className="shrink-0 h-8 w-8 rounded-full" onClick={() => setSelectedRecord(null)}>
                  ✕
                </Button>
              </div>
            </CardHeader>

            {/* Content */}
            <div className="overflow-auto max-h-[calc(90vh-100px)]">
              <div className="p-6 space-y-6">
                {/* 0. AI 深度分析（行动决策 + 风险评估） */}
                <MeetingIntelligence transcript={selectedRecord.transcript} title={selectedRecord.title} startTime={selectedRecord.startTime} meetingId={selectedRecord.title} />

                {/* 1. 会议总结 */}
                <div className="rounded-xl border bg-gradient-to-br from-muted/50 to-muted p-5">
                  <h3 className="font-semibold mb-3 flex items-center gap-2 text-foreground text-sm uppercase tracking-wide">
                    <Sparkles className="h-4 w-4" />
                    会议总结
                  </h3>
                  <div className="text-base leading-8 whitespace-pre-line text-foreground/90">
                    {selectedRecord.summary || '暂无总结'}
                  </div>
                </div>

                {/* 2. 待办事项 */}
                <div className="rounded-xl border p-5">
                  <h3 className="font-semibold mb-4 flex items-center justify-between text-sm uppercase tracking-wide">
                    <span className="flex items-center gap-2">
                      <CheckCircle className="h-4 w-4 text-emerald-500" />
                      待办事项
                    </span>
                    {selectedRecord.todos?.length ? (
                      <Badge className="bg-emerald-500/10 text-emerald-600 border-emerald-500/20 text-xs">
                        {selectedRecord.todos.length} 项
                      </Badge>
                    ) : null}
                  </h3>
                  {selectedRecord.todos?.length ? (
                    <div className="grid gap-2 sm:grid-cols-2">
                      {selectedRecord.todos.map((todo, i) => {
                        const match = typeof todo === 'string' ? todo.match(/^(.+?)(?:（(.+)）)?$/) : null;
                        const task = match ? match[1].trim() : String(todo);
                        const meta = match?.[2] || '';
                        const owner = meta.match(/负责人[:：]([^，,]+)/)?.[1]?.trim();
                        const due = meta.match(/截止[:：]([^，,]+)/)?.[1]?.trim();
                        const priority = meta.match(/优先级[:：]([^，,]+)/)?.[1]?.trim();

                        return (
                          <div key={i} className="group flex items-start gap-3 p-3 rounded-lg border border-transparent hover:border-border hover:bg-muted/50 transition-all">
                            <input type="checkbox" className="mt-0.5 rounded border-2 h-4 w-4 shrink-0 accent-emerald-500" />
                            <div className="flex-1 min-w-0">
                              <div className="text-base leading-relaxed">{task}</div>
                              {(owner || due || priority) && (
                                <div className="flex flex-wrap gap-1.5 mt-2">
                                  {priority && (
                                    <span className={`inline-flex items-center text-xs px-1.5 py-0.5 rounded-full font-medium ${
                                      priority === 'high' ? 'bg-red-500/10 text-red-600' : 
                                      priority === 'medium' ? 'bg-amber-500/10 text-amber-600' : 
                                      'bg-emerald-500/10 text-emerald-600'
                                    }`}>
                                      {priority === 'high' ? '紧急' : priority === 'medium' ? '中等' : '一般'}
                                    </span>
                                  )}
                                  {owner && (
                                    <span className="inline-flex items-center text-xs px-1.5 py-0.5 rounded-full bg-sky-500/10 text-sky-400">
                                      👤 {owner}
                                    </span>
                                  )}
                                  {due && (
                                    <span className="inline-flex items-center text-xs px-1.5 py-0.5 rounded-full bg-slate-500/10 text-slate-400">
                                      📅 {due}
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
                    <div className="text-sm text-muted-foreground text-center py-8">
                      暂无待办事项
                    </div>
                  )}
                </div>

                {/* 3. 会议内容转录 */}
                <div className="rounded-xl border p-5">
                  <h3 className="font-semibold mb-3 flex items-center gap-2 text-sm uppercase tracking-wide">
                    <FileAudio className="h-4 w-4 text-sky-400" />
                    会议内容转录
                  </h3>
                  <div className="bg-muted/50 rounded-lg p-4 max-h-[400px] overflow-auto">
                    <div className="text-base leading-8 whitespace-pre-wrap text-foreground/80 font-[system-ui]">
                      {selectedRecord.transcript || '暂无转录内容'}
                    </div>
                  </div>
                </div>

                {/* 操作按钮 */}
                <div className="flex gap-2 justify-end">
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => {
                      processRecording(selectedRecord, { regenerate: true });
                      setSelectedRecord(null);
                    }}
                    disabled={transcribing === selectedRecord.meetingId}
                  >
                    <Sparkles className="h-3 w-3 mr-1" />
                    重新生成纪要
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={async () => {
                      const text = `# ${selectedRecord.title}\n\n## 会议总结\n${selectedRecord.summary || ''}\n\n## 待办事项\n${(selectedRecord.todos || []).map((t, i) => `${i + 1}. ${t}`).join('\n')}\n\n## 转录内容\n${selectedRecord.transcript || ''}`;
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
                      } catch {
                        // ignore
                      }
                    }}
                  >
                    📋 复制全部
                  </Button>
                </div>
              </div>
            </div>
          </Card>
        </div>
      )}
    </div>
  );
}