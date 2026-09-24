import React, { useState, useEffect, useCallback } from 'react';
import {
  LayoutDashboard, Settings, Terminal, Database,
  Loader2, Map
} from 'lucide-react';
import { Task, AutomationConfig, AutomationStatus, LogEntry, STORAGE_KEY_CONFIG, STORAGE_KEY_TASKS } from './types';
import Dashboard from './Dashboard';
import ConfigPanel from './ConfigPanel';
import TaskList from './TaskList';
import TerminalOutput from './TerminalOutput';
import MappingPanel from './MappingPanel';

const API_BASE = process.env.NEXT_PUBLIC_SERVER_API
  || (process.env.NODE_ENV === 'production' ? '/a/openclaw' : 'http://localhost:3001');

const App: React.FC = () => {
  const [activeTab, setActiveTab] = useState<'dashboard' | 'tasks' | 'mapping' | 'config' | 'logs'>('dashboard');
  const [status, setStatus] = useState<AutomationStatus>(AutomationStatus.IDLE);
  const [tasks, setTasks] = useState<Task[]>([]);
  useEffect(() => {
    const saved = localStorage.getItem(STORAGE_KEY_TASKS);
    if (saved) {
      try {
        setTasks(JSON.parse(saved));
      } catch (e) { console.error("解析任务数据失败", e); }
    }
  }, []);
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [feishuTables, setFeishuTables] = useState<{ id: string; name: string }[]>([]);
  const [availableFields, setAvailableFields] = useState<string[]>([]);
  const [selectedTasks, setSelectedTasks] = useState<string[]>([]);
  const [isBatchProcessing, setIsBatchProcessing] = useState(false);
  const [currentTableId, setCurrentTableId] = useState<string>('');
  const [currentMapping, setCurrentMapping] = useState<Record<string, string>>({});
  const [filterStatus, setFilterStatus] = useState<'all' | 'completed' | 'pending'>('all');
  const [filterProject, setFilterProject] = useState('');
  const [filterPerson, setFilterPerson] = useState('');
  const fetchingTablesRef = React.useRef(false);

  const getMappingKey = (tableId: string) => `mcp_mapping_${tableId}`;

  const loadMapping = useCallback((tableId: string): Record<string, string> => {
    if (!tableId) return {};
    const saved = localStorage.getItem(getMappingKey(tableId));
    if (saved) {
      try {
        return JSON.parse(saved);
      } catch (e) { console.error("解析映射配置失败", e); }
    }
    return {};
  }, []);

  const saveMapping = useCallback((tableId: string, mapping: Record<string, string>) => {
    if (tableId) {
      localStorage.setItem(getMappingKey(tableId), JSON.stringify(mapping));
    }
  }, []);

  const [config, setConfig] = useState<AutomationConfig>({
    feishu: { appId: '', appSecret: '', appToken: '', tableId: '' },
    oa: { url: '', username: '', password: '' },
    mapping: {}
  });
  useEffect(() => {
    const saved = localStorage.getItem(STORAGE_KEY_CONFIG);
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        if (!parsed.mapping) parsed.mapping = {};
        setConfig(parsed);
      } catch (e) { console.error("解析配置失败", e); }
    }
  }, []);

  const addLog = useCallback((message: string, type: LogEntry['type'] = 'info') => {
    setLogs(prev => [{ timestamp: new Date().toLocaleTimeString(), type, message }, ...prev.slice(0, 50)]);
  }, []);

  // 处理飞书字段值，支持多种格式
  const getFieldValue = (value: any): string => {
    if (!value) return '';
    if (typeof value === 'string') return value;
    if (Array.isArray(value) && value.length > 0 && typeof value[0] === 'string') {
      return value.join(', ');
    }
    if (Array.isArray(value) && value.length > 0 && value[0].text) {
      return value.map((v: any) => v.text).join(', ');
    }
    if (typeof value === 'object' && value.text) return String(value.text);
    return JSON.stringify(value);
  };

  // 按 tableId 获取任务存储 key
  const getTasksKey = (tableId: string) => `mcp_tasks_${tableId}`;

  // 从 localStorage 获取指定表的任务
  const loadTasksByTable = useCallback((tableId: string): Task[] => {
    if (!tableId) return [];
    const saved = localStorage.getItem(getTasksKey(tableId));
    if (saved) {
      try {
        return JSON.parse(saved);
      } catch (e) { console.error("解析任务数据失败", e); }
    }
    return [];
  }, []);

  // 保存任务到 localStorage
  const saveTasksByTable = useCallback((tableId: string, tasks: Task[]) => {
    if (tableId && tasks.length > 0) {
      localStorage.setItem(getTasksKey(tableId), JSON.stringify(tasks));
    }
  }, []);

  // 持久化任务数据（按 tableId 分别保存）
  useEffect(() => {
    if (currentTableId && tasks.length > 0) {
      localStorage.setItem(getTasksKey(currentTableId), JSON.stringify(tasks));
    }
  }, [tasks, currentTableId, getTasksKey]);

  // 初始化时加载配置中的 tableId 对应的任务和映射
  useEffect(() => {
    if (config.feishu.tableId) {
      setCurrentTableId(config.feishu.tableId);
      setCurrentMapping(loadMapping(config.feishu.tableId));
      const savedTasks = loadTasksByTable(config.feishu.tableId);
      if (savedTasks.length > 0) {
        setTasks(savedTasks);
      }
    }
  }, []);

  // 切换到任务页面时加载飞书表格列表（用 ref 防止重复请求）
  useEffect(() => {
    if (activeTab === 'tasks' && feishuTables.length === 0 && config.feishu.appToken && !fetchingTablesRef.current) {
      fetchingTablesRef.current = true;
      fetchFeishuTables().finally(() => {
        fetchingTablesRef.current = false;
      });
    }
  }, [activeTab]);

  // 切换到映射页面时初始化
  useEffect(() => {
    if (activeTab === 'mapping') {
      if (currentTableId) {
        setCurrentMapping(loadMapping(currentTableId));
        fetchFields(currentTableId);
      } else if (config.feishu.tableId) {
        setCurrentTableId(config.feishu.tableId);
        setCurrentMapping(loadMapping(config.feishu.tableId));
        fetchFields(config.feishu.tableId);
      }
    }
  }, [activeTab]);

  const handleSaveConfig = (newConfig: AutomationConfig) => {
    setConfig(newConfig);
    localStorage.setItem(STORAGE_KEY_CONFIG, JSON.stringify(newConfig));
  };

  // 执行下单自动化流程：通过 UUID 检索 OA 并填单
  const handleExecuteOrder = useCallback(async (taskId: string) => {
    const task = tasks.find(t => t.id === taskId);
    if (!task) return;

    const targetUuid = task.fields["uuid"];
    if (!targetUuid) {
      addLog(`❌ 错误：任务 [${task.fields["需求名称"]}] 缺少 UUID 标识，无法在 OA 检索。`, "error");
      return;
    }

    addLog(`🚀 启动任务执行: [${task.fields["需求名称"]}]`, "info");
    addLog(`🔍 检索标识码 (UUID): ${targetUuid}`, "info");

    try {
      const response = await fetch(`${API_BASE}/execute`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          uuid: task.fields['uuid'],
          taskData: task.fields,
          oaConfig: config.oa
        })
      });

      if (!response.ok) throw new Error("无法连接到本地自动化引擎，请检查 3001 端口");

      const result = await response.json();
      addLog(`✅ OA 下单指令已成功发送，正在 UUID [${targetUuid}] 处执行填单...`, "success");

      if (result.orderUrl) {
        addLog(`📝 正在更新飞书表单中的下单链接...`, "info");
        try {
          const tokenRes = await fetch('/feishu-api/open-apis/auth/v3/tenant_access_token/internal', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ app_id: config.feishu.appId, app_secret: config.feishu.appSecret })
          });
          const { tenant_access_token: token } = await tokenRes.json();

          const mapping = currentMapping || {};
          const linkFieldName = mapping["下单链接"];

          if (linkFieldName) {
            await fetch(`/feishu-api/open-apis/bitable/v1/apps/${config.feishu.appToken}/tables/${currentTableId}/records/${taskId}`, {
              method: 'PATCH',
              headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json'
              },
              body: JSON.stringify({
                fields: {
                  [linkFieldName]: result.orderUrl
                }
              })
            });
            addLog(`✅ 下单链接已更新: ${result.orderUrl}`, "success");
          }
        } catch (linkError: any) {
          addLog(`⚠️ 更新下单链接失败: ${linkError.message}`, "warning");
        }
      }

      setTasks(prev => prev.map(t =>
        t.id === taskId ? { ...t, fields: { ...t.fields, "下单字段": "是", "下单链接": result.orderUrl || t.fields["下单链接"] } } : t
      ));
    } catch (error: any) {
      addLog(`❌ 执行失败: ${error.message}`, "error");
    }
  }, [tasks, config.oa, config.feishu, currentTableId, currentMapping, addLog]);

  const handleSelectTask = (taskId: string) => {
    setSelectedTasks(prev =>
      prev.includes(taskId)
        ? prev.filter(id => id !== taskId)
        : [...prev, taskId]
    );
  };

  const handleSelectAll = () => {
    const pendingTasks = tasks.filter(t => t.fields['下单字段'] !== '是');
    const allPendingSelected = pendingTasks.every(t => selectedTasks.includes(t.id));

    if (allPendingSelected) {
      setSelectedTasks(prev => prev.filter(id => !pendingTasks.some(t => t.id === id)));
    } else {
      const newSelection = [...new Set([...selectedTasks, ...pendingTasks.map(t => t.id)])];
      setSelectedTasks(newSelection);
    }
  };

  const handleBatchExecute = async () => {
    if (selectedTasks.length === 0) return;

    setIsBatchProcessing(true);
    const taskIds = [...selectedTasks];
    let successCount = 0;
    let failCount = 0;

    addLog(`🚀 开始批量执行 ${taskIds.length} 个任务`, "info");

    for (let i = 0; i < taskIds.length; i++) {
      const taskId = taskIds[i];
      const task = tasks.find(t => t.id === taskId);
      if (!task) continue;

      const targetUuid = task.fields["uuid"];
      if (!targetUuid) {
        addLog(`❌ 任务 [${task.fields["需求名称"]}] 缺少 UUID，跳过`, "error");
        failCount++;
        continue;
      }

      addLog(`📋 [${i + 1}/${taskIds.length}] 正在执行: [${task.fields["需求名称"]}]`, "info");
      addLog(`🔍 检索标识码 (UUID): ${targetUuid}`, "info");

      try {
        const response = await fetch(`${API_BASE}/execute`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            uuid: task.fields['uuid'],
            taskData: task.fields,
            oaConfig: config.oa
          })
        });

        if (!response.ok) throw new Error("无法连接到本地自动化引擎");

        const result = await response.json();
        addLog(`✅ OA 下单指令已成功发送`, "success");

        setTasks(prev => prev.map(t =>
          t.id === taskId ? { ...t, fields: { ...t.fields, "下单字段": "是", "下单链接": result.orderUrl || t.fields["下单链接"] } } : t
        ));

        successCount++;
      } catch (error: any) {
        addLog(`❌ 任务 [${task.fields["需求名称"]}] 执行失败: ${error.message}`, "error");
        failCount++;
      }
    }

    setSelectedTasks([]);
    setIsBatchProcessing(false);
    addLog(`🏁 批量执行完成: 成功 ${successCount} 个, 失败 ${failCount} 个`, failCount > 0 ? "warning" : "success");
  };

  const fetchFields = async (tableId: string) => {
    if (!config.feishu.appToken || !tableId) return;
    try {
      const tokenRes = await fetch('/feishu-api/open-apis/auth/v3/tenant_access_token/internal', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ app_id: config.feishu.appId, app_secret: config.feishu.appSecret })
      });
      const { tenant_access_token: token } = await tokenRes.json();

      const fieldsRes = await fetch(`/feishu-api/open-apis/bitable/v1/apps/${config.feishu.appToken}/tables/${tableId}/fields`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      const data = await fieldsRes.json();
      if (data.code === 0) {
        const fieldNames = data.data.items.map((f: any) => f.field_name);
        setAvailableFields(fieldNames);
        addLog(`成功获取表字段: ${fieldNames.length} 个`, "success");
      }
    } catch (err) {
      addLog("获取字段列表失败，请检查飞书配置", "error");
    }
  };

  const fetchFeishuTables = async () => {
    if (!config.feishu.appId || !config.feishu.appSecret || !config.feishu.appToken) {
      addLog('请先在 Config 页面填写飞书 App ID、App Secret 和 App Token', 'warning');
      return null;
    }
    try {
      const tokenRes = await fetch('/feishu-api/open-apis/auth/v3/tenant_access_token/internal', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ app_id: config.feishu.appId, app_secret: config.feishu.appSecret })
      });
      const tokenData = await tokenRes.json();
      const token = tokenData.tenant_access_token;
      if (!token) {
        addLog('获取飞书 Token 失败，请检查 App ID 和 App Secret', 'error');
        return null;
      }

      const tablesRes = await fetch(`/feishu-api/open-apis/bitable/v1/apps/${config.feishu.appToken}/tables`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      const tablesData = await tablesRes.json();
      if (tablesData.code === 0) {
        setFeishuTables(tablesData.data.items.map((t: any) => ({ id: t.table_id, name: t.name })));
      }
      return token;
    } catch (err: any) {
      addLog(`获取飞书表格失败: ${err?.message || err}`, 'error');
      return null;
    }
  };

  const handleTableChange = async (tableId: string) => {
    if (!tableId) return;
    setCurrentTableId(tableId);
    setSelectedTasks([]);

    const savedMapping = loadMapping(tableId);
    setCurrentMapping(savedMapping);
    fetchFields(tableId);

    const savedTasks = loadTasksByTable(tableId);
    setTasks(savedTasks);

    if (savedMapping && Object.keys(savedMapping).length > 0) {
      addLog(`正在加载表 ${tableId} 的数据...`, "info");
      await handleRunAutomation(tableId);
    } else if (savedTasks.length > 0) {
      addLog(`已加载表 ${tableId} 的 ${savedTasks.length} 条任务`, "info");
    }
  };

  const handleRunAutomation = async (tableId?: string) => {
    const targetTableId = tableId || currentTableId;
    if (!targetTableId || status !== AutomationStatus.IDLE) return;

    try {
      setStatus(AutomationStatus.FETCHING_FEISHU);
      addLog("正在同步数据...", "info");

      const token = await fetchFeishuTables();
      if (!token) {
        setStatus(AutomationStatus.IDLE);
        return;
      }

      const recordsRes = await fetch(`/feishu-api/open-apis/bitable/v1/apps/${config.feishu.appToken}/tables/${targetTableId}/records`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      const recordsData = await recordsRes.json();

      const mapping = currentMapping || {};
      const newTasks: Task[] = (recordsData.data.items || []).map((item: any) => ({
        id: item.record_id,
        sourceTableId: targetTableId,
        fields: {
          "需求名称": getFieldValue(item.fields[mapping["需求名称"]]) || "未命名",
          "所属项目": getFieldValue(item.fields[mapping["所属项目"]]) || "默认项目",
          "工时": Number(getFieldValue(item.fields[mapping["工时"]])) || 0,
          "负责人": getFieldValue(item.fields[mapping["负责人"]]) || "未指派",
          "下单字段": getFieldValue(item.fields[mapping["下单字段"]]) === "是" ? "是" : "否",
          "uuid": getFieldValue(item.fields[mapping["uuid"]]),
          "完成时间": getFieldValue(item.fields[mapping["完成时间"]]),
          "更新时间": getFieldValue(item.fields[mapping["更新时间"]]),
          "任务详情": getFieldValue(item.fields[mapping["任务详情"]])
        }
      }));

      const existingTasks = loadTasksByTable(targetTableId);
      const mergedTasks = newTasks.map(newTask => {
        const existingTask = existingTasks.find(t => t.id === newTask.id);
        if (existingTask) {
          return {
            ...newTask,
            fields: {
              ...newTask.fields,
              "下单链接": existingTask.fields["下单链接"]
            }
          };
        }
        return newTask;
      });

      setTasks(mergedTasks);
      saveTasksByTable(targetTableId, mergedTasks);
      addLog(`同步完成，加载 ${mergedTasks.length} 条数据`, "success");
      setStatus(AutomationStatus.IDLE);
    } catch (err: any) {
      addLog(`同步失败: ${err.message}`, "error");
      setStatus(AutomationStatus.IDLE);
    }
  };

  return (
    <div className="flex h-screen bg-slate-950 text-slate-200">
      <aside className="w-64 border-r border-slate-800 bg-slate-900 flex flex-col p-4 space-y-2">
        <div className="text-blue-500 font-bold text-xl mb-6">MCP AUTO</div>
        <button onClick={() => setActiveTab('dashboard')} className={`flex gap-3 p-3 rounded-lg ${activeTab === 'dashboard' ? 'bg-blue-600' : 'hover:bg-slate-800'}`}><LayoutDashboard size={20} />仪表盘</button>
        <button onClick={() => setActiveTab('tasks')} className={`flex gap-3 p-3 rounded-lg ${activeTab === 'tasks' ? 'bg-blue-600' : 'hover:bg-slate-800'}`}><Database size={20} />任务队列</button>
        <button onClick={() => setActiveTab('mapping')} className={`flex gap-3 p-3 rounded-lg ${activeTab === 'mapping' ? 'bg-blue-600' : 'hover:bg-slate-800'}`}><Map size={20} />字段映射</button>
        <button onClick={() => setActiveTab('config')} className={`flex gap-3 p-3 rounded-lg ${activeTab === 'config' ? 'bg-blue-600' : 'hover:bg-slate-800'}`}><Settings size={20} />系统配置</button>
        <button onClick={() => setActiveTab('logs')} className={`flex gap-3 p-3 rounded-lg ${activeTab === 'logs' ? 'bg-blue-600' : 'hover:bg-slate-800'}`}><Terminal size={20} />运行日志</button>
      </aside>

      <main className="flex-1 overflow-y-auto p-8">
        {activeTab === 'dashboard' && <Dashboard tasks={tasks} logs={logs} status={status} />}
        {activeTab === 'tasks' && (
          <TaskList
            tasks={tasks}
            onExecute={handleExecuteOrder}
            selectedTasks={selectedTasks}
            onSelectTask={handleSelectTask}
            onSelectAll={handleSelectAll}
            onBatchExecute={handleBatchExecute}
            isBatchProcessing={isBatchProcessing}
            feishuTables={feishuTables}
            currentTableId={currentTableId}
            onTableChange={handleTableChange}
            onRefresh={() => handleRunAutomation()}
            filterStatus={filterStatus}
            onFilterStatusChange={setFilterStatus}
            filterProject={filterProject}
            onFilterProjectChange={setFilterProject}
            filterPerson={filterPerson}
            onFilterPersonChange={setFilterPerson}
          />
        )}
        {activeTab === 'mapping' && (
          <MappingPanel
            feishuTables={feishuTables}
            availableFields={availableFields}
            currentTableId={currentTableId}
            mapping={currentMapping}
            onTableChange={(id) => {
              setCurrentTableId(id);
              setCurrentMapping(loadMapping(id));
              fetchFields(id);
            }}
            onMappingChange={setCurrentMapping}
            onSave={() => {
              saveMapping(currentTableId, currentMapping);
              addLog(`映射配置已保存到表 ${currentTableId}`, "success");
            }}
          />
        )}
        {activeTab === 'config' && <ConfigPanel config={config} setConfig={handleSaveConfig} />}
        {activeTab === 'logs' && <TerminalOutput logs={logs} />}
      </main>
    </div>
  );
};

export default App;
