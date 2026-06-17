import { Router } from "express";
import dbInstance from "../services/db.js";

const router = Router();

// ============= 工具函数 =============

function generateEmployeeId(): string {
  const now = new Date();
  const dateStr = now.toISOString().slice(0, 10).replace(/-/g, "");
  const prefix = `EMP-${dateStr}-`;
  const row = dbInstance
    .prepare(`SELECT id FROM employees WHERE id LIKE ? ORDER BY id DESC LIMIT 1`)
    .get(`${prefix}%`) as { id: string } | undefined;
  if (row) {
    const lastNum = parseInt(row.id.split("-").pop() || "0", 10);
    return `${prefix}${String(lastNum + 1).padStart(3, "0")}`;
  }
  return `${prefix}001`;
}

// ============= CRUD =============

// GET /api/employees - 列表（支持 status 筛选）
router.get("/api/employees", (_req, res) => {
  try {
    const { status } = _req.query;
    let sql = "SELECT * FROM employees ORDER BY created_at DESC";
    const params: any[] = []; // eslint-disable-line @typescript-eslint/no-explicit-any
    if (status && typeof status === "string") {
      sql += " WHERE status = ?";
      params.push(status);
    }
    const rows = dbInstance.prepare(sql).all(...params);
    res.json({ success: true, data: rows });
  } catch (error: any) { // eslint-disable-line @typescript-eslint/no-explicit-any
    res.status(500).json({ error: error?.message || "查询失败" });
  }
});

// GET /api/employees/:id - 详情
router.get("/api/employees/:id", (req, res) => {
  try {
    const row = dbInstance.prepare("SELECT * FROM employees WHERE id = ?").get(req.params.id);
    if (!row) return res.status(404).json({ error: "员工不存在" });
    res.json({ success: true, data: row });
  } catch (error: any) { // eslint-disable-line @typescript-eslint/no-explicit-any
    res.status(500).json({ error: error?.message });
  }
});

