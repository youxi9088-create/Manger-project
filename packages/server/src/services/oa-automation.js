import express from 'express';
import cors from 'cors';
import { chromium } from 'playwright';
import fs from 'fs';

const app = express();
const port = 3001;

app.use(cors());
app.use(express.json());

app.post('/execute', async (req, res) => {
  // 1. 获取数据
  const body = req.body;

  // --- 【新增】打印收到的 JSON 数据包 ---
  console.log('\n========================================');
  console.log('📨 [HTTP 请求] 收到 JSON 数据包:');
  console.log(JSON.stringify(body, null, 2)); // 格式化打印，方便阅读
  console.log('========================================\n');
  // ----------------------------------------

  const { uuid, taskData, oaConfig } = body;
  const authPath = 'auth.json';

  console.log(`\n📦 接收到执行请求: ${taskData['任务详情']} (UUID: ${uuid})`);

  const browser = await chromium.launch({ headless: false, slowMo: 50 });
  const context = await browser.newContext({
    storageState: fs.existsSync(authPath) ? authPath : undefined,
    viewport: { width: 1440, height: 900 }
  });
  
  // 【修复 1】：初始化 targetPage，防止窗口切换时报错 targetPage is not defined
  let page = await context.newPage();
  let targetPage = page; 

  try {
    console.log(`🚀 正在打开业务页面...`);
    await page.goto(oaConfig.url, { waitUntil: 'networkidle' });
    
    // 【修复 2】：安全检查：判断是否因为 token 过期被重定向到了登录页
    const currentUrl = page.url();
    if (currentUrl.includes('login') || await page.locator('input[type="password"]').isVisible({ timeout: 2000 }).catch(()=>false)) {
        throw new Error('❌ 自动登录失败：凭证已过期！请先在终端运行 `node save_auth.mjs` 重新登录以更新 auth.json。');
    }

    // 1. 弹窗处理
    try { await page.getByRole('button', { name: '确定' }).click({ timeout: 3000 }); } catch (e) {}

    // 2. 菜单导航
    console.log(`📂 进入【全需求列表】...`);
    await page.locator('text="[管理员权限菜单]"').first().click();
    await page.waitForTimeout(1000);
    await page.locator('text="全需求列表"').first().click();
    await page.waitForLoadState('networkidle');

    // --- 步骤 2: 搜索 UUID ---
    console.log(`🔍 检索 UUID: ${uuid}`);
    const searchInput = page.locator('input[placeholder*="关键词"], input[placeholder*="搜索"]').first();
    await searchInput.click();
    await page.keyboard.press('Control+A');
    await page.keyboard.press('Backspace');
    await searchInput.fill(uuid);
    await page.keyboard.press('Enter');

    // --- 步骤 3: 寻找并点击链接 (分步战术) ---
    console.log(`⏳ 启动两段式雷达：正在锁定行并强制展开视图...`);
    
    let actionState = "SEARCHING"; 
    const timeout = 20000;
    const start = Date.now();
    let activeFrame = null;

    while (Date.now() - start < timeout && actionState !== "CLICKED") {
      for (const frame of page.frames()) {
        if (actionState === "SEARCHING") {
            const scrollResult = await frame.evaluate((targetUuid) => {
                const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT, null, false);
                let node;
                while (node = walker.nextNode()) {
                    if (node.textContent.includes(targetUuid)) {
                        const row = node.parentElement.closest('tr, .ant-table-row, .fish-table-row, [class*="row"]');
                        if (row) {
                            let parent = row.parentElement;
                            while (parent && parent !== document.body) {
                                if (parent.scrollWidth > parent.clientWidth) {
                                    parent.scrollLeft = parent.scrollWidth + 2000; 
                                    return "SCROLLED";
                                }
                                parent = parent.parentElement;
                            }
                            return "ROW_FOUND_NO_SCROLL";
                        }
                    }
                }
                return null;
            }, uuid).catch(() => null);

            if (scrollResult === "SCROLLED" || scrollResult === "ROW_FOUND_NO_SCROLL") {
                console.log(`🔄 视图已展开，等待目标链接渲染...`);
                actionState = "SCROLLED";
                activeFrame = frame;
                await page.waitForTimeout(2000); 
            }
        }

        if (actionState === "SCROLLED" && activeFrame === frame) {
             const clickResult = await frame.evaluate((targetUuid) => {
                const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT, null, false);
                let node;
                while (node = walker.nextNode()) {
                    if (node.textContent.includes(targetUuid)) {
                        const row = node.parentElement.closest('tr, .ant-table-row, .fish-table-row, [class*="row"]');
                        if (row) {
                            let target = row.querySelector('[title="@增加子任务链接"]');
                            if (!target) {
                                const candidates = Array.from(row.querySelectorAll('a, span, i, div'));
                                target = candidates.find(el => {
                                    const txt = (el.innerText || "").trim();
                                    return txt.includes('@') && txt.includes('增加') && txt.includes('链接');
                                });
                            }
                            if (!target) {
                                target = Array.from(row.querySelectorAll('a')).find(el => el.href && el.href.includes('input_'));
                            }

                            if (target) {
                                target.scrollIntoView({ inline: 'center', block: 'center' });
                                target.click(); 
                                return "SUCCESS";
                            }
                        }
                    }
                }
                return "LINK_NOT_FOUND";
             }, uuid).catch(() => null);

             if (clickResult === "SUCCESS") {
                 console.log('🎉 精确命中目标链接！');
                 actionState = "CLICKED";
                 break;
             }
        }
      }
      if (actionState === "CLICKED") break;
      await page.waitForTimeout(1000); 
    }

    if (actionState !== "CLICKED") throw new Error("无法找到或点击‘@增加子任务链接’");

    // --- 步骤 4: 接管新窗口 ---
    console.log('🎉 链接点击成功！正在接管新页面...');
    try {
        await page.waitForTimeout(3000); 
        const allPages = context.pages();
        if (allPages.length > 1) {
            targetPage = allPages[allPages.length - 1];
            await targetPage.bringToFront();
            console.log(`✅ 成功接管新标签页: ${await targetPage.title()}`);
        } else {
            console.log('ℹ️ 未检测到新标签页，继续在当前页操作...');
        }
        
        // 确保页面基础结构已就绪
        await targetPage.waitForLoadState('domcontentloaded');
        console.log('⏳ 页面已打开，正在启动“草稿雷达” (扫描 6 秒)...');
        
    } catch (e) {
        console.warn('⚠️ 窗口切换警告:', e.message);
    }

    // --- 【新增补丁】处理延迟出现的草稿恢复弹窗 ---
    const recoveryDialog = targetPage.locator('[data-testid="confirm-message"]');
    try {
        // 使用针对性的等待逻辑：最多等 6 秒钟，看那个弹窗会不会跳出来
        await recoveryDialog.waitFor({ state: 'visible', timeout: 6000 });
        
        const message = await recoveryDialog.innerText();
        console.log(`⚠️ 捕获到延迟弹窗提示: "${message}"`);
        
        // 定位取消按钮：不载入旧草稿，我们要开始全新的填报
        const cancelBtn = targetPage.locator('button:visible').filter({ hasText: /取 消|否|不载入/ }).last();
        
        if (await cancelBtn.isVisible()) {
            await cancelBtn.click();
            console.log('🛡️ 已自动点击 [取消]，清除历史草稿。等待 1 秒让遮罩消失...');
            await targetPage.waitForTimeout(1000); 
        }
    } catch (e) {
        // 如果 6 秒内没出现，说明系统没发现草稿，直接进入填报
        console.log('✅ 经确认无干扰弹窗，流程继续。');
    }

    // --- 步骤 5: 点击“添加新数据”与干扰处理 ---
    console.log(`📝 定位 [添加新数据] 按钮...`);
    let addButton = null;
    for (const frame of targetPage.frames()) {
        let btn = frame.locator('.subform-table-operation-add, [class*="operation-add"]').first();
        if (!await btn.isVisible()) {
            btn = frame.locator('div, span').filter({ hasText: '添加新数据' }).last();
        }
        if (await btn.isVisible()) {
            addButton = btn;
            break;
        }
    }

    if (!addButton) throw new Error("无法找到‘添加新数据’按钮");
    await addButton.click({ force: true });
    console.log('🖱️ 已执行点击 [添加新数据]');

    // --- 步骤 6: 精准填报 (核心逻辑) ---
    console.log(`📝 等待表格行渲染...`);
    await targetPage.waitForTimeout(1000);

    const detailKey = "1701760347219_7862"; 
    const detailInput = targetPage.locator(`textarea[name*="${detailKey}"], textarea:visible`).last();
    await detailInput.waitFor({ state: 'visible', timeout: 8000 });
    
    const currentRow = detailInput.locator('xpath=./ancestor::tr');
    console.log('📍 目标输入行已锁定');

    // --- A. 填写【任务标题】 ---
    if (taskData['需求名称']) {
         const titleKey = "1701760319933_7860";
         console.log(`✍️ 正在填写标题: ${taskData['需求名称']}`);
         const titleInput = currentRow.locator(`input[name*="${titleKey}"], textarea[name*="${titleKey}"]`).first();
         
         if (await titleInput.isVisible()) {
             await titleInput.fill(taskData['需求名称']);
         } else {
             const cell = currentRow.locator('td').nth(2);
             await cell.click({ force: true }); 
             await targetPage.waitForTimeout(500); 
             const cellInput = cell.locator('input, textarea').first();
             if (await cellInput.isVisible()) {
                 await cellInput.fill(taskData['需求名称']);
             } else {
                 await targetPage.keyboard.type(taskData['需求名称']);
             }
         }
         console.log('✅ 标题已填');
    }

    // --- B. 填写【任务详情】 ---
    console.log(`📋 任务详情内容: "${taskData['任务详情']}"`);
    if (taskData['任务详情']) {
         console.log(`✍️ 正在填写任务详情: ${taskData['任务详情'].substring(0, 50)}...`);
         await detailInput.fill(taskData['任务详情']);
         const filledValue = await detailInput.inputValue();
         console.log(`✅ 详情已填，当前值: ${filledValue.substring(0, 30)}...`);
    } else {
         console.log(`⚠️ 任务详情为空，使用默认值`);
         await detailInput.fill('自动创建的任务');
         console.log('✅ 详情已填（默认值）');
    }

    // --- C. 填写【开发人员】 ---
    if (taskData['负责人']) {
        console.log(`👤 正在指派负责人: ${taskData['负责人']}`);
        const devCell = currentRow.locator('td').nth(4);
        const trigger = devCell.locator('.fish-select-selector, div[role="combobox"]').first();
        
        if (await trigger.isVisible()) {
            await trigger.click();
        } else {
            await devCell.click({ force: true });
        }
        
        const selectUserBtn = targetPage.locator('button.fish-btn-round').filter({ hasText: '选择用户' }).last();
        try {
            await selectUserBtn.waitFor({ state: 'visible', timeout: 3000 });
            await selectUserBtn.click();
            
            const searchInput = targetPage.locator('input[placeholder="请输入简拼或关键词"]');
            await searchInput.waitFor({ state: 'visible', timeout: 5000 });
            await searchInput.fill(taskData['负责人']);
            await targetPage.waitForTimeout(500); 
            await targetPage.keyboard.press('Enter'); 
            
            const userItem = targetPage.locator('.uc-user-name').filter({ hasText: taskData['负责人'] }).first();
            await userItem.waitFor({ state: 'visible', timeout: 5000 });
            await userItem.click();

            const confirmBtn = targetPage.locator('.fish-modal-footer .fish-btn-primary').last();
            await confirmBtn.click();
            console.log('✅ 负责人已在弹窗中确认');

            // --- 【核心修改：失焦逻辑】 ---
            console.log('🖱️ 正在点击页面空白处触发失焦，以解锁后续单元格...');
            await targetPage.waitForTimeout(800); // 等待弹窗消失的动画
            await targetPage.mouse.click(10, 10);  // 点击左上角绝对空白区域
            await targetPage.waitForTimeout(500); // 给系统反应时间处理数据存入
            
        } catch (e) {
            console.warn('⚠️ 负责人填报异常，尝试强制点击空白处避错...');
            await targetPage.mouse.click(10, 10);
        }
    }

   // --- D. 填写【编码计划完成时间】 (双段式单元格激活版) ---
   // --- D. 填写【编码计划完成时间】 (终极自愈版) ---
    console.log('📅 准备填写 [编码计划完成时间]...');

    // 1. 准备日期数据
    let dateObj = new Date(); 
    let rawDate = taskData['完成时间'] || taskData['*编码计划完成时间'] || taskData['编码计划完成时间'];
    
    if (rawDate) {
        if (/^\d+$/.test(String(rawDate))) {
            rawDate = parseInt(rawDate, 10);
        }
        const parsedDate = new Date(rawDate);
        if (!isNaN(parsedDate.getTime())) {
            dateObj = parsedDate;
        }
    }
    
    const y = dateObj.getFullYear();
    const m = dateObj.getMonth() + 1;
    const d = dateObj.getDate();
    const targetTitle = `${y}年${m}月${d}日`; 
    const standardDate = `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;

    console.log(`🎯 目标格式化日期: ${targetTitle}`);

    // 2. 锁定第 6 列单元格本身
    const dateCell = currentRow.locator('td').nth(5);
    
    try {
        console.log('🖱️ 步骤1：先点击第 6 列单元格，尝试激活编辑状态...');
        await dateCell.click({ force: true });
        await targetPage.waitForTimeout(500); 

        const dateInput = dateCell.locator('input').first();
        if (await dateInput.isVisible()) {
            console.log('🖱️ 步骤2：发现输入框，唤起日历...');
            // 【重点优化】使用 dispatchEvent 模拟最底层点击，比普通的 click 更容易唤起复杂组件
            await dateInput.dispatchEvent('click');
        }

        console.log('👀 正在捕捉可见的日历浮层...');
        const calendarPanel = targetPage.locator('.fish-calendar-picker-container:visible, .fish-calendar-panel:visible').first();
        
        // 【重点优化】把等待时间缩短到 3 秒，弹不出来就别死等，赶紧走保底
        await calendarPanel.waitFor({ state: 'visible', timeout: 4000 });
        
        const dayCell = calendarPanel.locator(`td[title="${targetTitle}"]`);
        if (await dayCell.isVisible()) {
            await dayCell.click();
            console.log(`✅ 已精准点击日历单元格: ${targetTitle}`);
        } else {
            throw new Error("日历中没找到对应的日期"); // 故意报错去走保底
        }

        // 成功后失焦
        await targetPage.waitForTimeout(500); 
        await targetPage.mouse.click(10, 10); 
        await targetPage.waitForTimeout(500); 
        
    } catch (err) {
        console.warn(`⚠️ 日历交互受阻 (${err.message})，启动终极强行注入...`);
        
        try {
            // 【核心修复】必须重新点击单元格！因为刚刚超时等待可能导致 input 已经销毁了
            console.log('🔄 重新唤醒单元格编辑态...');
            await dateCell.click({ force: true });
            await targetPage.waitForTimeout(500); // 必须等一下 input 渲染

            const fallbackInput = dateCell.locator('input').first();
            
            if (await fallbackInput.isVisible()) {
                console.log('⌨️ 正在移除只读属性并强行注入文字...');
                await fallbackInput.evaluate(el => el.removeAttribute('readonly'));
                await fallbackInput.fill(standardDate);
                await targetPage.keyboard.press('Enter');
                console.log(`✅ 强行注入成功: ${standardDate}`);
            } else {
                console.log('⌨️ 没找到 input，尝试直接键盘盲打...');
                await targetPage.keyboard.type(standardDate);
                await targetPage.keyboard.press('Enter');
            }
            
            // 填完后一定要点击空白失焦，否则会影响后面的工时填写
            await targetPage.mouse.click(10, 10);
            await targetPage.waitForTimeout(500);
            
        } catch (innerErr) {
            console.error('❌ 日期填报彻底失败:', innerErr.message);
        }
    }

    // --- D. 填写【编码预估工时】 ---
    if (taskData['工时']) {
        const hoursCell = currentRow.locator('td').nth(6);
        const hoursInput = hoursCell.locator('input').first();
        if (await hoursInput.isVisible()) {
            await hoursInput.click();
            await hoursInput.fill(String(taskData['工时']));
            console.log('✅ 第7列工时已填');
        }
    }

    // --- E. 提交保存 ---
    console.log(`💾 正在提交...`);
    const saveBtn = targetPage.locator('button:visible').filter({ hasText: /确 定|保 存|提 交/ }).last();
    if (await saveBtn.isVisible()) {
        await saveBtn.click();
        console.log('🎉 提交按钮已点击');
    }

    // --- F. 等待页面跳转并获取URL ---
    console.log('⏳ 等待页面跳转完成...');
    let finalUrl = '';
    try {
        // 等待 URL 变化或者页面加载完成
        await targetPage.waitForLoadState('networkidle', { timeout: 10000 }).catch(() => {});
        
        // 额外等待确保URL稳定
        await targetPage.waitForTimeout(2000);
        
        // 获取当前页面的URL
        finalUrl = targetPage.url();
        console.log(`📍 任务详情页URL: ${finalUrl}`);
    } catch (e) {
        console.warn('⚠️ 获取URL失败:', e.message);
        finalUrl = '';
    }

    // 【修复 3】：自动保活机制：将本次运行刷新后的最新 Cookie/Token 写回本地
    try {
        await context.storageState({ path: authPath });
        console.log('🔄 已自动刷新并保存最新登录凭证至 auth.json，延长免登录有效期。');
    } catch (e) {
        console.warn('⚠️ 刷新凭证失败，但不影响本次任务执行。');
    }

    console.log(`🎉 [${uuid}] 全流程执行成功！`);

    res.json({ success: true, message: `任务 [${uuid}] 填报完成`, orderUrl: finalUrl });

  } catch (error) {
    console.error('❌ 执行失败:', error.message);
    try {
        // 由于上面我们把 targetPage 初始化为了 page，所以即使没弹窗报错，这里的 targetPage 也是安全的
        await targetPage.screenshot({ path: `error-${uuid}.png`, fullPage: true });
    } catch (e) { console.log('截图失败'); }
    if (!res.headersSent) res.status(500).json({ success: false, error: error.message });
  }
});

app.listen(port, () => {
  console.log(`🚀 自动化服务已启动，监听端口: ${port}`);
});