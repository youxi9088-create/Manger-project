import { Router } from "express";
import dbInstance from "../services/db.js";

const router = Router();

// ============= 工具函数 =============

/** 生成立项 ID：PI-YYYYMMDD-NNN */
function generateInitiationId(): string {
  const d = new Date();
  const dateStr = d.toISOString().slice(0, 10).replace(/-/g, '');
  const prefix = `PI-${dateStr}-`;

  const row = dbInstance.prepare(
    `SELECT id FROM project_initiations WHERE id LIKE ? ORDER BY id DESC LIMIT 1`
  ).get(`${prefix}%`) as { id: string } | undefined;

  let seq = 1;
  if (row) {
    const lastSeq = parseInt(row.id.split('-').pop() || '0', 10);
    seq = lastSeq + 1;
  }

  return `${prefix}${String(seq).padStart(3, '0')}`;
}

function nowStr(): string {
  return new Date().toLocaleString('sv-SE', { timeZone: 'Asia/Shanghai' }).replace(' ', 'T');
}

// ============= 路由 =============

/** GET /api/project-initiation — 列表 */
router.get("/api/project-initiation", (req, res) => {
  try {
    const { type, status } = req.query;
    let sql = "SELECT * FROM project_initiations WHERE 1=1";
    const params: string[] = [];

    if (type && typeof type === 'string') {
      sql += " AND type = ?";
      params.push(type);
    }
    if (status && typeof status === 'string') {
      sql += " AND status = ?";
      params.push(status);
    }
    sql += " ORDER BY created_at DESC";

    const rows = dbInstance.prepare(sql).all(...params);
    res.json({ success: true, data: rows });
  } catch (error: any) {
    res.status(500).json({ error: error?.message });
  }
});

/** GET /api/project-initiation/next-id — 预览下一个 ID */
router.get("/api/project-initiation/next-id", (_req, res) => {
  try {
    res.json({ success: true, data: { id: generateInitiationId() } });
  } catch (error: any) {
    res.status(500).json({ error: error?.message });
  }
});

/** GET /api/project-initiation/:id — 详情 */
router.get("/api/project-initiation/:id", (req, res) => {
  try {
    const row = dbInstance.prepare("SELECT * FROM project_initiations WHERE id = ?").get(req.params.id);
    if (!row) return res.status(404).json({ error: "立项记录不存在" });
    res.json({ success: true, data: row });
  } catch (error: any) {
    res.status(500).json({ error: error?.message });
  }
});

