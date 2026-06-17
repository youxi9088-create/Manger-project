"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  MessageSquare,
  RefreshCw,
  Loader2,
  User,
  Filter,
  CheckCircle2,
  Clock,
  AlertTriangle,
  Target,
  ArrowRight,
  Calendar,
  Download,
  Sparkles,
  ExternalLink,
} from "lucide-react";

const API_BASE = process.env.NEXT_PUBLIC_SERVER_API || "http://localhost:3001";
const IM_ANALYZER_URL = process.env.NEXT_PUBLIC_IM_ANALYZER_URL || "http://localhost:5173";

// 当前用户标识，可扩展为从配置/用户设置读取
const MY_IDENTIFIERS = ["游浠", "youxi", "you xi", "U9_MY_NAME"];

interface AnalysisTask {
  task?: string;
  content?: string;
  item?: string;
  description?: string;
  decision?: string;
  meeting?: string;
  topic?: string;
  outcome?: string;
  detail?: string;
  owner?: string;
  assignee?: string;
  person?: string;
  due?: string;
  priority?: string;
  severity?: string;
}

interface AnalysisReport {
  id: string;
  report_date: string;
  summary: string;
  work_priorities?: AnalysisTask[];
  completed_tasks?: AnalysisTask[];
  pending_tasks?: AnalysisTask[];
  key_decisions?: AnalysisTask[];
  follow_ups?: AnalysisTask[];
  meeting_notes?: AnalysisTask[];
  risks?: AnalysisTask[];
  statistics?: {
    total_messages?: number;
    unique_senders?: number;
    unique_groups?: number;
    mentioned_count?: number;
  } | null;
}

function isRelatedToMe(item: AnalysisTask | string): boolean {
  const text = typeof item === "string"
    ? item
    : `${item.task || ""} ${item.content || ""} ${item.item || ""} ${item.description || ""} ${item.decision || ""} ${item.meeting || ""} ${item.topic || ""} ${item.outcome || ""} ${item.detail || ""} ${item.owner || ""} ${item.assignee || ""}`;
  const lower = text.toLowerCase();
  return MY_IDENTIFIERS.some((id) => lower.includes(id.toLowerCase()));
}

function extractTasks(report: AnalysisReport): AnalysisTask[] {
  // 真正的「待跟进」项：pending_tasks + follow_ups
  const lists = [
    ...(report.pending_tasks || []),
    ...(report.follow_ups || []),
  ];
  return lists;
}

function formatDateLabel(date: string): string {
  const d = new Date(date);
  const today = new Date();
  const yesterday = new Date(today);
  yesterday.setDate(today.getDate() - 1);
  if (d.toDateString() === today.toDateString()) return "今天";
  if (d.toDateString() === yesterday.toDateString()) return "昨天";
  return d.toLocaleDateString("zh-CN", { month: "long", day: "numeric" });
}

