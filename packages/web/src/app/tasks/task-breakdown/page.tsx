import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { CheckSquare, Plus, ListTree, User } from "lucide-react";

export default function TaskBreakdownPage() {
  const tasks = [
    { id: 1, title: "前端开发", assignee: "张三", progress: 60, status: "进行中" },
    { id: 2, title: "后端接口", assignee: "李四", progress: 30, status: "进行中" },
    { id: 3, title: "数据库设计", assignee: "王五", progress: 100, status: "已完成" },
  ];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">任务拆解</h1>
          <p className="text-muted-foreground mt-1">将项目拆解为具体任务</p>
        </div>
        <Button>
          <Plus className="h-4 w-4 mr-2" />
          新建任务
        </Button>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardHeader className="flex flex-row items-center gap-2">
            <ListTree className="h-5 w-5" />
            <CardTitle className="text-base">任务概览</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {tasks.map((task) => (
                <div key={task.id} className="space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="font-medium">{task.title}</span>
                    <Badge variant={task.status === "已完成" ? "default" : "secondary"}>
                      {task.status}
                    </Badge>
                  </div>
                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <User className="h-3 w-3" />
                    {task.assignee}
                  </div>
                  <div className="h-2 w-full rounded-full bg-muted overflow-hidden">
                    <div
                      className="h-full bg-primary transition-all"
                      style={{ width: `${task.progress}%` }}
                    />
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">快速操作</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            <Button variant="outline" className="w-full justify-start">
              <Plus className="h-4 w-4 mr-2" />
              添加子任务
            </Button>
            <Button variant="outline" className="w-full justify-start">
              <CheckSquare className="h-4 w-4 mr-2" />
              批量标记完成
            </Button>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
