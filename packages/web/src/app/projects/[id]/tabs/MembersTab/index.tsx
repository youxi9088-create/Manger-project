"use client";

import { useEffect, useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Plus, Users, UserPlus, Loader2, X, CheckSquare } from "lucide-react";

const API_BASE = process.env.NEXT_PUBLIC_SERVER_API || "http://localhost:3001";

interface Member {
  id: string;
  employee_id: string;
  employee_name: string;
  employee_avatar: string | null;
  role: string;
  joined_at: string;
}

interface Employee {
  id: string;
  name: string;
  rank: string | null;
  status: string;
}

interface Task {
  id: string;
  title: string;
  status: string;
  assignee: string | null;
}

interface Requirement {
  id: string;
  title: string | null;
}

interface MembersTabProps {
  projectId: string;
}

export default function MembersTab({ projectId }: MembersTabProps) {
  const [members, setMembers] = useState<Member[]>([]);
  const [allEmployees, setAllEmployees] = useState<Employee[]>([]);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [requirements, setRequirements] = useState<Requirement[]>([]);
  const [loading, setLoading] = useState(true);
  const [addOpen, setAddOpen] = useState(false);
  const [assignOpen, setAssignOpen] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [assigning, setAssigning] = useState(false);
  const [search, setSearch] = useState("");

  // 派任务表单
  const [taskTitle, setTaskTitle] = useState("");
  const [taskDesc, setTaskDesc] = useState("");
  const [taskReqId, setTaskReqId] = useState("");
  const [taskPriority, setTaskPriority] = useState("medium");
  const [taskHours, setTaskHours] = useState("");

  const loadData = async () => {
    setLoading(true);
    try {
      const [membersResp, tasksResp, reqResp] = await Promise.all([
        fetch(`${API_BASE}/api/projects/${projectId}/members`),
        fetch(`${API_BASE}/api/projects/${projectId}/tasks`),
        fetch(`${API_BASE}/api/projects/${projectId}/requirements`),
      ]);
      const membersJson = await membersResp.json();
      const tasksJson = await tasksResp.json();
      const reqJson = await reqResp.json();
      if (membersJson.success) setMembers(membersJson.data || []);
      if (tasksJson.success) setTasks(tasksJson.data || []);
      if (reqJson.success) setRequirements(reqJson.data || []);
    } catch (e) {
      console.error("加载数据失败:", e);
    } finally {
      setLoading(false);
    }
  };

  const loadEmployees = async () => {
    try {
      const resp = await fetch(`${API_BASE}/api/employees`);
      const json = await resp.json();
      if (json.success) setAllEmployees(json.data || []);
    } catch (e) {
      console.error("加载员工失败:", e);
    }
  };

  useEffect(() => {
    loadData();
  }, [projectId]);

  const handleAddMember = async (employeeId: string) => {
    setAdding(true);
    try {
      const resp = await fetch(`${API_BASE}/api/projects/${projectId}/members`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ employee_id: employeeId, role: "member" }),
      });
      const json = await resp.json();
      if (json.success) {
        loadData();
        setAddOpen(false);
      }
    } catch (e) {
      console.error("添加成员失败:", e);
    } finally {
      setAdding(false);
    }
  };

  const handleAssignTask = async (employeeId: string) => {
    if (!taskTitle.trim() || !taskReqId) return;
    setAssigning(true);
    try {
      const resp = await fetch(`${API_BASE}/api/dev-tasks`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          requirement_id: taskReqId,
          title: taskTitle,
          description: taskDesc || null,
          assignee: employeeId,
          priority: taskPriority,
          estimated_hours: taskHours ? parseFloat(taskHours) : null,
        }),
      });
      const json = await resp.json();
      if (json.success) {
        setTaskTitle("");
        setTaskDesc("");
        setTaskReqId("");
        setTaskPriority("medium");
        setTaskHours("");
        setAssignOpen(null);
        loadData();
      }
    } catch (e) {
      console.error("派任务失败:", e);
    } finally {
      setAssigning(false);
    }
  };

  const getTaskCount = (employeeId: string) => {
    return tasks.filter((t) => t.assignee === employeeId).length;
  };

  const existingEmployeeIds = new Set(members.map((m) => m.employee_id));
  const availableEmployees = allEmployees.filter(
    (e) => !existingEmployeeIds.has(e.id) && e.name.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold">项目成员 ({members.length})</h2>
        <Button size="sm" onClick={() => { setAddOpen(true); loadEmployees(); }}>
          <Plus className="h-4 w-4 mr-1" /> 添加成员
        </Button>
      </div>

      {loading ? (
        <div className="text-center py-8 text-muted-foreground">加载中...</div>
      ) : members.length === 0 ? (
        <Card className="border-dashed">
          <CardContent className="py-10 text-center text-muted-foreground">
            <Users className="h-10 w-10 mx-auto mb-3 text-muted-foreground/40" />
            <p>暂无成员，点击「添加成员」加入团队</p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
          {members.map((member) => (
            <Card key={member.id} className="relative group">
              <CardContent className="p-4">
                <button
                  className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity p-1 rounded hover:bg-destructive/10 text-muted-foreground hover:text-destructive"
                  onClick={() => {
                    if (confirm("确定移除该成员？")) alert("移除成员功能待后端支持");
                  }}
                >
                  <X className="h-3 w-3" />
                </button>
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center text-sm font-medium">
                    {member.employee_avatar ? (
                      <img src={member.employee_avatar} className="w-10 h-10 rounded-full" />
                    ) : (
                      member.employee_name?.[0] || "?"
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="font-medium">{member.employee_name || member.employee_id}</div>
                    <div className="text-xs text-muted-foreground">{member.role}</div>
                    <div className="flex items-center gap-2 mt-1.5">
                      <Badge variant="secondary" className="text-[10px]">
                        <CheckSquare className="h-2.5 w-2.5 mr-0.5" />
                        {getTaskCount(member.employee_id)} 个任务
                      </Badge>
                      <Button
                        size="sm"
                        variant="ghost"
                        className="h-5 text-[10px] px-1.5"
                        onClick={() => {
                          setAssignOpen(member.employee_id);
                          if (requirements.length === 0) {
                            fetch(`${API_BASE}/api/projects/${projectId}/requirements`)
                              .then(r => r.json())
                              .then(j => { if (j.success) setRequirements(j.data || []); });
                          }
                        }}
                      >
                        派任务
                      </Button>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* 添加成员弹窗 */}
      {addOpen && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4">
          <div className="bg-background rounded-lg border shadow-lg w-full max-w-md flex flex-col max-h-[80vh]">
            <div className="flex items-center justify-between p-4 border-b">
              <h2 className="text-lg font-semibold">添加成员</h2>
              <Button variant="ghost" size="sm" onClick={() => setAddOpen(false)}>✕</Button>
            </div>
            <div className="p-4">
              <Input
                placeholder="搜索员工..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="mb-3"
              />
              <div className="space-y-1 max-h-[300px] overflow-auto">
                {availableEmployees.length === 0 ? (
                  <p className="text-sm text-muted-foreground text-center py-4">
                    {search ? "未找到匹配员工" : "所有员工都已加入"}
                  </p>
                ) : (
                  availableEmployees.map((emp) => (
                    <button
                      key={emp.id}
                      className="w-full flex items-center gap-3 p-2 rounded-lg hover:bg-muted text-left transition-colors"
                      onClick={() => handleAddMember(emp.id)}
                      disabled={adding}
                    >
                      <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center text-sm font-medium shrink-0">
                        {emp.name[0]}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="text-sm font-medium">{emp.name}</div>
                        <div className="text-xs text-muted-foreground">{emp.rank || "未设定职级"} · {emp.status}</div>
                      </div>
                      <UserPlus className="h-4 w-4 text-muted-foreground shrink-0" />
                    </button>
                  ))
                )}
              </div>
            </div>
            <div className="p-4 border-t flex justify-end">
              <Button variant="outline" size="sm" onClick={() => setAddOpen(false)}>取消</Button>
            </div>
          </div>
        </div>
      )}

      {/* 派任务弹窗 */}
      {assignOpen && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4">
          <div className="bg-background rounded-lg border shadow-lg w-full max-w-lg flex flex-col max-h-[90vh]">
            <div className="flex items-center justify-between p-4 border-b">
              <h2 className="text-lg font-semibold">
                给 {members.find(m => m.employee_id === assignOpen)?.employee_name} 派任务
              </h2>
              <Button variant="ghost" size="sm" onClick={() => setAssignOpen(null)}>✕</Button>
            </div>
            <div className="p-4 space-y-3 overflow-auto">
              <div>
                <label className="text-sm font-medium">关联需求 <span className="text-red-500">*</span></label>
                <Select value={taskReqId} onValueChange={setTaskReqId}>
                  <SelectTrigger>
                    <SelectValue placeholder="选择一个需求..." />
                  </SelectTrigger>
                  <SelectContent>
                    {requirements.length === 0 ? (
                      <SelectItem value="" disabled>暂无需求，先去需求Tab创建</SelectItem>
                    ) : (
                      requirements.map((req) => (
                        <SelectItem key={req.id} value={req.id}>
                          {req.title || req.id}
                        </SelectItem>
                      ))
                    )}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <label className="text-sm font-medium">任务标题 <span className="text-red-500">*</span></label>
                <Input value={taskTitle} onChange={(e) => setTaskTitle(e.target.value)} placeholder="输入任务标题..." />
              </div>
              <div>
                <label className="text-sm font-medium">任务描述</label>
                <Textarea value={taskDesc} onChange={(e) => setTaskDesc(e.target.value)} placeholder="输入任务描述..." rows={3} />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-sm font-medium">优先级</label>
                  <Select value={taskPriority} onValueChange={setTaskPriority}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="high">高</SelectItem>
                      <SelectItem value="medium">中</SelectItem>
                      <SelectItem value="low">低</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <label className="text-sm font-medium">预估工时（小时）</label>
                  <Input type="number" value={taskHours} onChange={(e) => setTaskHours(e.target.value)} placeholder="8" />
                </div>
              </div>
            </div>
            <div className="p-4 border-t flex justify-end gap-2">
              <Button variant="outline" size="sm" onClick={() => setAssignOpen(null)}>取消</Button>
              <Button
                size="sm"
                onClick={() => handleAssignTask(assignOpen)}
                disabled={assigning || !taskTitle.trim() || !taskReqId}
              >
                {assigning ? <Loader2 className="h-4 w-4 animate-spin" /> : "创建任务"}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
