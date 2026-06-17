// 会议相关共享类型

export interface MeetingRecord {
  meetingId: string;
  title: string;
  startTime: string;
  recorder?: string;
  duration?: string;
  fileSize?: string;
  audioUrl?: string;
  status: 'pending' | 'downloading' | 'transcribing' | 'generating' | 'done' | 'error';
  transcript?: string;
  summary?: string;
  todos?: string[];
  audioPath?: string;
}

export interface MeetingResult {
  key: string;
  meetingId?: string;
  title?: string;
  startTime?: string;
  updatedAt: string;
  transcript?: string;
  summary?: string;
  todos?: string[];
  audioPath?: string;
  versions?: MeetingVersion[];
}

export interface MeetingVersion {
  versionId: string;
  createdAt: string;
  transcript?: string;
  summary?: string;
  todos?: string[];
}
