'use client';

import * as React from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  Calendar,
  CheckSquare,
  ClipboardList,
  FileSearch,
  LayoutDashboard,
  MessageSquare,
  Package,
  Search,
  ShoppingCart,
  Users,
  ChevronDown,
  Sparkles,
  MessageSquareText,
  Building2,
  UserPlus,
  UserRound,
  Bot,
  BrainCircuit,
  List,
  Rocket,
  Inbox,
} from 'lucide-react';
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuAction,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarMenuSub,
  SidebarMenuSubButton,
  SidebarMenuSubItem,
  SidebarProvider,
  SidebarTrigger,
} from '@/components/ui/sidebar';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { cn } from '@/lib/utils';

const menuData = {
  navMain: [
    {
      title: '每日工作安排',
      url: '/daily',
      icon: LayoutDashboard,
    },
    {
      title: '🚀 我的项目',
      url: '/projects',
      icon: Rocket,
    },
    {
      title: '工作流输出',
      url: '/workflow',
      icon: Inbox,
    },
    {
      title: 'Company',
      url: '/company',
      icon: Building2,
      items: [
        {
          title: '员工列表',
          url: '/company/employees',
          icon: UserRound,
        },
        {
          title: '开发看板',
          url: '/company/kanban',
          icon: LayoutDashboard,
        },
      ],
    },
    {
      title: '事务中心',
      url: '/tasks',
      icon: ClipboardList,
      items: [
        {
          title: '项目立项',
          url: '/tasks/project-initiation',
          icon: Users,
        },
        {
          title: '需求分析',
          url: '/tasks/requirements',
          icon: FileSearch,
        },
        {
          title: '版本管理',
          url: '/tasks/versions',
          icon: CheckSquare,
        },
        {
          title: '交付管理',
          url: '/tasks/delivery',
          icon: Package,
        },
      ],
    },
    {
      title: '工具清单',
      url: '/tools',
      icon: Calendar,
      items: [
        {
          title: '自动下单',
          url: '/tools/auto-order',
          icon: ShoppingCart,
        },
        {
          title: '会议助手',
          url: '/tools/meeting-assistant',
          icon: MessageSquare,
        },
        {
          title: '快速搜索',
          url: '/tools/quick-search',
          icon: Search,
        },
        {
          title: '聊天记录分析',
          url: '/tools/chat-analyzer',
          icon: MessageSquareText,
        },
      ],
    },
    {
      title: 'AI',
      url: '/ai',
      icon: BrainCircuit,
      items: [
        {
          title: 'AI Agent',
          url: '/tools/agent',
          icon: Bot,
        },
        {
          title: 'Agent 列表',
          url: '/agents',
          icon: List,
        },
      ],
    },
  ],
};

export function AppSidebar() {
  const pathname = usePathname();

  return (
    <Sidebar side="left" variant="floating" collapsible="icon">
      <SidebarHeader className="py-4">
        <SidebarMenuButton asChild>
          <Link href="/" className="flex items-center gap-3 group">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-indigo-500 to-purple-600 text-white shadow-lg shadow-indigo-500/25 transition-all group-hover:scale-105 group-hover:shadow-indigo-500/40">
              <Sparkles className="h-5 w-5" />
            </div>
            <div className="flex flex-col">
              <span className="font-semibold text-sm">Claw Studio</span>
              <span className="text-xs text-muted-foreground">工作台</span>
            </div>
          </Link>
        </SidebarMenuButton>
      </SidebarHeader>
      <SidebarContent className="px-3">
        {menuData.navMain.map((item) => (
          <Collapsible key={item.title} defaultOpen={!!item.items} className="group/collapsible">
            <SidebarGroup className="p-0">
              <CollapsibleTrigger asChild>
                <SidebarGroupLabel className="flex items-center gap-2 px-2 py-1.5 text-xs font-medium text-muted-foreground hover:text-foreground transition-colors cursor-pointer">
                  {item.items && (
                    <ChevronDown className="h-3 w-3 transition-transform group-data-[state=open]/collapsible:rotate-90" />
                  )}
                  <span className="flex-1 text-left">{item.title}</span>
                </SidebarGroupLabel>
              </CollapsibleTrigger>
              <CollapsibleContent>
                <SidebarGroupContent>
                  <SidebarMenu>
                    {item.items ? (
                      item.items.map((subItem) => (
                        <SidebarMenuItem key={subItem.title}>
                          <SidebarMenuButton
                            asChild
                            isActive={pathname === subItem.url}
                            className="h-9"
                          >
                            <Link href={subItem.url} className="flex items-center gap-2.5">
                              <div className={cn(
                                "flex h-7 w-7 items-center justify-center rounded-lg transition-colors",
                                pathname === subItem.url
                                  ? "bg-primary/10 text-primary"
                                  : "bg-muted text-muted-foreground group-hover/collapsible:bg-muted group-hover/collapsible:text-foreground"
                              )}>
                                {subItem.icon && <subItem.icon className="h-3.5 w-3.5" />}
                              </div>
                              <span className="text-sm">{subItem.title}</span>
                            </Link>
                          </SidebarMenuButton>
                        </SidebarMenuItem>
                      ))
                    ) : (
                      <SidebarMenuItem>
                        <SidebarMenuButton
                          asChild
                          isActive={pathname === item.url}
                          className="h-9"
                        >
                          <Link href={item.url} className="flex items-center gap-2.5">
                            <div className={cn(
                              "flex h-7 w-7 items-center justify-center rounded-lg transition-colors",
                              pathname === item.url
                                ? "bg-primary/10 text-primary"
                                : "bg-muted text-muted-foreground group-hover:text-foreground"
                            )}>
                              {item.icon && <item.icon className="h-3.5 w-3.5" />}
                            </div>
                            <span className="text-sm">{item.title}</span>
                          </Link>
                        </SidebarMenuButton>
                      </SidebarMenuItem>
                    )}
                  </SidebarMenu>
                </SidebarGroupContent>
              </CollapsibleContent>
            </SidebarGroup>
          </Collapsible>
        ))}
      </SidebarContent>
      <SidebarFooter className="p-3">
        <div className="flex items-center gap-2 rounded-lg bg-muted/50 p-2 text-xs text-muted-foreground">
          <div className="flex h-2 w-2 rounded-full bg-green-500 animate-pulse" />
          <span>服务运行中</span>
        </div>
      </SidebarFooter>
    </Sidebar>
  );
}

export function SidebarLayout({ children, fullWidth = false }: { children: React.ReactNode; fullWidth?: boolean }) {
  return (
    <SidebarProvider defaultOpen>
      <AppSidebar />
      <main className="flex-1 min-h-screen bg-gradient-to-br from-background via-background to-muted/20">
        {fullWidth ? (
          <div className="h-full w-full">
            {children}
          </div>
        ) : (
          <div className="container mx-auto p-6 max-w-7xl">
            {children}
          </div>
        )}
      </main>
    </SidebarProvider>
  );
}
