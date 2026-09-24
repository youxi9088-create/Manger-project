/* OpenClaw design v1 共享样式常量 —— 项目模块 */

export const oc = {
  textPrimary: "text-[var(--oc-text-primary)]",
  textSecondary: "text-[var(--oc-text-secondary)]",
  textTertiary: "text-[var(--oc-text-tertiary)]",
  bgSurface: "bg-[var(--oc-bg-surface)]",
  bgElevated: "bg-[var(--oc-bg-elevated)]",
  bgHover: "bg-[var(--oc-bg-hover)]",
  bgRoot: "bg-[var(--oc-bg-root)]",
  borderSubtle: "border-[var(--oc-border-subtle)]",
  borderStrong: "border-[var(--oc-border-strong)]",
  accent: "text-[var(--oc-accent)]",
  accentBg: "bg-[var(--oc-accent)]",
  accentSoft: "bg-[var(--oc-accent-soft)]",
  accentBorder: "border-[rgba(201,168,108,0.22)]",
  successSoft: "bg-[var(--oc-success-soft)]",
  success: "text-[var(--oc-success)]",
  successBorder: "border-[rgba(106,158,127,0.22)]",
  warningSoft: "bg-[var(--oc-warning-soft)]",
  warning: "text-[var(--oc-warning)]",
  warningBorder: "border-[rgba(201,163,92,0.22)]",
  errorSoft: "bg-[var(--oc-error-soft)]",
  error: "text-[var(--oc-error)]",
  errorBorder: "border-[rgba(201,123,109,0.22)]",
  infoSoft: "bg-[var(--oc-info-soft)]",
  info: "text-[var(--oc-info)]",
  infoBorder: "border-[rgba(122,159,201,0.22)]",
} as const;

export const cardSurface =
  `${oc.bgSurface} ${oc.borderSubtle} rounded-[14px] border shadow-sm`;

export const cardHover =
  "transition-all duration-180 hover:border-[var(--oc-border-strong)] hover:shadow-[0_4px_16px_rgba(0,0,0,0.32)]";

export const cardInteractive = `${cardSurface} ${cardHover} hover:-translate-y-[1px] cursor-pointer`;

export const metricCard =
  `${cardSurface} p-[18px] transition-all duration-180 hover:border-[var(--oc-border-strong)] hover:bg-[var(--oc-bg-elevated)]`;

export const pageHeader =
  "flex items-end justify-between mb-6 flex-wrap gap-4";

export const pageTitle =
  "text-2xl font-bold tracking-[-0.02em] text-[var(--oc-text-primary)]";

export const pageSubtitle =
  "mt-1.5 text-[13px] text-[var(--oc-text-secondary)]";

export const btnPrimary =
  "bg-[var(--oc-accent)] text-[var(--oc-bg-root)] hover:bg-[var(--oc-accent-hover)] hover:-translate-y-[1px] rounded-[10px] font-semibold border-transparent shadow-[0_1px_0_rgba(255,255,255,0.12)_inset,0_1px_2px_rgba(0,0,0,0.24)]";

export const btnSecondary =
  "bg-[var(--oc-bg-elevated)] text-[var(--oc-text-primary)] border-[var(--oc-border-subtle)] hover:bg-[var(--oc-bg-hover)] hover:border-[var(--oc-border-strong)] rounded-[10px] font-semibold";

export const btnGhost =
  "text-[var(--oc-text-secondary)] hover:text-[var(--oc-text-primary)] hover:bg-[var(--oc-bg-hover)] rounded-[10px] font-semibold";

export const inputOc =
  "bg-[var(--oc-bg-elevated)] border-[var(--oc-border-subtle)] text-[var(--oc-text-primary)] placeholder:text-[var(--oc-text-tertiary)] rounded-[10px] focus:border-[var(--oc-accent)] focus:ring-[var(--oc-accent-soft)]";

