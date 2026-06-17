/**
 * 类型定义
 */

export type PermissionMode = 'default' | 'acceptEdits' | 'plan' | 'bypassPermissions';

export interface Model {
  modelId: string;
  name: string;
  description?: string;
}

export interface ToolCall {
  id: string;
  name: string;
  input?: Record<string, unknown>;
  status: 'running' | 'completed' | 'error';
  result?: string;
  isError?: boolean;
}

/**
 * 内容块类型 - 支持文字和工具调用按顺序排列
 */
export type ContentBlock = 
  | { type: 'text'; text: string }
  | { type: 'tool_use'; toolCall: ToolCall };

export interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;  // 保留用于兼容，存储纯文本摘要
  model?: string;
  timestamp: Date;
  isStreaming?: boolean;
  toolCalls?: ToolCall[];  // 保留用于兼容
  contentBlocks?: ContentBlock[];  // 新增：按顺序排列的内容块
}

export interface Session {
  id: string;
  title: string;
  model: string;
  agentId?: string;
  cwd?: string;
  permissionMode?: PermissionMode;
  createdAt: Date;
  messages: Message[];
}

export interface CustomAgent {
  id: string;
  name: string;
  description?: string;
  systemPrompt: string;
  icon?: string;
  color?: string;
  permissionMode?: PermissionMode;
  createdAt: Date;
  updatedAt: Date;
}

// Agent 是 CustomAgent 的别名
export type Agent = CustomAgent;

export type Theme = 'light' | 'dark';

// ============= IM 分析相关类型 =============

export interface ImSource {
  id: string;
  name: string;
  type: 'wechat_work' | 'wechat' | 'dingtalk' | 'feishu' | '99u' | '99u_web' | 'custom';
  config: Record<string, any>;
  enabled: boolean;
  last_sync_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface SourceConversation {
  id: string;
  source_id: string;
  conv_id: string;
  name: string | null;
  created_at: string;
}

export interface ChatRecord {
  id: string;
  source_id: string;
  im_message_id: string | null;
  sender_name: string;
  sender_id: string | null;
  group_name: string | null;
  group_id: string | null;
  content: string;
  message_type: string;
  timestamp: string;
  is_mentioned: boolean;
  synced_at: string;
}

export interface AnalysisReport {
  id: string;
  report_date: string;
  summary: string;
  work_priorities: string[];
  completed_tasks: Array<{ task: string; detail: string; group?: string; participants?: string[] }>;
  pending_tasks: Array<{ task: string; priority: string; deadline?: string; group?: string; owner?: string }>;
  key_decisions: Array<{ decision: string; participants: string[]; impact: string; group?: string }>;
  follow_ups: Array<{ item: string; person: string; deadline?: string; group?: string }>;
  meeting_notes: Array<{ meeting: string; topic: string; outcome: string; group?: string }>;
  group_summaries?: Array<{ group: string; summary: string; key_topics?: string[]; active_members?: string[] }>;
  sender_activities?: Array<{ sender: string; groups?: string[]; main_activities?: string[]; todo_items?: string[] }>;
  statistics: {
    totalMessages: number;
    uniqueSenders: number;
    topSenders: Array<{ sender_name: string; message_count: number }>;
  } | null;
  raw_chat_count: number;
  important_chat_count: number;
  created_at: string;
}

export interface ScheduledTask {
  id: string;
  name: string;
  cron_expression: string;
  enabled: boolean;
  last_run_at: string | null;
  next_run_at: string | null;
  last_status: string | null;
  created_at: string;
  updated_at: string;
}

export interface ChatStats {
  stats: {
    total_messages: number;
    unique_senders: number;
    unique_groups: number;
    mentioned_count: number;
  };
  topSenders: Array<{ sender_name: string; message_count: number }>;
  topGroups: Array<{ group_name: string; message_count: number }>;
  last7Days: Array<{ date: string; dayName: string; messages: number }>;
}

/**
 * 权限请求 - 用于工具调用确认
 */
export interface PermissionRequest {
  requestId: string;
  toolUseId: string;
  toolName: string;
  input: Record<string, unknown>;
  sessionId: string;
  timestamp: number;
}

/**
 * 权限响应
 */
export interface PermissionResponse {
  requestId: string;
  behavior: 'allow' | 'deny';
  message?: string;
}