export default function ChatAnalyzerPage() {
  const [reports, setReports] = useState<AnalysisReport[]>([]);
  const [loading, setLoading] = useState(false);
  const [analyzing, setAnalyzing] = useState(false);
  const [analyzeMsg, setAnalyzeMsg] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState("related");
  const [selectedReportId, setSelectedReportId] = useState<string | null>(null);

  const fetchReports = async () => {
    setLoading(true);
    try {
      const res = await fetch(`${API_BASE}/api/analysis/reports`);
      const json = await res.json().catch(() => ({ reports: [] }));
      const list: AnalysisReport[] = json.reports || [];
      setReports(list);
      if (list.length > 0 && !selectedReportId) {
        setSelectedReportId(list[0].id);
      }
    } catch {
      setReports([]);
    } finally {
      setLoading(false);
    }
  };

  const runTodayAnalysis = async () => {
    setAnalyzing(true);
    setAnalyzeMsg(null);
    try {
      const today = new Date().toISOString().slice(0, 10);
      const res = await fetch(`${API_BASE}/api/analysis/run`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ date: today }),
      });
      const json = await res.json().catch(() => ({ success: false, message: "请求失败" }));
      if (json.success) {
        setAnalyzeMsg("分析完成，正在刷新...");
        await fetchReports();
      } else {
        setAnalyzeMsg(json.message || "分析失败：当天可能没有聊天记录");
      }
    } catch {
      setAnalyzeMsg("分析请求失败");
    } finally {
      setAnalyzing(false);
      setTimeout(() => setAnalyzeMsg(null), 4000);
    }
  };

  useEffect(() => {
    fetchReports();
  }, []);

  const selectedReport = useMemo(
    () => reports.find((r) => r.id === selectedReportId) || reports[0] || null,
    [reports, selectedReportId]
  );

  const allTasks = useMemo(() => {
    if (!selectedReport) return [];
    return extractTasks(selectedReport);
  }, [selectedReport]);

  const relatedTasks = useMemo(() => {
    return allTasks;
  }, [allTasks]);

  const relatedDecisions = useMemo(() => {
    if (!selectedReport) return [];
    return selectedReport.key_decisions || [];
  }, [selectedReport]);

  const relatedMeetings = useMemo(() => {
    if (!selectedReport) return [];
    return selectedReport.meeting_notes || [];
  }, [selectedReport]);

  const relatedCount = relatedTasks.length + relatedDecisions.length + relatedMeetings.length;

  const handleImportToDaily = async () => {
    if (!selectedReport) return;
    const items = relatedTasks
      .filter((t) => (t.task || t.item || t.description || "").trim())
      .slice(0, 20);
    if (items.length === 0) return;

    const today = new Date().toISOString().slice(0, 10);
    try {
      const planRes = await fetch(`${API_BASE}/api/daily-plans/${today}`);
      const planJson = await planRes.json().catch(() => ({ tasks: [] }));
      const existing = new Set((planJson.tasks || []).map((t: any) => String(t.title).toLowerCase()));

      const newTasks = items.map((it, idx) => {
        const title = String(it.task || it.item || it.description || "待办").trim();
        return {
          id: `${Date.now()}-${idx}-${Math.random().toString(16).slice(2)}`,
          title,
          status: "pending",
          priority: it.priority === "high" ? "high" : it.priority === "low" ? "low" : "medium",
          assignee: it.owner || it.assignee || "",
          notes: `来自 ${formatDateLabel(selectedReport.report_date)} 聊天分析`,
          completed_at: null,
          expected_completion_at: it.due ? new Date(it.due).toISOString() : null,
          source_date: null,
        };
      }).filter((t) => t.title && !existing.has(t.title.toLowerCase()));

      await fetch(`${API_BASE}/api/daily-plans/${today}`, {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          goalText: planJson.plan?.goal_text || `聊天分析待办 (${formatDateLabel(selectedReport.report_date)})`,
          tasks: [...(planJson.tasks || []), ...newTasks],
        }),
      });

      alert(`已导入 ${newTasks.length} 条待办到 Daily Plan`);
    } catch {
      alert("导入失败");
    }
  };

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <MessageSquare className="h-6 w-6" />
            聊天情报中心
          </h1>
          <p className="text-muted-foreground text-sm mt-1">从聊天记录中提取工作优先级、待办与决策</p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={runTodayAnalysis} disabled={analyzing || loading}>
            {analyzing ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : <Sparkles className="h-4 w-4 mr-1" />}
            {analyzing ? "分析中..." : "生成今日报告"}
          </Button>
          <Button variant="outline" size="sm" onClick={fetchReports} disabled={loading}>
            {loading ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : <RefreshCw className="h-4 w-4 mr-1" />}
            刷新
          </Button>
          <Link href={IM_ANALYZER_URL} target="_blank">
            <Button variant="ghost" size="sm">
              <ExternalLink className="h-4 w-4 mr-1" />
              打开完整分析工具
            </Button>
          </Link>
        </div>
      </div>

      {analyzeMsg && (
        <div className={`text-sm px-4 py-2 rounded-lg ${analyzeMsg.includes("完成") ? "bg-emerald-500/10 text-emerald-600" : "bg-amber-500/10 text-amber-600"}`}>
          {analyzeMsg}
        </div>
      )}

      {reports.length === 0 && !loading && (
        <Card className="border-dashed">
          <CardContent className="py-10 text-center space-y-3">
            <MessageSquare className="h-10 w-10 text-muted-foreground/40 mx-auto" />
            <p className="text-muted-foreground">暂无聊天记录分析报告</p>
            <Button size="sm" onClick={runTodayAnalysis} disabled={analyzing}>
              {analyzing ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : <Sparkles className="h-4 w-4 mr-1" />}
              {analyzing ? "分析中..." : "生成今日报告"}
            </Button>
          </CardContent>
        </Card>
      )}

      {selectedReport && (
        <>
          {/* 报告选择 + 统计 */}
          <div className="flex flex-col md:flex-row md:items-center gap-3">
            <div className="flex items-center gap-2 flex-wrap">
              {reports.slice(0, 7).map((r) => (
                <Button
                  key={r.id}
                  size="sm"
                  variant={selectedReportId === r.id ? "default" : "outline"}
                  onClick={() => setSelectedReportId(r.id)}
                >
                  {formatDateLabel(r.report_date)}
                </Button>
              ))}
            </div>
            <div className="md:ml-auto flex items-center gap-3 text-sm text-muted-foreground">
              {selectedReport.statistics && (
                <>
                  <span>{selectedReport.statistics.total_messages || 0} 条消息</span>
                  <span>·</span>
                  <span>{selectedReport.statistics.unique_senders || 0} 人</span>
                  <span>·</span>
                  <span>{selectedReport.statistics.unique_groups || 0} 个群</span>
                </>
              )}
            </div>
          </div>

          <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-4">
            <TabsList>
              <TabsTrigger value="related" className="gap-1">
                <User className="h-3.5 w-3.5" />
                与我相关
                {relatedCount > 0 && (
                  <Badge variant="secondary" className="ml-1 text-[10px] px-1.5">{relatedCount}</Badge>
                )}
              </TabsTrigger>
              <TabsTrigger value="tasks" className="gap-1">
                <Clock className="h-3.5 w-3.5" />
                全部待办
                {allTasks.length > 0 && (
                  <Badge variant="secondary" className="ml-1 text-[10px] px-1.5">{allTasks.length}</Badge>
                )}
              </TabsTrigger>
              <TabsTrigger value="decisions" className="gap-1">
                <Target className="h-3.5 w-3.5" />
                关键决策
              </TabsTrigger>
              <TabsTrigger value="summary" className="gap-1">
                <Calendar className="h-3.5 w-3.5" />
                报告摘要
              </TabsTrigger>
            </TabsList>

            {/* 与我相关 */}
            <TabsContent value="related" className="space-y-4">
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
                <Card className="lg:col-span-2">
                  <CardHeader className="flex flex-row items-center justify-between pb-3">
                    <CardTitle className="text-base flex items-center gap-2">
                      <User className="h-4 w-4 text-blue-500" />
                      与我相关的待办 / 跟进
                    </CardTitle>
                    {relatedTasks.length > 0 && (
                      <Button size="sm" variant="outline" onClick={handleImportToDaily}>
                        <Download className="h-3.5 w-3.5 mr-1" />
                        导入 Daily Plan
                      </Button>
                    )}
                  </CardHeader>
                  <CardContent>
                    {relatedTasks.length === 0 ? (
                      <p className="text-sm text-muted-foreground">当前报告未匹配到与您相关的待办。</p>
                    ) : (
                      <ul className="space-y-2">
                        {relatedTasks.map((t, i) => (
                          <li key={i} className="p-3 rounded-lg border hover:bg-muted/50 transition-colors">
                            <p className="text-sm font-medium">
                              {t.task || t.item || t.description || "(无标题)"}
                            </p>
                            <div className="flex flex-wrap gap-2 mt-2">
                              {t.priority && (
                                <Badge
                                  variant={t.priority === "high" ? "destructive" : t.priority === "medium" ? "default" : "secondary"}
                                  className="text-[10px]"
                                >
                                  {t.priority === "high" ? "紧急" : t.priority === "medium" ? "中等" : "一般"}
                                </Badge>
                              )}
                              {(t.owner || t.assignee || t.person) && (
                                <Badge variant="outline" className="text-[10px]">
                                  @{t.owner || t.assignee || t.person}
                                </Badge>
                              )}
                              {t.due && (
                                <Badge variant="outline" className="text-[10px]">
                                  <Clock className="h-3 w-3 mr-1" />
                                  {t.due}
                                </Badge>
                              )}
                            </div>
                          </li>
                        ))}
                      </ul>
                    )}
                  </CardContent>
                </Card>

                <div className="space-y-4">
                  <Card>
                    <CardHeader className="pb-3">
                      <CardTitle className="text-base flex items-center gap-2">
                        <Target className="h-4 w-4 text-emerald-500" />
                        相关决策
                      </CardTitle>
                    </CardHeader>
                    <CardContent>
                      {relatedDecisions.length === 0 ? (
                        <p className="text-sm text-muted-foreground">无相关决策。</p>
                      ) : (
                        <ul className="space-y-2">
                          {relatedDecisions.map((d, i) => (
                            <li key={i} className="text-sm p-2 rounded-lg bg-muted/30">
                              {d.decision || d.content || d.description || d.task || "(无内容)"}
                            </li>
                          ))}
                        </ul>
                      )}
                    </CardContent>
                  </Card>

                  <Card>
                    <CardHeader className="pb-3">
                      <CardTitle className="text-base flex items-center gap-2">
                        <MessageSquare className="h-4 w-4 text-amber-500" />
                        相关会议
                      </CardTitle>
                    </CardHeader>
                    <CardContent>
                      {relatedMeetings.length === 0 ? (
                        <p className="text-sm text-muted-foreground">无相关会议记录。</p>
                      ) : (
                        <ul className="space-y-2">
                          {relatedMeetings.map((m, i) => (
                            <li key={i} className="text-sm p-2 rounded-lg bg-muted/30">
                              {m.meeting || m.topic || m.outcome || m.content || m.description || m.task || "(无内容)"}
                            </li>
                          ))}
                        </ul>
                      )}
                    </CardContent>
                  </Card>
                </div>
              </div>
            </TabsContent>

            {/* 全部待办 */}
            <TabsContent value="tasks" className="space-y-4">
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-base flex items-center gap-2">
                    <Filter className="h-4 w-4" />
                    全部待办与跟进
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  {allTasks.length === 0 ? (
                    <p className="text-sm text-muted-foreground">当前报告没有待办项。</p>
                  ) : (
                    <ul className="space-y-2">
                      {allTasks.map((t, i) => (
                        <li key={i} className="flex items-start gap-3 p-3 rounded-lg border hover:bg-muted/50 transition-colors">
                          <div className="mt-0.5">
                            {isRelatedToMe(t) ? (
                              <User className="h-4 w-4 text-blue-500" />
                            ) : (
                              <CheckCircle2 className="h-4 w-4 text-muted-foreground" />
                            )}
                          </div>
                          <div className="flex-1">
                            <p className={`text-sm ${isRelatedToMe(t) ? "font-medium" : ""}`}>
                              {t.task || t.item || t.description || "(无标题)"}
                            </p>
                            <div className="flex flex-wrap gap-2 mt-1">
                              {(t.owner || t.assignee || t.person) && (
                                <span className="text-[10px] text-muted-foreground">@{t.owner || t.assignee || t.person}</span>
                              )}
                              {t.due && <span className="text-[10px] text-muted-foreground">截止 {t.due}</span>}
                              {t.priority && (
                                <span
                                  className={`text-[10px] px-1.5 py-0.5 rounded ${
                                    t.priority === "high"
                                      ? "bg-red-500/10 text-red-500"
                                      : t.priority === "medium"
                                      ? "bg-amber-500/10 text-amber-500"
                                      : "bg-green-500/10 text-green-500"
                                  }`}
                                >
                                  {t.priority === "high" ? "紧急" : t.priority === "medium" ? "中等" : "一般"}
                                </span>
                              )}
                            </div>
                          </div>
                        </li>
                      ))}
                    </ul>
                  )}
                </CardContent>
              </Card>
            </TabsContent>

            {/* 关键决策 */}
            <TabsContent value="decisions" className="space-y-4">
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-base flex items-center gap-2">
                    <Target className="h-4 w-4" />
                    关键决策
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  {(selectedReport.key_decisions || []).length === 0 ? (
                    <p className="text-sm text-muted-foreground">当前报告没有关键决策。</p>
                  ) : (
                    <ul className="space-y-2">
                      {(selectedReport.key_decisions || []).map((d, i) => (
                        <li key={i} className="p-3 rounded-lg border hover:bg-muted/50 transition-colors">
                          <div className="flex items-start gap-3">
                            {isRelatedToMe(d) ? <User className="h-4 w-4 text-blue-500 mt-0.5" /> : <Target className="h-4 w-4 text-muted-foreground mt-0.5" />}
                            <p className={`text-sm ${isRelatedToMe(d) ? "font-medium" : ""}`}>{d.decision || d.content || d.description || d.task || "(无内容)"}</p>
                          </div>
                        </li>
                      ))}
                    </ul>
                  )}
                </CardContent>
              </Card>
            </TabsContent>

            {/* 完整日报 */}
            <TabsContent value="summary" className="space-y-4">
              {/* 工作概要 */}
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-base flex items-center gap-2">
                    <Calendar className="h-4 w-4" />
                    {formatDateLabel(selectedReport.report_date)} 工作概要
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-sm whitespace-pre-line text-muted-foreground">{selectedReport.summary || "暂无摘要"}</p>
                </CardContent>
              </Card>

              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                {/* 重点工作 */}
                <Card>
                  <CardHeader className="pb-3">
                    <CardTitle className="text-base flex items-center gap-2">
                      <Target className="h-4 w-4 text-blue-500" />
                      重点工作 ({(selectedReport.work_priorities || []).length})
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    {(selectedReport.work_priorities || []).length === 0 ? (
                      <p className="text-sm text-muted-foreground">无重点工作记录。</p>
                    ) : (
                      <ul className="space-y-2">
                        {(selectedReport.work_priorities || []).map((w, i) => {
                          const text = typeof w === "string" ? w : (w.task || w.content || w.description || w.item || "(无内容)");
                          return (
                            <li key={i} className="p-3 rounded-lg border hover:bg-muted/50 transition-colors">
                              <p className="text-sm">{text}</p>
                              {typeof w !== "string" && (w.priority || w.owner) && (
                                <div className="flex flex-wrap gap-2 mt-1">
                                  {w.priority && <Badge variant="outline" className="text-[10px]">{w.priority}</Badge>}
                                  {w.owner && <Badge variant="outline" className="text-[10px]">@{w.owner}</Badge>}
                                </div>
                              )}
                            </li>
                          );
                        })}
                      </ul>
                    )}
                  </CardContent>
                </Card>

                {/* 已完成任务 */}
                <Card>
                  <CardHeader className="pb-3">
                    <CardTitle className="text-base flex items-center gap-2">
                      <CheckCircle2 className="h-4 w-4 text-emerald-500" />
                      已完成任务 ({(selectedReport.completed_tasks || []).length})
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    {(selectedReport.completed_tasks || []).length === 0 ? (
                      <p className="text-sm text-muted-foreground">无已完成任务。</p>
                    ) : (
                      <ul className="space-y-2">
                        {(selectedReport.completed_tasks || []).map((c, i) => {
                          const text = typeof c === "string" ? c : (c.task || c.content || c.description || c.item || c.detail || "(无内容)");
                          return (
                            <li key={i} className="flex items-start gap-3 p-3 rounded-lg border hover:bg-muted/50 transition-colors">
                              <CheckCircle2 className="h-4 w-4 text-emerald-500 mt-0.5 shrink-0" />
                              <p className="text-sm">{text}</p>
                            </li>
                          );
                        })}
                      </ul>
                    )}
                  </CardContent>
                </Card>

                {/* 待跟进事项 */}
                <Card>
                  <CardHeader className="pb-3">
                    <CardTitle className="text-base flex items-center gap-2">
                      <Clock className="h-4 w-4 text-amber-500" />
                      待跟进事项 ({(selectedReport.pending_tasks || []).length + (selectedReport.follow_ups || []).length})
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    {((selectedReport.pending_tasks || []).length + (selectedReport.follow_ups || []).length) === 0 ? (
                      <p className="text-sm text-muted-foreground">无待跟进事项。</p>
                    ) : (
                      <ul className="space-y-2">
                        {(selectedReport.pending_tasks || []).map((t, i) => (
                          <li key={`p-${i}`} className="p-3 rounded-lg border hover:bg-muted/50 transition-colors">
                            <p className="text-sm">{t.task || t.content || t.description || t.item || "(无内容)"}</p>
                            <div className="flex flex-wrap gap-2 mt-1">
                              {t.priority && <Badge variant="outline" className="text-[10px]">{t.priority}</Badge>}
                              {(t.owner || t.person) && <Badge variant="outline" className="text-[10px]">@{t.owner || t.person}</Badge>}
                              {t.due && <Badge variant="outline" className="text-[10px]">截止 {t.due}</Badge>}
                            </div>
                          </li>
                        ))}
                        {(selectedReport.follow_ups || []).map((f, i) => (
                          <li key={`f-${i}`} className="p-3 rounded-lg border hover:bg-muted/50 transition-colors">
                            <p className="text-sm">{f.item || f.task || f.content || f.description || "(无内容)"}</p>
                            <div className="flex flex-wrap gap-2 mt-1">
                              {(f.owner || f.person) && <Badge variant="outline" className="text-[10px]">@{f.owner || f.person}</Badge>}
                              {f.due && <Badge variant="outline" className="text-[10px]">截止 {f.due}</Badge>}
                            </div>
                          </li>
                        ))}
                      </ul>
                    )}
                  </CardContent>
                </Card>

                {/* 关键决策 */}
                <Card>
                  <CardHeader className="pb-3">
                    <CardTitle className="text-base flex items-center gap-2">
                      <Target className="h-4 w-4 text-purple-500" />
                      关键决策 ({(selectedReport.key_decisions || []).length})
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    {(selectedReport.key_decisions || []).length === 0 ? (
                      <p className="text-sm text-muted-foreground">无关键决策。</p>
                    ) : (
                      <ul className="space-y-2">
                        {(selectedReport.key_decisions || []).map((d, i) => (
                          <li key={i} className="p-3 rounded-lg border hover:bg-muted/50 transition-colors">
                            <p className="text-sm">{d.decision || d.content || d.description || d.task || "(无内容)"}</p>
                          </li>
                        ))}
                      </ul>
                    )}
                  </CardContent>
                </Card>
              </div>

              {/* 会议记录 */}
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-base flex items-center gap-2">
                    <MessageSquare className="h-4 w-4 text-orange-500" />
                    会议记录 ({(selectedReport.meeting_notes || []).length})
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  {(selectedReport.meeting_notes || []).length === 0 ? (
                    <p className="text-sm text-muted-foreground">无会议记录。</p>
                  ) : (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                      {(selectedReport.meeting_notes || []).map((m, i) => (
                        <div key={i} className="p-3 rounded-lg border hover:bg-muted/50 transition-colors">
                          <p className="text-sm">{m.meeting || m.topic || m.outcome || m.content || m.description || m.task || m.item || "(无内容)"}</p>
                        </div>
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>
            </TabsContent>
          </Tabs>
        </>
      )}
    </div>
  );
}
