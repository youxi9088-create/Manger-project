/**
 * 项目作战室完整测试数据生成脚本
 * 用法: node scripts/seed-project-demo.mjs
 */

const API_BASE = "http://localhost:3001";

async function api(path, opts = {}) {
  const url = `${API_BASE}${path}`;
  const res = await fetch(url, {
    headers: { "Content-Type": "application/json", ...opts.headers },
    ...opts,
    body: opts.body ? JSON.stringify(opts.body) : undefined,
  });
  const text = await res.text();
  try {
    return JSON.parse(text);
  } catch {
    return { raw: text, status: res.status };
  }
}

// ============ 1. 创建员工 ============
async function createEmployees() {
  console.log("\n🧑‍💻 创建员工...");
  const employees = [
    { name: "李明", rank: "高级后端工程师", skills: "Node.js, PostgreSQL, Redis", status: "available", power_level: 95 },
    { name: "陈小花", rank: "前端工程师", skills: "React, TypeScript, Next.js", status: "available", power_level: 88 },
    { name: "赵铁柱", rank: "测试工程师", skills: "自动化测试, Jest, Playwright", status: "available", power_level: 80 },
    { name: "孙美琪", rank: "UI设计师", skills: "Figma, 用户体验, 视觉设计", status: "available", power_level: 85 },
  ];

  const created = [];
  for (const emp of employees) {
    const r = await api("/api/employees", { method: "POST", body: emp });
    if (r.success) {
      created.push(r.data);
      console.log(`  ✅ ${r.data.id} ${r.data.name} (${r.data.rank})`);
    } else {
      console.log(`  ❌ 创建员工失败:`, r.error || r);
    }
  }
  return created;
}

// ============ 2. 创建项目 ============
async function createProject() {
  console.log("\n📁 创建项目...");
  const r = await api("/api/project-initiation", {
    method: "POST",
    body: {
      type: "quick_validation",
      title: "智能客服系统升级",
      project_type: "产品迭代",
      demand_source: "运营部",
      demand_date: "2026-06-20",
      raw_requirement: "升级现有客服系统，集成 AI 对话引擎，支持多轮对话、意图识别、知识库自动匹配，提升客服响应效率和用户满意度。",
      team_size_required: 4,
    },
  });

  if (!r.success) {
    console.log("  ❌ 创建项目失败:", r.error);
    return null;
  }

  const project = r.data;
  console.log(`  ✅ ${project.id} ${project.title}`);

  // 更新 deadline 和 start_date（使用 /api/projects/:id 端点）
  await api(`/api/projects/${project.id}`, {
    method: "PATCH",
    body: {
      deadline: "2026-07-15",
      start_date: "2026-06-20",
    },
  });

  return project;
}

// ============ 3. 阶段流转 ============
async function transitionProject(projectId, action, reason) {
  const r = await api(`/api/projects/${projectId}/transition`, {
    method: "POST",
    body: { action, reason, triggered_by: "seed-script" },
  });
  if (r.success) {
    console.log(`  ✅ ${action} → ${r.data.new_phase}`);
  } else {
    console.log(`  ⚠️ ${action} 失败:`, r.error || r);
  }
  return r;
}

async function flowProjectToExecuting(projectId) {
  console.log("\n🔄 项目阶段流转...");
  await transitionProject(projectId, "submit", "提交立项申请");
  await transitionProject(projectId, "approve", "审批通过");
  await transitionProject(projectId, "start_planning", "开始规划阶段");
  await transitionProject(projectId, "lock_plan", "锁定计划");
  await transitionProject(projectId, "start_execution", "开始执行");
}

