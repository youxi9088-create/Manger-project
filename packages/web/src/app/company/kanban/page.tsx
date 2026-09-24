"use client";

import { useState, useEffect, useCallback } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  UserRound, Clock, Zap, Coffee, XCircle, CircleDot,
  RefreshCw, Square, ArrowRightLeft, ClipboardList, Trash2, Bot,
  Plus, GanttChart,
} from "lucide-react";

const API_BASE = process.env.NEXT_PUBLIC_SERVER_API || (process.env.NODE_ENV === "production" ? "/a/openclaw" : "http://localhost:3001");

// ============ 内联组件 ============
function ProgressBar({ value }: { value: number }) {
  return (
    <div className="absolute left-1 right-1 top-0 h-1 overflow-hidden rounded-full bg-[var(--oc-bg-hover)]">
      <div
        className="h-full rounded-full bg-[var(--oc-accent)] transition-all duration-700"
        style={{ width: `${Math.min(100, value)}%` }}
      />
    </div>
  );
}

// ============ 类型定义 ============

interface Employee {
  id: string;
  name: string;
  rank: string | null;
  status: string | null;
  avatar_url: string | null;
  power_level: number | null;
  agent_type?: string;
}

interface WorkCycle {
  id: string;
  employee_id: string;
  task_id: string | null;
  task_title: string | null;
  start_time: string;
  end_time: string | null;
  estimated_hours: number | null;
  progress: number;
  status: string;
  employee?: Employee;
}

// ============ 区域配置 ============

const ZONE_CONFIG = {
  waiting: {
    label: "待处理",
    icon: CircleDot,
    color: "var(--oc-success)",
    bgClass: "bg-[var(--oc-bg-surface)]",
    borderClass: "border-[var(--oc-border-subtle)]",
    headerBg: "bg-[var(--oc-success-soft)]",
    textColor: "text-[var(--oc-success)]",
    description: "可接任务",
  },
  working: {
    label: "进行中",
    icon: Zap,
    color: "var(--oc-warning)",
    bgClass: "bg-[var(--oc-bg-surface)]",
    borderClass: "border-[var(--oc-border-subtle)]",
    headerBg: "bg-[var(--oc-warning-soft)]",
    textColor: "text-[var(--oc-warning)]",
    description: "工作中",
  },
  offline: {
    label: "离线",
    icon: XCircle,
    color: "var(--oc-text-tertiary)",
    bgClass: "bg-[var(--oc-bg-surface)]",
    borderClass: "border-[var(--oc-border-subtle)]",
    headerBg: "bg-[var(--oc-bg-elevated)]",
    textColor: "text-[var(--oc-text-tertiary)]",
    description: "离线中",
  },
  leave: {
    label: "休假",
    icon: Coffee,
    color: "var(--oc-info)",
    bgClass: "bg-[var(--oc-bg-surface)]",
    borderClass: "border-[var(--oc-border-subtle)]",
    headerBg: "bg-[var(--oc-info-soft)]",
    textColor: "text-[var(--oc-info)]",
    description: "休假中",
  },
};

// ============ 工具函数 ============

function formatTime(isoStr: string): string {
  if (!isoStr) return "--";
  const d = new Date(isoStr);
  return d.toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit" });
}

function formatDateTime(isoStr: string): string {
  if (!isoStr) return "--";
  const d = new Date(isoStr);
  return d.toLocaleString("zh-CN", {
    month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit"
  });
}

/** 计算进度：已过时间 / 预估耗时 */
function calcProgress(startTime: string, estimatedHours: number | null): number {
  if (!estimatedHours || estimatedHours <= 0) return 0;
  const now = new Date().getTime();
  const start = new Date(startTime).getTime();
  const elapsed = (now - start) / 1000 / 60 / 60; // 小时
  return Math.min(100, Math.round((elapsed / estimatedHours) * 100));
}

/**
 * 按工作日制计算预计结束时间
 * 规则：每天 8 工作小时（09:00-17:00），跳过周末
 * 返回 Date 对象
 */
