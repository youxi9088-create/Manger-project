// MCP 自动下单共享类型（原 mcp/types.ts）

export interface Task {
  id: string;
  title: string;
  feishuRecordId: string;
  feishuFields: Record<string, any>;
  oaFields: Record<string, string>;
  status: 'pending' | 'running' | 'success' | 'error' | 'skipped';
  error?: string;
  createdAt: string;
  completedAt?: string;
}

export interface AutomationConfig {
  feishu: {
    appId: string;
    appSecret: string;
    tableId: string;
    viewId?: string;
  };
  oa: {
    baseUrl: string;
    username: string;
    password: string;
  };
  mapping: FieldMapping[];
}

export interface FieldMapping {
  feishuField: string;
  oaField: string;
  transform?: string;
}
