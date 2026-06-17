# 知识库与 Agent 结合使用方案

> 针对 OpenClaw 项目 + Hermes Agent 的实用架构设计

---

## 一、核心问题

你有两类"知识"：

| 类型 | 代表 | 特点 |
|------|------|------|
| **结构化知识** | SOUL.md、MEMORY.md、项目文档 | 精炼、小体量、高频使用 |
| **非结构化知识** | 聊天记录(5MB+)、会议音频、原始文档 | 庞大、杂乱、按需检索 |

**问题**：Agent 的上下文窗口有限，不可能把 5MB 聊天记录每次都塞进去。怎么办？

**答案**：分层架构——热记忆常驻、冷记忆按需检索。

---

## 二、四层知识架构

```
┌─────────────────────────────────────────────────────────────┐
│  Layer 1: 热记忆（Hot Memory）                               │
│  每次对话自动注入系统提示词                                    │
│  ├── SOUL.md        → 角色定义（游浠是谁）                    │
│  ├── MEMORY.md      → 工作知识（当前项目状态）                 │
│  └── USER.md        → 用户画像（沟通风格）                    │
│  容量：~3,600 字符                                           │
│  速度：零延迟                                                │
└─────────────────────────────────────────────────────────────┘
                              ↓ 记不住时查询
┌─────────────────────────────────────────────────────────────┐
│  Layer 2: 技能封装（Skills）                                 │
│  按需加载，封装"如何查知识"的流程                              │
│  ├── knowledge-base → 查询聊天记录、分析报告                  │
│  ├── meeting-query  → 查询会议纪要、待办                      │
│  └── project-wiki   → 查询项目文档、技术方案                  │
│  触发：Agent 判断需要时自动加载                                │
└─────────────────────────────────────────────────────────────┘
                              ↓ 调用检索脚本
┌─────────────────────────────────────────────────────────────┐
│  Layer 3: 检索引擎（Search Engine）                          │
│  本地轻量级检索，不依赖外部服务                                │
│  ├── 关键词匹配（BM25/TF-IDF）                               │
│  ├── 时间范围过滤                                            │
│  ├── 人物/群组过滤                                           │
│  └── 可选：简单向量检索（本地 embedding）                     │
│  数据源：all_chat_records.json、analysis_*.txt 等            │
└─────────────────────────────────────────────────────────────┘
                              ↓ 定期批量更新
┌─────────────────────────────────────────────────────────────┐
│  Layer 4: 原始知识库（Raw Knowledge Base）                   │
│  外部系统定期导出/同步                                        │
│  ├── im-analyzer 导出聊天记录                                │
│  ├── 会议系统导出纪要                                        │
│  ├── 飞书文档导出                                           │
│  └── 手动维护的 analysis 报告                               │
│  更新频率：每日/每周批量                                     │
└─────────────────────────────────────────────────────────────┘
```

---

## 三、每层详解与使用方式

### Layer 1: 热记忆 —— 已经配置好了

你当前的配置：
- `SOUL.md` → 游浠角色（已注入）
- `MEMORY.md` → 项目列表、关键人员、环境约束（已配置）
- `USER.md` → 沟通风格、工作模式（已配置）

**如何使用**：
- 每次对话 hermes 自动加载，无需操作
- 想让 Agent 记住新事实 → 说"记住我..." → 自动写入
- 定期清理过时内容（容量有限）

---

### Layer 2: Skills —— 需要创建

Skills 是 hermes 的"程序性记忆"——封装了"遇到什么问题、用什么流程解决"。

我已经为你创建了 `knowledge-base` Skill 的框架：

```
~/.hermes/skills/knowledge-base/
└── SKILL.md          ← 技能定义（已创建）
```

**如何使用**：

当你问 Agent 涉及历史记录的问题时，它会自动加载这个 Skill，然后调用检索脚本。

示例对话：
```
你：上周 OpenQ 群里讨论 iOS 审核问题，最后怎么定的？

Agent: （自动加载 knowledge-base Skill）
       → 调用 search_kb(query="OpenQ iOS 审核", group="OpenQ开发群", 
                       start_date="2026-05-25", limit=10)
       → 返回相关聊天记录片段
       → 基于片段回答你
```

---

### Layer 3: 检索引擎 —— 需要实现

这是核心落地环节。你需要一个本地脚本来搜索 JSON/TXT 文件。

**方案 A：关键词检索（最简单，先做这个）**

```python
# search_kb.py
import json
import re
from datetime import datetime
from pathlib import Path

def search_kb(query, person=None, group=None, start_date=None, end_date=None, limit=10):
    """在聊天记录中搜索相关内容"""
    results = []
    
    # 加载数据
    kb_dir = Path("f:/youxi/app/openclaw")
    chat_file = kb_dir / "all_chat_records.json"
    
    with open(chat_file, 'r', encoding='utf-8') as f:
        records = json.load(f)
    
    # 构建查询关键词
    keywords = [k for k in query.split() if len(k) > 1]
    
    for record in records:
        content = record.get('content', '')
        sender = record.get('sender', '')
        group_name = record.get('group', '')
        timestamp = record.get('timestamp', '')
        
        # 跳过非文本消息
        if not content or len(content) < 5:
            continue
        if content.startswith('<') and content.endswith('>'):
            continue  # 跳过 HTML/富文本
            
        # 过滤条件
        if person and person not in sender:
            continue
        if group and group not in group_name:
            continue
        if start_date and timestamp < start_date:
            continue
        if end_date and timestamp > end_date:
            continue
            
        # 计算相关性（简单版本：关键词匹配数）
        score = 0
        content_lower = content.lower()
        for kw in keywords:
            if kw.lower() in content_lower:
                score += 1
                
        if score > 0:
            results.append({
                "source": "all_chat_records.json",
                "sender": sender,
                "group": group_name,
                "timestamp": timestamp,
                "content": content[:500],  # 截断
                "relevance_score": score / len(keywords)
            })
    
    # 按相关性排序
    results.sort(key=lambda x: x['relevance_score'], reverse=True)
    
    return {
        "results": results[:limit],
        "total_found": len(results),
        "query": query
    }

if __name__ == "__main__":
    import sys
    query = sys.argv[1] if len(sys.argv) > 1 else ""
    result = search_kb(query)
    print(json.dumps(result, ensure_ascii=False, indent=2))
```

