import json
import os

BASE = "C:/Users/986916/.hermes/knowledge-base/people"

people = {
    "leaders/伟华": {
        "name": "金伟华",
        "aliases": ["伟华"],
        "role": "公司副总",
        "level": "P10",
        "department": "管理层",
        "reports_to": None,
        "reports_from": ["彭靖", "陈锐"],
        "project_ids": [137372],
        "tags": ["决策者", "最终审批人", "严谨", "结果导向"],
        "meeting_style": {
            "needs_appointment": True,
            "max_duration_minutes": 30,
            "preparation_required": True,
            "assistant_contact": "钰茜",
            "notes": "会议必须预约，时长不超过30分钟；内容必须提前准备好发给助理钰茜；会议目的必须清晰"
        },
        "communication": {
            "style": "结果导向",
            "prefers": ["提前准备", "目的清晰", "有方案汇报"],
            "avoids": ["无方案汇报", "被动通知", "过度承诺"],
            "typical_scenes": {
                "加急需求": "先评估可行性 → 列出优先级 → 给出折中方案 → 确认后执行",
                "进度追问": "同步最新状态 → 说明阻塞点 → 给出预期时间"
            }
        },
        "personality": {
            "traits": ["严谨"],
            "decision_making": "关注可交付物和时间节点，愿意接受现实约束",
            "ai_interest": True
        },
        "notes_for_ai": [
            "可以坦诚说'做不了'，但要给替代方案",
            "主动同步进度，不要等他来问",
            "不要过度承诺",
            "不要只抛问题不给方案"
        ],
        "interaction_history": [
            {"time": "2026-04", "scene": "要求周五版本加AI助手", "result": "砍到核心功能，背诵助手暂缓"},
            {"time": "2026-05", "scene": "催促AI器材生产线", "result": "协调成本确认后推进"}
        ],
        "md_extra": "\n## 历史交互记录\n\n| 时间 | 场景 | 结果 |\n|------|------|------|\n| 2026-04 | 要求周五版本加 AI 助手 | 游浠砍到核心功能，背诵助手暂缓 |\n| 2026-05 | 催促 AI 器材生产线 | 游浠协调成本确认后推进 |\n"
    },
    "leaders/陈宏": {
        "name": "陈宏",
        "aliases": [],
        "role": "公司研发CTO",
        "level": "P11",
        "department": "研发部",
        "reports_to": None,
        "reports_from": ["刘建辉"],
        "project_ids": [137372],
        "tags": ["技术决策者", "技术战略", "技术可行性审批"],
        "meeting_style": {
            "needs_appointment": True,
            "max_duration_minutes": None,
            "preparation_required": True,
            "assistant_contact": None,
            "notes": "作为CTO，是项目技术可行性的关键人物"
        },
        "communication": {
            "style": "技术导向",
            "prefers": ["技术方案清晰", "可行性论证"],
            "avoids": [],
            "typical_scenes": {}
        },
        "personality": {
            "traits": [],
            "decision_making": "关注技术架构合理性和团队技术能力匹配度",
            "ai_interest": None
        },
        "notes_for_ai": [
            "项目技术方案需要通过他的可行性评估",
            "是技术资源的最终决策人"
        ],
        "interaction_history": [],
        "md_extra": ""
    },
    "stakeholders/彭靖": {
        "name": "彭靖",
        "aliases": [],
        "role": "产品设计总监",
        "level": "P8",
        "department": "产品部",
        "reports_to": "金伟华",
        "reports_from": [],
        "project_ids": [137372],
        "tags": ["产品负责人", "项目规划", "设计决策"],
        "meeting_style": {
            "needs_appointment": True,
            "max_duration_minutes": None,
            "preparation_required": True,
            "assistant_contact": None,
            "notes": "伟华团队下第一策划，负责项目整体规划和设计，直接向伟华汇报"
        },
        "communication": {
            "style": "产品导向",
            "prefers": ["整体规划清晰", "设计方案完整"],
            "avoids": [],
            "typical_scenes": {}
        },
        "personality": {
            "traits": [],
            "decision_making": "一般重要的项目都会给到他负责",
            "ai_interest": None
        },
        "notes_for_ai": [
            "公司核心项目的产品负责人",
            "需要与他同步项目整体规划和设计方向"
        ],
        "interaction_history": [],
        "md_extra": ""
    },
    "stakeholders/陈锐": {
        "name": "陈锐",
        "aliases": [],
        "role": "高级产品设计师",
        "level": "P7",
        "department": "产品部",
        "reports_to": "金伟华",
        "reports_from": [],
        "project_ids": [137372],
        "tags": ["产品经理", "规范化", "火爆", "质量要求高"],
        "meeting_style": {
            "needs_appointment": False,
            "max_duration_minutes": None,
            "preparation_required": True,
            "assistant_contact": None,
            "notes": "喜欢规范化的工作流程，项目版本、周会等"
        },
        "communication": {
            "style": "直接、规范",
            "prefers": ["被告知", "信息主动同步", "规范化的流程"],
            "avoids": ["被通知（被动接受）", "信息不同步", "无版本管理"],
            "typical_scenes": {
                "信息同步": "他喜欢被告知，讨厌被动接受信息。对于项目进度和质量要求比较高"
            }
        },
        "personality": {
            "traits": ["火爆", "规范意识强", "质量要求高"],
            "decision_making": "产品至上，没有产品用的功能都是没有意义的",
            "ai_interest": None
        },
        "notes_for_ai": [
            "千万不要'通知'他，要主动'告知'",
            "项目必须有清晰的版本管理和周会机制",
            "功能必须考虑产品可用性，技术Demo不等于产品",
            "进度和质量要 proactively 同步，不要等他问"
        ],
        "interaction_history": [],
        "md_extra": ""
    },
    "stakeholders/何松航": {
        "name": "何松航",
        "aliases": [],
        "role": "研发主程序员",
        "level": "P7",
        "department": "研发部",
        "reports_to": "刘建辉",
        "reports_from": [],
        "project_ids": [137372],
        "tags": ["研发负责人", "懒散", "拖延", "需督促"],
        "meeting_style": {
            "needs_appointment": False,
            "max_duration_minutes": None,
            "preparation_required": False,
            "assistant_contact": None,
            "notes": "日常工作不需要特别预约"
        },
        "communication": {
            "style": "被动型",
            "prefers": ["明确的任务指派", "截止日期清晰"],
            "avoids": ["开放式任务", "模糊的交付标准"],
            "typical_scenes": {}
        },
        "personality": {
            "traits": ["懒散", "主动性不强", "拖延"],
            "decision_making": "工作效率不高，经常需要督促和催促才能完成任务",
            "ai_interest": None
        },
        "notes_for_ai": [
            "任务必须拆解到明确的小步骤",
            "必须设定清晰的 deadline 并持续跟进",
            "不要指望他主动推进，需要定期督促",
            "交付物需要明确验收标准"
        ],
        "interaction_history": [],
        "md_extra": ""
    }
}

