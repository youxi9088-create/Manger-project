"use client";

import { useState, useEffect, useCallback } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Plus,
  Zap,
  ArrowRightLeft,
  Loader2,
  FileText,
  Trash2,
  ChevronLeft,
} from "lucide-react";
import { QuickValidationForm } from "@/components/project-initiation/QuickValidationForm";

const API_BASE = process.env.NEXT_PUBLIC_SERVER_API || (process.env.NODE_ENV === "production" ? "/a/openclaw" : "http://localhost:3001");

interface ProjectInitiation {
  id: string;
  type: string;
  status: string;
  title: string | null;
  applicant: string | null;
  project_leader: string | null;
  department: string | null;
  project_type: string | null;
  raw_requirement: string | null;
  ai_generated_content: string | null;
  created_at: string;
  updated_at: string;
}

const STATUS_MAP: Record<string, { label: string; variant: "default" | "secondary" | "destructive" | "outline" }> = {
  draft: { label: "草稿", variant: "secondary" },
  pending: { label: "去立项", variant: "default" },
  submitted: { label: "已提交", variant: "outline" },
  approved: { label: "已通过", variant: "default" },
  rejected: { label: "已驳回", variant: "destructive" },
};

export default function ProjectInitiationPage() {
  const [list, setList] = useState<ProjectInitiation[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState("quick_validation");
  const [editingId, setEditingId] = useState<string | null>(null);

  const fetchList = useCallback(async () => {
    try {
      setLoading(true);
      const res = await fetch(`${API_BASE}/api/project-initiation`);
      const json = await res.json();
      if (json.success) setList(json.data);
    } catch (err) {
      console.error("获取立项列表失败:", err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchList();
  }, [fetchList]);

  const handleCreate = async (type: string) => {
    try {
      const res = await fetch(`${API_BASE}/api/project-initiation`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type }),
      });
      const json = await res.json();
      if (json.success) {
        setEditingId(json.data.id);
        fetchList();
      }
    } catch (err) {
      console.error("创建立项失败:", err);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm(`确认删除立项 ${id}？`)) return;
    try {
      await fetch(`${API_BASE}/api/project-initiation/${id}`, { method: "DELETE" });
      if (editingId === id) setEditingId(null);
      fetchList();
    } catch (err) {
      console.error("删除失败:", err);
    }
  };

  const filteredList = list.filter((item) => item.type === activeTab);

  // 编辑模式
  if (editingId) {
    return (
      <div className="space-y-4">
        <Button variant="ghost" size="sm" onClick={() => { setEditingId(null); fetchList(); }}>
          <ChevronLeft className="h-4 w-4 mr-1" />
          返回列表
        </Button>
        <QuickValidationForm
          initiationId={editingId}
          onSaved={() => fetchList()}
          onSubmitted={() => { setEditingId(null); fetchList(); }}
        />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">项目立项</h1>
          <p className="text-muted-foreground mt-1">管理项目立项，AI 辅助生成立项文档</p>
        </div>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <div className="flex items-center justify-between">
          <TabsList>
            <TabsTrigger value="quick_validation" className="gap-1.5">
              <Zap className="h-3.5 w-3.5" />
              快速验证
            </TabsTrigger>
            <TabsTrigger value="pre_to_formal" className="gap-1.5">
              <ArrowRightLeft className="h-3.5 w-3.5" />
              预立项转立项（技术研发型）
            </TabsTrigger>
          </TabsList>
          <Button onClick={() => handleCreate(activeTab)} size="sm">
            <Plus className="h-4 w-4 mr-1" />
            新建{activeTab === "quick_validation" ? "快速验证" : "预立项转立项"}
          </Button>
        </div>

        {/* 快速验证 */}
        <TabsContent value="quick_validation">
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : filteredList.length === 0 ? (
            <Card>
              <CardContent className="flex flex-col items-center justify-center py-16 text-muted-foreground">
                <FileText className="h-10 w-10 mb-3" />
                <p className="text-sm">暂无快速验证立项记录</p>
                <p className="text-xs mt-1">点击「新建快速验证」开始，AI 将基于原始需求自动生成立项文档</p>
              </CardContent>
            </Card>
          ) : (
            <Card>
              <CardHeader>
                <CardTitle className="text-base">立项记录</CardTitle>
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
                        <div className="min-w-0">
                          <p className="font-medium truncate">
                            {item.title || "未命名项目"}
                          </p>
                          <p className="text-xs text-muted-foreground mt-0.5">
                            {item.created_at?.replace("T", " ")}
                          </p>
                        </div>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        <Badge variant={STATUS_MAP[item.status]?.variant || "secondary"}>
                          {STATUS_MAP[item.status]?.label || item.status}
                        </Badge>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8"
                          onClick={(e) => { e.stopPropagation(); handleDelete(item.id); }}
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}
        </TabsContent>

        {/* 预立项转立项（技术研发型）占位 */}
        <TabsContent value="pre_to_formal">
          <Card>
            <CardContent className="flex flex-col items-center justify-center py-16 text-muted-foreground">
              <ArrowRightLeft className="h-10 w-10 mb-3" />
              <p className="text-sm font-medium">预立项转立项（技术研发型）</p>
              <p className="text-xs mt-1">功能开发中，敬请期待...</p>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