// POST /api/employees - 新建
router.post("/api/employees", (req, res) => {
  try {
    const { name, rank, skills, access_method, status, power_level, avatar_url, notes } = req.body;
    if (!name) return res.status(400).json({ error: "姓名不能为空" });

    const id = generateEmployeeId();
    const now = new Date().toISOString();

    dbInstance.prepare(
      `INSERT INTO employees (id, name, rank, skills, access_method, status, power_level, avatar_url, notes, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(id, name, rank || null, skills || null, access_method || "local",
      status || "available", power_level ?? 50, avatar_url || null, notes || null, now, now);

    const created = dbInstance.prepare("SELECT * FROM employees WHERE id = ?").get(id);
    res.status(201).json({ success: true, data: created });
  } catch (error: any) { // eslint-disable-line @typescript-eslint/no-explicit-any
    res.status(500).json({ error: error?.message });
  }
});

// PATCH /api/employees/:id - 更新
router.patch("/api/employees/:id", (req, res) => {
  try {
    const existing = dbInstance.prepare("SELECT id FROM employees WHERE id = ?").get(req.params.id);
    if (!existing) return res.status(404).json({ error: "员工不存在" });

    const allowedFields = ["name", "rank", "skills", "access_method", "status", "power_level", "avatar_url", "notes",
      "agent_type", "agent_prompt", "agent_tools", "agent_config"];
    const sets: string[] = [];
    const params: any[] = []; // eslint-disable-line @typescript-eslint/no-explicit-any

    for (const f of allowedFields) {
      if (req.body[f] !== undefined) {
        sets.push(`${f} = ?`);
        params.push(req.body[f]);
      }
    }

    if (sets.length === 0) return res.status(400).json({ error: "没有可更新的字段" });

    sets.push("updated_at = datetime('now','localtime')");
    params.push(req.params.id);

    dbInstance.prepare(`UPDATE employees SET ${sets.join(", ")} WHERE id = ?`).run(...params);

    const updated = dbInstance.prepare("SELECT * FROM employees WHERE id = ?").get(req.params.id);
    res.json({ success: true, data: updated });
  } catch (error: any) { // eslint-disable-line @typescript-eslint/no-explicit-any
    res.status(500).json({ error: error?.message });
  }
});

// DELETE /api/employees/:id - 删除
router.delete("/api/employees/:id", (req, res) => {
  try {
    const existing = dbInstance.prepare("SELECT id FROM employees WHERE id = ?").get(req.params.id);
    if (!existing) return res.status(404).json({ error: "员工不存在" });

    dbInstance.prepare("DELETE FROM employees WHERE id = ?").run(req.params.id);
    res.json({ success: true });
  } catch (error: any) { // eslint-disable-line @typescript-eslint/no-explicit-any
    res.status(500).json({ error: error?.message });
  }
});

// POST /api/employees/:id/generate-avatar - AI 生成像素风 Q 版头像
router.post("/api/employees/:id/generate-avatar", async (req, res) => {
  try {
    const emp = dbInstance.prepare("SELECT id, name, rank, skills FROM employees WHERE id = ?").get(req.params.id) as
      { id: string; name: string; rank: string | null; skills: string | null } | undefined;
    if (!emp) return res.status(404).json({ error: "员工不存在" });

    const apiKey = process.env.MOONSHOT_API_KEY || process.env.OPENAI_API_KEY;
    const baseUrl = process.env.MOONSHOT_BASE_URL || process.env.OPENAI_BASE_URL || "https://api.moonshot.cn/v1";
    const model = process.env.OPENAI_CHAT_MODEL || "moonshot-v1-128k";
    if (!apiKey) return res.status(500).json({ error: "未配置 API Key" });

    const systemPrompt = `你是一个像素艺术头像生成专家。用户会提供一个人的姓名、职级和技能描述，你需要生成一个像素风 Q 版（chibi）风格的 SVG 头像代码。

严格规则：
1. 输出必须是纯 SVG 代码（以 <svg 开头，以 </svg> 结尾），不要输出任何其他文字
2. 尺寸为 80x80 像素，viewBox="0 0 80 80"
3. Q 版风格：大头（占 50-60% 高度）小身、2-3 头身比、圆润造型
4. 像素颗粒感：使用 rect 元素模拟像素块（每个"像素"约 3-4x3-4 单位），不用平滑路径
5. 配色方案根据人物特征决定：
   - 技术类（工程师/开发）：蓝/青色调 + 深色背景
   - 设计/创意类：紫/粉色调 + 渐变背景  
   - 管理/领导类：金/橙色调 + 庄重背景
   - 默认使用温暖明亮的配色
6. 人物必须有：头发样式、面部表情（简单像素点眼睛+微笑线）、上衣颜色
7. 背景用半透明圆形或圆角矩形做装饰
8. SVG 必须可以直接作为 <img src="data:image/svg+xml,..."> 使用
9. 不要使用外部图片引用或字体，全部用基本形状
10. style 属性尽量精简`;

    const userPrompt = `请为以下员工生成一个像素风 Q 版头像 SVG：
- 姓名：${emp.name}
- 职级：${emp.rank || "未设定"}
- 技能描述：${emp.skills || "暂无"}
- 要求：可爱、专业感、像素风格、Q版比例`;

    const response = await fetch(`${baseUrl}/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model,
        temperature: 0.8,
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt },
        ],
        max_tokens: 4000,
      }),
    });

    if (!response.ok) {
      const errText = await response.text();
      return res.status(500).json({ error: `AI 接口错误: ${response.status} ${errText}` });
    }

    const json = await response.json() as {
      choices?: [{ message?: { content?: string } }];
    };
    let content = json.choices?.[0]?.message?.content || "";

    // 提取 SVG（去掉可能的 markdown 代码块标记）
    const svgMatch = content.match(/<svg[\s\S]*<\/svg>/);
    if (!svgMatch) {
      return res.status(500).json({ error: "AI 未返回有效的 SVG 内容", raw: content.slice(0, 200) });
    }

    let svg = svgMatch[0];
    // 确保 svg 有 xmlns 声明
    if (!svg.includes("xmlns")) {
      svg = svg.replace("<svg", '<svg xmlns="http://www.w3.org/2000/svg"');
    }
    // 编码为 data URI
    const b64Svg = Buffer.from(svg).toString("base64");
    const avatarDataUri = `data:image/svg+xml;base64,${b64Svg}`;

    // 保存到数据库
    dbInstance.prepare("UPDATE employees SET avatar_url = ?, updated_at = datetime('now','localtime') WHERE id = ?")
      .run(avatarDataUri, emp.id);

    res.json({ success: true, data: { avatar_url: avatarDataUri, raw_svg_length: svg.length } });
  } catch (error: any) { // eslint-disable-line @typescript-eslint/no-explicit-any
    res.status(500).json({ error: error?.message || "生成失败" });
  }
});

export default router;
