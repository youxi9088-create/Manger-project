# Auto-Order API 速查

## 自动化执行

```bash
# 触发下单
curl -X POST http://localhost:3001/execute \
  -H "Content-Type: application/json" \
  -d '{
    "uuid": "xxx-xxx",
    "taskData": {
      "需求名称": "XX功能开发",
      "任务详情": "实现XX功能",
      "负责人": "张三",
      "完成时间": 1747641600000,
      "工时": 8
    },
    "oaConfig": {
      "url": "https://oa-system.com",
      "username": "",
      "password": ""
    }
  }'
```

## 配置管理

```bash
# 读取配置
curl http://localhost:3001/api/auto-order/config

# 保存配置
curl -X PUT http://localhost:3001/api/auto-order/config \
  -H "Content-Type: application/json" \
  -d '{"feishu":{...},"oa":{...}}'

# 读取任务列表
curl http://localhost:3001/api/auto-order/tasks

# 保存任务列表
curl -X PUT http://localhost:3001/api/auto-order/tasks \
  -H "Content-Type: application/json" \
  -d '[...]'
```

## 核心类型

```typescript
interface Task {
  id: string                        // 飞书记录ID
  sourceTableId?: string            // 来源表格ID
  fields: {
    "需求名称": string              // 任务标题
    "所属项目": string               // 所属项目
    "工时": number                   // 编码预估工时
    "负责人": string                 // 开发人员姓名
    "下单字段": "是" | "否"          // 是否已下单
    "下单时间"?: number              // 下单时间戳
    "下单链接"?: string               // OA详情页URL
    "OA系统ID/链接"?: string          // OA系统链接
    "uuid"?: string                  // OA检索UUID
    "完成时间"?: string               // 编码计划完成时间
    "任务详情"?: string               // 详细描述
  }
}

interface AutomationConfig {
  feishu: { appId, appSecret, appToken, tableId }
  oa: { url, username, password }
}

interface FieldMapping {
  [key: string]: string  // 飞书字段名 → OA字段名
}
```

## 核心依赖

| 包 | 用途 |
|----|------|
| `playwright` | 浏览器自动化引擎 |
| `express` | HTTP API 服务 |
| `better-sqlite3` | 数据持久化 |
| `node-cron` | 定时任务调度 |
