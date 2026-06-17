import { NextResponse } from 'next/server';
import { meetingService } from '@/lib/meeting-service';
import fs from 'fs';
import path from 'path';
import OpenAI from 'openai';
import { tencentShortASR } from '@/lib/tencent-asr';
import { volcUploadAndRecognize } from '@/lib/volc-asr-upload';

// 清除代理环境变量，避免 OpenAI SDK 走不存在的代理导致 Connection error
delete process.env.HTTP_PROXY;
delete process.env.HTTPS_PROXY;
delete process.env.http_proxy;
delete process.env.https_proxy;

type MappingRecord = {
    pickedIndex?: number;
    record?: {
        meetingNo?: string;
        title?: string;
        startTime?: string;
    };
    captured?: {
        url?: string;
        name?: string;
    };
};

function safeText(s: any) {
    return String(s || '').trim();
}

function loadCapturedMappings(): MappingRecord[] {
    const envPath = safeText(process.env.MEETING_LINKS_FILE);

    const candidates = [
        ...(envPath ? [envPath] : []),
        path.resolve(process.cwd(), '..', '..', 'data', 'meetings', 'meeting-audio-links.json'),
    ];

    for (const p of candidates) {
        try {
            if (!p || !fs.existsSync(p)) continue;
            const raw = fs.readFileSync(p, 'utf-8');
            const json = JSON.parse(raw);

            if (Array.isArray(json?.mappings)) {
                return json.mappings as MappingRecord[];
            }

            if (Array.isArray(json?.links)) {
                return (json.links as any[]).map((x) => ({ captured: { url: x?.url }, record: {} }));
            }
        } catch {
            // ignore
        }
    }

    return [];
}

function normalizeTitleForCompare(s: string) {
    return safeText(s)
        .replace(/\s+/g, ' ')
        .replace(/\.mp\d+$/i, '')
        .replace(/\.mp3$/i, '')
        .replace(/\.m4a$/i, '')
        .replace(/\.wav$/i, '')
        .trim();
}

function urlNameDecoded(u: string) {
    try {
        const url = new URL(u);
        const name = url.searchParams.get('name') || '';
        return decodeURIComponent(name);
    } catch {
        return '';
    }
}

function pickDirectUrlByRecord(
    mappings: MappingRecord[],
    target: { title?: string; startTime?: string },
    format: 'audio' | 'video',
) {
    const targetTitle = normalizeTitleForCompare(target.title || '');
    const preferExt = format === 'audio' ? '.mp3' : '.mp4';

    const debug: any = {
        targetTitle,
        preferExt,
        mappingsCount: mappings.length,
        hit: null as any,
    };

    const byTitle = mappings.find((m) => {
        const url = safeText(m.captured?.url);
        if (!url.toLowerCase().includes(preferExt)) return false;

        const recTitle = normalizeTitleForCompare(m.record?.title || '');
        if (recTitle && recTitle === targetTitle) {
            debug.hit = { why: 'record.title', pickedIndex: m.pickedIndex, recTitle, url };
            return true;
        }

        const capName = normalizeTitleForCompare(m.captured?.name || '');
        if (capName && capName === targetTitle) {
            debug.hit = { why: 'captured.name', pickedIndex: m.pickedIndex, capName, url };
            return true;
        }

        const decoded = normalizeTitleForCompare(urlNameDecoded(url));
        if (decoded && decoded === targetTitle) {
            debug.hit = { why: 'url.name(decoded)', pickedIndex: m.pickedIndex, decoded, url };
            return true;
        }

        return false;
    });

    if (byTitle?.captured?.url) {
        return { url: byTitle.captured.url, debug };
    }

    const normalizeTime = (s: string) => {
        const t = safeText(s);
        const m = t.match(/\d{4}-\d{2}-\d{2}\s+\d{2}:\d{2}/);
        return m ? m[0] : t;
    };
    const targetStart = normalizeTime(target.startTime || '');

    const byTime = mappings.find((m) => {
        const rs = normalizeTime(m.record?.startTime || '');
        const url = safeText(m.captured?.url);
        return rs && rs === targetStart && url.toLowerCase().includes(preferExt);
    });
    if (byTime?.captured?.url) {
        debug.hit = { why: 'record.startTime(minute)', targetStart, pickedIndex: byTime.pickedIndex, url: byTime.captured.url };
        return { url: byTime.captured.url, debug };
    }

    // 不做 fallback，避免匹配到不相关的音频
    debug.hit = { why: 'no-match', note: '映射中未找到匹配的音频，将通过 Playwright 抓取' };
    return { url: undefined, debug };
}

function getLLMClient() {
    const apiKey =
        process.env.MOONSHOT_API_KEY ||
        process.env.LLM_API_KEY ||
        process.env.OPENAI_API_KEY ||
        '';

    const baseURL =
        process.env.MOONSHOT_BASE_URL ||
        process.env.LLM_BASE_URL ||
        process.env.OPENAI_BASE_URL ||
        undefined;

    if (!apiKey) {
        throw new Error('缺少 MOONSHOT_API_KEY / LLM_API_KEY / OPENAI_API_KEY 环境变量，无法生成会议纪要');
    }

    console.log('LLM client: baseURL=', baseURL);
    return new OpenAI({ apiKey, baseURL });
}

