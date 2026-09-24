"use client";

import { cn } from "@/lib/utils";
import { useState, useEffect } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Search,
  Users,
  UserRound,
  Briefcase,
  TrendingUp,
  MessageSquare,
  Brain,
  Clock,
  ChevronRight,
  Tag,
  Building2,
  AlertCircle,
  Lightbulb,
  History,
  Plus,
  Download,
} from "lucide-react";

const API_BASE = process.env.NEXT_PUBLIC_SERVER_API || (process.env.NODE_ENV === "production" ? "/a/openclaw" : "http://localhost:3001");

interface PersonSummary {
  name: string;
  role: string;
  level: string;
  tags: string[];
  category: string;
}

interface PersonDetail {
  name: string;
  aliases?: string[];
  role: string;
  level?: string;
  department?: string;
  reports_to?: string | null;
  reports_from?: string[];
  project_ids?: number[];
  tags?: string[];
  meeting_style?: {
    needs_appointment?: boolean;
    max_duration_minutes?: number | null;
    preparation_required?: boolean;
    assistant_contact?: string | null;
    notes?: string;
  };
  communication?: {
    style?: string;
    prefers?: string[];
    avoids?: string[];
    typical_scenes?: Record<string, string>;
  };
  personality?: {
    traits?: string[];
    decision_making?: string;
    ai_interest?: boolean | null;
  };
  notes_for_ai?: string[];
  interaction_history?: Array<{
    time?: string;
    scene?: string;
    result?: string;
  }>;
  category?: string;
}

const CATEGORY_LABELS: Record<string, string> = {
  leaders: "管理层",
  stakeholders: "干系人",
  colleagues: "同事",
  vendors: "供应商",
};

const CATEGORY_STYLES: Record<
  string,
  { dot: string; badge: string; avatar: string; initial: string }
> = {
  leaders: {
    dot: "bg-[var(--oc-accent)]",
    badge: "bg-[var(--oc-accent-soft)] text-[var(--oc-accent)] border-[var(--oc-accent)]/20",
    avatar: "bg-[var(--oc-accent-soft)] text-[var(--oc-accent)]",
    initial: "L",
  },
  stakeholders: {
    dot: "bg-[var(--oc-info)]",
    badge: "bg-[var(--oc-info-soft)] text-[var(--oc-info)] border-[var(--oc-info)]/20",
    avatar: "bg-[var(--oc-info-soft)] text-[var(--oc-info)]",
    initial: "S",
  },
  colleagues: {
    dot: "bg-[var(--oc-success)]",
    badge: "bg-[var(--oc-success-soft)] text-[var(--oc-success)] border-[var(--oc-success)]/20",
    avatar: "bg-[var(--oc-success-soft)] text-[var(--oc-success)]",
    initial: "C",
  },
  vendors: {
    dot: "bg-[var(--oc-warning)]",
    badge: "bg-[var(--oc-warning-soft)] text-[var(--oc-warning)] border-[var(--oc-warning)]/20",
    avatar: "bg-[var(--oc-warning-soft)] text-[var(--oc-warning)]",
    initial: "V",
  },
};

