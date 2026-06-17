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

import crypto from 'crypto';

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

export class U9ApiClient {
  private config: U9ApiConfig;

  constructor(config: Partial<U9ApiConfig> = {}) {
    this.config = {
      baseUrl: config.baseUrl || process.env.U9_API_BASE_URL || 'https://im-message-search.sdp.101.com',
      authId: config.authId || process.env.U9_API_AUTH_ID || '',
      authKey: config.authKey || process.env.U9_API_AUTH_KEY || '',
      appId: config.appId || process.env.U9_SDP_APP_ID || '',
      diff: config.diff !== undefined ? config.diff : (parseInt(process.env.U9_API_DIFF || '0') || 0),
    };
  }

  /**
   * 生成 MAC 认证头
   */
  private generateMacAuth(method: string, uri: string, host?: string): string {
    const timestamp = Date.now() + this.config.diff;
    const random = this.randomString(8).toUpperCase();
    const nonce = `${timestamp}:${random}`;
    const actualHost = host || this.getHost();
    const macData = `${nonce}\n${method.toUpperCase()}\n${uri}\n${actualHost}\n`;
    const mac = crypto
      .createHmac('sha256', this.config.authKey)
      .update(macData)
      .digest('base64');
    return `MAC id="${this.config.authId}",nonce="${nonce}",mac="${mac}"`;
  }

