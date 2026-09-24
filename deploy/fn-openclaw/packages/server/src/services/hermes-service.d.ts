export interface HermesSession {
    sessionId: string;
    historyMessages: Array<{
        role: "user" | "assistant";
        content: string;
    }>;
}
export interface HermesChatResult {
    response: string;
    sessionId: string;
    duration_ms: number;
}
/** 准备会话：保存用户消息，读取近期历史 */
export declare function prepareHermesSession(params: {
    sessionId?: string;
    message: string;
}): Promise<HermesSession>;
/** 运行 Hermes 单轮对话 */
export declare function runHermesChat(params: {
    sessionId: string;
    message: string;
    historyMessages: Array<{
        role: "user" | "assistant";
        content: string;
    }>;
}): Promise<HermesChatResult>;
//# sourceMappingURL=hermes-service.d.ts.map