export default function EmployeesPage() {
  const [people, setPeople] = useState<PersonSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [categoryFilter, setCategoryFilter] = useState<string>("all");

  const [selectedPerson, setSelectedPerson] = useState<PersonDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailOpen, setDetailOpen] = useState(false);

  // 加载人员列表
  const loadPeople = async () => {
    setLoading(true);
    try {
      const res = await fetch(`${API_BASE}/api/people`);
      const json = await res.json();
      if (json.success) {
        const flat: PersonSummary[] = [];
        for (const [cat, arr] of Object.entries(json.data || {})) {
          if (Array.isArray(arr)) {
            for (const p of arr) {
              flat.push({
                name: p.name,
                role: p.role || "",
                level: p.level || "",
                tags: p.tags || [],
                category: cat,
              });
            }
          }
        }
        setPeople(flat);
      }
    } catch (err) {
      console.error("加载人员列表失败:", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadPeople();
  }, []);

  // 筛选
  const filtered = people.filter((p) => {
    const matchCat = categoryFilter === "all" || p.category === categoryFilter;
    if (!matchCat) return false;
    if (!searchQuery) return true;
    const q = searchQuery.toLowerCase();
    return (
      p.name.toLowerCase().includes(q) ||
      p.role.toLowerCase().includes(q) ||
      p.level.toLowerCase().includes(q) ||
      p.tags.some((t) => t.toLowerCase().includes(q))
    );
  });

  // 打开详情
  const openDetail = async (name: string) => {
    setDetailLoading(true);
    setDetailOpen(true);
    try {
      const res = await fetch(`${API_BASE}/api/people/${encodeURIComponent(name)}`);
      const json = await res.json();
      if (json.success) {
        setSelectedPerson(json.data);
      }
    } catch (err) {
      console.error("加载人员详情失败:", err);
    } finally {
      setDetailLoading(false);
    }
  };

  // 获取首字母
  const getInitial = (name: string) => name.charAt(0);

  return (
    <div className="space-y-6 p-7">
      {/* 头部 */}
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-[var(--oc-text-primary)]">
            员工目录
          </h1>
          <p className="mt-1.5 text-[13px] text-[var(--oc-text-secondary)]">
            查看团队成员、状态与负载，快速找到对的人
          </p>
        </div>
        <div className="flex items-center gap-2.5">
          <Button
            variant="outline"
            size="sm"
            className="h-9 gap-1.5 border-[var(--oc-border-subtle)] bg-[var(--oc-bg-elevated)] text-[var(--oc-text-primary)] hover:border-[var(--oc-border-strong)] hover:bg-[var(--oc-bg-hover)]"
          >
            <Download className="h-4 w-4" />
            导出
          </Button>
          <Button
            size="sm"
            className="h-9 gap-1.5 bg-[var(--oc-accent)] text-[var(--oc-bg-root)] hover:bg-[var(--oc-accent-hover)]"
          >
            <Plus className="h-4 w-4" />
            添加成员
          </Button>
        </div>
      </div>

      {/* 搜索与筛选 */}
      <Card className="border-[var(--oc-border-subtle)] bg-[var(--oc-bg-surface)]">
        <CardContent className="flex flex-wrap items-center justify-between gap-4 p-4">
          <div className="relative w-full max-w-[280px]">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--oc-text-tertiary)]" />
            <Input
              placeholder="搜索姓名、职级、角色、标签…"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="h-9 border-[var(--oc-border-subtle)] bg-[var(--oc-bg-elevated)] pl-9 text-sm text-[var(--oc-text-primary)] placeholder:text-[var(--oc-text-tertiary)] focus-visible:border-[var(--oc-accent)] focus-visible:ring-[var(--oc-accent-soft)]"
            />
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <FilterChip
              active={categoryFilter === "all"}
              onClick={() => setCategoryFilter("all")}
            >
              全部
            </FilterChip>
            {Object.entries(CATEGORY_LABELS).map(([key, label]) => (
              <FilterChip
                key={key}
                active={categoryFilter === key}
                onClick={() => setCategoryFilter(key)}
              >
                <span className={`h-1.5 w-1.5 rounded-full ${CATEGORY_STYLES[key]?.dot || "bg-[var(--oc-text-tertiary)]"}`} />
                {label}
                <span className="opacity-60">
                  ({people.filter((p) => p.category === key).length})
                </span>
              </FilterChip>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* 统计提示 */}
      <div className="text-xs text-[var(--oc-text-secondary)]">
        共 <span className="font-medium text-[var(--oc-text-primary)]">{people.length}</span> 人
        {searchQuery || categoryFilter !== "all" ? (
          <>
            ，筛选后{" "}
            <span className="font-medium text-[var(--oc-text-primary)]">{filtered.length}</span> 人
          </>
        ) : null}
      </div>

      {/* 卡片网格 */}
      {loading ? (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {Array.from({ length: 8 }).map((_, i) => (
            <Card
              key={i}
              className="border-[var(--oc-border-subtle)] bg-[var(--oc-bg-surface)]"
            >
              <CardContent className="flex flex-col items-center gap-3 p-5">
                <div className="h-14 w-14 rounded-full bg-[var(--oc-bg-elevated)]" />
                <div className="h-3 w-20 rounded bg-[var(--oc-bg-elevated)]" />
                <div className="h-2.5 w-14 rounded bg-[var(--oc-bg-elevated)]" />
              </CardContent>
            </Card>
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <Card className="border-dashed border-[var(--oc-border-subtle)] bg-transparent">
          <CardContent className="flex flex-col items-center gap-3 py-16 text-[var(--oc-text-secondary)]">
            <Users className="h-10 w-10 text-[var(--oc-text-tertiary)]" />
            <p className="text-sm font-medium">
              {searchQuery || categoryFilter !== "all" ? "未找到匹配的人员" : "暂无人员数据"}
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {filtered.map((person) => {
            const style = CATEGORY_STYLES[person.category] || CATEGORY_STYLES.colleagues;
            return (
              <Card
                key={`${person.category}-${person.name}`}
                className="group cursor-pointer border-[var(--oc-border-subtle)] bg-[var(--oc-bg-surface)] transition-all duration-180 hover:border-[var(--oc-border-strong)] hover:bg-[var(--oc-bg-elevated)] hover:shadow-[0_4px_16px_rgba(0,0,0,0.32)] hover:-translate-y-0.5"
                onClick={() => openDetail(person.name)}
              >
                <CardContent className="flex flex-col items-center p-5 text-center">
                  <div
                    className={`mb-3 flex h-14 w-14 items-center justify-center rounded-full text-lg font-bold ${style.avatar}`}
                  >
                    {getInitial(person.name)}
                  </div>
                  <p className="text-sm font-bold text-[var(--oc-text-primary)]">
                    {person.name}
                  </p>
                  {person.role && (
                    <p className="mt-1 text-xs text-[var(--oc-text-secondary)]">
                      {person.role}
                    </p>
                  )}
                  {person.level && (
                    <p className="mt-0.5 text-[11px] text-[var(--oc-text-tertiary)]">
                      {person.level}
                    </p>
                  )}
                  <Badge
                    variant="outline"
                    className={`mt-3 text-[10px] ${style.badge}`}
                  >
                    {CATEGORY_LABELS[person.category] || person.category}
                  </Badge>
                  {person.tags.length > 0 && (
                    <div className="mt-3 flex flex-wrap justify-center gap-1">
                      {person.tags.slice(0, 2).map((tag) => (
                        <span
                          key={tag}
                          className="rounded-full border border-[var(--oc-border-subtle)] bg-[var(--oc-bg-elevated)] px-2 py-0.5 text-[10px] text-[var(--oc-text-secondary)]"
                        >
                          {tag}
                        </span>
                      ))}
                      {person.tags.length > 2 && (
                        <span className="text-[10px] text-[var(--oc-text-tertiary)]">
                          +{person.tags.length - 2}
                        </span>
                      )}
                    </div>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {/* 详情弹窗 */}
      <Dialog open={detailOpen} onOpenChange={setDetailOpen}>
        <DialogContent className="max-h-[85vh] gap-0 overflow-y-auto border-[var(--oc-border-strong)] bg-[var(--oc-bg-surface)] p-0 sm:max-w-2xl">
          {detailLoading ? (
            <div className="space-y-4 p-6">
              <div className="flex items-center gap-3">
                <div className="h-14 w-14 rounded-full bg-[var(--oc-bg-elevated)]" />
                <div className="space-y-2">
                  <div className="h-4 w-24 rounded bg-[var(--oc-bg-elevated)]" />
                  <div className="h-3 w-16 rounded bg-[var(--oc-bg-elevated)]" />
                </div>
              </div>
              <div className="space-y-2">
                <div className="h-3 w-full rounded bg-[var(--oc-bg-elevated)]" />
                <div className="h-3 w-3/4 rounded bg-[var(--oc-bg-elevated)]" />
              </div>
            </div>
          ) : selectedPerson ? (
            <>
              {/* 头部信息区 */}
              <div className="border-b border-[var(--oc-border-subtle)] p-6 pb-4">
                <div className="flex items-start gap-4">
                  <div
                    className={`flex h-16 w-16 shrink-0 items-center justify-center rounded-xl text-xl font-bold ${
                      CATEGORY_STYLES[selectedPerson.category || "colleagues"]?.avatar ||
                      CATEGORY_STYLES.colleagues.avatar
                    }`}
                  >
                    {getInitial(selectedPerson.name)}
                  </div>
                  <div className="min-w-0 flex-1">
                    <DialogHeader className="space-y-1">
                      <DialogTitle className="flex items-center gap-2 text-lg text-[var(--oc-text-primary)]">
                        {selectedPerson.name}
                        {selectedPerson.aliases && selectedPerson.aliases.length > 0 && (
                          <span className="text-xs font-normal text-[var(--oc-text-secondary)]">
                            （{selectedPerson.aliases.join("、")}）
                          </span>
                        )}
                      </DialogTitle>
                    </DialogHeader>
                    <div className="mt-1.5 flex flex-wrap items-center gap-2">
                      {selectedPerson.level && (
                        <Badge
                          variant="outline"
                          className="border-[var(--oc-accent)]/30 text-xs text-[var(--oc-accent)]"
                        >
                          <TrendingUp className="mr-1 h-3 w-3" />
                          {selectedPerson.level}
                        </Badge>
                      )}
                      {selectedPerson.role && (
                        <Badge
                          variant="outline"
                          className="border-[var(--oc-border-subtle)] text-xs text-[var(--oc-text-secondary)]"
                        >
                          <Briefcase className="mr-1 h-3 w-3" />
                          {selectedPerson.role}
                        </Badge>
                      )}
                      {selectedPerson.department && (
                        <Badge
                          variant="outline"
                          className="border-[var(--oc-border-subtle)] text-xs text-[var(--oc-text-secondary)]"
                        >
                          <Building2 className="mr-1 h-3 w-3" />
                          {selectedPerson.department}
                        </Badge>
                      )}
                      {selectedPerson.category && (
                        <Badge
                          variant="outline"
                          className={`text-xs ${
                            CATEGORY_STYLES[selectedPerson.category]?.badge || ""
                          }`}
                        >
                          {CATEGORY_LABELS[selectedPerson.category] || selectedPerson.category}
                        </Badge>
                      )}
                    </div>

                    {/* 汇报关系 */}
                    <div className="mt-2 space-y-0.5 text-xs text-[var(--oc-text-secondary)]">
                      {selectedPerson.reports_to && (
                        <p>汇报给：{selectedPerson.reports_to}</p>
                      )}
                      {selectedPerson.reports_from && selectedPerson.reports_from.length > 0 && (
                        <p>下属：{selectedPerson.reports_from.join("、")}</p>
                      )}
                      {selectedPerson.project_ids && selectedPerson.project_ids.length > 0 && (
                        <p>参与项目：{selectedPerson.project_ids.join(", ")}</p>
                      )}
                    </div>
                  </div>
                </div>

                {/* 标签 */}
                {selectedPerson.tags && selectedPerson.tags.length > 0 && (
                  <div className="mt-3 flex flex-wrap gap-1.5">
                    {selectedPerson.tags.map((tag) => (
                      <span
                        key={tag}
                        className="flex items-center gap-1 rounded-full border border-[var(--oc-accent)]/15 bg-[var(--oc-accent-soft)] px-2 py-0.5 text-xs text-[var(--oc-accent)]"
                      >
                        <Tag className="h-3 w-3" />
                        {tag}
                      </span>
                    ))}
                  </div>
                )}
              </div>

              {/* 内容区 */}
              <div className="space-y-5 p-6">
                {/* 性格特征 */}
                {selectedPerson.personality && (
                  <Section icon={Brain} title="性格特征">
                    <div className="space-y-2">
                      {selectedPerson.personality.traits && selectedPerson.personality.traits.length > 0 && (
                        <div className="flex flex-wrap gap-1.5">
                          {selectedPerson.personality.traits.map((t) => (
                            <Badge
                              key={t}
                              variant="outline"
                              className="border-[var(--oc-border-subtle)] bg-[var(--oc-bg-elevated)] text-xs text-[var(--oc-text-secondary)]"
                            >
                              {t}
                            </Badge>
                          ))}
                        </div>
                      )}
                      {selectedPerson.personality.decision_making && (
                        <p className="text-sm leading-relaxed text-[var(--oc-text-secondary)]">
                          {selectedPerson.personality.decision_making}
                        </p>
                      )}
                      {selectedPerson.personality.ai_interest !== null &&
                        selectedPerson.personality.ai_interest !== undefined && (
                          <Badge
                            variant="outline"
                            className={
                              selectedPerson.personality.ai_interest
                                ? "border-[var(--oc-success)]/30 text-[var(--oc-success)]"
                                : "border-[var(--oc-border-subtle)] text-[var(--oc-text-tertiary)]"
                            }
                          >
                            {selectedPerson.personality.ai_interest ? "对 AI 感兴趣" : "对 AI 兴趣一般"}
                          </Badge>
                        )}
                    </div>
                  </Section>
                )}

                {/* 沟通风格 */}
                {selectedPerson.communication && (
                  <Section icon={MessageSquare} title="沟通风格">
                    <div className="space-y-3">
                      {selectedPerson.communication.style && (
                        <p className="text-sm text-[var(--oc-text-primary)]">
                          <span className="text-[var(--oc-text-secondary)]">风格：</span>
                          <span className="font-medium">{selectedPerson.communication.style}</span>
                        </p>
                      )}
                      {selectedPerson.communication.prefers && selectedPerson.communication.prefers.length > 0 && (
                        <div>
                          <p className="mb-1 text-xs text-[var(--oc-text-secondary)]">偏好：</p>
                          <div className="flex flex-wrap gap-1.5">
                            {selectedPerson.communication.prefers.map((p) => (
                              <span
                                key={p}
                                className="rounded border border-[var(--oc-success)]/15 bg-[var(--oc-success-soft)] px-2 py-0.5 text-xs text-[var(--oc-success)]"
                              >
                                {p}
                              </span>
                            ))}
                          </div>
                        </div>
                      )}
                      {selectedPerson.communication.avoids && selectedPerson.communication.avoids.length > 0 && (
                        <div>
                          <p className="mb-1 text-xs text-[var(--oc-text-secondary)]">忌讳：</p>
                          <div className="flex flex-wrap gap-1.5">
                            {selectedPerson.communication.avoids.map((a) => (
                              <span
                                key={a}
                                className="rounded border border-[var(--oc-error)]/15 bg-[var(--oc-error-soft)] px-2 py-0.5 text-xs text-[var(--oc-error)]"
                              >
                                {a}
                              </span>
                            ))}
                          </div>
                        </div>
                      )}
                      {selectedPerson.communication.typical_scenes &&
                        Object.keys(selectedPerson.communication.typical_scenes).length > 0 && (
                          <div>
                            <p className="mb-1.5 text-xs text-[var(--oc-text-secondary)]">典型场景：</p>
                            <div className="space-y-1.5">
                              {Object.entries(selectedPerson.communication.typical_scenes).map(([scene, desc]) => (
                                <div
                                  key={scene}
                                  className="rounded-lg border border-[var(--oc-border-subtle)] bg-[var(--oc-bg-elevated)] px-3 py-2 text-sm"
                                >
                                  <span className="font-medium text-[var(--oc-text-primary)]">{scene}</span>
                                  <ChevronRight className="mx-1 inline h-3 w-3 text-[var(--oc-text-secondary)]" />
                                  <span className="text-[var(--oc-text-secondary)]">{desc}</span>
                                </div>
                              ))}
                            </div>
                          </div>
                        )}
                    </div>
                  </Section>
                )}

                {/* 会议风格 */}
                {selectedPerson.meeting_style && (
                  <Section icon={Clock} title="会议风格">
                    <div className="grid grid-cols-2 gap-2 text-sm">
                      <InfoItem
                        label="需要预约"
                        value={selectedPerson.meeting_style.needs_appointment ? "是" : "否"}
                      />
                      {selectedPerson.meeting_style.max_duration_minutes && (
                        <InfoItem
                          label="最长时长"
                          value={`${selectedPerson.meeting_style.max_duration_minutes} 分钟`}
                        />
                      )}
                      <InfoItem
                        label="需提前准备"
                        value={selectedPerson.meeting_style.preparation_required ? "是" : "否"}
                      />
                      {selectedPerson.meeting_style.assistant_contact && (
                        <InfoItem label="助理联系人" value={selectedPerson.meeting_style.assistant_contact} />
                      )}
                    </div>
                    {selectedPerson.meeting_style.notes && (
                      <p className="mt-2 rounded-lg border border-[var(--oc-border-subtle)] bg-[var(--oc-bg-elevated)] px-3 py-2 text-sm text-[var(--oc-text-secondary)]">
                        {selectedPerson.meeting_style.notes}
                      </p>
                    )}
                  </Section>
                )}

                {/* AI 备注 */}
                {selectedPerson.notes_for_ai && selectedPerson.notes_for_ai.length > 0 && (
                  <Section icon={Lightbulb} title="AI 协作建议">
                    <ul className="space-y-1.5">
                      {selectedPerson.notes_for_ai.map((note, i) => (
                        <li key={i} className="flex items-start gap-2 text-sm text-[var(--oc-text-secondary)]">
                          <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-[var(--oc-warning)]" />
                          {note}
                        </li>
                      ))}
                    </ul>
                  </Section>
                )}

                {/* 互动历史 */}
                {selectedPerson.interaction_history && selectedPerson.interaction_history.length > 0 && (
                  <Section icon={History} title="互动历史">
                    <div className="space-y-2">
                      {selectedPerson.interaction_history.map((item, i) => (
                        <div
                          key={i}
                          className="rounded-lg border border-[var(--oc-border-subtle)] bg-[var(--oc-bg-elevated)] px-3 py-2 text-sm"
                        >
                          <div className="mb-1 flex items-center gap-2">
                            <span className="text-xs text-[var(--oc-text-tertiary)]">{item.time}</span>
                            <span className="font-medium text-[var(--oc-text-primary)]">{item.scene}</span>
                          </div>
                          <p className="text-xs text-[var(--oc-text-secondary)]">{item.result}</p>
                        </div>
                      ))}
                    </div>
                  </Section>
                )}
              </div>
            </>
          ) : null}
        </DialogContent>
      </Dialog>
    </div>
  );
}

/* ─── 辅助组件 ─── */

function FilterChip({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-medium transition-colors",
        active
          ? "border-[var(--oc-accent)]/25 bg-[var(--oc-accent-soft)] text-[var(--oc-accent)]"
          : "border-[var(--oc-border-subtle)] bg-[var(--oc-bg-elevated)] text-[var(--oc-text-secondary)] hover:border-[var(--oc-border-strong)] hover:text-[var(--oc-text-primary)]"
      )}
    >
      {children}
    </button>
  );
}

function Section({
  icon: Icon,
  title,
  children,
}: {
  icon: typeof UserRound;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-2.5">
      <h3 className="flex items-center gap-2 text-sm font-semibold text-[var(--oc-text-primary)]">
        <Icon className="h-4 w-4 text-[var(--oc-accent)]" />
        {title}
      </h3>
      <div className="pl-6">{children}</div>
    </div>
  );
}

function InfoItem({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-[var(--oc-border-subtle)] bg-[var(--oc-bg-elevated)] px-3 py-2">
      <p className="text-[11px] text-[var(--oc-text-secondary)]">{label}</p>
      <p className="mt-0.5 text-sm font-medium text-[var(--oc-text-primary)]">{value}</p>
    </div>
  );
}

