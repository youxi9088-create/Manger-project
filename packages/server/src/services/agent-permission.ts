// F:\youxi\app\openclaw\packages\server\src\services\agent-permission.ts
// Agent 高风险工具执行的用户确认机制

export interface PermissionResolver {
  resolve: (approved: boolean, reason?: string) => void;
  reject: (reason: string) => void;
  timeout: NodeJS.Timeout;
}

const pendingPermissions = new Map<string, PermissionResolver>();

function makeKey(loopId: string, toolCallId: string): string {
  return `${loopId}:${toolCallId}`;
}

/** 等待用户对指定工具调用进行确认 */
export function waitForPermission(loopId: string, toolCallId: string, timeoutMs = 5 * 60 * 1000): Promise<{ approved: boolean; reason?: string }> {
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
export function resolvePermission(loopId: string, toolCallId: string, approved: boolean, reason?: string): boolean {
  const key = makeKey(loopId, toolCallId);
  const resolver = pendingPermissions.get(key);
  if (!resolver) return false;
  resolver.resolve(approved, reason);
  return true;
}

/** 是否存在待确认的权限请求 */
export function hasPendingPermission(loopId: string, toolCallId: string): boolean {
  return pendingPermissions.has(makeKey(loopId, toolCallId));
}
