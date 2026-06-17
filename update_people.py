import json
import os

BASE = "C:/Users/986916/.hermes/knowledge-base/people"

people = {
    "stakeholders/何松航": {
        "name": "何松航",
        "aliases": [],
        "role": "研发主程序员",
        "level": "P7",
        "department": "研发部",
        "reports_to": "刘建辉",
        "reports_from": [],
        "project_ids": [137372, 137294],
        "tags": ["研发负责人", "数据敏感", "需督促", "多项目并行"],
        "meeting_style": {
            "needs_appointment": False,
            "max_duration_minutes": None,
            "preparation_required": False,
            "assistant_contact": None,
            "notes": "日常工作不需要特别预约，但需提前告知会议目的"
        },
        "communication": {
            "style": "数据驱动、直接",
            "prefers": ["明确的数据和清单", "具体的技术要求", "提前告知会议目的"],
            "avoids": ["模糊的描述", "开放式任务", "没有验收标准"],
            "typical_scenes": {
                "技术确认": "关注数量和数据一致性（如'画作是174个视频，画家是105个？'）",
                "资源申请": "主动处理项目key申请等技术资源事宜"
            }
        },
        "personality": {
            "traits": ["懒散", "主动性不强", "拖延", "数据敏感"],
            "decision_making": "工作效率不高，经常需要督促和催促才能完成任务，但对数据准确性有要求",
            "ai_interest": None
        },
        "notes_for_ai": [
            "任务必须拆解到明确的小步骤，提供具体的数据指标",
            "必须设定清晰的 deadline 并持续跟进",
            "不要指望他主动推进，需要定期督促",
            "交付物需要明确验收标准，最好用清单形式",
            "涉及数量/数据时要核对清楚，他会关注一致性"
        ],
        "interaction_history": [],
        "md_extra": ""
    },
    "stakeholders/陈锐": {
        "name": "陈锐",
        "aliases": ["若恒"],
        "role": "高级产品设计师",
        "level": "P7",
        "department": "产品部",
        "reports_to": "金伟华",
        "reports_from": [],
        "project_ids": [137372, 137294],
        "tags": ["产品经理", "规范化", "火爆", "质量要求高", "催进度"],
        "meeting_style": {
            "needs_appointment": False,
            "max_duration_minutes": None,
            "preparation_required": True,
            "assistant_contact": None,
            "notes": "喜欢主动安排会议，会催促参会，要求会前准备好材料"
        },
        "communication": {
            "style": "直接、规范、结果导向",
            "prefers": ["被告知", "信息主动同步", "规范化的流程", "明确的交付物"],
            "avoids": ["被通知（被动接受）", "信息不同步", "无版本管理", "拖延交付"],
            "typical_scenes": {
                "催进度": "'你昨天不是说，已经做好了，还没有发我'",
                "安排会议": "主动约人开会（如'约松航三点开元宇宙和ai改编游戏的会吧'）",
                "索要交付物": "'教育元宇宙的评估记得给我'"
            }
        },
        "personality": {
            "traits": ["火爆", "规范意识强", "质量要求高", "结果导向"],
            "decision_making": "产品至上，没有产品用的功能都是没有意义的。对交付时间敏感",
            "ai_interest": None
        },
        "notes_for_ai": [
            "千万不要'通知'他，要主动'告知'",
            "项目必须有清晰的版本管理和周会机制",
            "功能必须考虑产品可用性，技术Demo不等于产品",
            "进度和质量要 proactively 同步，不要等他问",
            "交付物要按时，否则会直接被追问",
            "会议要提前约，他习惯主动安排会议推进事情"
        ],
        "interaction_history": [],
        "md_extra": ""
    },
    "colleagues/陈伟胜": {
        "name": "陈伟胜",
        "aliases": [],
        "role": "前端开发工程师",
        "level": "P7",
        "department": "研发部",
        "reports_to": None,
        "reports_from": [],
        "project_ids": [137294],
        "tags": ["前端开发", "demo开发", "随和", "技术分享"],
        "meeting_style": {
            "needs_appointment": False,
            "max_duration_minutes": None,
            "preparation_required": False,
            "assistant_contact": None,
            "notes": "会参加站会，有事会提前请假并安排替补"
        },
        "communication": {
            "style": "随和、技术导向",
            "prefers": ["技术链接和示例", "提前沟通请假", "站会同步"],
            "avoids": ["突然的变更", "没有技术方案的讨论"],
            "typical_scenes": {
                "请假": "'两点我有事，站会请杨健和葛大帮忙了' - 会提前告知并安排替补",
                "技术分享": "主动分享技术demo链接"
            }
        },
        "personality": {
            "traits": ["随和", "配合度高", "技术型"],
            "decision_making": "以技术可行性为导向，愿意配合调整，态度开放",
            "ai_interest": None
        },
        "notes_for_ai": [
            "沟通顺畅，配合度高，态度随和",
            "请假/有事会提前告知，无需担心失联",
            "喜欢分享技术方案和demo链接",
            "站会参与度较高，适合通过站会同步进度",
            "遇到问题可以直接提出，会积极配合解决"
        ],
        "interaction_history": [],
        "md_extra": ""
    },
    "colleagues/葛岩": {
        "name": "葛岩",
        "aliases": ["葛大"],
        "role": "美术/TA负责人",
        "level": "P8",
        "department": "美术部",
        "reports_to": None,
        "reports_from": [],
        "project_ids": [137294],
        "tags": ["美术负责人", "TA", "品质要求高", "资深", "外包管理"],
        "meeting_style": {
            "needs_appointment": False,
            "max_duration_minutes": None,
            "preparation_required": True,
            "assistant_contact": None,
            "notes": "被称为'葛大'，资深美术，会议中关注美术细节和品质"
        },
        "communication": {
            "style": "专业、直接、品质导向",
            "prefers": ["具体的视觉参考", "明确的美术标准", "外包产出整理"],
            "avoids": ["模糊的描述", "品质不达标", "没有参考标准"],
            "typical_scenes": {
                "品质把控": "'白色高分子材料桌子不要这么亮，更润一些，融合一些'",
                "细节调整": "'反光过强了一些'、'细节还要调下'",
                "外包管理": "处理外包同学的美术产出整理和验收"
            }
        },
        "personality": {
            "traits": ["资深", "品质敏感", "专业", "直接"],
            "decision_making": "以视觉品质为最高标准，对细节要求高，会直接指出问题",
            "ai_interest": None
        },
        "notes_for_ai": [
            "被称为'葛大'，团队中受尊重的资深美术",
            "对视觉品质要求极高，会关注材质、光影、细节",
            "沟通时直接指出问题，不会绕弯子",
            "负责外包美术产出管理，需要整理和验收",
            "提供美术需求时要有明确的参考图和标准",
            "美术交付物需要预留调整时间，他会提出修改意见"
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
    if comm['typical_scenes']:
        md_lines.append("")
        md_lines.append("### 典型沟通场景")
        md_lines.append("")
        for scene, desc in comm['typical_scenes'].items():
            md_lines.append(f"**{scene}**：{desc}")
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
    
    md_path = os.path.join(dir_path, name + ".md")
    with open(md_path, "w", encoding="utf-8") as f:
        f.write("\n".join(md_lines))
    
    print(f"Updated: {json_path}")
    print(f"Updated: {md_path}")

for category in ["leaders", "stakeholders", "colleagues"]:
    cat_dir = os.path.join(BASE, category)
    if not os.path.exists(cat_dir):
        continue
    summaries = []
    for fname in sorted(os.listdir(cat_dir)):
        if fname.endswith(".json") and fname != "summary.json":
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
    print(f"Updated: {summary_path}")

print("\nDone!")
