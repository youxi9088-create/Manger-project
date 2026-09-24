import Database from 'better-sqlite3';
export interface ImDbConfig {
    basePath?: string;
    employeeId: string;
}
export interface ImMessage {
    msg_id: string;
    sender_id: string;
    sender_name: string;
    group_id: string | null;
    group_name: string | null;
    content: string;
    msg_type: string;
    create_time: string;
    is_mentioned: number;
}
export declare function getDbPath(basePath: string, employeeId: string): string;
export declare function openImDatabase(config: ImDbConfig): Database.Database | null;
export declare function getMessageTables(db: Database.Database): string[];
export declare function getMessagesFromDb(db: Database.Database, options?: {
    startTime?: number;
    endTime?: number;
    limit?: number;
    offset?: number;
}): ImMessage[];
export declare function getConversationList(db: Database.Database): Array<{
    id: string;
    name: string;
    type: string;
    lastMessage?: string;
    lastTime?: string;
}>;
export declare function getMessagesByConversation(db: Database.Database, convId: string, options?: {
    startTime?: number;
    endTime?: number;
    limit?: number;
    offset?: number;
}): ImMessage[];
export declare function testConnection(config: ImDbConfig): {
    success: boolean;
    message: string;
    keyPreview?: string;
};
//# sourceMappingURL=im-db.d.ts.map