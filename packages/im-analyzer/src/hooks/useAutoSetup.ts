import { useState, useCallback, useRef } from 'react';

export interface AutoSetupStatus {
  running: boolean;
  smsRequired: boolean;
  logs: string[];
  result: {
    success: boolean;
    sessions?: number;
    userId?: string;
    message?: string;
  } | null;
}

export function useAutoSetup() {
  const [status, setStatus] = useState<AutoSetupStatus>({
    running: false, smsRequired: false, logs: [], result: null,
  });
  const abortRef = useRef<AbortController | null>(null);

  const startSetup = useCallback(async (employeeId: string, password: string) => {
    setStatus({ running: true, smsRequired: false, logs: [], result: null });
    abortRef.current = new AbortController();

    try {
      const res = await fetch('/api/im/auto-setup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ employeeId, password }),
        signal: abortRef.current.signal,
      });

      if (!res.body) throw new Error('无响应体');
      const reader = res.body.getReader();
      const decoder = new TextDecoder();

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        const chunk = decoder.decode(value, { stream: true });
        for (const line of chunk.split('\n')) {
          if (!line.startsWith('data: ')) continue;
          try {
            const evt = JSON.parse(line.slice(6));
            if (evt.type === 'log') {
              setStatus(prev => ({ ...prev, logs: [...prev.logs, evt.message] }));
            } else if (evt.type === 'sms_required') {
              setStatus(prev => ({ ...prev, smsRequired: true, logs: [...prev.logs, evt.message] }));
            } else if (evt.type === 'done') {
              setStatus(prev => ({
                ...prev, running: false, smsRequired: false,
                logs: [...prev.logs, evt.message],
                result: { success: true, sessions: evt.sessions, userId: evt.userId, message: evt.message },
              }));
            } else if (evt.type === 'error') {
              setStatus(prev => ({
                ...prev, running: false, smsRequired: false,
                logs: [...prev.logs, `错误: ${evt.message}`],
                result: { success: false, message: evt.message },
              }));
            }
          } catch {}
        }
      }
    } catch (e: any) {
      if (e.name !== 'AbortError') {
        setStatus(prev => ({
          ...prev, running: false,
          logs: [...prev.logs, `异常: ${e.message}`],
          result: { success: false, message: e.message },
        }));
      }
    }
  }, []);

  const submitSmsCode = useCallback(async (code: string) => {
    setStatus(prev => ({ ...prev, smsRequired: false, logs: [...prev.logs, `提交验证码: ${code}`] }));
    await fetch('/api/im/auto-setup/sms', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ code }),
    });
  }, []);

  const cancelSetup = useCallback(() => {
    abortRef.current?.abort();
    setStatus(prev => ({ ...prev, running: false, smsRequired: false }));
  }, []);

  return { status, startSetup, submitSmsCode, cancelSetup };
}

// ============= 需求2: 获取当天聊天记录 Hook =============

export interface FetchTodayStatus {
  running: boolean;
  logs: string[];
  progress: { current: number; total: number; conversation: string } | null;
  result: { imported: number; skipped: number; failed: number; sourceId?: string } | null;
}

export function useFetchToday() {
  const [status, setStatus] = useState<FetchTodayStatus>({
    running: false, logs: [], progress: null, result: null,
  });

  const fetchToday = useCallback(async (sourceId?: string) => {
    setStatus({ running: true, logs: [], progress: null, result: null });

    try {
      const sourcesRes = await fetch('/api/im/sources');
      const sourcesJson = await sourcesRes.json();
      const targetSourceId = sourceId || (sourcesJson.sources || []).find((s: any) => s.type === '99u_web' || s.type === '99u')?.id;
      if (!targetSourceId) throw new Error('没有可用的 99U 数据源');

      const conversationsRes = await fetch('/api/im/u9-conversations');
      const conversationsJson = await conversationsRes.json();
      const conversations = conversationsJson.conversations || [];
      if (conversations.length === 0) throw new Error('没有配置会话列表');

      const now = new Date();
      const date = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
      const beginTime = `${date} 00:00:00`;
      const endTime = `${date} 23:59:59`;
      let imported = 0;
      let skipped = 0;
      let failed = 0;
      let cursor = 0;
      const worker = async () => {
        while (true) {
          const index = cursor++;
          if (index >= conversations.length) return;
          const conversation = conversations[index];
          try {
            const res = await fetch('/api/im/chat-records/import-u9', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ sourceId: targetSourceId, convId: conversation.id, beginTime, endTime, maxMessages: 500 }),
            });
            const data = await res.json().catch(() => ({}));
            if (!res.ok) throw new Error(data.error || `请求失败 (${res.status})`);
            imported += Number(data.imported || 0);
            skipped += Number(data.skipped || 0);
            if (data.imported > 0) setStatus(prev => ({ ...prev, logs: [...prev.logs, `${conversation.name || conversation.id}: 新增 ${data.imported} 条`] }));
          } catch (error: any) {
            failed += 1;
            setStatus(prev => ({ ...prev, logs: [...prev.logs, `${conversation.name || conversation.id}: 失败 - ${error?.message || '未知错误'}`] }));
          } finally {
            setStatus(prev => ({ ...prev, progress: { current: Math.min(cursor, conversations.length), total: conversations.length, conversation: conversation.name || conversation.id } }));
          }
        }
      };
      await Promise.all(Array.from({ length: Math.min(6, conversations.length) }, () => worker()));
      setStatus(prev => ({
        ...prev,
        running: false,
        logs: [...prev.logs, `采集完成：新增 ${imported} 条，跳过 ${skipped} 条，失败 ${failed} 个会话`],
        result: { imported, skipped, failed, sourceId: targetSourceId },
      }));
    } catch (e: any) {
      setStatus(prev => ({
        ...prev, running: false,
        logs: [...prev.logs, `异常: ${e.message}`],
      }));
    }
  }, []);

  return { status, fetchToday };
}
