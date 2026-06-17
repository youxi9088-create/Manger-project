import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Calendar, ArrowRight, Plus, ShoppingCart, MessageSquare, Search } from "lucide-react";
import Link from "next/link";

export default function ToolsPage() {
  const toolItems = [
    {
      title: "自动下单",
      description: "自动下单工具",
      url: "/tools/auto-order",
      icon: ShoppingCart,
      color: "from-blue-500 to-cyan-500",
    },
    {
      title: "会议助手",
      description: "会议管理助手",
      url: "/tools/meeting-assistant",
      icon: MessageSquare,
      color: "from-purple-500 to-pink-500",
    },
    {
      title: "快速搜索",
      description: "快速搜索工具",
      url: "/tools/quick-search",
      icon: Search,
      color: "from-green-500 to-emerald-500",
    },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">工具清单</h1>
        <p className="text-muted-foreground mt-1">选择工具查看详情</p>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        {toolItems.map((item) => (
          <Link key={item.title} href={item.url}>
            <Card className="hover:bg-accent/50 transition-all cursor-pointer group overflow-hidden relative">
              <div className={`absolute inset-0 bg-gradient-to-br ${item.color} opacity-5 group-hover:opacity-10 transition-opacity`} />
              <CardHeader className="flex flex-row items-center gap-4 relative">
                <div className={`flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-br ${item.color} text-white shadow-lg`}>
                  <item.icon className="h-7 w-7" />
                </div>
                <div>
                  <CardTitle>{item.title}</CardTitle>
                  <CardDescription>{item.description}</CardDescription>
                </div>
              </CardHeader>
              <CardContent className="relative">
                <div className="flex items-center text-sm text-muted-foreground group-hover:translate-x-1 transition-transform">
                  立即使用 <ArrowRight className="h-4 w-4 ml-1" />
                </div>
              </CardContent>
            </Card>
          </Link>
        ))}
      </div>
    </div>
  );
}
