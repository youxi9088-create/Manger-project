"use client";

import { useEffect, useMemo, useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Loader2, RefreshCw, Target, ChevronDown, ChevronUp } from "lucide-react";
import { projectApi } from "@/app/projects/_lib/api";

interface RequirementAnalysis {
  name?: string;
  description?: string;
  priority?: string;
}

interface Requirement {
  id: string;
  title: string | null;
  raw_input: string | null;
  ai_analysis: string | null;
  status: string;
  computed_status?: string;
  created_at: string;
  updated_at: string;
}

interface RequirementsTabProps {
  projectId: string;
  kbRefreshKey?: number;
}

const STATUS_LABELS: Record<string, string> = {
  pending: "待分析",
  draft: "草稿",
  analyzed: "已分析",
  tasked: "已拆解任务",
  in_progress: "执行中",
  done: "已完成",
};

function parseAnalysis(value: string | null): Record<string, unknown> | null {
  if (!value) return null;
  try {
    const parsed = JSON.parse(value);
    return parsed && typeof parsed === "object" ? parsed : null;
  } catch {
    return null;
  }
}

function fmtDate(value: string): string {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleDateString("zh-CN");
}

export default function RequirementsTab({ projectId, kbRefreshKey = 0 }: RequirementsTabProps) {
  const [requirements, setRequirements] = useState<Requirement[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const loadRequirements = async () => {
    setLoading(true);
    try {
      const response = await fetch(projectApi(`/api/projects/${projectId}/requirements`));
      const json = await response.json();
      if (json.success) setRequirements(json.data || []);
    } catch (error) {
      console.error("加载项目需求失败:", error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadRequirements();
  }, [projectId, kbRefreshKey]);

  const stats = useMemo(() => ({
    total: requirements.length,
    active: requirements.filter((item) => ["tasked", "in_progress"].includes(item.computed_status || item.status)).length,
    done: requirements.filter((item) => (item.computed_status || item.status) === "done").length,
  }), [requirements]);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold">项目需求 ({stats.total})</h2>
          <p className="text-xs text-muted-foreground">来自需求分析表的真实记录，不再把周计划混作需求</p>
        </div>
        <Button size="sm" variant="outline" onClick={loadRequirements} disabled={loading}>
          {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
          刷新
        </Button>
      </div>

      <div className="grid grid-cols-3 gap-3">
        <Card><CardContent className="p-3"><div className="text-xs text-muted-foreground">需求总数</div><div className="mt-1 text-xl font-semibold">{stats.total}</div></CardContent></Card>
        <Card><CardContent className="p-3"><div className="text-xs text-muted-foreground">已拆解/执行</div><div className="mt-1 text-xl font-semibold">{stats.active}</div></CardContent></Card>
        <Card><CardContent className="p-3"><div className="text-xs text-muted-foreground">已完成</div><div className="mt-1 text-xl font-semibold">{stats.done}</div></CardContent></Card>
      </div>

      {loading ? (
        <div className="py-10 text-center text-muted-foreground">加载中...</div>
      ) : requirements.length === 0 ? (
        <Card className="border-dashed">
          <CardContent className="py-10 text-center text-muted-foreground">
            <Target className="mx-auto mb-3 h-10 w-10 text-muted-foreground/40" />
            <p>暂无项目需求</p>
            <p className="mt-1 text-xs">当前项目还没有关联需求分析记录</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {requirements.map((requirement) => {
            const status = requirement.computed_status || requirement.status;
            const analysis = parseAnalysis(requirement.ai_analysis);
            const features = Array.isArray(analysis?.features) ? analysis.features as RequirementAnalysis[] : [];
            const expanded = expandedId === requirement.id;
            return (
              <Card key={requirement.id}>
                <CardContent className="p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <h3 className="font-medium">{requirement.title || "未命名需求"}</h3>
                        <Badge variant="secondary" className="text-xs">{STATUS_LABELS[status] || status}</Badge>
                      </div>
                      <div className="mt-1 flex flex-wrap gap-x-3 gap-y-1 text-xs text-muted-foreground">
                        <span className="font-mono">{requirement.id}</span>
                        <span>创建于 {fmtDate(requirement.created_at)}</span>
                        {features.length > 0 && <span>{features.length} 项功能分析</span>}
                      </div>
                    </div>
                    {analysis && (
                      <Button size="sm" variant="ghost" onClick={() => setExpandedId(expanded ? null : requirement.id)}>
                        {expanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                        {expanded ? "收起" : "查看分析"}
                      </Button>
                    )}
                  </div>

                  {requirement.raw_input && (
                    <div className="mt-3 rounded-md bg-muted/40 p-3 text-sm whitespace-pre-wrap text-muted-foreground">
                      {requirement.raw_input}
                    </div>
                  )}

                  {expanded && analysis && (
                    <div className="mt-3 space-y-3 border-t pt-3">
                      {typeof analysis.summary === "string" && <p className="text-sm text-muted-foreground">{analysis.summary}</p>}
                      {features.length > 0 && (
                        <div className="grid gap-2 md:grid-cols-2">
                          {features.map((feature, index) => (
                            <div key={`${requirement.id}-feature-${index}`} className="rounded-md border p-3">
                              <div className="flex items-center justify-between gap-2 text-sm font-medium">
                                <span>{feature.name || `功能 ${index + 1}`}</span>
                                {feature.priority && <Badge variant="outline" className="text-[10px]">{feature.priority}</Badge>}
                              </div>
                              {feature.description && <p className="mt-1 text-xs text-muted-foreground">{feature.description}</p>}
                            </div>
                          ))}
                        </div>
                      )}
                      {Array.isArray(analysis.user_stories) && (
                        <div>
                          <div className="text-sm font-medium">用户故事</div>
                          <ul className="mt-1 list-disc space-y-1 pl-5 text-sm text-muted-foreground">
                            {(analysis.user_stories as unknown[]).map((story, index) => <li key={index}>{String(story)}</li>)}
                          </ul>
                        </div>
                      )}
                    </div>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
