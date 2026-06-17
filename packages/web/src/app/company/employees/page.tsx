"use client";

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
} from "lucide-react";

const API_BASE = "http://localhost:3001";

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

const CATEGORY_COLORS: Record<string, string> = {
  leaders: "bg-amber-500/10 text-amber-400 border-amber-500/20",
  stakeholders: "bg-sky-500/10 text-sky-400 border-sky-500/20",
  colleagues: "bg-emerald-500/10 text-emerald-400 border-emerald-500/20",
  vendors: "bg-purple-500/10 text-purple-400 border-purple-500/20",
};

const CATEGORY_DOT_COLORS: Record<string, string> = {
  leaders: "bg-amber-400",
  stakeholders: "bg-sky-400",
  colleagues: "bg-emerald-400",
  vendors: "bg-purple-400",
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

  // 头像背景色
  const getAvatarColor = (name: string) => {
    const colors = [
      "from-rose-500/20 to-orange-500/20",
      "from-sky-500/20 to-cyan-500/20",
      "from-emerald-500/20 to-teal-500/20",
      "from-violet-500/20 to-purple-500/20",
      "from-amber-500/20 to-yellow-500/20",
      "from-pink-500/20 to-rose-500/20",
      "from-indigo-500/20 to-blue-500/20",
      "from-lime-500/20 to-green-500/20",
    ];
    let hash = 0;
    for (let i = 0; i < name.length; i++) hash = name.charCodeAt(i) + ((hash << 5) - hash);
    return colors[Math.abs(hash) % colors.length];
  };

  return (
    <div className="space-y-5">
      {/* 头部 */}
      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-3 flex-1 max-w-md relative">
          <Search className="absolute left-3 h-4 w-4 text-muted-foreground pointer-events-none" />
          <Input
            placeholder="搜索姓名、职级、角色、标签..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-9 h-9 bg-transparent border-border"
          />
        </div>
        <div className="text-xs text-muted-foreground">
          共 <span className="text-foreground font-medium">{people.length}</span> 人
          {searchQuery || categoryFilter !== "all" ? (
            <>, 筛选后 <span className="text-foreground font-medium">{filtered.length}</span> 人</>
          ) : null}
        </div>
      </div>

      {/* 分类筛选 */}
      <div className="flex items-center gap-1.5 flex-wrap">
        <button
          onClick={() => setCategoryFilter("all")}
          className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
            categoryFilter === "all"
              ? "bg-primary text-primary-foreground"
              : "bg-white/[0.03] text-muted-foreground hover:text-foreground hover:bg-white/[0.06]"
          }`}
        >
          全部
        </button>
        {Object.entries(CATEGORY_LABELS).map(([key, label]) => (
          <button
            key={key}
            onClick={() => setCategoryFilter(key)}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors flex items-center gap-1.5 ${
              categoryFilter === key
                ? "bg-primary text-primary-foreground"
                : "bg-white/[0.03] text-muted-foreground hover:text-foreground hover:bg-white/[0.06]"
            }`}
          >
            <span className={`w-1.5 h-1.5 rounded-full ${CATEGORY_DOT_COLORS[key]}`} />
            {label}
            <span className="opacity-60">({people.filter((p) => p.category === key).length})</span>
          </button>
        ))}
      </div>

      {/* 卡片网格 */}
      {loading ? (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-3">
          {Array.from({ length: 12 }).map((_, i) => (
            <Card key={i} className="animate-pulse bg-card/50 border-border/50">
              <CardContent className="p-3 space-y-2">
                <div className="h-10 w-10 rounded-full bg-muted mx-auto" />
                <div className="h-3 w-16 rounded bg-muted mx-auto" />
                <div className="h-2.5 w-12 rounded bg-muted mx-auto" />
              </CardContent>
            </Card>
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <Card className="bg-transparent border-dashed border-border">
          <CardContent className="flex flex-col items-center py-16 text-muted-foreground gap-3">
            <Users className="h-12 w-12 opacity-20" />
            <p className="text-sm font-medium">
              {searchQuery || categoryFilter !== "all" ? "未找到匹配的人员" : "暂无人员数据"}
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-3">
          {filtered.map((person) => (
            <Card
              key={`${person.category}-${person.name}`}
              className="group cursor-pointer hover:bg-white/[0.03] transition-all duration-200 border-border/60 hover:border-border hover:shadow-sm"
              onClick={() => openDetail(person.name)}
            >
              <CardContent className="p-3 flex flex-col items-center text-center gap-2">
                {/* 头像 */}
                <div
                  className={`h-12 w-12 rounded-full bg-gradient-to-br ${getAvatarColor(person.name)} border border-border/60 flex items-center justify-center shrink-0`}
                >
                  <span className="text-sm font-semibold text-foreground/80">
                    {getInitial(person.name)}
                  </span>
                </div>

                {/* 姓名 */}
                <div className="min-w-0">
                  <p className="text-sm font-semibold truncate">{person.name}</p>
                  {person.level && (
                    <p className="text-[11px] text-muted-foreground mt-0.5">{person.level}</p>
                  )}
                </div>

                {/* 角色 */}
                {person.role && (
                  <p className="text-[11px] text-muted-foreground/70 truncate max-w-full">
                    {person.role}
                  </p>
                )}

                {/* 分类标签 */}
                <Badge
                  variant="outline"
                  className={`text-[10px] px-1.5 py-0 leading-none ${CATEGORY_COLORS[person.category] || "border-border text-muted-foreground"}`}
                >
                  {CATEGORY_LABELS[person.category] || person.category}
                </Badge>

                {/* Tags - 最多显示2个 */}
                {person.tags.length > 0 && (
                  <div className="flex flex-wrap justify-center gap-1">
                    {person.tags.slice(0, 2).map((tag) => (
                      <span
                        key={tag}
                        className="text-[10px] px-1.5 py-0.5 rounded bg-white/[0.04] text-muted-foreground/60"
                      >
                        {tag}
                      </span>
                    ))}
                    {person.tags.length > 2 && (
                      <span className="text-[10px] text-muted-foreground/40">+{person.tags.length - 2}</span>
                    )}
                  </div>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* 详情弹窗 */}
      <Dialog open={detailOpen} onOpenChange={setDetailOpen}>
        <DialogContent className="sm:max-w-2xl max-h-[85vh] overflow-y-auto p-0 gap-0">
          {detailLoading ? (
            <div className="p-6 space-y-4 animate-pulse">
              <div className="flex items-center gap-3">
                <div className="h-14 w-14 rounded-full bg-muted" />
                <div className="space-y-2">
                  <div className="h-4 w-24 rounded bg-muted" />
                  <div className="h-3 w-16 rounded bg-muted" />
                </div>
              </div>
              <div className="space-y-2">
                <div className="h-3 w-full rounded bg-muted" />
                <div className="h-3 w-3/4 rounded bg-muted" />
              </div>
            </div>
          ) : selectedPerson ? (
            <>
              {/* 头部信息区 */}
              <div className="p-6 pb-4 border-b border-border/50">
                <div className="flex items-start gap-4">
                  <div
                    className={`h-16 w-16 rounded-xl bg-gradient-to-br ${getAvatarColor(selectedPerson.name)} border border-border/60 flex items-center justify-center shrink-0`}
                  >
                    <span className="text-xl font-bold text-foreground/80">
                      {getInitial(selectedPerson.name)}
                    </span>
                  </div>
                  <div className="flex-1 min-w-0">
                    <DialogHeader className="space-y-1">
                      <DialogTitle className="text-lg flex items-center gap-2">
                        {selectedPerson.name}
                        {selectedPerson.aliases && selectedPerson.aliases.length > 0 && (
                          <span className="text-xs text-muted-foreground font-normal">
                            （{selectedPerson.aliases.join("、")}）
                          </span>
                        )}
                      </DialogTitle>
                    </DialogHeader>
                    <div className="flex items-center gap-2 flex-wrap mt-1.5">
                      {selectedPerson.level && (
                        <Badge variant="outline" className="text-xs border-primary/30 text-primary">
                          <TrendingUp className="h-3 w-3 mr-1" />
                          {selectedPerson.level}
                        </Badge>
                      )}
                      {selectedPerson.role && (
                        <Badge variant="outline" className="text-xs border-border text-muted-foreground">
                          <Briefcase className="h-3 w-3 mr-1" />
                          {selectedPerson.role}
                        </Badge>
                      )}
                      {selectedPerson.department && (
                        <Badge variant="outline" className="text-xs border-border text-muted-foreground">
                          <Building2 className="h-3 w-3 mr-1" />
                          {selectedPerson.department}
                        </Badge>
                      )}
                      {selectedPerson.category && (
                        <Badge
                          variant="outline"
                          className={`text-xs ${CATEGORY_COLORS[selectedPerson.category] || ""}`}
                        >
                          {CATEGORY_LABELS[selectedPerson.category] || selectedPerson.category}
                        </Badge>
                      )}
                    </div>

                    {/* 汇报关系 */}
                    <div className="mt-2 text-xs text-muted-foreground space-y-0.5">
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
                  <div className="flex flex-wrap gap-1.5 mt-3">
                    {selectedPerson.tags.map((tag) => (
                      <span
                        key={tag}
                        className="text-xs px-2 py-0.5 rounded-full bg-primary/10 text-primary border border-primary/15"
                      >
                        <Tag className="h-3 w-3 inline mr-1" />
                        {tag}
                      </span>
                    ))}
                  </div>
                )}
              </div>

              {/* 内容区 */}
              <div className="p-6 space-y-5">
                {/* 性格特征 */}
                {selectedPerson.personality && (
                  <Section icon={Brain} title="性格特征">
                    <div className="space-y-2">
                      {selectedPerson.personality.traits && selectedPerson.personality.traits.length > 0 && (
                        <div className="flex flex-wrap gap-1.5">
                          {selectedPerson.personality.traits.map((t) => (
                            <Badge key={t} variant="secondary" className="text-xs">
                              {t}
                            </Badge>
                          ))}
                        </div>
                      )}
                      {selectedPerson.personality.decision_making && (
                        <p className="text-sm text-muted-foreground leading-relaxed">
                          {selectedPerson.personality.decision_making}
                        </p>
                      )}
                      {selectedPerson.personality.ai_interest !== null && selectedPerson.personality.ai_interest !== undefined && (
                        <Badge
                          variant="outline"
                          className={selectedPerson.personality.ai_interest ? "text-emerald-400 border-emerald-500/30" : "text-muted-foreground"}
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
                        <p className="text-sm">
                          <span className="text-muted-foreground">风格：</span>
                          <span className="font-medium">{selectedPerson.communication.style}</span>
                        </p>
                      )}
                      {selectedPerson.communication.prefers && selectedPerson.communication.prefers.length > 0 && (
                        <div>
                          <p className="text-xs text-muted-foreground mb-1">偏好：</p>
                          <div className="flex flex-wrap gap-1.5">
                            {selectedPerson.communication.prefers.map((p) => (
                              <span key={p} className="text-xs px-2 py-0.5 rounded bg-emerald-500/10 text-emerald-400 border border-emerald-500/15">
                                {p}
                              </span>
                            ))}
                          </div>
                        </div>
                      )}
                      {selectedPerson.communication.avoids && selectedPerson.communication.avoids.length > 0 && (
                        <div>
                          <p className="text-xs text-muted-foreground mb-1">忌讳：</p>
                          <div className="flex flex-wrap gap-1.5">
                            {selectedPerson.communication.avoids.map((a) => (
                              <span key={a} className="text-xs px-2 py-0.5 rounded bg-red-500/10 text-red-400 border border-red-500/15">
                                {a}
                              </span>
                            ))}
                          </div>
                        </div>
                      )}
                      {selectedPerson.communication.typical_scenes && Object.keys(selectedPerson.communication.typical_scenes).length > 0 && (
                        <div>
                          <p className="text-xs text-muted-foreground mb-1.5">典型场景：</p>
                          <div className="space-y-1.5">
                            {Object.entries(selectedPerson.communication.typical_scenes).map(([scene, desc]) => (
                              <div key={scene} className="text-sm bg-white/[0.02] rounded-lg px-3 py-2">
                                <span className="font-medium text-foreground/90">{scene}</span>
                                <ChevronRight className="h-3 w-3 inline mx-1 text-muted-foreground" />
                                <span className="text-muted-foreground">{desc}</span>
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
                      <p className="text-sm text-muted-foreground mt-2 bg-white/[0.02] rounded-lg px-3 py-2">
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
                        <li key={i} className="text-sm text-muted-foreground flex items-start gap-2">
                          <AlertCircle className="h-3.5 w-3.5 text-amber-400/70 shrink-0 mt-0.5" />
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
                        <div key={i} className="text-sm bg-white/[0.02] rounded-lg px-3 py-2">
                          <div className="flex items-center gap-2 mb-1">
                            <span className="text-xs text-muted-foreground">{item.time}</span>
                            <span className="font-medium">{item.scene}</span>
                          </div>
                          <p className="text-muted-foreground text-xs">{item.result}</p>
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
      <h3 className="text-sm font-semibold flex items-center gap-2 text-foreground/90">
        <Icon className="h-4 w-4 text-primary/70" />
        {title}
      </h3>
      <div className="pl-6">{children}</div>
    </div>
  );
}

function InfoItem({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-white/[0.02] rounded-lg px-3 py-2">
      <p className="text-[11px] text-muted-foreground">{label}</p>
      <p className="text-sm font-medium mt-0.5">{value}</p>
    </div>
  );
}