**方案 B：增强检索（后续迭代）**

- 加入 TF-IDF / BM25 排序
- 加入时间衰减（新记录权重更高）
- 加入简单向量检索（用本地 embedding 模型）
- 索引化（避免每次全量扫描 3MB JSON）

---

### Layer 4: 原始知识库 —— 已经存在

你当前的原始知识库：

| 文件 | 大小 | 内容 | 更新方式 |
|------|------|------|---------|
| `all_chat_records.json` | 3MB | 全部群聊记录 | im-analyzer 导出 |
| `youxi_chat_records.json` | 1.1MB | 游浠相关记录 | im-analyzer 导出 |
| `analysis_*.txt` | ~200KB | 各类分析报告 | 手动/脚本生成 |
| `meeting_intelligence.json` | 3KB | 会议情报 | 会议助手导出 |

**维护建议**：
- 每周从 im-analyzer 重新导出一次聊天记录
- 会议记录自动同步到 `meeting_intelligence.json`
- analysis 报告在需要时手动更新

---

## 四、完整使用流程示例

### 场景：你问 Agent "上周五伟华在群里说了什么？"

```
Step 1: Agent 加载热记忆
  → 从 USER.md 知道"伟华是业务负责人"
  → 从 MEMORY.md 知道当前项目列表
  
Step 2: Agent 判断需要查知识库
  → "上周五" + "伟华" + "群里" → 涉及历史聊天记录
  → 自动加载 knowledge-base Skill
  
Step 3: Agent 调用检索脚本
  → search_kb(query="伟华", start_date="2026-05-30", end_date="2026-05-30")
  → 返回相关记录
  
Step 4: Agent 基于检索结果回答
  → "根据 OpenQ 开发群的记录，伟华在 5/30 10:23 说：..."
```

---

## 五、三种落地路径（选一个开始）

### 路径 A：最小可行方案（推荐先做这个）

**时间**：30 分钟  
**效果**：能查聊天记录

1. 创建 `search_kb.py` 脚本（上面方案 A 的代码）
2. 测试：`python search_kb.py "OpenQ iOS"`
3. 在 hermes 中使用：直接让 Agent 调用 `python f:/youxi/app/openclaw/search_kb.py "你的查询"`

### 路径 B：Skills 封装（进阶）

**时间**：1 小时  
**效果**：Agent 自动判断何时查知识库

1. 完善 `~/.hermes/skills/knowledge-base/SKILL.md`
2. 让 Skill 指导 Agent 如何构建查询、如何过滤结果
3. Agent 会在需要时自动加载 Skill 并执行检索

### 路径 C：外部记忆提供者（长期）

**时间**：2-3 小时配置  
**效果**：跨会话自动记忆 + 智能召回

```bash
# 启用 mem0（推荐）
hermes memory setup
# 选择 mem0，按提示配置 API Key
```

mem0 会：
- 自动从对话中提取关键事实
- 跨会话记忆
- 智能召回相关记忆

---

## 六、与 im-analyzer 的整合

你的 `packages/im-analyzer/` 已经有聊天记录分析能力。建议：

1. **im-analyzer 负责**：导出、清洗、分析聊天记录 → 生成 analysis_*.txt
2. **Agent 负责**：基于分析结果和原始记录，回答你的查询
3. **数据流**：
   ```
   微信/99U → im-analyzer 导出 → all_chat_records.json
                                    ↓
                              analysis_*.txt（洞察报告）
                                    ↓
                              Agent 查询 → search_kb.py
   ```

---

## 七、常见问题

### Q1: 为什么不直接用向量数据库？

**A**: 5MB 的 JSON 用关键词检索足够快（<100ms），不需要引入额外依赖。等数据量到 50MB+ 再考虑向量检索。

### Q2: hermes 的 session_search 不能替代吗？

**A**: session_search 搜的是**你和 Agent 的历史对话**，不是**你的微信群聊记录**。两个是不同的数据源。

### Q3: 聊天记录有隐私风险吗？

**A**: 检索脚本完全本地运行，不调用任何外部 API。敏感信息（密码、内部数据）可以在导出时过滤掉。

### Q4: 检索结果太多怎么办？

**A**: 
- 加更精确的过滤条件（指定群名、时间范围）
- 限制返回条数（limit=5）
- 让 Agent 基于返回的片段做二次总结

---

## 八、下一步行动

**今天就做**：
1. [ ] 把上面的 `search_kb.py` 保存到 `f:/youxi/app/openclaw/`
2. [ ] 测试：`python search_kb.py "OpenQ"`
3. [ ] 对 hermes 说："你去搜一下群里关于 iOS 上架的讨论"

**这周做**：
4. [ ] 完善 knowledge-base Skill，让 Agent 自动调用检索
5. [ ] 给 analysis_*.txt 也加上检索能力

**长期考虑**：
6. [ ] 数据量大了之后，加本地向量索引
7. [ ] 考虑启用 mem0 外部记忆提供者
