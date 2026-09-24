export interface McpApiKey {
    id: string;
    key_value: string;
    name: string;
    status: 'active' | 'revoked';
    mode: 'full' | 'readonly';
    last_used_at: string | null;
    created_at: string;
}
/** 创建新 Key */
export declare function createApiKey(name: string, mode?: 'full' | 'readonly'): McpApiKey;
/** 获取所有 Key */
export declare function getAllApiKeys(): McpApiKey[];
/** 验证 Key，返回 Key 信息或 null */
export declare function verifyApiKey(keyValue: string): McpApiKey | null;
/** 吊销 Key */
export declare function revokeApiKey(id: string): boolean;
/** 删除 Key */
export declare function deleteApiKey(id: string): boolean;
/** 从 Authorization header 提取 key */
export declare function extractApiKey(authHeader: string | undefined): string | null;
//# sourceMappingURL=mcp-auth.d.ts.map