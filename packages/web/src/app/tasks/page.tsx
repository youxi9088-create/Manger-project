import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Users, ArrowRight, Plus, FileText, CheckSquare, Package } from "lucide-react";
import Link from "next/link";

export default function TasksPage() {
  const taskItems = [
    {
      title: "项目立项",
      description: "管理项目立项相关事务",
      url: "/tasks/project-initiation",
      icon: Users,
      count: 5,
      color: "bg-blue-500",
    },
    {
      title: "需求分析",
      description: "进行需求分析和管理",
      url: "/tasks/requirements",
      icon: FileText,
      count: 3,
      color: "bg-purple-500",
    },
    {
      title: "任务拆解",
      description: "将项目拆解为具体任务",
      url: "/tasks/task-breakdown",
      icon: CheckSquare,
      count: 8,
      color: "bg-green-500",
    },
    {
      title: "交付管理",
      description: "管理项目交付相关事务",
      url: "/tasks/delivery",
      icon: Package,
      count: 2,
      color: "bg-orange-500",
    },
  ];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">事务列表</h1>
          <p className="text-muted-foreground mt-1">选择分类查看具体事务</p>
        </div>
        <Button>
          <Plus className="h-4 w-4 mr-2" />
          新建事务
        </Button>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        {taskItems.map((item) => (
          <Link key={item.title} href={item.url}>
            <Card className="hover:bg-accent/50 transition-colors cursor-pointer group">
              <CardHeader className="flex flex-row items-center gap-4">
                <div className={`flex h-12 w-12 items-center justify-center rounded-xl ${item.color} text-white`}>
                  <item.icon className="h-6 w-6" />
                </div>
                <div className="flex-1">
                  <CardTitle className="text-lg">{item.title}</CardTitle>
                  <CardDescription>{item.description}</CardDescription>
                </div>
                <ArrowRight className="h-5 w-5 text-muted-foreground transition-transform group-hover:translate-x-1" />
              </CardHeader>
              <CardContent>
                <div className="flex items-center justify-between">
                  <Badge variant="secondary">{item.count} 项事务</Badge>
                </div>
              </CardContent>
            </Card>
          </Link>
        ))}
      </div>
    </div>
  );
}
