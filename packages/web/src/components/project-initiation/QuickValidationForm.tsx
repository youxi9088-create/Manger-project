"use client";

import { useState, useEffect, useCallback } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Separator } from "@/components/ui/separator";
import {
  Loader2,
  Sparkles,
  Save,
  Send,
  CheckCircle,
  XCircle,
} from "lucide-react";

const API_BASE = process.env.NEXT_PUBLIC_SERVER_API || (process.env.NODE_ENV === "production" ? "/a/openclaw" : "http://localhost:3001");

interface AiGeneratedContent {
  title?: string;
  project_type?: string;
  demand_source?: string;
  why_do_it?: string;
  expected_effect?: string;
  project_overview?: {
    requirement?: string;
    core_function?: string;
    user_scenario?: string;
    company_value?: string;
    user_value?: string;
  };
  target_market?: string;
  self_check?: Record<string, { answer: boolean; note: string }>;
  topic_overview?: string;
  topic_type?: string;
  topic_value?: string;
  topic_acceptance?: string;
  business_type?: string;
  business_domain_l1?: string;
  business_domain_l2?: string;
}

interface FormData {
  title: string;
  applicant: string;
  applicant_department: string;
  project_leader: string;
  department: string;
  project_initiator: string;
  project_type: string;
  business_type: string;
  business_domain_l1: string;
  business_domain_l2: string;
  pre_initiation_type: string;
  start_date: string;
  deadline: string;
  duration_days: string;
  is_linked_parent: boolean;
  is_dj_required: boolean;
  demand_source: string;
  demand_date: string;
  from_pool: boolean;
  raw_requirement: string;
  why_do_it: string;
  expected_effect: string;
  overview_requirement: string;
  overview_core_function: string;
  overview_user_scenario: string;
  overview_company_value: string;
  overview_user_value: string;
  target_market: string;
  topic_overview: string;
  topic_type: string;
  topic_value: string;
  topic_acceptance: string;
  vp_name: string;
  cc_list: string;
  remarks: string;
  self_check: Record<string, { answer: boolean; note: string }>;
}

const SELF_CHECK_LABELS: Record<string, string> = {
  precondition_met: "1. 本项目的前置条件是否满足？",
  familiar_field: "2. 是公司擅长、熟悉的领域吗？风险小，成功率高吗？",
  cost_competitive: "3. 与主要竞争对手相比，公司是否愿意拿出差不多量级的成本去竞争？",
  policy_favorable: "4. 当前相关的政策是否明朗，对项目有利吗？",
  team_ready: "5. 公司内是否有成熟的团队可以承接？",
  top_priority: "6. 是否是自身能力范围内，可以承接的最重要、优先级最高的项目？",
  user_risk_handled: "7. 确认在使用中用户最介意的问题，我们能够处理好？",
  confirm_start: "8. 是否确定要启动本项目？",
};

const DEFAULT_SELF_CHECK: Record<string, { answer: boolean; note: string }> = Object.fromEntries(
  Object.keys(SELF_CHECK_LABELS).map((k) => [k, { answer: true, note: "" }])
);

const today = () => new Date().toISOString().slice(0, 10);

interface Props {
  initiationId: string;
  onSaved?: () => void;
  onSubmitted?: () => void;
}

