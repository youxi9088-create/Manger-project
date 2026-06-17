import { Router } from "express";
import { unstable_v2_authenticate, unstable_v2_createSession } from "@tencent-ai/agent-sdk";
import { readEnvFileContent, persistEnvVar } from "../utils/env.js";
import { cachedModels, clearCachedModels, defaultModel } from "../utils/agent-sdk.js";

const router = Router();

// ============= 登录和认证 =============

type LoginMethod = 'env' | 'cli' | 'none';

interface LoginStatusResponse {
  isLoggedIn: boolean;
  method?: LoginMethod;
  envConfigured?: boolean;
  cliConfigured?: boolean;
  error?: string;
  apiKey?: string;
  envVars?: {
    apiKey?: string;
    authToken?: string;
    internetEnv?: string;
    baseUrl?: string;
  };
}

router.get("/api/check-login", async (req, res) => {
  const response: LoginStatusResponse = {
    isLoggedIn: false,
    envConfigured: false,
    cliConfigured: false,
    envVars: {},
  };

  const apiKey = process.env.CODEBUDDY_API_KEY;
  const authToken = process.env.CODEBUDDY_AUTH_TOKEN;
  const internetEnv = process.env.CODEBUDDY_INTERNET_ENVIRONMENT;
  const baseUrl = process.env.CODEBUDDY_BASE_URL;

  if (apiKey || authToken) {
    response.envConfigured = true;
    if (apiKey) {
      response.envVars!.apiKey = apiKey.slice(0, 8) + '****' + apiKey.slice(-4);
      response.apiKey = response.envVars!.apiKey;
    }
    if (authToken) response.envVars!.authToken = authToken.slice(0, 8) + '****' + authToken.slice(-4);
    if (internetEnv) response.envVars!.internetEnv = internetEnv;
    if (baseUrl) response.envVars!.baseUrl = baseUrl;
  }

  try {
    let needsLogin = false;
    const result = await unstable_v2_authenticate({
      environment: 'external',
      onAuthUrl: async () => { needsLogin = true; }
    });

    if (!needsLogin) {
      response.isLoggedIn = true;
      response.cliConfigured = true;
      response.method = response.envConfigured ? 'env' : 'cli';
    }
  } catch (error: any) {
    if (response.envConfigured) {
      response.isLoggedIn = true;
      response.method = 'env';
    } else {
      response.error = '请在 .env 文件中配置 CODEBUDDY_API_KEY，或运行 codebuddy login';
      response.method = 'none';
    }
  }

  res.json(response);
});

// 保存环境变量配置
router.post("/api/save-env-config", (req, res) => {
  const { apiKey, authToken, internetEnv, baseUrl } = req.body;

  if (!apiKey && !authToken) {
    return res.status(400).json({ error: '请至少配置 API Key 或 Auth Token' });
  }

  const configuredVars: string[] = [];
  if (apiKey) {
    process.env.CODEBUDDY_API_KEY = apiKey;
    persistEnvVar('CODEBUDDY_API_KEY', apiKey);
    configuredVars.push('CODEBUDDY_API_KEY');
  }
  if (authToken) {
    process.env.CODEBUDDY_AUTH_TOKEN = authToken;
    persistEnvVar('CODEBUDDY_AUTH_TOKEN', authToken);
    configuredVars.push('CODEBUDDY_AUTH_TOKEN');
  }
  if (internetEnv) {
    process.env.CODEBUDDY_INTERNET_ENVIRONMENT = internetEnv;
    persistEnvVar('CODEBUDDY_INTERNET_ENVIRONMENT', internetEnv);
    configuredVars.push('CODEBUDDY_INTERNET_ENVIRONMENT');
  }
  if (baseUrl) {
    process.env.CODEBUDDY_BASE_URL = baseUrl;
    persistEnvVar('CODEBUDDY_BASE_URL', baseUrl);
    configuredVars.push('CODEBUDDY_BASE_URL');
  }

  clearCachedModels();
  res.json({ success: true, message: `已设置并持久化: ${configuredVars.join(', ')}` });
});

// 获取可用模型列表
router.get("/api/models", async (req, res) => {
  try {
    if (cachedModels.length === 0) {
      const session = await unstable_v2_createSession({ cwd: process.cwd() });
      const models = await session.getAvailableModels();
      if (models && Array.isArray(models)) {
        // 直接修改导入的数组内容
        cachedModels.splice(0, cachedModels.length, ...models);
      }
    }
    res.json({
      models: cachedModels.length > 0 ? cachedModels : [{ modelId: "claude-sonnet-4", name: "Claude Sonnet 4" }],
      defaultModel
    });
  } catch (error: any) {
    res.json({
      models: [
        { modelId: "claude-sonnet-4", name: "Claude Sonnet 4" },
        { modelId: "claude-opus-4", name: "Claude Opus 4" }
      ],
      defaultModel,
      error: error?.message || String(error)
    });
  }
});

export default router;
