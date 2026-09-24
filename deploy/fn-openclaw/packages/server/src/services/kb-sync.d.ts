/**
 * 知识库同步服务
 * 将飞书文档数据同步到 ~/.hermes/knowledge-base/ 中
 * 从 scripts/sync-to-knowledge.mjs 提取，服务化后可供服务器调度
 */
export declare function syncDocument(docId: string): boolean;
export declare function syncAll(): {
    success: number;
    failed: number;
    details: string[];
};
export declare function getDocMappings(): Record<string, {
    project: string;
    type: string;
}>;
export declare function updateDocMapping(docId: string, mapping: {
    project: string;
    type: string;
}): void;
//# sourceMappingURL=kb-sync.d.ts.map