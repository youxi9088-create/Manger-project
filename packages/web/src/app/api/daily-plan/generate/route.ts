import { NextResponse } from 'next/server';

function safeText(s: unknown) {
    return String(s || '').trim();
}

function yyyyMmDd(d = new Date()) {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
}

type DailyTask = {
    title: string;
    priority?: 'high' | 'medium' | 'low';
    estimateMinutes?: number;
    notes?: string;
};

type LatestAnalysisReport = {
    report_date?: string;
    summary?: string;
    work_priorities?: any[];
    pending_tasks?: any[];
    follow_ups?: any[];
    key_decisions?: any[];
    completed_tasks?: any[];
    meeting_notes?: any[];
    statistics?: any;
};

async function fetchLatestAnalysisReport() {
    const base = process.env.IM_CHAT_ANALYZER_BASE_URL;
    if (!base) {
        throw new Error('IM_CHAT_ANALYZER_BASE_URL is not set');
    }
    const url = new URL('/api/analysis-reports/latest', base);
    const r = await fetch(url, { method: 'GET', cache: 'no-store' });
    if (!r.ok) {
        const t = await r.text().catch(() => '');
        throw new Error(`fetch latest analysis report failed: HTTP ${r.status} ${t}`);
    }
    const data: unknown = await r.json();
    const report = (data as { report?: LatestAnalysisReport | null } | null)?.report;
    return (report || null) as LatestAnalysisReport | null;
}

// 直接将分析报告字段转成今日任务（不依赖模型，先保证“不是测试信息”）
function tasksFromLatestReport(report: LatestAnalysisReport | null): DailyTask[] {
    if (!report) return [];

    const out: DailyTask[] = [];

    const push = (title: string, notes?: string, priority?: DailyTask['priority']) => {
        const t = safeText(title);
        if (!t) return;
        // 去重
        if (out.some((x) => safeText(x.title) === t)) return;
        out.push({ title: t, notes: safeText(notes) || undefined, priority: priority || 'medium' });
    };

    const pending = Array.isArray(report.pending_tasks) ? report.pending_tasks : [];
    for (const item of pending) {
        if (typeof item === 'string') {
            push(item, '来自聊天分析报告 pending_tasks', 'high');
        } else if (item && typeof item === 'object') {
            const o = item as any;
            push(o.task || o.title || o.name || JSON.stringify(o), o.detail || o.notes || '来自聊天分析报告 pending_tasks', 'high');
        }
    }

    const follow = Array.isArray(report.follow_ups) ? report.follow_ups : [];
    for (const item of follow) {
        if (typeof item === 'string') {
            push(item, '来自聊天分析报告 follow_ups', 'medium');
        } else if (item && typeof item === 'object') {
            const o = item as any;
            push(o.task || o.title || o.action || o.follow_up || JSON.stringify(o), o.detail || o.notes || '来自聊天分析报告 follow_ups', 'medium');
        }
    }

    const priorities = Array.isArray(report.work_priorities) ? report.work_priorities : [];
    for (const item of priorities) {
        if (typeof item === 'string') {
            push(item, '来自聊天分析报告 work_priorities', 'high');
        } else if (item && typeof item === 'object') {
            const o = item as any;
            push(o.priority || o.task || o.title || JSON.stringify(o), o.detail || o.reason || '来自聊天分析报告 work_priorities', 'high');
        }
    }

    return out;
}

function buildPrompt(date: string, goalText: string, latestReport?: LatestAnalysisReport | null) {
    const reportCtx = latestReport
        ? `\n\n【最新聊天分析报告】\n报告日期：${safeText(latestReport.report_date)}\n摘要：${safeText(latestReport.summary)}\n\n工作优先级(work_priorities)：${JSON.stringify(latestReport.work_priorities || [])}\n待办(pending_tasks)：${JSON.stringify(latestReport.pending_tasks || [])}\n跟进(follow_ups)：${JSON.stringify(latestReport.follow_ups || [])}\n关键决策(key_decisions)：${JSON.stringify(latestReport.key_decisions || [])}\n`
        : '';

    return `你是一个个人工作助理。请优先把“最新聊天分析报告”里的 pending_tasks/follow_ups/work_priorities 转成【今日任务清单】；如果条目不足，再结合用户的“今日目标/背景”补充任务。\n\n要求：\n1) 输出必须是严格 JSON（不要 Markdown 代码块），且必须包含 tasks 字段：{ "tasks": DailyTask[] }\n2) tasks 必须是数组，长度 5~12\n3) DailyTask 字段：title(必填)、priority(high/medium/low)、estimateMinutes(整数)、notes(可选)\n4) 不要输出泛化的‘检查邮件/整理纪要/优化时间管理’这类默认模板任务，除非用户目标明确要求\n5) 不要输出除 JSON 以外的任何文字\n\n日期：${date}\n\n今日目标/背景：\n${goalText || '(用户未提供)'}\n${reportCtx}`;
}

