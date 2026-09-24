export declare let cachedModels: Array<{
    modelId: string;
    name: string;
    description?: string;
}>;
export declare const defaultModel = "glm-5.0-turbo";
/** 校验模型是否有效，无效则回退到默认模型 */
export declare function resolveModel(model?: string): string;
export declare function clearCachedModels(): void;
export declare function getAuthToken(internetEnv: string): Promise<string>;
export declare function createAgentSession(options: {
    cwd?: string;
    model?: string;
    permissionMode?: string;
}): Promise<import("node_modules/@tencent-ai/agent-sdk/lib/session").SessionImpl>;
//# sourceMappingURL=agent-sdk.d.ts.map