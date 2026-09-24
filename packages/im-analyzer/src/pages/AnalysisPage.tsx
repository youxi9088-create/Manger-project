import { useState, useEffect, useCallback, useRef } from 'react';
import {
  Card, Button, Tag, Space, DatePicker, DateRangePicker, Empty, Loading,
  Dialog, Input, Textarea, Select, MessagePlugin, Tabs, Table, Badge,
  Collapse, Progress, Tooltip, Divider, Alert, Pagination
} from 'tdesign-react';
import {
  AddIcon, DeleteIcon, RefreshIcon, UploadIcon,
  ChartBarIcon, TimeIcon, CheckCircleIcon,
  ErrorCircleIcon, PlayCircleIcon, CalendarIcon,
  BrowseIcon, FileIcon, CloudDownloadIcon
} from 'tdesign-icons-react';
import dayjs from 'dayjs';
import {
  useImSources, useChatRecords, useAnalysisReports,
  useChatStats, useScheduledTasks, useU9Api, useSourceConversations,
  useLocalDb
} from '../hooks/useImAnalysis';
import { useAutoSetup, useFetchToday } from '../hooks/useAutoSetup';
import { AnalysisReport, ChatRecord } from '../types';
import { cleanMessageContent } from '../utils/richContentParser';

interface AnalysisPageProps {
  onNavigateToChat?: () => void;
}

// IM 类型选项
const IM_TYPE_OPTIONS = [
  { label: '企业微信', value: 'wechat_work' },
  { label: '微信', value: 'wechat' },
  { label: '钉钉', value: 'dingtalk' },
  { label: '飞书', value: 'feishu' },
  { label: '99U', value: '99u' },
  { label: '99U Web', value: '99u_web' },
  { label: '自定义', value: 'custom' },
];

