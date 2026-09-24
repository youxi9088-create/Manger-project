interface RequirementRow {
    id: string;
    raw_input: string | null;
    ai_analysis: string | null;
    status: string;
    [key: string]: unknown;
}
export declare function computeRequirementStatus(req: RequirementRow): string;
export declare function enrichRequirement<T extends RequirementRow>(row: T): T & {
    computed_status: string;
};
export declare function createRequirement(input: Record<string, unknown>): Record<string, unknown>;
export declare function updateRequirement(id: string, input: Record<string, unknown>): Record<string, unknown> | null;
export declare function deleteRequirement(id: string): boolean;
export declare function createDevTask(input: Record<string, unknown>): Record<string, unknown>;
export declare function updateDevTask(id: string, input: Record<string, unknown>): Record<string, unknown> | null;
export declare function assignDevTask(taskId: string, employeeId: string): Record<string, unknown> | null;
export declare function deleteDevTask(id: string): boolean;
export {};
//# sourceMappingURL=requirement-service.d.ts.map