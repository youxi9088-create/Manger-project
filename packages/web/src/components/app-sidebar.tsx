'use client';

import * as React from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  LayoutDashboard,
  CheckSquare,
  FolderKanban,
  Inbox,
  MessageSquare,
  Bot,
  Search,
  Users,
  Calendar,
  ShoppingCart,
  MessageSquareText,
  Building2,
  UserRound,
  ClipboardList,
  FileSearch,
  Rocket,
  Sparkles,
  Command,
  Bell,
  HelpCircle,
  Settings,
  Server,
  Activity,
} from 'lucide-react';
import { cn } from '@/lib/utils';

interface NavItem {
  title: string;
  url: string;
  icon: React.ElementType;
  badge?: number | string;
}

interface NavGroup {
  label: string;
  items: NavItem[];
}

const workspaceItems: NavItem[] = [
  { title: '今日驾驶舱', url: '/', icon: LayoutDashboard },
  { title: '日报计划', url: '/daily', icon: CheckSquare },
  { title: '项目列表', url: '/projects', icon: FolderKanban },
  { title: '项目详情', url: '/projects/1', icon: Inbox },
  { title: '工作流', url: '/workflow', icon: Rocket },
  { title: '会议助手', url: '/tools/meeting-assistant', icon: Calendar },
];

const agentItems: NavItem[] = [
  { title: 'Hermes Agent', url: '/tools/agent', icon: Bot },
  { title: '快速搜索', url: '/tools/quick-search', icon: Search },
];

const teamItems: NavItem[] = [
  { title: '员工目录', url: '/company/employees', icon: Users },
  { title: '团队看板', url: '/company/kanban', icon: LayoutDashboard },
];

const toolItems: NavItem[] = [
  { title: '自动下单', url: '/tools/auto-order', icon: ShoppingCart },
  { title: '聊天记录分析', url: '/tools/chat-analyzer', icon: MessageSquareText },
];

const navGroups: NavGroup[] = [
  { label: '工作区', items: workspaceItems },
  { label: '智能体', items: agentItems },
  { label: '团队', items: teamItems },
  { label: '工具台', items: toolItems },
];

function NavLink({ item, isActive }: { item: NavItem; isActive: boolean }) {
  const Icon = item.icon;
  return (
    <Link
      href={item.url}
      className={cn(
        'group flex items-center gap-3 rounded-lg px-3 py-2 text-sm transition-all duration-180',
        isActive
          ? 'bg-[var(--oc-accent-soft)] text-[var(--oc-accent)]'
          : 'text-[var(--oc-text-secondary)] hover:bg-[var(--oc-bg-hover)] hover:text-[var(--oc-text-primary)]'
      )}
    >
      <Icon className="h-[18px] w-[18px] shrink-0" strokeWidth={1.75} />
      <span className="flex-1 truncate">{item.title}</span>
      {item.badge !== undefined && (
        <span className="ml-auto flex h-5 min-w-5 items-center justify-center rounded-full bg-[var(--oc-bg-elevated)] px-1.5 text-[11px] font-medium text-[var(--oc-text-secondary)]">
          {item.badge}
        </span>
      )}
    </Link>
  );
}

// Production is hosted below /a/openclaw. Keep local development pointed at
// the local server, but never show or call localhost from a deployed build.
const API_BASE = process.env.NEXT_PUBLIC_SERVER_API
  || (process.env.NODE_ENV === 'production' ? '/a/openclaw' : 'http://localhost:3001');

function ServiceStatus() {
  const [status, setStatus] = React.useState<'online' | 'offline'>('offline');
  const [checked, setChecked] = React.useState(false);

  React.useEffect(() => {
    let mounted = true;
    const check = async () => {
      try {
        const resp = await fetch(`${API_BASE}/api/health`, {
          method: 'GET',
          cache: 'no-store',
        });
        if (mounted) {
          setStatus(resp.ok ? 'online' : 'offline');
          setChecked(true);
        }
      } catch {
        if (mounted) {
          setStatus('offline');
          setChecked(true);
        }
      }
    };
    check();
    const id = setInterval(check, 10000);
    return () => {
      mounted = false;
      clearInterval(id);
    };
  }, []);

  return (
    <div className="flex items-center gap-3 rounded-lg p-2">
      <div className={cn(
        'flex h-8 w-8 items-center justify-center rounded-full',
        status === 'online' ? 'bg-green-500/10 text-green-500' : 'bg-red-500/10 text-red-500'
      )}>
        <Activity className="h-4 w-4" strokeWidth={2} />
      </div>
      <div className="flex flex-col overflow-hidden">
        <span className="truncate text-sm font-medium text-[var(--oc-text-primary)]">
          {status === 'online' ? '服务运行中' : '服务未连接'}
        </span>
        <span className="truncate text-xs text-[var(--oc-text-tertiary)]">
          {checked ? `后端 API · ${API_BASE.replace(/^https?:\/\//, '')}` : '检测中...'}
        </span>
      </div>
    </div>
  );
}

