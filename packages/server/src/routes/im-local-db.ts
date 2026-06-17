import { Router } from "express";
import { v4 as uuidv4 } from "uuid";
import fs from "fs";
import * as db from "../services/db.js";
import * as imDb from "../services/im-db.js";

const router = Router();

let imDbConnection: any = null;
let imDbConfig: imDb.ImDbConfig | null = null;

// ============= 本地 IM 数据库（im-db） =============

router.post("/api/im/local/connect", (req, res) => {
  try {
    const { employeeId, basePath } = req.body;
    if (!employeeId) return res.status(400).json({ error: '工号不能为空' });

    const config: imDb.ImDbConfig = {
      employeeId,
      basePath: basePath || 'D:/Program Files (x86)/Netdragon/imData/mulproplus/db/0.56/_@_prpl-91u-nd',
    };

    const testResult = imDb.testConnection(config);
    if (testResult.success) {
      imDbConfig = config;
      const database = imDb.openImDatabase(config);
      if (database) imDbConnection = database;
    }
    res.json(testResult);
  } catch (error: any) {
    res.status(500).json({ error: error?.message || '连接失败' });
  }
});

router.get("/api/im/local/status", (req, res) => {
  res.json({
    connected: imDbConnection !== null,
    config: imDbConfig ? { basePath: imDbConfig.basePath, employeeId: imDbConfig.employeeId.slice(0, 4) + '****' } : null,
  });
});

router.get("/api/im/local/conversations", (req, res) => {
  try {
    if (!imDbConnection) return res.status(400).json({ error: '请先连接本地数据库' });
    const conversations = imDb.getConversationList(imDbConnection);
    res.json({ conversations });
  } catch (error: any) {
    res.status(500).json({ error: error?.message || '获取会话列表失败' });
  }
});

router.get("/api/im/local/messages", (req, res) => {
  try {
    if (!imDbConnection) return res.status(400).json({ error: '请先连接本地数据库' });
    const { convId, startTime, endTime, limit = 100, offset = 0 } = req.query;
    const messages = imDb.getMessagesByConversation(imDbConnection, convId as string, {
      startTime: startTime ? parseInt(startTime as string) : undefined,
      endTime: endTime ? parseInt(endTime as string) : undefined,
      limit: parseInt(limit as string),
      offset: parseInt(offset as string),
    });
    res.json({ messages, count: messages.length });
  } catch (error: any) {
    res.status(500).json({ error: error?.message || '获取消息失败' });
  }
});

router.post("/api/im/local/import", (req, res) => {
  try {
    if (!imDbConnection || !imDbConfig) return res.status(400).json({ error: '请先连接本地数据库' });
    const { sourceId, convId, startTime, endTime, maxMessages = 1000 } = req.body;
    if (!sourceId) return res.status(400).json({ error: 'sourceId 不能为空' });

    const source = db.getImSource(sourceId);
    if (!source) return res.status(404).json({ error: '数据源不存在' });

    const messages = imDb.getMessagesByConversation(imDbConnection, convId, {
      startTime: startTime ? parseInt(startTime) : undefined,
      endTime: endTime ? parseInt(endTime) : undefined,
      limit: maxMessages,
    });

    const now = new Date().toISOString();
    const dbRecords: db.DbChatRecord[] = messages.map((msg) => ({
      id: uuidv4(), source_id: sourceId, im_message_id: msg.msg_id,
      sender_name: msg.sender_name || '未知', sender_id: msg.sender_id || null,
      group_name: msg.group_name || null, group_id: msg.group_id || convId || null,
      content: msg.content || '', message_type: msg.msg_type || 'text',
      timestamp: msg.create_time || now, is_mentioned: msg.is_mentioned || 0,
      raw_data: JSON.stringify(msg), synced_at: now,
    }));

    const importResult = db.importChatRecords(dbRecords);
    db.updateImSource(sourceId, { last_sync_at: now });

    res.json({ success: true, imported: importResult.inserted, skipped: importResult.skipped, totalFromLocal: messages.length, convId, sourceId });
  } catch (error: any) {
    res.status(500).json({ error: error?.message || '导入失败' });
  }
});

