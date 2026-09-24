import { Router } from "express";
import { chromium } from "playwright";
import fs from "fs";
import path from "path";
const router = Router();
// 统一认证文件路径（从 cwd 向上到 openclaw 根目录）
const OPENCLAW_ROOT = path.resolve(process.cwd(), '..', '..');
const AUTH_PATH = path.join(OPENCLAW_ROOT, 'data', 'auth', 'oa-auth.json');
const LEGACY_AUTH_PATH = path.resolve(OPENCLAW_ROOT, '..', 'mcp', 'auth.json');
function getAuthPath() {
    // 确保目录存在
    const authDir = path.dirname(AUTH_PATH);
    if (!fs.existsSync(authDir))
        fs.mkdirSync(authDir, { recursive: true });
    // 优先用统一路径
    if (fs.existsSync(AUTH_PATH))
        return AUTH_PATH;
    // 兼容旧路径：如果旧文件存在，复制到新位置
    if (fs.existsSync(LEGACY_AUTH_PATH)) {
        fs.copyFileSync(LEGACY_AUTH_PATH, AUTH_PATH);
        console.log(`[OA-Auth] 已从旧路径迁移 auth.json → ${AUTH_PATH}`);
        return AUTH_PATH;
    }
    // 返回新路径（即使文件不存在，首次登录后会创建）
    return AUTH_PATH;
}
router.post('/execute', async (req, res) => {
    const body = req.body;
    console.log('\n========================================');
    console.log('📨 [自动下单] 收到执行请求:');
    console.log(JSON.stringify(body, null, 2));
    console.log('========================================\n');
    const { uuid, taskData, oaConfig } = body;
    const authPath = getAuthPath();
    console.log(`\n📦 接收到执行请求: ${taskData['任务详情']} (UUID: ${uuid})`);
    const browser = await chromium.launch({ headless: false, slowMo: 50 });
    console.log(`🔑 认证文件: ${authPath} (${fs.existsSync(authPath) ? '存在' : '不存在，首次需登录'})`);
    const context = await browser.newContext({
        storageState: fs.existsSync(authPath) ? authPath : undefined,
        viewport: { width: 1440, height: 900 }
    });
    let page = await context.newPage();
    let targetPage = page;
    try {
        console.log(`🚀 正在打开业务页面...`);
        await page.goto(oaConfig.url, { waitUntil: 'networkidle' });
        const currentUrl = page.url();
        if (currentUrl.includes('login') || await page.locator('input[type="password"]').isVisible({ timeout: 2000 }).catch(() => false)) {
            throw new Error('❌ 自动登录失败：凭证已过期！请运行 save_auth 重新登录。');
        }
        try {
            await page.getByRole('button', { name: '确定' }).click({ timeout: 3000 });
        }
        catch (e) { }
        console.log(`📂 进入【全需求列表】...`);
        await page.locator('text="[管理员权限菜单]"').first().click();
        await page.waitForTimeout(1000);
        await page.locator('text="全需求列表"').first().click();
        await page.waitForLoadState('networkidle');
        console.log(`🔍 检索 UUID: ${uuid}`);
        const searchInput = page.locator('input[placeholder*="关键词"], input[placeholder*="搜索"]').first();
        await searchInput.click();
        await page.keyboard.press('Control+A');
        await page.keyboard.press('Backspace');
        await searchInput.fill(uuid);
        await page.keyboard.press('Enter');
        console.log(`⏳ 启动两段式雷达：正在锁定行并强制展开视图...`);
        let actionState = "SEARCHING";
        const timeout = 20000;
        const start = Date.now();
        let activeFrame = null;
        while (Date.now() - start < timeout && actionState !== "CLICKED") {
            for (const frame of page.frames()) {
                if (actionState === "SEARCHING") {
                    const scrollResult = await frame.evaluate((targetUuid) => {
                        const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
                        let node;
                        while (node = walker.nextNode()) {
                            if (node.textContent?.includes(targetUuid)) {
                                const row = node.parentElement?.closest('tr, .ant-table-row, .fish-table-row, [class*="row"]');
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
                        const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
                        let node;
                        while (node = walker.nextNode()) {
                            if (node.textContent?.includes(targetUuid)) {
                                const row = node.parentElement?.closest('tr, .ant-table-row, .fish-table-row, [class*="row"]');
                                if (row) {
                                    let target = row.querySelector('[title="@增加子任务链接"]');
                                    if (!target) {
                                        const candidates = Array.from(row.querySelectorAll('a, span, i, div'));
                                        target = candidates.find((el) => {
                                            const txt = (el.innerText || "").trim();
                                            return txt.includes('@') && txt.includes('增加') && txt.includes('链接');
                                        });
                                    }
                                    if (!target) {
                                        target = Array.from(row.querySelectorAll('a')).find((el) => el.href && el.href.includes('input_'));
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
            if (actionState === "CLICKED")
                break;
            await page.waitForTimeout(1000);
        }
        if (actionState !== "CLICKED")
            throw new Error("无法找到或点击'@增加子任务链接'");
        console.log('🎉 链接点击成功！正在接管新页面...');
        await page.waitForTimeout(3000);
        const allPages = context.pages();
        if (allPages.length > 1) {
            targetPage = allPages[allPages.length - 1];
            await targetPage.bringToFront();
            console.log(`✅ 成功接管新标签页: ${await targetPage.title()}`);
        }
        await targetPage.waitForLoadState('domcontentloaded');
        console.log('⏳ 页面已打开，正在启动"草稿雷达" (扫描 6 秒)...');
        // 草稿恢复弹窗处理
        const recoveryDialog = targetPage.locator('[data-testid="confirm-message"]');
        try {
            await recoveryDialog.waitFor({ state: 'visible', timeout: 6000 });
            const cancelBtn = targetPage.locator('button:visible').filter({ hasText: /取 消|否|不载入/ }).last();
            if (await cancelBtn.isVisible()) {
                await cancelBtn.click();
                console.log('🛡️ 已清除历史草稿');
                await targetPage.waitForTimeout(1000);
            }
        }
        catch (e) {
            console.log('✅ 无干扰弹窗，流程继续。');
        }
        // 添加新数据
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
        if (!addButton)
            throw new Error("无法找到'添加新数据'按钮");
        await addButton.click({ force: true });
        console.log('🖱️ 已点击 [添加新数据]');
        // 精准填报
        console.log(`📝 等待表格行渲染...`);
        await targetPage.waitForTimeout(1000);
        const detailKey = "1701760347219_7862";
        const detailInput = targetPage.locator(`textarea[name*="${detailKey}"], textarea:visible`).last();
        await detailInput.waitFor({ state: 'visible', timeout: 8000 });
        const currentRow = detailInput.locator('xpath=./ancestor::tr');
        // 填写标题
        if (taskData['需求名称']) {
            const titleKey = "1701760319933_7860";
            console.log(`✍️ 填写标题: ${taskData['需求名称']}`);
            const titleInput = currentRow.locator(`input[name*="${titleKey}"], textarea[name*="${titleKey}"]`).first();
            if (await titleInput.isVisible()) {
                await titleInput.fill(taskData['需求名称']);
            }
            else {
                const cell = currentRow.locator('td').nth(2);
                await cell.click({ force: true });
                await targetPage.waitForTimeout(500);
                const cellInput = cell.locator('input, textarea').first();
                if (await cellInput.isVisible()) {
                    await cellInput.fill(taskData['需求名称']);
                }
                else {
                    await targetPage.keyboard.type(taskData['需求名称']);
                }
            }
        }
        // 填写详情
        if (taskData['任务详情']) {
            await detailInput.fill(taskData['任务详情']);
        }
        else {
            await detailInput.fill('自动创建的任务');
        }
        // 填写负责人
        if (taskData['负责人']) {
            console.log(`👤 指派负责人: ${taskData['负责人']}`);
            const devCell = currentRow.locator('td').nth(4);
            const trigger = devCell.locator('.fish-select-selector, div[role="combobox"]').first();
            if (await trigger.isVisible()) {
                await trigger.click();
            }
            else {
                await devCell.click({ force: true });
            }
            const selectUserBtn = targetPage.locator('button.fish-btn-round').filter({ hasText: '选择用户' }).last();
            try {
                await selectUserBtn.waitFor({ state: 'visible', timeout: 3000 });
                await selectUserBtn.click();
                const searchInputUser = targetPage.locator('input[placeholder="请输入简拼或关键词"]');
                await searchInputUser.waitFor({ state: 'visible', timeout: 5000 });
                await searchInputUser.fill(taskData['负责人']);
                await targetPage.waitForTimeout(500);
                await targetPage.keyboard.press('Enter');
                const userItem = targetPage.locator('.uc-user-name').filter({ hasText: taskData['负责人'] }).first();
                await userItem.waitFor({ state: 'visible', timeout: 5000 });
                await userItem.click();
                const confirmBtn = targetPage.locator('.fish-modal-footer .fish-btn-primary').last();
                await confirmBtn.click();
                await targetPage.waitForTimeout(800);
                await targetPage.mouse.click(10, 10);
                await targetPage.waitForTimeout(500);
            }
            catch (e) {
                await targetPage.mouse.click(10, 10);
            }
        }
        // 填写日期
        let dateObj = new Date();
        let rawDate = taskData['完成时间'] || taskData['*编码计划完成时间'] || taskData['编码计划完成时间'];
        if (rawDate) {
            if (/^\d+$/.test(String(rawDate)))
                rawDate = parseInt(rawDate, 10);
            const parsedDate = new Date(rawDate);
            if (!isNaN(parsedDate.getTime()))
                dateObj = parsedDate;
        }
        const y = dateObj.getFullYear(), m = dateObj.getMonth() + 1, d = dateObj.getDate();
        const targetTitle = `${y}年${m}月${d}日`;
        const standardDate = `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
        console.log(`📅 日期: ${targetTitle}`);
        const dateCell = currentRow.locator('td').nth(5);
        try {
            await dateCell.click({ force: true });
            await targetPage.waitForTimeout(500);
            const dateInput = dateCell.locator('input').first();
            if (await dateInput.isVisible())
                await dateInput.dispatchEvent('click');
            const calendarPanel = targetPage.locator('.fish-calendar-picker-container:visible, .fish-calendar-panel:visible').first();
            await calendarPanel.waitFor({ state: 'visible', timeout: 4000 });
            const dayCell = calendarPanel.locator(`td[title="${targetTitle}"]`);
            if (await dayCell.isVisible()) {
                await dayCell.click();
            }
            else {
                throw new Error("日历中没找到日期");
            }
            await targetPage.waitForTimeout(500);
            await targetPage.mouse.click(10, 10);
            await targetPage.waitForTimeout(500);
        }
        catch (err) {
            console.warn(`⚠️ 日历交互受阻，启动强行注入...`);
            try {
                await dateCell.click({ force: true });
                await targetPage.waitForTimeout(500);
                const fallbackInput = dateCell.locator('input').first();
                if (await fallbackInput.isVisible()) {
                    await fallbackInput.evaluate((el) => el.removeAttribute('readonly'));
                    await fallbackInput.fill(standardDate);
                    await targetPage.keyboard.press('Enter');
                }
                else {
                    await targetPage.keyboard.type(standardDate);
                    await targetPage.keyboard.press('Enter');
                }
                await targetPage.mouse.click(10, 10);
                await targetPage.waitForTimeout(500);
            }
            catch (innerErr) {
                console.error('❌ 日期填报失败:', innerErr.message);
            }
        }
        // 填写工时
        if (taskData['工时']) {
            const hoursCell = currentRow.locator('td').nth(6);
            const hoursInput = hoursCell.locator('input').first();
            if (await hoursInput.isVisible()) {
                await hoursInput.click();
                await hoursInput.fill(String(taskData['工时']));
            }
        }
        // 提交
        console.log(`💾 正在提交...`);
        const saveBtn = targetPage.locator('button:visible').filter({ hasText: /确 定|保 存|提 交/ }).last();
        if (await saveBtn.isVisible())
            await saveBtn.click();
        // 获取最终URL
        let finalUrl = '';
        try {
            await targetPage.waitForLoadState('networkidle', { timeout: 10000 }).catch(() => { });
            await targetPage.waitForTimeout(2000);
            finalUrl = targetPage.url();
        }
        catch (e) {
            finalUrl = '';
        }
        // 保存凭证（每次执行后刷新，延长免登录有效期）
        try {
            await context.storageState({ path: authPath });
            console.log(`🔄 已刷新登录凭证至 ${authPath}`);
        }
        catch (e) {
            console.warn('⚠️ 刷新凭证失败');
        }
        console.log(`🎉 [${uuid}] 全流程执行成功！`);
        res.json({ success: true, message: `任务 [${uuid}] 填报完成`, orderUrl: finalUrl });
    }
    catch (error) {
        console.error('❌ 执行失败:', error.message);
        try {
            await targetPage.screenshot({ path: `error-${uuid}.png`, fullPage: true });
        }
        catch (e) { }
        if (!res.headersSent)
            res.status(500).json({ success: false, error: error.message });
    }
});
export default router;
//# sourceMappingURL=automation.js.map