function getASRClient() {
    const apiKey = process.env.ASR_API_KEY || process.env.OPENAI_API_KEY || '';
    const baseURL = process.env.ASR_BASE_URL || process.env.OPENAI_BASE_URL || undefined;

    if (!apiKey) {
        throw new Error('缺少 ASR_API_KEY（或 OPENAI_API_KEY）环境变量，无法进行语音识别');
    }

    return new OpenAI({ apiKey, baseURL });
}

async function transcribeAudioWithWhisper(filePath: string, directUrl?: string) {
    // 0) 优先走火山录音文件识别（适合长音频）
    const volcKey = process.env.VOLC_ASR_API_KEY || '';
    if (volcKey) {
        // 使用文件上传方式（不需要公网URL）
        if (!filePath || !fs.existsSync(filePath)) {
            throw new Error(`音频文件不存在: ${filePath}`);
        }

        console.log('使用火山引擎 ASR（文件上传方式）');
        console.log('  本地文件:', filePath);
        console.log('  文件大小:', (fs.statSync(filePath).size / 1024 / 1024).toFixed(2), 'MB');

        try {
            const out = await volcUploadAndRecognize(filePath, {
                apiKey: volcKey,
                uid: process.env.VOLC_ASR_UID || '豆包语音',
            });

            console.log('✅ 火山引擎识别成功，文本长度:', out.text.length, '字符');
            return out.text;
        } catch (error: any) {
            console.error('❌ 火山引擎识别失败:', error.message);
            throw error;
        }
    }

    // 1) 其次走 OpenAI 兼容 ASR（如果配置了）
    const hasASROpenAI = Boolean(process.env.ASR_API_KEY || process.env.OPENAI_API_KEY);
    if (hasASROpenAI) {
        const client = getASRClient();
        const model = process.env.ASR_WHISPER_MODEL || process.env.OPENAI_WHISPER_MODEL || 'whisper-1';

        const fileStream = fs.createReadStream(filePath);
        const result = await client.audio.transcriptions.create({
            file: fileStream as any,
            model,
        });

        return (result as any).text as string;
    }

    // 2) 最后回退腾讯云 ASR（短音频）
    const secretId = process.env.TENCENT_SECRET_ID || '';
    const secretKey = process.env.TENCENT_SECRET_KEY || '';
    if (!secretId || !secretKey) {
        throw new Error('未配置 VOLC_ASR_API_KEY/ASR_API_KEY/OPENAI_API_KEY，且缺少 TENCENT_SECRET_ID/TENCENT_SECRET_KEY，无法语音识别');
    }

    return await tencentShortASR(filePath, {
        secretId,
        secretKey,
        region: process.env.TENCENT_REGION || 'ap-guangzhou',
        endpoint: process.env.TENCENT_ASR_ENDPOINT || 'asr.tencentcloudapi.com',
    });
}

async function generateMinutes(transcript: string, meta: { title?: string; startTime?: string }) {
    const client = getLLMClient();
    const model =
        process.env.MOONSHOT_CHAT_MODEL ||
        process.env.OPENAI_CHAT_MODEL ||
        'moonshot-v1-128k';

    const system = `你是会议纪要助手。请基于转写内容生成结构化输出：\n- summary: 会议摘要（200字以内，中文）\n- todos: 待办数组。每条待办请用对象表示：{\"task\": string, \"owner\"?: string, \"due\"?: string, \"priority\"?: \"high\"|\"medium\"|\"low\"}。如果信息缺失可省略字段，不要编造。\n\n输出必须是严格 JSON，不要输出多余文本。`;

    const user = `会议标题：${meta.title || ''}\n会议开始时间：${meta.startTime || ''}\n\n转写内容：\n${transcript}`;

    const resp = await client.chat.completions.create({
        model,
        messages: [
            { role: 'system', content: system },
            { role: 'user', content: user },
        ],
        response_format: { type: 'json_object' } as any,
        temperature: 0.2,
    });

    const content = resp.choices?.[0]?.message?.content || '{}';
    let json: any = {};
    try {
        json = JSON.parse(content);
    } catch {
        const m = content.match(/\{[\s\S]*\}/);
        if (m) json = JSON.parse(m[0]);
    }

    const summary = String(json.summary || '');
    const rawTodos = Array.isArray(json.todos) ? json.todos : [];

    // 归一化：前端当前用 <span>{todo}</span>，因此这里保证 todos 为 string[]
    const todos = rawTodos.map((t: any) => {
        if (typeof t === 'string') return t;
        if (t && typeof t === 'object') {
            const task = String(t.task || t.title || t.todo || '').trim();
            const owner = String(t.owner || t.assignee || '').trim();
            const due = String(t.due || t.deadline || '').trim();
            const priority = String(t.priority || '').trim();

            const extra: string[] = [];
            if (owner) extra.push(`负责人:${owner}`);
            if (due) extra.push(`截止:${due}`);
            if (priority) extra.push(`优先级:${priority}`);

            return extra.length ? `${task}（${extra.join('，')}）` : task;
        }
        return String(t);
    }).filter((s: string) => s.trim().length > 0);

    return {
        summary,
        todos,
        key_points: Array.isArray(json.key_points) ? json.key_points.map((x: any) => String(x)) : [],
    };
}

