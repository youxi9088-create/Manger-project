import type { Database as BetterSqliteDatabase } from 'better-sqlite3';
declare const db: BetterSqliteDatabase;
export interface DbSession {
    id: string;
    title: string;
    model: string;
    sdk_session_id: string | null;
    created_at: string;
    updated_at: string;
}
export interface DbMessage {
    id: string;
    session_id: string;
    role: 'user' | 'assistant';
    content: string;
    model: string | null;
    created_at: string;
    tool_calls: string | null;
}
export interface DbImSource {
    id: string;
    name: string;
    type: 'wechat_work' | 'wechat' | 'dingtalk' | 'feishu' | '99u' | '99u_web' | 'custom';
    config: string;
    enabled: number;
    last_sync_at: string | null;
    created_at: string;
    updated_at: string;
}
export interface DbChatRecord {
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
    is_mentioned: number;
    raw_data: string | null;
    synced_at: string;
}
export interface DbAnalysisReport {
    id: string;
    report_date: string;
    summary: string;
    work_priorities: string | null;
    completed_tasks: string | null;
    pending_tasks: string | null;
    key_decisions: string | null;
    follow_ups: string | null;
    meeting_notes: string | null;
    statistics: string | null;
    raw_chat_count: number;
    important_chat_count: number;
    created_at: string;
}
export interface DbScheduledTask {
    id: string;
    name: string;
    type: string;
    config: string | null;
    cron_expression: string;
    enabled: number;
    last_run_at: string | null;
    next_run_at: string | null;
    last_status: string | null;
    created_at: string;
    updated_at: string;
}
export declare function getAllSessions(): DbSession[];
export declare function getSession(id: string): DbSession | undefined;
export declare function createSession(session: DbSession): DbSession;
export declare function updateSession(id: string, updates: Partial<Pick<DbSession, 'title' | 'model' | 'sdk_session_id'>>): boolean;
export declare function deleteSession(id: string): boolean;
export declare function getMessagesBySession(sessionId: string): DbMessage[];
export declare function createMessage(message: DbMessage): DbMessage;
export declare function updateMessage(id: string, updates: Partial<Pick<DbMessage, 'content' | 'tool_calls'>>): boolean;
export declare function deleteMessage(id: string): boolean;
export declare function createMessages(messages: DbMessage[]): void;
export declare function clearAllData(): void;
export declare function getAllImSources(): DbImSource[];
export declare function getImSource(id: string): DbImSource | undefined;
export declare function createImSource(source: DbImSource): DbImSource;
export declare function updateImSource(id: string, updates: Partial<Pick<DbImSource, 'name' | 'type' | 'config' | 'enabled' | 'last_sync_at'>>): boolean;
export declare function deleteImSource(id: string): boolean;
export interface DbSourceConversation {
    id: string;
    source_id: string;
    conv_id: string;
    name: string | null;
    created_at: string;
}
export declare function getConversationsBySource(sourceId: string): DbSourceConversation[];
export declare function addConversationToSource(sourceId: string, convId: string, name?: string): DbSourceConversation | null;
export declare function removeConversationFromSource(sourceId: string, convId: string): boolean;
export declare function getChatRecords(options?: {
    sourceId?: string;
    startDate?: string;
    endDate?: string;
    senderName?: string;
    groupName?: string;
    isMentioned?: boolean;
    keyword?: string;
    limit?: number;
    offset?: number;
}): {
    records: DbChatRecord[];
    total: number;
};
export declare function getSavedU9Conversations(): {
    id: string;
    name: string;
}[];
export declare function getChatRecordsByDateRange(startDate: string, endDate: string): DbChatRecord[];
export declare function importChatRecords(records: DbChatRecord[]): {
    inserted: number;
    skipped: number;
};
export declare function deleteChatRecordsBySource(sourceId: string): number;
export declare function getAnalysisReports(options?: {
    startDate?: string;
    endDate?: string;
    limit?: number;
}): DbAnalysisReport[];
export declare function getAnalysisReportByDate(date: string): DbAnalysisReport | undefined;
export declare function createAnalysisReport(report: DbAnalysisReport): DbAnalysisReport;
export declare function deleteAnalysisReport(id: string): boolean;
export declare function getAllScheduledTasks(): DbScheduledTask[];
export declare function getScheduledTask(id: string): DbScheduledTask | undefined;
export declare function createScheduledTask(task: DbScheduledTask): DbScheduledTask;
export declare function updateScheduledTask(id: string, updates: Partial<Pick<DbScheduledTask, 'name' | 'type' | 'config' | 'cron_expression' | 'enabled' | 'last_run_at' | 'next_run_at' | 'last_status'>>): boolean;
export declare function deleteScheduledTask(id: string): boolean;
export declare function getChatStats(startDate?: string, endDate?: string): {
    total_messages: number;
    unique_senders: number;
    unique_groups: number;
    mentioned_count: number;
};
export declare function getTopSenders(startDate?: string, endDate?: string, limit?: number): {
    sender_name: string;
    message_count: number;
}[];
export declare function getTopGroups(startDate?: string, endDate?: string, limit?: number): {
    group_name: string;
    message_count: number;
}[];
export declare function fixMentioned(myName: string): {
    total: number;
    fixed: number;
};
export declare function saveMeetingIntelligence(meetingId: string, title: string | undefined, startTime: string | undefined, result: object): {
    id: string;
};
export declare function getMeetingIntelligence(meetingId: string): {
    id: string;
    meeting_id: string;
    title: string;
    start_time: string;
    result: string;
    created_at: string;
    updated_at: string;
} | undefined;
export declare function deleteMeetingIntelligence(meetingId: string): boolean;
export interface DbDailyPlan {
    date: string;
    goal_text: string;
    created_at: string;
    updated_at: string;
}
export interface DbDailyPlanTask {
    id: string;
    plan_date: string;
    title: string;
    status: 'pending' | 'in_progress' | 'blocked' | 'completed' | 'abandoned';
    priority: 'high' | 'medium' | 'low';
    assignee: string | null;
    estimate_minutes: number | null;
    notes: string | null;
    completed_at: string | null;
    expected_completion_at: string | null;
    source_date: string | null;
    sort_order: number;
    created_at: string;
    updated_at: string;
}
export declare function getDailyPlan(date: string): {
    plan: DbDailyPlan | null;
    tasks: DbDailyPlanTask[];
};
export declare function getDailyPlans(options?: {
    startDate?: string;
    endDate?: string;
    limit?: number;
}): {
    plan: DbDailyPlan;
    tasks: DbDailyPlanTask[];
}[];
export declare function upsertDailyPlan(date: string, goalText: string, tasks: Omit<DbDailyPlanTask, 'plan_date' | 'created_at' | 'updated_at'>[]): {
    plan: DbDailyPlan | null;
    tasks: DbDailyPlanTask[];
};
export declare function updateDailyPlanTask(taskId: string, updates: Partial<Pick<DbDailyPlanTask, 'title' | 'status' | 'priority' | 'assignee' | 'estimate_minutes' | 'notes' | 'completed_at' | 'expected_completion_at'>>): boolean;
export declare function deleteDailyPlanTask(taskId: string): boolean;
export declare function getUnfinishedDailyTasks(excludeDate: string, limitDays?: number): DbDailyPlanTask[];
export interface DbProject {
    id: string;
    type: 'quick_validation' | 'pre_to_formal';
    status: string;
    title: string | null;
    applicant: string | null;
    project_leader: string | null;
    department: string | null;
    project_type: string | null;
    demand_source: string | null;
    demand_date: string | null;
    from_pool: number;
    raw_requirement: string | null;
    ai_generated_content: string | null;
    deadline: string | null;
    start_date: string | null;
    completed_at: string | null;
    team_size_required: number;
    team_size_current: number;
    current_phase: string;
    phase_status: string;
    risk_level: 'low' | 'medium' | 'high';
    risk_reason: string | null;
    risk_alert_at: string | null;
    parent_project_id: string | null;
    external_project_id: string | null;
    vp: string | null;
    knowledge_base_path: string | null;
    created_at: string;
    updated_at: string;
}
export interface DbProjectMember {
    id: string;
    project_id: string;
    employee_id: string;
    role: 'owner' | 'leader' | 'member' | 'reviewer';
    joined_at: string;
    status: 'active' | 'left' | 'removed';
    work_hours_contributed: number;
}
export interface DbProjectPhaseLog {
    id: string;
    project_id: string;
    from_phase: string;
    to_phase: string;
    triggered_by: string | null;
    reason: string | null;
    created_at: string;
}
export declare function getProjects(options?: {
    mine?: string;
    phase?: string;
    risk?: string;
    search?: string;
    limit?: number;
    offset?: number;
}): {
    projects: DbProject[];
    total: number;
};
export declare function getProjectById(id: string): DbProject | undefined;
export declare function getProjectsByExternalId(externalProjectId: string): DbProject[];
export declare function updateProjectPhase(projectId: string, newPhase: string, triggeredBy?: string, reason?: string): boolean;
export declare function updateProjectPhaseStatus(projectId: string, phaseStatus: {
    initiation?: number;
    requirement?: number;
    planning?: number;
    execution?: number;
    delivery?: number;
}): boolean;
export declare function updateProject(projectId: string, updates: Partial<Omit<DbProject, 'id' | 'created_at' | 'updated_at'>>): boolean;
export declare function getProjectMembers(projectId: string): (DbProjectMember & {
    employee_name?: string;
    employee_avatar?: string;
})[];
export declare function addProjectMember(projectId: string, employeeId: string, role?: string): DbProjectMember | null;
export declare function getProjectStats(projectId: string): {
    task_total: number;
    task_done: number;
    task_in_progress: number;
    progress_percent: number;
    days_remaining: number | null;
    is_delayed: boolean;
    members_count: number;
};
export declare function syncProjectStatus(projectId: string): {
    updated: boolean;
    newPhase: string;
    newPhaseStatus: Record<string, number>;
    reason: string;
} | null;
export declare function syncAllProjectStatuses(): {
    projectId: string;
    result: NonNullable<ReturnType<typeof syncProjectStatus>>;
}[];
export declare function syncProjectInfoFromWorkflow(projectId: string): Promise<{
    success: boolean;
    updated: boolean;
    message: string;
    fields?: string[];
    proid?: string;
}>;
export declare function syncKnowledgeBaseForProjectInfo(proid: string, content: string, structuredData?: Record<string, any>, todoList?: string): {
    success: boolean;
    message: string;
    updatedFiles: string[];
};
export declare function getProjectPhaseLogs(projectId: string): DbProjectPhaseLog[];
export interface DbProjectStakeholder {
    id: string;
    project_id: string;
    person_name: string;
    person_category: string | null;
    role_in_project: string | null;
    notes: string | null;
    created_at: string;
}
export declare function getProjectStakeholders(projectId: string): DbProjectStakeholder[];
export declare function addProjectStakeholder(projectId: string, personName: string, personCategory?: string, roleInProject?: string, notes?: string): DbProjectStakeholder | null;
export declare function removeProjectStakeholder(projectId: string, personName: string): boolean;
export interface DbWorkflowOutput {
    id: number;
    source: string;
    type: string;
    title: string | null;
    content: string;
    metadata: string;
    created_at: string;
}
export declare function pushWorkflowOutput(source: string, content: string, type?: string, title?: string, metadata?: Record<string, any>): DbWorkflowOutput | null;
export declare function getWorkflowOutputs(options?: {
    source?: string;
    limit?: number;
    since?: string;
}): DbWorkflowOutput[];
export declare function getWorkflowOutputById(id: number): DbWorkflowOutput | undefined;
export declare function deleteWorkflowOutput(id: number): boolean;
export interface DbProjectInfoFile {
    id: number;
    proid: string;
    title: string | null;
    content: string;
    raw_content: string | null;
    ask: string | null;
    workflow_run_id: string | null;
    metadata: string;
    created_at: string;
    updated_at: string;
}
export declare function upsertProjectInfoFile(params: {
    proid: string;
    title?: string;
    content: string;
    raw_content?: string;
    ask?: string;
    workflow_run_id?: string;
    metadata?: Record<string, any>;
}): DbProjectInfoFile | null;
export declare function getProjectInfoFiles(options?: {
    proid?: string;
    limit?: number;
}): DbProjectInfoFile[];
export declare function getProjectInfoFileByProid(proid: string): DbProjectInfoFile | undefined;
export declare function deleteProjectInfoFile(proid: string): boolean;
export declare function createDailyUpdateLog(date: string, status: 'success' | 'partial' | 'error', report: string): void;
export declare function getRecentDailyUpdateLogs(limit?: number): any[];
export default db;
//# sourceMappingURL=db.d.ts.map