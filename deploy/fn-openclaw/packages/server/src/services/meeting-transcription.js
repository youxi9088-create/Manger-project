import fs from 'fs';
import path from 'path';
import { volcUploadAndRecognize } from './volc-asr.js';
function requiredEnv(...names) {
    for (const name of names) {
        const value = process.env[name]?.trim();
        if (value)
            return value;
    }
    return '';
}
function endpoint(baseUrl, suffix) {
    return `${baseUrl.replace(/\/$/, '')}${suffix}`;
}
export async function transcribeMeetingAudio(filePath, options = {}) {
    const volcApiKey = requiredEnv('VOLC_ASR_API_KEY');
    if (volcApiKey) {
        const result = await volcUploadAndRecognize(filePath, {
            apiKey: volcApiKey,
            uid: process.env.VOLC_ASR_UID || 'meeting-assistant',
            audioUrl: options.audioUrl,
        });
        return result.text;
    }
    const apiKey = requiredEnv('ASR_API_KEY', 'OPENAI_API_KEY');
    if (!apiKey) {
        throw new Error('未配置语音识别服务。请配置 VOLC_ASR_API_KEY，或配置 ASR_API_KEY/OPENAI_API_KEY。');
    }
    const baseUrl = requiredEnv('ASR_BASE_URL', 'OPENAI_BASE_URL') || 'https://api.openai.com/v1';
    const form = new FormData();
    form.append('file', new Blob([fs.readFileSync(filePath)]), path.basename(filePath));
    form.append('model', process.env.ASR_WHISPER_MODEL || process.env.OPENAI_WHISPER_MODEL || 'whisper-1');
    const response = await fetch(endpoint(baseUrl, '/audio/transcriptions'), {
        method: 'POST',
        headers: { Authorization: `Bearer ${apiKey}` },
        body: form,
    });
    const body = await response.text();
    if (!response.ok)
        throw new Error(`语音识别服务返回 ${response.status}: ${body.slice(0, 300)}`);
    let data;
    try {
        data = JSON.parse(body);
    }
    catch {
        throw new Error('语音识别服务返回了无效响应');
    }
    const transcript = String(data?.text || '').trim();
    if (!transcript)
        throw new Error('语音识别服务未返回转写文本');
    return transcript;
}
export async function generateMeetingMinutes(transcript, meta) {
    const apiKey = requiredEnv('MOONSHOT_API_KEY', 'LLM_API_KEY', 'OPENAI_API_KEY');
    if (!apiKey)
        throw new Error('未配置纪要生成服务。请配置 MOONSHOT_API_KEY、LLM_API_KEY 或 OPENAI_API_KEY。');
    const baseUrl = requiredEnv('MOONSHOT_BASE_URL', 'LLM_BASE_URL', 'OPENAI_BASE_URL') || 'https://api.moonshot.cn/v1';
    const model = process.env.MOONSHOT_CHAT_MODEL || process.env.OPENAI_CHAT_MODEL || 'moonshot-v1-128k';
    const response = await fetch(endpoint(baseUrl, '/chat/completions'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
        body: JSON.stringify({
            model,
            // The deployed Kimi model accepts only its default temperature value.
            temperature: 1,
            response_format: { type: 'json_object' },
            messages: [
                {
                    role: 'system',
                    content: '你是会议纪要助手。只能基于转写内容生成严格 JSON：{"summary":"200字以内的中文摘要","todos":["明确提到的待办"]}。不得补充或编造会议中未出现的信息。',
                },
                {
                    role: 'user',
                    content: `会议标题：${meta.title || ''}\n会议开始时间：${meta.startTime || ''}\n\n转写内容：\n${transcript}`,
                },
            ],
        }),
    });
    const body = await response.text();
    if (!response.ok)
        throw new Error(`纪要生成服务返回 ${response.status}: ${body.slice(0, 300)}`);
    let payload;
    try {
        payload = JSON.parse(body);
    }
    catch {
        throw new Error('纪要生成服务返回了无效响应');
    }
    const content = String(payload?.choices?.[0]?.message?.content || '{}');
    let minutes;
    try {
        minutes = JSON.parse(content);
    }
    catch {
        const match = content.match(/\{[\s\S]*\}/);
        if (!match)
            throw new Error('纪要生成服务未返回结构化纪要');
        minutes = JSON.parse(match[0]);
    }
    return {
        summary: String(minutes?.summary || '').trim(),
        todos: (Array.isArray(minutes?.todos) ? minutes.todos : [])
            .map((todo) => typeof todo === 'string' ? todo.trim() : '')
            .filter(Boolean),
    };
}
//# sourceMappingURL=meeting-transcription.js.map