export declare const envFilePath: string;
export declare const configFilePath: string;
export declare function readRuntimeConfig(): Record<string, string>;
export declare function readEnvFileContent(): string;
export declare function readConfig(key: string): string | undefined;
export declare function persistEnvVar(key: string, value: string): void;
export declare function removeRuntimeConfig(keys: string[]): void;
//# sourceMappingURL=env.d.ts.map