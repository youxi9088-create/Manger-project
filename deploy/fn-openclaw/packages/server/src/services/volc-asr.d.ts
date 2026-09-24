export interface VolcASRUploadOptions {
    apiKey: string;
    appId?: string;
    uid?: string;
    audioUrl?: string;
}
/**
 * 火山引擎语音识别。优先让服务端直接读取可访问的音频 URL，
 * 仅在没有 URL 时回退到本地文件的 base64 提交。
 * API文档: https://www.volcengine.com/docs/6561/80818
 */
export declare function volcUploadAndRecognize(filePath: string, opts: VolcASRUploadOptions): Promise<{
    requestId: string;
    text: string;
    raw: any;
}>;
//# sourceMappingURL=volc-asr.d.ts.map