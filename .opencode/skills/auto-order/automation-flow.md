# Playwright 自动化流程详解

引擎文件：`packages/server/src/services/oa-automation.js`
改进版：`packages/server/src/routes/automation.ts`

## 阶段一：启动与导航

```
chromium.launch({ headless: false, slowMo: 50 })
  → context.storageState(auth.json)   // 加载登录凭证
  → page.goto(oaConfig.url)           // 导航到 OA 系统
  → 检查是否跳转到登录页               // 凭证过期检测
  → 点击「确定」按钮                    // 处理弹窗
  → 点击「[管理员权限菜单]」             // 进入管理菜单
  → 点击「全需求列表」                  // 进入需求列表
```

## 阶段二：UUID 检索与链接点击

```
→ input[placeholder*="关键词"] 输入 UUID
→ Enter 搜索
→ 两段式雷达:
  Phase 1 (SEARCHING):
    - document.createTreeWalker 遍历全文
    - 找到 UUID 所在 DOM 行
    - 横向滚动父容器展开视图
  Phase 2 (SCROLLED):
    - 同一行查找「@增加子任务链接」
    - 选择器优先级:
      1. [title="@增加子任务链接"]
      2. 文本含 @ + 增加 + 链接 的元素
      3. a[href*="input_"]
    - scrollIntoView → click()
```

## 阶段三：新窗口接管与表单填写

```
→ 等待 3s → 检测新标签页
→ 接管新标签页: context.pages().last()
→ 处理「草稿恢复」弹窗:
    - [data-testid="confirm-message"] 可见
    - 点击「取消/不载入」
→ 点击「添加新数据」:
    - .subform-table-operation-add
    - 或文本匹配「添加新数据」
```

### 字段填写详情

| 步骤 | 定位器 | 策略 |
|------|--------|------|
| 标题 | `td:nth(2) → input[name*="1701760319933_7860"]` | 直接 fill / 点击单元格后 fill |
| 详情 | `textarea[name*="1701760347219_7862"]` | 直接 fill |
| 负责人 | `td:nth(4) → .fish-select-selector → 选择用户弹窗` | 弹窗搜索 → 确认 |
| 日期 | `td:nth(5) → input → 日历浮层 td[title="YYYY年M月D日"]` | 日历点击 / 移除 readonly fill |
| 工时 | `td:nth(6) → input` | 直接 fill |

## 阶段四：提交与收尾

```
→ 点击「确定/保存/提交」按钮
→ waitForLoadState('networkidle')
→ 获取当前 URL 作为 orderUrl
→ context.storageState({ path: auth.json })   // 刷新凭证
→ 返回 { success, orderUrl }
```

## 关键选择器（适配 OA 系统）

| 目标 | 主要选择器 | 备用选择器 |
|------|-----------|-----------|
| UUID 行 | `tr.ant-table-row` | `.fish-table-row`, `[class*="row"]` |
| 子任务链接 | `[title="@增加子任务链接"]` | 文本含 @+增加+链接 的元素 |
| 添加新数据 | `.subform-table-operation-add` | `[class*="operation-add"]` |
| 用户弹窗 | `button:has-text("选择用户")` | — |
| 日历面板 | `.fish-calendar-picker-container` | `.fish-calendar-panel` |
| 提交按钮 | `button:has-text(/确 定\|保 存\|提 交/)` | — |

## 错误处理策略

| 错误场景 | 处理方式 |
|----------|---------|
| 登录过期 | 抛出 `❌ 自动登录失败` → 截图保存 `error-{uuid}.png` |
| 链接未找到 | 20s 超时 → 报错 |
| 日历交互失败 | 移除 readonly → fill() 输入 → Enter |
| 负责人弹窗异常 | 点击空白处失焦 → 继续 |
| 截图失败 | 静默 catch |