function addWorkHours(start: Date, hours: number): Date {
  const WORK_START = 9;   // 09:00
  const WORK_END = 17;    // 17:00
  const HOURS_PER_DAY = 8;

  let remaining = hours;
  const cur = new Date(start);

  // 先对齐到工作时间：如果是周末或不在工作时间段内，推到下个工作日 09:00
  const alignToWorkStart = (d: Date) => {
    while (d.getDay() === 0 || d.getDay() === 6) {
      d.setDate(d.getDate() + 1);
      d.setHours(WORK_START, 0, 0, 0);
    }
    if (d.getHours() < WORK_START) d.setHours(WORK_START, 0, 0, 0);
    if (d.getHours() >= WORK_END) {
      d.setDate(d.getDate() + 1);
      d.setHours(WORK_START, 0, 0, 0);
      while (d.getDay() === 0 || d.getDay() === 6) {
        d.setDate(d.getDate() + 1);
      }
    }
  };

  alignToWorkStart(cur);

  while (remaining > 0) {
    const todayLeft = WORK_END - cur.getHours() - cur.getMinutes() / 60;
    if (remaining <= todayLeft) {
      cur.setMinutes(cur.getMinutes() + remaining * 60);
      remaining = 0;
    } else {
      remaining -= todayLeft;
      // 跳到下一个工作日 09:00
      cur.setDate(cur.getDate() + 1);
      cur.setHours(WORK_START, 0, 0, 0);
      while (cur.getDay() === 0 || cur.getDay() === 6) {
        cur.setDate(cur.getDate() + 1);
      }
    }
  }
  return cur;
}

function calcEstimatedEnd(startTime: string, estimatedHours: number | null): string {
  if (!estimatedHours || estimatedHours <= 0) return "--";
  const end = addWorkHours(new Date(startTime), estimatedHours);
  return formatDateTime(end.toISOString());
}

/**
 * 计算同一员工按排队顺序的时间表
 * 返回 Map<cycleId, { scheduledStart: Date, scheduledEnd: Date }>
 */
function calcEmployeeSchedule(
  cycles: WorkCycle[],
  employeeId: string
): Map<string, { scheduledStart: Date; scheduledEnd: Date }> {
  const schedule = new Map<string, { scheduledStart: Date; scheduledEnd: Date }>();
  // 筛选该员工的 active + queued 任务，按原始 start_time 排序
  const empCycles = cycles
    .filter(c => c.employee_id === employeeId && (c.status === "active" || c.status === "queued"))
    .sort((a, b) => new Date(a.start_time).getTime() - new Date(b.start_time).getTime());

  let cursor: Date | null = null;
  for (const cycle of empCycles) {
    const hours = cycle.estimated_hours ?? 0;
    const start: Date = cursor ?? new Date(cycle.start_time);
    const end = hours > 0 ? addWorkHours(new Date(start), hours) : start;
    schedule.set(cycle.id, { scheduledStart: start, scheduledEnd: end });
    cursor = end;
  }
  return schedule;
}

/** 判断是否已完成（进度 >= 100%） */
function isCompleted(cycle: WorkCycle): boolean {
  if (cycle.status === "completed") return true;
  // active 状态下实时计算进度 >= 100%
  if (cycle.status === "active") return calcProgress(cycle.start_time, cycle.estimated_hours) >= 100;
  return false;
}

// ============ 主组件 ============

