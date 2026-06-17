import { Router } from 'express';
import fs from 'fs';
import path from 'path';
import { getProjectById, getProjectStakeholders, addProjectStakeholder, removeProjectStakeholder } from '../services/db.js';

const router = Router();

const KB_PEOPLE_BASE = 'C:/Users/986916/.hermes/knowledge-base/people';

/* ─── 辅助函数 ─── */
function readPersonFile(category: string, name: string): any | null {
  const dir = path.join(KB_PEOPLE_BASE, category);
  if (!fs.existsSync(dir)) return null;

  const jsonPath = path.join(dir, `${name}.json`);
  if (!fs.existsSync(jsonPath)) return null;

  try {
    return JSON.parse(fs.readFileSync(jsonPath, 'utf-8'));
  } catch {
    return null;
  }
}

function findPersonAcrossCategories(name: string): { category: string; data: any } | null {
  const categories = ['leaders', 'stakeholders', 'colleagues', 'vendors'];
  for (const cat of categories) {
    const data = readPersonFile(cat, name);
    if (data) return { category: cat, data };
  }
  return null;
}

/* ─── GET /api/people ─── */
router.get('/api/people', (_req, res) => {
  try {
    const categories = ['leaders', 'stakeholders', 'colleagues', 'vendors'];
    const result: Record<string, any[]> = {};
    for (const cat of categories) {
      const dir = path.join(KB_PEOPLE_BASE, cat);
      if (!fs.existsSync(dir)) { result[cat] = []; continue; }
      const arr: any[] = [];
      for (const file of fs.readdirSync(dir)) {
        if (!file.endsWith('.json') || file === 'summary.json') continue;
        try {
          const data = JSON.parse(fs.readFileSync(path.join(dir, file), 'utf-8'));
          arr.push({ name: data.name, role: data.role, level: data.level, tags: data.tags || [] });
        } catch { /* ignore */ }
      }
      result[cat] = arr;
    }
    res.json({ success: true, data: result });
  } catch (e: any) {
    res.status(500).json({ error: e?.message || '获取人员列表失败' });
  }
});

/* ─── GET /api/people/:name ─── */
router.get('/api/people/:name', (req, res) => {
  try {
    const { name } = req.params;
    const found = findPersonAcrossCategories(name);
    if (!found) {
      res.status(404).json({ error: '人员不存在' });
      return;
    }
    res.json({ success: true, data: found.data, category: found.category });
  } catch (e: any) {
    res.status(500).json({ error: e?.message || '获取人员信息失败' });
  }
});

/* ─── GET /api/projects/:id/stakeholders ─── */
router.get('/api/projects/:id/stakeholders', (req, res) => {
  try {
    const { id } = req.params;
    const project = getProjectById(id);
    if (!project) {
      res.status(404).json({ error: '项目不存在' });
      return;
    }

    // 1. 从数据库读取项目干系人列表
    const dbStakeholders = getProjectStakeholders(id);

    // 2. 从知识库补充人员详情
    const result: any[] = [];
    for (const s of dbStakeholders) {
      const found = findPersonAcrossCategories(s.person_name);
      if (found) {
        result.push({
          id: s.id,
          name: found.data.name,
          role: s.role_in_project || found.data.role,
          level: found.data.level,
          department: found.data.department,
          tags: found.data.tags || [],
          personality_traits: found.data.personality?.traits || [],
          meeting_notes: found.data.meeting_style?.notes || '',
          category: found.category,
          person_category: s.person_category,
          notes: s.notes,
          created_at: s.created_at,
        });
      } else {
        // 知识库中找不到，只返回DB数据
        result.push({
          id: s.id,
          name: s.person_name,
          role: s.role_in_project || '未知角色',
          level: '',
          department: '',
          tags: [],
          personality_traits: [],
          meeting_notes: s.notes || '',
          category: s.person_category || 'unknown',
          person_category: s.person_category,
          notes: s.notes,
          created_at: s.created_at,
        });
      }
    }

    res.json({ success: true, data: result });
  } catch (e: any) {
    res.status(500).json({ error: e?.message || '获取项目干系人失败' });
  }
});

/* ─── POST /api/projects/:id/stakeholders ─── */
router.post('/api/projects/:id/stakeholders', (req, res) => {
  try {
    const { id } = req.params;
    const project = getProjectById(id);
    if (!project) {
      res.status(404).json({ error: '项目不存在' });
      return;
    }

    const { person_name, person_category, role_in_project, notes } = req.body || {};
    if (!person_name || typeof person_name !== 'string') {
      res.status(400).json({ error: '缺少 person_name' });
      return;
    }

    const created = addProjectStakeholder(id, person_name, person_category, role_in_project, notes);
    if (!created) {
      res.status(409).json({ error: '该人员已存在于项目干系人中' });
      return;
    }

    res.json({ success: true, data: created });
  } catch (e: any) {
    res.status(500).json({ error: e?.message || '添加干系人失败' });
  }
});

/* ─── DELETE /api/projects/:id/stakeholders/:name ─── */
router.delete('/api/projects/:id/stakeholders/:name', (req, res) => {
  try {
    const { id, name } = req.params;
    const project = getProjectById(id);
    if (!project) {
      res.status(404).json({ error: '项目不存在' });
      return;
    }

    const ok = removeProjectStakeholder(id, decodeURIComponent(name));
    if (!ok) {
      res.status(404).json({ error: '干系人不存在' });
      return;
    }

    res.json({ success: true, message: '删除成功' });
  } catch (e: any) {
    res.status(500).json({ error: e?.message || '删除干系人失败' });
  }
});

export default router;