function extractJsonObject(text: string) {
    const s = safeText(text);
    if (!s) return '';

    // 去掉 <think>...</think>
    const noThink = s.replace(/<think>[\s\S]*?<\/think>/gi, '').trim();

    // 尝试截取第一个 { ... } JSON 对象
    const start = noThink.indexOf('{');
    const end = noThink.lastIndexOf('}');
    if (start >= 0 && end > start) {
        return noThink.slice(start, end + 1);
    }
    return noThink;
}

export async function POST(req: Request) {
    try {
        const body = await req.json();
        const date = safeText(body?.date) || yyyyMmDd();
        const goalText = safeText(body?.goalText);
        const useLatestReport = body?.useLatestReport !== false; // 默认开启

        let latestReport: LatestAnalysisReport | null = null;
        let latestReportError: string | null = null;
        if (useLatestReport) {
            try {
                latestReport = await fetchLatestAnalysisReport();
            } catch (e: unknown) {
                latestReport = null;
                latestReportError = e instanceof Error ? e.message : String(e);
            }
        }

        const extracted = tasksFromLatestReport(latestReport);
        const extractedMax = 12;
        if (extracted.length >= 5) {
            return NextResponse.json({
                success: true,
                date,
                plan: { tasks: extracted.slice(0, extractedMax) },
                meta: {
                    useLatestReport,
                    latestReportDate: latestReport?.report_date || null,
                    latestReportLoaded: !!latestReport,
                    latestReportError,
                    source: 'latest_report_extracted',
                },
            });
        }

        // 复用本项目已打通的 chat 转发：/api/quick-search
        const payload = {
            model: body?.model || 'gpt-3.5-turbo',
            stream: false,
            messages: [
                {
                    role: 'system',
                    content:
                        '你是一个严格按要求输出 JSON 的助手。输出必须是严格 JSON，不要包含 <think>、不要包含任何解释、不要 Markdown 代码块。且必须输出包含 tasks 数组的对象：{"tasks": [...]}。',
                },
                { role: 'user', content: buildPrompt(date, goalText, latestReport) },
            ],
            temperature: 0.2,
            response_format: { type: 'json_object' },
        };

        const resp = await fetch(new URL('/api/quick-search', req.url), {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify(payload),
        });

        const text = await resp.text();
        let upstream: any = null;
        try {
            upstream = text ? JSON.parse(text) : null;
        } catch {
            upstream = null;
        }

        if (!resp.ok) {
            return NextResponse.json(
                {
                    success: false,
                    error: upstream?.error?.message || upstream?.error || upstream?.message || text || `HTTP ${resp.status}`,
                },
                { status: resp.status },
            );
        }

        const content: string =
            upstream?.choices?.[0]?.message?.content ??
            upstream?.choices?.[0]?.delta?.content ??
            upstream?.text ??
            '';

        const jsonText = extractJsonObject(content);

        let plan: { tasks: DailyTask[] } | null = null;
        try {
            plan = jsonText ? (JSON.parse(jsonText) as any) : null;
        } catch {
            plan = null;
        }

        // 容错：有些模型会返回空对象 {}，此时回退到“报告提取 + AI 补齐/兜底任务”
        const tasks = Array.isArray((plan as any)?.tasks) ? ((plan as any).tasks as DailyTask[]) : null;
        if (!tasks) {
            const baseTasks = extracted.slice(0, extractedMax);
            // 如果提取不足，就追加最少量的“目标驱动”兜底任务（避免泛化模板）
            const fallback: DailyTask[] = [];
            if (baseTasks.length < 5) {
                fallback.push(
                    {
                        title: '核对最新聊天分析报告字段是否包含 pending_tasks/follow_ups/work_priorities',
                        priority: 'high',
                        estimateMinutes: 15,
                        notes: '用于确保后续可自动提取待办',
                    },
                    {
                        title: '将报告待办提取规则对齐并映射到今日任务结构',
                        priority: 'high',
                        estimateMinutes: 20,
                        notes: goalText ? `结合目标：${goalText}` : undefined,
                    },
                    {
                        title: '在 daily 页面验证 AI 生成结果与本地持久化是否正确',
                        priority: 'medium',
                        estimateMinutes: 15,
                    },
                );
            }

            const merged = [...baseTasks, ...fallback].slice(0, extractedMax);
            return NextResponse.json({
                success: true,
                date,
                plan: { tasks: merged },
                meta: {
                    useLatestReport,
                    latestReportDate: latestReport?.report_date || null,
                    latestReportLoaded: !!latestReport,
                    latestReportError,
                    source: 'fallback_no_tasks_from_model',
                },
            });
        }

        return NextResponse.json({
            success: true,
            date,
            plan: { tasks },
            meta: {
                useLatestReport,
                latestReportDate: latestReport?.report_date || null,
                latestReportLoaded: !!latestReport,
                latestReportError,
                source: latestReport ? 'ai_with_latest_report' : 'ai_goal_only',
            },
        });
    } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : String(e);
        return NextResponse.json({ success: false, error: msg || 'Server error' }, { status: 500 });
    }
}
