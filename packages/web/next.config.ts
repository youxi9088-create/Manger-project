import type { NextConfig } from 'next';
import path from 'path';

const basePath = process.env.NEXT_PUBLIC_BASE_PATH || '';

const nextConfig: NextConfig = {
  ...(basePath ? { basePath } : {}),
  allowedDevOrigins: ['*.dev.coze.site', 'bc0301010103', 'localhost', '127.0.0.1', '192.168.56.173'],
  eslint: {
    ignoreDuringBuilds: true,
  },
  // turbopack config removed - was causing 'entryCSSFiles' invariant error
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: 'lf-coze-web-cdn.coze.cn',
        pathname: '/**',
      },
    ],
  },
  async rewrites() {
    return [
      // 飞书 API 代理
      {
        source: '/feishu-api/:path*',
        destination: 'https://open.feishu.cn/:path*',
      },
    ];
  },
};

export default nextConfig;
