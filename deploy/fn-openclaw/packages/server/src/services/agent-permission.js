// F:\youxi\app\openclaw\packages\server\src\services\agent-permission.ts
// Agent 高风险工具执行的用户确认机制
const pendingPermissions = new Map();
function makeKey(loopId, toolCallId) {
    return `${loopId}:${toolCallId}`;
}
/** 等待用户对指定工具调用进行确认 */
export function waitForPermission(loopId, toolCallId, timeoutMs = 5 * 60 * 1000) {
    const key = makeKey(loopId, toolCallId);
    if (pendingPermissions.has(key)) {
        return Promise.reject(new Error("该工具调用已在等待确认"));
    }
    return new Promise((resolve, reject) => {
        const timeout = setTimeout(() => {
            pendingPermissions.delete(key);
            reject(new Error("等待用户确认超时"));
        }, timeoutMs);
        pendingPermissions.set(key, {
            resolve: (approved, reason) => {
                clearTimeout(timeout);
                pendingPermissions.delete(key);
                resolve({ approved, reason });
            },
            reject: (reason) => {
                clearTimeout(timeout);
                pendingPermissions.delete(key);
                reject(new Error(reason));
            },
            timeout,
        });
    });
}
/** 用户通过 API 响应确认或拒绝 */
export function resolvePermission(loopId, toolCallId, approved, reason) {
    const key = makeKey(loopId, toolCallId);
    const resolver = pendingPermissions.get(key);
    if (!resolver)
        return false;
    resolver.resolve(approved, reason);
    return true;
}
/** 是否存在待确认的权限请求 */
export function hasPendingPermission(loopId, toolCallId) {
    return pendingPermissions.has(makeKey(loopId, toolCallId));
}
//# sourceMappingURL=agent-permission.js.map