export function QuickValidationForm({ initiationId, onSaved, onSubmitted }: Props) {
  const [form, setForm] = useState<FormData>({
    title: "", applicant: "", applicant_department: "",
    project_leader: "", department: "", project_initiator: "",
    project_type: "预研型-技术预研", business_type: "教育",
    business_domain_l1: "教育", business_domain_l2: "",
    pre_initiation_type: "首次预立项",
    start_date: today(), deadline: "", duration_days: "",
    is_linked_parent: false, is_dj_required: false,
    demand_source: "申请方", demand_date: today(), from_pool: false,
    raw_requirement: "",
    why_do_it: "", expected_effect: "",
    overview_requirement: "", overview_core_function: "",
    overview_user_scenario: "", overview_company_value: "",
    overview_user_value: "", target_market: "",
    topic_overview: "", topic_type: "", topic_value: "", topic_acceptance: "",
    vp_name: "", cc_list: "", remarks: "",
    self_check: { ...DEFAULT_SELF_CHECK },
  });

  const [status, setStatus] = useState("draft");
  const [saving, setSaving] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [genLog, setGenLog] = useState("");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch(`${API_BASE}/api/project-initiation/${initiationId}`);
        const json = await res.json();
        if (!json.success || !json.data) return;
        const d = json.data;
        setStatus(d.status);

        let ai: AiGeneratedContent = {};
        if (d.ai_generated_content) {
          try { ai = JSON.parse(d.ai_generated_content); } catch { /* skip */ }
        }

        setForm((prev) => ({
          ...prev,
          title: d.title || ai.title || "",
          applicant: d.applicant || "",
          applicant_department: ai.business_type ? "" : prev.applicant_department,
          project_leader: d.project_leader || "",
          department: d.department || "",
          project_initiator: (ai as any).project_initiator || prev.project_initiator, // eslint-disable-next-line @typescript-eslint/no-explicit-any
          project_type: d.project_type || ai.project_type || "预研型-技术预研",
          business_type: ai.business_type || prev.business_type,
          business_domain_l1: ai.business_domain_l1 || prev.business_domain_l1,
          business_domain_l2: ai.business_domain_l2 || prev.business_domain_l2,
          pre_initiation_type: (ai as any).pre_initiation_type || prev.pre_initiation_type, // eslint-disable-next-line @typescript-eslint/no-explicit-any
          start_date: (ai as any).start_date || d.demand_date || prev.start_date, // eslint-disable-next-line @typescript-eslint/no-explicit-any
          deadline: (ai as any).deadline || prev.deadline, // eslint-disable-next-line @typescript-eslint/no-explicit-any
          duration_days: (ai as any).duration_days || prev.duration_days, // eslint-disable-next-line @typescript-eslint/no-explicit-any
          is_linked_parent: (ai as any).is_linked_parent ?? prev.is_linked_parent, // eslint-disable-next-line @typescript-eslint/no-explicit-any
          is_dj_required: (ai as any).is_dj_required ?? prev.is_dj_required, // eslint-disable-next-line @typescript-eslint/no-explicit-any
          demand_source: d.demand_source || ai.demand_source || "申请方",
          demand_date: d.demand_date || today(),
          from_pool: !!d.from_pool,
          raw_requirement: d.raw_requirement || "",
          why_do_it: ai.why_do_it || "",
          expected_effect: ai.expected_effect || "",
          overview_requirement: ai.project_overview?.requirement || "",
          overview_core_function: ai.project_overview?.core_function || "",
          overview_user_scenario: ai.project_overview?.user_scenario || "",
          overview_company_value: ai.project_overview?.company_value || "",
          overview_user_value: ai.project_overview?.user_value || "",
          target_market: ai.target_market || "",
          topic_overview: ai.topic_overview || "",
          topic_type: ai.topic_type || "",
          topic_value: ai.topic_value || "",
          topic_acceptance: ai.topic_acceptance || "",
          vp_name: (ai as any).vp_name || prev.vp_name, // eslint-disable-next-line @typescript-eslint/no-explicit-any
          cc_list: (ai as any).cc_list || prev.cc_list, // eslint-disable-next-line @typescript-eslint/no-explicit-any
          remarks: (ai as any).remarks || prev.remarks, // eslint-disable-next-line @typescript-eslint/no-explicit-any
          self_check: ai.self_check || { ...DEFAULT_SELF_CHECK },
        }));
      } catch (err) {
        console.error("加载立项数据失败:", err);
      }
    })();
  }, [initiationId]);

  const updateField = (field: keyof FormData, value: any) => { // eslint-disable-next-line @typescript-eslint/no-explicit-any
    setForm((prev) => ({ ...prev, [field]: value }));
  };

  const updateSelfCheck = (key: string, field: "answer" | "note", value: any) => { // eslint-disable-next-line @typescript-eslint/no-explicit-any
    setForm((prev) => ({
      ...prev,
      self_check: { ...prev.self_check, [key]: { ...prev.self_check[key], [field]: value } },
    }));
  };

  const buildAiContent = useCallback((): string => {
    return JSON.stringify({
      title: form.title, project_type: form.project_type,
      demand_source: form.demand_source,
      business_type: form.business_type,
      business_domain_l1: form.business_domain_l1,
      business_domain_l2: form.business_domain_l2,
      pre_initiation_type: form.pre_initiation_type,
      project_initiator: form.project_initiator,
      start_date: form.start_date, deadline: form.deadline,
      duration_days: form.duration_days,
      is_linked_parent: form.is_linked_parent,
      is_dj_required: form.is_dj_required,
      why_do_it: form.why_do_it, expected_effect: form.expected_effect,
      project_overview: {
        requirement: form.overview_requirement, core_function: form.overview_core_function,
        user_scenario: form.overview_user_scenario, company_value: form.overview_company_value,
        user_value: form.overview_user_value,
      },
      target_market: form.target_market,
      topic_overview: form.topic_overview, topic_type: form.topic_type,
      topic_value: form.topic_value, topic_acceptance: form.topic_acceptance,
      vp_name: form.vp_name, cc_list: form.cc_list, remarks: form.remarks,
      self_check: form.self_check,
    });
  }, [form]);

  const handleSave = async () => {
    setSaving(true);
    try {
      await fetch(`${API_BASE}/api/project-initiation/${initiationId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: form.title, applicant: form.applicant,
          project_leader: form.project_leader, department: form.department,
          project_type: form.project_type, demand_source: form.demand_source,
          demand_date: form.demand_date, from_pool: form.from_pool ? 1 : 0,
          raw_requirement: form.raw_requirement,
          ai_generated_content: buildAiContent(),
        }),
      });
      onSaved?.();
    } catch (err) { console.error("保存失败:", err); }
    finally { setSaving(false); }
  };

  const handleSubmit = async () => {
    await handleSave();
    setSubmitting(true);
    try {
      const res = await fetch(`${API_BASE}/api/project-initiation/${initiationId}/submit`, { method: "POST" });
      const json = await res.json();
      if (json.success) { setStatus("pending"); onSubmitted?.(); }
    } catch (err) { console.error("提交失败:", err); }
    finally { setSubmitting(false); }
  };

  const handleGenerate = async () => {
    if (!form.raw_requirement.trim()) { alert("请先填写原始需求描述"); return; }
    setGenerating(true); setGenLog("");
    try {
      const res = await fetch(`${API_BASE}/api/project-initiation/generate`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ raw_requirement: form.raw_requirement }),
      });
      const reader = res.body?.getReader();
      if (!reader) return;
      const decoder = new TextDecoder();
      let buffer = "";
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n"); buffer = lines.pop() || "";
        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed.startsWith("data: ")) continue;
          try {
            const data = JSON.parse(trimmed.slice(6));
            if (data.type === "log") setGenLog(data.message);
            else if (data.type === "chunk") setGenLog("AI 正在生成...");
            else if (data.type === "done" && data.result) {
              const r = data.result as AiGeneratedContent;
              setForm((prev) => ({
                ...prev,
                title: r.title || prev.title,
                project_type: r.project_type || prev.project_type,
                demand_source: r.demand_source || prev.demand_source,
                business_type: r.business_type || prev.business_type,
                business_domain_l1: r.business_domain_l1 || prev.business_domain_l1,
                business_domain_l2: r.business_domain_l2 || prev.business_domain_l2,
                why_do_it: r.why_do_it || prev.why_do_it,
                expected_effect: r.expected_effect || prev.expected_effect,
                overview_requirement: r.project_overview?.requirement || prev.overview_requirement,
                overview_core_function: r.project_overview?.core_function || prev.overview_core_function,
                overview_user_scenario: r.project_overview?.user_scenario || prev.overview_user_scenario,
                overview_company_value: r.project_overview?.company_value || prev.overview_company_value,
                overview_user_value: r.project_overview?.user_value || prev.overview_user_value,
                target_market: r.target_market || prev.target_market,
                topic_overview: r.topic_overview || prev.topic_overview,
                topic_type: r.topic_type || prev.topic_type,
                topic_value: r.topic_value || prev.topic_value,
                topic_acceptance: r.topic_acceptance || prev.topic_acceptance,
                self_check: r.self_check || prev.self_check,
              }));
              setGenLog("生成完成");
            } else if (data.type === "error") setGenLog(`错误: ${data.message}`);
          } catch { /* skip */ }
        }
      }
    } catch (err: any) { setGenLog(`请求失败: ${err?.message}`); } // eslint-disable-next-line @typescript-eslint/no-explicit-any
    finally { setGenerating(false); }
  };

  const isReadonly = status !== "draft";

  const Field = ({ label, children }: { label: string; children: React.ReactNode }) => (
    <div className="space-y-2">{label && <Label>{label}</Label>}{children}</div>
  );

  return (
    <div className="space-y-6">
      {/* 头部 */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <code className="text-sm font-mono bg-muted px-3 py-1 rounded-md">{initiationId}</code>
          <Badge variant={status === "pending" ? "default" : "secondary"}>
            {status === "draft" ? "草稿" : status === "pending" ? "去立项" : status}
          </Badge>
        </div>
        {!isReadonly && (
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={handleSave} disabled={saving}>
              {saving ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : <Save className="h-4 w-4 mr-1" />}
              保存
            </Button>
            <Button size="sm" onClick={handleSubmit} disabled={submitting}>
              {submitting ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : <Send className="h-4 w-4 mr-1" />}
              保存并提交
            </Button>
          </div>
        )}
      </div>

      {/* 原始需求 + AI 生成 */}
      <Card>
        <CardHeader><CardTitle className="text-base">原始需求描述</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          <Textarea placeholder="请输入原始需求描述，AI 将基于此生成完整立项文档..." className="min-h-[120px]" value={form.raw_requirement} onChange={(e) => updateField("raw_requirement", e.target.value)} disabled={isReadonly} />
          {!isReadonly && (
            <div className="flex items-center gap-3">
              <Button onClick={handleGenerate} disabled={generating || !form.raw_requirement.trim()}>
                {generating ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Sparkles className="h-4 w-4 mr-2" />}
                AI 生成立项文档
              </Button>
              {genLog && <span className="text-xs text-muted-foreground">{genLog}</span>}
            </div>
          )}
        </CardContent>
      </Card>

      {/* 项目发起信息 */}
      <Card>
        <CardHeader><CardTitle className="text-base">项目发起信息</CardTitle></CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 gap-4">
            <Field label="项目名称">
              <Input value={form.title} onChange={(e) => updateField("title", e.target.value)} disabled={isReadonly} placeholder="AI 将自动提炼" />
            </Field>
            <Field label="预立项类型">
              <Select value={form.pre_initiation_type} onValueChange={(v) => updateField("pre_initiation_type", v)} disabled={isReadonly}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="首次预立项">首次预立项</SelectItem>
                  <SelectItem value="延期预立项">延期预立项</SelectItem>
                </SelectContent>
              </Select>
            </Field>
            <Field label="申请人">
              <Input value={form.applicant} onChange={(e) => updateField("applicant", e.target.value)} disabled={isReadonly} />
            </Field>
            <Field label="申请人所属部门">
              <Input value={form.applicant_department} onChange={(e) => updateField("applicant_department", e.target.value)} disabled={isReadonly} />
            </Field>
            <Field label="项目负责人">
              <Input value={form.project_leader} onChange={(e) => updateField("project_leader", e.target.value)} disabled={isReadonly} />
            </Field>
            <Field label="项目负责人所属部门">
              <Input value={form.department} onChange={(e) => updateField("department", e.target.value)} disabled={isReadonly} />
            </Field>
            <Field label="项目发起人">
              <Input value={form.project_initiator} onChange={(e) => updateField("project_initiator", e.target.value)} disabled={isReadonly} />
            </Field>
            <Field label="项目业务类型">
              <Select value={form.business_type} onValueChange={(v) => updateField("business_type", v)} disabled={isReadonly}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="教育">教育</SelectItem>
                  <SelectItem value="游戏">游戏</SelectItem>
                  <SelectItem value="企业服务">企业服务</SelectItem>
                  <SelectItem value="平台技术">平台技术</SelectItem>
                  <SelectItem value="其他">其他</SelectItem>
                </SelectContent>
              </Select>
            </Field>
            <Field label="项目类型">
              <Select value={form.project_type} onValueChange={(v) => updateField("project_type", v)} disabled={isReadonly}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="预研型-技术预研">预研型-技术预研</SelectItem>
                  <SelectItem value="预研型-产品预研">预研型-产品预研</SelectItem>
                  <SelectItem value="资源驱动型">资源驱动型</SelectItem>
                  <SelectItem value="市场驱动型">市场驱动型</SelectItem>
                </SelectContent>
              </Select>
            </Field>
            <Field label="预立项开始时间">
              <Input type="date" value={form.start_date} onChange={(e) => updateField("start_date", e.target.value)} disabled={isReadonly} />
            </Field>
            <Field label="预立项 Deadline">
              <Input type="date" value={form.deadline} onChange={(e) => updateField("deadline", e.target.value)} disabled={isReadonly} />
            </Field>
            <Field label="时长（工作日）">
              <Input type="number" value={form.duration_days} onChange={(e) => updateField("duration_days", e.target.value)} disabled={isReadonly} placeholder="如 14" />
            </Field>
            <Field label="业务领域（一级）">
              <Input value={form.business_domain_l1} onChange={(e) => updateField("business_domain_l1", e.target.value)} disabled={isReadonly} placeholder="如：教育" />
            </Field>
            <Field label="业务领域（二级）">
              <Input value={form.business_domain_l2} onChange={(e) => updateField("business_domain_l2", e.target.value)} disabled={isReadonly} placeholder="如：AI生产线" />
            </Field>
            <div className="flex items-center gap-3">
              <Label>是否关联上级项目</Label>
              <Switch checked={form.is_linked_parent} onCheckedChange={(v) => updateField("is_linked_parent", v)} disabled={isReadonly} />
              <span className="text-sm text-muted-foreground">{form.is_linked_parent ? "是" : "否"}</span>
            </div>
            <div className="flex items-center gap-3">
              <Label>是否 DJ 要求立项</Label>
              <Switch checked={form.is_dj_required} onCheckedChange={(v) => updateField("is_dj_required", v)} disabled={isReadonly} />
              <span className="text-sm text-muted-foreground">{form.is_dj_required ? "是" : "否"}</span>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* 原始需求来源 */}
      <Card>
        <CardHeader><CardTitle className="text-base">原始需求来源</CardTitle></CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 gap-4">
            <Field label="需求提出者">
              <Select value={form.demand_source} onValueChange={(v) => updateField("demand_source", v)} disabled={isReadonly}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="申请方">申请方</SelectItem>
                  <SelectItem value="客户">客户</SelectItem>
                  <SelectItem value="市场">市场</SelectItem>
                  <SelectItem value="管理层">管理层</SelectItem>
                </SelectContent>
              </Select>
            </Field>
            <Field label="提出日期">
              <Input type="date" value={form.demand_date} onChange={(e) => updateField("demand_date", e.target.value)} disabled={isReadonly} />
            </Field>
            <div className="flex items-center gap-3">
              <Label>是否从项目备选池承接</Label>
              <Switch checked={form.from_pool} onCheckedChange={(v) => updateField("from_pool", v)} disabled={isReadonly} />
              <span className="text-sm text-muted-foreground">{form.from_pool ? "是" : "否"}</span>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* 立项初衷 */}
      <Card>
        <CardHeader><CardTitle className="text-base">预立项/立项初衷</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          <Field label="公司为什么要做这个项目">
            <Textarea className="min-h-[100px]" value={form.why_do_it} onChange={(e) => updateField("why_do_it", e.target.value)} disabled={isReadonly} placeholder="AI 将自动生成..." />
          </Field>
          <Field label="想要达到什么效果">
            <Textarea className="min-h-[100px]" value={form.expected_effect} onChange={(e) => updateField("expected_effect", e.target.value)} disabled={isReadonly} placeholder="AI 将自动生成..." />
          </Field>
        </CardContent>
      </Card>

      {/* 课题定义（第二份 PDF 新增） */}
      <Card>
        <CardHeader><CardTitle className="text-base">课题定义</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          <Field label="课题概述">
            <Textarea value={form.topic_overview} onChange={(e) => updateField("topic_overview", e.target.value)} disabled={isReadonly} placeholder="AI 将自动生成..." />
          </Field>
          <Field label="课题类型">
            <Input value={form.topic_type} onChange={(e) => updateField("topic_type", e.target.value)} disabled={isReadonly} placeholder="如：3D交互体验提升" />
          </Field>
          <Field label="课题价值/立项目的">
            <Textarea className="min-h-[80px]" value={form.topic_value} onChange={(e) => updateField("topic_value", e.target.value)} disabled={isReadonly} placeholder="AI 将自动生成：说明研发成果对公司的价值、未来应用场景..." />
          </Field>
          <Field label="课题研发验收标准">
            <Textarea className="min-h-[80px]" value={form.topic_acceptance} onChange={(e) => updateField("topic_acceptance", e.target.value)} disabled={isReadonly} placeholder="AI 将自动生成：课题计划做到什么程度，验收的量化标准..." />
          </Field>
        </CardContent>
      </Card>

      {/* 项目定义 */}
      <Card>
        <CardHeader><CardTitle className="text-base">项目定义</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          <Field label="需求：产品为谁，解决什么痛点">
            <Textarea value={form.overview_requirement} onChange={(e) => updateField("overview_requirement", e.target.value)} disabled={isReadonly} placeholder="AI 将自动生成..." />
          </Field>
          <Field label="核心功能是什么">
            <Textarea value={form.overview_core_function} onChange={(e) => updateField("overview_core_function", e.target.value)} disabled={isReadonly} placeholder="AI 将自动生成..." />
          </Field>
          <Field label="典型用户场景">
            <Textarea value={form.overview_user_scenario} onChange={(e) => updateField("overview_user_scenario", e.target.value)} disabled={isReadonly} placeholder="AI 将自动生成..." />
          </Field>
          <Field label="对公司的价值">
            <Textarea value={form.overview_company_value} onChange={(e) => updateField("overview_company_value", e.target.value)} disabled={isReadonly} placeholder="AI 将自动生成..." />
          </Field>
          <Field label="对用户的价值">
            <Textarea value={form.overview_user_value} onChange={(e) => updateField("overview_user_value", e.target.value)} disabled={isReadonly} placeholder="AI 将自动生成..." />
          </Field>
          <Separator />
          <Field label="目标市场描述">
            <Textarea className="min-h-[80px]" value={form.target_market} onChange={(e) => updateField("target_market", e.target.value)} disabled={isReadonly} placeholder="AI 将自动生成..." />
          </Field>
        </CardContent>
      </Card>

      {/* 启动思考（自检） */}
      <Card>
        <CardHeader><CardTitle className="text-base">启动立项的思考（自检）</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          {Object.entries(SELF_CHECK_LABELS).map(([key, label]) => (
            <div key={key} className="space-y-2 p-3 rounded-lg border">
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium">{label}</span>
                <div className="flex items-center gap-2">
                  {form.self_check[key]?.answer ? <CheckCircle className="h-4 w-4 text-green-500" /> : <XCircle className="h-4 w-4 text-red-500" />}
                  <Switch checked={form.self_check[key]?.answer ?? true} onCheckedChange={(v) => updateSelfCheck(key, "answer", v)} disabled={isReadonly} />
                  <span className="text-xs text-muted-foreground w-6">{form.self_check[key]?.answer ? "是" : "否"}</span>
                </div>
              </div>
              <Input placeholder="补充说明..." value={form.self_check[key]?.note || ""} onChange={(e) => updateSelfCheck(key, "note", e.target.value)} disabled={isReadonly} className="text-sm" />
            </div>
          ))}
        </CardContent>
      </Card>

      {/* 其他信息 */}
      <Card>
        <CardHeader><CardTitle className="text-base">其他信息</CardTitle></CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 gap-4">
            <Field label="分管VP">
              <Input value={form.vp_name} onChange={(e) => updateField("vp_name", e.target.value)} disabled={isReadonly} />
            </Field>
            <Field label="抄送人员">
              <Input value={form.cc_list} onChange={(e) => updateField("cc_list", e.target.value)} disabled={isReadonly} placeholder="多人用逗号分隔" />
            </Field>
            <div className="col-span-2">
              <Field label="备注说明">
                <Textarea value={form.remarks} onChange={(e) => updateField("remarks", e.target.value)} disabled={isReadonly} />
              </Field>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* 底部操作栏 */}
      {!isReadonly && (
        <div className="flex justify-end gap-3 pb-8">
          <Button variant="outline" onClick={handleSave} disabled={saving}>
            {saving ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : <Save className="h-4 w-4 mr-1" />}
            保存草稿
          </Button>
          <Button onClick={handleSubmit} disabled={submitting}>
            {submitting ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : <Send className="h-4 w-4 mr-1" />}
            保存并提交（去立项）
          </Button>
        </div>
      )}
    </div>
  );
}
