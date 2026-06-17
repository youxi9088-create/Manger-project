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
      const res = await fetch('/api/im/fetch-today', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sourceId }),
      });

      if (!res.ok) {
        const text = await res.text().catch(() => '');
        throw new Error(text || `请求失败 (${res.status})`);
      }

      if (!res.body) throw new Error('无响应体');
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let endedByEvent = false;

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
            } else if (evt.type === 'progress') {
              setStatus(prev => ({
                ...prev,
                progress: { current: evt.current, total: evt.total, conversation: evt.conversation },
              }));
            } else if (evt.type === 'done') {
              endedByEvent = true;
              setStatus(prev => ({
                ...prev, running: false,
                logs: [...prev.logs, evt.message],
                result: { imported: evt.imported, skipped: evt.skipped, failed: evt.failed, sourceId: evt.sourceId },
              }));
            } else if (evt.type === 'error') {
              endedByEvent = true;
              setStatus(prev => ({
                ...prev, running: false,
                logs: [...prev.logs, `错误: ${evt.message}`],
                result: null,
              }));
            }
          } catch {}
        }
      }

      if (!endedByEvent) {
        setStatus(prev => ({
          ...prev,
          running: false,
          logs: [...prev.logs, '获取已结束'],
        }));
      }
    } catch (e: any) {
      setStatus(prev => ({
        ...prev, running: false,
        logs: [...prev.logs, `异常: ${e.message}`],
      }));
    }
  }, []);

  return { status, fetchToday };
}
