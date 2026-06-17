import { Router } from 'express';
import {
  getDailyPlan,
  getDailyPlans,
  upsertDailyPlan,
  updateDailyPlanTask,
  deleteDailyPlanTask,
  getUnfinishedDailyTasks,
} from '../services/db.js';

const router = Router();

// 获取某日计划
router.get('/api/daily-plans/:date', (req, res) => {
  try {
    const { date } = req.params;
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      res.status(400).json({ error: '日期格式错误，应为 YYYY-MM-DD' });
      return;
    }
    const result = getDailyPlan(date);
    const unfinished = getUnfinishedDailyTasks(date);
    res.json({ success: true, ...result, unfinishedTasks: unfinished });
  } catch (e: any) {
    res.status(500).json({ error: e?.message || '获取每日计划失败' });
  }
});

// 保存整日计划
router.put('/api/daily-plans/:date', (req, res) => {
  try {
    const { date } = req.params;
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      res.status(400).json({ error: '日期格式错误，应为 YYYY-MM-DD' });
      return;
    }
    const { goalText, tasks } = req.body || {};
    if (!Array.isArray(tasks)) {
      res.status(400).json({ error: 'tasks 必须是数组' });
      return;
    }
    const result = upsertDailyPlan(date, String(goalText || ''), tasks);
    res.json({ success: true, ...result });
  } catch (e: any) {
    res.status(500).json({ error: e?.message || '保存每日计划失败' });
  }
});

// 更新单个任务
router.patch('/api/daily-plans/tasks/:taskId', (req, res) => {
  try {
    const { taskId } = req.params;
    const updates = req.body || {};
    const allowedFields = ['title', 'status', 'priority', 'assignee', 'estimate_minutes', 'notes', 'completed_at', 'expected_completion_at'];
    const filteredUpdates: Record<string, any> = {};
    for (const [k, v] of Object.entries(updates)) {
      if (allowedFields.includes(k)) filteredUpdates[k] = v;
    }
    const ok = updateDailyPlanTask(taskId, filteredUpdates);
    if (!ok) {
      res.status(404).json({ error: '任务不存在或无变更' });
      return;
    }
    res.json({ success: true });
  } catch (e: any) {
    res.status(500).json({ error: e?.message || '更新任务失败' });
  }
});

// 删除单个任务
router.delete('/api/daily-plans/tasks/:taskId', (req, res) => {
  try {
    const { taskId } = req.params;
    const ok = deleteDailyPlanTask(taskId);
    if (!ok) {
      res.status(404).json({ error: '任务不存在' });
      return;
    }
    res.json({ success: true });
  } catch (e: any) {
    res.status(500).json({ error: e?.message || '删除任务失败' });
  }
});

// 获取多日历史记录
router.get('/api/daily-plans', (req, res) => {
  try {
    const { startDate, endDate, limit } = req.query;
    const plans = getDailyPlans({
      startDate: startDate ? String(startDate) : undefined,
      endDate: endDate ? String(endDate) : undefined,
      limit: limit ? Number(limit) : 30,
    });
    res.json({ success: true, plans });
  } catch (e: any) {
    res.status(500).json({ error: e?.message || '获取历史计划失败' });
  }
});

export default router;
