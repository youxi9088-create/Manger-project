import crypto from 'crypto';
import fs from 'fs';

export interface VolcASRUploadOptions {
    apiKey: string;
    appId?: string;
    uid?: string;
}

/**
 * 火山引擎语音识别 - 文件上传方式（适用于本地音频文件）
 * 使用 v3 bigmodel API，将本地文件 base64 编码后通过 JSON body 提交
 * API文档: https://www.volcengine.com/docs/6561/80818
 */
export async function volcUploadAndRecognize(
    filePath: string,
    opts: VolcASRUploadOptions,
): Promise<{ requestId: string; text: string; raw: any }> {
    const submitUrl = process.env.VOLC_ASR_SUBMIT_URL || 'https://openspeech.bytedance.com/api/v3/auc/bigmodel/submit';
    const queryUrl = process.env.VOLC_ASR_QUERY_URL || 'https://openspeech.bytedance.com/api/v3/auc/bigmodel/query';
    const resourceId = process.env.VOLC_ASR_RESOURCE_ID || 'volc.seedasr.auc';

    const requestId = crypto.randomUUID();

    console.log(`🎤 使用火山引擎文件上传方式识别: ${filePath}`);

    // 读取本地文件并 base64 编码
    if (!fs.existsSync(filePath)) {
        throw new Error(`音频文件不存在: ${filePath}`);
    }

    const fileBuffer = fs.readFileSync(filePath);
    const fileSizeMB = (fileBuffer.length / 1024 / 1024).toFixed(2);
    console.log(`  文件大小: ${fileSizeMB} MB`);

    const audioBase64 = fileBuffer.toString('base64');

    // 根据文件扩展名推断格式
    const ext = filePath.toLowerCase().split('.').pop() || 'mp3';
    const formatMap: Record<string, string> = { mp3: 'mp3', wav: 'wav', m4a: 'mp3', mp4: 'mp3', ogg: 'ogg' };
    const audioFormat = formatMap[ext] || 'mp3';

    // 1) 提交识别任务（v3 bigmodel API，JSON body）
    const submitBody = {
        user: { uid: opts.uid || process.env.VOLC_ASR_UID || 'meeting-assistant' },
        audio: {
            data: audioBase64,
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

    const submitRes = await fetch(submitUrl, {
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
    if (submitText) console.log(`   body: ${submitText.slice(0, 200)}`);

    if (!submitRes.ok || (submitStatusCode && submitStatusCode !== '20000000')) {
        throw new Error(
            `火山引擎提交失败: http=${submitRes.status}, statusCode=${submitStatusCode}, message=${submitMessage}, body=${submitText.slice(0, 500)}`
        );
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

        const queryRes = await fetch(queryUrl, {
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
        let json: any = {};
        try {
            json = text ? JSON.parse(text) : {};
        } catch {
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
        throw new Error(
            `火山引擎识别失败: statusCode=${statusCode}, message=${msg}, logId=${logId}, body=${text.slice(0, 500)}`
        );
    }
}

function sleep(ms: number) {
    return new Promise((r) => setTimeout(r, ms));
}
