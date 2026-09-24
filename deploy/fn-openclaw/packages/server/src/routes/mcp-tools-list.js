// REST 端点：返回 MCP 工具列表（供前端展示工具市场用）
// 不走 MCP SSE 协议，纯元数据展示
import { Router } from "express";
import { initAgentTools, getAllTools } from "../services/agent-tools.js";
const router = Router();
// 工具领域分类映射
const CATEGORY_MAP = {
    // 项目管理
    get_system_status: "系统概览",
    get_project_by_id: "项目管理",
    query_projects: "项目管理",
    create_project: "项目管理",
    update_project: "项目管理",
    transition_project_phase: "项目管理",
    add_project_member: "项目管理",
    sync_project_status: "项目管理",
    // 需求分析
    get_requirement_by_id: "需求分析",
    query_requirements: "需求分析",
    create_requirement: "需求分析",
    update_requirement: "需求分析",
    delete_requirement: "需求分析",
    // 开发任务
    get_dev_task_by_id: "开发任务",
    query_dev_tasks: "开发任务",
    create_dev_task: "开发任务",
    update_dev_task: "开发任务",
    assign_employee: "开发任务",
    delete_dev_task: "开发任务",
    // 员工
    query_employees: "员工管理",
    // 版本
    query_versions: "版本管理",
    // 工作周期
    query_work_cycles: "工作周期",
    // IM 聊天
    query_chat_records: "IM 通讯",
    // 分析报告
    query_reports: "分析报告",
    // 每日计划
    upsert_daily_plan: "每日计划",
    update_daily_plan_task: "每日计划",
    delete_daily_plan_task: "每日计划",
};
const CATEGORY_ORDER = [
    "系统概览",
    "项目管理",
    "需求分析",
    "开发任务",
    "员工管理",
    "版本管理",
    "工作周期",
    "IM 通讯",
    "分析报告",
    "每日计划",
];
const TOOL_ICONS = {
    get_system_status: "📊",
    get_project_by_id: "📁",
    query_projects: "📁",
    create_project: "✨",
    update_project: "✏️",
    transition_project_phase: "🔄",
    add_project_member: "👤",
    sync_project_status: "🔁",
    get_requirement_by_id: "📋",
    query_requirements: "📋",
    create_requirement: "✨",
    update_requirement: "✏️",
    delete_requirement: "🗑️",
    get_dev_task_by_id: "🎯",
    query_dev_tasks: "🎯",
    create_dev_task: "✨",
    update_dev_task: "✏️",
    assign_employee: "👤",
    delete_dev_task: "🗑️",
    query_employees: "👥",
    query_versions: "🏷️",
    query_work_cycles: "⏱️",
    query_chat_records: "💬",
    query_reports: "📈",
    upsert_daily_plan: "📅",
    update_daily_plan_task: "✏️",
    delete_daily_plan_task: "🗑️",
};
const READONLY_TOOLS = new Set([
    "get_system_status",
    "get_project_by_id",
    "query_projects",
    "get_requirement_by_id",
    "query_requirements",
    "get_dev_task_by_id",
    "query_dev_tasks",
    "query_employees",
    "query_versions",
    "query_work_cycles",
    "query_chat_records",
    "query_reports",
]);
const DELETE_TOOLS = new Set([
    "delete_requirement",
    "delete_dev_task",
    "delete_daily_plan_task",
]);
function buildParamsDoc(schema) {
    if (!schema || !schema.properties)
        return { params: [], required: [] };
    const params = Object.entries(schema.properties).map(([name, def]) => ({
        name,
        type: def.type || "string",
        description: def.description || "",
        enum: def.enum || null,
    }));
    const required = schema.required || [];
    return { params, required };
}
router.get("/api/mcp/tools-list", (req, res) => {
    initAgentTools();
    const allTools = getAllTools();
    // 按领域分组
    const byCategory = new Map();
    for (const cat of CATEGORY_ORDER)
        byCategory.set(cat, []);
    for (const tool of allTools) {
        const { name, description, parameters } = tool.definition;
        // 跳过 MCP 内部工具
        if (name === "ListTools" || name === "CallTool")
            continue;
        const cat = CATEGORY_MAP[name] || "其他";
        const { params, required } = buildParamsDoc(parameters);
        byCategory.get(cat)?.push({
            name,
            icon: TOOL_ICONS[name] || "🔧",
            description,
            category: cat,
            params,
            required,
            isReadonly: READONLY_TOOLS.has(name),
            isDelete: DELETE_TOOLS.has(name),
            requireConfirm: tool.requireConfirm || false,
        });
    }
    // 清理空分类
    const categories = CATEGORY_ORDER
        .map(cat => ({ name: cat, tools: byCategory.get(cat) || [] }))
        .filter(c => c.tools.length > 0);
    const all = categories.flatMap(c => c.tools);
    res.json({
        total: all.length,
        sseEndpoint: "/mcp/sse",
        categories,
        tools: all,
    });
});
export default router;
//# sourceMappingURL=mcp-tools-list.js.map