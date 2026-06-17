import type { Metadata } from 'next';
import { Inspector } from 'react-dev-inspector';
import './globals.css';
import { SidebarLayout } from '@/components/app-sidebar';

export const metadata: Metadata = {
  title: {
    default: 'OpenClaw 工作室',
    template: '%s | OpenClaw 工作室',
  },
  description:
    'OpenClaw 工作室 - 工具集合与服务运行状态监控平台。提供高效的开发工具和实时服务状态追踪。',
  keywords: [
    'OpenClaw',
    '工具集合',
    '服务监控',
    '开发工具',
    '状态监控',
    '工作室',
  ],
  authors: [{ name: 'OpenClaw Team' }],
  generator: 'Next.js',
  openGraph: {
    title: 'OpenClaw 工作室 | 工具集合与服务监控',
    description:
      '一站式工具集合平台，实时监控服务运行状态，助力高效开发。',
    siteName: 'OpenClaw 工作室',
    locale: 'zh_CN',
    type: 'website',
  },
  robots: {
    index: true,
    follow: true,
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const isDev = process.env.COZE_PROJECT_ENV === 'DEV';

  return (
    <html lang="zh-CN" className="dark">
      <body className={`antialiased`}>
        {isDev && <Inspector />}
        <SidebarLayout fullWidth>{children}</SidebarLayout>
      </body>
    </html>
  );
}