export default function KanbanPage() {
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [activeCycles, setActiveCycles] = useState<WorkCycle[]>([]);
  const [allCycles, setAllCycles] = useState<WorkCycle[]>([]);
  const [loading, setLoading] = useState(false);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const [empRes, activeRes, allRes] = await Promise.all([
        fetch(`${API_BASE}/api/employees`),
        fetch(`${API_BASE}/api/work-cycles/active`),
        fetch(`${API_BASE}/api/work-cycles?pageSize=200`),
      ]);
      const empData = await empRes.json();
      const activeData = await activeRes.json();
      const allData = await allRes.json();
      setEmployees(empData.data || []);
      setActiveCycles(activeData.data || []);
      setAllCycles(allData.data || []);
    } catch (err) { console.error("加载失败:", err); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  // 员工分类 + 排队计数
  const { waiting, working, offline, leave } = (() => {
    const busyEmpIds = new Set(activeCycles.map((c) => c.employee_id));
    const zones = { waiting: [] as Employee[], working: [] as Employee[], offline: [] as Employee[], leave: [] as Employee[] };
    for (const emp of employees) {
      if (busyEmpIds.has(emp.id)) {
        zones.working.push(emp);
      } else {
        switch (emp.status) {
          case "off": zones.offline.push(emp); break;
          case "leave": zones.leave.push(emp); break;
          default: zones.waiting.push(emp); break;
        }
      }
    }
    return zones;
  })();

  const getCycleForEmployee = (empId: string): WorkCycle | undefined =>
    activeCycles.find((c) => c.employee_id === empId);

  // 获取员工排队的任务数
  const getQueuedCount = (empId: string): number =>
    allCycles.filter(c => c.employee_id === empId && c.status === "queued").length;

  const handleCompleteWork = async (empId: string) => {
    try {
      await fetch(`${API_BASE}/api/employees/${empId}/complete-work`, { method: "POST" });
      fetchData();
    } catch (err) { console.error("结束失败:", err); }
  };

  const handleDeleteCycle = async (cycleId: string, taskTitle: string | null) => {
    if (!confirm(`确定要删除工作计划「${taskTitle || "无任务"}」吗？`)) return;
    try {
      await fetch(`${API_BASE}/api/work-cycles/${cycleId}`, { method: "DELETE" });
      fetchData();
    } catch (err) { console.error("删除失败:", err); }
  };

  // ============ 渲染：看板区域 ============
  const renderBoard = () => (
    <Card className="overflow-hidden border-[var(--oc-border-subtle)] bg-[var(--oc-bg-surface)]">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2 text-base text-[var(--oc-text-primary)]">
            <ArrowRightLeft className="h-4 w-4 text-[var(--oc-accent)]" />
            开发看板
          </CardTitle>
          <Button
            size="sm"
            variant="outline"
            onClick={fetchData}
            disabled={loading}
            className="h-9 gap-1.5 border-[var(--oc-border-subtle)] bg-[var(--oc-bg-elevated)] text-[var(--oc-text-primary)] hover:border-[var(--oc-border-strong)] hover:bg-[var(--oc-bg-hover)]"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} />
            刷新
          </Button>
        </div>
      </CardHeader>
      <CardContent className="pb-5">
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
          {/* 四列看板 */}
          {(Object.entries(ZONE_CONFIG) as [keyof typeof ZONE_CONFIG, typeof ZONE_CONFIG.waiting][]).map(([key, config]) => {
            const zoneList = { waiting, working, offline, leave }[key];
            return (
              <div
                key={key}
                className={`flex flex-col gap-2.5 rounded-xl border ${config.borderClass} ${config.bgClass} p-3.5`}
              >
                <div className="flex items-center justify-between border-b border-[var(--oc-border-subtle)] pb-2">
                  <div className="flex items-center gap-2">
                    <config.icon className={`h-4 w-4 ${config.textColor}`} />
                    <span className="text-sm font-semibold text-[var(--oc-text-primary)]">
                      {config.label}
                    </span>
                  </div>
                  <Badge
                    variant="outline"
                    className="border-[var(--oc-border-subtle)] bg-[var(--oc-bg-elevated)] text-[10px] text-[var(--oc-text-tertiary)]"
                  >
                    {zoneList.length}
                  </Badge>
                </div>
                <div className="flex-1 space-y-2 overflow-y-auto">
                  {zoneList.length === 0 ? (
                    <p className="py-6 text-center text-xs text-[var(--oc-text-tertiary)]">暂无</p>
                  ) : (
                    zoneList.map((emp) => {
                      const cycle = key === "working" ? getCycleForEmployee(emp.id) : undefined;
                      const liveProgress = cycle ? calcProgress(cycle.start_time, cycle.estimated_hours) : undefined;
                      const done = cycle ? isCompleted(cycle) : false;
                      const queuedCount = getQueuedCount(emp.id);
                      return (
                        <EmployeeCard
                          key={emp.id}
                          employee={emp}
                          zone={key}
                          cycle={cycle}
                          progress={liveProgress}
                          isCompleted={done}
                          queuedCount={queuedCount}
                          onComplete={() => handleCompleteWork(emp.id)}
                        />
                      );
                    })
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );

  // ============ 渲染：工作计划表 ============
  const renderTable = () => (
    <Card className="border-[var(--oc-border-subtle)] bg-[var(--oc-bg-surface)]">
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base text-[var(--oc-text-primary)]">
          <ClipboardList className="h-4 w-4 text-[var(--oc-accent)]" />
          工作计划表
        </CardTitle>
      </CardHeader>
      <CardContent>
        {allCycles.length === 0 ? (
          <p className="py-8 text-center text-sm text-[var(--oc-text-tertiary)]">暂无工作计划记录</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-[var(--oc-border-subtle)]">
                  <th className="px-3 py-2.5 text-left text-xs font-semibold uppercase tracking-wider text-[var(--oc-text-secondary)]">成员</th>
                  <th className="px-3 py-2.5 text-left text-xs font-semibold uppercase tracking-wider text-[var(--oc-text-secondary)]">关联任务</th>
                  <th className="px-3 py-2.5 text-left text-xs font-semibold uppercase tracking-wider text-[var(--oc-text-secondary)]">开始时间</th>
                  <th className="px-3 py-2.5 text-left text-xs font-semibold uppercase tracking-wider text-[var(--oc-text-secondary)]">预估耗时</th>
                  <th className="px-3 py-2.5 text-left text-xs font-semibold uppercase tracking-wider text-[var(--oc-text-secondary)]">进度</th>
                  <th className="px-3 py-2.5 text-left text-xs font-semibold uppercase tracking-wider text-[var(--oc-text-secondary)]">预计结束</th>
                  <th className="px-3 py-2.5 text-left text-xs font-semibold uppercase tracking-wider text-[var(--oc-text-secondary)]">实际结束</th>
                  <th className="px-3 py-2.5 text-left text-xs font-semibold uppercase tracking-wider text-[var(--oc-text-secondary)]">状态</th>
                  <th className="px-3 py-2.5 text-center text-xs font-semibold uppercase tracking-wider text-[var(--oc-text-secondary)]">操作</th>
                </tr>
              </thead>
              <tbody>
                {(() => {
                  // 预计算所有员工的时间表
                  const scheduleCache = new Map<string, Map<string, { scheduledStart: Date; scheduledEnd: Date }>>();
                  const getSchedule = (empId: string) => {
                    if (!scheduleCache.has(empId)) {
                      scheduleCache.set(empId, calcEmployeeSchedule(allCycles, empId));
                    }
                    return scheduleCache.get(empId)!;
                  };

                  return allCycles.map((cycle) => {
                    const emp = employees.find(e => e.id === cycle.employee_id);
                    const isActive = cycle.status === "active";
                    const schedule = getSchedule(cycle.employee_id);
                    const sch = schedule.get(cycle.id);
                    // 用 schedule 计算的开始时间来算进度
                    const schStartStr = sch ? sch.scheduledStart.toISOString() : cycle.start_time;
                    const prog = isActive ? calcProgress(schStartStr, cycle.estimated_hours) : cycle.progress;
                    const done = prog >= 100;
                    const displayStatus = isActive && done ? "completed" : cycle.status;

                    return (
                      <tr
                        key={cycle.id}
                        className="border-b border-[var(--oc-border-subtle)] transition-colors hover:bg-[var(--oc-bg-elevated)]"
                      >
                        <td className="px-3 py-2.5">
                          <div className="flex items-center gap-2">
                            {emp?.avatar_url ? (
                              <img src={emp.avatar_url} alt="" className="h-6 w-6 rounded-full object-cover" />
                            ) : (
                              <div className="flex h-6 w-6 items-center justify-center rounded-full bg-[var(--oc-bg-elevated)] text-[var(--oc-text-secondary)]">
                                <UserRound className="h-3.5 w-3.5" />
                              </div>
                            )}
                            <span className="font-medium text-[var(--oc-text-primary)]">{emp?.name || cycle.employee_id}</span>
                          </div>
                        </td>
                        <td className="max-w-[180px] truncate px-3 py-2.5 text-[var(--oc-text-secondary)]">
                          {cycle.task_title || "-"}
                        </td>
                        {/* 开始时间 - 根据同员工任务排队自动计算 */}
                        <td className="px-3 py-2.5 text-[var(--oc-text-primary)]">
                          {sch ? formatDateTime(sch.scheduledStart.toISOString()) : formatDateTime(cycle.start_time)}
                        </td>
                        {/* 预估耗时 - 只读，数据来源于需求分析的开发任务 */}
                        <td className="px-3 py-2.5">
                          <span className="tabular-nums text-xs text-[var(--oc-text-secondary)]">
                            {cycle.estimated_hours != null ? `${cycle.estimated_hours}h` : "-"}
                          </span>
                        </td>
                        <td className="px-3 py-2.5">
                          <div className="flex items-center gap-2">
                            <div className="h-1.5 w-16 overflow-hidden rounded-full bg-[var(--oc-bg-hover)]">
                              <div
                                className="h-full rounded-full"
                                style={{
                                  width: `${prog}%`,
                                  backgroundColor: done ? "var(--oc-success)" : isActive ? "var(--oc-warning)" : "var(--oc-success)",
                                }}
                              />
                            </div>
                            <span className="tabular-nums text-xs text-[var(--oc-text-secondary)]">{prog}%</span>
                          </div>
                        </td>
                        {/* 预计结束 - 按工作日制计算 */}
                        <td className="px-3 py-2.5 text-[var(--oc-text-secondary)]">
                          {sch && cycle.estimated_hours && cycle.estimated_hours > 0
                            ? formatDateTime(sch.scheduledEnd.toISOString())
                            : "--"}
                        </td>
                        <td className="px-3 py-2.5 text-[var(--oc-text-secondary)]">
                          {cycle.end_time ? formatDateTime(cycle.end_time) : "-"}
                        </td>
                        <td className="px-3 py-2.5">
                          <Badge
                            variant="outline"
                            className={
                              displayStatus === "completed"
                                ? "border-[var(--oc-success)]/30 text-[var(--oc-success)]"
                                : displayStatus === "queued"
                                ? "border-[var(--oc-info)]/30 text-[var(--oc-info)]"
                                : displayStatus === "cancelled"
                                ? "border-[var(--oc-error)]/30 text-[var(--oc-error)]"
                                : "border-[var(--oc-warning)]/30 text-[var(--oc-warning)]"
                            }
                          >
                            {displayStatus === "active" ? "进行中" : displayStatus === "completed" ? "已完成" : displayStatus === "queued" ? "待执行" : "已取消"}
                          </Badge>
                        </td>
                        <td className="px-3 py-2.5">
                          <div className="flex justify-center">
                            <button
                              onClick={(e) => { e.stopPropagation(); handleDeleteCycle(cycle.id, cycle.task_title); }}
                              className="flex h-7 w-7 items-center justify-center rounded-lg text-[var(--oc-text-secondary)] transition-colors hover:bg-[var(--oc-error-soft)] hover:text-[var(--oc-error)]"
                              title="删除此工作计划"
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  });
                })()}
              </tbody>
            </table>
          </div>
        )}
      </CardContent>
    </Card>
  );

  return (
    <div className="space-y-6 p-7">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-[var(--oc-text-primary)]">团队看板</h1>
          <p className="mt-1.5 text-[13px] text-[var(--oc-text-secondary)]">团队工作周期排期表与任务流动视图</p>
        </div>
        <div className="flex items-center gap-2.5">
          <Button
            variant="outline"
            size="sm"
            className="h-9 gap-1.5 border-[var(--oc-border-subtle)] bg-[var(--oc-bg-elevated)] text-[var(--oc-text-primary)] hover:border-[var(--oc-border-strong)] hover:bg-[var(--oc-bg-hover)]"
          >
            <GanttChart className="h-4 w-4" />
            甘特图
          </Button>
          <Button
            size="sm"
            className="h-9 gap-1.5 bg-[var(--oc-accent)] text-[var(--oc-bg-root)] hover:bg-[var(--oc-accent-hover)]"
          >
            <Plus className="h-4 w-4" />
            新建排期
          </Button>
        </div>
      </div>

      {renderBoard()}
      {renderTable()}
    </div>
  );
}

// ============ 员工卡片子组件 ============

function EmployeeCard({
  employee,
  zone,
  cycle,
  progress,
  isCompleted,
  queuedCount = 0,
  onComplete,
}: {
  employee: Employee;
  zone: "waiting" | "working" | "offline" | "leave";
  cycle?: WorkCycle;
  progress?: number;
  isCompleted?: boolean;
  queuedCount?: number;
  onComplete?: () => void;
}) {
  const config = ZONE_CONFIG[zone];
  const Icon = config.icon;

  return (
    <div className="group relative cursor-default rounded-lg border border-[var(--oc-border-subtle)] bg-[var(--oc-bg-elevated)] p-2.5 transition-colors hover:border-[var(--oc-border-strong)] hover:bg-[var(--oc-bg-hover)]">
      {/* 工作区顶部进度条 */}
      {zone === "working" && progress !== undefined && !isCompleted && (
        <ProgressBar value={progress} />
      )}

      {/* 核心：头像 + 状态标签 + 进度百分比 */}
      <div className="flex flex-col items-center gap-1.5 pt-1">
        {/* 头像 */}
        <div className="relative">
          <div className="flex h-14 w-14 items-center justify-center overflow-hidden rounded-xl border border-[var(--oc-border-subtle)] bg-[var(--oc-bg-hover)] shadow-sm">
            {employee.avatar_url ? (
              <img src={employee.avatar_url} alt="" className="h-full w-full object-cover" />
            ) : (
              <UserRound className="h-6 w-6 text-[var(--oc-text-tertiary)]" />
            )}
          </div>
          {/* Agent 标识 */}
          {employee.agent_type && (
            <div
              className={`absolute -left-1.5 -top-1.5 flex h-5 w-5 items-center justify-center rounded-full border border-[var(--oc-bg-surface)] shadow-sm ${
                employee.agent_type === "main" ? "bg-[var(--oc-info)]" : employee.agent_type === "exec" ? "bg-[var(--oc-warning)]" : "bg-[var(--oc-accent)]"
              }`}
              title={`AI Agent: ${employee.agent_type === "main" ? "PM Agent" : employee.agent_type === "exec" ? "Exec Agent" : employee.agent_type}`}
            >
              <Bot className="h-3 w-3 text-white" />
            </div>
          )}
          {/* 工作区角标 */}
          {zone === "working" && (
            <div className={`absolute -bottom-1 -right-1 flex h-4.5 w-4.5 items-center justify-center rounded-full ${isCompleted ? "bg-[var(--oc-success)]" : "bg-[var(--oc-warning)]"}`}>
              {isCompleted ? (
                <svg className="h-2.5 w-2.5 text-white" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3"><path d="M20 6L9 17l-5-5"/></svg>
              ) : (
                <Zap className="h-2.5 w-2.5 text-white" />
              )}
            </div>
          )}
        </div>

        {/* 状态标签 */}
        <Badge
          variant="outline"
          className={`text-[9px] ${config.textColor} border-current/20 px-1.5 py-0`}
        >
          <Icon className="mr-0.5 h-2.5 w-2.5" />
          {isCompleted ? "已完成" : config.description}
        </Badge>

        {/* 进度百分比 — 只在工作区显示 */}
        {zone === "working" && progress !== undefined && (
          <div className={`mt-0.5 text-base font-bold tabular-nums ${isCompleted ? "text-[var(--oc-success)]" : "text-[var(--oc-warning)]"}`}>
            {progress}%
          </div>
        )}

        {/* 排队任务数 */}
        {zone === "working" && queuedCount > 0 && (
          <div className="mt-0.5 inline-flex items-center gap-1 rounded-full border border-[var(--oc-info)]/25 bg-[var(--oc-info-soft)] px-1.5 py-0 text-[10px] font-medium text-[var(--oc-info)]">
            <span>排队</span>
            <span className="flex h-4 min-w-[16px] items-center justify-center rounded-full bg-[var(--oc-info)]/20 px-1 text-[9px] leading-none">
              {queuedCount}
            </span>
          </div>
        )}

        {/* 结束按钮 */}
        {zone === "working" && !isCompleted && cycle && (
          <button
            onClick={(e) => { e.stopPropagation(); onComplete?.(); }}
            className="mt-1 flex h-5 w-full items-center justify-center rounded text-[9px] bg-[var(--oc-warning-soft)] text-[var(--oc-warning)] hover:bg-[var(--oc-warning)]/20 transition-colors"
            title="完成工作，回到等待区"
          >
            <Square className="mr-0.5 h-2.5 w-2.5" /> 结束
          </button>
        )}
      </div>
    </div>
  );
}
