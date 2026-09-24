import { Router } from "express";
import { v4 as uuidv4 } from "uuid";
import dayjs from "dayjs";
import * as db from "../services/db.js";
import { U9ApiClient } from "../services/u9-api.js";
import { readEnvFileContent } from "../utils/env.js";
import { ensureU9Configuration } from "./im-u9.js";
const router = Router();
// ============= 获取当天聊天记录（SSE） =============
router.post("/api/im/fetch-today", async (req, res) => {
    const { sourceId } = req.body;
    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache");
    res.setHeader("Connection", "keep-alive");
    const send = (type, data = {}) => {
        res.write(`data: ${JSON.stringify({ type, ...data })}\n\n`);
    };
    try {
        const configuredDirectory = await ensureU9Configuration();
        const envContent = readEnvFileContent();
        const authId = envContent.match(/^U9_API_AUTH_ID=(.*)/m)?.[1]?.trim();
        const authKey = envContent.match(/^U9_API_AUTH_KEY=(.*)/m)?.[1]?.trim();
        const appId = envContent.match(/^U9_SDP_APP_ID=(.*)/m)?.[1]?.trim();
        const convIds = configuredDirectory.sessions.map((session) => session.id);
        if (!authId || !authKey || !appId) {
            send('error', { message: '99U API 未配置，请先在设置中完成自动配置' });
            res.end();
            return;
        }
        if (convIds.length === 0) {
            send('error', { message: '没有配置会话列表，请先完成自动配置' });
            res.end();
            return;
        }
        // 确定或创建数据源
        let targetSourceId = sourceId;
        if (!targetSourceId) {
            const existingSource = db.getAllImSources().find(s => s.type === '99u_web' || s.type === '99u');
            if (existingSource) {
                targetSourceId = existingSource.id;
            }
            else {
                const now = new Date().toISOString();
                const newSource = db.createImSource({
                    id: uuidv4(), name: '99U自动抓取', type: '99u_web',
                    config: '{}', enabled: 1, last_sync_at: null,
                    created_at: now, updated_at: now
                });
                targetSourceId = newSource.id;
                send('log', { message: '已自动创建数据源: 99U自动抓取' });
            }
        }
        // 读取会话名称
        const convNames = Object.fromEntries(configuredDirectory.sessions.map((session) => [session.id, session.name]));
        send('log', { message: `开始抓取 ${convIds.length} 个会话的当天记录...` });
        const u9Client = new U9ApiClient({
            baseUrl: process.env.U9_API_BASE_URL || 'https://im-message-search.sdp.101.com',
            authId, authKey, appId,
            diff: parseInt(process.env.U9_API_DIFF || '0'),
        });
        const myName = envContent.match(/^U9_MY_NAME=(.*)/m)?.[1]?.trim() || process.env.U9_MY_NAME || '';
        const today = dayjs().format('YYYY-MM-DD');
        const dayStartStr = dayjs().startOf('day').format('YYYY-MM-DD HH:mm:ss');
        const dayEndStr = dayjs().endOf('day').format('YYYY-MM-DD HH:mm:ss');
        let totalImported = 0;
        let totalSkipped = 0;
        const failedConvs = [];
        // FN 网关约 30 秒会结束请求；串行遍历数百个会话会稳定触发 504。
        // 采用有限并发，单个会话失败只记录该会话，不拖垮整批采集。
        let completed = 0;
        const workerCount = Math.min(12, convIds.length);
        let nextIndex = 0;
        const processConversation = async (convId) => {
            const convName = convNames[convId] || `会话${convId.slice(-6)}`;
            try {
                const messages = await u9Client.getAllMessages(convId, { maxMessages: 500, beginTime: dayStartStr, endTime: dayEndStr, myName });
                if (messages.length > 0) {
                    const dbRecords = messages.map(msg => ({
                        id: uuidv4(), source_id: targetSourceId,
                        im_message_id: String(msg.msg_id || ''),
                        sender_name: String(msg.sender_name || ''),
                        sender_id: String(msg.sender_id || ''),
                        group_name: convName || '', group_id: String(convId),
                        content: String(msg.content || ''),
                        message_type: String(msg.msg_type || 'text'),
                        timestamp: String(msg.create_time || new Date().toISOString()),
                        is_mentioned: msg.is_mentioned ? 1 : 0,
                        raw_data: JSON.stringify(msg),
                        synced_at: new Date().toISOString(),
                    }));
                    const result = db.importChatRecords(dbRecords);
                    totalImported += result.inserted;
                    totalSkipped += result.skipped;
                    if (result.inserted > 0)
                        send('log', { message: `${convName}: 新增 ${result.inserted} 条` });
                }
            }
            catch (error) {
                const errMsg = error?.message || '未知错误';
                failedConvs.push(convName);
                send('log', { message: `${convName}: 失败 - ${errMsg}` });
            }
            finally {
                completed += 1;
                send('progress', { current: completed, total: convIds.length, conversation: convName });
            }
        };
        const workers = Array.from({ length: workerCount }, async () => {
            while (true) {
                const index = nextIndex++;
                if (index >= convIds.length)
                    return;
                await processConversation(convIds[index].trim());
            }
        });
        await Promise.all(workers);
        if (targetSourceId)
            db.updateImSource(targetSourceId, { last_sync_at: new Date().toISOString() });
        send('done', { message: `抓取完成！新增 ${totalImported} 条，跳过 ${totalSkipped} 条重复`, imported: totalImported, skipped: totalSkipped, failed: failedConvs.length, sourceId: targetSourceId, date: today });
        res.end();
    }
    catch (error) {
        send('error', { message: error?.message || '抓取失败' });
        res.end();
    }
});
export default router;
//# sourceMappingURL=im-fetch-today.js.map