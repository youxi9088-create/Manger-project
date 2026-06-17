import { Router } from "express";
import { v4 as uuidv4 } from "uuid";
import * as db from "../services/db.js";

const router = Router();

// ============= 聊天记录查询/导入 =============

router.get("/api/im/chat-records", (req, res) => {
  try {
    const { sourceId, startDate, endDate, senderName, groupName, isMentioned, keyword, page = 1, pageSize = 50 } = req.query;
    const offset = (Number(page) - 1) * Number(pageSize);
    const result = db.getChatRecords({
      sourceId: sourceId as string,
      startDate: startDate as string,
      endDate: endDate as string,
      senderName: senderName as string,
      groupName: groupName as string,
      isMentioned: isMentioned === 'true' ? true : isMentioned === 'false' ? false : undefined,
      keyword: keyword as string,
      limit: Number(pageSize),
      offset,
    });
    res.json({
      records: result.records,
      total: result.total,
      page: Number(page),
      pageSize: Number(pageSize),
      totalPages: Math.ceil(result.total / Number(pageSize)),
    });
  } catch (error: any) {
    res.status(500).json({ error: error?.message });
  }
});

router.post("/api/im/chat-records/import", (req, res) => {
  try {
    const { sourceId, records } = req.body;
    if (!sourceId || !Array.isArray(records)) {
      return res.status(400).json({ error: "sourceId 和 records 数组不能为空" });
    }

    const source = db.getImSource(sourceId);
    if (!source) return res.status(404).json({ error: "数据源不存在" });

    const now = new Date().toISOString();
    const dbRecords: db.DbChatRecord[] = records.map((r: any) => ({
      id: r.id || uuidv4(),
      source_id: sourceId,
      im_message_id: r.im_message_id || null,
      sender_name: r.sender_name || '未知',
      sender_id: r.sender_id || null,
      group_name: r.group_name || null,
      group_id: r.group_id || null,
      content: r.content || '',
      message_type: r.message_type || 'text',
      timestamp: r.timestamp || now,
      is_mentioned: r.is_mentioned ? 1 : 0,
      raw_data: r.raw_data ? JSON.stringify(r.raw_data) : null,
      synced_at: now,
    }));

    const importResult = db.importChatRecords(dbRecords);
    db.updateImSource(sourceId, { last_sync_at: now });

    res.json({ success: true, imported: importResult.inserted, skipped: importResult.skipped });
  } catch (error: any) {
    res.status(500).json({ error: error?.message });
  }
});

router.post("/api/im/chat-records/import-file", (req, res) => {
  try {
    const { sourceId, fileName, fileContent, fileType } = req.body;
    if (!sourceId || !fileContent) {
      return res.status(400).json({ error: "sourceId 和 fileContent 不能为空" });
    }

    const source = db.getImSource(sourceId);
    if (!source) return res.status(404).json({ error: "数据源不存在" });

    let records: any[];
    if (fileType === 'json') {
      records = JSON.parse(fileContent);
      if (!Array.isArray(records)) records = [records];
    } else {
      const lines: string[] = fileContent.split('\n').filter((l: string) => l.trim());
      if (lines.length < 2) return res.status(400).json({ error: "CSV 文件格式错误" });
      const headers: string[] = lines[0].split(',').map((h: string) => h.trim());
      records = lines.slice(1).map((line: string) => {
        const values: string[] = line.split(',').map((v: string) => v.trim());
        const record: any = {};
        headers.forEach((h: string, i: number) => { record[h] = values[i] || ''; });
        return record;
      });
    }

    const now = new Date().toISOString();
    const dbRecords: db.DbChatRecord[] = records.map((r: any) => ({
      id: r.id || uuidv4(),
      source_id: sourceId,
      im_message_id: r.im_message_id || r.message_id || null,
      sender_name: r.sender_name || r.sender || '未知',
      sender_id: r.sender_id || null,
      group_name: r.group_name || r.group || null,
      group_id: r.group_id || null,
      content: r.content || r.message || r.text || '',
      message_type: r.message_type || r.type || 'text',
      timestamp: r.timestamp || r.time || r.date || now,
      is_mentioned: r.is_mentioned ? 1 : 0,
      raw_data: null,
      synced_at: now,
    }));

    const result = db.importChatRecords(dbRecords);
    db.updateImSource(sourceId, { last_sync_at: now });

    res.json({ success: true, imported: result.inserted, skipped: result.skipped });
  } catch (error: any) {
    res.status(500).json({ error: error?.message });
  }
});

// ============= 统计 =============

import dayjs from "dayjs";

router.get("/api/im/stats", (req, res) => {
  try {
    const { startDate, endDate } = req.query;
    const start = startDate as string | undefined;
    const end = endDate as string | undefined;

    const stats = db.getChatStats(start, end);
    const topSenders = db.getTopSenders(start, end);
    const topGroups = db.getTopGroups(start, end);

    const last7Days = [];
    for (let i = 6; i >= 0; i--) {
      const date = dayjs().subtract(i, 'day');
      const dayStart = date.startOf('day').format('YYYY-MM-DDTHH:mm:ss');
      const dayEnd = date.endOf('day').format('YYYY-MM-DDTHH:mm:ss');
      const dayStats = db.getChatStats(dayStart, dayEnd);
      last7Days.push({
        date: date.format('YYYY-MM-DD'),
        dayName: date.format('ddd'),
        messages: dayStats.total_messages,
      });
    }

    res.json({ stats, topSenders, topGroups, last7Days });
  } catch (error: any) {
    res.status(500).json({ error: error?.message });
  }
});

// ============= 批量修复 is_mentioned =============

router.post("/api/im/fix-mentioned", (req, res) => {
  try {
    const myName = process.env.U9_MY_NAME || '';
    if (!myName) {
      return res.status(400).json({ error: '未配置 U9_MY_NAME 环境变量，无法判断 @我' });
    }
    const result = db.fixMentioned(myName);
    res.json({ success: true, total: result.total, fixed: result.fixed, myName });
  } catch (error: any) {
    res.status(500).json({ error: error?.message });
  }
});

export default router;
