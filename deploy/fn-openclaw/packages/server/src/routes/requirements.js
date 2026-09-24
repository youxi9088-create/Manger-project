import { Router } from "express";
import dbInstance from "../services/db.js";
import { computeVersionRisk } from "../services/version-alert-service.js";
const router = Router();
/**
 * 根据需求内容 + 关联开发任务动态计算需求的实际状态
 *
 * 状态流转逻辑：
 *   pending    → 新建，无需求描述
 *   draft      → 有需求描述，未做 AI 分析
 *   analyzed   → AI 分析完成，未拆解任务
 *   tasked     → 已拆解任务，所有任务仍为 todo
 *   in_progress→ 有任务处于 in_progress / testing
 *   done       → 所有任务均为 done
 */
function computeRequirementStatus(req) {
    const tasks = dbInstance.prepare("SELECT status FROM dev_tasks WHERE requirement_id = ?").all(req.id);
    // 有开发任务 → 按任务状态推算
    if (tasks.length > 0) {
        const allDone = tasks.every(t => t.status === "done");
        if (allDone)
            return "done";
        const hasActive = tasks.some(t => t.status === "in_progress" || t.status === "testing");
        if (hasActive)
            return "in_progress";
        // 所有任务都是 todo
        return "tasked";
    }
    // 无开发任务 → 按需求自身内容推算
    if (req.ai_analysis)
        return "analyzed";
    if (req.raw_input)
        return "draft";
    return "pending";
}
/** 给需求行附加 computed_status 字段 */
function enrichRequirement(row) {
    return { ...row, computed_status: computeRequirementStatus(row) };
}
/** 批量附加 computed_status */
function enrichRequirements(rows) {
    return rows.map(enrichRequirement);
}
// ============= ID 生成 =============
function generateId(prefix, table) {
    const d = new Date();
    const dateStr = d.toISOString().slice(0, 10).replace(/-/g, '');
    const pfx = `${prefix}-${dateStr}-`;
    const row = dbInstance.prepare(`SELECT id FROM ${table} WHERE id LIKE ? ORDER BY id DESC LIMIT 1`).get(`${pfx}%`);
    let seq = 1;
    if (row) {
        seq = parseInt(row.id.split('-').pop() || '0', 10) + 1;
    }
    return `${pfx}${String(seq).padStart(3, '0')}`;
}
function nowStr() {
    return new Date().toLocaleString('sv-SE', { timeZone: 'Asia/Shanghai' }).replace(' ', 'T');
}
// ============= 需求分析 CRUD =============
router.get("/api/requirements", (req, res) => {
    try {
        const { status, initiation_id, version_id, project_id } = req.query;
        let sql = "SELECT * FROM requirement_analyses WHERE 1=1";
        const params = [];
        if (status && typeof status === 'string') {
            sql += " AND status = ?";
            params.push(status);
        }
        if (initiation_id && typeof initiation_id === 'string') {
            sql += " AND initiation_id = ?";
            params.push(initiation_id);
        }
        if (version_id && typeof version_id === 'string') {
            sql += " AND version_id = ?";
            params.push(version_id);
        }
        if (project_id && typeof project_id === 'string') {
            sql += " AND project_id = ?";
            params.push(project_id);
        }
        sql += " ORDER BY created_at DESC";
        const rows = dbInstance.prepare(sql).all(...params);
        res.json({ success: true, data: enrichRequirements(rows) });
    }
    catch (error) {
        res.status(500).json({ error: error?.message });
    } // eslint-disable-next-line @typescript-eslint/no-explicit-any
});
router.get("/api/requirements/:id", (req, res) => {
    try {
        const row = dbInstance.prepare("SELECT * FROM requirement_analyses WHERE id = ?").get(req.params.id);
        if (!row)
            return res.status(404).json({ error: "需求不存在" });
        res.json({ success: true, data: enrichRequirement(row) });
    }
    catch (error) {
        res.status(500).json({ error: error?.message });
    }
});
router.post("/api/requirements", (req, res) => {
    try {
        const id = generateId('RA', 'requirement_analyses');
        const { initiation_id, title, input_type = 'text', raw_input, project_id } = req.body;
        const ts = nowStr();
        dbInstance.prepare(`
      INSERT INTO requirement_analyses (id, initiation_id, title, input_type, raw_input, project_id, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(id, initiation_id || null, title || null, input_type, raw_input || null, project_id || null, ts, ts);
        const row = dbInstance.prepare("SELECT * FROM requirement_analyses WHERE id = ?").get(id);
        res.json({ success: true, data: enrichRequirement(row) });
    }
    catch (error) {
        res.status(500).json({ error: error?.message });
    }
});
router.patch("/api/requirements/:id", (req, res) => {
    try {
        const existing = dbInstance.prepare("SELECT * FROM requirement_analyses WHERE id = ?").get(req.params.id);
        if (!existing)
            return res.status(404).json({ error: "需求不存在" });
        const allowed = ['title', 'initiation_id', 'input_type', 'raw_input', 'ai_analysis', 'status', 'version_id', 'from_goal_id', 'project_id'];
        const sets = [];
        const values = []; // eslint-disable-next-line @typescript-eslint/no-explicit-any
        for (const f of allowed) {
            if (req.body[f] !== undefined) {
                sets.push(`${f} = ?`);
                values.push(req.body[f]);
            }
        }
        if (sets.length === 0)
            return res.status(400).json({ error: "没有需要更新的字段" });
        sets.push("updated_at = ?");
        values.push(nowStr());
        values.push(req.params.id);
        dbInstance.prepare(`UPDATE requirement_analyses SET ${sets.join(', ')} WHERE id = ?`).run(...values);
        const row = dbInstance.prepare("SELECT * FROM requirement_analyses WHERE id = ?").get(req.params.id);
        res.json({ success: true, data: enrichRequirement(row) });
    }
    catch (error) {
        res.status(500).json({ error: error?.message });
    }
});
router.delete("/api/requirements/:id", (req, res) => {
    try {
        const result = dbInstance.prepare("DELETE FROM requirement_analyses WHERE id = ?").run(req.params.id);
        if (result.changes === 0)
            return res.status(404).json({ error: "需求不存在" });
        res.json({ success: true });
    }
    catch (error) {
        res.status(500).json({ error: error?.message });
    }
});
// ============= 开发任务 CRUD =============
router.get("/api/dev-tasks", (req, res) => {
    try {
        const { requirement_id, status } = req.query;
        let sql = "SELECT * FROM dev_tasks WHERE 1=1";
        const params = [];
        if (requirement_id && typeof requirement_id === 'string') {
            sql += " AND requirement_id = ?";
            params.push(requirement_id);
        }
        if (status && typeof status === 'string') {
            sql += " AND status = ?";
            params.push(status);
        }
        sql += " ORDER BY sort_order ASC, created_at ASC";
        const rows = dbInstance.prepare(sql).all(...params);
        res.json({ success: true, data: rows });
    }
    catch (error) {
        res.status(500).json({ error: error?.message });
    }
});
router.post("/api/dev-tasks", (req, res) => {
    try {
        const id = generateId('DT', 'dev_tasks');
        const { requirement_id, title, description, category = 'other', priority = 'medium', assignee, estimated_hours, sort_order = 0 } = req.body;
        if (!requirement_id || !title)
            return res.status(400).json({ error: "requirement_id 和 title 必填" });
        const ts = nowStr();
        dbInstance.prepare(`
      INSERT INTO dev_tasks (id, requirement_id, title, description, category, priority, status, assignee, estimated_hours, sort_order, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, 'todo', ?, ?, ?, ?, ?)
    `).run(id, requirement_id, title, description || null, category, priority, assignee || null, estimated_hours || null, sort_order, ts, ts);
        const row = dbInstance.prepare("SELECT * FROM dev_tasks WHERE id = ?").get(id);
        res.json({ success: true, data: row });
    }
    catch (error) {
        res.status(500).json({ error: error?.message });
    }
});
router.patch("/api/dev-tasks/:id", (req, res) => {
    try {
        const existing = dbInstance.prepare("SELECT * FROM dev_tasks WHERE id = ?").get(req.params.id);
        if (!existing)
            return res.status(404).json({ error: "任务不存在" });
        const allowed = ['title', 'description', 'category', 'priority', 'status', 'assignee', 'estimated_hours', 'sort_order'];
        const sets = [];
        const values = []; // eslint-disable-next-line @typescript-eslint/no-explicit-any
        for (const f of allowed) {
            if (req.body[f] !== undefined) {
                sets.push(`${f} = ?`);
                values.push(req.body[f]);
            }
        }
        if (sets.length === 0)
            return res.status(400).json({ error: "没有需要更新的字段" });
        sets.push("updated_at = ?");
        values.push(nowStr());
        values.push(req.params.id);
        dbInstance.prepare(`UPDATE dev_tasks SET ${sets.join(', ')} WHERE id = ?`).run(...values);
        // 如果改了 estimated_hours，同步到关联的 work_cycles 并触发版本预警重算
        if (req.body.estimated_hours !== undefined) {
            // 同步到所有关联此 task 且未完成的 work_cycles
            dbInstance.prepare(`UPDATE work_cycles SET estimated_hours = ?, updated_at = datetime('now','localtime') WHERE task_id = ? AND status IN ('active', 'queued')`).run(req.body.estimated_hours, req.params.id);
            // 触发关联版本的预警重算
            const task = dbInstance.prepare(`SELECT requirement_id FROM dev_tasks WHERE id = ?`).get(req.params.id);
            if (task?.requirement_id) {
                const reqRow = dbInstance.prepare(`SELECT version_id FROM requirement_analyses WHERE id = ?`).get(task.requirement_id);
                if (reqRow?.version_id) {
                    try {
                        computeVersionRisk(reqRow.version_id);
                    }
                    catch { /* ignore */ }
                }
            }
        }
        const row = dbInstance.prepare("SELECT * FROM dev_tasks WHERE id = ?").get(req.params.id);
        res.json({ success: true, data: row });
    }
    catch (error) {
        res.status(500).json({ error: error?.message });
    }
});
router.delete("/api/dev-tasks/:id", (req, res) => {
    try {
        const result = dbInstance.prepare("DELETE FROM dev_tasks WHERE id = ?").run(req.params.id);
        if (result.changes === 0)
            return res.status(404).json({ error: "任务不存在" });
        res.json({ success: true });
    }
    catch (error) {
        res.status(500).json({ error: error?.message });
    }
});
// ============= AI 分析需求（SSE） =============
router.post("/api/requirements/:id/analyze", async (req, res) => {
    const existing = dbInstance.prepare("SELECT * FROM requirement_analyses WHERE id = ?").get(req.params.id); // eslint-disable-next-line @typescript-eslint/no-explicit-any
    if (!existing)
        return res.status(404).json({ error: "需求不存在" });
    if (!existing.raw_input)
        return res.status(400).json({ error: "请先填写需求描述" });
    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache");
    res.setHeader("Connection", "keep-alive");
    const send = (type, data = {}) => { res.write(`data: ${JSON.stringify({ type, ...data })}\n\n`); }; // eslint-disable-next-line @typescript-eslint/no-explicit-any
    try {
        send('log', { message: '正在分析需求...' });
        const apiKey = process.env.MOONSHOT_API_KEY || process.env.OPENAI_API_KEY;
        const baseUrl = process.env.MOONSHOT_BASE_URL || process.env.OPENAI_BASE_URL || 'https://api.moonshot.cn/v1';
        const model = process.env.OPENAI_CHAT_MODEL || 'moonshot-v1-128k';
        if (!apiKey) {
            send('error', { message: '未配置 API Key' });
            return res.end();
        }
        const systemPrompt = `你是一个拥有 10 年经验的资深 3D 技术需求分析师，精通 Unreal Engine 5（C++/Blueprints）、3D 交互设计、实时渲染、物理模拟和教育类虚拟实验产品。

你的专业领域包括：
- UE5 架构：Actor/Component 体系、Enhanced Input System、GameplayAbility System、Niagara 粒子、Material Editor
- 3D 交互：器材抓取/放置（Grab/Drop）、碰撞检测、磁吸对位、物理约束、射线检测
- 渲染与表现：Nanite、Lumen、材质系统、后处理效果、LOD 策略
- 教育场景：虚拟实验室、实验操作模拟、实验现象可视化、教学引导系统
- 性能优化：DrawCall 优化、内存管理、Profiling、多平台适配

用户会提供一个需求描述（可能是一句话、Figma 链接、蓝湖(Lanhu)链接、或详细描述），你需要以资深 3D 工程师视角生成完整的需求分析文档。

如果用户提供了 Figma 链接或蓝湖链接，请基于链接中的项目名、页面名等信息推测可能的页面/交互内容进行分析。蓝湖链接通常格式为 https://lanhuapp.com/... 或 https://app.lanhu.com/...，包含 UI 设计稿和标注信息。

请严格按以下 JSON 格式输出，不要输出 JSON 以外的内容：

{
  "title": "需求标题（简短提炼）",
  "summary": "需求概述（2-3 句话，包含技术背景和业务价值）",
  "features": [
    { "name": "功能点名称", "description": "功能描述（包含 UE5 技术实现思路）", "priority": "high/medium/low" }
  ],
  "user_stories": [
    "作为[角色]，我希望[功能]，以便[价值]"
  ],
  "tech_points": {
    "frontend": "前端/UE5 Blueprint/Widget 方案",
    "backend": "后端/UE5 C++ 架构方案",
    "rendering": "渲染/材质/特效方案",
    "interaction": "交互系统方案（输入、碰撞、物理）",
    "database": "数据持久化方案",
    "dependencies": "第三方插件/工具依赖"
  },
  "risks": [
    { "description": "风险描述", "mitigation": "应对措施（附具体技术方案）" }
  ]
}`;
        send('log', { message: 'AI 正在生成需求分析...' });
        const response = await fetch(`${baseUrl}/chat/completions`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiKey}` },
            body: JSON.stringify({
                model, temperature: 0.7, stream: true,
                messages: [
                    { role: 'system', content: systemPrompt },
                    { role: 'user', content: `需求描述：\n${existing.raw_input}` },
                ],
            }),
        });
        if (!response.ok) {
            const t = await response.text();
            send('error', { message: `AI 错误: ${response.status} ${t}` });
            return res.end();
        }
        let fullContent = '';
        const reader = response.body?.getReader();
        if (!reader) {
            send('error', { message: '响应流为空' });
            return res.end();
        }
        const decoder = new TextDecoder();
        let buf = '';
        while (true) {
            const { done, value } = await reader.read();
            if (done)
                break;
            buf += decoder.decode(value, { stream: true });
            const lines = buf.split('\n');
            buf = lines.pop() || '';
            for (const line of lines) {
                const trimmed = line.trim();
                if (!trimmed || !trimmed.startsWith('data: '))
                    continue;
                const data = trimmed.slice(6);
                if (data === '[DONE]')
                    continue;
                try {
                    const parsed = JSON.parse(data);
                    const delta = parsed.choices?.[0]?.delta?.content;
                    if (delta) {
                        fullContent += delta;
                        send('chunk', { content: delta });
                    }
                }
                catch { /* skip */ }
            }
        }
        // 解析并保存
        try {
            const jsonMatch = fullContent.match(/\{[\s\S]*\}/);
            if (jsonMatch) {
                const parsed = JSON.parse(jsonMatch[0]);
                const title = parsed.title || existing.title;
                dbInstance.prepare("UPDATE requirement_analyses SET ai_analysis = ?, title = ?, status = 'analyzed', updated_at = ? WHERE id = ?")
                    .run(jsonMatch[0], title, nowStr(), req.params.id);
                send('done', { result: parsed });
            }
            else {
                send('done', { result: null, raw: fullContent });
            }
        }
        catch {
            send('done', { result: null, raw: fullContent });
        }
    }
    catch (error) {
        send('error', { message: error?.message || '分析失败' });
    } // eslint-disable-next-line @typescript-eslint/no-explicit-any
    finally {
        res.end();
    }
});
// ============= AI 拆解任务（SSE） =============
router.post("/api/requirements/:id/generate-tasks", async (req, res) => {
    const existing = dbInstance.prepare("SELECT * FROM requirement_analyses WHERE id = ?").get(req.params.id); // eslint-disable-next-line @typescript-eslint/no-explicit-any
    if (!existing)
        return res.status(404).json({ error: "需求不存在" });
    if (!existing.ai_analysis)
        return res.status(400).json({ error: "请先完成需求分析" });
    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache");
    res.setHeader("Connection", "keep-alive");
    const send = (type, data = {}) => { res.write(`data: ${JSON.stringify({ type, ...data })}\n\n`); }; // eslint-disable-next-line @typescript-eslint/no-explicit-any
    try {
        send('log', { message: '正在拆解开发任务...' });
        const apiKey = process.env.MOONSHOT_API_KEY || process.env.OPENAI_API_KEY;
        const baseUrl = process.env.MOONSHOT_BASE_URL || process.env.OPENAI_BASE_URL || 'https://api.moonshot.cn/v1';
        const model = process.env.OPENAI_CHAT_MODEL || 'moonshot-v1-128k';
        if (!apiKey) {
            send('error', { message: '未配置 API Key' });
            return res.end();
        }
        const systemPrompt = `你是一个拥有 10 年 Unreal Engine 开发经验的资深 3D 技术项目经理。你熟悉 UE5 C++/Blueprints 开发、3D 交互系统、渲染管线、物理模拟和教育类产品开发。

用户会提供一份需求分析文档，你需要将其拆解为具体的开发任务。

任务分类说明（category 字段）：
- frontend：UE5 Blueprint/Widget/UMG 界面开发、教学引导 UI、HUD
- backend：UE5 C++ 核心逻辑、GameplayAbility、Actor/Component 架构、数据管理
- design：3D 场景搭建、材质/贴图制作、模型优化、特效制作（Niagara）、动画制作
- interaction：交互系统（Enhanced Input、抓取/放置、碰撞检测、磁吸对位、物理约束）
- rendering：渲染优化（Nanite/Lumen 配置、LOD 策略、材质性能、DrawCall 优化）
- test：功能测试、性能测试（Profiling）、多平台兼容测试、教学场景验收测试
- other：文档、部署、工具链、其他

每个任务需要有明确的分类、优先级和工时估算。描述中应包含具体的 UE5 技术实现要点。

请严格按以下 JSON 格式输出，不要输出 JSON 以外的内容：

{
  "tasks": [
    {
      "title": "任务标题",
      "description": "任务详细描述，包含 UE5 技术实现要点（如使用哪个 Component/System/Plugin）",
      "category": "frontend/backend/design/interaction/rendering/test/other",
      "priority": "high/medium/low",
      "estimated_hours": 8,
      "sort_order": 1
    }
  ]
}

注意：
- 按依赖关系排序（被依赖的任务排前面）
- 交互类任务拆细：输入绑定、碰撞设置、抓取逻辑、放置校验、反馈效果各拆一个
- 渲染/特效类任务独立拆出
- 工时以小时为单位，务实估算（考虑 UE5 开发实际复杂度）`;
        send('log', { message: 'AI 正在拆解任务...' });
        const response = await fetch(`${baseUrl}/chat/completions`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiKey}` },
            body: JSON.stringify({
                model, temperature: 0.7, stream: true,
                messages: [
                    { role: 'system', content: systemPrompt },
                    { role: 'user', content: `需求分析文档：\n${existing.ai_analysis}\n\n原始需求：\n${existing.raw_input || ''}` },
                ],
            }),
        });
        if (!response.ok) {
            const t = await response.text();
            send('error', { message: `AI 错误: ${response.status} ${t}` });
            return res.end();
        }
        let fullContent = '';
        const reader = response.body?.getReader();
        if (!reader) {
            send('error', { message: '响应流为空' });
            return res.end();
        }
        const decoder = new TextDecoder();
        let buf = '';
        while (true) {
            const { done, value } = await reader.read();
            if (done)
                break;
            buf += decoder.decode(value, { stream: true });
            const lines = buf.split('\n');
            buf = lines.pop() || '';
            for (const line of lines) {
                const trimmed = line.trim();
                if (!trimmed || !trimmed.startsWith('data: '))
                    continue;
                const data = trimmed.slice(6);
                if (data === '[DONE]')
                    continue;
                try {
                    const parsed = JSON.parse(data);
                    const delta = parsed.choices?.[0]?.delta?.content;
                    if (delta) {
                        fullContent += delta;
                        send('chunk', { content: delta });
                    }
                }
                catch { /* skip */ }
            }
        }
        // 解析并批量创建任务
        try {
            const jsonMatch = fullContent.match(/\{[\s\S]*\}/);
            if (jsonMatch) {
                const parsed = JSON.parse(jsonMatch[0]);
                const tasks = parsed.tasks || [];
                const ts = nowStr();
                const insertStmt = dbInstance.prepare(`
          INSERT INTO dev_tasks (id, requirement_id, title, description, category, priority, status, estimated_hours, sort_order, created_at, updated_at)
          VALUES (?, ?, ?, ?, ?, ?, 'todo', ?, ?, ?, ?)
        `);
                const insertMany = dbInstance.transaction((items) => {
                    for (const t of items) {
                        const tid = generateId('DT', 'dev_tasks');
                        insertStmt.run(tid, req.params.id, t.title, t.description || null, t.category || 'other', t.priority || 'medium', t.estimated_hours || null, t.sort_order || 0, ts, ts);
                    }
                });
                insertMany(tasks);
                // 更新需求状态
                dbInstance.prepare("UPDATE requirement_analyses SET status = 'tasked', updated_at = ? WHERE id = ?").run(nowStr(), req.params.id);
                const createdTasks = dbInstance.prepare("SELECT * FROM dev_tasks WHERE requirement_id = ? ORDER BY sort_order ASC").all(req.params.id);
                send('done', { result: { tasks: createdTasks, count: tasks.length } });
            }
            else {
                send('done', { result: null, raw: fullContent });
            }
        }
        catch (e) {
            send('done', { result: null, raw: fullContent, error: e?.message });
        } // eslint-disable-next-line @typescript-eslint/no-explicit-any
    }
    catch (error) {
        send('error', { message: error?.message || '拆解失败' });
    } // eslint-disable-next-line @typescript-eslint/no-explicit-any
    finally {
        res.end();
    }
});
export default router;
//# sourceMappingURL=requirements.js.map