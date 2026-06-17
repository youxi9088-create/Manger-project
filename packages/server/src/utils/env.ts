import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { dirname } from "path";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// .env 文件路径（项目根目录）
export const envFilePath = path.resolve(__dirname, '..', '..', '..', '..', '.env');

// 运行时配置 JSON 文件路径（data 目录，Next.js 不监测）
export const configFilePath = path.resolve(__dirname, '..', '..', '..', '..', 'data', 'server-config.json');

function ensureConfigDir() {
  const dir = path.dirname(configFilePath);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

export function readRuntimeConfig(): Record<string, string> {
  try {
    if (!fs.existsSync(configFilePath)) return {};
    const raw = fs.readFileSync(configFilePath, 'utf-8');
    return JSON.parse(raw);
  } catch {
    return {};
  }
}

// 返回带配置的字符串，运行时配置优先于 .env（运行时配置放在前面，供 regex match 优先命中）
export function readEnvFileContent(): string {
  let content = '';

  const runtimeConfig = readRuntimeConfig();
  const runtimeLines = Object.entries(runtimeConfig)
    .filter(([, v]) => v !== undefined && v !== null)
    .map(([k, v]) => `${k}=${v}`);
  if (runtimeLines.length > 0) {
    content += runtimeLines.join('\n') + '\n';
  }

  try {
    if (fs.existsSync(envFilePath)) content += fs.readFileSync(envFilePath, 'utf-8');
  } catch (e) { console.error('[Env] 读取 .env 文件失败:', e); }

  return content;
}

// 读取单个配置值（优先返回运行时配置，其次 .env 中的值）
export function readConfig(key: string): string | undefined {
  const runtimeConfig = readRuntimeConfig();
  if (runtimeConfig[key] !== undefined) return runtimeConfig[key];
  try {
    if (fs.existsSync(envFilePath)) {
      const content = fs.readFileSync(envFilePath, 'utf-8');
      const match = content.match(new RegExp(`^${key}=(.*)`, 'm'));
      if (match) return match[1].trim();
    }
  } catch {}
  return undefined;
}

// 写入运行时配置到 data/server-config.json（不再写入 .env，避免 Next.js 重载）
export function persistEnvVar(key: string, value: string): void {
  try {
    ensureConfigDir();
    const config = readRuntimeConfig();
    config[key] = value;
    fs.writeFileSync(configFilePath, JSON.stringify(config, null, 2), 'utf-8');
    process.env[key] = value;
    console.log(`[Env] 已持久化 ${key} 到 data/server-config.json`);
  } catch (e) { console.error(`[Env] 写入 ${key} 失败:`, e); }
}

// 批量删除运行时配置
export function removeRuntimeConfig(keys: string[]): void {
  try {
    const config = readRuntimeConfig();
    for (const key of keys) delete config[key];
    fs.writeFileSync(configFilePath, JSON.stringify(config, null, 2), 'utf-8');
  } catch (e) { console.error('[Config] 删除失败:', e); }
}
