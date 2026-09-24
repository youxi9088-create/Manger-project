import crypto from 'crypto';
import fs from 'fs';
function sha256Hex(data) {
    return crypto.createHash('sha256').update(data).digest('hex');
}
function hmacSha256(key, data) {
    return crypto.createHmac('sha256', key).update(data).digest();
}
function toUTCDate(date = new Date()) {
    // YYYY-MM-DD
    return date.toISOString().slice(0, 10);
}
function buildTC3AuthHeader(params) {
    const { secretId, secretKey, service, host, action, version, region, payload, timestamp } = params;
    const algorithm = 'TC3-HMAC-SHA256';
    const date = toUTCDate(new Date(timestamp * 1000));
    const httpRequestMethod = 'POST';
    const canonicalUri = '/';
    const canonicalQueryString = '';
    const canonicalHeaders = `content-type:application/json; charset=utf-8\nhost:${host}\n`;
    const signedHeaders = 'content-type;host';
    const hashedRequestPayload = sha256Hex(payload);
    const canonicalRequest = [
        httpRequestMethod,
        canonicalUri,
        canonicalQueryString,
        canonicalHeaders,
        signedHeaders,
        hashedRequestPayload,
    ].join('\n');
    const credentialScope = `${date}/${service}/tc3_request`;
    const stringToSign = [algorithm, String(timestamp), credentialScope, sha256Hex(canonicalRequest)].join('\n');
    const secretDate = hmacSha256(`TC3${secretKey}`, date);
    const secretService = hmacSha256(secretDate, service);
    const secretSigning = hmacSha256(secretService, 'tc3_request');
    const signature = crypto.createHmac('sha256', secretSigning).update(stringToSign).digest('hex');
    const authorization = `${algorithm} ` +
        `Credential=${secretId}/${credentialScope}, ` +
        `SignedHeaders=${signedHeaders}, ` +
        `Signature=${signature}`;
    const headers = {
        Authorization: authorization,
        'Content-Type': 'application/json; charset=utf-8',
        Host: host,
        'X-TC-Action': action,
        'X-TC-Timestamp': String(timestamp),
        'X-TC-Version': version,
        'X-TC-Region': region,
    };
    return headers;
}
export async function tencentShortASR(audioFilePath, opts) {
    const endpoint = opts.endpoint || 'asr.tencentcloudapi.com';
    const service = 'asr';
    const action = 'SentenceRecognition';
    const version = '2019-06-14';
    const region = opts.region || 'ap-guangzhou';
    const audio = fs.readFileSync(audioFilePath);
    const base64 = audio.toString('base64');
    const payloadObj = {
        EngSerViceType: '16k_zh',
        SourceType: 1,
        VoiceFormat: 'mp3',
        Data: base64,
        DataLen: audio.length,
        // 可选：热词、过滤等
    };
    const payload = JSON.stringify(payloadObj);
    const timestamp = Math.floor(Date.now() / 1000);
    const headers = buildTC3AuthHeader({
        secretId: opts.secretId,
        secretKey: opts.secretKey,
        service,
        host: endpoint,
        action,
        version,
        region,
        payload,
        timestamp,
    });
    const res = await fetch(`https://${endpoint}`, {
        method: 'POST',
        headers,
        body: payload,
    });
    const text = await res.text();
    if (!res.ok) {
        throw new Error(`Tencent ASR HTTP ${res.status}: ${text.slice(0, 500)}`);
    }
    const json = JSON.parse(text);
    const result = json?.Response?.Result;
    if (!result) {
        throw new Error(`Tencent ASR 响应无 Result: ${text.slice(0, 500)}`);
    }
    return String(result);
}
//# sourceMappingURL=tencent-asr.js.map