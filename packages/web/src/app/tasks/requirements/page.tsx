"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Plus, FileSearch, Loader2, Trash2, ChevronLeft, GitBranch, Filter, FolderOpen,
} from "lucide-react";
import { RequirementDetail } from "@/components/requirements/RequirementDetail";

const API_BASE = "http://localhost:3001";

interface Requirement {
  id: string;
  initiation_id: string | null;
  title: string | null;
  input_type: string;
  raw_input: string | null;
  ai_analysis: string | null;
  status: string;
  computed_status: string;
  version_id: string | null;
  from_goal_id: string | null;
  project_id: string | null;
  created_at: string;
  updated_at: string;
}

interface VersionBrief {
  id: string;
  name: string;
}

interface ProjectBrief {
  id: string;
  title: string | null;
  status: string;
}

const STATUS_MAP: Record<string, { label: string; variant: "default" | "secondary" | "destructive" | "outline" }> = {
  pending:     { label: "待开始", variant: "secondary" },
  draft:       { label: "草稿", variant: "secondary" },
  analyzed:    { label: "已分析", variant: "outline" },
  tasked:      { label: "已拆解", variant: "default" },
  in_progress: { label: "开发中", variant: "default" },
  done:        { label: "已完成", variant: "default" },
};

export default function RequirementsPage() {
  const [list, setList] = useState<Requirement[]>([]);
  const [versions, setVersions] = useState<VersionBrief[]>([]);
  const [projects, setProjects] = useState<ProjectBrief[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [filterVersion, setFilterVersion] = useState<string>("all");
  const [filterProject, setFilterProject] = useState<string>("all");

  const fetchList = useCallback(async () => {
    try {
      setLoading(true);
      const [reqRes, verRes, projRes] = await Promise.all([
        fetch(`${API_BASE}/api/requirements`),
        fetch(`${API_BASE}/api/versions`),
        fetch(`${API_BASE}/api/projects`),
      ]);
      const reqJson = await reqRes.json();
      const verJson = await verRes.json();
      const projJson = await projRes.json();
      if (reqJson.success) setList(reqJson.data);
      if (verJson.success) {
        setVersions((verJson.data || []).map((v: { id: string; name: string }) => ({ id: v.id, name: v.name })));
      }
      if (projJson.success) setProjects(projJson.data || []);
    } catch (err) { console.error("获取需求列表失败:", err); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { fetchList(); }, [fetchList]);

  const versionMap = useMemo(() => {
    const m = new Map<string, string>();
    versions.forEach(v => m.set(v.id, v.name));
    return m;
  }, [versions]);

  const projectMap = useMemo(() => {
    const m = new Map<string, string>();
    projects.forEach(p => m.set(p.id, p.title || p.id));
    return m;
  }, [projects]);

  const filteredList = useMemo(() => {
    let result = list;
    if (filterVersion !== "all") {
      result = filterVersion === "none"
        ? result.filter(r => !r.version_id)
        : result.filter(r => r.version_id === filterVersion);
    }
    if (filterProject !== "all") {
      result = filterProject === "none"
        ? result.filter(r => !r.project_id)
        : result.filter(r => r.project_id === filterProject);
    }
    return result;
  }, [list, filterVersion, filterProject]);

  const handleCreate = async () => {
    try {
      const res = await fetch(`${API_BASE}/api/requirements`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ input_type: "text" }),
      });
      const json = await res.json();
      if (json.success) { setEditingId(json.data.id); fetchList(); }
    } catch (err) { console.error("创建需求失败:", err); }
  };

  const handleDelete = async (id: string) => {
    if (!confirm(`确认删除需求 ${id}？`)) return;
    try {
      await fetch(`${API_BASE}/api/requirements/${id}`, { method: "DELETE" });
      if (editingId === id) setEditingId(null);
      fetchList();
    } catch (err) { console.error("删除失败:", err); }
  };

  if (editingId) {
    return (
      <div className="space-y-4">
        <Button variant="ghost" size="sm" onClick={() => { setEditingId(null); fetchList(); }}>
          <ChevronLeft className="h-4 w-4 mr-1" />
          返回列表
        </Button>
        <RequirementDetail
          requirementId={editingId}
          onBack={() => { setEditingId(null); fetchList(); }}
        />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">需求分析</h1>
          <p className="text-muted-foreground mt-1">AI 辅助需求分析与任务拆解</p>
        </div>
        <Button onClick={handleCreate} size="sm">
          <Plus className="h-4 w-4 mr-1" />
          新建需求
        </Button>
      </div>

      {/* 筛选区 */}
      <div className="flex items-center gap-4 flex-wrap">
        <div className="flex items-center gap-2">
          <FolderOpen className="h-4 w-4 text-muted-foreground" />
          <span className="text-sm text-muted-foreground">所属项目：</span>
          <Select value={filterProject} onValueChange={setFilterProject}>
            <SelectTrigger className="w-[220px] h-8 text-sm">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">全部项目（{list.length}）</SelectItem>
              <SelectItem value="none">未关联项目（{list.filter(r => !r.project_id).length}）</SelectItem>
              {projects.map(p => (
                <SelectItem key={p.id} value={p.id}>
                  {p.title || p.id}（{list.filter(r => r.project_id === p.id).length}）
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="flex items-center gap-2">
          <Filter className="h-4 w-4 text-muted-foreground" />
          <span className="text-sm text-muted-foreground">按版本筛选：</span>
          <Select value={filterVersion} onValueChange={setFilterVersion}>
            <SelectTrigger className="w-[280px] h-8 text-sm">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">全部版本（{list.length}）</SelectItem>
              <SelectItem value="none">未关联版本（{list.filter(r => !r.version_id).length}）</SelectItem>
              {versions.map(v => (
                <SelectItem key={v.id} value={v.id}>
                  {v.name}（{list.filter(r => r.version_id === v.id).length}）
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      ) : filteredList.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-16 text-muted-foreground">
            <FileSearch className="h-10 w-10 mb-3" />
            <p className="text-sm">
              {filterProject !== "all" || filterVersion !== "all" ? "该筛选条件下暂无需求" : "暂无需求分析记录"}
            </p>
            <p className="text-xs mt-1">点击「新建需求」输入需求描述，AI 将自动分析并拆解开发任务</p>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">
              需求列表（{filteredList.length}{filteredList.length !== list.length ? ` / ${list.length}` : ''}）
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {filteredList.map((item) => (
                <div
                  key={item.id}
                  className="flex items-center justify-between p-4 rounded-lg border hover:bg-accent/50 transition-colors cursor-pointer"
                  onClick={() => setEditingId(item.id)}
                >
                  <div className="flex items-center gap-4 flex-1 min-w-0">
                    <code className="text-xs font-mono text-muted-foreground bg-muted px-2 py-1 rounded shrink-0">
                      {item.id}
                    </code>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <p className="font-medium truncate">{item.title || "未命名需求"}</p>
                        {item.project_id && (
                          <Badge variant="outline" className="text-[10px] bg-emerald-500/10 text-emerald-600 border-emerald-500/30 shrink-0">
                            <FolderOpen className="h-2.5 w-2.5 mr-0.5" />
                            {projectMap.get(item.project_id) || item.project_id}
                          </Badge>
                        )}
                        {item.version_id && (
                          <Badge variant="outline" className="text-[10px] bg-blue-500/10 text-blue-600 border-blue-500/30 shrink-0">
                            <GitBranch className="h-2.5 w-2.5 mr-0.5" />
                            {versionMap.get(item.version_id) || item.version_id}
                          </Badge>
                        )}
                        {item.from_goal_id && (
                          <Badge variant="outline" className="text-[10px] bg-purple-500/10 text-purple-600 border-purple-500/30 shrink-0">
                            由版本目标转化
                          </Badge>
                        )}
                      </div>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        {item.raw_input?.slice(0, 60) || "暂无描述"}
                        {(item.raw_input?.length || 0) > 60 ? "..." : ""}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <Badge variant={STATUS_MAP[item.computed_status]?.variant || "secondary"}>
                      {STATUS_MAP[item.computed_status]?.label || item.computed_status}
                    </Badge>
                    <Button variant="ghost" size="icon" className="h-8 w-8"
                      onClick={(e) => { e.stopPropagation(); handleDelete(item.id); }}>
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