router.post("/api/im/local/import-all", async (req, res) => {
  try {
    if (!imDbConnection || !imDbConfig) return res.status(400).json({ error: '请先连接本地数据库' });
    const { sourceId, startTime, endTime, maxMessagesPerConv = 500 } = req.body;
    if (!sourceId) return res.status(400).json({ error: 'sourceId 不能为空' });

    const source = db.getImSource(sourceId);
    if (!source) return res.status(404).json({ error: '数据源不存在' });

    const conversations = imDb.getConversationList(imDbConnection);

    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache");
    res.setHeader("Connection", "keep-alive");

    let totalImported = 0, totalSkipped = 0;
    const now = new Date().toISOString();

    for (let i = 0; i < conversations.length; i++) {
      const conv = conversations[i];
      res.write(`data: ${JSON.stringify({ type: "progress", current: i + 1, total: conversations.length, conversation: conv.name })}\n\n`);

      const messages = imDb.getMessagesByConversation(imDbConnection, conv.id, {
        startTime: startTime ? parseInt(startTime) : undefined,
        endTime: endTime ? parseInt(endTime) : undefined,
        limit: maxMessagesPerConv,
      });
      if (messages.length === 0) continue;

      const dbRecords: db.DbChatRecord[] = messages.map((msg) => ({
        id: uuidv4(), source_id: sourceId, im_message_id: msg.msg_id,
        sender_name: msg.sender_name || '未知', sender_id: msg.sender_id || null,
        group_name: msg.group_name || conv.name, group_id: conv.id,
        content: msg.content || '', message_type: msg.msg_type || 'text',
        timestamp: msg.create_time || now, is_mentioned: msg.is_mentioned || 0,
        raw_data: JSON.stringify(msg), synced_at: now,
      }));

      const importResult = db.importChatRecords(dbRecords);
      totalImported += importResult.inserted;
      totalSkipped += importResult.skipped;
    }

    db.updateImSource(sourceId, { last_sync_at: now });
    res.write(`data: ${JSON.stringify({ type: "done", imported: totalImported, skipped: totalSkipped })}\n\n`);
    res.end();
  } catch (error: any) {
    res.write(`data: ${JSON.stringify({ type: "error", message: error?.message || '导入失败' })}\n\n`);
    res.end();
  }
});

router.post("/api/im/local/import-json", (req, res) => {
  try {
    const { sourceId, jsonPath } = req.body;
    if (!sourceId || !jsonPath) return res.status(400).json({ error: 'sourceId 和 jsonPath 不能为空' });

    const source = db.getImSource(sourceId);
    if (!source) return res.status(404).json({ error: '数据源不存在' });
    if (!fs.existsSync(jsonPath)) return res.status(400).json({ error: 'JSON 文件不存在' });

    const fileContent = fs.readFileSync(jsonPath, 'utf-8');
    const exportData = JSON.parse(fileContent);
    if (!exportData.messages || !Array.isArray(exportData.messages)) return res.status(400).json({ error: '无效的导出文件格式' });

    const now = new Date().toISOString();
    const dbRecords: db.DbChatRecord[] = exportData.messages.map((msg: any) => ({
      id: uuidv4(), source_id: sourceId, im_message_id: msg.id,
      sender_name: msg.sender_name || '未知', sender_id: msg.sender_id || null,
      group_name: msg.group_name || null, group_id: msg.group_id || null,
      content: msg.content || '', message_type: msg.msg_type || 'text',
      timestamp: msg.timestamp || now, is_mentioned: msg.is_mentioned || 0,
      raw_data: JSON.stringify(msg), synced_at: now,
    }));

    const importResult = db.importChatRecords(dbRecords);
    db.updateImSource(sourceId, { last_sync_at: now });

    res.json({ success: true, imported: importResult.inserted, skipped: importResult.skipped, total: exportData.messages.length });
  } catch (error: any) {
    res.status(500).json({ error: error?.message || '导入失败' });
  }
});

export default router;