  private randomString(length: number): string {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
    let result = '';
    for (let i = 0; i < length; i++) {
      result += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return result;
  }

  /**
   * 获取请求头
   */
  private getHeaders(uri: string, method: string = 'GET', host?: string, origin?: string): Record<string, string> {
    const headers: Record<string, string> = {
      'Accept': 'application/json, text/plain, */*',
      'Accept-Language': 'zh-CN',
      'Authorization': this.generateMacAuth(method, uri, host),
      'Origin': origin || 'https://im-his.sdp.101.com',
      'Referer': origin ? `${origin}/` : 'https://im-his.sdp.101.com/',
      'platform-type': 'web',
    };
    if (this.config.appId) {
      headers['sdp-app-id'] = this.config.appId;
    }
    return headers;
  }

  private getHost(): string {
    try {
      return new URL(this.config.baseUrl).host;
    } catch {
      return 'im-message-search.sdp.101.com';
    }
  }

  /**
   * 解析 content 字段
   * 实际格式: "Content-Type: text/plain\r\n\r\n{实际内容}" 或 "Content-Type: rich/xml\r\n..."
   */
  private parseContent(raw: string): { type: string; text: string } {
    if (!raw) return { type: 'text', text: '' };
    const match = raw.match(/^Content-Type:\s*(\S+)\s*\r?\n\r?\n([\s\S]*)$/);
    if (match) {
      return { type: match[1], text: match[2].trim() };
    }
    return { type: 'text', text: raw };
  }

  /**
   * 搜索/获取消息（单次请求）
   *
   * 翻页说明：
   *   - 第一次请求不带 beforeMsgId，返回最新一批消息
   *   - 响应中 pre=0 表示已到最旧消息；pre>0 表示还有更多历史
   *   - 将本批最早消息的 conv_msg_id 作为下次请求的 beforeMsgId
   */
  async searchMessages(params: SearchMessageParams & { myName?: string }): Promise<SearchResponse> {
    const { convId, limit = 30, beginTime, endTime, myName } = params;

    const queryParams = new URLSearchParams();
    queryParams.set('$limit', String(limit));
    queryParams.set('_r', String(Date.now()));
    if (params.beforeMsgId !== undefined && params.beforeMsgId !== '') {
      queryParams.set('before_msg_id', String(params.beforeMsgId));
    }
    if (beginTime) queryParams.set('begin_time', beginTime);
    if (endTime) queryParams.set('end_time', endTime);

    const host = this.getHost();
    const uri = `/v2.0/api/msg/${convId}?${queryParams.toString()}`;
    const url = `${this.config.baseUrl}${uri}`;

    const response = await fetch(url, {
      method: 'GET',
      headers: this.getHeaders(uri, 'GET', host),
    });

    if (!response.ok) {
      const text = await response.text();
      throw new Error(`API ${response.status}: ${text.substring(0, 200)}`);
    }

    const data = await response.json();
    return this.transformSearchResponse(data, convId, myName);
  }

  /**
   * 转换消息搜索响应
   * 实际字段: conv_msg_id, sender, time, content, msg_id, flag, name
   *
   * pre 字段含义:
   *   0  => 已到最旧消息，无法继续往前翻页
   *   >0 => 还有更旧的消息，用本批最早消息的 conv_msg_id 作 before_msg_id 继续请求
   */
  private transformSearchResponse(data: any, convId: string, myName?: string): SearchResponse {
    const items: any[] = data.items || data.data || [];
    // pre=0 表示无更多，pre>0 表示还有更旧消息
    const pre: number = typeof data.pre === 'number' ? data.pre : (items.length > 0 ? 1 : 0);

    const messages: U9Message[] = items.map((item: any) => {
      const { type: contentType, text } = this.parseContent(item.content || '');
      // 检测是否 @我：消息内容中包含 @myName
      const isMentioned = myName
        ? text.includes(`@${myName}`) || text.includes(`@ ${myName}`)
        : false;
      return {
        msg_id: item.msg_id || item.conv_msg_id || '',
        conv_msg_id: String(item.conv_msg_id || ''),
        conv_id: convId,
        sender_id: String(item.sender || ''),
        sender_name: item.name || 'Unknown',
        content: text,
        msg_type: contentType === 'rich/xml' ? 'rich' : 'text',
        create_time: item.time || '',
        is_mentioned: isMentioned,
      };
    });

    // API 返回顺序为最新→最旧，最后一条是最旧的，用于下次翻页游标
    const earliestItem = items[items.length - 1];
    const earliest_conv_msg_id = earliestItem ? String(earliestItem.conv_msg_id || '') : undefined;

    return {
      messages,
      total: messages.length,
      pre,
      has_more: pre !== 0 && messages.length > 0,
      earliest_conv_msg_id,
    };
  }

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
  async getAllMessages(
    convId: string,
    options: { beginTime?: string; endTime?: string; keyword?: string; maxMessages?: number; myName?: string } = {}
  ): Promise<U9Message[]> {
    const { maxMessages = 100, myName } = options;
    const allMessages: U9Message[] = [];
    let beforeMsgId: string | undefined = undefined;
    const limit = 100;
    let pageCount = 0;
    const maxPages = Math.ceil(maxMessages / limit) + 2;

    console.log(`[U9 getAllMessages] convId=${convId}, maxMessages=${maxMessages}`);

    while (allMessages.length < maxMessages && pageCount < maxPages) {
      pageCount++;
      const response = await this.searchMessages({
        convId,
        keyword: options.keyword,
        beginTime: options.beginTime,
        endTime: options.endTime,
        beforeMsgId,
        limit,
        myName,
      });

      if (response.messages.length === 0) {
        console.log(`[U9 getAllMessages] page=${pageCount} 返回空，停止`);
        break;
      }

      allMessages.push(...response.messages);
      console.log(`[U9 getAllMessages] page=${pageCount} 获取 ${response.messages.length} 条，pre=${response.pre}，累计 ${allMessages.length}`);

      if (!response.has_more || response.pre === 0) {
        console.log(`[U9 getAllMessages] pre=0，已到最旧消息，停止翻页`);
        break;
      }

      // 用本批最早消息的 conv_msg_id 作为下次游标
      beforeMsgId = response.earliest_conv_msg_id;
      if (!beforeMsgId) {
        console.log(`[U9 getAllMessages] 无法获取游标，停止`);
        break;
      }

      // 避免请求过快
      await new Promise(resolve => setTimeout(resolve, 300));
    }

    // 反转为时间升序（最旧→最新）
    const sorted = allMessages.reverse();
    console.log(`[U9 getAllMessages] 完成，共 ${sorted.length} 条消息`);
    return sorted.slice(0, maxMessages);
  }

  /**
   * 获取好友列表
   */
  async getFriends(options: { limit?: number; offset?: number } = {}): Promise<any[]> {
    const { limit = 200, offset = 0 } = options;
    const host = 'im-friend.sdp.101.com';
    const uri = `/v0.1/friends?$offset=${offset}&$limit=${limit}&show_remark=false`;
    const url = `https://${host}${uri}`;

    const response = await fetch(url, {
      method: 'GET',
      headers: this.getHeaders(uri, 'GET', host, 'https://ndim.101.com'),
    });

    if (!response.ok) {
      const text = await response.text();
      throw new Error(`Friends API ${response.status}: ${text.substring(0, 200)}`);
    }

    const data = await response.json();
    return data.items || [];
  }

  /**
   * 获取群组列表（通过 imgroup.101.com API 分页获取所有群组）
   */
  async getGroups(userId: string, options: { limit?: number } = {}): Promise<{ id: string; name: string }[]> {
    const { limit = 100 } = options;
    const host = 'imgroup.101.com';
    const allGroups: { id: string; name: string }[] = [];
    let offset = 0;
    const maxPages = 30; // 最多3000个群

    for (let page = 0; page < maxPages; page++) {
      const uri = `/v0.2/entities/${userId}/groups?$offset=${offset}&$limit=${limit}`;
      const url = `https://${host}${uri}`;

      const response = await fetch(url, {
        method: 'GET',
        headers: this.getHeaders(uri, 'GET', host, 'https://ndim.101.com'),
      });

      if (!response.ok) {
        const text = await response.text();
        throw new Error(`Groups API ${response.status}: ${text.substring(0, 200)}`);
      }

      const data = await response.json();
      const items = data.items || data.groups || [];

      if (items.length === 0) break;

      for (const item of items) {
        const id = String(item.conv_id || item.group_id || item.id || '');
        const name = item.name || item.group_name || '';
        if (id) {
          allGroups.push({ id, name });
        }
      }

      // 如果本批不足 limit 条，说明已经全部获取
      if (items.length < limit) break;
      offset += limit;

      // 避免请求过快
      await new Promise(resolve => setTimeout(resolve, 200));
    }

    return allGroups;
  }

  /**
   * 获取所有好友（私聊会话），自动翻页
   */
  async getAllFriends(options: { limit?: number } = {}): Promise<{ id: string; name: string }[]> {
    const { limit = 200 } = options;
    const allFriends: { id: string; name: string }[] = [];
    let offset = 0;
    const maxPages = 20; // 最多4000好友

    for (let page = 0; page < maxPages; page++) {
      const items = await this.getFriends({ limit, offset });

      if (items.length === 0) break;

      for (const item of items) {
        const id = String(item.conv_id || item.user_id || item.id || '');
        const name = item.remark || item.nick_name || item.name || '';
        if (id) {
          allFriends.push({ id, name });
        }
      }

      if (items.length < limit) break;
      offset += limit;

      await new Promise(resolve => setTimeout(resolve, 200));
    }

    return allFriends;
  }

  isConfigured(): boolean {
    return !!(this.config.authId && this.config.authKey);
  }

  getConfigStatus() {
    return {
      configured: this.isConfigured(),
      hasAuthId: !!this.config.authId,
      hasAuthKey: !!this.config.authKey,
      hasAppId: !!this.config.appId,
      baseUrl: this.config.baseUrl,
    };
  }
}

// 导出单例实例
export const u9ApiClient = new U9ApiClient();
