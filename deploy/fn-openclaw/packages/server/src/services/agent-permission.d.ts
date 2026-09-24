export interface PermissionResolver {
    resolve: (approved: boolean, reason?: string) => void;
    reject: (reason: string) => void;
    timeout: NodeJS.Timeout;
}
/** 等待用户对指定工具调用进行确认 */
export declare function waitForPermission(loopId: string, toolCallId: string, timeoutMs?: number): Promise<{
    approved: boolean;
    reason?: string;
}>;
/** 用户通过 API 响应确认或拒绝 */
export declare function resolvePermission(loopId: string, toolCallId: string, approved: boolean, reason?: string): boolean;
/** 是否存在待确认的权限请求 */
export declare function hasPendingPermission(loopId: string, toolCallId: string): boolean;
//# sourceMappingURL=agent-permission.d.ts.map