for path_key, data in people.items():
    dir_path = os.path.join(BASE, os.path.dirname(path_key))
    os.makedirs(dir_path, exist_ok=True)
    name = data["name"]
    
    json_data = {k: v for k, v in data.items() if k != "md_extra"}
    json_path = os.path.join(dir_path, name + ".json")
    with open(json_path, "w", encoding="utf-8") as f:
        json.dump(json_data, f, ensure_ascii=False, indent=2)
    
    md_lines = []
    md_lines.append(f"# {name}")
    md_lines.append("")
    md_lines.append(f"> 角色：{data['role']}")
    md_lines.append(f"> 职级：{data['level']}")
    md_lines.append(f"> 部门：{data['department']}")
    md_lines.append(f"> 标签：{' '.join(['#' + t for t in data['tags']])}")
    md_lines.append("")
    
    md_lines.append("## 基本信息")
    md_lines.append("")
    md_lines.append(f"- **姓名**：{name}")
    md_lines.append(f"- **角色**：{data['role']}")
    md_lines.append(f"- **职级**：{data['level']}")
    md_lines.append(f"- **部门**：{data['department']}")
    if data['reports_to']:
        md_lines.append(f"- **汇报对象**：{data['reports_to']}")
    if data['reports_from']:
        md_lines.append(f"- **下属**：{', '.join(data['reports_from'])}")
    if data['project_ids']:
        md_lines.append(f"- **关联项目**：{', '.join([str(p) for p in data['project_ids']])}")
    md_lines.append("")
    
    md_lines.append("## 会议习惯")
    md_lines.append("")
    ms = data['meeting_style']
    md_lines.append(f"- **需要预约**：{'是' if ms['needs_appointment'] else '否'}")
    if ms['max_duration_minutes']:
        md_lines.append(f"- **建议时长**：不超过 {ms['max_duration_minutes']} 分钟")
    md_lines.append(f"- **需要提前准备**：{'是' if ms['preparation_required'] else '否'}")
    if ms['assistant_contact']:
        md_lines.append(f"- **助理联系人**：{ms['assistant_contact']}")
    md_lines.append(f"- **备注**：{ms['notes']}")
    md_lines.append("")
    
    md_lines.append("## 沟通风格")
    md_lines.append("")
    comm = data['communication']
    md_lines.append(f"- **风格**：{comm['style']}")
    if comm['prefers']:
        md_lines.append(f"- **偏好**：{', '.join(comm['prefers'])}")
    if comm['avoids']:
        md_lines.append(f"- **忌讳**：{', '.join(comm['avoids'])}")
    md_lines.append("")
    
    md_lines.append("## 性格特点")
    md_lines.append("")
    pers = data['personality']
    if pers['traits']:
        md_lines.append(f"- **性格**：{', '.join(pers['traits'])}")
    md_lines.append(f"- **决策特点**：{pers['decision_making']}")
    md_lines.append("")
    
    md_lines.append("## AI 沟通注意事项")
    md_lines.append("")
    for note in data['notes_for_ai']:
        md_lines.append(f"- {note}")
    md_lines.append("")
    
    if data['interaction_history']:
        md_lines.append("## 历史交互记录")
        md_lines.append("")
        md_lines.append("| 时间 | 场景 | 结果 |")
        md_lines.append("|------|------|------|")
        for h in data['interaction_history']:
            md_lines.append(f"| {h['time']} | {h['scene']} | {h['result']} |")
        md_lines.append("")
    
    if data['md_extra']:
        md_lines.append(data['md_extra'])
    
    md_path = os.path.join(dir_path, name + ".md")
    with open(md_path, "w", encoding="utf-8") as f:
        f.write("\n".join(md_lines))
    
    print(f"Created: {json_path}")
    print(f"Created: {md_path}")

for category in ["leaders", "stakeholders"]:
    cat_dir = os.path.join(BASE, category)
    summaries = []
    for fname in sorted(os.listdir(cat_dir)):
        if fname.endswith(".json"):
            fpath = os.path.join(cat_dir, fname)
            with open(fpath, "r", encoding="utf-8") as f:
                pdata = json.load(f)
            summaries.append({
                "name": pdata["name"],
                "role": pdata["role"],
                "level": pdata["level"],
                "tags": pdata["tags"],
                "project_ids": pdata["project_ids"],
                "personality_traits": pdata["personality"]["traits"]
            })
    summary_path = os.path.join(cat_dir, "summary.json")
    with open(summary_path, "w", encoding="utf-8") as f:
        json.dump({"count": len(summaries), "people": summaries}, f, ensure_ascii=False, indent=2)
    print(f"Created: {summary_path}")

print("Done!")
