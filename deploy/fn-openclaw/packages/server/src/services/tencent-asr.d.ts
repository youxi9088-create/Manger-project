export interface TencentASROptions {
    secretId: string;
    secretKey: string;
    region?: string;
    endpoint?: string;
    language?: string;
}
export declare function tencentShortASR(audioFilePath: string, opts: TencentASROptions): Promise<string>;
//# sourceMappingURL=tencent-asr.d.ts.map