export const tabsListOc =
  "w-full justify-start gap-1 rounded-none border-b border-[var(--oc-border-subtle)] bg-transparent p-0 h-auto";

export const tabsTriggerOc =
  "rounded-none border-b-2 border-transparent bg-transparent px-3.5 py-2.5 text-[13px] font-semibold text-[var(--oc-text-secondary)] hover:text-[var(--oc-text-primary)] data-[state=active]:border-[var(--oc-accent)] data-[state=active]:text-[var(--oc-accent)] data-[state=active]:shadow-none data-[state=active]:bg-transparent";

export const PHASE_STYLES: Record<string, { label: string; classes: string }> = {
  draft: { label: "草稿", classes: `${oc.bgHover} ${oc.textSecondary} ${oc.borderSubtle}` },
  submitted: { label: "待审批", classes: `${oc.warningSoft} ${oc.warning} ${oc.warningBorder}` },
  approved: { label: "已批准", classes: `${oc.infoSoft} ${oc.info} ${oc.infoBorder}` },
  planning: { label: "规划中", classes: `${oc.infoSoft} ${oc.info} ${oc.infoBorder}` },
  plan_locked: { label: "计划锁定", classes: `${oc.infoSoft} ${oc.info} ${oc.infoBorder}` },
  recruiting: { label: "招募中", classes: `${oc.bgHover} ${oc.textSecondary} ${oc.borderSubtle}` },
  executing: { label: "执行中", classes: `${oc.warningSoft} ${oc.warning} ${oc.warningBorder}` },
  delivering: { label: "交付中", classes: `${oc.accentSoft} ${oc.accent} ${oc.accentBorder}` },
  reviewing: { label: "验收中", classes: `${oc.infoSoft} ${oc.info} ${oc.infoBorder}` },
  accepted: { label: "已完成", classes: `${oc.successSoft} ${oc.success} ${oc.successBorder}` },
  rejected: { label: "已驳回", classes: `${oc.errorSoft} ${oc.error} ${oc.errorBorder}` },
  archived: { label: "已归档", classes: `${oc.bgHover} ${oc.textSecondary} ${oc.borderSubtle}` },
};

export const RISK_STYLES: Record<string, { label: string; classes: string }> = {
  high: { label: "高风险", classes: `${oc.errorSoft} ${oc.error} ${oc.errorBorder}` },
  medium: { label: "中风险", classes: `${oc.warningSoft} ${oc.warning} ${oc.warningBorder}` },
  low: { label: "低风险", classes: `${oc.successSoft} ${oc.success} ${oc.successBorder}` },
};

export const VERSION_STATUS_STYLES: Record<string, { label: string; classes: string }> = {
  pending_confirm: { label: "待确认", classes: `${oc.bgHover} ${oc.textSecondary} ${oc.borderSubtle}` },
  confirmed: { label: "已确认", classes: `${oc.infoSoft} ${oc.info} ${oc.infoBorder}` },
  in_progress: { label: "进行中", classes: `${oc.infoSoft} ${oc.info} ${oc.infoBorder}` },
  testing: { label: "测试中", classes: `${oc.warningSoft} ${oc.warning} ${oc.warningBorder}` },
  ready_release: { label: "待发布", classes: `${oc.accentSoft} ${oc.accent} ${oc.accentBorder}` },
  released: { label: "已发布", classes: `${oc.successSoft} ${oc.success} ${oc.successBorder}` },
  delayed: { label: "已延期", classes: `${oc.errorSoft} ${oc.error} ${oc.errorBorder}` },
};

export const PRIORITY_STYLES: Record<string, { label: string; classes: string }> = {
  high: { label: "P0", classes: `${oc.errorSoft} ${oc.error} ${oc.errorBorder}` },
  medium: { label: "P1", classes: `${oc.warningSoft} ${oc.warning} ${oc.warningBorder}` },
  low: { label: "P2", classes: `${oc.infoSoft} ${oc.info} ${oc.infoBorder}` },
};
