"use client";

import { useEffect, useState, use } from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Zap,
  Target,
  CheckSquare,
  Users,
  Package,
  FileText,
} from "lucide-react";
import ProjectHeader, { type ProjectDetail } from "./ProjectHeader";
import OverviewTab from "./tabs/OverviewTab";
import RequirementsTab from "./tabs/RequirementsTab";
import TasksTab from "./tabs/TasksTab";
import MembersTab from "./tabs/MembersTab";
import DeliveryTab from "./tabs/DeliveryTab";
import LogsTab from "./tabs/LogsTab";
import { tabsListOc, tabsTriggerOc } from "@/app/projects/_lib/styles";

const API_BASE = process.env.NEXT_PUBLIC_SERVER_API || "http://localhost:3001";

interface PageProps {
  params: Promise<{ id: string }>;
}

const TAB_ITEMS = [
  { value: "overview", label: "概览", icon: Zap },
  { value: "requirements", label: "需求", icon: Target },
  { value: "tasks", label: "任务", icon: CheckSquare },
  { value: "members", label: "成员", icon: Users },
  { value: "delivery", label: "交付", icon: Package },
  { value: "logs", label: "日志", icon: FileText },
];

export default function ProjectDetailPage({ params }: PageProps) {
  const { id } = use(params);
  const [project, setProject] = useState<ProjectDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [syncMsg, setSyncMsg] = useState<string | null>(null);
  const [syncingInfo, setSyncingInfo] = useState(false);
  const [syncInfoMsg, setSyncInfoMsg] = useState<string | null>(null);
  const [kbRefreshKey, setKbRefreshKey] = useState(0);

  const loadProject = async () => {
    setLoading(true);
    try {
      const resp = await fetch(`${API_BASE}/api/projects/${id}`);
      const json = await resp.json();
      if (json.success) {
        setProject(json.data.project);
      }
    } catch (e) {
      console.error("加载失败:", e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadProject();
  }, [id]);

  const handleSync = async () => {
    setSyncing(true);
    setSyncMsg(null);
    try {
      const resp = await fetch(`${API_BASE}/api/projects/${id}/sync`, {
        method: "POST",
      });
      const json = await resp.json();
      if (json.success) {
        setSyncMsg(`已同步：${json.data.reason}`);
        await loadProject();
      } else {
        setSyncMsg("同步失败");
      }
    } catch {
      setSyncMsg("同步失败");
    } finally {
      setSyncing(false);
      setTimeout(() => setSyncMsg(null), 5000);
    }
  };

  const handleSyncInfo = async () => {
    setSyncingInfo(true);
    setSyncInfoMsg(null);
    try {
      const resp = await fetch(`${API_BASE}/api/projects/${id}/sync-info`, {
        method: "POST",
      });
      const json = await resp.json();
      if (json.success) {
        const data = json.data;
        setSyncInfoMsg(
          data.updated ? `项目信息已同步：${data.message}` : data.message
        );
        await loadProject();
        setKbRefreshKey((k) => k + 1);
      } else {
        setSyncInfoMsg(json.error || "同步失败");
      }
    } catch {
      setSyncInfoMsg("同步失败");
    } finally {
      setSyncingInfo(false);
      setTimeout(() => setSyncInfoMsg(null), 5000);
    }
  };

  if (loading) {
    return (
      <div className="p-7 text-center text-[var(--oc-text-secondary)]">
        加载中…
      </div>
    );
  }
  if (!project) {
    return (
      <div className="p-7 text-center text-[var(--oc-error)]">
        项目不存在
      </div>
    );
  }

  return (
    <div className="p-7 space-y-5">
      <ProjectHeader
        project={project}
        syncing={syncing}
        syncMsg={syncMsg}
        onSync={handleSync}
        syncingInfo={syncingInfo}
        syncInfoMsg={syncInfoMsg}
        onSyncInfo={handleSyncInfo}
        kbRefreshKey={kbRefreshKey}
      />

      <Tabs defaultValue="overview" className="space-y-5">
        <TabsList className={tabsListOc}>
          {TAB_ITEMS.map((tab) => {
            const Icon = tab.icon;
            return (
              <TabsTrigger key={tab.value} value={tab.value} className={tabsTriggerOc}>
                <Icon className="h-3.5 w-3.5" />
                {tab.label}
              </TabsTrigger>
            );
          })}
        </TabsList>

        <TabsContent value="overview" className="space-y-4">
          <OverviewTab
            projectId={id}
            project={project}
            onProjectUpdate={setProject}
            kbRefreshKey={kbRefreshKey}
          />
        </TabsContent>

        <TabsContent value="requirements" className="space-y-4">
          <RequirementsTab projectId={id} kbRefreshKey={kbRefreshKey} />
        </TabsContent>

        <TabsContent value="tasks" className="space-y-4">
          <TasksTab projectId={id} kbRefreshKey={kbRefreshKey} />
        </TabsContent>

        <TabsContent value="members" className="space-y-4">
          <MembersTab projectId={id} />
        </TabsContent>

        <TabsContent value="delivery" className="space-y-4">
          <DeliveryTab projectId={id} />
        </TabsContent>

        <TabsContent value="logs" className="space-y-4">
          <LogsTab projectId={id} />
        </TabsContent>
      </Tabs>
    </div>
  );
}
