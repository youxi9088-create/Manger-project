declare const router: import("express-serve-static-core").Router;
type U9Conversation = {
    id: string;
    name: string;
};
type U9ConversationLoad = {
    sessions: U9Conversation[];
    source: 'u9_api' | 'local_chat_records' | 'u9_api_merged' | 'u9_data_store';
};
/**
 * F functions keep runtime files in /tmp, which are cleared after a cold start.
 * Restore the active U9 configuration from the packaged local-login snapshot
 * before an endpoint attempts to call the U9 API.
 */
export declare function ensureU9Configuration(): Promise<{
    sessions: U9Conversation[];
    source: U9ConversationLoad['source'] | 'runtime';
}>;
export default router;
//# sourceMappingURL=im-u9.d.ts.map