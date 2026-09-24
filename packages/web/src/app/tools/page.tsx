import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  ShoppingCart,
  MessageSquare,
  Search,
  BarChart2,
  Zap,
  Calendar,
  Bot,
  FileText,
  Code,
  CalendarClock,
  Scale,
  LayoutGrid,
  ArrowRight,
} from "lucide-react";
import Link from "next/link";

export default function ToolsPage() {
  const toolItems = [
    {
      title: "项目健康扫描",
      description: "基于多维度数据评估项目风险与健康度，生成可执行建议。",
      url: "#",
      icon: BarChart2,
      tag: "常用",
      tagAccent: true,
    },
    {
      title: "AIHub 工作流",
      description: "触发自定义 AI 工作流，完成进度诊断、任务拆解、会议纪要等。",
      url: "/workflow",
      icon: Zap,
      tag: "智能体",
      tagAccent: false,
    },
    {
      title: "会议助手",
      description: "录音转写、会议纪要、待办提取与同步，一站式会议管理。",
      url: "/tools/meeting-assistant",
      icon: Calendar,
      tag: "效率",
      tagAccent: false,
    },
    {
      title: "Hermes Agent",
      description: "与 AI 对话，完成跨项目查询、复杂分析与自动化操作。",
      url: "/tools/agent",
      icon: Bot,
      tag: "推荐",
      tagAccent: true,
    },
    {
      title: "文档助手",
      description: "基于知识库生成摘要、回答文档问题、提取关键决策与待办。",
      url: "#",
      icon: FileText,
      tag: "知识库",
      tagAccent: false,
    },
    {
      title: "代码评审助手",
      description: "辅助代码评审，识别潜在风险点、性能问题与安全漏洞。",
      url: "#",
      icon: Code,
      tag: "研发",
      tagAccent: false,
    },
    {
      title: "排期冲突检测",
      description: "扫描成员负载与任务排期，识别资源冲突与过载风险。",
      url: "/company/kanban",
      icon: CalendarClock,
      tag: "团队",
      tagAccent: false,
    },
    {
      title: "需求优先级评估",
      description: "根据业务价值、技术成本与风险，辅助评估需求优先级。",
      url: "#",
      icon: Scale,
      tag: "产品",
      tagAccent: false,
    },
    {
      title: "自动下单",
      description: "自动化下单与采购流程，减少重复操作。",
      url: "/tools/auto-order",
      icon: ShoppingCart,
      tag: "采购",
      tagAccent: false,
    },
    {
      title: "快速搜索",
      description: "跨项目、任务、会议与知识库的统一快速搜索入口。",
      url: "/tools/quick-search",
      icon: Search,
      tag: "搜索",
      tagAccent: false,
    },
    {
      title: "聊天记录分析",
      description: "分析聊天记录，提取关键信息、待办与决策点。",
      url: "/tools/chat-analyzer",
      icon: MessageSquare,
      tag: "分析",
      tagAccent: false,
    },
  ];

  return (
    <div className="space-y-6 p-7">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-[var(--oc-text-primary)]">工具台</h1>
          <p className="mt-1.5 text-[13px] text-[var(--oc-text-secondary)]">
            常用工具与能力入口，一键直达
          </p>
        </div>
        <Button
          variant="outline"
          size="sm"
          className="h-9 gap-1.5 border-[var(--oc-border-subtle)] bg-[var(--oc-bg-elevated)] text-[var(--oc-text-primary)] hover:border-[var(--oc-border-strong)] hover:bg-[var(--oc-bg-hover)]"
        >
          <LayoutGrid className="h-4 w-4" />
          管理工具
        </Button>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        {toolItems.map((item) => (
          <Link key={item.title} href={item.url}>
            <Card className="group h-full cursor-pointer border-[var(--oc-border-subtle)] bg-[var(--oc-bg-surface)] p-5 transition-all duration-180 hover:border-[var(--oc-border-strong)] hover:bg-[var(--oc-bg-elevated)] hover:shadow-[0_4px_16px_rgba(0,0,0,0.32)] hover:-translate-y-0.5">
              <div className="flex flex-col gap-3">
                <div className="flex items-start justify-between">
                  <div className="flex h-10 w-10 items-center justify-center rounded-[10px] bg-[var(--oc-accent-soft)] text-[var(--oc-accent)]">
                    <item.icon className="h-5 w-5" strokeWidth={1.75} />
                  </div>
                  <Badge
                    variant="outline"
                    className={
                      item.tagAccent
                        ? "border-[var(--oc-accent)]/22 bg-[var(--oc-accent-soft)] text-[10px] text-[var(--oc-accent)]"
                        : "border-[var(--oc-border-subtle)] bg-[var(--oc-bg-elevated)] text-[10px] text-[var(--oc-text-secondary)]"
                    }
                  >
                    {item.tag}
                  </Badge>
                </div>
                <div>
                  <CardTitle className="text-sm font-bold text-[var(--oc-text-primary)]">
                    {item.title}
                  </CardTitle>
                  <CardDescription className="mt-1 line-clamp-2 text-xs leading-relaxed text-[var(--oc-text-secondary)]">
                    {item.description}
                  </CardDescription>
                </div>
                <div className="flex items-center text-xs font-medium text-[var(--oc-accent)] transition-transform group-hover:translate-x-1">
                  立即使用
                  <ArrowRight className="ml-1 h-3.5 w-3.5" />
                </div>
              </div>
            </Card>
          </Link>
        ))}
      </div>
    </div>
  );
}
