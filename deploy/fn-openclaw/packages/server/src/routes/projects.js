import { Router } from 'express';
import fs from 'fs';
import path from 'path';
console.log('[DEBUG] Loading projects.ts at', new Date().toISOString());
import { getProjects, getProjectById, getProjectMembers, addProjectMember, getProjectStats, getProjectPhaseLogs, updateProjectPhase, updateProjectPhaseStatus, updateProject, syncProjectStatus, syncAllProjectStatuses, syncProjectInfoFromWorkflow, syncKnowledgeBaseForProjectInfo, getProjectInfoFiles, } from '../services/db.js';
import dbInstance from '../services/db.js';
const router = Router();
// GET /api/projects - 项目列表（支持筛选）
router.get('/api/projects', (req, res) => {
    try {
        const { mine, phase, risk, search, limit, offset } = req.query;
        const result = getProjects({
            mine: mine ? String(mine) : undefined,
            phase: phase ? String(phase) : undefined,
            risk: risk ? String(risk) : undefined,
            search: search ? String(search) : undefined,
            limit: limit ? Number(limit) : 20,
            offset: offset ? Number(offset) : 0,
        });
        console.log('[DEBUG] /api/projects handler called. Projects count:', result.projects.length);
        const responseBody = JSON.stringify({ success: true, projects: result.projects, total: result.total });
        res.setHeader('Content-Type', 'application/json');
        res.end(responseBody);
        return;
    }
    catch (e) {
        res.status(500).json({ error: e?.message || '获取项目列表失败' });
    }
});
// GET /api/projects/:id - 项目详情
router.get('/api/projects/:id', (req, res) => {
    try {
        const { id } = req.params;
        const project = getProjectById(id);
        if (!project) {
            res.status(404).json({ error: '项目不存在' });
            return;
        }
        const members = getProjectMembers(id);
        const stats = getProjectStats(id);
        const phaseLogs = getProjectPhaseLogs(id);
        res.json({
            success: true,
            data: {
                project,
                members,
                stats,
                phase_logs: phaseLogs,
            },
        });
    }
    catch (e) {
        res.status(500).json({ error: e?.message || '获取项目详情失败' });
    }
});
// GET /api/projects/:id/phase-progress - 项目阶段进度
router.get('/api/projects/:id/phase-progress', (req, res) => {
    try {
        const { id } = req.params;
        const project = getProjectById(id);
        if (!project) {
            res.status(404).json({ error: '项目不存在' });
            return;
        }
        const phaseStatus = JSON.parse(project.phase_status || '{}');
        const stats = getProjectStats(id);
        const phases = [
            { key: 'initiation', label: '立项', status: phaseStatus.initiation || 0 },
            { key: 'requirement', label: '需求', status: phaseStatus.requirement || 0 },
            { key: 'planning', label: '计划', status: phaseStatus.planning || 0 },
            { key: 'execution', label: '执行', status: phaseStatus.execution || 0 },
            { key: 'delivery', label: '交付', status: phaseStatus.delivery || 0 },
        ];
        res.json({
            success: true,
            data: {
                phases,
                current_phase: project.current_phase,
                overall_progress: stats.progress_percent,
            },
        });
    }
    catch (e) {
        res.status(500).json({ error: e?.message || '获取阶段进度失败' });
    }
});
// POST /api/projects/:id/transition - 项目状态流转
router.post('/api/projects/:id/transition', (req, res) => {
    try {
        const { id } = req.params;
        const { action, reason, triggered_by } = req.body || {};
        // 定义允许的操作到阶段的映射
        const actionToPhase = {
            submit: 'submitted',
            approve: 'approved',
            start_planning: 'planning',
            lock_plan: 'plan_locked',
            start_execution: 'executing',
            submit_delivery: 'delivering',
            start_review: 'reviewing',
            accept: 'accepted',
            reject: 'rejected',
            archive: 'archived',
        };
        const targetPhase = actionToPhase[action];
        if (!targetPhase) {
            res.status(400).json({ error: '无效的操作类型' });
            return;
        }
        const ok = updateProjectPhase(id, targetPhase, triggered_by, reason);
        if (!ok) {
            res.status(404).json({ error: '项目不存在或状态未变更' });
            return;
        }
        res.json({ success: true, data: { new_phase: targetPhase } });
    }
    catch (e) {
        res.status(500).json({ error: e?.message || '状态流转失败' });
    }
});
// PATCH /api/projects/:id - 更新项目基本信息
router.patch('/api/projects/:id', (req, res) => {
    try {
        const { id } = req.params;
        const updates = req.body || {};
        // 允许更新的字段白名单
        const allowedFields = [
            'title', 'project_leader', 'deadline', 'start_date',
            'team_size_required', 'team_size_current', 'risk_level', 'risk_reason',
            'external_project_id', 'vp', 'knowledge_base_path',
        ];
        const filteredUpdates = {};
        for (const key of allowedFields) {
            if (updates[key] !== undefined) {
                filteredUpdates[key] = updates[key];
            }
        }
        if (Object.keys(filteredUpdates).length === 0) {
            res.status(400).json({ error: '没有可更新的字段' });
            return;
        }
        const ok = updateProject(id, filteredUpdates);
        if (!ok) {
            res.status(404).json({ error: '项目不存在或更新失败' });
            return;
        }
        res.json({ success: true, message: '更新成功' });
    }
    catch (e) {
        res.status(500).json({ error: e?.message || '更新项目失败' });
    }
});
// PATCH /api/projects/:id/phase-status - 更新阶段进度
router.patch('/api/projects/:id/phase-status', (req, res) => {
    try {
        const { id } = req.params;
        const { initiation, requirement, planning, execution, delivery } = req.body || {};
        const ok = updateProjectPhaseStatus(id, {
            initiation,
            requirement,
            planning,
            execution,
            delivery,
        });
        if (!ok) {
            res.status(404).json({ error: '项目不存在' });
            return;
        }
        res.json({ success: true });
    }
    catch (e) {
        res.status(500).json({ error: e?.message || '更新阶段进度失败' });
    }
});
// POST /api/projects/:id/members - 添加项目成员
router.post('/api/projects/:id/members', (req, res) => {
    try {
        const { id } = req.params;
        const { employee_id, role } = req.body || {};
        if (!employee_id) {
            res.status(400).json({ error: '缺少员工ID' });
            return;
        }
        const member = addProjectMember(id, employee_id, role || 'member');
        if (!member) {
            res.status(400).json({ error: '添加成员失败，可能已存在' });
            return;
        }
        res.json({ success: true, data: member });
    }
    catch (e) {
        res.status(500).json({ error: e?.message || '添加成员失败' });
    }
});
// GET /api/projects/:id/members - 获取项目成员
router.get('/api/projects/:id/members', (req, res) => {
    try {
        const { id } = req.params;
        const members = getProjectMembers(id);
        res.json({ success: true, data: members });
    }
    catch (e) {
        res.status(500).json({ error: e?.message || '获取成员列表失败' });
    }
});
// POST /api/projects/:id/generate-sprint-plan - 生成2周交付计划（Phase 1）
router.post('/api/projects/:id/generate-sprint-plan', (req, res) => {
    try {
        const { id } = req.params;
        const { start_date, sprint_days = 14 } = req.body || {};
        const project = getProjectById(id);
        if (!project) {
            res.status(404).json({ error: '项目不存在' });
            return;
        }
        // 获取项目关联的需求下的所有任务
        const tasks = dbInstance.prepare(`
      SELECT dt.*, ra.project_id
      FROM dev_tasks dt
      JOIN requirement_analyses ra ON dt.requirement_id = ra.id
      WHERE ra.project_id = ?
      ORDER BY dt.sort_order ASC
    `).all(id);
        if (tasks.length === 0) {
            res.status(400).json({ error: '该项目没有关联的开发任务，请先在需求分析中生成任务' });
            return;
        }
        // 计算排期
        const startDate = start_date ? new Date(start_date) : new Date();
        const workDays = [];
        let currentDate = new Date(startDate);
        // 计算工作日（跳过周末）
        while (workDays.length < sprint_days) {
            const dayOfWeek = currentDate.getDay();
            if (dayOfWeek !== 0 && dayOfWeek !== 6) { // 0=周日, 6=周六
                workDays.push(currentDate.getTime());
            }
            currentDate.setDate(currentDate.getDate() + 1);
        }
        // 按任务顺序分配日期
        let dayIndex = 0;
        let cumulativeHours = 0;
        const WORK_HOURS_PER_DAY = 8;
        const updateStmt = dbInstance.prepare(`
      UPDATE dev_tasks 
      SET start_date = ?, due_date = ?, sprint_week = ?, updated_at = ?
      WHERE id = ?
    `);
        for (const task of tasks) {
            const hours = task.estimated_hours || 8;
            cumulativeHours += hours;
            // 计算需要多少个工作日
            const daysNeeded = Math.ceil(cumulativeHours / WORK_HOURS_PER_DAY);
            const endDayIndex = Math.min(daysNeeded - 1, workDays.length - 1);
            const taskStartDate = new Date(workDays[dayIndex]);
            const taskEndDate = new Date(workDays[endDayIndex]);
            const sprintWeek = Math.floor(dayIndex / 5) + 1; // 每周算 5 个工作日
            updateStmt.run(taskStartDate.toISOString().split('T')[0], taskEndDate.toISOString().split('T')[0], sprintWeek, new Date().toISOString(), task.id);
            // 如果这个任务跨到了下一天，移动到下一天开始
            if (endDayIndex > dayIndex) {
                dayIndex = endDayIndex + 1;
            }
        }
        // 更新项目阶段进度
        updateProjectPhaseStatus(id, { planning: 1, execution: 0.5 });
        res.json({
            success: true,
            data: {
                start_date: startDate.toISOString().split('T')[0],
                sprint_days: sprint_days,
                tasks_scheduled: tasks.length,
            },
        });
    }
    catch (e) {
        res.status(500).json({ error: e?.message || '生成计划失败' });
    }
});
// GET /api/projects/:id/sprint-tasks - 获取项目的冲刺任务（按周分组）
router.get('/api/projects/:id/sprint-tasks', (req, res) => {
    try {
        const { id } = req.params;
        const tasks = dbInstance.prepare(`
      SELECT dt.*, ra.project_id
      FROM dev_tasks dt
      JOIN requirement_analyses ra ON dt.requirement_id = ra.id
      WHERE ra.project_id = ?
      ORDER BY dt.sprint_week ASC, dt.sort_order ASC
    `).all(id);
        // 按周分组
        const weeks = {};
        for (const task of tasks) {
            const week = task.sprint_week || 1;
            if (!weeks[week])
                weeks[week] = [];
            weeks[week].push(task);
        }
        res.json({
            success: true,
            data: {
                weeks,
                total_tasks: tasks.length,
            },
        });
    }
    catch (e) {
        res.status(500).json({ error: e?.message || '获取冲刺任务失败' });
    }
});
// POST /api/projects/:id/sync - 手动同步单个项目状态
router.post('/api/projects/:id/sync', (req, res) => {
    try {
        const { id } = req.params;
        const result = syncProjectStatus(id);
        if (!result) {
            res.status(404).json({ error: '项目不存在或同步失败' });
            return;
        }
        res.json({ success: true, data: result });
    }
    catch (e) {
        res.status(500).json({ error: e?.message || '同步失败' });
    }
});
// POST /api/projects/:id/sync-info - 从工作流项目信息同步
router.post('/api/projects/:id/sync-info', async (req, res) => {
    try {
        const { id } = req.params;
        const result = await syncProjectInfoFromWorkflow(id);
        if (!result.success) {
            res.status(400).json({ success: false, error: result.message, proid: result.proid });
            return;
        }
        // 同步到知识库
        if (result.proid) {
            try {
                const infoFiles = getProjectInfoFiles({ proid: result.proid, limit: 1 });
                const infoFile = infoFiles[0];
                const infoContent = infoFile?.content || result.message;
                let infoStructured = {};
                let infoTodoList;
                try {
                    const meta = infoFile?.metadata ? JSON.parse(infoFile.metadata) : {};
                    infoStructured = meta.structured_data || {};
                    infoTodoList = meta.todo_list_text;
                }
                catch {
                    infoStructured = {};
                }
                const kbResult = syncKnowledgeBaseForProjectInfo(result.proid, infoContent, infoStructured, infoTodoList);
                result.knowledge_base_sync = kbResult;
            }
            catch (kbErr) {
                result.knowledge_base_sync = { success: false, message: kbErr?.message };
            }
        }
        res.json({ success: true, data: result });
    }
    catch (e) {
        res.status(500).json({ success: false, error: e?.message || '同步失败' });
    }
});
// POST /api/projects/sync-all - 批量同步所有活跃项目
router.post('/api/projects/sync-all', (req, res) => {
    try {
        const results = syncAllProjectStatuses();
        const updated = results.filter(r => r.result.updated);
        res.json({
            success: true,
            data: {
                total: results.length,
                updated: updated.length,
                details: results.map(r => ({ projectId: r.projectId, ...r.result })),
            }
        });
    }
    catch (e) {
        res.status(500).json({ error: e?.message || '批量同步失败' });
    }
});
export default router;
// GET /api/projects/:id/knowledge-base - 读取项目关联的知识库文件
// 如果数据库记录的文件（如旧飞书 project-data-*.md）已被删除，自动回退到同目录最新的 project-report-*.md
router.get('/api/projects/:id/knowledge-base', (req, res) => {
    try {
        const { id } = req.params;
        const project = getProjectById(id);
        if (!project) {
            res.status(404).json({ error: '项目不存在' });
            return;
        }
        if (!project.knowledge_base_path) {
            res.status(404).json({ error: '该项目没有关联知识库' });
            return;
        }
        let kbPath = project.knowledge_base_path;
        // 安全检查：只允许读取 .hermes/knowledge-base/ 下的 .md 文件
        if (!kbPath.endsWith('.md') || !kbPath.includes('knowledge-base')) {
            res.status(403).json({ error: '非法路径' });
            return;
        }
        // Windows 路径转换：/c/Users/... -> C:/Users/...
        if (kbPath.startsWith('/c/') || kbPath.startsWith('/C/')) {
            kbPath = 'C:/' + kbPath.substring(3);
        }
        let readPath = kbPath;
        if (!fs.existsSync(readPath)) {
            const dir = path.dirname(readPath);
            if (!fs.existsSync(dir)) {
                res.status(404).json({ error: '知识库目录不存在: ' + dir });
                return;
            }
            const reportFiles = fs.readdirSync(dir)
                .filter((f) => f.startsWith('project-report-') && f.endsWith('.md'))
                .sort()
                .reverse();
            if (reportFiles.length === 0) {
                res.status(404).json({ error: '知识库文件不存在: ' + kbPath });
                return;
            }
            readPath = path.join(dir, reportFiles[0]);
        }
        const content = fs.readFileSync(readPath, 'utf-8');
        res.json({ success: true, data: { content, path: readPath } });
    }
    catch (e) {
        res.status(500).json({ error: e?.message || '读取知识库失败' });
    }
});
// GET /api/projects/:id/kb-summary - 读取知识库结构化摘要
router.get('/api/projects/:id/kb-summary', (req, res) => {
    try {
        const { id } = req.params;
        const project = getProjectById(id);
        if (!project) {
            res.status(404).json({ error: '项目不存在' });
            return;
        }
        if (!project.knowledge_base_path) {
            res.status(404).json({ error: '该项目没有关联知识库' });
            return;
        }
        let kbPath = project.knowledge_base_path;
        // 安全检查
        if (!kbPath.endsWith('.md') || !kbPath.includes('knowledge-base')) {
            res.status(403).json({ error: '非法路径' });
            return;
        }
        // Windows 路径转换
        if (kbPath.startsWith('/c/') || kbPath.startsWith('/C/')) {
            kbPath = 'C:/' + kbPath.substring(3);
        }
        // 读取同目录下的 summary.json
        const summaryPath = kbPath.replace(/[^/\\]+$/, '') + 'summary.json';
        if (!fs.existsSync(summaryPath)) {
            res.status(404).json({ error: '知识库摘要不存在: ' + summaryPath });
            return;
        }
        const content = fs.readFileSync(summaryPath, 'utf-8');
        const summary = JSON.parse(content);
        res.json({ success: true, data: summary });
    }
    catch (e) {
        res.status(500).json({ error: e?.message || '读取知识库摘要失败' });
    }
});
// GET /api/projects/:id/kb-report - 读取飞书同步的最新报告(Markdown)
router.get('/api/projects/:id/kb-report', (req, res) => {
    try {
        const { id } = req.params;
        const project = getProjectById(id);
        if (!project) {
            res.status(404).json({ error: '项目不存在' });
            return;
        }
        if (!project.knowledge_base_path) {
            res.status(404).json({ error: '该项目没有关联知识库' });
            return;
        }
        let kbPath = project.knowledge_base_path;
        if (!kbPath.includes('knowledge-base')) {
            res.status(403).json({ error: '非法路径' });
            return;
        }
        if (kbPath.startsWith('/c/') || kbPath.startsWith('/C/')) {
            kbPath = 'C:/' + kbPath.substring(3);
        }
        // 查找同目录下最新的 project-report-*.md 文件
        const dir = kbPath.replace(/[^/\\]+$/, '');
        if (!fs.existsSync(dir)) {
            res.status(404).json({ error: '知识库目录不存在' });
            return;
        }
        const reportFiles = fs.readdirSync(dir)
            .filter((f) => f.startsWith('project-report-') && f.endsWith('.md'))
            .sort()
            .reverse();
        if (reportFiles.length === 0) {
            res.status(404).json({ error: '暂无飞书同步报告' });
            return;
        }
        const latestReport = reportFiles[0];
        const reportContent = fs.readFileSync(dir + latestReport, 'utf-8');
        res.json({ success: true, data: { content: reportContent, filename: latestReport } });
    }
    catch (e) {
        res.status(500).json({ error: e?.message || '读取报告失败' });
    }
});
//# sourceMappingURL=projects.js.map