import { useState, useCallback } from 'react';
import dayjs from 'dayjs';
import { ImSource, ChatRecord, AnalysisReport, ScheduledTask, ChatStats, SourceConversation } from '../types';

const API_BASE = '';

// ============= IM 数据源 Hook =============

export function useImSources() {
  const [sources, setSources] = useState<ImSource[]>([]);
  const [loading, setLoading] = useState(false);

  const fetchSources = useCallback(async () => {
    try {
      const res = await fetch(`${API_BASE}/api/im/sources`);
      const data = await res.json();
      setSources(data.sources.map((s: any) => ({ ...s, config: typeof s.config === 'string' ? JSON.parse(s.config) : s.config, enabled: !!s.enabled })));
    } catch (e) {
      console.error('Failed to fetch IM sources:', e);
    }
  }, []);

  const createSource = useCallback(async (source: { name: string; type: string; config?: any }) => {
    setLoading(true);
    try {
      const res = await fetch(`${API_BASE}/api/im/sources`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(source),
      });
      const data = await res.json();
      if (data.source) setSources(prev => [{ ...data.source, enabled: !!data.source.enabled }, ...prev]);
      return data;
    } finally {
      setLoading(false);
    }
  }, []);

  const updateSource = useCallback(async (id: string, updates: Partial<ImSource>) => {
    try {
      const res = await fetch(`${API_BASE}/api/im/sources/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updates),
      });
      const data = await res.json();
      if (data.success) {
        setSources(prev => prev.map(s => s.id === id ? { ...s, ...updates } : s));
      }
      return data;
    } catch (e) {
      console.error('Failed to update IM source:', e);
    }
  }, []);

  const deleteSource = useCallback(async (id: string) => {
    try {
      const res = await fetch(`${API_BASE}/api/im/sources/${id}`, { method: 'DELETE' });
      const data = await res.json();
      if (data.success) setSources(prev => prev.filter(s => s.id !== id));
      return data;
    } catch (e) {
      console.error('Failed to delete IM source:', e);
    }
  }, []);

  return { sources, loading, fetchSources, createSource, updateSource, deleteSource };
}

// ============= 数据源会话管理 Hook =============

export function useSourceConversations() {
  const [conversations, setConversations] = useState<SourceConversation[]>([]);
  const [loading, setLoading] = useState(false);

  const fetchConversations = useCallback(async (sourceId: string) => {
    setLoading(true);
    try {
      const res = await fetch(`${API_BASE}/api/im/sources/${sourceId}/conversations`);
      const data = await res.json();
      setConversations(data.conversations || []);
      return data.conversations || [];
    } catch (e) {
      console.error('Failed to fetch conversations:', e);
      return [];
    } finally {
      setLoading(false);
    }
  }, []);

  const addConversation = useCallback(async (sourceId: string, convId: string, name?: string) => {
    try {
      const res = await fetch(`${API_BASE}/api/im/sources/${sourceId}/conversations`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ convId, name }),
      });
      const data = await res.json();
      if (data.conversation) {
        setConversations(prev => [...prev, data.conversation]);
      }
      return data;
    } catch (e) {
      console.error('Failed to add conversation:', e);
      return { error: String(e) };
    }
  }, []);

  const removeConversation = useCallback(async (sourceId: string, convId: string) => {
    try {
      const res = await fetch(`${API_BASE}/api/im/sources/${sourceId}/conversations/${convId}`, {
        method: 'DELETE',
      });
      const data = await res.json();
      if (data.success) {
        setConversations(prev => prev.filter(c => c.conv_id !== convId));
      }
      return data;
    } catch (e) {
      console.error('Failed to remove conversation:', e);
      return { error: String(e) };
    }
  }, []);

  return { conversations, loading, fetchConversations, addConversation, removeConversation };
}

// ============= 聊天记录 Hook =============

export function useChatRecords() {
  const [records, setRecords] = useState<ChatRecord[]>([]);
  const [allRecords, setAllRecords] = useState<ChatRecord[]>([]);
  const [todayRecords, setTodayRecords] = useState<ChatRecord[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [loading, setLoading] = useState(false);
  const [allLoading, setAllLoading] = useState(false);
  const [todayLoading, setTodayLoading] = useState(false);

  const fetchRecords = useCallback(async (params?: {
    sourceId?: string;
    startDate?: string;
    endDate?: string;
    senderName?: string;
    keyword?: string;
    page?: number;
    pageSize?: number;
  }) => {
    setLoading(true);
    try {
      const currentPage = params?.page || page;
      const currentPageSize = params?.pageSize || pageSize;
      const query = new URLSearchParams();
      if (params?.sourceId) query.set('sourceId', params.sourceId);
      if (params?.startDate) query.set('startDate', params.startDate);
      if (params?.endDate) query.set('endDate', params.endDate);
      if (params?.senderName) query.set('senderName', params.senderName);
      if (params?.keyword) query.set('keyword', params.keyword);
      query.set('page', String(currentPage));
      query.set('pageSize', String(currentPageSize));

      const res = await fetch(`${API_BASE}/api/im/chat-records?${query}`);
      const data = await res.json();
      setRecords(data.records.map((r: any) => ({ ...r, is_mentioned: !!r.is_mentioned })));
      setTotal(data.total);
      setPage(currentPage);
      setPageSize(currentPageSize);
    } catch (e) {
      console.error('Failed to fetch chat records:', e);
    } finally {
      setLoading(false);
    }
  }, [page, pageSize]);

  // 获取全部记录（用于按用户/按群组聚合视图）
  const fetchAllRecords = useCallback(async (params?: {
    sourceId?: string;
    startDate?: string;
    endDate?: string;
    senderName?: string;
    keyword?: string;
  }) => {
    setAllLoading(true);
    try {
      const query = new URLSearchParams();
      if (params?.sourceId) query.set('sourceId', params.sourceId);
      if (params?.startDate) query.set('startDate', params.startDate);
      if (params?.endDate) query.set('endDate', params.endDate);
      if (params?.senderName) query.set('senderName', params.senderName);
      if (params?.keyword) query.set('keyword', params.keyword);
      query.set('page', '1');
      query.set('pageSize', '10000'); // 一次性获取全量数据

      const res = await fetch(`${API_BASE}/api/im/chat-records?${query}`);
      const data = await res.json();
      const all = data.records.map((r: any) => ({ ...r, is_mentioned: !!r.is_mentioned }));
      setAllRecords(all);
      setTotal(data.total);
      return all as ChatRecord[];
    } catch (e) {
      console.error('Failed to fetch all chat records:', e);
      return [] as ChatRecord[];
    } finally {
      setAllLoading(false);
    }
  }, []);

  // 获取今日消息记录（仪表盘专用）
  const fetchTodayRecords = useCallback(async () => {
    setTodayLoading(true);
    try {
      const todayStart = dayjs().startOf('day').format('YYYY-MM-DDTHH:mm:ss');
      const todayEnd = dayjs().endOf('day').format('YYYY-MM-DDTHH:mm:ss');
      const query = new URLSearchParams();
      query.set('startDate', todayStart);
      query.set('endDate', todayEnd);
      query.set('page', '1');
      query.set('pageSize', '200'); // 今日消息明细，取较多条

      const res = await fetch(`${API_BASE}/api/im/chat-records?${query}`);
      const data = await res.json();
      setTodayRecords(data.records.map((r: any) => ({ ...r, is_mentioned: !!r.is_mentioned })));
    } catch (e) {
      console.error('Failed to fetch today records:', e);
    } finally {
      setTodayLoading(false);
    }
  }, []);

  const changePage = useCallback((newPage: number, newPageSize?: number) => {
    const size = newPageSize || pageSize;
    setPage(newPage);
    setPageSize(size);
    // 触发重新加载（由调用者传入当前筛选条件）
    return { page: newPage, pageSize: size };
  }, [page, pageSize]);

  const importRecords = useCallback(async (sourceId: string, records: any[]) => {
    try {
      const res = await fetch(`${API_BASE}/api/im/chat-records/import`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sourceId, records }),
      });
      return await res.json();
    } catch (e) {
      console.error('Failed to import records:', e);
      return { success: false, error: String(e) };
    }
  }, []);

  const importFile = useCallback(async (sourceId: string, fileName: string, fileContent: string, fileType: string) => {
    try {
      const res = await fetch(`${API_BASE}/api/im/chat-records/import-file`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sourceId, fileName, fileContent, fileType }),
      });
      return await res.json();
    } catch (e) {
      console.error('Failed to import file:', e);
      return { success: false, error: String(e) };
    }
  }, []);

  return { records, allRecords, todayRecords, total, page, pageSize, loading, allLoading, todayLoading, fetchRecords, fetchAllRecords, fetchTodayRecords, importRecords, importFile, changePage };
}

// ============= 99U API Hook =============

export interface U9ApiStatus {
  configured: boolean;
  hasAuthId: boolean;
  hasAuthKey: boolean;
  hasAppId: boolean;
  baseUrl: string;
  conversations: string[];
  conversationsCount: number;
}

export interface U9ImportParams {
  sourceId: string;
  convId: string;
  keyword?: string;
  beginTime?: string;
  endTime?: string;
  maxMessages?: number;
}

export function useU9Api() {
  const [status, setStatus] = useState<U9ApiStatus | null>(null);
  const [importing, setImporting] = useState(false);
  const [importProgress, setImportProgress] = useState('');

  const fetchStatus = useCallback(async () => {
    try {
      const res = await fetch(`${API_BASE}/api/im/u9-status`);
      const data = await res.json();
      setStatus(data);
      return data;
    } catch (e) {
      console.error('Failed to fetch U9 status:', e);
      return null;
    }
  }, []);

  const importFromU9 = useCallback(async (params: U9ImportParams): Promise<{ success: boolean; imported?: number; skipped?: number; error?: string }> => {
    setImporting(true);
    setImportProgress('正在连接 99U API...');
    try {
      const res = await fetch(`${API_BASE}/api/im/chat-records/import-u9`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(params),
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || '导入失败');
      }

      if (data.success) {
        const skippedMsg = data.skipped > 0 ? `（跳过 ${data.skipped} 条重复）` : '';
        setImportProgress(`成功导入 ${data.imported} 条记录${skippedMsg}（API 返回 ${data.totalFromApi} 条）`);
      }

      return data;
    } catch (e: any) {
      const msg = e?.message || String(e);
      setImportProgress(`导入失败: ${msg}`);
      return { success: false, error: msg };
    } finally {
      setImporting(false);
    }
  }, []);

  const searchU9 = useCallback(async (params: {
    convId: string;
    keyword?: string;
    beginTime?: string;
    endTime?: string;
    offset?: number;
    limit?: number;
  }) => {
    try {
      const res = await fetch(`${API_BASE}/api/im/chat-records/search-u9`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(params),
      });
      return await res.json();
    } catch (e) {
      console.error('Failed to search U9:', e);
      return { messages: [], total: 0, has_more: false };
    }
  }, []);

  // 获取 U9 会话列表（由后端实时调用 99U 接口）
  const fetchU9Conversations = useCallback(async () => {
    try {
      const res = await fetch(`${API_BASE}/api/im/u9-conversations`);
      const data = await res.json();
      return data.conversations || [];
    } catch (e) {
      console.error('Failed to fetch U9 conversations:', e);
      return [];
    }
  }, []);

  // 通过 API 刷新会话列表（从 99U 群组和好友列表中获取新增会话）
  const refreshConversations = useCallback(async (userId?: string) => {
    try {
      const res = await fetch(`${API_BASE}/api/im/refresh-conversations`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || '刷新失败');
      return data;
    } catch (e: any) {
      console.error('Failed to refresh conversations:', e);
      return { success: false, error: e?.message || String(e) };
    }
  }, []);

  return { status, importing, importProgress, fetchStatus, importFromU9, searchU9, fetchU9Conversations, refreshConversations };
}

// ============= 分析报告 Hook =============

export function useAnalysisReports() {
  const [reports, setReports] = useState<AnalysisReport[]>([]);
  const [loading, setLoading] = useState(false);
  const [analyzing, setAnalyzing] = useState(false);
  const [analysisStream, setAnalysisStream] = useState('');

  const fetchReports = useCallback(async (params?: { startDate?: string; endDate?: string; limit?: number }) => {
    setLoading(true);
    try {
      const query = new URLSearchParams();
      if (params?.startDate) query.set('startDate', params.startDate);
      if (params?.endDate) query.set('endDate', params.endDate);
      if (params?.limit) query.set('limit', String(params.limit));

      const res = await fetch(`${API_BASE}/api/analysis/reports?${query}`);
      const data = await res.json();
      setReports(data.reports);
    } catch (e) {
      console.error('Failed to fetch reports:', e);
    } finally {
      setLoading(false);
    }
  }, []);

  const runAnalysis = useCallback(async (date: string, onStream?: (text: string, type: string) => void) => {
    setAnalyzing(true);
    setAnalysisStream('');

    try {
      const res = await fetch(`${API_BASE}/api/analysis/run`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ date }),
      });

      if (!res.ok || !res.body) {
        const err = await res.json().catch(() => ({}));
        setAnalyzing(false);
        return err;
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let fullText = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        const chunk = decoder.decode(value, { stream: true });
        const lines = chunk.split('\n');

        for (const line of lines) {
          if (line.startsWith('data: ')) {
            try {
              const event = JSON.parse(line.slice(6));
              if (event.type === 'text') {
                fullText += event.content;
                setAnalysisStream(fullText);
                onStream?.(event.content, 'text');
              } else if (event.type === 'done') {
                onStream?.('', 'done');
              } else if (event.type === 'saved') {
                onStream?.('', 'saved');
                // 刷新报告列表
                fetchReports();
              } else if (event.type === 'error') {
                onStream?.(event.message, 'error');
              }
            } catch (e) {
              // 忽略解析错误
            }
          }
        }
      }

      setAnalyzing(false);
      return { success: true };
    } catch (e: any) {
      setAnalyzing(false);
      onStream?.(e?.message || '分析失败', 'error');
      return { success: false, error: String(e) };
    }
  }, [fetchReports]);

  const deleteReport = useCallback(async (id: string) => {
    try {
      const res = await fetch(`${API_BASE}/api/analysis/reports/${id}`, { method: 'DELETE' });
      const data = await res.json();
      if (data.success) setReports(prev => prev.filter(r => r.id !== id));
      return data;
    } catch (e) {
      console.error('Failed to delete report:', e);
    }
  }, []);

  return { reports, loading, analyzing, analysisStream, fetchReports, runAnalysis, deleteReport };
}

// ============= 统计信息 Hook =============

export function useChatStats() {
  const [stats, setStats] = useState<ChatStats | null>(null);
  const [loading, setLoading] = useState(false);

  const fetchStats = useCallback(async (startDate?: string, endDate?: string) => {
    setLoading(true);
    try {
      const query = new URLSearchParams();
      if (startDate) query.set('startDate', startDate);
      if (endDate) query.set('endDate', endDate);

      const res = await fetch(`${API_BASE}/api/im/stats?${query}`);
      const data = await res.json();
      setStats(data);
    } catch (e) {
      console.error('Failed to fetch stats:', e);
    } finally {
      setLoading(false);
    }
  }, []);

  return { stats, loading, fetchStats };
}

// ============= 本地数据库 Hook =============

export interface LocalDbConnectResult {
  success: boolean;
  message: string;
  stats?: {
    totalMessages: number;
    totalConversations: number;
    tables: string[];
  };
}

export interface LocalDbMessage {
  id: string;
  sender_id: string;
  sender_name: string;
  group_id: string | null;
  group_name: string | null;
  content: string;
  msg_type: string;
  timestamp: string;
  is_mentioned: number;
}

export interface LocalDbConversation {
  id: string;
  name: string;
  type: 'direct' | 'group';
  last_time?: string;
}

export function useLocalDb() {
  const [connecting, setConnecting] = useState(false);
  const [importing, setImporting] = useState(false);
  const [connectResult, setConnectResult] = useState<LocalDbConnectResult | null>(null);
  const [conversations, setConversations] = useState<LocalDbConversation[]>([]);
  const [importResult, setImportResult] = useState<{ imported: number; skipped: number } | null>(null);

  const connectLocalDb = useCallback(async (employeeId: string, basePath?: string) => {
    setConnecting(true);
    setConnectResult(null);
    try {
      const res = await fetch(`${API_BASE}/api/local-db/connect`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ employeeId, basePath }),
      });
      const data: LocalDbConnectResult = await res.json();
      setConnectResult(data);
      return data;
    } catch (e) {
      const err = { success: false, message: String(e) };
      setConnectResult(err);
      return err;
    } finally {
      setConnecting(false);
    }
  }, []);

  const fetchLocalConversations = useCallback(async (employeeId: string, basePath?: string) => {
    try {
      const res = await fetch(`${API_BASE}/api/local-db/conversations`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ employeeId, basePath }),
      });
      const data = await res.json();
      setConversations(data.conversations || []);
      return data.conversations || [];
    } catch (e) {
      console.error('Failed to fetch local conversations:', e);
      return [];
    }
  }, []);

  const importLocalDb = useCallback(async (employeeId: string, sourceId: string, basePath?: string) => {
    setImporting(true);
    setImportResult(null);
    try {
      const res = await fetch(`${API_BASE}/api/local-db/import`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ employeeId, sourceId, basePath }),
      });
      const data = await res.json();
      if (data.success) {
        setImportResult({ imported: data.imported, skipped: data.skipped });
      }
      return data;
    } catch (e) {
      return { success: false, error: String(e) };
    } finally {
      setImporting(false);
    }
  }, []);

  return {
    connecting,
    importing,
    connectResult,
    conversations,
    importResult,
    connectLocalDb,
    fetchLocalConversations,
    importLocalDb,
  };
}

// ============= 定时任务 Hook =============

export function useScheduledTasks() {
  const [tasks, setTasks] = useState<ScheduledTask[]>([]);

  const fetchTasks = useCallback(async () => {
    try {
      const res = await fetch(`${API_BASE}/api/schedules`);
      const data = await res.json();
      setTasks(data.tasks.map((t: any) => ({ ...t, enabled: !!t.enabled })));
    } catch (e) {
      console.error('Failed to fetch tasks:', e);
    }
  }, []);

  const createTask = useCallback(async (task: { name: string; cron_expression: string }) => {
    try {
      const res = await fetch(`${API_BASE}/api/schedules`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(task),
      });
      const data = await res.json();
      if (data.task) setTasks(prev => [...prev, { ...data.task, enabled: !!data.task.enabled }]);
      return data;
    } catch (e) {
      return { success: false, error: String(e) };
    }
  }, []);

  const updateTask = useCallback(async (id: string, updates: Partial<ScheduledTask>) => {
    try {
      const res = await fetch(`${API_BASE}/api/schedules/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updates),
      });
      const data = await res.json();
      if (data.success) setTasks(prev => prev.map(t => t.id === id ? { ...t, ...updates } : t));
      return data;
    } catch (e) {
      return { success: false, error: String(e) };
    }
  }, []);

  const deleteTask = useCallback(async (id: string) => {
    try {
      const res = await fetch(`${API_BASE}/api/schedules/${id}`, { method: 'DELETE' });
      const data = await res.json();
      if (data.success) setTasks(prev => prev.filter(t => t.id !== id));
      return data;
    } catch (e) {
      return { success: false, error: String(e) };
    }
  }, []);

  const runTask = useCallback(async (id: string) => {
    try {
      const res = await fetch(`${API_BASE}/api/schedules/${id}/run`, { method: 'POST' });
      return await res.json();
    } catch (e) {
      return { success: false, error: String(e) };
    }
  }, []);

  return { tasks, fetchTasks, createTask, updateTask, deleteTask, runTask };
}
