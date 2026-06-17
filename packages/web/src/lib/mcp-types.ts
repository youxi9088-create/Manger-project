
export interface Task {
  id: string;
  sourceTableId?: string;
  fields: {
    "需求名称": string;
    "所属项目": string;
    "工时": number;
    "负责人": string;
    "下单字段": "是" | "否";
    "下单时间"?: number;
    "下单链接"?: string;
    "OA系统ID/链接"?: string;
    "uuid"?: string;
    "完成时间"?: string;
    "更新时间"?: string;
    "任务详情"?: string;
  };
}

export interface AutomationConfig {
  feishu: {
    appId: string;
    appSecret: string;
    appToken: string;
    tableId: string;
  };
  oa: {
    url: string;
    username: string;
    password: string;
  };
}

export interface FieldMapping {
  oaFieldName: string;
  feishuField: string;
  rule: 'copy' | 'date_format' | 'person_search';
}

export interface FeishuTable {
  id: string;
  name: string;
}

export enum AutomationStatus {
  IDLE = 'IDLE',
  FETCHING_FEISHU = 'FETCHING_FEISHU',
  LOGGING_IN_OA = 'LOGGING_IN_OA',
  PROCESSING_TASKS = 'PROCESSING_TASKS',
  COMPLETING = 'COMPLETING',
  ERROR = 'ERROR'
  
}

export interface LogEntry {
  timestamp: string;
  type: 'info' | 'success' | 'warning' | 'error';
  message: string;
}


export const STORAGE_KEY_CONFIG = 'mcp_automation_config_v1';
export const STORAGE_KEY_TASKS = 'mcp_automation_tasks_v1';