export function AppSidebar() {
  const pathname = usePathname();

  return (
    <aside className="fixed left-0 top-0 z-40 flex h-screen w-[240px] flex-col border-r border-[var(--oc-border-subtle)] bg-[var(--oc-bg-surface)]">
      {/* Header */}
      <div className="flex h-16 items-center gap-3 px-5">
        <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-[var(--oc-accent)] text-[var(--oc-bg-root)]">
          <Sparkles className="h-4 w-4" strokeWidth={2} suppressHydrationWarning />
        </div>
        <div className="flex flex-col">
          <span className="text-[15px] font-semibold leading-tight tracking-tight text-[var(--oc-text-primary)]">
            openclaw
          </span>
          <span className="text-[10px] font-medium uppercase tracking-widest text-[var(--oc-text-tertiary)]">
            v1
          </span>
        </div>
      </div>

      {/* Search */}
      <div className="px-4 pb-3">
        <button className="flex w-full items-center gap-2 rounded-lg border border-[var(--oc-border-subtle)] bg-[var(--oc-bg-root)] px-3 py-2 text-left text-sm text-[var(--oc-text-tertiary)] transition-colors hover:border-[var(--oc-border-strong)] hover:text-[var(--oc-text-secondary)]">
          <Search className="h-4 w-4" strokeWidth={1.75} />
          <span className="flex-1">搜索项目、任务、会议...</span>
          <kbd className="hidden rounded bg-[var(--oc-bg-elevated)] px-1.5 py-0.5 text-[10px] font-mono text-[var(--oc-text-tertiary)] sm:block">
            ⌘K
          </kbd>
        </button>
      </div>

      {/* Navigation */}
      <nav className="flex-1 space-y-5 overflow-y-auto px-3 py-2">
        {navGroups.map((group) => (
          <div key={group.label}>
            <h3 className="mb-2 px-3 text-[11px] font-semibold uppercase tracking-wider text-[var(--oc-text-tertiary)]">
              {group.label}
            </h3>
            <ul className="space-y-0.5">
              {group.items.map((item) => {
                const currentPath = pathname ?? '';
                const isActive =
                  item.url === '/' ? currentPath === '/' : currentPath.startsWith(item.url);
                return (
                  <li key={item.title}>
                    <NavLink item={item} isActive={isActive} />
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </nav>

      {/* Footer */}
      <div className="border-t border-[var(--oc-border-subtle)] p-3">
        <ServiceStatus />
      </div>
    </aside>
  );
}

export function TopBar() {
  return (
    <header className="fixed left-[240px] right-0 top-0 z-30 flex h-16 items-center justify-end gap-2 border-b border-[var(--oc-border-subtle)] bg-[var(--oc-bg-root)]/80 px-6 backdrop-blur-md">
      <button className="flex h-9 w-9 items-center justify-center rounded-lg text-[var(--oc-text-secondary)] transition-colors hover:bg-[var(--oc-bg-elevated)] hover:text-[var(--oc-text-primary)]">
        <Bell className="h-[18px] w-[18px]" strokeWidth={1.75} />
      </button>
      <button className="flex h-9 w-9 items-center justify-center rounded-lg text-[var(--oc-text-secondary)] transition-colors hover:bg-[var(--oc-bg-elevated)] hover:text-[var(--oc-text-primary)]">
        <HelpCircle className="h-[18px] w-[18px]" strokeWidth={1.75} />
      </button>
      <button className="flex h-9 w-9 items-center justify-center rounded-lg text-[var(--oc-text-secondary)] transition-colors hover:bg-[var(--oc-bg-elevated)] hover:text-[var(--oc-text-primary)]">
        <Settings className="h-[18px] w-[18px]" strokeWidth={1.75} />
      </button>
    </header>
  );
}

export function SidebarLayout({ children, fullWidth = false }: { children: React.ReactNode; fullWidth?: boolean }) {
  return (
    <div className="min-h-screen bg-[var(--oc-bg-root)]">
      <AppSidebar />
      <TopBar />
      <main
        className={cn(
          'min-h-screen pl-[240px] pt-16',
          fullWidth ? '' : 'container mx-auto max-w-7xl'
        )}
      >
        {children}
      </main>
    </div>
  );
}
