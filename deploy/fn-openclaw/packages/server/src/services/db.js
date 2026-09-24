import Database from 'better-sqlite3';
import path from 'path';
import { fileURLToPath } from 'url';
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
// LLM 配置动态读取（避免模块加载早于 dotenv）
function getLLMConfig() {
    const moonshotBaseUrl = process.env.MOONSHOT_BASE_URL || 'https://api.moonshot.cn/v1';
    const moonshotApiKey = process.env.MOONSHOT_API_KEY || '';
    return {
        baseUrl: process.env.OPENAI_BASE_URL || moonshotBaseUrl,
        apiKey: process.env.OPENAI_API_KEY || moonshotApiKey || '',
        fallbackBaseUrl: moonshotBaseUrl,
        fallbackApiKey: moonshotApiKey,
        model: process.env.OPENAI_CHAT_MODEL || process.env.MOONSHOT_MODEL || 'moonshot-v1-128k',
    };
}
// 数据库文件路径（openclaw/data/chat.db）
const dbPath = process.env.DB_PATH || path.join(__dirname, '..', '..', '..', '..', 'data', 'chat.db');
// 确保 data 目录存在
import fs from 'fs';
const dataDir = path.dirname(dbPath);
if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true });
}
// 创建数据库连接
const db = new Database(dbPath);
// 启用 WAL 模式以提高性能
db.pragma('journal_mode = WAL');
// 注意：不启用 foreign_keys pragma —— 已有旧表的 FK 定义是 NO ACTION（非 CASCADE），
// 启用后会导致 DELETE sessions 失败。deleteSession 里已显式删关联数据，不需要级联。
// 初始化数据库表
db.exec(`
  -- 会话表
  CREATE TABLE IF NOT EXISTS sessions (
    id TEXT PRIMARY KEY,
    title TEXT NOT NULL,
    model TEXT NOT NULL,
    sdk_session_id TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );

  -- 消息表
  CREATE TABLE IF NOT EXISTS messages (
    id TEXT PRIMARY KEY,
    session_id TEXT NOT NULL,
    role TEXT NOT NULL CHECK (role IN ('user', 'assistant')),
    content TEXT NOT NULL,
    model TEXT,
    created_at TEXT NOT NULL,
    tool_calls TEXT,
    FOREIGN KEY (session_id) REFERENCES sessions(id) ON DELETE CASCADE
  );

  -- 为会话 ID 创建索引
  CREATE INDEX IF NOT EXISTS idx_messages_session_id ON messages(session_id);

  -- ========== IM 聊天记录分析相关表 ==========

  -- IM 数据源配置表（存储不同 IM 系统的连接配置）
  CREATE TABLE IF NOT EXISTS im_sources (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    type TEXT NOT NULL CHECK (type IN ('wechat_work', 'wechat', 'dingtalk', 'feishu', '99u', '99u_web', 'custom')),
    config TEXT NOT NULL,
    enabled INTEGER DEFAULT 1,
    last_sync_at TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );

  -- IM 聊天记录表（存储从 IM 系统抓取的原始聊天记录）
  CREATE TABLE IF NOT EXISTS im_chat_records (
    id TEXT PRIMARY KEY,
    source_id TEXT NOT NULL,
    im_message_id TEXT,
    sender_name TEXT NOT NULL,
    sender_id TEXT,
    group_name TEXT,
    group_id TEXT,
    content TEXT NOT NULL,
    message_type TEXT DEFAULT 'text',
    timestamp TEXT NOT NULL,
    is_mentioned INTEGER DEFAULT 0,
    raw_data TEXT,
    synced_at TEXT NOT NULL,
    FOREIGN KEY (source_id) REFERENCES im_sources(id) ON DELETE CASCADE
  );

  -- 每日分析报告表
  CREATE TABLE IF NOT EXISTS analysis_reports (
    id TEXT PRIMARY KEY,
    report_date TEXT NOT NULL,
    summary TEXT NOT NULL,
    work_priorities TEXT,
    completed_tasks TEXT,
    pending_tasks TEXT,
    key_decisions TEXT,
    follow_ups TEXT,
    meeting_notes TEXT,
    statistics TEXT,
    raw_chat_count INTEGER DEFAULT 0,
    important_chat_count INTEGER DEFAULT 0,
    created_at TEXT NOT NULL,
    UNIQUE(report_date)
  );

  -- 定时任务配置表
  CREATE TABLE IF NOT EXISTS scheduled_tasks (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    type TEXT DEFAULT 'project_sync',
    config TEXT,
    cron_expression TEXT NOT NULL,
    enabled INTEGER DEFAULT 1,
    last_run_at TEXT,
    next_run_at TEXT,
    last_status TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );

  -- 索引
  CREATE INDEX IF NOT EXISTS idx_chat_records_source ON im_chat_records(source_id);
  CREATE INDEX IF NOT EXISTS idx_chat_records_timestamp ON im_chat_records(timestamp);
  CREATE INDEX IF NOT EXISTS idx_chat_records_sender ON im_chat_records(sender_name);
  CREATE INDEX IF NOT EXISTS idx_analysis_reports_date ON analysis_reports(report_date);

  -- 每日更新流水线日志表
  CREATE TABLE IF NOT EXISTS daily_update_logs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    date TEXT NOT NULL,
    status TEXT DEFAULT 'success',
    report TEXT,
    created_at TEXT NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_daily_update_logs_date ON daily_update_logs(date);

  -- 数据源关联的会话ID表（支持一个数据源对应多个会话）
  CREATE TABLE IF NOT EXISTS im_source_conversations (
    id TEXT PRIMARY KEY,
    source_id TEXT NOT NULL,
    conv_id TEXT NOT NULL,
    name TEXT,
    created_at TEXT NOT NULL,
    FOREIGN KEY (source_id) REFERENCES im_sources(id) ON DELETE CASCADE,
    UNIQUE(source_id, conv_id)
  );

  -- ========== 项目立项表 ==========
  CREATE TABLE IF NOT EXISTS project_initiations (
    id TEXT PRIMARY KEY,
    type TEXT NOT NULL,
    status TEXT DEFAULT 'draft',
    title TEXT,
    applicant TEXT,
    project_leader TEXT,
    department TEXT,
    project_type TEXT,
    demand_source TEXT,
    demand_date TEXT,
    from_pool INTEGER DEFAULT 0,
    raw_requirement TEXT,
    ai_generated_content TEXT,
    deadline TEXT,
    start_date TEXT,
    completed_at TEXT,
    team_size_required INTEGER DEFAULT 1,
    team_size_current INTEGER DEFAULT 0,
    current_phase TEXT DEFAULT 'draft',
    phase_status TEXT DEFAULT '{"initiation":0,"requirement":0,"planning":0,"execution":0,"delivery":0}',
    risk_level TEXT DEFAULT 'low',
    risk_reason TEXT,
    risk_alert_at TEXT,
    parent_project_id TEXT,
    external_project_id TEXT,
    vp TEXT,
    knowledge_base_path TEXT,
    created_at TEXT DEFAULT (datetime('now','localtime')),
    updated_at TEXT DEFAULT (datetime('now','localtime'))
  );
  -- 索引放在迁移代码中创建，避免列不存在时出错

  -- ========== 项目成员表 ==========
  CREATE TABLE IF NOT EXISTS project_members (
    id TEXT PRIMARY KEY,
    project_id TEXT NOT NULL,
    employee_id TEXT NOT NULL,
    role TEXT NOT NULL DEFAULT 'member' CHECK (role IN ('owner', 'leader', 'member', 'reviewer')),
    joined_at TEXT NOT NULL,
    status TEXT DEFAULT 'active' CHECK (status IN ('active', 'left', 'removed')),
    work_hours_contributed REAL DEFAULT 0,
    FOREIGN KEY (project_id) REFERENCES project_initiations(id) ON DELETE CASCADE,
    FOREIGN KEY (employee_id) REFERENCES employees(id) ON DELETE CASCADE,
    UNIQUE(project_id, employee_id)
  );
  CREATE INDEX IF NOT EXISTS idx_project_members_project ON project_members(project_id);
  CREATE INDEX IF NOT EXISTS idx_project_members_employee ON project_members(employee_id);

  -- ========== 项目阶段流转日志 ==========
  CREATE TABLE IF NOT EXISTS project_phase_logs (
    id TEXT PRIMARY KEY,
    project_id TEXT NOT NULL,
    from_phase TEXT NOT NULL,
    to_phase TEXT NOT NULL,
    triggered_by TEXT,
    reason TEXT,
    created_at TEXT NOT NULL,
    FOREIGN KEY (project_id) REFERENCES project_initiations(id) ON DELETE CASCADE
  );
  CREATE INDEX IF NOT EXISTS idx_phase_logs_project ON project_phase_logs(project_id);
  CREATE INDEX IF NOT EXISTS idx_phase_logs_created ON project_phase_logs(created_at);

  -- ========== 项目干系人表 ==========
  CREATE TABLE IF NOT EXISTS project_stakeholders (
    id TEXT PRIMARY KEY,
    project_id TEXT NOT NULL,
    person_name TEXT NOT NULL,
    person_category TEXT,
    role_in_project TEXT,
    notes TEXT,
    created_at TEXT DEFAULT (datetime('now','localtime')),
    FOREIGN KEY (project_id) REFERENCES project_initiations(id) ON DELETE CASCADE,
    UNIQUE(project_id, person_name)
  );
  CREATE INDEX IF NOT EXISTS idx_project_stakeholders_project ON project_stakeholders(project_id);

  -- ========== 需求分析表 ==========
  CREATE TABLE IF NOT EXISTS requirement_analyses (
    id TEXT PRIMARY KEY,
    initiation_id TEXT,
    title TEXT,
    input_type TEXT NOT NULL DEFAULT 'text' CHECK (input_type IN ('text', 'figma', 'mixed')),
    raw_input TEXT,
    ai_analysis TEXT,
    status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'analyzed', 'tasked', 'in_progress', 'done')),
    created_at TEXT DEFAULT (datetime('now','localtime')),
    updated_at TEXT DEFAULT (datetime('now','localtime'))
  );
  CREATE INDEX IF NOT EXISTS idx_requirement_analyses_status ON requirement_analyses(status);
  CREATE INDEX IF NOT EXISTS idx_requirement_analyses_initiation ON requirement_analyses(initiation_id);

  -- ========== 开发任务表 ==========
  CREATE TABLE IF NOT EXISTS dev_tasks (
    id TEXT PRIMARY KEY,
    requirement_id TEXT NOT NULL,
    title TEXT NOT NULL,
    description TEXT,
    category TEXT DEFAULT 'other' CHECK (category IN ('frontend', 'backend', 'design', 'interaction', 'rendering', 'test', 'other')),
    priority TEXT DEFAULT 'medium' CHECK (priority IN ('high', 'medium', 'low')),
    status TEXT NOT NULL DEFAULT 'todo' CHECK (status IN ('todo', 'in_progress', 'testing', 'done')),
    assignee TEXT,
    estimated_hours REAL,
    start_date TEXT,
    due_date TEXT,
    sprint_week INTEGER,
    sort_order INTEGER DEFAULT 0,
    created_at TEXT DEFAULT (datetime('now','localtime')),
    updated_at TEXT DEFAULT (datetime('now','localtime')),
    FOREIGN KEY (requirement_id) REFERENCES requirement_analyses(id) ON DELETE CASCADE
  );
  CREATE INDEX IF NOT EXISTS idx_dev_tasks_requirement ON dev_tasks(requirement_id);
  CREATE INDEX IF NOT EXISTS idx_dev_tasks_status ON dev_tasks(status);

  -- ========== 员工表 ==========
  CREATE TABLE IF NOT EXISTS employees (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    rank TEXT,
    skills TEXT,
    access_method TEXT DEFAULT 'local',
    status TEXT NOT NULL DEFAULT 'available' CHECK (status IN ('available', 'busy', 'off', 'leave')),
    power_level INTEGER DEFAULT 50,
    avatar_url TEXT,
    notes TEXT,
    created_at TEXT DEFAULT (datetime('now','localtime')),
    updated_at TEXT DEFAULT (datetime('now','localtime'))
  );
  CREATE INDEX IF NOT EXISTS idx_employees_status ON employees(status);
  CREATE INDEX IF NOT EXISTS idx_employees_rank ON employees(rank);

  -- ========== 工作周期表 ==========
  CREATE TABLE IF NOT EXISTS work_cycles (
    id TEXT PRIMARY KEY,
    employee_id TEXT NOT NULL,
    task_id TEXT,
    task_title TEXT,
    start_time TEXT NOT NULL,
    end_time TEXT,
    estimated_hours REAL,
    progress INTEGER DEFAULT 0,
    status TEXT DEFAULT 'active' CHECK (status IN ('queued', 'active', 'completed', 'cancelled')),
    created_at TEXT DEFAULT (datetime('now','localtime')),
    updated_at TEXT DEFAULT (datetime('now','localtime')),
    FOREIGN KEY (employee_id) REFERENCES employees(id)
  );
  CREATE INDEX IF NOT EXISTS idx_work_cycles_employee ON work_cycles(employee_id);
  CREATE INDEX IF NOT EXISTS idx_work_cycles_status ON work_cycles(status);

  -- ========== 版本表 ==========
  CREATE TABLE IF NOT EXISTS versions (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'pending_confirm' CHECK (status IN ('pending_confirm', 'confirmed', 'in_progress', 'testing', 'ready_release', 'released', 'delayed')),
    risk_level TEXT DEFAULT 'medium' CHECK (risk_level IN ('low', 'medium', 'high')),
    participants TEXT DEFAULT '[]',
    expected_release_date TEXT,
    description TEXT,
    task_ids TEXT DEFAULT '[]',
    created_at TEXT DEFAULT (datetime('now','localtime')),
    updated_at TEXT DEFAULT (datetime('now','localtime'))
  );
  CREATE INDEX IF NOT EXISTS idx_versions_status ON versions(status);

  -- ========== Agent 任务执行记录表 ==========
  CREATE TABLE IF NOT EXISTS agent_tasks (
    id TEXT PRIMARY KEY,
    session_id TEXT,
    parent_message_id TEXT,
    description TEXT NOT NULL,
    status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'running', 'completed', 'failed', 'cancelled')),
    agent_type TEXT DEFAULT 'exec' CHECK (agent_type IN ('main', 'exec')),
    tool_calls TEXT,
    result TEXT,
    error TEXT,
    iterations INTEGER DEFAULT 0,
    created_at TEXT DEFAULT (datetime('now','localtime')),
    completed_at TEXT,
    FOREIGN KEY (session_id) REFERENCES sessions(id)
  );
  CREATE INDEX IF NOT EXISTS idx_agent_tasks_session ON agent_tasks(session_id);
  CREATE INDEX IF NOT EXISTS idx_agent_tasks_status ON agent_tasks(status);

  -- ========== 每日工作安排表 ==========
  CREATE TABLE IF NOT EXISTS daily_plans (
    date TEXT PRIMARY KEY,
    goal_text TEXT DEFAULT '',
    created_at TEXT DEFAULT (datetime('now','localtime')),
    updated_at TEXT DEFAULT (datetime('now','localtime'))
  );

  CREATE TABLE IF NOT EXISTS daily_plan_tasks (
    id TEXT PRIMARY KEY,
    plan_date TEXT NOT NULL,
    title TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'in_progress', 'blocked', 'completed', 'abandoned')),
    priority TEXT DEFAULT 'medium' CHECK (priority IN ('high', 'medium', 'low')),
    assignee TEXT,
    estimate_minutes INTEGER,
    notes TEXT,
    completed_at TEXT,
    expected_completion_at TEXT,
    source_date TEXT,
    sort_order INTEGER DEFAULT 0,
    created_at TEXT DEFAULT (datetime('now','localtime')),
    updated_at TEXT DEFAULT (datetime('now','localtime')),
    FOREIGN KEY (plan_date) REFERENCES daily_plans(date) ON DELETE CASCADE
  );
  CREATE INDEX IF NOT EXISTS idx_daily_plan_tasks_date ON daily_plan_tasks(plan_date);
  CREATE INDEX IF NOT EXISTS idx_daily_plan_tasks_status ON daily_plan_tasks(status);

  -- ========== 会议深度分析结果表 ==========
  CREATE TABLE IF NOT EXISTS meeting_intelligence (
    id TEXT PRIMARY KEY,
    meeting_id TEXT NOT NULL,
    title TEXT,
    start_time TEXT,
    result TEXT NOT NULL,
    created_at TEXT DEFAULT (datetime('now','localtime')),
    updated_at TEXT DEFAULT (datetime('now','localtime'))
  );
  CREATE INDEX IF NOT EXISTS idx_meeting_intelligence_mid ON meeting_intelligence(meeting_id);

  -- ========== 工作流输出推送表 ==========
  CREATE TABLE IF NOT EXISTS workflow_outputs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    source TEXT NOT NULL,
    type TEXT DEFAULT 'text' CHECK (type IN ('text', 'json', 'markdown', 'html')),
    title TEXT,
    content TEXT NOT NULL,
    metadata TEXT DEFAULT '{}',
    created_at TEXT DEFAULT (datetime('now','localtime'))
  );
  CREATE INDEX IF NOT EXISTS idx_workflow_outputs_source ON workflow_outputs(source);
  CREATE INDEX IF NOT EXISTS idx_workflow_outputs_created ON workflow_outputs(created_at DESC);

  -- ========== 项目信息聚合表（按 proid 覆盖） ==========
  CREATE TABLE IF NOT EXISTS project_info_files (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    proid TEXT NOT NULL UNIQUE,
    title TEXT,
    content TEXT NOT NULL,
    raw_content TEXT,
    ask TEXT,
    workflow_run_id TEXT,
    metadata TEXT DEFAULT '{}',
    created_at TEXT DEFAULT (datetime('now','localtime')),
    updated_at TEXT DEFAULT (datetime('now','localtime'))
  );
  CREATE INDEX IF NOT EXISTS idx_project_info_files_proid ON project_info_files(proid);
  CREATE INDEX IF NOT EXISTS idx_project_info_files_updated ON project_info_files(updated_at DESC);
`);
// ============= 数据库迁移 =============
// 添加消息去重唯一约束（im_message_id + source_id）
try {
    db.exec(`CREATE UNIQUE INDEX IF NOT EXISTS idx_chat_records_msg_unique ON im_chat_records(im_message_id, source_id) WHERE im_message_id IS NOT NULL`);
    console.log('[DB] 已创建消息去重唯一索引');
}
catch (e) {
    if (e.message?.includes('UNIQUE constraint failed')) {
        // 如果存在重复数据导致索引创建失败，先清理重复数据
        console.log('[DB] 检测到重复消息数据，正在清理...');
        db.exec(`
      DELETE FROM im_chat_records WHERE rowid NOT IN (
        SELECT MIN(rowid) FROM im_chat_records 
        WHERE im_message_id IS NOT NULL 
        GROUP BY im_message_id, source_id
      )
    `);
        try {
            db.exec(`CREATE UNIQUE INDEX IF NOT EXISTS idx_chat_records_msg_unique ON im_chat_records(im_message_id, source_id) WHERE im_message_id IS NOT NULL`);
            console.log('[DB] 重复数据已清理，唯一索引创建成功');
        }
        catch (e2) {
            console.error('[DB] 唯一索引创建仍然失败:', e2);
        }
    }
    else {
        console.error('[DB] 创建唯一索引出错:', e);
    }
}
// 迁移：work_cycles 表添加 queued 状态支持
// SQLite 不支持 ALTER CHECK，需要重建表
try {
    const tableInfo = db.prepare("SELECT sql FROM sqlite_master WHERE type='table' AND name='work_cycles'").get();
    if (tableInfo && tableInfo.sql && !tableInfo.sql.includes("'queued'")) {
        console.log('[DB] 检测到 work_cycles 表缺少 queued 状态，正在迁移...');
        db.exec(`
      -- 1. 重命名旧表
      ALTER TABLE work_cycles RENAME TO work_cycles_old;
      -- 2. 创建带 queued 的新表
      CREATE TABLE work_cycles (
        id TEXT PRIMARY KEY,
        employee_id TEXT NOT NULL,
        task_id TEXT,
        task_title TEXT,
        start_time TEXT NOT NULL,
        end_time TEXT,
        estimated_hours REAL,
        progress INTEGER DEFAULT 0,
        status TEXT DEFAULT 'active' CHECK (status IN ('queued', 'active', 'completed', 'cancelled')),
        created_at TEXT DEFAULT (datetime('now','localtime')),
        updated_at TEXT DEFAULT (datetime('now','localtime')),
        FOREIGN KEY (employee_id) REFERENCES employees(id)
      );
      -- 3. 迁移数据
      INSERT INTO work_cycles SELECT * FROM work_cycles_old;
      -- 4. 删除旧表
      DROP TABLE work_cycles_old;
      -- 5. 重建索引
      CREATE INDEX IF NOT EXISTS idx_work_cycles_employee ON work_cycles(employee_id);
      CREATE INDEX IF NOT EXISTS idx_work_cycles_status ON work_cycles(status);
    `);
        console.log('[DB] work_cycles 表迁移完成，已支持 queued 状态');
    }
}
catch (e) {
    console.error('[DB] work_cycles 迁移出错:', e.message);
}
// 迁移：employees 表添加 Agent 字段
try {
    const empTableInfo = db.prepare("SELECT sql FROM sqlite_master WHERE type='table' AND name='employees'").get();
    if (empTableInfo && empTableInfo.sql && !empTableInfo.sql.includes("agent_type")) {
        console.log('[DB] 检测到 employees 表缺少 Agent 字段，正在迁移...');
        db.exec(`
      ALTER TABLE employees ADD COLUMN agent_type TEXT;
      ALTER TABLE employees ADD COLUMN agent_prompt TEXT;
      ALTER TABLE employees ADD COLUMN agent_tools TEXT DEFAULT '[]';
      ALTER TABLE employees ADD COLUMN agent_config TEXT DEFAULT '{}';
      CREATE INDEX IF NOT EXISTS idx_employees_agent_type ON employees(agent_type);
    `);
        console.log('[DB] employees 表迁移完成，已支持 Agent 模式');
    }
}
catch (e) {
    // SQLite 的 ADD COLUMN 是幂等的，如果列已存在会报错，忽略即可
    if (!e.message?.includes('duplicate column name')) {
        console.error('[DB] employees Agent 迁移出错:', e.message);
    }
}
// 迁移：将旧角色模板 ID 映射为新 Agent 类型（main/exec）
try {
    const oldRoles = ['project_delivery', 'code_dev', 'qa'];
    const hasOldRoles = db.prepare(`SELECT COUNT(*) as cnt FROM employees WHERE agent_type IN ('project_delivery','code_dev','qa')`).get();
    if (hasOldRoles.cnt > 0) {
        console.log(`[DB] 检测到 ${hasOldRoles.cnt} 个员工使用旧角色模板，正在迁移为新 Agent 类型...`);
        db.exec(`
      UPDATE employees SET agent_type = 'main' WHERE agent_type = 'project_delivery';
      UPDATE employees SET agent_type = 'exec' WHERE agent_type IN ('code_dev', 'qa');
    `);
        console.log('[DB] 旧角色模板迁移完成：project_delivery → main，code_dev/qa → exec');
    }
    void oldRoles;
}
catch (e) {
    console.error('[DB] 旧角色迁移出错:', e.message);
}
// 迁移：project_initiations 表添加 Phase 0 字段
try {
    const piColumns = db.prepare("PRAGMA table_info(project_initiations)").all();
    const piColNames = piColumns.map(c => c.name);
    const piAdd = [];
    if (!piColNames.includes('deadline'))
        piAdd.push({ col: 'deadline', def: 'TEXT' });
    if (!piColNames.includes('start_date'))
        piAdd.push({ col: 'start_date', def: 'TEXT' });
    if (!piColNames.includes('completed_at'))
        piAdd.push({ col: 'completed_at', def: 'TEXT' });
    if (!piColNames.includes('team_size_required'))
        piAdd.push({ col: 'team_size_required', def: 'INTEGER DEFAULT 1' });
    if (!piColNames.includes('team_size_current'))
        piAdd.push({ col: 'team_size_current', def: 'INTEGER DEFAULT 0' });
    if (!piColNames.includes('current_phase'))
        piAdd.push({ col: 'current_phase', def: "TEXT DEFAULT 'draft'" });
    if (!piColNames.includes('phase_status'))
        piAdd.push({ col: 'phase_status', def: "TEXT DEFAULT '{\"initiation\":0,\"requirement\":0,\"planning\":0,\"execution\":0,\"delivery\":0}'" });
    if (!piColNames.includes('risk_level'))
        piAdd.push({ col: 'risk_level', def: "TEXT DEFAULT 'low'" });
    if (!piColNames.includes('risk_reason'))
        piAdd.push({ col: 'risk_reason', def: 'TEXT' });
    if (!piColNames.includes('risk_alert_at'))
        piAdd.push({ col: 'risk_alert_at', def: 'TEXT' });
    if (!piColNames.includes('parent_project_id'))
        piAdd.push({ col: 'parent_project_id', def: 'TEXT' });
    if (!piColNames.includes('external_project_id'))
        piAdd.push({ col: 'external_project_id', def: 'TEXT' });
    if (!piColNames.includes('vp'))
        piAdd.push({ col: 'vp', def: 'TEXT' });
    if (!piColNames.includes('knowledge_base_path'))
        piAdd.push({ col: 'knowledge_base_path', def: 'TEXT' });
    if (!piColNames.includes('last_synced_at'))
        piAdd.push({ col: 'last_synced_at', def: 'TEXT' });
    // 迁移：scheduled_tasks 表增加 type 和 config 字段
    try {
        const stColumns = db.prepare("PRAGMA table_info(scheduled_tasks)").all();
        const stColNames = stColumns.map(c => c.name);
        const stAdd = [];
        if (!stColNames.includes('type'))
            stAdd.push({ col: 'type', def: "TEXT DEFAULT 'project_sync'" });
        if (!stColNames.includes('config'))
            stAdd.push({ col: 'config', def: 'TEXT' });
        for (const { col, def } of stAdd) {
            db.exec(`ALTER TABLE scheduled_tasks ADD COLUMN ${col} ${def}`);
        }
        if (stAdd.length > 0) {
            console.log(`[DB] scheduled_tasks 表已添加字段: ${stAdd.map(x => x.col).join(', ')}`);
        }
    }
    catch (e) {
        if (!e.message?.includes('duplicate column name')) {
            console.error('[DB] scheduled_tasks 迁移出错:', e.message);
        }
    }
    for (const { col, def } of piAdd) {
        db.exec(`ALTER TABLE project_initiations ADD COLUMN ${col} ${def}`);
    }
    if (piAdd.length > 0) {
        console.log(`[DB] project_initiations 表已添加字段: ${piAdd.map(x => x.col).join(', ')}`);
    }
    // 创建索引
    if (piColNames.includes('current_phase') || piAdd.some(x => x.col === 'current_phase')) {
        try {
            db.exec('CREATE INDEX IF NOT EXISTS idx_project_initiations_phase ON project_initiations(current_phase)');
        }
        catch { }
    }
    if (piColNames.includes('risk_level') || piAdd.some(x => x.col === 'risk_level')) {
        try {
            db.exec('CREATE INDEX IF NOT EXISTS idx_project_initiations_risk ON project_initiations(risk_level)');
        }
        catch { }
    }
    if (piColNames.includes('parent_project_id') || piAdd.some(x => x.col === 'parent_project_id')) {
        try {
            db.exec('CREATE INDEX IF NOT EXISTS idx_project_initiations_parent ON project_initiations(parent_project_id)');
        }
        catch { }
    }
    if (piColNames.includes('external_project_id') || piAdd.some(x => x.col === 'external_project_id')) {
        try {
            db.exec('CREATE INDEX IF NOT EXISTS idx_project_initiations_ext_id ON project_initiations(external_project_id)');
        }
        catch { }
    }
}
catch (e) {
    if (!e.message?.includes('duplicate column name')) {
        console.error('[DB] project_initiations Phase 0 迁移出错:', e.message);
    }
}
// 迁移：dev_tasks 表增加 sprint 日期字段（Phase 1）
try {
    const dtColumns = db.prepare("PRAGMA table_info(dev_tasks)").all();
    const dtColNames = dtColumns.map(c => c.name);
    const dtAdd = [];
    if (!dtColNames.includes('start_date'))
        dtAdd.push({ col: 'start_date', def: 'TEXT' });
    if (!dtColNames.includes('due_date'))
        dtAdd.push({ col: 'due_date', def: 'TEXT' });
    if (!dtColNames.includes('sprint_week'))
        dtAdd.push({ col: 'sprint_week', def: 'INTEGER' });
    for (const { col, def } of dtAdd) {
        db.exec(`ALTER TABLE dev_tasks ADD COLUMN ${col} ${def}`);
    }
    if (dtAdd.length > 0) {
        console.log(`[DB] dev_tasks 表已添加 Phase 1 字段: ${dtAdd.map(x => x.col).join(', ')}`);
    }
}
catch (e) {
    if (!e.message?.includes('duplicate column name')) {
        console.error('[DB] dev_tasks Phase 1 迁移出错:', e.message);
    }
}
// 迁移：versions 表增加版本目标和预警字段
try {
    const versionColumns = db.prepare("PRAGMA table_info(versions)").all();
    const colNames = versionColumns.map(c => c.name);
    const toAdd = [];
    if (!colNames.includes('goals'))
        toAdd.push({ col: 'goals', def: "TEXT DEFAULT '[]'" });
    if (!colNames.includes('computed_risk'))
        toAdd.push({ col: 'computed_risk', def: "TEXT DEFAULT 'unknown'" });
    if (!colNames.includes('risk_reasons'))
        toAdd.push({ col: 'risk_reasons', def: "TEXT DEFAULT '[]'" });
    if (!colNames.includes('last_check_at'))
        toAdd.push({ col: 'last_check_at', def: 'TEXT' });
    for (const { col, def } of toAdd) {
        db.exec(`ALTER TABLE versions ADD COLUMN ${col} ${def}`);
    }
    if (toAdd.length > 0) {
        console.log(`[DB] versions 表已添加字段: ${toAdd.map(x => x.col).join(', ')}`);
    }
}
catch (e) {
    if (!e.message?.includes('duplicate column name')) {
        console.error('[DB] versions 字段迁移出错:', e.message);
    }
}
// 迁移：requirement_analyses 表增加 version_id 和 from_goal_id 字段
try {
    const reqColumns = db.prepare("PRAGMA table_info(requirement_analyses)").all();
    const colNames = reqColumns.map(c => c.name);
    const toAdd = [];
    if (!colNames.includes('version_id'))
        toAdd.push({ col: 'version_id', def: 'TEXT' });
    if (!colNames.includes('from_goal_id'))
        toAdd.push({ col: 'from_goal_id', def: 'TEXT' });
    for (const { col, def } of toAdd) {
        db.exec(`ALTER TABLE requirement_analyses ADD COLUMN ${col} ${def}`);
    }
    if (toAdd.length > 0) {
        db.exec(`CREATE INDEX IF NOT EXISTS idx_requirements_version ON requirement_analyses(version_id)`);
        console.log(`[DB] requirement_analyses 表已添加字段: ${toAdd.map(x => x.col).join(', ')}`);
    }
}
catch (e) {
    if (!e.message?.includes('duplicate column name')) {
        console.error('[DB] requirement_analyses 字段迁移出错:', e.message);
    }
}
// 迁移：requirement_analyses 和 versions 表增加 project_id 字段（所属项目）
try {
    const reqCols = db.prepare("PRAGMA table_info(requirement_analyses)").all();
    const verCols = db.prepare("PRAGMA table_info(versions)").all();
    const reqColNames = reqCols.map(c => c.name);
    const verColNames = verCols.map(c => c.name);
    if (!reqColNames.includes('project_id')) {
        db.exec(`ALTER TABLE requirement_analyses ADD COLUMN project_id TEXT`);
        db.exec(`CREATE INDEX IF NOT EXISTS idx_requirements_project ON requirement_analyses(project_id)`);
        console.log('[DB] requirement_analyses 表已添加 project_id 字段');
    }
    if (!verColNames.includes('project_id')) {
        db.exec(`ALTER TABLE versions ADD COLUMN project_id TEXT`);
        db.exec(`CREATE INDEX IF NOT EXISTS idx_versions_project ON versions(project_id)`);
        console.log('[DB] versions 表已添加 project_id 字段');
    }
}
catch (e) {
    if (!e.message?.includes('duplicate column name')) {
        console.error('[DB] project_id 字段迁移出错:', e.message);
    }
}
// ============= 会话操作 =============
// 获取所有会话
export function getAllSessions() {
    const stmt = db.prepare('SELECT * FROM sessions ORDER BY updated_at DESC');
    return stmt.all();
}
// 获取单个会话
export function getSession(id) {
    const stmt = db.prepare('SELECT * FROM sessions WHERE id = ?');
    return stmt.get(id);
}
// 创建会话
export function createSession(session) {
    const stmt = db.prepare(`
    INSERT INTO sessions (id, title, model, sdk_session_id, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?)
  `);
    stmt.run(session.id, session.title, session.model, session.sdk_session_id, session.created_at, session.updated_at);
    return session;
}
// 更新会话
export function updateSession(id, updates) {
    const fields = [];
    const values = [];
    if (updates.title !== undefined) {
        fields.push('title = ?');
        values.push(updates.title);
    }
    if (updates.model !== undefined) {
        fields.push('model = ?');
        values.push(updates.model);
    }
    if (updates.sdk_session_id !== undefined) {
        fields.push('sdk_session_id = ?');
        values.push(updates.sdk_session_id);
    }
    if (fields.length === 0)
        return false;
    fields.push('updated_at = ?');
    values.push(new Date().toISOString());
    values.push(id);
    const stmt = db.prepare(`UPDATE sessions SET ${fields.join(', ')} WHERE id = ?`);
    const result = stmt.run(...values);
    return result.changes > 0;
}
// 删除会话（同时删除关联的消息和 agent_tasks）
export function deleteSession(id) {
    const del = db.transaction(() => {
        // 先删关联数据（agent_tasks 没有 ON DELETE CASCADE，必须显式删）
        db.prepare('DELETE FROM agent_tasks WHERE session_id = ?').run(id);
        db.prepare('DELETE FROM messages WHERE session_id = ?').run(id);
        // 再删会话本身
        const result = db.prepare('DELETE FROM sessions WHERE id = ?').run(id);
        return result.changes > 0;
    });
    return del();
}
// ============= 消息操作 =============
// 获取会话的所有消息
export function getMessagesBySession(sessionId) {
    const stmt = db.prepare('SELECT * FROM messages WHERE session_id = ? ORDER BY created_at ASC');
    return stmt.all(sessionId);
}
// 创建消息
export function createMessage(message) {
    const stmt = db.prepare(`
    INSERT INTO messages (id, session_id, role, content, model, created_at, tool_calls)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `);
    stmt.run(message.id, message.session_id, message.role, message.content, message.model, message.created_at, message.tool_calls);
    // 更新会话的 updated_at
    const updateStmt = db.prepare('UPDATE sessions SET updated_at = ? WHERE id = ?');
    updateStmt.run(new Date().toISOString(), message.session_id);
    return message;
}
// 更新消息内容
export function updateMessage(id, updates) {
    const fields = [];
    const values = [];
    if (updates.content !== undefined) {
        fields.push('content = ?');
        values.push(updates.content);
    }
    if (updates.tool_calls !== undefined) {
        fields.push('tool_calls = ?');
        values.push(updates.tool_calls);
    }
    if (fields.length === 0)
        return false;
    values.push(id);
    const stmt = db.prepare(`UPDATE messages SET ${fields.join(', ')} WHERE id = ?`);
    const result = stmt.run(...values);
    return result.changes > 0;
}
// 删除消息
export function deleteMessage(id) {
    const stmt = db.prepare('DELETE FROM messages WHERE id = ?');
    const result = stmt.run(id);
    return result.changes > 0;
}
// 批量创建消息（用于保存对话）
export function createMessages(messages) {
    const stmt = db.prepare(`
    INSERT INTO messages (id, session_id, role, content, model, created_at, tool_calls)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `);
    const insertMany = db.transaction((msgs) => {
        for (const msg of msgs) {
            stmt.run(msg.id, msg.session_id, msg.role, msg.content, msg.model, msg.created_at, msg.tool_calls);
        }
    });
    insertMany(messages);
}
// 清空所有数据
export function clearAllData() {
    db.exec('DELETE FROM messages');
    db.exec('DELETE FROM sessions');
}
// ============= IM 数据源操作 =============
export function getAllImSources() {
    const stmt = db.prepare('SELECT * FROM im_sources ORDER BY created_at DESC');
    return stmt.all();
}
export function getImSource(id) {
    const stmt = db.prepare('SELECT * FROM im_sources WHERE id = ?');
    return stmt.get(id);
}
export function createImSource(source) {
    const stmt = db.prepare(`
    INSERT INTO im_sources (id, name, type, config, enabled, last_sync_at, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `);
    stmt.run(source.id, source.name, source.type, source.config, source.enabled, source.last_sync_at, source.created_at, source.updated_at);
    return source;
}
export function updateImSource(id, updates) {
    const fields = [];
    const values = [];
    for (const [key, value] of Object.entries(updates)) {
        fields.push(`${key} = ?`);
        values.push(value);
    }
    if (fields.length === 0)
        return false;
    fields.push('updated_at = ?');
    values.push(new Date().toISOString());
    values.push(id);
    const stmt = db.prepare(`UPDATE im_sources SET ${fields.join(', ')} WHERE id = ?`);
    const result = stmt.run(...values);
    return result.changes > 0;
}
export function deleteImSource(id) {
    const stmt = db.prepare('DELETE FROM im_sources WHERE id = ?');
    const result = stmt.run(id);
    return result.changes > 0;
}
export function getConversationsBySource(sourceId) {
    const stmt = db.prepare('SELECT * FROM im_source_conversations WHERE source_id = ? ORDER BY created_at');
    return stmt.all(sourceId);
}
export function addConversationToSource(sourceId, convId, name) {
    try {
        const now = new Date().toISOString();
        const id = uuidv4();
        const stmt = db.prepare(`
      INSERT INTO im_source_conversations (id, source_id, conv_id, name, created_at)
      VALUES (?, ?, ?, ?, ?)
    `);
        stmt.run(id, sourceId, convId, name || null, now);
        return { id, source_id: sourceId, conv_id: convId, name: name || null, created_at: now };
    }
    catch (e) {
        return null;
    }
}
export function removeConversationFromSource(sourceId, convId) {
    const stmt = db.prepare('DELETE FROM im_source_conversations WHERE source_id = ? AND conv_id = ?');
    const result = stmt.run(sourceId, convId);
    return result.changes > 0;
}
function uuidv4() {
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function (c) {
        var r = Math.random() * 16 | 0, v = c == 'x' ? r : (r & 0x3 | 0x8);
        return v.toString(16);
    });
}
// ============= IM 聊天记录操作 =============
export function getChatRecords(options) {
    const conditions = [];
    const values = [];
    if (options?.sourceId) {
        conditions.push('source_id = ?');
        values.push(options.sourceId);
    }
    if (options?.startDate) {
        // 支持 YYYY-MM-DD 或 YYYY-MM-DDTHH:mm:ss 格式
        const start = options.startDate.length === 10 ? options.startDate + 'T00:00:00' : options.startDate;
        conditions.push('timestamp >= ?');
        values.push(start);
    }
    if (options?.endDate) {
        // 支持 YYYY-MM-DD 或 YYYY-MM-DDTHH:mm:ss 格式
        const end = options.endDate.length === 10 ? options.endDate + 'T23:59:59' : options.endDate;
        conditions.push('timestamp <= ?');
        values.push(end);
    }
    if (options?.senderName) {
        conditions.push('sender_name LIKE ?');
        values.push(`%${options.senderName}%`);
    }
    if (options?.groupName) {
        conditions.push('group_name LIKE ?');
        values.push(`%${options.groupName}%`);
    }
    if (options?.isMentioned !== undefined) {
        conditions.push('is_mentioned = ?');
        values.push(options.isMentioned ? 1 : 0);
    }
    if (options?.keyword) {
        conditions.push('content LIKE ?');
        values.push(`%${options.keyword}%`);
    }
    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
    const countStmt = db.prepare(`SELECT COUNT(*) as total FROM im_chat_records ${whereClause}`);
    const { total } = countStmt.get(...values);
    const limit = options?.limit || 50;
    const offset = options?.offset || 0;
    const stmt = db.prepare(`SELECT * FROM im_chat_records ${whereClause} ORDER BY timestamp DESC LIMIT ? OFFSET ?`);
    const records = stmt.all(...values, limit, offset);
    return { records, total };
}
export function getSavedU9Conversations() {
    const stmt = db.prepare(`
    SELECT group_id AS id, MAX(group_name) AS name
    FROM im_chat_records
    WHERE group_id IS NOT NULL AND TRIM(group_id) <> ''
    GROUP BY group_id
    ORDER BY MAX(timestamp) DESC
  `);
    return stmt.all();
}
export function getChatRecordsByDateRange(startDate, endDate) {
    // 支持 ISO 8601 格式的时间戳（如 2026-04-10T00:04:33.000+0800）
    // 如果 startDate 只是日期（YYYY-MM-DD），使用 LIKE 查询
    if (startDate.length === 10 && !startDate.includes('T')) {
        const stmt = db.prepare('SELECT * FROM im_chat_records WHERE timestamp LIKE ? ORDER BY timestamp ASC');
        return stmt.all(`${startDate}%`);
    }
    // 否则使用范围查询
    const stmt = db.prepare('SELECT * FROM im_chat_records WHERE timestamp >= ? AND timestamp <= ? ORDER BY timestamp ASC');
    return stmt.all(startDate, endDate);
}
export function importChatRecords(records) {
    // INSERT OR IGNORE: 如果 im_message_id + source_id 已存在则跳过，不会重复插入
    const stmt = db.prepare(`
    INSERT OR IGNORE INTO im_chat_records (id, source_id, im_message_id, sender_name, sender_id, group_name, group_id, content, message_type, timestamp, is_mentioned, raw_data, synced_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
    const insertMany = db.transaction((recs) => {
        let inserted = 0;
        let skipped = 0;
        for (const rec of recs) {
            const result = stmt.run(rec.id, rec.source_id, rec.im_message_id, rec.sender_name, rec.sender_id, rec.group_name, rec.group_id, rec.content, rec.message_type, rec.timestamp, rec.is_mentioned, rec.raw_data, rec.synced_at);
            if (result.changes > 0) {
                inserted++;
            }
            else {
                skipped++;
            }
        }
        return { inserted, skipped };
    });
    return insertMany(records);
}
export function deleteChatRecordsBySource(sourceId) {
    const stmt = db.prepare('DELETE FROM im_chat_records WHERE source_id = ?');
    const result = stmt.run(sourceId);
    return result.changes;
}
// ============= 分析报告操作 =============
export function getAnalysisReports(options) {
    const conditions = [];
    const values = [];
    if (options?.startDate) {
        conditions.push('report_date >= ?');
        values.push(options.startDate);
    }
    if (options?.endDate) {
        conditions.push('report_date <= ?');
        values.push(options.endDate);
    }
    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
    const limit = options?.limit || 30;
    const stmt = db.prepare(`SELECT * FROM analysis_reports ${whereClause} ORDER BY report_date DESC LIMIT ?`);
    return stmt.all(...values, limit);
}
export function getAnalysisReportByDate(date) {
    const stmt = db.prepare('SELECT * FROM analysis_reports WHERE report_date = ?');
    return stmt.get(date);
}
export function createAnalysisReport(report) {
    const stmt = db.prepare(`
    INSERT OR REPLACE INTO analysis_reports (id, report_date, summary, work_priorities, completed_tasks, pending_tasks, key_decisions, follow_ups, meeting_notes, statistics, raw_chat_count, important_chat_count, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
    stmt.run(report.id, report.report_date, report.summary, report.work_priorities, report.completed_tasks, report.pending_tasks, report.key_decisions, report.follow_ups, report.meeting_notes, report.statistics, report.raw_chat_count, report.important_chat_count, report.created_at);
    return report;
}
export function deleteAnalysisReport(id) {
    const stmt = db.prepare('DELETE FROM analysis_reports WHERE id = ?');
    const result = stmt.run(id);
    return result.changes > 0;
}
// ============= 定时任务操作 =============
export function getAllScheduledTasks() {
    const stmt = db.prepare('SELECT * FROM scheduled_tasks ORDER BY created_at DESC');
    return stmt.all();
}
export function getScheduledTask(id) {
    const stmt = db.prepare('SELECT * FROM scheduled_tasks WHERE id = ?');
    return stmt.get(id);
}
export function createScheduledTask(task) {
    const stmt = db.prepare(`
    INSERT INTO scheduled_tasks (id, name, type, config, cron_expression, enabled, last_run_at, next_run_at, last_status, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
    stmt.run(task.id, task.name, task.type || 'project_sync', task.config, task.cron_expression, task.enabled, task.last_run_at, task.next_run_at, task.last_status, task.created_at, task.updated_at);
    return task;
}
export function updateScheduledTask(id, updates) {
    const fields = [];
    const values = [];
    for (const [key, value] of Object.entries(updates)) {
        fields.push(`${key} = ?`);
        values.push(value);
    }
    if (fields.length === 0)
        return false;
    fields.push('updated_at = ?');
    values.push(new Date().toISOString());
    values.push(id);
    const stmt = db.prepare(`UPDATE scheduled_tasks SET ${fields.join(', ')} WHERE id = ?`);
    const result = stmt.run(...values);
    return result.changes > 0;
}
export function deleteScheduledTask(id) {
    const stmt = db.prepare('DELETE FROM scheduled_tasks WHERE id = ?');
    const result = stmt.run(id);
    return result.changes > 0;
}
// ============= 统计查询 =============
function normalizeDateTimeRange(startDate, endDate) {
    // 兼容 YYYY-MM-DD（补全为本地日区间），以及已含时间的字符串（原样返回）
    const start = startDate
        ? (startDate.length === 10 ? `${startDate}T00:00:00` : startDate)
        : undefined;
    const end = endDate
        ? (endDate.length === 10 ? `${endDate}T23:59:59` : endDate)
        : undefined;
    return { start, end };
}
export function getChatStats(startDate, endDate) {
    const { start, end } = normalizeDateTimeRange(startDate, endDate);
    const conditions = [];
    const values = [];
    if (start) {
        conditions.push('timestamp >= ?');
        values.push(start);
    }
    if (end) {
        conditions.push('timestamp <= ?');
        values.push(end);
    }
    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
    const stmt = db.prepare(`
    SELECT
      COUNT(*) as total_messages,
      COUNT(DISTINCT sender_name) as unique_senders,
      COUNT(DISTINCT CASE WHEN group_name IS NOT NULL THEN group_name END) as unique_groups,
      SUM(CASE WHEN is_mentioned = 1 THEN 1 ELSE 0 END) as mentioned_count
    FROM im_chat_records
    ${whereClause}
  `);
    return stmt.get(...values);
}
export function getTopSenders(startDate, endDate, limit = 10) {
    const { start, end } = normalizeDateTimeRange(startDate, endDate);
    const conditions = [];
    const values = [];
    if (start) {
        conditions.push('timestamp >= ?');
        values.push(start);
    }
    if (end) {
        conditions.push('timestamp <= ?');
        values.push(end);
    }
    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
    const stmt = db.prepare(`
    SELECT sender_name, COUNT(*) as message_count
    FROM im_chat_records
    ${whereClause}
    GROUP BY sender_name
    ORDER BY message_count DESC
    LIMIT ?
  `);
    return stmt.all(...values, limit);
}
export function getTopGroups(startDate, endDate, limit = 10) {
    const { start, end } = normalizeDateTimeRange(startDate, endDate);
    const conditions = ['group_name IS NOT NULL'];
    const values = [];
    if (start) {
        conditions.push('timestamp >= ?');
        values.push(start);
    }
    if (end) {
        conditions.push('timestamp <= ?');
        values.push(end);
    }
    const whereClause = `WHERE ${conditions.join(' AND ')}`;
    const stmt = db.prepare(`
    SELECT group_name, COUNT(*) as message_count
    FROM im_chat_records
    ${whereClause}
    GROUP BY group_name
    ORDER BY message_count DESC
    LIMIT ?
  `);
    return stmt.all(...values, limit);
}
// 修复消息中的 @提及 标记
export function fixMentioned(myName) {
    const allRecords = db.prepare(`SELECT id, content, is_mentioned FROM im_chat_records`).all();
    let fixed = 0;
    const updateStmt = db.prepare(`UPDATE im_chat_records SET is_mentioned = ? WHERE id = ?`);
    const runFix = db.transaction(() => {
        for (const r of allRecords) {
            const shouldMention = r.content && (r.content.includes(`@${myName}`) || r.content.includes(`@ ${myName}`));
            const newVal = shouldMention ? 1 : 0;
            if (r.is_mentioned !== newVal) {
                updateStmt.run(newVal, r.id);
                fixed++;
            }
        }
    });
    runFix();
    return { total: allRecords.length, fixed };
}
// ============= 会议深度分析持久化 =============
export function saveMeetingIntelligence(meetingId, title, startTime, result) {
    const id = `mi_${meetingId}_${Date.now()}`;
    const now = new Date().toLocaleString('sv-SE', { timeZone: 'Asia/Shanghai' }).replace(' ', 'T');
    // 删除该会议旧的分析结果（只保留最新一次）
    db.prepare(`DELETE FROM meeting_intelligence WHERE meeting_id = ?`).run(meetingId);
    db.prepare(`INSERT INTO meeting_intelligence (id, meeting_id, title, start_time, result, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)`)
        .run(id, meetingId, title || null, startTime || null, JSON.stringify(result), now, now);
    return { id };
}
export function getMeetingIntelligence(meetingId) {
    return db.prepare(`SELECT * FROM meeting_intelligence WHERE meeting_id = ? ORDER BY created_at DESC LIMIT 1`).get(meetingId);
}
export function deleteMeetingIntelligence(meetingId) {
    const r = db.prepare(`DELETE FROM meeting_intelligence WHERE meeting_id = ?`).run(meetingId);
    return r.changes > 0;
}
// 获取某日的计划（含任务列表）
export function getDailyPlan(date) {
    const plan = db.prepare('SELECT * FROM daily_plans WHERE date = ?').get(date);
    const tasks = db.prepare('SELECT * FROM daily_plan_tasks WHERE plan_date = ? ORDER BY sort_order ASC, created_at ASC').all(date);
    return { plan: plan || null, tasks };
}
// 获取多日的计划（用于历史未完成任务收集）
export function getDailyPlans(options) {
    const conditions = [];
    const values = [];
    if (options?.startDate) {
        conditions.push('date >= ?');
        values.push(options.startDate);
    }
    if (options?.endDate) {
        conditions.push('date <= ?');
        values.push(options.endDate);
    }
    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
    const limit = options?.limit || 30;
    const plans = db.prepare(`SELECT * FROM daily_plans ${whereClause} ORDER BY date DESC LIMIT ?`).all(...values, limit);
    return plans.map(plan => ({
        plan,
        tasks: db.prepare('SELECT * FROM daily_plan_tasks WHERE plan_date = ? ORDER BY sort_order ASC, created_at ASC').all(plan.date),
    }));
}
// 保存/更新整日计划（upsert：有则更新，无则创建）
export function upsertDailyPlan(date, goalText, tasks) {
    const now = new Date().toLocaleString('sv-SE', { timeZone: 'Asia/Shanghai' }).replace(' ', 'T');
    // Upsert 计划主记录
    db.prepare(`
    INSERT INTO daily_plans (date, goal_text, created_at, updated_at)
    VALUES (?, ?, ?, ?)
    ON CONFLICT(date) DO UPDATE SET goal_text = excluded.goal_text, updated_at = excluded.updated_at
  `).run(date, goalText, now, now);
    // 删除旧任务，重新插入（简单可靠）
    db.prepare('DELETE FROM daily_plan_tasks WHERE plan_date = ?').run(date);
    const insertStmt = db.prepare(`
    INSERT INTO daily_plan_tasks (id, plan_date, title, status, priority, assignee, estimate_minutes, notes, completed_at, expected_completion_at, source_date, sort_order, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
    for (let i = 0; i < tasks.length; i++) {
        const t = tasks[i];
        insertStmt.run(t.id, date, t.title, t.status, t.priority, t.assignee || null, t.estimate_minutes || null, t.notes || null, t.completed_at || null, t.expected_completion_at || null, t.source_date || null, i, now, now);
    }
    return getDailyPlan(date);
}
// 更新单个任务
export function updateDailyPlanTask(taskId, updates) {
    const fields = [];
    const values = [];
    for (const [key, value] of Object.entries(updates)) {
        fields.push(`${key} = ?`);
        values.push(value);
    }
    if (fields.length === 0)
        return false;
    fields.push('updated_at = ?');
    values.push(new Date().toLocaleString('sv-SE', { timeZone: 'Asia/Shanghai' }).replace(' ', 'T'));
    values.push(taskId);
    const result = db.prepare(`UPDATE daily_plan_tasks SET ${fields.join(', ')} WHERE id = ?`).run(...values);
    return result.changes > 0;
}
// 删除单个任务
export function deleteDailyPlanTask(taskId) {
    const result = db.prepare('DELETE FROM daily_plan_tasks WHERE id = ?').run(taskId);
    return result.changes > 0;
}
// 获取历史未完成任务（跨日期，排除已完成/废弃的）
export function getUnfinishedDailyTasks(excludeDate, limitDays = 30) {
    const unfinished = [];
    for (let i = 1; i <= limitDays; i++) {
        const d = new Date();
        d.setDate(d.getDate() - i);
        const dateKey = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
        if (dateKey === excludeDate)
            continue;
        const tasks = db.prepare("SELECT * FROM daily_plan_tasks WHERE plan_date = ? AND status NOT IN ('completed', 'abandoned') ORDER BY created_at ASC").all(dateKey);
        unfinished.push(...tasks);
    }
    return unfinished;
}
// 获取项目列表（支持筛选）
export function getProjects(options) {
    const conditions = [];
    const values = [];
    if (options?.mine) {
        // 子查询：我参与的项目ID
        conditions.push(`id IN (SELECT project_id FROM project_members WHERE employee_id = ? AND status = 'active')`);
        values.push(options.mine);
    }
    if (options?.phase) {
        conditions.push('current_phase = ?');
        values.push(options.phase);
    }
    if (options?.risk) {
        conditions.push('risk_level = ?');
        values.push(options.risk);
    }
    if (options?.search) {
        conditions.push('(title LIKE ? OR raw_requirement LIKE ?)');
        values.push(`%${options.search}%`, `%${options.search}%`);
    }
    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
    const limit = options?.limit || 20;
    const offset = options?.offset || 0;
    const countStmt = db.prepare(`SELECT COUNT(*) as total FROM project_initiations ${whereClause}`);
    const { total } = countStmt.get(...values);
    const stmt = db.prepare(`
    SELECT * FROM project_initiations ${whereClause}
    ORDER BY 
      CASE risk_level WHEN 'high' THEN 0 WHEN 'medium' THEN 1 ELSE 2 END,
      updated_at DESC
    LIMIT ? OFFSET ?
  `);
    const projects = stmt.all(...values, limit, offset);
    return { projects, total };
}
// 获取单个项目详情
export function getProjectById(id) {
    return db.prepare('SELECT * FROM project_initiations WHERE id = ?').get(id);
}
// 根据 external_project_id（proid）获取项目列表
export function getProjectsByExternalId(externalProjectId) {
    return db.prepare('SELECT * FROM project_initiations WHERE external_project_id = ?').all(externalProjectId);
}
// 更新项目阶段
export function updateProjectPhase(projectId, newPhase, triggeredBy, reason) {
    const now = new Date().toLocaleString('sv-SE', { timeZone: 'Asia/Shanghai' }).replace(' ', 'T');
    // 获取当前阶段
    const current = db.prepare('SELECT current_phase FROM project_initiations WHERE id = ?').get(projectId);
    if (!current)
        return false;
    // 更新项目阶段
    const updateStmt = db.prepare('UPDATE project_initiations SET current_phase = ?, updated_at = ? WHERE id = ?');
    const updateResult = updateStmt.run(newPhase, now, projectId);
    if (updateResult.changes === 0)
        return false;
    // 记录阶段流转日志
    const logId = uuidv4();
    db.prepare(`
    INSERT INTO project_phase_logs (id, project_id, from_phase, to_phase, triggered_by, reason, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(logId, projectId, current.current_phase, newPhase, triggeredBy || null, reason || null, now);
    return true;
}
// 更新项目阶段进度
export function updateProjectPhaseStatus(projectId, phaseStatus) {
    const current = db.prepare('SELECT phase_status FROM project_initiations WHERE id = ?').get(projectId);
    if (!current)
        return false;
    const currentStatus = JSON.parse(current.phase_status || '{}');
    const newStatus = { ...currentStatus, ...phaseStatus };
    const now = new Date().toLocaleString('sv-SE', { timeZone: 'Asia/Shanghai' }).replace(' ', 'T');
    const result = db.prepare('UPDATE project_initiations SET phase_status = ?, updated_at = ? WHERE id = ?')
        .run(JSON.stringify(newStatus), now, projectId);
    return result.changes > 0;
}
// 更新项目基本信息
export function updateProject(projectId, updates) {
    const fields = [];
    const values = [];
    for (const [key, value] of Object.entries(updates)) {
        if (value !== undefined) {
            fields.push(`${key} = ?`);
            values.push(value);
        }
    }
    if (fields.length === 0)
        return false;
    const now = new Date().toLocaleString('sv-SE', { timeZone: 'Asia/Shanghai' }).replace(' ', 'T');
    fields.push('updated_at = ?');
    values.push(now);
    values.push(projectId);
    const result = db.prepare(`UPDATE project_initiations SET ${fields.join(', ')} WHERE id = ?`).run(...values);
    return result.changes > 0;
}
// 获取项目成员
export function getProjectMembers(projectId) {
    return db.prepare(`
    SELECT pm.*, e.name as employee_name, e.avatar_url as employee_avatar
    FROM project_members pm
    LEFT JOIN employees e ON pm.employee_id = e.id
    WHERE pm.project_id = ? AND pm.status = 'active'
    ORDER BY pm.joined_at ASC
  `).all(projectId);
}
// 添加项目成员
export function addProjectMember(projectId, employeeId, role = 'member') {
    try {
        const id = uuidv4();
        const now = new Date().toLocaleString('sv-SE', { timeZone: 'Asia/Shanghai' }).replace(' ', 'T');
        db.prepare(`
      INSERT INTO project_members (id, project_id, employee_id, role, joined_at, status, work_hours_contributed)
      VALUES (?, ?, ?, ?, ?, 'active', 0)
    `).run(id, projectId, employeeId, role, now);
        // 更新项目当前团队人数
        db.prepare(`
      UPDATE project_initiations 
      SET team_size_current = (SELECT COUNT(*) FROM project_members WHERE project_id = ? AND status = 'active'),
          updated_at = ?
      WHERE id = ?
    `).run(projectId, now, projectId);
        return { id, project_id: projectId, employee_id: employeeId, role: role, joined_at: now, status: 'active', work_hours_contributed: 0 };
    }
    catch {
        return null;
    }
}
// 获取项目统计
export function getProjectStats(projectId) {
    // 从需求关联的任务统计（同时支持 initiation_id 和 project_id 关联）
    const taskStats = db.prepare(`
    SELECT 
      COUNT(*) as total,
      SUM(CASE WHEN status = 'done' THEN 1 ELSE 0 END) as done,
      SUM(CASE WHEN status = 'in_progress' THEN 1 ELSE 0 END) as in_progress
    FROM dev_tasks
    WHERE requirement_id IN (
      SELECT id FROM requirement_analyses 
      WHERE initiation_id = ? OR project_id = ?
    )
  `).get(projectId, projectId);
    const project = db.prepare('SELECT deadline, team_size_current FROM project_initiations WHERE id = ?').get(projectId);
    const total = taskStats.total || 0;
    const done = taskStats.done || 0;
    const progressPercent = total > 0 ? Math.round((done / total) * 100) : 0;
    let daysRemaining = null;
    let isDelayed = false;
    if (project?.deadline) {
        const deadlineDate = new Date(project.deadline);
        const today = new Date();
        daysRemaining = Math.ceil((deadlineDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
        isDelayed = daysRemaining < 0 && done < total;
    }
    return {
        task_total: total,
        task_done: done,
        task_in_progress: taskStats.in_progress || 0,
        progress_percent: progressPercent,
        days_remaining: daysRemaining,
        is_delayed: isDelayed,
        members_count: project?.team_size_current || 0,
    };
}
// 自动同步项目状态（根据 dev_tasks 反推 phase_status 和 current_phase）
export function syncProjectStatus(projectId) {
    try {
        const project = db.prepare('SELECT current_phase, phase_status, status FROM project_initiations WHERE id = ?').get(projectId);
        if (!project)
            return null;
        if (project.status === 'archived' || project.status === 'rejected') {
            return { updated: false, newPhase: project.current_phase, newPhaseStatus: JSON.parse(project.phase_status || '{}'), reason: '项目已归档或已驳回，跳过同步' };
        }
        // 统计项目下的 dev_tasks（同时支持 initiation_id 和 project_id 关联）
        const taskStats = db.prepare(`
      SELECT 
        COUNT(*) as total,
        SUM(CASE WHEN status = 'done' THEN 1 ELSE 0 END) as done,
        SUM(CASE WHEN status = 'in_progress' THEN 1 ELSE 0 END) as in_progress,
        SUM(CASE WHEN status = 'testing' THEN 1 ELSE 0 END) as testing,
        SUM(CASE WHEN status = 'pending' THEN 1 ELSE 0 END) as pending
      FROM dev_tasks
      WHERE requirement_id IN (
        SELECT id FROM requirement_analyses 
        WHERE initiation_id = ? OR project_id = ?
      )
    `).get(projectId, projectId);
        const total = taskStats.total || 0;
        const done = taskStats.done || 0;
        const inProgress = taskStats.in_progress || 0;
        const testing = taskStats.testing || 0;
        // 计算需求分析数量（同时支持 initiation_id 和 project_id）
        const reqCount = db.prepare(`SELECT COUNT(*) as c FROM requirement_analyses WHERE initiation_id = ? OR project_id = ?`).get(projectId, projectId);
        const hasRequirements = (reqCount.c || 0) > 0;
        // 计算各阶段进度
        const executionProgress = total > 0 ? done / total : 0;
        const newPhaseStatus = {
            initiation: 1, // 项目已存在即立项完成
            requirement: hasRequirements ? 1 : 0,
            planning: total > 0 ? 1 : (hasRequirements ? 0.5 : 0),
            execution: total > 0 ? Math.round(executionProgress * 100) / 100 : 0,
            delivery: total > 0 && done === total ? 1 : 0,
        };
        // 推断 current_phase
        let newPhase = project.current_phase;
        if (newPhaseStatus.delivery >= 1) {
            newPhase = 'reviewing';
        }
        else if (newPhaseStatus.execution > 0) {
            newPhase = 'executing';
        }
        else if (newPhaseStatus.planning >= 1) {
            newPhase = 'plan_locked';
        }
        else if (newPhaseStatus.requirement >= 1) {
            newPhase = 'planning';
        }
        else if (newPhaseStatus.initiation >= 1) {
            newPhase = 'approved';
        }
        // 检测风险：已延期但未完成
        const deadlineRow = db.prepare('SELECT deadline FROM project_initiations WHERE id = ?').get(projectId);
        let riskLevel;
        let riskReason;
        if (deadlineRow?.deadline) {
            const deadline = new Date(deadlineRow.deadline);
            const today = new Date();
            if (deadline < today && done < total) {
                riskLevel = 'high';
                riskReason = `截止日期已过，仍有 ${total - done} 个任务未完成`;
            }
            else if (deadline < new Date(today.getTime() + 3 * 24 * 60 * 60 * 1000) && done < total && executionProgress < 0.8) {
                riskLevel = 'medium';
                riskReason = `临近截止（3天内），任务完成度仅 ${Math.round(executionProgress * 100)}%`;
            }
        }
        // 大量任务 pending 也标记风险
        if (!riskLevel && total > 0 && (taskStats.pending || 0) > total * 0.7 && inProgress === 0) {
            riskLevel = 'medium';
            riskReason = `项目启动后进展缓慢，${taskStats.pending} 个任务尚未开始`;
        }
        const now = new Date().toLocaleString('sv-SE', { timeZone: 'Asia/Shanghai' }).replace(' ', 'T');
        const updates = ['phase_status = ?', 'current_phase = ?', 'updated_at = ?', 'last_synced_at = ?'];
        const values = [JSON.stringify(newPhaseStatus), newPhase, now, now];
        if (riskLevel) {
            updates.push('risk_level = ?');
            updates.push('risk_reason = ?');
            values.push(riskLevel, riskReason);
        }
        values.push(projectId);
        db.prepare(`UPDATE project_initiations SET ${updates.join(', ')} WHERE id = ?`).run(...values);
        // 如果 phase 发生变化，记录日志
        if (newPhase !== project.current_phase) {
            db.prepare(`
        INSERT INTO project_phase_logs (id, project_id, from_phase, to_phase, triggered_by, reason, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `).run(`log-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`, projectId, project.current_phase, newPhase, 'system_sync', `自动同步：基于 ${done}/${total} 任务完成，execution=${Math.round(executionProgress * 100)}%`, now);
        }
        const reason = total > 0
            ? `任务统计：${done} 完成 / ${inProgress} 进行中 / ${testing} 测试中 / ${total} 总计 → execution=${Math.round(executionProgress * 100)}%`
            : '暂无开发任务';
        return { updated: true, newPhase, newPhaseStatus, reason };
    }
    catch (e) {
        console.error('[syncProjectStatus] 失败:', e?.message);
        return null;
    }
}
// 批量同步所有活跃项目
export function syncAllProjectStatuses() {
    const projects = db.prepare(`
    SELECT id FROM project_initiations 
    WHERE status NOT IN ('archived', 'rejected') 
    ORDER BY updated_at DESC
  `).all();
    const results = [];
    for (const p of projects) {
        const r = syncProjectStatus(p.id);
        if (r)
            results.push({ projectId: p.id, result: r });
    }
    return results;
}
/* ─── 调用 LLM 从项目信息报告中提取结构化字段 ─── */
async function callLLMExtractProjectFields(report) {
    const cfg = getLLMConfig();
    if (!cfg.apiKey) {
        console.warn('[syncProjectInfoFromWorkflow] 未配置 LLM API Key');
        return null;
    }
    const systemPrompt = `你是一位项目信息提取助手。我会给你一份项目信息分析报告（Markdown），请从中提取关键字段并输出 JSON。

可提取字段：
- title: 项目名称/标题
- project_leader: 项目负责人/项目经理（人名）
- current_phase: 项目当前阶段，必须是以下之一：draft, submitted, approved, planning, plan_locked, recruiting, executing, delivering, reviewing, accepted, rejected, archived。如果报告提到"预立项"用 approved，"执行中"用 executing，"交付中"用 delivering，"验收中"用 reviewing，"已完成"用 accepted
- phase_status: 各阶段进度，JSON 对象 {initiation, requirement, planning, execution, delivery}，值为 0-1 之间的小数。报告未明确时按当前阶段推断
- deadline: 截止日期，格式 YYYY-MM-DD，不确定则设为 null
- team_size_required: 需要团队人数，整数，未明确则设为 null
- team_size_current: 当前团队人数，整数，未明确则设为 null
- risk_level: 风险等级 low/medium/high，无风险则 low
- risk_reason: 风险原因，无风险则省略
- summary: 项目摘要，100字以内

注意：
1. 只输出 JSON，不要输出 JSON 以外的任何内容
2. 不要编造信息，报告中没有明确提到的字段可以省略或设为 null
3. current_phase 必须从枚举值中选择`;
    const callLLM = async (baseUrl, apiKey) => {
        const resp = await fetch(`${baseUrl}/chat/completions`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${apiKey}`,
            },
            body: JSON.stringify({
                model: cfg.model,
                messages: [
                    { role: 'system', content: systemPrompt },
                    { role: 'user', content: `项目信息报告：\n\n${report}` },
                ],
                temperature: 0.2,
            }),
        });
        const json = await resp.json().catch(() => ({}));
        if (!resp.ok)
            throw new Error(json?.error?.message || json?.message || `LLM 失败 ${resp.status}`);
        return json;
    };
    try {
        let json;
        try {
            json = await callLLM(cfg.baseUrl, cfg.apiKey);
        }
        catch (e) {
            if (cfg.baseUrl !== cfg.fallbackBaseUrl && cfg.fallbackApiKey) {
                console.log('[syncProjectInfoFromWorkflow] 回退到 Moonshot 官方 API...');
                json = await callLLM(cfg.fallbackBaseUrl, cfg.fallbackApiKey);
            }
            else {
                throw e;
            }
        }
        const content = json.choices?.[0]?.message?.content;
        if (!content || typeof content !== 'string')
            return null;
        // 尝试从内容中提取 JSON
        const jsonMatch = content.match(/\{[\s\S]*\}/);
        if (!jsonMatch)
            return null;
        const parsed = JSON.parse(jsonMatch[0]);
        return parsed;
    }
    catch (e) {
        console.warn('[syncProjectInfoFromWorkflow] LLM 提取失败:', e?.message);
        return null;
    }
}
/* ─── 从工作流项目信息同步到项目立项 ─── */
export async function syncProjectInfoFromWorkflow(projectId) {
    try {
        const project = db.prepare('SELECT * FROM project_initiations WHERE id = ?').get(projectId);
        if (!project) {
            return { success: false, updated: false, message: '项目不存在' };
        }
        const proid = project.external_project_id;
        if (!proid) {
            return { success: false, updated: false, message: '项目未设置 proid（external_project_id），无法同步工作流信息' };
        }
        const infoFile = db.prepare('SELECT * FROM project_info_files WHERE proid = ? ORDER BY updated_at DESC LIMIT 1').get(proid);
        if (!infoFile) {
            return { success: false, updated: false, message: `未找到 proid=${proid} 的工作流项目信息，请先在「工作流输出」页面触发查询`, proid };
        }
        // 使用 LLM 提取结构化字段
        const extracted = await callLLMExtractProjectFields(infoFile.content);
        console.log('[syncProjectInfoFromWorkflow] LLM 提取结果:', JSON.stringify(extracted));
        if (!extracted) {
            return { success: false, updated: false, message: 'LLM 字段提取失败，无法同步', proid };
        }
        const allowedPhases = ['draft', 'submitted', 'approved', 'planning', 'plan_locked', 'recruiting', 'executing', 'delivering', 'reviewing', 'accepted', 'rejected', 'archived'];
        const updates = {};
        if (extracted?.title)
            updates.title = extracted.title;
        if (extracted?.project_leader)
            updates.project_leader = extracted.project_leader;
        if (extracted?.deadline !== undefined)
            updates.deadline = extracted.deadline;
        if (extracted?.team_size_required !== undefined && extracted.team_size_required !== null)
            updates.team_size_required = extracted.team_size_required;
        if (extracted?.team_size_current !== undefined && extracted.team_size_current !== null)
            updates.team_size_current = extracted.team_size_current;
        // current_phase 校验
        if (extracted?.current_phase && allowedPhases.includes(extracted.current_phase)) {
            updates.current_phase = extracted.current_phase;
        }
        // phase_status 合并
        if (extracted?.phase_status && typeof extracted.phase_status === 'object') {
            const current = JSON.parse(project.phase_status || '{}');
            const merged = { ...current, ...extracted.phase_status };
            // 确保五个阶段都有值；项目已存在，initiation 至少为 1
            for (const key of ['initiation', 'requirement', 'planning', 'execution', 'delivery']) {
                const v = merged[key];
                merged[key] = (v === undefined || v === null) ? (current[key] || 0) : v;
            }
            if ((merged.initiation || 0) < 1)
                merged.initiation = 1;
            updates.phase_status = JSON.stringify(merged);
        }
        // risk_level 校验
        if (extracted?.risk_level && ['low', 'medium', 'high'].includes(extracted.risk_level)) {
            updates.risk_level = extracted.risk_level;
            updates.risk_reason = extracted.risk_reason || null;
        }
        // summary 写入 ai_generated_content
        if (extracted?.summary) {
            updates.ai_generated_content = extracted.summary;
        }
        const fields = Object.keys(updates);
        if (fields.length === 0) {
            return { success: true, updated: false, message: '工作流信息中没有可同步的新字段', proid };
        }
        // 更新 last_synced_at
        updates.last_synced_at = new Date().toLocaleString('sv-SE', { timeZone: 'Asia/Shanghai' }).replace(' ', 'T');
        const ok = updateProject(projectId, updates);
        if (!ok) {
            return { success: false, updated: false, message: '更新项目失败', proid };
        }
        // 如果 phase 变化，记录日志
        if (updates.current_phase && updates.current_phase !== project.current_phase) {
            const logId = uuidv4();
            const now = new Date().toLocaleString('sv-SE', { timeZone: 'Asia/Shanghai' }).replace(' ', 'T');
            db.prepare(`
        INSERT INTO project_phase_logs (id, project_id, from_phase, to_phase, triggered_by, reason, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `).run(logId, projectId, project.current_phase, updates.current_phase, 'workflow_info_sync', `从工作流项目信息同步：proid=${proid}`, now);
        }
        return { success: true, updated: true, message: `已同步 ${fields.length} 个字段`, fields, proid };
    }
    catch (e) {
        console.error('[syncProjectInfoFromWorkflow] 失败:', e?.message);
        return { success: false, updated: false, message: e?.message || '同步失败' };
    }
}
/* ─── 将工作流项目信息同步到知识库 ───
 * 会覆盖：project-report-*.md、summary.json 中各模块数据
 * 会删除：旧的 project-data-*.md（飞书同步的旧数据），以工作流输出为准
 */
export function syncKnowledgeBaseForProjectInfo(proid, content, structuredData = {}, todoList) {
    const updatedFiles = [];
    try {
        const projects = getProjectsByExternalId(proid);
        if (projects.length === 0) {
            return { success: true, message: `未找到 proid=${proid} 关联的项目，跳过知识库同步`, updatedFiles };
        }
        const now = new Date();
        const today = now.toISOString().slice(0, 10);
        const syncedAt = now.toISOString();
        for (const project of projects) {
            if (!project.knowledge_base_path)
                continue;
            let kbPath = project.knowledge_base_path;
            // Windows 路径转换：/c/Users/... -> C:/Users/...
            if (kbPath.startsWith('/c/') || kbPath.startsWith('/C/')) {
                kbPath = 'C:/' + kbPath.substring(3);
            }
            const kbDir = path.dirname(kbPath);
            if (!fs.existsSync(kbDir)) {
                console.warn(`[syncKnowledgeBase] 知识库目录不存在: ${kbDir}`);
                continue;
            }
            // 删除旧的 project-data-*.md（飞书同步数据），以工作流输出为准
            try {
                const entries = fs.readdirSync(kbDir);
                for (const entry of entries) {
                    if (/^project-data-\d{4}-\d{2}-\d{2}\.md$/.test(entry)) {
                        fs.unlinkSync(path.join(kbDir, entry));
                        console.log(`[syncKnowledgeBase] 删除旧飞书数据: ${entry}`);
                    }
                }
            }
            catch (e) {
                console.warn('[syncKnowledgeBase] 清理旧飞书数据失败:', e?.message);
            }
            // 1. 写入工作流分析报告
            const reportFileName = `project-report-${today}.md`;
            const reportFilePath = path.join(kbDir, reportFileName);
            let reportContent = `# 项目信息同步报告 (proid: ${proid})\n\n> 同步时间: ${now.toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai' })}\n> 来源: AIHub 工作流 project-info-analysis\n> 关联项目: ${project.title || project.id}\n\n${content}`;
            if (todoList && todoList.trim()) {
                reportContent += `\n\n---\n\n## 执行中待办（原始）\n\n${todoList.trim()}`;
            }
            fs.writeFileSync(reportFilePath, reportContent, 'utf-8');
            updatedFiles.push(reportFilePath);
            // 2. 更新 summary.json 各模块
            const summaryPath = path.join(kbDir, 'summary.json');
            if (fs.existsSync(summaryPath)) {
                try {
                    const summaryRaw = fs.readFileSync(summaryPath, 'utf-8');
                    const summary = JSON.parse(summaryRaw);
                    const sd = structuredData || {};
                    // 解包 AIHub 常见包装结构：{ obj: {...} } / { items: [...] }
                    const unwrap = (v) => {
                        if (v && typeof v === 'object' && !Array.isArray(v)) {
                            if (v.obj !== undefined)
                                return v.obj;
                            if (v.items !== undefined)
                                return v.items;
                        }
                        return v;
                    };
                    // project_profile：以工作流输出为准，只保留前端需要的字段
                    const rawProfile = unwrap(sd.project_profile);
                    const cleanProfile = {};
                    const keepFields = [
                        'name', 'code', 'project_id', 'status_name', 'lifecycle_phase_name',
                        'plan_finish_date', 'manage_vp', 'manage_vp_uid', 'importance',
                        'summary', 'original_intention',
                    ];
                    if (rawProfile && typeof rawProfile === 'object') {
                        for (const k of keepFields) {
                            if (rawProfile[k] !== undefined)
                                cleanProfile[k] = rawProfile[k];
                        }
                    }
                    else {
                        if (sd.projectName || sd.name)
                            cleanProfile.name = sd.projectName || sd.name;
                        if (sd.proid || sd.project_id)
                            cleanProfile.project_id = sd.proid || sd.project_id;
                        if (sd.statusName || sd.status_name)
                            cleanProfile.status_name = sd.statusName || sd.status_name;
                        if (sd.lifecyclePhaseName || sd.lifecycle_phase_name)
                            cleanProfile.lifecycle_phase_name = sd.lifecyclePhaseName || sd.lifecycle_phase_name;
                        if (sd.planFinishDate || sd.plan_finish_date)
                            cleanProfile.plan_finish_date = sd.planFinishDate || sd.plan_finish_date;
                        if (sd.manageVp || sd.manage_vp)
                            cleanProfile.manage_vp = sd.manageVp || sd.manage_vp;
                        if (sd.manageVpUid || sd.manage_vp_uid)
                            cleanProfile.manage_vp_uid = sd.manageVpUid || sd.manage_vp_uid;
                        if (sd.importance !== undefined)
                            cleanProfile.importance = sd.importance;
                    }
                    // 摘要优先使用 LLM 报告正文前 800 字
                    const brief = content.replace(/^#.*\n/, '').trim().slice(0, 800).trim();
                    cleanProfile.summary = brief + (content.length > 800 ? '…' : '');
                    cleanProfile._workflow_synced_at = syncedAt;
                    summary.project_profile = cleanProfile;
                    // 其他模块：以工作流输出为准；工作流中存在则覆盖/解包，不存在则清空旧值
                    const modules = [
                        'core_values',
                        'goal_users',
                        'stage_objectives',
                        'weekly_versions',
                        'monthly_plan',
                        'budget',
                        'year_cost_budget',
                    ];
                    for (const m of modules) {
                        if (sd[m] !== undefined) {
                            summary[m] = unwrap(sd[m]);
                        }
                        // 工作流未返回的模块保留旧数据，避免同步后清空已有内容
                    }
                    // 保留执行中待办文本
                    if (sd.todo_list_text && typeof sd.todo_list_text === 'string') {
                        summary.todo_list = sd.todo_list_text;
                    }
                    else if (!sd.todo_list_text && summary.todo_list !== undefined) {
                        delete summary.todo_list;
                    }
                    // 预算字段兼容：工作流返回 year_cost_budget 时，同时映射到 budget 字符串供前端展示
                    if (summary.year_cost_budget !== undefined && summary.budget === undefined) {
                        const ycb = summary.year_cost_budget;
                        if (typeof ycb === 'string') {
                            summary.budget = ycb;
                        }
                        else if (ycb && typeof ycb === 'object') {
                            const budgetText = ycb.budget_cost_situation || ycb.budget || ycb.summary || JSON.stringify(ycb, null, 2);
                            summary.budget = budgetText;
                        }
                    }
                    fs.writeFileSync(summaryPath, JSON.stringify(summary, null, 2), 'utf-8');
                    updatedFiles.push(summaryPath);
                }
                catch (e) {
                    console.warn('[syncKnowledgeBase] 更新 summary.json 失败:', e?.message);
                }
            }
        }
        return { success: true, message: `已同步到 ${updatedFiles.length} 个知识库文件`, updatedFiles };
    }
    catch (e) {
        console.error('[syncKnowledgeBase] 失败:', e?.message);
        return { success: false, message: e?.message || '知识库同步失败', updatedFiles };
    }
}
// 获取阶段流转日志
export function getProjectPhaseLogs(projectId) {
    return db.prepare(`
    SELECT * FROM project_phase_logs 
    WHERE project_id = ? 
    ORDER BY created_at DESC
  `).all(projectId);
}
export function getProjectStakeholders(projectId) {
    return db.prepare(`
    SELECT * FROM project_stakeholders 
    WHERE project_id = ? 
    ORDER BY created_at ASC
  `).all(projectId);
}
export function addProjectStakeholder(projectId, personName, personCategory, roleInProject, notes) {
    try {
        const id = 'PS-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 6);
        const now = new Date().toLocaleString('sv-SE', { timeZone: 'Asia/Shanghai' }).replace(' ', 'T');
        db.prepare(`
      INSERT INTO project_stakeholders (id, project_id, person_name, person_category, role_in_project, notes, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(id, projectId, personName, personCategory || null, roleInProject || null, notes || null, now);
        return { id, project_id: projectId, person_name: personName, person_category: personCategory || null, role_in_project: roleInProject || null, notes: notes || null, created_at: now };
    }
    catch {
        return null;
    }
}
export function removeProjectStakeholder(projectId, personName) {
    try {
        const result = db.prepare(`
      DELETE FROM project_stakeholders WHERE project_id = ? AND person_name = ?
    `).run(projectId, personName);
        return result.changes > 0;
    }
    catch {
        return false;
    }
}
export function pushWorkflowOutput(source, content, type = 'text', title, metadata) {
    try {
        const metaStr = metadata ? JSON.stringify(metadata) : '{}';
        const result = db.prepare(`
      INSERT INTO workflow_outputs (source, type, title, content, metadata, created_at)
      VALUES (?, ?, ?, ?, ?, datetime('now','localtime'))
    `).run(source, type, title || null, content, metaStr);
        const row = db.prepare('SELECT * FROM workflow_outputs WHERE id = ?').get(result.lastInsertRowid);
        return row;
    }
    catch (e) {
        console.error('[DB] pushWorkflowOutput error:', e);
        return null;
    }
}
export function getWorkflowOutputs(options) {
    let sql = 'SELECT * FROM workflow_outputs WHERE 1=1';
    const params = [];
    if (options?.source) {
        sql += ' AND source = ?';
        params.push(options.source);
    }
    if (options?.since) {
        sql += ' AND created_at > ?';
        params.push(options.since);
    }
    sql += ' ORDER BY created_at DESC';
    if (options?.limit) {
        sql += ' LIMIT ?';
        params.push(options.limit);
    }
    return db.prepare(sql).all(...params);
}
export function getWorkflowOutputById(id) {
    return db.prepare('SELECT * FROM workflow_outputs WHERE id = ?').get(id);
}
export function deleteWorkflowOutput(id) {
    try {
        const result = db.prepare('DELETE FROM workflow_outputs WHERE id = ?').run(id);
        return result.changes > 0;
    }
    catch {
        return false;
    }
}
export function upsertProjectInfoFile(params) {
    try {
        const metaStr = params.metadata ? JSON.stringify(params.metadata) : '{}';
        const now = new Date().toISOString();
        const stmt = db.prepare(`
      INSERT INTO project_info_files (proid, title, content, raw_content, ask, workflow_run_id, metadata, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(proid) DO UPDATE SET
        title = excluded.title,
        content = excluded.content,
        raw_content = excluded.raw_content,
        ask = excluded.ask,
        workflow_run_id = excluded.workflow_run_id,
        metadata = excluded.metadata,
        updated_at = excluded.updated_at
    `);
        stmt.run(params.proid, params.title || null, params.content, params.raw_content || null, params.ask || null, params.workflow_run_id || null, metaStr, now, now);
        const row = db.prepare('SELECT * FROM project_info_files WHERE proid = ?').get(params.proid);
        return row;
    }
    catch (e) {
        console.error('[DB] upsertProjectInfoFile error:', e);
        return null;
    }
}
export function getProjectInfoFiles(options) {
    let sql = 'SELECT * FROM project_info_files WHERE 1=1';
    const params = [];
    if (options?.proid) {
        sql += ' AND proid = ?';
        params.push(options.proid);
    }
    sql += ' ORDER BY updated_at DESC';
    if (options?.limit) {
        sql += ' LIMIT ?';
        params.push(options.limit);
    }
    return db.prepare(sql).all(...params);
}
export function getProjectInfoFileByProid(proid) {
    return db.prepare('SELECT * FROM project_info_files WHERE proid = ?').get(proid);
}
export function deleteProjectInfoFile(proid) {
    try {
        const result = db.prepare('DELETE FROM project_info_files WHERE proid = ?').run(proid);
        return result.changes > 0;
    }
    catch {
        return false;
    }
}
// ========== 每日更新流水线日志 ==========
export function createDailyUpdateLog(date, status, report) {
    const ts = new Date().toISOString();
    db.prepare(`
    INSERT INTO daily_update_logs (date, status, report, created_at)
    VALUES (?, ?, ?, ?)
  `).run(date, status, report, ts);
}
export function getRecentDailyUpdateLogs(limit = 7) {
    const rows = db.prepare(`SELECT * FROM daily_update_logs ORDER BY created_at DESC LIMIT ?`).all(limit);
    return rows.map((r) => ({
        ...r,
        report: r.report ? JSON.parse(r.report) : null,
    }));
}
export default db;
//# sourceMappingURL=db.js.map