// ============ 4. 添加项目成员 ============
async function addMembers(projectId, employees) {
  console.log("\n👥 添加项目成员...");
  const roles = ["leader", "member", "member", "member"];
  for (let i = 0; i < employees.length; i++) {
    const r = await api(`/api/projects/${projectId}/members`, {
      method: "POST",
      body: { employee_id: employees[i].id, role: roles[i] },
    });
    if (r.success) {
      console.log(`  ✅ ${employees[i].name} 加入项目 (${roles[i]})`);
    } else {
      console.log(`  ⚠️ ${employees[i].name} 加入失败:`, r.error || r);
    }
  }
}

// ============ 5. 创建需求 ============
async function createRequirements(projectId) {
  console.log("\n📋 创建需求...");
  const reqs = [
    {
      title: "用户端对话界面重构",
      raw_input: "重构现有的客服对话界面，支持消息气泡、输入联想、快捷回复、图片发送等功能。要求响应速度 < 200ms，支持暗黑模式。",
      status: "analyzed",
    },
    {
      title: "管理后台数据看板",
      raw_input: "为运营团队开发客服数据看板，实时展示会话量、响应时长、用户满意度、热点问题分布等核心指标。支持按日期、渠道、客服分组筛选。",
      status: "tasked",
    },
    {
      title: "AI 对话引擎集成",
      raw_input: "集成大语言模型作为智能客服核心引擎，实现多轮对话上下文保持、意图识别准确率 > 90%、知识库自动检索匹配、不满意会话自动转人工。",
      status: "in_progress",
    },
    {
      title: "知识库管理系统",
      raw_input: "开发知识库后台管理系统，支持 FAQ 增删改查、分类标签、批量导入导出、相似问题聚类、自动去重等功能。",
      status: "draft",
    },
  ];

  const created = [];
  for (const req of reqs) {
    const r = await api(`/api/projects/${projectId}/requirements`, {
      method: "POST",
      body: req,
    });
    if (r.success) {
      created.push(r.data);
      console.log(`  ✅ ${r.data.id} ${r.data.title} (${r.data.status})`);
    } else {
      console.log(`  ❌ 创建需求失败:`, r.error || r);
    }
  }
  return created;
}

// ============ 6. 创建任务 ============
async function createTasks(requirements, employees) {
  console.log("\n📌 创建开发任务...");

  // 任务定义：[需求索引, 标题, 描述, 分类, 优先级, 负责人索引, 状态, 预估工时]
  const taskDefs = [
    // 需求1: 用户端对话界面重构 (analyzed)
    [0, "设计消息气泡组件", "实现支持文本/图片/卡片多种类型的消息气泡组件", "frontend", "high", 3, "done", 16],
    [0, "开发输入联想功能", "基于用户输入实时联想快捷回复和历史问题", "frontend", "medium", 1, "done", 12],
    [0, "暗黑模式适配", "全站样式支持暗黑模式切换", "frontend", "low", 1, "in_progress", 8],

    // 需求2: 管理后台数据看板 (tasked)
    [1, "设计数据看板原型", "Figma 设计数据看板页面布局和图表组件", "design", "high", 3, "done", 20],
    [1, "开发实时数据接口", "WebSocket 推送会话量、响应时长等实时指标", "backend", "high", 0, "in_progress", 24],
    [1, "集成 ECharts 图表", "会话趋势图、满意度分布饼图、热点词云", "frontend", "medium", 1, "todo", 16],

    // 需求3: AI 对话引擎集成 (in_progress)
    [2, "接入 LLM API", "封装 OpenAI / Claude API 调用，实现流式输出", "backend", "high", 0, "done", 20],
    [2, "实现意图识别模块", "基于 Few-shot Prompt 的用户意图分类，准确率目标 90%", "backend", "high", 0, "in_progress", 32],
    [2, "开发知识库检索接口", "向量数据库 + 关键词混合检索，Top-5 召回", "backend", "medium", 0, "in_progress", 24],
    [2, "不满意会话转人工", "检测用户负面情绪关键词，自动创建人工工单", "backend", "medium", 0, "todo", 12],
    [2, "对话上下文管理", "维护 10 轮对话历史，支持上下文压缩", "backend", "low", 0, "todo", 16],

    // 需求4: 知识库管理系统 (draft)
    [3, "FAQ 数据表设计", "设计 FAQ、分类、标签、版本的数据库表结构", "backend", "high", 0, "done", 8],
    [3, "FAQ CRUD 接口开发", "RESTful API 实现 FAQ 增删改查", "backend", "medium", 0, "todo", 16],
  ];

  const created = [];
  for (const [reqIdx, title, desc, cat, priority, empIdx, status, hours] of taskDefs) {
    const reqId = requirements[reqIdx].id;
    const assignee = employees[empIdx]?.id || null;

    // 先创建为 todo
    const r = await api("/api/dev-tasks", {
      method: "POST",
      body: {
        requirement_id: reqId,
        title,
        description: desc,
        category: cat,
        priority,
        assignee,
        estimated_hours: hours,
      },
    });

    if (!r.success) {
      console.log(`  ❌ 创建任务失败 [${title}]:`, r.error || r);
      continue;
    }

    let task = r.data;

    // 如果不是 todo，PATCH 更新状态
    if (status !== "todo") {
      const patch = await api(`/api/dev-tasks/${task.id}`, {
        method: "PATCH",
        body: { status },
      });
      if (patch.success) task = patch.data;
    }

    created.push(task);
    const assigneeName = employees[empIdx]?.name || "未分配";
    console.log(`  ✅ ${task.id} ${title.slice(0, 20)}... [${status}] ${assigneeName} ${hours}h`);
  }

  return created;
}

