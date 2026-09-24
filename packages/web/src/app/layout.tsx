import type { Metadata } from 'next';
import { Inspector } from 'react-dev-inspector';
import './globals.css';
import { SidebarLayout } from '@/components/app-sidebar';
import { DM_Sans, JetBrains_Mono } from 'next/font/google';

const dmSans = DM_Sans({
  subsets: ['latin'],
  variable: '--font-dm-sans',
  weight: ['400', '500', '600', '700'],
});

const jetbrainsMono = JetBrains_Mono({
  subsets: ['latin'],
  variable: '--font-jetbrains-mono',
  weight: ['400', '500', '600'],
});

export const metadata: Metadata = {
  title: {
    default: 'OpenClaw 工作室',
    template: '%s | OpenClaw 工作室',
  },
  description:
    'OpenClaw 工作室 - AI 驱动的项目协作平台。提供智能日报、会议分析、项目跟踪与 AI 工作流能力。',
  keywords: [
    'OpenClaw',
    'AI 项目管理',
    '项目协作',
    '会议助手',
    '工作流',
    '智能日报',
  ],
  authors: [{ name: 'OpenClaw Team' }],
  generator: 'Next.js',
  openGraph: {
    title: 'OpenClaw 工作室 | AI 驱动的项目协作平台',
    description:
      '一站式 AI 项目协作平台，智能日报、会议分析、项目跟踪与 AI 工作流。',
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
      <body className={`${dmSans.variable} ${jetbrainsMono.variable} antialiased`}>
        {isDev && <Inspector />}
        <SidebarLayout fullWidth>{children}</SidebarLayout>
      </body>
    </html>
  );
}
