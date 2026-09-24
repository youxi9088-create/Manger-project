import { getProjectById, updateProject, addProjectMember, syncProjectStatus } from "./db.js";
export declare function createProjectInitiation(input: Record<string, unknown>): Record<string, unknown>;
export declare function updateProjectInitiation(id: string, input: Record<string, unknown>): Record<string, unknown> | null;
export declare function submitProjectInitiation(id: string): Record<string, unknown> | null;
export declare function deleteProjectInitiation(id: string): boolean;
export declare function transitionProjectPhase(id: string, action: string, reason?: string, triggeredBy?: string): {
    success: boolean;
    newPhase?: string;
    error?: string;
};
export { getProjectById, updateProject, addProjectMember, syncProjectStatus };
//# sourceMappingURL=project-service.d.ts.map