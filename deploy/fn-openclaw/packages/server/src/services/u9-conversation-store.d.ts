export type U9StoredConversation = {
    id: string;
    name: string;
    updatedAt: string;
};
export declare function listRemoteU9Conversations(): Promise<U9StoredConversation[]>;
export declare function saveRemoteU9Conversations(conversations: Array<{
    id: string;
    name?: string;
}>): Promise<boolean>;
//# sourceMappingURL=u9-conversation-store.d.ts.map