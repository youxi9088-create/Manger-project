"use client";

import dynamic from "next/dynamic";

// MCP 自动下单组件（原 mcp/App.tsx）
// 注意：这些组件原来使用 Tailwind CDN + lucide-react，
// 在 Next.js + shadcn 环境下样式基本兼容（都用 Tailwind）
const AutoOrderApp = dynamic(
  () => import("@/components/auto-order/AutoOrderApp"),
  { 
    ssr: false,
    loading: () => (
      <div className="flex items-center justify-center h-[calc(100vh-48px)] bg-slate-950 text-slate-400">
        <div>加载自动下单模块...</div>
      </div>
    ),
  }
);

export default function AutoOrderPage() {
  return (
    <div className="w-full h-[calc(100vh-48px)] overflow-auto bg-slate-950">
      <AutoOrderApp />
    </div>
  );
}