export async function POST(req: Request) {
    try {
        const body = await req.json().catch(() => ({}));
        const meetingId = body.meetingId as string | undefined;
        const format = (body.format || 'audio') as 'audio' | 'video';
        let audioDirectUrl = body.audioDirectUrl as string | undefined;

        const recordTitle = body.title as string | undefined;
        const recordStartTime = body.startTime as string | undefined;

        const shouldTranscribe = Boolean(body.transcribe);
        const shouldRegenerate = Boolean(body.regenerate);

        if (!meetingId) {
            return NextResponse.json({ success: false, error: 'missing meetingId' }, { status: 400 });
        }

        // 重新生成纪要时不强制重新下载/转写；但仍返回 audioPath/audioUrl 以保持一致
        let matchDebug: any = null;

        if (!audioDirectUrl) {
            const mappings = loadCapturedMappings();
            const picked = pickDirectUrlByRecord(
                mappings,
                { title: recordTitle, startTime: recordStartTime },
                format,
            );
            audioDirectUrl = picked.url;
            matchDebug = picked.debug;
        }

        // 检查 audioDirectUrl 是否是假链接（dentryId=meeting_ 开头的）
        if (audioDirectUrl && audioDirectUrl.includes('dentryId=meeting_')) {
            console.log('⚠️ audioDirectUrl 是假链接，尝试从统一后端获取真实链接...');
            audioDirectUrl = undefined;
        }

        // 如果仍无有效链接，尝试通过统一后端的 Playwright 获取
        if (!audioDirectUrl && shouldTranscribe) {
            try {
                const rowIndex = body.rowIndex as number | undefined;
                const resp = await fetch('http://localhost:3001/api/meetings/audio-url', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ title: recordTitle, rowIndex }),
                });
                if (resp.ok) {
                    const data = await resp.json();
                    if (data.success && data.audioUrl) {
                        audioDirectUrl = data.audioUrl;
                        console.log('✓ 从统一后端获取到真实音频链接');
                    }
                }
            } catch (e) {
                console.log('统一后端 audio-url API 调用失败:', e);
            }
        }

        const audioPath = await meetingService.downloadMedia(meetingId, format, audioDirectUrl);

        let transcript = safeText(body.transcript);
        let summary = safeText(body.summary);
        let todos = Array.isArray(body.todos) ? body.todos : [];

        if (shouldRegenerate) {
            // 优先使用前端传入 transcript；否则从本地 latest 中取
            if (!transcript) {
                const latest = meetingService.getMeetingResultLatest({ title: recordTitle, startTime: recordStartTime });
                transcript = safeText(latest?.transcript);
            }
            if (!transcript) {
                throw new Error('缺少 transcript，无法重新生成纪要');
            }

            const minutes = await generateMinutes(transcript, { title: recordTitle, startTime: recordStartTime });
            summary = minutes.summary;
            todos = minutes.todos;

            meetingService.persistMeetingResult({
                meetingId,
                title: recordTitle,
                startTime: recordStartTime,
                transcript,
                summary,
                todos,
                audioPath,
            });
        } else if (shouldTranscribe) {
            if (!audioPath || !fs.existsSync(audioPath)) {
                throw new Error(`音频文件不存在，无法转录: ${audioPath}`);
            }

            // 验证音频文件有效性
            const audioStat = fs.statSync(audioPath);
            if (audioStat.size < 10000) {
                const head = fs.readFileSync(audioPath, 'utf-8').slice(0, 200);
                if (head.includes('<!doctype') || head.includes('<html')) {
                    // 清理无效文件
                    fs.unlinkSync(audioPath);
                    throw new Error(`音频文件无效（${audioStat.size} 字节，内容为 HTML），音频下载可能失败，请检查会议系统登录状态`);
                }
                throw new Error(`音频文件过小（${audioStat.size} 字节），可能下载不完整: ${audioPath}`);
            }

            transcript = await transcribeAudioWithWhisper(audioPath, audioDirectUrl);
            const minutes = await generateMinutes(transcript, { title: recordTitle, startTime: recordStartTime });
            summary = minutes.summary;
            todos = minutes.todos;

            meetingService.persistMeetingResult({
                meetingId,
                title: recordTitle,
                startTime: recordStartTime,
                transcript,
                summary,
                todos,
                audioPath,
            });
        }

        const audioUrl = `/api/meetings/download?meetingId=${encodeURIComponent(meetingId)}&format=${encodeURIComponent(format)}`;
        const isDev = process.env.NODE_ENV !== 'production';

        return NextResponse.json({
            success: true,
            meetingId,
            transcript,
            summary,
            todos,
            audioPath,
            audioUrl,
            audioDirectUrl,
            ...(isDev ? { matchDebug } : {}),
        });
    } catch (e: any) {
        return NextResponse.json({ success: false, error: e?.message || 'unknown error' }, { status: 500 });
    }
}