// ============ 7. 创建版本 ============
async function createVersions(projectId) {
  console.log("\n📦 创建版本...");
  const versions = [
    { name: "v1.0.0-alpha", expected_release_date: "2026-06-25", status: "pending_confirm" },
    { name: "v1.1.0-beta", expected_release_date: "2026-07-05", status: "testing" },
    { name: "v2.0.0-release", expected_release_date: "2026-07-15", status: "ready_release" },
  ];

  const created = [];
  for (const ver of versions) {
    const r = await api(`/api/projects/${projectId}/deliveries`, {
      method: "POST",
      body: ver,
    });
    if (r.success) {
      created.push(r.data);
      console.log(`  ✅ ${r.data.id} ${r.data.name} [${r.data.status}]`);
    } else {
      console.log(`  ❌ 创建版本失败:`, r.error || r);
    }
  }
  return created;
}

// ============ 主流程 ============
async function main() {
  console.log("🚀 开始生成项目作战室测试数据...");
  console.log(`API 地址: ${API_BASE}`);

  // 1. 创建员工
  const employees = await createEmployees();
  if (employees.length === 0) {
    console.log("❌ 没有创建任何员工，终止");
    return;
  }

  // 2. 创建项目
  const project = await createProject();
  if (!project) return;

  // 3. 流转到 executing
  await flowProjectToExecuting(project.id);

  // 4. 添加成员
  await addMembers(project.id, employees);

  // 5. 创建需求
  const requirements = await createRequirements(project.id);

  // 6. 创建任务
  const tasks = await createTasks(requirements, employees);

  // 7. 创建版本
  const versions = await createVersions(project.id);

  // 汇总
  console.log("\n" + "=".repeat(50));
  console.log("🎉 测试数据创建完成！");
  console.log("=".repeat(50));
  console.log(`项目: ${project.id} ${project.title}`);
  console.log(`员工: ${employees.length} 人`);
  console.log(`需求: ${requirements.length} 条`);
  console.log(`任务: ${tasks.length} 条`);
  console.log(`版本: ${versions.length} 个`);
  console.log("\n访问地址:");
  console.log(`  http://localhost:5000/projects/${project.id}`);
  console.log("=".repeat(50));
}

main().catch((e) => {
  console.error("脚本执行失败:", e);
  process.exit(1);
});
