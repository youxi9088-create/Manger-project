/**
 * 99U IM API 客户端
 * 基于 im-his.sdp.101.com 网页版实际抓包数据实现
 *
 * 认证方式: MAC 认证
 * 格式: MAC id="<hex_id>",nonce="<timestamp:random>",mac="<base64_hmac>"
 *
 * 必要请求头:
 * - Authorization: MAC id="...",nonce="...",mac="..."
 * - sdp-app-id: 应用标识 UUID
 * - Origin: https://im-his.sdp.101.com
 * - platform-type: web
 *
 * 实际接口（2026-03-21 验证通过）:
 * - 消息搜索: GET https://im-message-search.sdp.101.com/v2.0/api/msg/{convId}?$limit=30&_r=...
 *   响应: { pre: number, items: [{conv_msg_id, sender, time, content, msg_id, flag, name}] }
 *   pre: 游标值，0=已到最旧消息，>0=还有更多历史
 *   翻页: 用最早一条的 conv_msg_id 作为 before_msg_id 参数继续请求
 * - 好友列表: GET https://im-friend.sdp.101.com/v0.1/friends?$limit=30&$offset=0
 *   响应: { total: number, items: [{conv_id, user_id, uri, ...}] }
 */
interface U9ApiConfig {
    baseUrl: string;
    authId: string;
    authKey: string;
    appId: string;
    diff: number;
}
interface SearchMessageParams {
    convId: string;
    keyword?: string;
    beginTime?: string;
    endTime?: string;
    /** 游标翻页：传入上一批最早消息的 conv_msg_id，向前拉取更旧的消息 */
    beforeMsgId?: string | number;
    limit?: number;
}
/** 标准化后的消息格式 */
export interface U9Message {
    msg_id: string;
    /** 会话内顺序 ID，用于游标翻页 */
    conv_msg_id?: string;
    conv_id: string;
    sender_id: string;
    sender_name: string;
    content: string;
    msg_type: string;
    create_time: string;
    is_mentioned?: boolean;
}
interface SearchResponse {
    messages: U9Message[];
    total: number;
    /** pre=0 表示已到最旧消息，无更多历史 */
    pre: number;
    has_more: boolean;
    /** 本批最早消息的 conv_msg_id，下次请求作为 beforeMsgId 使用 */
    earliest_conv_msg_id?: string;
}
export declare class U9ApiClient {
    private config;
    constructor(config?: Partial<U9ApiConfig>);
    /**
     * 生成 MAC 认证头
     */
    private generateMacAuth;
    private randomString;
    /**
     * 获取请求头
     */
    private getHeaders;
    private getHost;
    /**
     * 解析 content 字段
     * 实际格式: "Content-Type: text/plain\r\n\r\n{实际内容}" 或 "Content-Type: rich/xml\r\n..."
     */
    private parseContent;
    /**
     * 搜索/获取消息（单次请求）
     *
     * 翻页说明：
     *   - 第一次请求不带 beforeMsgId，返回最新一批消息
     *   - 响应中 pre=0 表示已到最旧消息；pre>0 表示还有更多历史
     *   - 将本批最早消息的 conv_msg_id 作为下次请求的 beforeMsgId
     */
    searchMessages(params: SearchMessageParams & {
        myName?: string;
    }): Promise<SearchResponse>;
    /**
     * 转换消息搜索响应
     * 实际字段: conv_msg_id, sender, time, content, msg_id, flag, name
     *
     * pre 字段含义:
     *   0  => 已到最旧消息，无法继续往前翻页
     *   >0 => 还有更旧的消息，用本批最早消息的 conv_msg_id 作 before_msg_id 继续请求
     */
    private transformSearchResponse;
    /**
     * 批量获取所有消息（基于游标自动翻页，拉取全量历史消息）
     *
     * 翻页原理：
     *   1. 第一次请求不带 beforeMsgId，获取最新一批
     *   2. 用返回的 earliest_conv_msg_id 作为下次请求的 beforeMsgId 往前翻
     *   3. 当 pre===0 或返回空时停止
     *
     * 结果按时间升序返回（最旧→最新）
     */
    getAllMessages(convId: string, options?: {
        beginTime?: string;
        endTime?: string;
        keyword?: string;
        maxMessages?: number;
        myName?: string;
    }): Promise<U9Message[]>;
    /**
     * 获取好友列表
     */
    getFriends(options?: {
        limit?: number;
        offset?: number;
    }): Promise<any[]>;
    /**
     * 获取群组列表（通过 imgroup.101.com API 分页获取所有群组）
     */
    getGroups(userId: string, options?: {
        limit?: number;
    }): Promise<{
        id: string;
        name: string;
    }[]>;
    /**
     * 获取所有好友（私聊会话），自动翻页
     */
    getAllFriends(options?: {
        limit?: number;
    }): Promise<{
        id: string;
        name: string;
    }[]>;
    isConfigured(): boolean;
    getConfigStatus(): {
        configured: boolean;
        hasAuthId: boolean;
        hasAuthKey: boolean;
        hasAppId: boolean;
        baseUrl: string;
    };
}
export declare const u9ApiClient: U9ApiClient;
export {};
//# sourceMappingURL=u9-api.d.ts.map