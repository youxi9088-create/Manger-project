import { unstable_v2_authenticate, unstable_v2_createSession } from "@tencent-ai/agent-sdk";
// 缓存可用模型列表
export let cachedModels = [];
export const defaultModel = "glm-5.0-turbo";
// 账号支持的模型列表（用于校验/回退）
const SUPPORTED_MODELS = [
    "glm-5.1", "glm-5.0", "glm-5.0-turbo", "glm-5v-turbo",
    "glm-4.7", "minimax-m2.7", "minimax-m2.5",
    "kimi-k2.5", "deepseek-v3-2-volc", "hunyuan-2.0-thinking",
];
/** 校验模型是否有效，无效则回退到默认模型 */
export function resolveModel(model) {
    if (!model)
        return defaultModel;
    if (SUPPORTED_MODELS.includes(model))
        return model;
    console.warn(`[SDK] 模型 "${model}" 不支持，回退到 ${defaultModel}`);
    return defaultModel;
}
export function clearCachedModels() {
    cachedModels = [];
}
// 存储认证 token
let _authToken;
let _lastAuthTime = 0;
const AUTH_CACHE_TTL = 10 * 60 * 1000; // 10分钟
// 获取认证 token（带缓存）
export async function getAuthToken(internetEnv) {
    if (_authToken && Date.now() - _lastAuthTime < AUTH_CACHE_TTL) {
        console.log('[Auth] 使用缓存的 token');
        return _authToken;
    }
    console.log('[Auth] 获取新 token...');
    const result = await unstable_v2_authenticate({
        environment: internetEnv,
        onAuthUrl: (authState) => {
            console.log('[Auth] 需要登录, URL:', authState.authUrl);
        },
    });
    _authToken = result.userinfo?.token;
    _lastAuthTime = Date.now();
    console.log('[Auth] 获取 token 成功');
    return _authToken;
}
// 创建 Agent SDK 会话
export async function createAgentSession(options) {
    const internetEnv = process.env.CODEBUDDY_INTERNET_ENVIRONMENT || 'external';
    const token = await getAuthToken(internetEnv);
    return unstable_v2_createSession({
        cwd: options.cwd || process.cwd(),
        model: options.model || defaultModel,
        environment: internetEnv,
        env: {
            CODEBUDDY_AUTH_TOKEN: token,
            CODEBUDDY_INTERNET_ENVIRONMENT: internetEnv,
        },
        permissionMode: (options.permissionMode || 'default'),
    });
}
//# sourceMappingURL=agent-sdk.js.map