/** POST /api/project-initiation — 创建立项（草稿） */
router.post("/api/project-initiation", (req, res) => {
  try {
    const id = generateInitiationId();
    const {
      type = 'quick_validation', title, applicant, project_leader,
      department, project_type, demand_source, demand_date,
      from_pool = 0, raw_requirement, ai_generated_content,
    } = req.body;

    const ts = nowStr();
    dbInstance.prepare(`
      INSERT INTO project_initiations
        (id, type, status, title, applicant, project_leader, department, project_type, demand_source, demand_date, from_pool, raw_requirement, ai_generated_content, created_at, updated_at)
      VALUES (?, ?, 'draft', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      id, type, title || null, applicant || null, project_leader || null,
      department || null, project_type || null, demand_source || null,
      demand_date || null, from_pool, raw_requirement || null,
      ai_generated_content || null, ts, ts
    );

    const row = dbInstance.prepare("SELECT * FROM project_initiations WHERE id = ?").get(id);
    res.json({ success: true, data: row });
  } catch (error: any) {
    res.status(500).json({ error: error?.message });
  }
});

/** PATCH /api/project-initiation/:id — 更新立项 */
router.patch("/api/project-initiation/:id", (req, res) => {
  try {
    const existing = dbInstance.prepare("SELECT * FROM project_initiations WHERE id = ?").get(req.params.id);
    if (!existing) return res.status(404).json({ error: "立项记录不存在" });

    const allowedFields = [
      'title', 'applicant', 'project_leader', 'department', 'project_type',
      'demand_source', 'demand_date', 'from_pool', 'raw_requirement',
      'ai_generated_content', 'status',
    ];
    const sets: string[] = [];
    const values: any[] = []; // eslint-disable-next-line @typescript-eslint/no-explicit-any

    for (const field of allowedFields) {
      if (req.body[field] !== undefined) {
        sets.push(`${field} = ?`);
        values.push(req.body[field]);
      }
    }
    if (sets.length === 0) return res.status(400).json({ error: "没有需要更新的字段" });

    sets.push("updated_at = ?");
    values.push(nowStr());
    values.push(req.params.id);

    dbInstance.prepare(`UPDATE project_initiations SET ${sets.join(', ')} WHERE id = ?`).run(...values);
    const row = dbInstance.prepare("SELECT * FROM project_initiations WHERE id = ?").get(req.params.id);
    res.json({ success: true, data: row });
  } catch (error: any) {
    res.status(500).json({ error: error?.message });
  }
});

/** POST /api/project-initiation/:id/submit — 提交立项 → 去立项 */
router.post("/api/project-initiation/:id/submit", (req, res) => {
  try {
    const existing = dbInstance.prepare("SELECT * FROM project_initiations WHERE id = ?").get(req.params.id) as any; // eslint-disable-next-line @typescript-eslint/no-explicit-any
    if (!existing) return res.status(404).json({ error: "立项记录不存在" });
    if (existing.status !== 'draft') {
      return res.status(400).json({ error: `当前状态为 ${existing.status}，只有草稿状态可以提交` });
    }

    dbInstance.prepare("UPDATE project_initiations SET status = 'pending', updated_at = ? WHERE id = ?").run(nowStr(), req.params.id);
    const row = dbInstance.prepare("SELECT * FROM project_initiations WHERE id = ?").get(req.params.id);
    res.json({ success: true, data: row });
  } catch (error: any) {
    res.status(500).json({ error: error?.message });
  }
});

/** DELETE /api/project-initiation/:id */
router.delete("/api/project-initiation/:id", (req, res) => {
  try {
    const result = dbInstance.prepare("DELETE FROM project_initiations WHERE id = ?").run(req.params.id);
    if (result.changes === 0) return res.status(404).json({ error: "立项记录不存在" });
    res.json({ success: true });
  } catch (error: any) {
    res.status(500).json({ error: error?.message });
  }
});

/** POST /api/project-initiation/generate — AI 生成立项文档（SSE） */
router.post("/api/project-initiation/generate", async (req, res) => {
  const { raw_requirement } = req.body;
  if (!raw_requirement) return res.status(400).json({ error: "请提供原始需求描述" });

  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");

  const send = (type: string, data: any = {}) => { // eslint-disable-next-line @typescript-eslint/no-explicit-any
    res.write(`data: ${JSON.stringify({ type, ...data })}\n\n`);
  };

  try {
    send('log', { message: '正在分析原始需求...' });

    const apiKey = process.env.MOONSHOT_API_KEY || process.env.OPENAI_API_KEY;
    const baseUrl = process.env.MOONSHOT_BASE_URL || process.env.OPENAI_BASE_URL || 'https://api.moonshot.cn/v1';
    const model = process.env.OPENAI_CHAT_MODEL || 'moonshot-v1-128k';

    if (!apiKey) { send('error', { message: '未配置 OPENAI_API_KEY' }); return res.end(); }

    const systemPrompt = `你是一个项目立项文档生成专家。用户会提供原始需求描述，你需要基于此生成一份完整的预立项（快速验证）申请文档。

请严格按照以下 JSON 格式输出，不要输出 JSON 以外的内容：

{
  "title": "项目名称（从需求中提炼）",
  "project_type": "项目类型（预研型-技术预研 / 预研型-产品预研 / 资源驱动型 / 市场驱动型）",
  "business_type": "项目业务类型（教育 / 游戏 / 企业服务 / 平台技术 / 其他）",
  "business_domain_l1": "业务领域一级（如：教育）",
  "business_domain_l2": "业务领域二级（如：AI生产线、虚拟实验室等）",
  "demand_source": "需求提出者（申请方 / 客户 / 市场 / 管理层）",
  "why_do_it": "公司为什么要做这个项目（2-4点，每点一段话）",
  "expected_effect": "想要达到什么效果（3-5点，每点一段话）",
  "topic_overview": "课题概述（简述课题核心内容，1-3条）",
  "topic_type": "课题类型（如：3D交互体验提升、AI辅助教学等）",
  "topic_value": "课题价值/立项目的（说明研发成果对公司的价值，未来应用场景）",
  "topic_acceptance": "课题研发验收标准（量化标准，说明做到什么程度算验收通过）",
  "project_overview": {
    "requirement": "需求：产品为谁，解决什么痛点",
    "core_function": "核心功能是什么",
    "user_scenario": "典型用户场景",
    "company_value": "对公司的价值",
    "user_value": "对用户的价值"
  },
  "target_market": "目标市场描述（目标用户、市场规模、竞争格局）",
  "self_check": {
    "precondition_met": { "answer": true, "note": "说明" },
    "familiar_field": { "answer": true, "note": "说明" },
    "cost_competitive": { "answer": true, "note": "说明" },
    "policy_favorable": { "answer": true, "note": "说明" },
    "team_ready": { "answer": true, "note": "说明" },
    "top_priority": { "answer": true, "note": "说明" },
    "user_risk_handled": { "answer": true, "note": "说明" },
    "confirm_start": { "answer": true, "note": "说明" }
  }
}`;

    send('log', { message: 'AI 正在生成立项文档...' });

    const response = await fetch(`${baseUrl}/chat/completions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiKey}` },
      body: JSON.stringify({
        model,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: `原始需求描述：\n${raw_requirement}` },
        ],
        temperature: 0.7,
        stream: true,
      }),
    });

    if (!response.ok) {
      const errText = await response.text();
      send('error', { message: `AI 接口错误: ${response.status} ${errText}` });
      return res.end();
    }

    let fullContent = '';
    const reader = response.body?.getReader();
    if (!reader) { send('error', { message: 'AI 响应流为空' }); return res.end(); }

    const decoder = new TextDecoder();
    let buf = '';

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buf += decoder.decode(value, { stream: true });
      const lines = buf.split('\n');
      buf = lines.pop() || '';

      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed || !trimmed.startsWith('data: ')) continue;
        const data = trimmed.slice(6);
        if (data === '[DONE]') continue;

        try {
          const parsed = JSON.parse(data);
          const delta = parsed.choices?.[0]?.delta?.content;
          if (delta) { fullContent += delta; send('chunk', { content: delta }); }
        } catch { /* skip */ }
      }
    }

    // 解析完整 JSON
    try {
      const jsonMatch = fullContent.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[0]);
        send('done', { result: parsed, raw: fullContent });
      } else {
        send('done', { result: null, raw: fullContent });
      }
    } catch {
      send('done', { result: null, raw: fullContent });
    }
  } catch (error: any) { // eslint-disable-next-line @typescript-eslint/no-explicit-any
    send('error', { message: error?.message || '生成失败' });
  } finally {
    res.end();
  }
});

/** GET /api/projects — 已由 routes/projects.ts 提供完整版，此处保留供选择器使用的简化查询接口 */
router.get("/api/projects/list", (_req, res) => {
  try {
    const rows = dbInstance.prepare(
      `SELECT id, title, status FROM project_initiations WHERE status IN ('approved', 'submitted', 'pending', 'draft', 'executing') ORDER BY created_at DESC`
    ).all();
    res.json({ success: true, data: rows });
  } catch (error: any) {
    res.status(500).json({ error: error?.message });
  }
});

export default router;