export function AnalysisPage({ onNavigateToChat }: AnalysisPageProps) {
  const [activeTab, setActiveTab] = useState('dashboard');

  const { sources, fetchSources, createSource, deleteSource } = useImSources();
  const { records, allRecords, todayRecords, total, page, pageSize, loading: recordsLoading, allLoading, todayLoading, fetchRecords, fetchAllRecords, fetchTodayRecords, importRecords, changePage } = useChatRecords();
  const { reports, loading: reportsLoading, analyzing, analysisStream, fetchReports, runAnalysis, deleteReport } = useAnalysisReports();
  const { stats, loading: statsLoading, fetchStats } = useChatStats();
  const { tasks, fetchTasks, createTask, updateTask, deleteTask, runTask } = useScheduledTasks();
  const { status: u9Status, importing: u9Importing, importProgress: u9ImportProgress, fetchStatus: fetchU9Status, importFromU9, fetchU9Conversations, refreshConversations } = useU9Api();
  const { conversations: sourceConversations, fetchConversations, addConversation, removeConversation } = useSourceConversations();
  const { connecting: localDbConnecting, importing: localDbImporting, connectResult: localDbConnectResult, conversations: localDbConversations, importResult: localDbImportResult, connectLocalDb, fetchLocalConversations, importLocalDb } = useLocalDb();

  // 需求1: 自动配置
  const { status: autoSetupStatus, startSetup, submitSmsCode, cancelSetup } = useAutoSetup();
  const [setupDialogVisible, setSetupDialogVisible] = useState(false);
  const [setupEmployeeId, setSetupEmployeeId] = useState('');
  const [setupPassword, setSetupPassword] = useState('');
  const [smsCode, setSmsCode] = useState('');

  // 需求2: 获取当天聊天记录
  const { status: fetchTodayStatus, fetchToday } = useFetchToday();
  const [fetchTodayDialogVisible, setFetchTodayDialogVisible] = useState(false);

  // 本地数据库状态
  const [localDbDialogVisible, setLocalDbDialogVisible] = useState(false);
  const [localDbEmployeeId, setLocalDbEmployeeId] = useState('986916');
  const [localDbBasePath, setLocalDbBasePath] = useState('D:/Program Files (x86)/Netdragon/imData/mulproplus/db/0.56/_@_prpl-91u-nd');
  const [localDbSourceId, setLocalDbSourceId] = useState('');
  const [localDbStep, setLocalDbStep] = useState<'connect' | 'import'>('connect');

  // 从接口读取的 U9 会话列表
  const [u9ConversationsFromApi, setU9ConversationsFromApi] = useState<{ id: string; name: string }[]>([]);

  // 筛选条件
  const [dateRange, setDateRange] = useState<[string, string] | null>(null);
  const [selectedSource, setSelectedSource] = useState<string>('');
  const [keyword, setKeyword] = useState('');

  // 对话框状态
  const [sourceDialogVisible, setSourceDialogVisible] = useState(false);
  const [importDialogVisible, setImportDialogVisible] = useState(false);
  const [reportDialogVisible, setReportDialogVisible] = useState(false);
  const [selectedReport, setSelectedReport] = useState<AnalysisReport | null>(null);
  const [scheduleDialogVisible, setScheduleDialogVisible] = useState(false);

  // 分析日期
  const [analysisDate, setAnalysisDate] = useState(dayjs().format('YYYY-MM-DD'));

  // 仪表盘模块分页
  const [todayMsgPage, setTodayMsgPage] = useState(1);
  const todayMsgPageSize = 10;
  const [reportPage, setReportPage] = useState(1);
  const reportPageSize = 5;

  // 新数据源表单
  const [newSource, setNewSource] = useState({ name: '', type: 'wechat_work' });
  // 导入数据
  const [importText, setImportText] = useState('');
  const [importSourceId, setImportSourceId] = useState('');
  const [importStep, setImportStep] = useState<'choose' | 'input'>('choose');
  // 99U API 导入
  const [u9DialogVisible, setU9DialogVisible] = useState(false);
  const [u9ConvId, setU9ConvId] = useState('');
  const [u9ImportSourceId, setU9ImportSourceId] = useState('');
  const [u9MaxMessages, setU9MaxMessages] = useState(100);
  const [u9Keyword, setU9Keyword] = useState('');
  const [u9ImportDateRange, setU9ImportDateRange] = useState<[string, string] | null>(null);
  // 新定时任务
  const [newTask, setNewTask] = useState({ name: '', cron_expression: '0 18 * * *' });

  // 文件上传 ref
  const fileInputRef = useRef<HTMLInputElement>(null);

  // 加载数据（fetchStats 不传日期，查全量数据）
  useEffect(() => {
    fetchSources();
    fetchReports({ limit: 30 });
    fetchStats();  // 不传日期参数，后端返回全量统计
    fetchTasks();
    fetchU9Status();
    fetchTodayRecords();  // 加载今日消息明细
  }, []);

  // 当日期范围变化时刷新数据（筛选条件变化时重置到第1页）
  useEffect(() => {
    if (activeTab === 'records') {
      const filterParams = {
        sourceId: selectedSource || undefined,
        startDate: dateRange?.[0],
        endDate: dateRange?.[1],
        keyword: keyword || undefined,
      };
      fetchRecords({
        ...filterParams,
        page: 1,
        pageSize,
      });
      // 如果当前是聚合视图，同步刷新全量数据
      if (recordViewMode === 'by-user' || recordViewMode === 'by-group') {
        fetchAllRecords(filterParams);
      }
    } else if (activeTab === 'dashboard') {
      fetchStats(dateRange?.[0], dateRange?.[1]);
    }
  }, [activeTab, dateRange, selectedSource, keyword]);

  // 创建数据源
  const handleCreateSource = async () => {
    if (!newSource.name) {
      MessagePlugin.warning('请输入数据源名称');
      return;
    }
    const result = await createSource(newSource);
    if (result.source) {
      setSourceDialogVisible(false);
      setNewSource({ name: '', type: 'wechat_work' });
      MessagePlugin.success('数据源创建成功');
    }
  };

  // 打开导入对话框
  const openImportDialog = () => {
    setImportStep('choose');
    setImportText('');
    // 自动选中已有数据源
    if (sources.length > 0) {
      setImportSourceId(selectedSource || sources[0].id);
      setImportStep('input');
    }
    setImportDialogVisible(true);
  };

  // 创建数据源并进入导入
  const handleQuickCreateAndImport = async () => {
    if (!newSource.name) {
      MessagePlugin.warning('请输入数据源名称');
      return;
    }
    const result = await createSource(newSource);
    if (result.source) {
      setImportSourceId(result.source.id);
      setImportStep('input');
      setNewSource({ name: '', type: 'wechat_work' });
      MessagePlugin.success('数据源创建成功，请导入聊天记录');
    }
  };

  // 导入聊天记录（文本粘贴方式）
  const handleImport = async () => {
    if (!importSourceId) {
      MessagePlugin.warning('请选择或创建数据源');
      return;
    }
    if (!importText.trim()) {
      MessagePlugin.warning('请输入或上传聊天记录数据');
      return;
    }
    try {
      const data = JSON.parse(importText);
      const recs = Array.isArray(data) ? data : [data];
      const result = await importRecords(importSourceId, recs);
      if (result.success) {
        setImportDialogVisible(false);
        setImportText('');
        const skippedMsg = result.skipped > 0 ? `（跳过 ${result.skipped} 条重复消息）` : '';
        MessagePlugin.success(`成功导入 ${result.imported} 条记录${skippedMsg}`);
        setSelectedSource(importSourceId);
        fetchRecords({ sourceId: importSourceId, page: 1, pageSize });
        fetchStats();
        fetchTodayRecords();
        setActiveTab('records');
      } else {
        MessagePlugin.error(result.error || '导入失败');
      }
    } catch {
      MessagePlugin.error('JSON 格式错误，请检查输入');
    }
  };

  // 处理文件上传
  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!importSourceId) {
      MessagePlugin.warning('请先选择或创建数据源');
      return;
    }

    try {
      const content = await file.text();
      const ext = file.name.split('.').pop()?.toLowerCase();

      if (ext === 'json') {
        const data = JSON.parse(content);
        const recs = Array.isArray(data) ? data : [data];
        setImportText(JSON.stringify(recs, null, 2));
        MessagePlugin.success(`已读取 ${recs.length} 条记录，点击「确认导入」提交`);
      } else {
        MessagePlugin.error('目前仅支持 JSON 格式文件');
      }
    } catch {
      MessagePlugin.error('文件读取失败');
    }

    // 清空 input 以便重复选择同一文件
    e.target.value = '';
  };

  // 打开 99U 导入对话框
  const openU9ImportDialog = async () => {
    // 重置状态
    setU9ConvId('');
    setU9Keyword('');
    setU9MaxMessages(100);
    setU9ImportDateRange(null);

    // 从接口实时获取会话列表
    const apiConvs = await fetchU9Conversations();
    setU9ConversationsFromApi(apiConvs);

    // 自动选中已存在的 99u_web 类型数据源
    const u9Source = sources.find(s => s.type === '99u_web' || s.type === '99u');
    if (u9Source) {
      setU9ImportSourceId(u9Source.id);
    }
    setU9DialogVisible(true);
  };

  // 99U 快速创建数据源并导入
  const handleU9QuickCreate = async () => {
    if (!newSource.name) {
      MessagePlugin.warning('请输入数据源名称');
      return;
    }
    const result = await createSource({ ...newSource, type: '99u_web' });
    if (result.source) {
      setU9ImportSourceId(result.source.id);
      setNewSource({ name: '', type: 'wechat_work' });
      MessagePlugin.success('99U 数据源创建成功');
    }
  };

  // 执行 99U 导入
  const handleU9Import = async () => {
    if (!u9ImportSourceId) {
      MessagePlugin.warning('请选择目标数据源');
      return;
    }
    if (!u9ConvId.trim() && u9ConvId !== '__all__') {
      MessagePlugin.warning('请选择或输入会话 ID（convId）');
      return;
    }

    // 如果选择"全部会话"，使用接口返回的所有会话
    const convIds = u9ConvId === '__all__'
      ? ((await fetchU9Conversations()).map((c: { id: string }) => c.id))
      : [u9ConvId.trim()];

    let totalImported = 0;
    let totalSkipped = 0;
    const failedConvs: string[] = [];

    for (const convId of convIds) {
      const result = await importFromU9({
        sourceId: u9ImportSourceId,
        convId,
        keyword: u9Keyword || undefined,
        beginTime: u9ImportDateRange?.[0],
        endTime: u9ImportDateRange?.[1],
        maxMessages: u9MaxMessages,
      });

      if (result.success) {
        totalImported += result.imported || 0;
        totalSkipped += result.skipped || 0;
      } else {
        failedConvs.push(convId);
      }
    }

    if (totalImported > 0 || totalSkipped > 0) {
      setU9DialogVisible(false);
      const skippedMsg = totalSkipped > 0 ? `（跳过 ${totalSkipped} 条重复消息）` : '';
      const failedMsg = failedConvs.length > 0 ? `\n失败会话: ${failedConvs.join(', ')}` : '';
      MessagePlugin.success(`成功导入 ${totalImported} 条 99U 聊天记录${skippedMsg}${failedMsg}`);
      setSelectedSource(u9ImportSourceId);
      fetchRecords({ sourceId: u9ImportSourceId, page: 1, pageSize });
      fetchStats();
      fetchTodayRecords();
      setActiveTab('records');
    } else if (failedConvs.length > 0) {
      MessagePlugin.error(`所有会话导入失败: ${failedConvs.join(', ')}`);
    } else {
      MessagePlugin.warning('没有导入任何记录');
    }
  };

  // 运行分析
  const handleRunAnalysis = async () => {
    await runAnalysis(analysisDate, (text, type) => {
      if (type === 'saved') {
        MessagePlugin.success(`${analysisDate} 分析报告已生成`);
        setReportDialogVisible(false);
        fetchReports();
      } else if (type === 'error') {
        MessagePlugin.error(text);
      }
    });
  };

  // 查看报告详情
  const handleViewReport = (report: AnalysisReport) => {
    setSelectedReport(report);
    setReportDialogVisible(true);
  };

  // 创建定时任务
  const handleCreateTask = async () => {
    if (!newTask.name) {
      MessagePlugin.warning('请输入任务名称');
      return;
    }
    const result = await createTask(newTask);
    if (result.task) {
      setScheduleDialogVisible(false);
      setNewTask({ name: '', cron_expression: '0 18 * * *' });
      MessagePlugin.success('定时任务创建成功');
    }
  };

  const formatDate = (ts: string) => dayjs(ts).format('MM-DD HH:mm');
  const formatDateShort = (ts: string) => dayjs(ts).format('YYYY-MM-DD');

  // ============= 仪表盘 =============
  // 新增：@我的消息弹窗（独立拉取数据，不依赖 records）
  const [atMeDialogVisible, setAtMeDialogVisible] = useState(false);
  const [atMeMessages, setAtMeMessages] = useState<ChatRecord[]>([]);
  const [atMeLoading, setAtMeLoading] = useState(false);

  const openAtMeDialog = async () => {
    setAtMeDialogVisible(true);
    setAtMeLoading(true);
    try {
      const query = new URLSearchParams();
      query.set('isMentioned', 'true');
      query.set('page', '1');
      query.set('pageSize', '500');
      const res = await fetch(`/api/im/chat-records?${query}`);
      const data = await res.json();
      setAtMeMessages((data.records || []).map((r: any) => ({ ...r, is_mentioned: !!r.is_mentioned })));
    } catch (e) {
      console.error('Failed to fetch @me messages:', e);
      setAtMeMessages([]);
    } finally {
      setAtMeLoading(false);
    }
  };

  const renderAtMeDialog = () => (
    <Dialog
      visible={atMeDialogVisible}
      header={`@我的消息（共 ${atMeMessages.length} 条）`}
      onClose={() => setAtMeDialogVisible(false)}
      width={680}
      footer={null}
    >
      {atMeLoading ? (
        <div className="flex justify-center py-8"><Loading /></div>
      ) : atMeMessages.length === 0 ? (
        <Empty description="暂无 @我的消息" />
      ) : (
        <div className="ap-scroll-480">
          {atMeMessages.map(msg => (
            <div key={msg.id} className="flex gap-3 py-3 ap-border-bottom">
              <div className="flex-shrink-0">
                <div className={`w-8 h-8 rounded-full flex items-center justify-center text-white text-xs font-bold ${avatarColorClass(msg.sender_name)}`}>
                  {msg.sender_name.charAt(0)}
                </div>
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-0.5">
                  <span className="text-sm font-medium">{msg.sender_name}</span>
                  {msg.group_name && <Tag size="small" variant="outline">{msg.group_name}</Tag>}
                  <Tag size="small" theme="primary">@我</Tag>
                  <span className="text-xs ml-auto ap-text-secondary">{formatDate(msg.timestamp)}</span>
                </div>
                <div className="text-sm ap-text-primary">{cleanMessageContent(msg.content)}</div>
              </div>
            </div>
          ))}
        </div>
      )}
    </Dialog>
  );

  const renderDashboard = () => (
    <div className="space-y-6 p-6">
      {/* 统计卡片 */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card bordered>
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg flex items-center justify-center ap-stat-icon-brand">
              <ChartBarIcon size={22} className="ap-text-brand" />
            </div>
            <div>
              <div className="text-xs ap-text-secondary">消息总数（当前筛选）</div>
              <div className="text-xl font-bold">{stats?.stats.total_messages ?? 0}</div>
            </div>
          </div>
        </Card>
        <Card bordered>
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg flex items-center justify-center ap-stat-icon-success">
              <BrowseIcon size={22} className="ap-text-success" />
            </div>
            <div>
              <div className="text-xs ap-text-secondary">发送者数</div>
              <div className="text-xl font-bold">{stats?.stats.unique_senders ?? 0}</div>
            </div>
          </div>
        </Card>
        <Card bordered>
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg flex items-center justify-center ap-stat-icon-warning">
              <TimeIcon size={22} className="ap-text-warning" />
            </div>
            <div>
              <div className="text-xs ap-text-secondary">群组数</div>
              <div className="text-xl font-bold">{stats?.stats.unique_groups ?? 0}</div>
            </div>
          </div>
        </Card>
        <Card bordered>
          <div className="flex items-center gap-3 cursor-pointer" onClick={() => openAtMeDialog()}>
            <div className="w-10 h-10 rounded-lg flex items-center justify-center ap-stat-icon-danger">
              <ErrorCircleIcon size={22} className="ap-text-danger" />
            </div>
            <div>
              <div className="text-xs ap-text-secondary">@我的消息</div>
              <div className="text-xl font-bold">{stats?.stats.mentioned_count ?? 0}</div>
            </div>
          </div>
        </Card>
      </div>

      {/* 从 99U 拉取按钮 */}
      {u9Status?.configured && activeTab === 'dashboard' && (
        <div className="flex gap-2">
          <Button icon={<CloudDownloadIcon />} theme="primary" onClick={() => setFetchTodayDialogVisible(true)} size="small">
            获取当天聊天记录
          </Button>
          <Button icon={<UploadIcon />} onClick={openImportDialog} size="small">
            导入更多
          </Button>
        </div>
      )}

      {/* 导入数据引导（无数据时显示） */}
      {(!stats || (stats?.stats?.total_messages ?? 0) === 0) && (
        <Card bordered>
          <Empty description="暂无聊天数据" action={
            <Space>
              <Button icon={<CloudDownloadIcon />} theme="primary" onClick={() => setFetchTodayDialogVisible(true)}>获取当天聊天记录</Button>
              <Button icon={<UploadIcon />} onClick={openImportDialog}>导入聊天记录</Button>
            </Space>
          } />
        </Card>
      )}

      {/* 有数据但无报告时的引导 */}
      {stats && stats.stats.total_messages > 0 && reports.length === 0 && (
        <Card bordered>
          <Alert theme="info" message="已有聊天数据，前往「分析报告」Tab 使用 AI 生成工作日报。" />
        </Card>
      )}

      {/* 今日消息明细 + 最新分析报告 */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Card title={`今日消息明细（${todayRecords.length} 条）`} bordered actions={
          <Button size="small" variant="text" theme="primary" onClick={() => openAtMeDialog()}>
            @我的消息（{stats?.stats.mentioned_count ?? 0}）
          </Button>
        }>
          {todayLoading ? (
            <div className="flex justify-center py-8">
              <Loading />
            </div>
          ) : todayRecords.length === 0 ? (
            <Empty description="今日暂无消息" />
          ) : (
            <>
              <div className="ap-scroll-320">
                {todayRecords
                  .slice((todayMsgPage - 1) * todayMsgPageSize, todayMsgPage * todayMsgPageSize)
                  .map(msg => (
                    <div key={msg.id} className="flex gap-3 py-2 ap-border-bottom">
                      <div className="flex-shrink-0">
                        <div className={`w-8 h-8 rounded-full flex items-center justify-center text-white text-xs font-bold ${avatarColorClass(msg.sender_name)}`}>
                          {msg.sender_name.charAt(0)}
                        </div>
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-0.5">
                          <span className="text-sm font-medium">{msg.sender_name}</span>
                          {msg.group_name && <Tag size="small" variant="outline">{msg.group_name}</Tag>}
                          {msg.is_mentioned && <Tag size="small" theme="primary">@我</Tag>}
                          <span className="text-xs ml-auto ap-text-secondary">{formatDate(msg.timestamp)}</span>
                        </div>
                        <div className="text-sm ap-text-primary">{cleanMessageContent(msg.content)}</div>
                      </div>
                    </div>
                  ))}
              </div>
              {todayRecords.length > todayMsgPageSize && (
                <div className="flex justify-center mt-3">
                  <Pagination
                    size="small"
                    current={todayMsgPage}
                    total={todayRecords.length}
                    pageSize={todayMsgPageSize}
                    onChange={(pageInfo) => setTodayMsgPage(pageInfo.current)}
                    showPageSize={false}
                  />
                </div>
              )}
            </>
          )}
        </Card>

        {/* 最新分析报告 */}
        <Card title={`最新分析报告（${reports.length} 份）`} bordered actions={
          reports.length > 0 ? (
            <Button size="small" variant="text" theme="primary" onClick={() => setActiveTab('reports')}>查看全部</Button>
          ) : null
        }>
          {reports.length === 0 ? (
            <Empty description="暂无分析报告" action={
              <Button size="small" theme="primary" onClick={() => setActiveTab('reports')}>去生成报告</Button>
            } />
          ) : (
            <>
              <div className="ap-scroll-320">
                {reports
                  .slice((reportPage - 1) * reportPageSize, reportPage * reportPageSize)
                  .map(report => (
                    <div key={report.id} className="py-2 cursor-pointer ap-border-bottom"
                      onClick={() => handleViewReport(report)}>
                      <div className="flex items-center gap-2 mb-1">
                        <CalendarIcon size={14} className="ap-text-brand" />
                        <span className="text-sm font-medium">{report.report_date}</span>
                        <Tag size="small" variant="outline">{report.raw_chat_count} 条消息</Tag>
                        <span className="text-xs ml-auto ap-text-secondary">{formatDate(report.created_at)}</span>
                      </div>
                      <div className="text-xs ap-report-summary">
                        {report.summary}
                      </div>
                    </div>
                  ))}
              </div>
              {reports.length > reportPageSize && (
                <div className="flex justify-center mt-3">
                  <Pagination
                    size="small"
                    current={reportPage}
                    total={reports.length}
                    pageSize={reportPageSize}
                    onChange={(pageInfo) => setReportPage(pageInfo.current)}
                    showPageSize={false}
                  />
                </div>
              )}
            </>
          )}
        </Card>
      </div>
      {renderAtMeDialog()}
    </div>
  );

  // ============= 聊天记录 =============
  const [recordViewMode, setRecordViewMode] = useState<'list' | 'by-user' | 'by-group'>('list');
  const [userSearchKeyword, setUserSearchKeyword] = useState('');
  const [userSortMode, setUserSortMode] = useState<'count_desc' | 'count_asc' | 'name_asc' | 'name_desc'>('count_desc');
  const [selectedGroupName, setSelectedGroupName] = useState<string | null>(null);

  // 按用户名聚合记录（使用全量数据）
  const recordsByUser = (() => {
    const source = allRecords.length > 0 ? allRecords : records;
    const map = new Map<string, { sender_name: string; count: number; records: ChatRecord[] }>();
    for (const r of source) {
      const key = r.sender_name;
      if (!map.has(key)) map.set(key, { sender_name: key, count: 0, records: [] });
      const entry = map.get(key)!;
      entry.count++;
      entry.records.push(r);
    }

    const normalizedKeyword = userSearchKeyword.trim().toLowerCase();
    let grouped = Array.from(map.values());

    if (normalizedKeyword) {
      grouped = grouped.filter(group => group.sender_name.toLowerCase().includes(normalizedKeyword));
    }

    grouped.sort((a, b) => {
      switch (userSortMode) {
        case 'count_asc':
          return a.count - b.count;
        case 'name_asc':
          return a.sender_name.localeCompare(b.sender_name, 'zh-Hans-CN');
        case 'name_desc':
          return b.sender_name.localeCompare(a.sender_name, 'zh-Hans-CN');
        case 'count_desc':
        default:
          return b.count - a.count;
      }
    });

    return grouped;
  })();

  // 按群组聚合记录（需求3，使用全量数据）
  const recordsByGroup = (() => {
    const source = allRecords.length > 0 ? allRecords : records;
    const map = new Map<string, { group_name: string; count: number; records: ChatRecord[] }>();
    for (const r of source) {
      const key = r.group_name || '私聊消息';
      if (!map.has(key)) map.set(key, { group_name: key, count: 0, records: [] });
      const entry = map.get(key)!;
      entry.count++;
      entry.records.push(r);
    }
    return Array.from(map.values()).sort((a, b) => b.count - a.count);
  })();

  // 展开的用户（按用户名分组视图中）
  const [expandedUsers, setExpandedUsers] = useState<Set<string>>(new Set());
  const toggleUser = (name: string) => {
    setExpandedUsers(prev => {
      const next = new Set(prev);
      if (next.has(name)) next.delete(name);
      else next.add(name);
      return next;
    });
  };

  // 用户头像颜色（基于名字哈希，返回 CSS 类名）
  const avatarColorClass = (name: string) => {
    const classes = ['ap-avatar-0', 'ap-avatar-1', 'ap-avatar-2', 'ap-avatar-3', 'ap-avatar-4', 'ap-avatar-5', 'ap-avatar-6', 'ap-avatar-7'];
    let hash = 0;
    for (let i = 0; i < name.length; i++) hash = name.charCodeAt(i) + ((hash << 5) - hash);
    return classes[Math.abs(hash) % classes.length];
  };

  const renderRecords = () => (
    <div className="p-6 space-y-4">
      {/* 筛选栏 */}
      <Card bordered>
        <div className="flex flex-wrap items-center gap-3">
          <Select
            placeholder="选择数据源"
            value={selectedSource || undefined}
            onChange={v => setSelectedSource(String(v))}
            clearable
            className="ap-w-180"
            options={sources.map(s => ({ label: s.name, value: s.id }))}
          />
          <DatePicker
            placeholder="开始日期"
            value={dateRange?.[0]}
            format="YYYY-MM-DD"
            onChange={v => {
              const dateStr = v ? dayjs(v as Date).format('YYYY-MM-DD') : '';
              setDateRange(prev => [dateStr, prev?.[1] || dayjs().endOf('day').format('YYYY-MM-DD')]);
            }}
            className="ap-w-160"
          />
          <DatePicker
            placeholder="结束日期"
            value={dateRange?.[1]}
            format="YYYY-MM-DD"
            onChange={v => {
              const dateStr = v ? dayjs(v as Date).format('YYYY-MM-DD') : '';
              setDateRange(prev => [prev?.[0] || dayjs().startOf('day').format('YYYY-MM-DD'), dateStr]);
            }}
            className="ap-w-160"
          />
          <Input
            placeholder="搜索消息内容..."
            value={keyword}
            onChange={v => setKeyword(v)}
            clearable
            className="ap-w-240"
          />
          <Button icon={<RefreshIcon />} onClick={() => fetchRecords({
            sourceId: selectedSource || undefined,
            keyword: keyword || undefined,
            startDate: dateRange?.[0],
            endDate: dateRange?.[1],
            page: 1,
            pageSize
          })}>
            刷新
          </Button>
          <Button
            icon={<UploadIcon />}
            theme="primary"
            onClick={openImportDialog}
          >
            导入记录
          </Button>
          {/* 视图切换 */}
          <div className="ml-auto flex items-center gap-1 ap-view-switcher">
            <Button
              size="small"
              variant={recordViewMode === 'list' ? 'base' : 'text'}
              theme={recordViewMode === 'list' ? 'primary' : 'default'}
              onClick={() => setRecordViewMode('list')}
            >时间流</Button>
            <Button
              size="small"
              variant={recordViewMode === 'by-user' ? 'base' : 'text'}
              theme={recordViewMode === 'by-user' ? 'primary' : 'default'}
              onClick={() => {
                setRecordViewMode('by-user');
                setExpandedUsers(new Set());
                fetchAllRecords({
                  sourceId: selectedSource || undefined,
                  startDate: dateRange?.[0],
                  endDate: dateRange?.[1],
                  keyword: keyword || undefined,
                });
              }}
            >按用户</Button>
            <Button
              size="small"
              variant={recordViewMode === 'by-group' ? 'base' : 'text'}
              theme={recordViewMode === 'by-group' ? 'primary' : 'default'}
              onClick={() => {
                setRecordViewMode('by-group');
                setSelectedGroupName(null);
                fetchAllRecords({
                  sourceId: selectedSource || undefined,
                  startDate: dateRange?.[0],
                  endDate: dateRange?.[1],
                  keyword: keyword || undefined,
                });
              }}
            >按群组</Button>
          </div>
          <span className="text-sm ap-text-secondary">
            共 {total} 条记录
          </span>
        </div>
      </Card>

      {recordViewMode === 'by-user' && (
        <Card bordered>
          <div className="flex flex-wrap items-center gap-3">
            <Input
              placeholder="快速搜索用户名..."
              value={userSearchKeyword}
              onChange={v => setUserSearchKeyword(v)}
              clearable
              className="ap-w-240"
            />
            <Select
              value={userSortMode}
              onChange={v => setUserSortMode(v as 'count_desc' | 'count_asc' | 'name_asc' | 'name_desc')}
              className="ap-w-200"
              options={[
                { label: '按发送量（高到低）', value: 'count_desc' },
                { label: '按发送量（低到高）', value: 'count_asc' },
                { label: '按用户名（A-Z）', value: 'name_asc' },
                { label: '按用户名（Z-A）', value: 'name_desc' },
              ]}
            />
            <span className="text-sm ml-auto ap-text-secondary">
              匹配到 {recordsByUser.length} 位用户
            </span>
          </div>
        </Card>
      )}

      {/* 记录列表 */}
      <Card bordered>
        {(recordsLoading || allLoading) ? (
          <div className="flex justify-center py-8"><Loading /></div>
        ) : (recordViewMode !== 'list' ? (allRecords.length > 0 || records.length > 0) : records.length > 0) ? (
          recordViewMode === 'list' ? (
            /* ---- 时间流视图 ---- */
            <div className="space-y-2">
              {records.map(record => (
                <div
                  key={record.id}
                  className={`flex gap-3 p-3 rounded-lg ${record.is_mentioned ? 'ap-record-mentioned' : 'ap-record-normal'}`}
                >
                  <div className="flex-shrink-0">
                    <div className={`w-8 h-8 rounded-full flex items-center justify-center text-white text-xs font-bold ${avatarColorClass(record.sender_name)}`}>
                      {record.sender_name.charAt(0)}
                    </div>
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="text-sm font-medium">{record.sender_name}</span>
                      {record.group_name && (
                        <Tag size="small" variant="outline">{record.group_name}</Tag>
                      )}
                      {record.is_mentioned && (
                        <Tag size="small" theme="primary">@我</Tag>
                      )}
                      <span className="text-xs ml-auto ap-text-secondary">
                        {formatDate(record.timestamp)}
                      </span>
                    </div>
                    <div className="text-sm ap-text-primary">
                      {cleanMessageContent(record.content)}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          ) : recordViewMode === 'by-user' ? (
            /* ---- 按用户分组视图 ---- */
            <div className="space-y-3">
              {recordsByUser.map(group => (
                <div key={group.sender_name} className="rounded-lg overflow-hidden ap-border">
                  {/* 用户行（点击展开/折叠） */}
                  <div
                    className="flex items-center gap-3 px-4 py-3 cursor-pointer select-none ap-user-group-header"
                    onClick={() => toggleUser(group.sender_name)}
                  >
                    <div
                      className={`w-9 h-9 rounded-full flex items-center justify-center text-white text-sm font-bold flex-shrink-0 ${avatarColorClass(group.sender_name)}`}
                    >
                      {group.sender_name.charAt(0)}
                    </div>
                    <div className="flex-1 min-w-0">
                      <span className="font-medium text-sm">{group.sender_name}</span>
                      {group.records[0]?.group_name && (
                        <span className="ml-2 text-xs ap-text-secondary">
                          {group.records[0].group_name}
                        </span>
                      )}
                    </div>
                    <Tag size="small" theme="primary" variant="light">{group.count} 条</Tag>
                    <span className="text-xs ap-text-placeholder">
                      {expandedUsers.has(group.sender_name) ? '▲' : '▼'}
                    </span>
                  </div>
                  {/* 展开的消息列表 */}
                  {expandedUsers.has(group.sender_name) && (
                    <div className="divide-y ap-border-top">
                      {group.records.map(record => (
                        <div
                          key={record.id}
                          className={`flex gap-3 px-4 py-3 ${record.is_mentioned ? 'ap-record-mentioned-bg' : 'ap-record-normal-bg'}`}
                        >
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 mb-1">
                              {record.is_mentioned && <Tag size="small" theme="primary">@我</Tag>}
                              <span className="text-xs ml-auto ap-text-secondary">
                                {formatDate(record.timestamp)}
                              </span>
                            </div>
                            <div className="text-sm ap-text-primary">
                              {cleanMessageContent(record.content)}
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </div>
          ) : recordViewMode === 'by-group' ? (
            /* ---- 按群组分组视图（按真实群名分类） ---- */
            <div className="flex gap-4 ap-group-view">
              {/* 左侧群列表 */}
              <div className="w-64 flex-shrink-0 space-y-1 overflow-y-auto ap-scroll-600">
                {allLoading ? (
                  <div className="flex items-center justify-center py-8"><Loading /></div>
                ) : recordsByGroup.length === 0 ? (
                  <Empty description={allRecords.length > 0 ? '当前筛选条件下无群组' : '请等待数据加载...'} />
                ) : recordsByGroup.map(group => (
                  <div
                    key={group.group_name}
                    className={`flex items-center gap-2 px-3 py-2.5 rounded-lg cursor-pointer transition-colors ${selectedGroupName === group.group_name ? 'ap-group-item-selected' : 'ap-group-item-normal'}`}
                    onClick={() => setSelectedGroupName(group.group_name)}
                  >
                    <div className={`w-8 h-8 rounded-full flex items-center justify-center text-white text-xs font-bold flex-shrink-0 ${avatarColorClass(group.group_name)}`}>
                      {group.group_name.charAt(0)}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-medium truncate">{group.group_name}</div>
                    </div>
                    <Badge count={group.count} shape="round" size="small" />
                  </div>
                ))}
              </div>
              {/* 右侧消息列表 */}
              <div className="flex-1 space-y-2 overflow-y-auto ap-scroll-600">
                {selectedGroupName ? (
                  (recordsByGroup.find(g => g.group_name === selectedGroupName)?.records || [])
                    .sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime())
                    .map(record => (
                      <div key={record.id} className={`flex gap-3 p-3 rounded-lg ${record.is_mentioned ? 'ap-record-mentioned' : 'ap-record-normal'}`}>
                        <div className="flex-shrink-0">
                          <div className={`w-8 h-8 rounded-full flex items-center justify-center text-white text-xs font-bold ${avatarColorClass(record.sender_name)}`}>
                            {record.sender_name.charAt(0)}
                          </div>
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-1">
                            <span className="text-sm font-medium">{record.sender_name}</span>
                            {record.is_mentioned && <Tag size="small" theme="primary">@我</Tag>}
                            <span className="text-xs ml-auto ap-text-secondary">
                              {formatDate(record.timestamp)}
                            </span>
                          </div>
                          <div className="text-sm ap-text-primary">{cleanMessageContent(record.content)}</div>
                        </div>
                      </div>
                    ))
                ) : (
                  <div className="flex items-center justify-center h-full">
                    <Empty description="请从左侧选择一个群组" />
                  </div>
                )}
              </div>
            </div>
          ) : null
        ) : (
          <div className="text-center py-8">
            <Empty description="暂无聊天记录" action={
              <Button icon={<UploadIcon />} theme="primary" onClick={openImportDialog}>
                导入聊天记录
              </Button>
            } />
          </div>
        )}
        {/* 分页（仅时间流视图显示） */}
        {recordViewMode === 'list' && total > pageSize && (
          <div className="flex justify-between items-center pt-4 mt-4 ap-border-top">
            <span className="text-xs ap-text-secondary">
              共 {total} 条记录，第 {page}/{Math.ceil(total / pageSize)} 页
            </span>
            <Space>
              <Button
                size="small"
                variant="outline"
                disabled={page <= 1}
                onClick={() => fetchRecords({ sourceId: selectedSource || undefined, keyword: keyword || undefined, startDate: dateRange?.[0], endDate: dateRange?.[1], page: page - 1, pageSize })}
              >
                上一页
              </Button>
              <span className="text-sm px-2">{page} / {Math.ceil(total / pageSize)}</span>
              <Button
                size="small"
                variant="outline"
                disabled={page >= Math.ceil(total / pageSize)}
                onClick={() => fetchRecords({ sourceId: selectedSource || undefined, keyword: keyword || undefined, startDate: dateRange?.[0], endDate: dateRange?.[1], page: page + 1, pageSize })}
              >
                下一页
              </Button>
              <Select
                size="small"
                value={String(pageSize)}
                onChange={v => {
                  fetchRecords({ sourceId: selectedSource || undefined, keyword: keyword || undefined, startDate: dateRange?.[0], endDate: dateRange?.[1], page: 1, pageSize: Number(v) });
                }}
                className="ap-w-100"
                options={[
                  { label: '20条/页', value: '20' },
                  { label: '50条/页', value: '50' },
                  { label: '100条/页', value: '100' },
                ]}
              />
            </Space>
          </div>
        )}
      </Card>
    </div>
  );

  // ============= 分析报告 =============
  const renderReports = () => (
    <div className="p-6 space-y-4">
      {/* 操作栏 */}
      <Card bordered>
        <div className="flex items-center gap-3">
          <DatePicker
            value={analysisDate}
            format="YYYY-MM-DD"
            onChange={v => setAnalysisDate(v ? dayjs(v as Date).format('YYYY-MM-DD') : '')}
            className="ap-w-180"
          />
          <Button
            icon={<PlayCircleIcon />}
            theme="primary"
            loading={analyzing}
            onClick={handleRunAnalysis}
          >
            分析 {analysisDate} 的聊天
          </Button>
          <span className="text-sm ap-text-secondary">
            使用 AI 分析指定日期的聊天记录，自动生成工作日报
          </span>
        </div>
        {analyzing && analysisStream && (
          <div className="mt-4 p-3 rounded-lg ap-bg-component">
            <div className="text-xs mb-2 ap-text-secondary">AI 分析中...</div>
            <pre className="text-xs whitespace-pre-wrap max-h-40 overflow-auto ap-text-primary">
              {analysisStream}
            </pre>
          </div>
        )}
        {/* 未配置 AI Key 提示 */}
        <div className="mt-3 p-3 rounded-lg ap-warning-box">
          <div className="flex items-center gap-2">
            <ErrorCircleIcon size={18} className="ap-text-warning" />
            <span className="text-sm ap-text-primary">
              需要 AI API Key 才能生成分析报告。
            </span>
            <Button size="small" variant="text" onClick={() => setActiveTab('settings')}>
              前往设置配置 API Key
            </Button>
          </div>
          <div className="text-xs mt-1 ap-text-secondary">
            在「设置」页面配置 CodeBuddy API Key（推荐）或 Auth Token，用于调用大模型分析聊天记录
          </div>
        </div>
      </Card>

      {/* 报告列表 */}
      <div className="space-y-4">
        {reportsLoading ? (
          <div className="flex justify-center py-8"><Loading /></div>
        ) : reports.length > 0 ? (
          reports.map(report => (
            <Card key={report.id} bordered>
              <div className="flex items-start justify-between mb-3">
                <div className="flex items-center gap-2">
                  <CalendarIcon size={20} className="ap-text-brand" />
                  <h3 className="text-lg font-semibold">{report.report_date} 工作日报</h3>
                  <Tag size="small" variant="outline">{report.raw_chat_count} 条消息</Tag>
                </div>
                <div className="flex gap-2">
                  <Button size="small" variant="text" onClick={() => handleViewReport(report)}>查看详情</Button>
                  <Button size="small" variant="text" theme="danger" icon={<DeleteIcon />} onClick={() => deleteReport(report.id)}>删除</Button>
                </div>
              </div>

              <div className="text-sm mb-3 ap-text-primary">
                {report.summary}
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                {report.work_priorities?.length > 0 && (
                  <div className="p-3 rounded-lg ap-bg-brand-light">
                    <div className="text-xs font-medium mb-2 ap-text-brand">重点工作</div>
                    {report.work_priorities.map((p, i) => (
                      <div key={i} className="text-xs mb-1">• {p}</div>
                    ))}
                  </div>
                )}
                {report.completed_tasks?.length > 0 && (
                  <div className="p-3 rounded-lg ap-bg-success-light">
                    <div className="text-xs font-medium mb-2 ap-text-success">已完成</div>
                    {report.completed_tasks.map((t, i) => (
                      <div key={i} className="text-xs mb-1">• {t.task} {t.group && <Tag size="small" variant="outline">{t.group}</Tag>}</div>
                    ))}
                  </div>
                )}
                {report.pending_tasks?.length > 0 && (
                  <div className="p-3 rounded-lg ap-bg-warning-light">
                    <div className="text-xs font-medium mb-2 ap-text-warning">待跟进</div>
                    {report.pending_tasks.map((t, i) => (
                      <div key={i} className="text-xs mb-1">• {t.task} <Tag size="small" variant="outline">{t.priority}</Tag> {t.group && <Tag size="small" variant="light">{t.group}</Tag>}</div>
                    ))}
                  </div>
                )}
              </div>

              {/* 群组讨论摘要 */}
              {report.group_summaries && report.group_summaries.length > 0 && (
                <div className="mt-3">
                  <div className="text-xs font-medium mb-2 ap-text-brand">📊 群组讨论摘要</div>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                    {report.group_summaries.map((g, i) => (
                      <div key={i} className="p-2 rounded-lg ap-bg-component text-xs">
                        <div className="flex items-center gap-1 mb-1">
                          <Tag size="small" theme="primary" variant="light">{g.group}</Tag>
                          {g.active_members && <span className="ap-text-secondary">{g.active_members.length} 人参与</span>}
                        </div>
                        <div className="ap-text-primary">{g.summary}</div>
                        {g.key_topics && g.key_topics.length > 0 && (
                          <div className="flex gap-1 mt-1 flex-wrap">
                            {g.key_topics.map((t, j) => <Tag key={j} size="small" variant="outline">{t}</Tag>)}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* 人员活动摘要 */}
              {report.sender_activities && report.sender_activities.length > 0 && (
                <div className="mt-3">
                  <div className="text-xs font-medium mb-2 ap-text-success">👤 人员活动摘要</div>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                    {report.sender_activities.map((s, i) => (
                      <div key={i} className="p-2 rounded-lg ap-bg-component text-xs">
                        <div className="font-medium">{s.sender}</div>
                        {s.groups && <div className="ap-text-secondary">参与群组: {s.groups.join('、')}</div>}
                        {s.main_activities && s.main_activities.map((a, j) => <div key={j}>• {a}</div>)}
                        {s.todo_items && s.todo_items.length > 0 && (
                          <div className="mt-1 ap-text-warning">待办: {s.todo_items.join('、')}</div>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </Card>
          ))
        ) : (
          <div className="text-center py-8">
            <Empty description="暂无分析报告" />
          </div>
        )}
      </div>
    </div>
  );

  // ============= 数据源 & 定时任务设置 =============
  const renderSettings = () => (
    <div className="p-6 space-y-6">
      {/* 需求1: 99U 账号自动配置 */}
      <Card title="99U 账号配置" bordered actions={
        <Space>
          {u9Status?.configured ? (
            <Tag theme="success" variant="light">已配置 ({u9Status.conversationsCount} 个会话)</Tag>
          ) : (
            <Tag theme="warning" variant="light">未配置</Tag>
          )}
          {u9Status?.configured && (
            <Button icon={<RefreshIcon />} theme="default" variant="outline" onClick={async () => {
              MessagePlugin.loading('正在从 99U 获取群组和好友列表...');
              const result = await refreshConversations();
              MessagePlugin.closeAll();
              if (result.success) {
                if (result.newCount > 0) {
                  MessagePlugin.success(`刷新完成！新增 ${result.newCount} 个会话（群组 ${result.groupsFromApi} 个，好友 ${result.friendsFromApi} 个），总计 ${result.currentCount} 个`);
                } else {
                  MessagePlugin.info(`会话列表已是最新（${result.currentCount} 个），无新增会话`);
                }
                fetchU9Status();
              } else {
                MessagePlugin.error(result.error || '刷新失败');
              }
            }}>
              刷新会话列表
            </Button>
          )}
          <Button theme="primary" onClick={() => setSetupDialogVisible(true)}>
            {u9Status?.configured ? '重新配置' : '自动配置'}
          </Button>
        </Space>
      }>
        <div className="space-y-3">
          <Alert theme="info" message="输入工号和密码，工具会自动登录 ndim.101.com 获取所有认证信息和会话列表。其他同事拿到工具后只需完成此步骤即可使用。" />
          {u9Status?.configured && (
            <div className="grid grid-cols-2 gap-4 text-sm">
              <div><span className="ap-text-secondary">AUTH_ID: </span><Tag size="small" variant="outline">{u9Status.hasAuthId ? '已配置' : '未配置'}</Tag></div>
              <div><span className="ap-text-secondary">AUTH_KEY: </span><Tag size="small" variant="outline">{u9Status.hasAuthKey ? '已配置' : '未配置'}</Tag></div>
              <div><span className="ap-text-secondary">APP_ID: </span><Tag size="small" variant="outline">{u9Status.hasAppId ? '已配置' : '未配置'}</Tag></div>
              <div><span className="ap-text-secondary">会话数: </span><Tag size="small" theme="primary" variant="light">{u9Status.conversationsCount}</Tag></div>
            </div>
          )}
        </div>
      </Card>

      {/* IM 数据源管理 */}
      <Card title="IM 数据源" bordered actions={
        <Space>
          {u9Status?.configured && (
            <Button icon={<CloudDownloadIcon />} theme="default" onClick={async () => {
              const u9Source = sources.find(s => s.type === '99u_web' || s.type === '99u');
              if (u9Source) {
                setU9ImportSourceId(u9Source.id);
              }
              const apiConvs = await fetchU9Conversations();
              setU9ConversationsFromApi(apiConvs);
              if (apiConvs.length > 0 && !u9ConvId) {
                setU9ConvId(apiConvs[0].id);
              }
              setU9DialogVisible(true);
            }}>从 99U 拉取</Button>
          )}
          <Button icon={<FileIcon />} theme="default" onClick={openLocalDbDialog}>读取本地数据库</Button>
          <Button icon={<AddIcon />} theme="primary" onClick={() => {
            setNewSource({ name: '', type: 'wechat_work' });
            setSourceDialogVisible(true);
          }}>添加数据源</Button>
        </Space>
      }>
        {sources.length > 0 ? (
          <Table
            data={sources}
            columns={[
              { colKey: 'name', title: '名称', width: 160 },
              {
                colKey: 'type', title: '类型', width: 100, cell: ({ row }) => {
                  const option = IM_TYPE_OPTIONS.find(o => o.value === row.type);
                  return option?.label || row.type;
                }
              },
              {
                colKey: 'enabled', title: '状态', width: 80, cell: ({ row }) => (
                  <Tag theme={row.enabled ? 'success' : 'default'} variant="light">
                    {row.enabled ? '启用' : '停用'}
                  </Tag>
                )
              },
              { colKey: 'last_sync_at', title: '最后同步', width: 160, cell: ({ row }) => row.last_sync_at ? formatDate(row.last_sync_at) : '-' },
              {
                colKey: 'operations', title: '操作', cell: ({ row }) => (
                  <Space>
                    <Button size="small" variant="text" onClick={() => {
                      setSelectedSource(row.id);
                      openImportDialog();
                    }}>导入</Button>
                    {row.type === '99u' && u9Status?.configured && (
                      <Button size="small" variant="text" theme="primary" onClick={() => {
                        setU9ImportSourceId(row.id);
                        setU9DialogVisible(true);
                      }}>API 拉取</Button>
                    )}
                    <Button size="small" variant="text" theme="danger" icon={<DeleteIcon />} onClick={() => deleteSource(row.id)}>删除</Button>
                  </Space>
                )
              },
            ]}
            rowKey="id"
            size="small"
            bordered
          />
        ) : (
          <Empty description="暂无数据源" />
        )}

        {/* JSON 导入格式说明 */}
        <div className="mt-4 p-4 rounded-lg ap-bg-component">
          <div className="text-sm font-medium mb-2">导入格式说明（JSON）</div>
          <pre className="text-xs overflow-auto ap-text-secondary ap-max-h-120">
            {`[
  {
    "sender_name": "张三",
    "group_name": "项目组",
    "content": "明天下午3点开会讨论方案",
    "timestamp": "2026-03-20T14:30:00",
    "is_mentioned": true
  }
]`}
          </pre>
        </div>
      </Card>

      {/* 定时任务管理 */}
      <Card title="定时分析任务" bordered actions={
        <Button icon={<AddIcon />} theme="primary" onClick={() => setScheduleDialogVisible(true)}>添加任务</Button>
      }>
        {tasks.length > 0 ? (
          <Table
            data={tasks}
            columns={[
              { colKey: 'name', title: '任务名称', width: 200 },
              { colKey: 'cron_expression', title: 'Cron 表达式', width: 140 },
              {
                colKey: 'enabled', title: '状态', width: 80, cell: ({ row }) => (
                  <Tag theme={row.enabled ? 'success' : 'default'} variant="light">
                    {row.enabled ? '运行中' : '已暂停'}
                  </Tag>
                )
              },
              { colKey: 'last_run_at', title: '上次运行', width: 160, cell: ({ row }) => row.last_run_at ? formatDate(row.last_run_at) : '-' },
              {
                colKey: 'last_status', title: '状态', width: 80, cell: ({ row }) => (
                  row.last_status === 'success' ? (
                    <CheckCircleIcon size={18} className="ap-text-success" />
                  ) : row.last_status === 'error' ? (
                    <ErrorCircleIcon size={18} className="ap-text-danger" />
                  ) : (
                    <span className="ap-text-secondary">-</span>
                  )
                )
              },
              {
                colKey: 'operations', title: '操作', cell: ({ row }) => (
                  <Space>
                    <Button size="small" variant="text" icon={<PlayCircleIcon />} onClick={() => { runTask(row.id); MessagePlugin.info('任务已触发'); }}>执行</Button>
                    <Button size="small" variant="text" onClick={() => updateTask(row.id, { enabled: !row.enabled })}>
                      {row.enabled ? '暂停' : '启用'}
                    </Button>
                    <Button size="small" variant="text" theme="danger" icon={<DeleteIcon />} onClick={() => deleteTask(row.id)}>删除</Button>
                  </Space>
                )
              },
            ]}
            rowKey="id"
            size="small"
            bordered
          />
        ) : (
          <Empty description="暂无定时任务" />
        )}
      </Card>
    </div>
  );

  // 打开本地数据库对话框
  const openLocalDbDialog = async () => {
    setLocalDbStep('connect');
    setLocalDbSourceId('');
    setLocalDbDialogVisible(true);
  };

  // 连接本地数据库
  const handleLocalDbConnect = async () => {
    if (!localDbEmployeeId.trim()) {
      MessagePlugin.warning('请输入工号');
      return;
    }
    const result = await connectLocalDb(localDbEmployeeId, localDbBasePath);
    if (result.success) {
      await fetchLocalConversations(localDbEmployeeId, localDbBasePath);
      setLocalDbStep('import');
      MessagePlugin.success('本地数据库连接成功');
    } else {
      MessagePlugin.error(result.message || '连接失败');
    }
  };

  // 本地数据库快速创建数据源并导入
  const handleLocalDbQuickCreate = async () => {
    if (!newSource.name) {
      MessagePlugin.warning('请输入数据源名称');
      return;
    }
    const result = await createSource({ ...newSource, type: 'custom' });
    if (result.source) {
      setLocalDbSourceId(result.source.id);
      setNewSource({ name: '', type: 'wechat_work' });
      MessagePlugin.success('数据源创建成功');
    }
  };

  // 执行本地数据库导入
  const handleLocalDbImport = async () => {
    if (!localDbSourceId) {
      MessagePlugin.warning('请选择目标数据源');
      return;
    }
    if (!localDbEmployeeId.trim()) {
      MessagePlugin.warning('请输入工号');
      return;
    }
    const result = await importLocalDb(localDbEmployeeId, localDbSourceId, localDbBasePath);
    if (result.success) {
      MessagePlugin.success(`成功导入 ${result.imported} 条记录${result.skipped > 0 ? `（跳过 ${result.skipped} 条重复）` : ''}`);
      setLocalDbDialogVisible(false);
      setSelectedSource(localDbSourceId);
      fetchRecords({ sourceId: localDbSourceId, page: 1, pageSize });
      fetchStats();
      fetchTodayRecords();
      setActiveTab('records');
    } else {
      MessagePlugin.error(result.error || '导入失败');
    }
  };

  // ================================================================
  // ============= 返回 JSX =============
  // ================================================================

  return (
    <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
      {/* 顶部快速操作栏 */}
      <div
        className="px-6 py-3 flex items-center justify-between flex-shrink-0 ap-topbar"
      >
        <Space>
          <Button
            icon={<CloudDownloadIcon />}
            theme="primary"
            onClick={() => setFetchTodayDialogVisible(true)}
            size="small"
            loading={fetchTodayStatus.running}
          >
            获取当天聊天记录
          </Button>
          <Button
            icon={<UploadIcon />}
            onClick={openImportDialog}
            size="small"
          >
            导入聊天记录
          </Button>
        </Space>
        <span className="text-xs ap-text-placeholder">
          数据源: {sources.length} 个 | 聊天记录: {total} 条 | 分析报告: {reports.length} 份
        </span>
      </div>

      <Tabs
        value={activeTab}
        onChange={v => setActiveTab(v as string)}
        className="ap-tabs-bg"
        list={[
          { value: 'dashboard', label: <span>📊 工作台</span> },
          { value: 'records', label: <span>💬 聊天记录</span> },
          {
            value: 'reports', label: (
              <Badge count={reports.length} shape="round" size="small">
                <span>📋 分析报告</span>
              </Badge>
            )
          },
          { value: 'settings', label: <span>⚙️ 设置</span> },
        ]}
      />

      <div className="flex-1 overflow-y-auto">
        {activeTab === 'dashboard' && renderDashboard()}
        {activeTab === 'records' && renderRecords()}
        {activeTab === 'reports' && renderReports()}
        {activeTab === 'settings' && renderSettings()}
      </div>

      {/* ============= 导入聊天记录对话框（重新设计） ============= */}
      {importDialogVisible && <Dialog
        header="导入聊天记录"
        visible={importDialogVisible}
        onClose={() => { setImportDialogVisible(false); setImportStep('choose'); }}
        footer={importStep === 'input' ? (
          <>
            <Button key="cancel" variant="outline" onClick={() => setImportDialogVisible(false)}>取消</Button>
            <Button key="confirm" theme="primary" onClick={handleImport}>确认导入</Button>
          </>
        ) : (
          <Button key="cancel" variant="outline" onClick={() => setImportDialogVisible(false)}>取消</Button>
        )}
        width="640px"
      >
        {/* 步骤一：选择/创建数据源 */}
        {importStep === 'choose' && (
          <div className="space-y-4">
            <Alert theme="info" message="需要先选择一个数据源来存放导入的聊天记录" />

            {sources.length > 0 && (
              <div>
                <div className="text-sm font-medium mb-2">选择已有数据源：</div>
                <div className="ap-w-full">
                  {sources.map(s => (
                    <div
                      key={s.id}
                      className="flex items-center gap-3 p-3 rounded-lg cursor-pointer ap-source-item-interactive"
                      onClick={() => {
                        setImportSourceId(s.id);
                        setImportStep('input');
                      }}
                    >
                      <BrowseIcon size={20} className="ap-text-brand" />
                      <div className="flex-1">
                        <div className="text-sm font-medium">{s.name}</div>
                        <div className="text-xs ap-text-secondary">
                          {IM_TYPE_OPTIONS.find(o => o.value === s.type)?.label || s.type}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <Divider>或创建新数据源</Divider>

            <div className="ap-create-source-row">
              <Input
                placeholder="数据源名称（如：企业微信-工作群）"
                value={newSource.name}
                onChange={v => setNewSource(prev => ({ ...prev, name: v }))}
                className="ap-w-300"
              />
              <Select
                value={newSource.type}
                onChange={v => setNewSource(prev => ({ ...prev, type: String(v) }))}
                options={IM_TYPE_OPTIONS}
                className="ap-w-140"
              />
              <Button theme="primary" onClick={handleQuickCreateAndImport}>创建并导入</Button>
            </div>
          </div>
        )}

        {/* 步骤二：输入/上传数据 */}
        {importStep === 'input' && (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div className="text-sm">
                数据源：<Tag size="small" theme="primary">{sources.find(s => s.id === importSourceId)?.name || importSourceId}</Tag>
              </div>
              <Button variant="text" size="small" onClick={() => setImportStep('choose')}>
                切换数据源
              </Button>
            </div>

            {/* 文件上传区域 */}
            <div
              className="border-2 border-dashed rounded-lg p-6 text-center cursor-pointer ap-upload-zone-interactive"
              onClick={() => fileInputRef.current?.click()}
            >
              <UploadIcon size={32} className="ap-text-placeholder" />
              <div className="text-sm mt-2 ap-text-secondary">
                点击选择 JSON 文件上传
              </div>
              <div className="text-xs mt-1 ap-text-placeholder">
                支持 .json 格式
              </div>
            </div>
            <input
              ref={fileInputRef}
              type="file"
              accept=".json"
              className="ap-file-input-hidden"
              onChange={handleFileChange}
              title="选择 JSON 文件"
            />

            <Divider>或直接粘贴</Divider>

            <Textarea
              placeholder={'粘贴 JSON 数组，格式如：\n[\n  {"sender_name": "张三", "content": "消息内容", "timestamp": "2026-03-20T14:30:00"}\n]'}
              value={importText}
              onChange={v => setImportText(v)}
            />

            {importText && (
              <Alert theme="success" message={`已准备 ${(() => { try { return JSON.parse(importText).length; } catch { return '?'; } })()} 条记录`} />
            )}
          </div>
        )}
      </Dialog>}

      {/* ============= 99U API 导入对话框 ============= */}
      {u9DialogVisible && (
        <Dialog
          header="从 99U API 拉取聊天记录"
          visible={u9DialogVisible}
          onClose={() => setU9DialogVisible(false)}
          footer={
            <>
              <Button key="cancel" variant="outline" onClick={() => setU9DialogVisible(false)}>
                取消
              </Button>
              <Button
                key="import"
                theme="primary"
                icon={<CloudDownloadIcon />}
                loading={u9Importing}
                disabled={u9Importing || !u9ConvId.trim() || !u9ImportSourceId}
                onClick={handleU9Import}
              >
                {u9Importing ? '拉取中...' : '开始拉取'}
              </Button>
            </>
          }
          width="600px"
        >
          <div className="space-y-4">
            {/* API 配置状态 */}
            {!u9Status?.configured && (
              <Alert
                theme="warning"
                message={
                  <div>
                    <div>99U API 未完全配置。请在项目根目录 <code>.env</code> 文件中设置以下 3 项：</div>
                    <pre className="mt-2 text-xs ap-text-primary">
                      {`U9_API_AUTH_ID=MAC id="..." 中的长十六进制字符串
U9_API_AUTH_KEY=MAC 签名密钥（HMAC-SHA256 的密钥）
U9_SDP_APP_ID=sdp-app-id 请求头的值（UUID格式）`}
                    </pre>
                    <div className="mt-2 text-xs ap-text-secondary">
                      获取方式：打开 ndim.101.com → F12 → Network → 找任意 API 请求 → 查看请求头中的 Authorization 和 sdp-app-id
                    </div>
                    {u9Status && (
                      <div className="mt-2 text-xs">
                        当前状态：{u9Status.hasAuthId ? '✅ AUTH_ID' : '❌ AUTH_ID'} ·
                        {u9Status.hasAuthKey ? '✅ AUTH_KEY' : '❌ AUTH_KEY'} ·
                        {u9Status.hasAppId ? '✅ SDP_APP_ID' : '❌ SDP_APP_ID'}
                      </div>
                    )}
                  </div>
                }
              />
            )}

            {u9Status?.configured && (
              <Alert
                theme="success"
                message={`99U API 已配置 ✅ · 已配置 ${u9Status.conversationsCount} 个会话`}
              />
            )}

            {/* 选择数据源 */}
            <div>
              <div className="text-sm font-medium mb-2">目标数据源</div>
              {sources.filter(s => s.type === '99u_web' || s.type === '99u').length > 0 ? (
                <Select
                  value={u9ImportSourceId || undefined}
                  onChange={async v => {
                    const newSourceId = v as string;
                    setU9ImportSourceId(newSourceId);
                    setU9ConvId('');
                    if (newSourceId) {
                      try {
                        // 实时刷新 99U 会话列表
                        const apiConvs = await fetchU9Conversations();
                        setU9ConversationsFromApi(apiConvs);
                      } catch (err) {
                        console.error('获取会话列表失败:', err);
                      }
                    }
                  }}
                  placeholder="选择 99uWEB 数据源"
                  className="ap-w-full"
                  options={sources
                    .filter(s => s.type === '99u_web' || s.type === '99u')
                    .map(s => ({ label: s.name || s.id, value: s.id }))}
                />
              ) : (
                <div className="space-y-2">
                  <div className="text-xs ap-text-placeholder">
                    暂无 99uWEB 数据源，请先在设置中创建
                  </div>
                </div>
              )}
            </div>

            {/* 会话 ID */}
            <div>
              <div className="text-sm font-medium mb-2 flex items-center gap-2">
                会话 ID (convId)
              </div>
              {u9ImportSourceId ? (
                <Select
                  value={u9ConvId || undefined}
                  onChange={v => setU9ConvId((v as string) || '')}
                  placeholder="选择会话"
                  className="ap-w-full"
                  filterable
                  clearable
                  options={[
                    { label: '全部会话', value: '__all__' },
                    ...(u9ConversationsFromApi || []).map(c => ({
                      label: c.name ? `${c.name} (${c.id})` : `会话 ${String(c.id).slice(-6)}... (${c.id})`,
                      value: c.id,
                    }))
                  ]}
                />
              ) : (
                <Input
                  value={u9ConvId}
                  onChange={v => setU9ConvId(v)}
                  placeholder="请先选择数据源"
                  disabled
                />
              )}
            </div>

            {/* 日期范围 */}
            <div>
              <div className="text-sm font-medium mb-2 flex items-center gap-2">
                拉取日期范围（可选）
                <span className="text-xs ap-text-placeholder">
                  不选择则拉取全部历史消息
                </span>
              </div>
              <DateRangePicker
                value={u9ImportDateRange || []}
                format="YYYY-MM-DD"
                onChange={(v) => {
                  if (v && Array.isArray(v) && v[0] && v[1]) {
                    const formatDate = (d: Date) => dayjs(d).format('YYYY-MM-DD');
                    setU9ImportDateRange([
                      v && v[0] ? dayjs(v[0] as Date).format('YYYY-MM-DD') : '',
                      v && v[1] ? dayjs(v[1] as Date).format('YYYY-MM-DD') : ''
                    ]);
                  } else {
                    setU9ImportDateRange(null);
                  }
                }}
                className="ap-w-280"
              />
            </div>

            {/* 高级选项 */}
            <Collapse>
              <Collapse.Panel header="高级选项">
                <div className="space-y-3">
                  <div>
                    <div className="text-xs mb-1 ap-text-secondary">
                      关键词筛选（可选，留空获取全部消息）
                    </div>
                    <Input
                      value={u9Keyword}
                      onChange={v => setU9Keyword(v)}
                      placeholder="输入关键词筛选消息"
                    />
                  </div>
                  <div>
                    <div className="text-xs mb-1 ap-text-secondary">
                      最大消息数
                    </div>
                    <Input
                      value={String(u9MaxMessages)}
                      onChange={v => setU9MaxMessages(Number(v) || 10000)}
                      placeholder="10000"
                    />
                  </div>
                </div>
              </Collapse.Panel>
            </Collapse>

            {/* 导入进度 */}
            {u9ImportProgress && (
              <Alert
                theme={u9Importing ? 'info' : u9ImportProgress.startsWith('成功') ? 'success' : 'error'}
                message={u9ImportProgress}
              />
            )}
          </div>
        </Dialog>
      )}

      <Dialog
        header="添加 IM 数据源"
        visible={sourceDialogVisible}
        onClose={() => setSourceDialogVisible(false)}
        onConfirm={handleCreateSource}
        confirmBtn="创建"
      >
        <div className="space-y-4">
          <Input label="名称" placeholder="例如：企业微信-工作群" value={newSource.name} onChange={v => setNewSource(prev => ({ ...prev, name: v }))} />
          <Select label="IM 类型" value={newSource.type} onChange={v => setNewSource(prev => ({ ...prev, type: String(v) }))} options={IM_TYPE_OPTIONS} />
        </div>
      </Dialog>

      {/* 报告详情对话框 */}
      <Dialog
        header={selectedReport ? `${selectedReport.report_date} 工作日报详情` : '报告详情'}
        visible={reportDialogVisible}
        onClose={() => setReportDialogVisible(false)}
        width="720px"
        footer={null}
      >
        {selectedReport && (
          <div className="space-y-4">
            <div>
              <h4 className="text-sm font-medium mb-2 ap-text-brand">工作概要</h4>
              <p className="text-sm">{selectedReport.summary}</p>
            </div>

            {selectedReport.work_priorities?.length > 0 && (
              <div>
                <h4 className="text-sm font-medium mb-2">🎯 重点工作</h4>
                <ul className="list-disc pl-5 text-sm space-y-1">
                  {selectedReport.work_priorities.map((p, i) => <li key={i}>{p}</li>)}
                </ul>
              </div>
            )}

            {selectedReport.completed_tasks?.length > 0 && (
              <div>
                <h4 className="text-sm font-medium mb-2 ap-text-success">✅ 已完成任务</h4>
                {selectedReport.completed_tasks.map((t, i) => (
                  <div key={i} className="ml-4 text-sm mb-1">
                    <span className="font-medium">{t.task}</span>
                    {t.detail && <span className="ml-2 ap-text-secondary">- {t.detail}</span>}
                  </div>
                ))}
              </div>
            )}

            {selectedReport.pending_tasks?.length > 0 && (
              <div>
                <h4 className="text-sm font-medium mb-2 ap-text-warning">⏳ 待跟进事项</h4>
                {selectedReport.pending_tasks.map((t, i) => (
                  <div key={i} className="ml-4 text-sm mb-1 flex items-center gap-2">
                    <span>{t.task}</span>
                    <Tag size="small" theme={t.priority === '高' ? 'danger' : t.priority === '中' ? 'warning' : 'default'} variant="light">
                      {t.priority}
                    </Tag>
                    {t.deadline && <span className="text-xs ap-text-secondary">截止 {t.deadline}</span>}
                  </div>
                ))}
              </div>
            )}

            {selectedReport.key_decisions?.length > 0 && (
              <div>
                <h4 className="text-sm font-medium mb-2">🔑 关键决策</h4>
                {selectedReport.key_decisions.map((d, i) => (
                  <div key={i} className="ml-4 text-sm mb-2">
                    <div className="font-medium">{d.decision}</div>
                    <div className="text-xs ap-text-secondary">
                      参与者: {d.participants?.join(', ')} | 影响: {d.impact}
                    </div>
                  </div>
                ))}
              </div>
            )}

            {selectedReport.follow_ups?.length > 0 && (
              <div>
                <h4 className="text-sm font-medium mb-2">📢 需要跟进</h4>
                {selectedReport.follow_ups.map((f, i) => (
                  <div key={i} className="ml-4 text-sm mb-1">
                    <span>{f.item}</span>
                    <span className="ml-2 text-xs ap-text-secondary">
                      负责人: {f.person} {f.deadline ? `| 计划: ${f.deadline}` : ''}
                    </span>
                  </div>
                ))}
              </div>
            )}

            {selectedReport.meeting_notes?.length > 0 && (
              <div>
                <h4 className="text-sm font-medium mb-2">📝 会议记录</h4>
                {selectedReport.meeting_notes.map((m, i) => (
                  <div key={i} className="ml-4 text-sm mb-2 p-2 rounded ap-bg-component">
                    <div className="font-medium">{m.meeting}</div>
                    <div>主题: {m.topic}</div>
                    <div className="text-xs ap-text-secondary">结论: {m.outcome}</div>
                  </div>
                ))}
              </div>
            )}

            {/* 需求4: 群组摘要 */}
            {selectedReport.group_summaries && selectedReport.group_summaries.length > 0 && (
              <div>
                <h4 className="text-sm font-medium mb-2 ap-text-brand">📊 群组讨论摘要</h4>
                <div className="space-y-2">
                  {selectedReport.group_summaries.map((g, i) => (
                    <div key={i} className="p-3 rounded-lg ap-bg-component">
                      <div className="flex items-center gap-2 mb-1">
                        <Tag size="small" theme="primary" variant="light">{g.group}</Tag>
                        {g.active_members && <span className="text-xs ap-text-secondary">{g.active_members.length} 人参与</span>}
                      </div>
                      <div className="text-sm">{g.summary}</div>
                      {g.key_topics && g.key_topics.length > 0 && (
                        <div className="flex gap-1 mt-1 flex-wrap">
                          {g.key_topics.map((t, j) => <Tag key={j} size="small" variant="outline">{t}</Tag>)}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* 需求4: 人员活动 */}
            {selectedReport.sender_activities && selectedReport.sender_activities.length > 0 && (
              <div>
                <h4 className="text-sm font-medium mb-2 ap-text-success">👤 人员活动摘要</h4>
                <div className="space-y-2">
                  {selectedReport.sender_activities.map((s, i) => (
                    <div key={i} className="ml-4 text-sm mb-2">
                      <div className="font-medium">{s.sender}</div>
                      {s.groups && <div className="text-xs ap-text-secondary">参与群组: {s.groups.join('、')}</div>}
                      {s.main_activities && s.main_activities.map((a, j) => <div key={j} className="text-xs">• {a}</div>)}
                      {s.todo_items && s.todo_items.length > 0 && (
                        <div className="text-xs mt-1 ap-text-warning">待办: {s.todo_items.join('、')}</div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {selectedReport.statistics && (
              <div className="p-3 rounded text-xs ap-bg-component ap-text-secondary">
                统计: 共 {selectedReport.statistics.totalMessages} 条消息，{selectedReport.statistics.uniqueSenders} 位参与者
              </div>
            )}
          </div>
        )}
      </Dialog>

      {/* 本地数据库导入对话框 */}
      <Dialog
        header="从本地数据库读取聊天记录"
        visible={localDbDialogVisible}
        onClose={() => setLocalDbDialogVisible(false)}
        footer={null}
        width="560px"
      >
        <div className="space-y-5">
          {localDbStep === 'connect' ? (
            <>
              <Alert
                theme="info"
                message="将直接读取本地安装的 99U 客户端数据库文件，无需网络连接。"
              />
              <div>
                <div className="text-sm font-medium mb-2">数据库根路径</div>
                <Input
                  value={localDbBasePath}
                  onChange={v => setLocalDbBasePath(v)}
                  placeholder="D:/Program Files (x86)/Netdragon/imData/mulproplus/db/0.56/_@_prpl-91u-nd"
                />
                <div className="text-xs mt-1 ap-text-secondary">
                  默认路径：D:/Program Files (x86)/Netdragon/imData/mulproplus/db/0.56/_@_prpl-91u-nd
                </div>
              </div>
              <div>
                <div className="text-sm font-medium mb-2">工号 / 用户 ID</div>
                <Input
                  value={localDbEmployeeId}
                  onChange={v => setLocalDbEmployeeId(v)}
                  placeholder="例如：986916"
                />
                <div className="text-xs mt-1 ap-text-secondary">
                  对应数据库目录名称，例如 _986916@nd 中的 986916
                </div>
              </div>
              {localDbConnectResult && !localDbConnectResult.success && (
                <Alert theme="error" message={localDbConnectResult.message} />
              )}
              <div className="flex justify-end gap-2 pt-2">
                <Button variant="outline" onClick={() => setLocalDbDialogVisible(false)}>取消</Button>
                <Button
                  theme="primary"
                  loading={localDbConnecting}
                  onClick={handleLocalDbConnect}
                >
                  连接数据库
                </Button>
              </div>
            </>
          ) : (
            <>
              {localDbConnectResult?.success && localDbConnectResult.stats && (
                <Alert
                  theme="success"
                  message={`连接成功！发现 ${localDbConnectResult.stats.totalMessages} 条消息，${localDbConnectResult.stats.totalConversations} 个会话。`}
                />
              )}
              <div>
                <div className="text-sm font-medium mb-2">选择目标数据源</div>
                <Select
                  placeholder="选择或创建数据源"
                  value={localDbSourceId || undefined}
                  onChange={v => setLocalDbSourceId(String(v))}
                  className="ap-w-full"
                  options={sources.map(s => ({ label: s.name, value: s.id }))}
                />
              </div>
              {!localDbSourceId && (
                <div className="p-3 rounded ap-bg-component">
                  <div className="text-sm font-medium mb-2">快速创建新数据源</div>
                  <div className="flex gap-2">
                    <Input
                      value={newSource.name}
                      onChange={v => setNewSource(prev => ({ ...prev, name: v }))}
                      placeholder="数据源名称，例如：99U本地"
                      className="ap-flex-1"
                    />
                    <Button theme="primary" onClick={handleLocalDbQuickCreate}>创建</Button>
                  </div>
                </div>
              )}
              {localDbImportResult && (
                <Alert
                  theme="success"
                  message={`导入完成：新增 ${localDbImportResult.imported} 条，跳过 ${localDbImportResult.skipped} 条重复消息`}
                />
              )}
              <div className="flex justify-between pt-2">
                <Button variant="outline" onClick={() => setLocalDbStep('connect')}>返回</Button>
                <div className="flex gap-2">
                  <Button variant="outline" onClick={() => setLocalDbDialogVisible(false)}>取消</Button>
                  <Button
                    theme="primary"
                    loading={localDbImporting}
                    disabled={!localDbSourceId}
                    onClick={handleLocalDbImport}
                  >
                    开始导入
                  </Button>
                </div>
              </div>
            </>
          )}
        </div>
      </Dialog>

      {/* 创建定时任务对话框 */}
      <Dialog
        header="添加定时分析任务"
        visible={scheduleDialogVisible}
        onClose={() => setScheduleDialogVisible(false)}
        onConfirm={handleCreateTask}
        confirmBtn="创建"
      >
        <div className="space-y-4">
          <Input label="任务名称" placeholder="例如：每日工作分析" value={newTask.name} onChange={v => setNewTask(prev => ({ ...prev, name: v }))} />
          <Input label="Cron 表达式" placeholder="0 18 * * *" value={newTask.cron_expression} onChange={v => setNewTask(prev => ({ ...prev, cron_expression: v }))} />
          <div className="text-xs ap-text-secondary">
            常用示例：每天18:00 = "0 18 * * *" | 每天9:00 = "0 9 * * *" | 工作日17:30 = "30 17 * * 1-5"
          </div>
        </div>
      </Dialog>

      {/* ============= 需求1: 自动配置对话框 ============= */}
      <Dialog
        header="99U 自动配置"
        visible={setupDialogVisible}
        onClose={() => { if (!autoSetupStatus.running) { setSetupDialogVisible(false); } }}
        footer={null}
        width="560px"
      >
        <div className="space-y-4">
          {!autoSetupStatus.running && !autoSetupStatus.result && (
            <>
              <Alert theme="info" message="可直接启动浏览器扫码登录；也可填写工号和密码后自动登录。" />
              <div>
                <div className="text-sm font-medium mb-2">工号</div>
                <Input value={setupEmployeeId} onChange={v => setSetupEmployeeId(v)} placeholder="例如：986916@nd" />
              </div>
              <div>
                <div className="text-sm font-medium mb-2">密码</div>
                <Input type="password" value={setupPassword} onChange={v => setSetupPassword(v)} placeholder="99U 登录密码" />
              </div>
              <div className="flex justify-end gap-2">
                <Button variant="outline" onClick={() => setSetupDialogVisible(false)}>取消</Button>
                <Button theme="primary" onClick={() => startSetup(setupEmployeeId, setupPassword)}>
                  开始自动配置
                </Button>
              </div>
            </>
          )}

          {/* 短信验证码输入 */}
          {autoSetupStatus.smsRequired && (
            <div className="p-4 rounded-lg ap-sms-box">
              <div className="text-sm font-medium mb-2">需要短信验证码</div>
              <div className="flex gap-2">
                <Input value={smsCode} onChange={v => setSmsCode(v)} placeholder="输入验证码" className="ap-flex-1" />
                <Button theme="primary" onClick={() => { submitSmsCode(smsCode); setSmsCode(''); }} disabled={!smsCode}>提交</Button>
              </div>
            </div>
          )}

          {/* 日志输出 */}
          {autoSetupStatus.logs.length > 0 && (
            <div className="mt-4 p-3 rounded-lg ap-bg-component">
              <div className="text-xs mb-2 ap-text-secondary">配置日志</div>
              <pre className="text-xs whitespace-pre-wrap max-h-40 overflow-auto ap-text-primary">
                {autoSetupStatus.logs.join('\n')}
              </pre>
            </div>
          )}

          {/* 结果 */}
          {autoSetupStatus.result && (
            <div className="space-y-3">
              <Alert
                theme={autoSetupStatus.result.success ? 'success' : 'error'}
                message={autoSetupStatus.result.message || '未知状态'}
              />
              <div className="flex justify-end gap-2">
                <Button variant="outline" onClick={() => { setSetupDialogVisible(false); fetchU9Status(); }}>关闭</Button>
              </div>
            </div>
          )}
        </div>
      </Dialog>

      {/* ============= 需求2: 获取当天聊天记录对话框 ============= */}
      <Dialog
        header="获取当天聊天记录"
        visible={fetchTodayDialogVisible}
        onClose={() => { if (!fetchTodayStatus.running) { setFetchTodayDialogVisible(false); } }}
        footer={null}
        width="560px"
      >
        <div className="space-y-4">
          {!fetchTodayStatus.running && !fetchTodayStatus.result && (
            <>
              {!u9Status?.configured ? (
                <Alert theme="warning" message="请先在「设置」Tab 中完成 99U 自动配置" />
              ) : (
                <Alert theme="info" message={`将通过 99U API 获取今天（${dayjs().format('YYYY-MM-DD')}）所有 ${u9Status.conversationsCount} 个会话的聊天记录`} />
              )}
              <div className="flex justify-end gap-2">
                <Button variant="outline" onClick={() => setFetchTodayDialogVisible(false)}>取消</Button>
                <Button
                  theme="primary"
                  icon={<CloudDownloadIcon />}
                  disabled={!u9Status?.configured}
                  onClick={() => fetchToday()}
                >
                  开始获取
                </Button>
              </div>
            </>
          )}

          {/* 进度 */}
          {fetchTodayStatus.progress && (
            <div className="space-y-2">
              <div className="flex justify-between text-sm">
                <span>{fetchTodayStatus.progress.conversation}</span>
                <span>{fetchTodayStatus.progress.current}/{fetchTodayStatus.progress.total}</span>
              </div>
              <Progress
                percentage={Math.round(fetchTodayStatus.progress.current / fetchTodayStatus.progress.total * 100)}
                theme="line"
              />
            </div>
          )}

          {/* 日志 */}
          {fetchTodayStatus.logs.length > 0 && (
            <div className="p-3 rounded-lg max-h-48 overflow-y-auto ap-bg-component">
              {fetchTodayStatus.logs.map((log, i) => (
                <div key={i} className="text-xs py-0.5 ap-text-secondary">
                  {log}
                </div>
              ))}
              {fetchTodayStatus.running && <Loading size="small" />}
            </div>
          )}

          {/* 结果 */}
          {fetchTodayStatus.result && (
            <div className="space-y-3">
              <Alert
                theme="success"
                message={`抓取完成！新增 ${fetchTodayStatus.result.imported} 条，跳过 ${fetchTodayStatus.result.skipped} 条重复`}
              />
              <div className="flex justify-end gap-2">
                <Button variant="outline" onClick={() => setFetchTodayDialogVisible(false)}>关闭</Button>
                <Button theme="primary" onClick={() => {
                  setFetchTodayDialogVisible(false);
                  if (fetchTodayStatus.result?.sourceId) setSelectedSource(fetchTodayStatus.result.sourceId);
                  fetchRecords({ sourceId: fetchTodayStatus.result?.sourceId, page: 1, pageSize });
                  fetchStats();
                  fetchTodayRecords();
                  setActiveTab('records');
                }}>查看聊天记录</Button>
              </div>
            </div>
          )}
        </div>
      </Dialog>
    </div>
  );
}
