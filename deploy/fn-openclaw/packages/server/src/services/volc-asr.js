import crypto from 'crypto';
import fs from 'fs';
/**
 * 火山引擎语音识别。优先让服务端直接读取可访问的音频 URL，
 * 仅在没有 URL 时回退到本地文件的 base64 提交。
 * API文档: https://www.volcengine.com/docs/6561/80818
 */
export async function volcUploadAndRecognize(filePath, opts) {
    const submitUrl = process.env.VOLC_ASR_SUBMIT_URL || 'https://openspeech.bytedance.com/api/v3/auc/bigmodel/submit';
    const queryUrl = process.env.VOLC_ASR_QUERY_URL || 'https://openspeech.bytedance.com/api/v3/auc/bigmodel/query';
    const resourceId = process.env.VOLC_ASR_RESOURCE_ID || 'volc.seedasr.auc';
    const audioUrl = opts.audioUrl?.trim();
    const useRemoteUrl = Boolean(audioUrl && /^https?:\/\//i.test(audioUrl));
    if (audioUrl && !useRemoteUrl)
        throw new Error('会议音频地址不是有效的 HTTP(S) URL');
    console.log(`🎤 使用火山引擎识别: ${useRemoteUrl ? '远程音频地址' : filePath}`);
    let audioBase64 = '';
    if (!useRemoteUrl) {
        if (!fs.existsSync(filePath)) {
            throw new Error(`音频文件不存在: ${filePath}`);
        }
        const fileBuffer = fs.readFileSync(filePath);
        const fileSizeMB = (fileBuffer.length / 1024 / 1024).toFixed(2);
        console.log(`  本地文件大小: ${fileSizeMB} MB`);
        audioBase64 = fileBuffer.toString('base64');
    }
    // 优先依据已下载文件的实际扩展名。会议平台的直链通常没有扩展名，
    // 远程 URL 提交时通过 HEAD 的 Content-Type 判断真实格式（mp3_url 返回 audio/mpeg）。
    const sourceName = filePath || (useRemoteUrl ? audioUrl.split('?')[0] : '');
    const ext = sourceName.toLowerCase().split('.').pop() || 'mp3';
    const formatMap = { mp3: 'mp3', wav: 'wav', m4a: 'mp3', mp4: 'mp3', ogg: 'ogg' };
    let audioFormat = formatMap[ext] || 'mp3';
    if (useRemoteUrl) {
        audioFormat = 'mp4';
        try {
            const head = await fetch(audioUrl, { method: 'HEAD' });
            const contentType = (head.headers.get('content-type') || '').toLowerCase();
            if (contentType.includes('mpeg') || contentType.includes('mp3'))
                audioFormat = 'mp3';
            else if (contentType.includes('wav'))
                audioFormat = 'wav';
            else if (contentType.includes('ogg'))
                audioFormat = 'ogg';
            else if (contentType.includes('mp4') || contentType.includes('video'))
                audioFormat = 'mp4';
        }
        catch {
            // HEAD 失败时保持默认 mp4
        }
    }
    const requestId = crypto.randomUUID();
    // 1) 提交识别任务（v3 bigmodel API，JSON body）
    const submitBody = {
        user: { uid: opts.uid || process.env.VOLC_ASR_UID || 'meeting-assistant' },
        audio: {
            ...(useRemoteUrl ? { url: audioUrl } : { data: audioBase64 }),
            format: audioFormat,
            codec: audioFormat === 'mp3' ? 'mp3' : audioFormat,
            rate: 16000,
            bits: 16,
            channel: 1,
            language: 'zh-CN',
        },
        request: {
            model_name: 'bigmodel',
            enable_itn: true,
            enable_punc: true,
            enable_ddc: false,
            enable_speaker_info: false,
            show_utterances: true,
        },
    };
    console.log(`📤 提交任务到: ${submitUrl}`);
    const submitRes = await fetchVolcAsrWithRetry('提交', submitUrl, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'X-Api-Key': opts.apiKey,
            'X-Api-Resource-Id': resourceId,
            'X-Api-Request-Id': requestId,
            'X-Api-Sequence': '-1',
        },
        body: JSON.stringify(submitBody),
    });
    const submitLogId = submitRes.headers.get('x-tt-logid') || submitRes.headers.get('X-Tt-Logid') || '';
    const submitStatusCode = submitRes.headers.get('x-api-status-code') || submitRes.headers.get('X-Api-Status-Code') || '';
    const submitMessage = submitRes.headers.get('x-api-message') || submitRes.headers.get('X-Api-Message') || '';
    const submitText = await submitRes.text().catch(() => '');
    console.log(`📤 提交响应: http=${submitRes.status}, statusCode=${submitStatusCode}, logId=${submitLogId}`);
    if (submitText)
        console.log(`   body: ${submitText.slice(0, 200)}`);
    if (!submitRes.ok || (submitStatusCode && submitStatusCode !== '20000000')) {
        throw new Error(`火山引擎提交失败: http=${submitRes.status}, statusCode=${submitStatusCode}, message=${submitMessage}, body=${submitText.slice(0, 500)}`);
    }
    console.log(`✓ 识别任务已提交: requestId=${requestId}`);
    // 2) 轮询查询识别结果
    const timeoutMs = Number(process.env.VOLC_ASR_TIMEOUT_MS || '180000');
    const intervalMs = Number(process.env.VOLC_ASR_POLL_INTERVAL_MS || '1500');
    const started = Date.now();
    while (true) {
        if (Date.now() - started > timeoutMs) {
            throw new Error(`火山引擎识别超时 (${timeoutMs}ms), requestId=${requestId}`);
        }
        await sleep(intervalMs);
        const queryRes = await fetchVolcAsrWithRetry('查询', queryUrl, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'X-Api-Key': opts.apiKey,
                'X-Api-Resource-Id': resourceId,
                'X-Api-Request-Id': requestId,
            },
            body: JSON.stringify({}),
        });
        const logId = queryRes.headers.get('x-tt-logid') || queryRes.headers.get('X-Tt-Logid') || '';
        const statusCode = queryRes.headers.get('x-api-status-code') || queryRes.headers.get('X-Api-Status-Code') || '';
        const msg = queryRes.headers.get('x-api-message') || queryRes.headers.get('X-Api-Message') || '';
        const text = await queryRes.text();
        let json = {};
        try {
            json = text ? JSON.parse(text) : {};
        }
        catch {
            // not JSON
        }
        console.log(`🔄 查询状态: statusCode=${statusCode}, logId=${logId}`);
        // 20000001 = 处理中, 20000002 = 排队中
        if (statusCode === '20000001' || statusCode === '20000002') {
            continue;
        }
        // 20000000 = 成功
        if (statusCode === '20000000') {
            const finalText = json?.result?.text;
            if (!finalText) {
                const bodyPreview = JSON.stringify(json).slice(0, 800);
                throw new Error(`火山引擎识别成功但无 result.text: logId=${logId}, body=${bodyPreview}`);
            }
            console.log(`✅ 识别完成，文本长度: ${finalText.length} 字符`);
            return { requestId, text: String(finalText), raw: json };
        }
        // 其他状态码视为失败
        throw new Error(`火山引擎识别失败: statusCode=${statusCode}, message=${msg}, logId=${logId}, body=${text.slice(0, 500)}`);
    }
}
async function fetchVolcAsr(url, init) {
    const timeoutMs = Number(process.env.VOLC_ASR_REQUEST_TIMEOUT_MS || '90000');
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
        return await fetch(url, { ...init, signal: controller.signal });
    }
    catch (error) {
        if (controller.signal.aborted) {
            throw new Error(`火山引擎请求超时（${timeoutMs}ms）`);
        }
        throw error;
    }
    finally {
        clearTimeout(timer);
    }
}
async function fetchVolcAsrWithRetry(label, url, init) {
    const maxAttempts = Math.max(1, Number(process.env.VOLC_ASR_RETRY_ATTEMPTS || '3'));
    let lastError;
    for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
        try {
            const response = await fetchVolcAsr(url, init);
            if (!isTransientResponse(response.status) || attempt === maxAttempts)
                return response;
            console.warn(`火山引擎${label}暂时失败: http=${response.status}，将在 ${attempt} / ${maxAttempts} 次后重试`);
            await response.body?.cancel().catch(() => undefined);
        }
        catch (error) {
            lastError = error;
            if (attempt === maxAttempts)
                break;
            console.warn(`火山引擎${label}请求异常，将在 ${attempt} / ${maxAttempts} 次后重试`);
        }
        await sleep(1000 * attempt);
    }
    const detail = lastError instanceof Error ? lastError.message : String(lastError || '未知网络错误');
    throw new Error(`火山引擎${label}请求失败，已重试 ${maxAttempts} 次: ${detail}`);
}
function isTransientResponse(status) {
    return status === 408 || status === 429 || status === 500 || status === 502 || status === 503 || status === 504;
}
function sleep(ms) {
    return new Promise((r) => setTimeout(r, ms));
}
//# sourceMappingURL=volc-asr.js.map