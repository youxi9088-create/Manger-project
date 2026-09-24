// ==UserScript==
// @name         通用自动课程/视频播放器（Universal Auto Player）
// @namespace    https://github.com/workbuddy/auto-player
// @version      2.0.0
// @description  自动扫描课程列表并播放视频，适配多数培训网站、慕课平台、视频网站。
// @author       WorkBuddy
// @match        *://*/*
// @grant        GM_setValue
// @grant        GM_getValue
// @grant        GM_registerMenuCommand
// @run-at       document-end
// ==/UserScript==

(function () {
    'use strict';

    // ==================== 配置 ====================
    const CONFIG = {
        // 播放倍速（0 = 播放器支持的最高速；具体数值如 2 = 2x）
        speed: 2,
        // 是否静音
        muted: true,
        // 课程完成后等待多少秒再进入下一门
        nextDelay: 5,
        // 是否只处理包含"必修"/"必学"/"未学习"等关键字的课程
        requiredOnly: false,
        // 主循环轮询间隔（毫秒）
        pollInterval: 2500,
        // 页面元素最长等待时间（毫秒）
        waitTimeout: 30000,
        // 调试日志
        debug: true,
        // 持久化状态键名（按域名隔离）
        storageKey: 'universal_auto_player_state_' + location.hostname,
    };

    // ==================== 状态管理 ====================
    const STATE = {
        running: false,
        paused: false,
        currentCourseIndex: 0,
        courseList: [],
        completedCourses: [],
        totalCourses: 0,
        currentStep: 'idle', // idle | scanning | playing | waiting | done | paused
    };

    // ==================== 工具函数 ====================
    function log(...args) {
        if (CONFIG.debug) console.log('[自动播放器]', ...args);
    }

    function sleep(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    function debounce(fn, ms) {
        let t;
        return (...args) => {
            clearTimeout(t);
            t = setTimeout(() => fn(...args), ms);
        };
    }

    // 持久化：保存/读取状态
    function saveState() {
        try {
            GM_setValue(CONFIG.storageKey, JSON.stringify({
                currentCourseIndex: STATE.currentCourseIndex,
                completedCourses: STATE.completedCourses,
                totalCourses: STATE.totalCourses,
                courseTitles: STATE.courseList.map(c => c.title),
                lastUrl: location.href,
                timestamp: Date.now(),
            }));
        } catch (e) { }
    }

    function loadState() {
        try {
            const raw = GM_getValue(CONFIG.storageKey, null);
            if (!raw) return null;
            const data = JSON.parse(raw);
            // 超过 24 小时的进度不恢复
            if (!data.timestamp || Date.now() - data.timestamp > 24 * 3600 * 1000) return null;
            return data;
        } catch (e) { return null; }
    }

    function clearSavedState() {
        try { GM_setValue(CONFIG.storageKey, ''); } catch (e) { }
    }

    // ==================== UI 面板 ====================
    function createPanel() {
        const panel = document.createElement('div');
        panel.id = 'auto-player-panel';
        panel.innerHTML = `
            <style>
                #auto-player-panel {
                    position: fixed;
                    top: 12px;
                    right: 12px;
                    z-index: 2147483647;
                    background: linear-gradient(135deg, #1a1a2e 0%, #16213e 100%);
                    border: 1px solid #0f3460;
                    border-radius: 14px;
                    padding: 18px;
                    width: 340px;
                    max-height: 88vh;
                    overflow-y: auto;
                    font-family: "Microsoft YaHei", "PingFang SC", sans-serif;
                    color: #e0e0e0;
                    box-shadow: 0 10px 40px rgba(0,0,0,0.5);
                    font-size: 13px;
                    line-height: 1.5;
                }
                #auto-player-panel h3 {
                    margin: 0 0 12px 0;
                    color: #e94560;
                    font-size: 16px;
                    border-bottom: 1px solid #0f3460;
                    padding-bottom: 10px;
                }
                #auto-player-panel .status-bar {
                    background: #0f3460;
                    border-radius: 8px;
                    padding: 10px 12px;
                    margin-bottom: 12px;
                    font-size: 12px;
                }
                #auto-player-panel .status-bar .label { color: #888; font-size: 11px; }
                #auto-player-panel .status-bar .value { color: #e94560; font-weight: bold; }
                #auto-player-panel .progress-bar {
                    width: 100%; height: 6px; background: #0f3460;
                    border-radius: 3px; margin: 8px 0; overflow: hidden;
                }
                #auto-player-panel .progress-fill {
                    height: 100%; background: linear-gradient(90deg, #e94560, #ff6b6b);
                    border-radius: 3px; transition: width 0.3s ease; width: 0%;
                }
                #auto-player-panel button {
                    display: block; width: 100%; margin: 6px 0; padding: 9px;
                    border: none; border-radius: 8px; font-size: 13px;
                    font-weight: bold; cursor: pointer; transition: all 0.2s;
                    font-family: inherit;
                }
                #auto-player-panel button:hover { transform: translateY(-1px); opacity: 0.95; }
                #auto-player-panel .btn-start { background: linear-gradient(135deg, #e94560, #c23152); color: white; }
                #auto-player-panel .btn-stop { background: #333; color: #ccc; }
                #auto-player-panel .btn-pause { background: #f0ad4e; color: #1a1a2e; }
                #auto-player-panel .btn-scan { background: #0f3460; color: #4fc3f7; border: 1px solid #4fc3f7; }
                #auto-player-panel .btn-skip { background: #555; color: #ddd; font-size: 12px; padding: 6px; }
                #auto-player-panel .course-list {
                    margin-top: 10px; max-height: 220px; overflow-y: auto;
                    font-size: 11px; border-top: 1px solid #0f3460; padding-top: 8px;
                }
                #auto-player-panel .course-item {
                    padding: 4px 6px; border-radius: 4px; margin: 2px 0;
                    display: flex; justify-content: space-between; align-items: center;
                }
                #auto-player-panel .course-item.current { background: rgba(233,69,96,0.2); border-left: 3px solid #e94560; }
                #auto-player-panel .course-item.done { color: #4caf50; }
                #auto-player-panel .course-item.pending { color: #aaa; }
                #auto-player-panel .log-area {
                    margin-top: 10px; background: #0a0a1a; border-radius: 6px;
                    padding: 8px; max-height: 140px; overflow-y: auto;
                    font-size: 10px; color: #666; font-family: monospace;
                }
                #auto-player-panel .log-line { margin: 2px 0; }
                #auto-player-panel .log-line.info { color: #4fc3f7; }
                #auto-player-panel .log-line.success { color: #4caf50; }
                #auto-player-panel .log-line.warn { color: #f0ad4e; }
                #auto-player-panel .log-line.error { color: #e94560; }
                #auto-player-panel .setting-row {
                    display: flex; align-items: center; justify-content: space-between;
                    margin: 4px 0; font-size: 11px;
                }
                #auto-player-panel input, #auto-player-panel select {
                    background: #0f3460; border: 1px solid #333; color: #e0e0e0;
                    border-radius: 4px; padding: 4px; text-align: center;
                }
                #auto-player-panel .toggle-btn {
                    display: inline-block; padding: 2px 8px; border-radius: 10px;
                    cursor: pointer; font-size: 11px; border: 1px solid #555;
                }
                #auto-player-panel .toggle-btn.on { background: #4caf50; color: white; border-color: #4caf50; }
                #auto-player-panel .toggle-btn.off { background: #555; color: #aaa; }
                #auto-player-panel .minimize-btn {
                    position: absolute; top: 8px; right: 10px; width: 24px; height: 24px;
                    font-size: 16px; color: #888; cursor: pointer; text-align: center;
                }
                #auto-player-panel.collapsed { padding: 10px 18px; width: auto; }
                #auto-player-panel.collapsed .panel-body { display: none; }
                #auto-player-panel .tip { font-size: 10px; color: #777; margin-top: 6px; }
            </style>

            <div class="minimize-btn" id="panel-minimize">−</div>
            <div class="panel-body">
                <h3>🎬 通用自动播放器</h3>

                <div class="status-bar">
                    <div><span class="label">状态：</span><span class="value" id="status-text">就绪</span></div>
                    <div><span class="label">进度：</span><span class="value" id="progress-text">0 / 0</span></div>
                    <div class="progress-bar"><div class="progress-fill" id="progress-fill"></div></div>
                    <div><span class="label">当前：</span><span class="value" id="current-course">-</span></div>
                </div>

                <button class="btn-scan" id="btn-scan">🔍 扫描课程/视频</button>
                <button class="btn-start" id="btn-start">▶ 开始自动播放</button>
                <button class="btn-pause" id="btn-pause" style="display:none">⏸ 暂停</button>
                <button class="btn-skip" id="btn-skip">⏭ 跳过当前</button>
                <button class="btn-stop" id="btn-stop">⏹ 停止并清空进度</button>

                <div style="margin-top:10px; border-top: 1px solid #0f3460; padding-top:10px">
                    <div class="setting-row">
                        <span>播放倍速</span>
                        <select id="setting-speed">
                            <option value="0">自动最高</option>
                            <option value="1">1x</option>
                            <option value="1.25">1.25x</option>
                            <option value="1.5">1.5x</option>
                            <option value="2" selected>2x</option>
                            <option value="3">3x</option>
                            <option value="4">4x</option>
                        </select>
                    </div>
                    <div class="setting-row">
                        <span>静音</span>
                        <span class="toggle-btn on" id="setting-muted">开</span>
                    </div>
                    <div class="setting-row">
                        <span>仅未学完/必修</span>
                        <span class="toggle-btn off" id="setting-required">关</span>
                    </div>
                    <div class="setting-row">
                        <span>课程间隔(秒)</span>
                        <input type="number" id="setting-delay" value="5" min="1" max="60" style="width:60px">
                    </div>
                </div>

                <div class="course-list" id="course-list">
                    <div style="color:#555; text-align:center; padding:10px;">点击"扫描课程/视频"开始</div>
                </div>

                <div class="log-area" id="log-area"></div>
                <div class="tip">快捷键：Ctrl+Shift+S 开始/暂停，Ctrl+Shift+Q 停止</div>
            </div>
        `;
        document.body.appendChild(panel);
        return panel;
    }

    // ==================== 日志面板 ====================
    function addLog(msg, type = 'info') {
        const logArea = document.getElementById('log-area');
        if (!logArea) return;
        const line = document.createElement('div');
        line.className = 'log-line ' + type;
        const time = new Date().toLocaleTimeString();
        line.textContent = `[${time}] ${msg}`;
        logArea.appendChild(line);
        if (logArea.children.length > 80) logArea.removeChild(logArea.firstChild);
        logArea.scrollTop = logArea.scrollHeight;
        console.log(`[${type.toUpperCase()}]`, msg);
    }

    // ==================== UI 更新 ====================
    function updateUI() {
        const statusText = document.getElementById('status-text');
        const progressText = document.getElementById('progress-text');
        const progressFill = document.getElementById('progress-fill');
        const currentCourse = document.getElementById('current-course');

        const statusMap = {
            'idle': '就绪', 'scanning': '扫描中...', 'playing': '播放中',
            'waiting': '等待跳转', 'paused': '已暂停', 'done': '全部完成！',
        };
        if (statusText) statusText.textContent = statusMap[STATE.currentStep] || STATE.currentStep;
        if (progressText) progressText.textContent = `${STATE.completedCourses.length} / ${STATE.totalCourses}`;
        if (progressFill) {
            const pct = STATE.totalCourses > 0 ? (STATE.completedCourses.length / STATE.totalCourses * 100) : 0;
            progressFill.style.width = pct + '%';
        }
        if (currentCourse) {
            currentCourse.textContent = STATE.courseList[STATE.currentCourseIndex]
                ? STATE.courseList[STATE.currentCourseIndex].title
                : '-';
        }
        renderCourseList();
    }

    function renderCourseList() {
        const container = document.getElementById('course-list');
        if (!container) return;
        if (STATE.courseList.length === 0) {
            container.innerHTML = '<div style="color:#555;text-align:center;padding:10px;">暂无课程</div>';
            return;
        }
        let html = '';
        STATE.courseList.forEach((course, i) => {
            let cls = 'course-item ';
            let badge = '';
            if (STATE.completedCourses.includes(i)) {
                cls += 'done'; badge = '<span style="color:#4caf50">✓</span>';
            } else if (i === STATE.currentCourseIndex && STATE.running) {
                cls += 'current'; badge = '<span style="color:#f0ad4e">▶</span>';
            } else {
                cls += 'pending';
                badge = course.isRequired ? '<span style="color:#e94560">必修</span>' : '<span style="color:#666">选修</span>';
            }
            html += `<div class="${cls}"><span>${i + 1}. ${(course.title || `项目 #${i + 1}`).substring(0, 28)}</span>${badge}</div>`;
        });
        container.innerHTML = html;
    }

    // ==================== 通用 DOM 工具 ====================
    function findElement(selectors) {
        if (typeof selectors === 'string') selectors = [selectors];
        for (const sel of selectors) {
            try {
                const el = document.querySelector(sel);
                if (el) return el;
            } catch (e) { }
        }
        return null;
    }

    function findElements(selectors) {
        if (typeof selectors === 'string') selectors = [selectors];
        for (const sel of selectors) {
            try {
                const els = document.querySelectorAll(sel);
                if (els.length > 0) return Array.from(els);
            } catch (e) { }
        }
        return [];
    }

    async function waitForElement(selectors, timeout = CONFIG.waitTimeout) {
        const el = findElement(selectors);
        if (el) return el;
        const start = Date.now();
        while (Date.now() - start < timeout) {
            const found = findElement(selectors);
            if (found) return found;
            await sleep(500);
        }
        return null;
    }

    function isVisible(el) {
        if (!el) return false;
        const rect = el.getBoundingClientRect();
        return rect.width > 0 && rect.height > 0 && el.offsetParent !== null;
    }

    function safeClick(el) {
        if (!el) return false;
        try {
            el.scrollIntoView({ behavior: 'instant', block: 'center' });
            el.click();
            return true;
        } catch (e) {
            try {
                const event = new MouseEvent('click', { bubbles: true, cancelable: true, view: window });
                el.dispatchEvent(event);
                return true;
            } catch (e2) {
                return false;
            }
        }
    }

    // ==================== Shadow DOM / Iframe 搜索 ====================
    function queryDeep(selector, root = document) {
        const results = [];
        try {
            results.push(...Array.from(root.querySelectorAll(selector)));
            const shadows = root.querySelectorAll('*');
            for (const node of shadows) {
                if (node.shadowRoot) {
                    results.push(...queryDeep(selector, node.shadowRoot));
                }
            }
            const iframes = root.querySelectorAll('iframe');
            for (const iframe of iframes) {
                try {
                    const doc = iframe.contentDocument || iframe.contentWindow?.document;
                    if (doc) results.push(...queryDeep(selector, doc));
                } catch (e) { }
            }
        } catch (e) { }
        return results;
    }

    // ==================== 课程扫描（多层策略） ====================
    function scanCourses() {
        STATE.currentStep = 'scanning';
        updateUI();
        addLog('正在扫描页面中的课程/视频...', 'info');

        const raw = [];

        // 策略1：常见课程卡片选择器
        const cardSelectors = [
            '.course-card', '.course-item', '.course-list-item',
            '.el-card', '.ant-card', '.card-item',
            '.training-course-item', '.curriculum-item',
            '.courseware-item', '.chapter-item', '.lesson-item',
            '.study-item', '.task-item', '.list-item',
            '[class*="course"][class*="item"]', '[class*="course"][class*="card"]',
            '[class*="lesson"][class*="item"]', '[class*="chapter"][class*="item"]',
        ];
        let courseElements = findElements(cardSelectors);
        if (courseElements.length > 0) addLog(`找到 ${courseElements.length} 个课程卡片`, 'info');

        // 策略2：表格行
        if (courseElements.length === 0) {
            const rows = Array.from(document.querySelectorAll('table tr, .el-table__row, .ant-table-row'));
            courseElements = rows.filter(r => r.querySelectorAll('th').length === 0 && r.textContent.trim().length > 5);
            if (courseElements.length > 0) addLog(`通过表格找到 ${courseElements.length} 行`, 'info');
        }

        // 策略3：包含"必修/选修/未学习/继续学习/去学习"等关键词的可点击元素
        if (courseElements.length === 0) {
            const containers = new Set();
            const markerWords = /必修|选修|未学习|未观看|待学习|去学习|继续学习|继续观看|点击学习|立即学习|播放|进入课程/;
            document.querySelectorAll('a, button, div, li').forEach(el => {
                const text = el.textContent?.trim() || '';
                if (markerWords.test(text) && el.children.length <= 6) {
                    let p = el;
                    for (let i = 0; i < 4 && p; i++) {
                        if (p.tagName === 'LI' || p.classList.length > 0 || p.tagName === 'TR') {
                            containers.add(p);
                            break;
                        }
                        p = p.parentElement;
                    }
                }
            });
            courseElements = Array.from(containers);
            if (courseElements.length > 0) addLog(`通过关键字找到 ${courseElements.length} 个课程容器`, 'info');
        }

        // 策略4：兜底，找所有带链接的列表项
        if (courseElements.length === 0) {
            courseElements = Array.from(document.querySelectorAll('li a, .list a, [class*="item"] a'))
                .map(a => a.closest('li, .item, [class*="item"], div[class]') || a)
                .filter((v, i, a) => a.indexOf(v) === i);
        }

        courseElements.forEach((el, idx) => {
            const text = (el.textContent || '').trim();
            if (text.length < 3) return;

            const isRequired = /必修|必学|必须|未学习|未观看|待学习/.test(text);
            const isOptional = /选修|选学/.test(text);

            if (CONFIG.requiredOnly && !isRequired) return;

            let title = '';
            const titleEl = el.querySelector('h1,h2,h3,h4,h5,.title,.name,.course-name,.course-title,[class*="title"],[class*="name"]');
            title = titleEl?.textContent?.trim() || text.replace(/\s+/g, ' ').substring(0, 60);
            title = title.replace(/必修|选修|去学习|继续学习|播放/g, '').trim();

            let clickEl = el.querySelector('a, button, [class*="btn"], [onclick], [role="button"]') || el;

            raw.push({
                index: idx, title: title || `课程 #${idx + 1}`,
                element: el, clickElement: clickEl,
                isRequired: isRequired, text: text,
            });
        });

        // 去重 + 过滤空标题
        const seen = new Set();
        const unique = raw.filter(c => {
            if (!c.title || seen.has(c.title)) return false;
            seen.add(c.title);
            return true;
        });

        STATE.courseList = unique;
        STATE.totalCourses = unique.length;
        if (STATE.currentCourseIndex >= STATE.totalCourses) STATE.currentCourseIndex = 0;

        addLog(`扫描完成：共 ${unique.length} 个可播放项`, unique.length > 0 ? 'success' : 'warn');
        updateUI();
        STATE.currentStep = 'idle';
        return unique;
    }

    // ==================== 视频检测（多层策略） ====================
    function detectVideo() {
        // 1. 原生 video 标签（含 Shadow DOM / 同域 iframe）
        const videos = queryDeep('video');
        const playingVideo = videos.find(v => v.duration && v.duration > 0);
        if (playingVideo) return { type: 'video', element: playingVideo };

        // 2. audio 标签（某些课程是音频）
        const audios = queryDeep('audio');
        const playingAudio = audios.find(a => a.duration && a.duration > 0);
        if (playingAudio) return { type: 'video', element: playingAudio };

        // 3. 跨域 iframe 中的常见播放器（无法直接操作 video，返回 iframe 让后续模拟点击）
        const playerFrames = findElements([
            'iframe[src*="video"]', 'iframe[src*="player"]', 'iframe[src*="vod"]',
            'iframe[src*="qq.com"]', 'iframe[src*="youku.com"]', 'iframe[src*="bilibili.com"]',
            'iframe[src*="aliyuncs.com"]', 'iframe[src*="polyv.net"]', 'iframe[src*="21tb.com"]',
            '.video-js', '.plyr', '.tcplayer', '.dplayer', '.ckplayer',
            '[class*="video-player"]', '[class*="videoplayer"]',
        ]);
        const visibleFrame = playerFrames.find(isVisible);
        if (visibleFrame) return { type: 'iframe', element: visibleFrame };

        return null;
    }

    // ==================== 视频操作 ====================
    function setPlaybackSpeed(media, speed) {
        if (!media) return;
        try {
            if (speed === 0) {
                // 自动最高：先尝试 4x，失败再降
                for (const rate of [4, 3, 2, 1.5]) {
                    media.playbackRate = rate;
                    if (Math.abs(media.playbackRate - rate) < 0.1) {
                        addLog(`设置倍速: ${rate}x`, 'info');
                        return;
                    }
                }
            } else {
                media.playbackRate = speed;
                addLog(`设置倍速: ${speed}x`, 'info');
            }
        } catch (e) {
            addLog(`倍速设置失败: ${e.message}`, 'warn');
        }
    }

    function muteMedia(media) {
        if (!media) return;
        try { media.muted = true; media.volume = 0; } catch (e) { }
    }

    async function playMedia(media) {
        if (!media) return false;
        try {
            if (media.paused) {
                const p = media.play();
                if (p !== undefined) {
                    await p.catch(async (e) => {
                        addLog(`自动播放被拦截，尝试静音后播放`, 'warn');
                        media.muted = true;
                        await media.play().catch(() => { });
                    });
                }
            }
            return !media.paused;
        } catch (e) {
            return false;
        }
    }

    function isMediaFinished(media) {
        if (!media) return false;
        return media.ended || (media.duration && media.currentTime >= media.duration - 0.5);
    }

    function isMediaPlaying(media) {
        if (!media) return false;
        return !media.paused && !media.ended && media.readyState > 2 && media.duration > 0;
    }

    // ==================== 通用播放按钮识别 ====================
    function findPlayButton() {
        const texts = ['播放', '开始学习', '继续学习', '继续观看', '去学习', '点击学习', '立即学习', '播放视频', '重新播放', 'Start', 'Play'];
        const buttons = Array.from(document.querySelectorAll('button, a, div, span, [role="button"]'));
        for (const btn of buttons) {
            if (!isVisible(btn)) continue;
            const t = (btn.textContent || '').trim();
            if (texts.some(txt => t.includes(txt) && t.length < 30)) return btn;
        }
        return null;
    }

    function findPlayerControlButton(action) {
        // action: 'play' | 'pause' | 'next'
        const selectorsMap = {
            play: [
                '.vjs-big-play-button', '.vjs-play-control', '.vjs-control-bar .vjs-play-control',
                '.plyr__control--overlaid', '.plyr__play-large', '[data-plyr="play"]',
                '.dplayer-play-icon', '.dplayer-controller .dplayer-play',
                '.tcplayer .vjs-big-play-button', '.ckplayer .ckplayer-play',
                '.video-js .vjs-big-play-button', '.prism-play-btn',
                '.play-btn', '.start-btn', '.btn-play', '[class*="big-play-button"]',
            ],
            next: [
                '.vjs-next-button', '.dplayer-next', '.plyr__next', '[data-plyr="next"]',
                '.next-btn', '.btn-next', '[class*="next"][class*="button"]',
            ],
        };
        const selectors = selectorsMap[action] || [];
        for (const sel of selectors) {
            const el = findElement(sel);
            if (el && isVisible(el)) return el;
        }
        return null;
    }

    function clickPlayButton() {
        const btn = findPlayerControlButton('play') || findPlayButton();
        if (btn) {
            safeClick(btn);
            addLog('已模拟点击播放按钮', 'info');
            return true;
        }
        return false;
    }

    // ==================== 弹窗/提示处理 ====================
    function handlePopup() {
        const confirmTexts = ['确定', '知道了', '继续', '关闭', '确认', '是', '好的', '朕知道了', 'OK', 'Yes', 'Continue', '关闭弹窗', '我知道了'];
        const buttons = Array.from(document.querySelectorAll('button, a, div, span, [role="button"]'));
        for (const btn of buttons) {
            if (!isVisible(btn)) continue;
            const t = (btn.textContent || '').trim();
            if (confirmTexts.some(txt => t === txt || t.startsWith(txt))) {
                safeClick(btn);
                addLog('自动关闭弹窗', 'info');
                return true;
            }
        }
        return false;
    }

    // ==================== 导航辅助 ====================
    async function goBackToList() {
        addLog('尝试返回列表/上一页...', 'info');

        // 1. 点返回按钮
        const backBtn = findElement([
            '.back-btn', '.go-back', '.return-btn', '.el-icon-back',
            '.back', '.prev-step', '.breadcrumb a:first-child',
            '[class*="back"]', '[class*="return"]',
        ]);
        if (backBtn && safeClick(backBtn)) {
            await sleep(2500);
            return true;
        }

        // 2. 浏览器后退
        if (history.length > 1) {
            history.back();
            await sleep(2500);
            return true;
        }

        return false;
    }

    function isProbablyListPage() {
        // 如果页面上没有视频/播放器，但有课程列表，就认为是列表页
        return STATE.courseList.length > 0 && !detectVideo();
    }

    // ==================== 主循环（单线程 async） ====================
    let mainLoopPromise = null;
    let humanSimInterval = null;
    let lastMediaTime = 0;
    let stallCount = 0;
    let videoCheckCount = 0;

    async function mainLoop() {
        while (STATE.running && !STATE.paused) {
            try {
                // 全部完成
                if (STATE.currentCourseIndex >= STATE.courseList.length) {
                    STATE.currentStep = 'done';
                    addLog('🎉 全部完成！', 'success');
                    updateUI();
                    saveState();
                    stopAutomation();
                    break;
                }

                const course = STATE.courseList[STATE.currentCourseIndex];
                const mediaInfo = detectVideo();

                if (mediaInfo && mediaInfo.type === 'video') {
                    STATE.currentStep = 'playing';
                    const media = mediaInfo.element;

                    setPlaybackSpeed(media, CONFIG.speed);
                    if (CONFIG.muted) muteMedia(media);

                    if (!isMediaPlaying(media)) await playMedia(media);

                    // 视频结束
                    if (isMediaFinished(media)) {
                        addLog(`完成：${course.title}`, 'success');
                        STATE.completedCourses.push(STATE.currentCourseIndex);
                        STATE.currentCourseIndex++;
                        videoCheckCount = 0; stallCount = 0;
                        saveState();
                        updateUI();

                        await sleep(CONFIG.nextDelay * 1000);
                        await goBackToList();
                        await sleep(2000);

                        // 重新扫描，因为页面可能已刷新
                        scanCourses();
                        STATE.currentCourseIndex = Math.min(STATE.completedCourses.length, STATE.courseList.length - 1);

                        // 尝试进入下一课
                        if (STATE.currentCourseIndex < STATE.courseList.length) {
                            await sleep(1500);
                            clickCourse(STATE.currentCourseIndex);
                        }
                        continue;
                    }

                    // 卡死检测
                    if (isMediaPlaying(media)) {
                        if (Math.abs(media.currentTime - lastMediaTime) < 0.1) {
                            stallCount++;
                            if (stallCount > 8) {
                                addLog('进度卡住，尝试跳过 3 秒', 'warn');
                                try { media.currentTime = Math.min(media.currentTime + 3, media.duration - 0.5); } catch (e) { }
                                stallCount = 0;
                            }
                        } else {
                            stallCount = 0;
                        }
                        lastMediaTime = media.currentTime;
                    }

                    videoCheckCount = 0;
                } else if (mediaInfo && mediaInfo.type === 'iframe') {
                    // 跨域播放器：只能模拟点击
                    STATE.currentStep = 'playing';
                    addLog('检测到跨域/嵌入播放器，尝试点击播放', 'info');
                    clickPlayButton();
                    videoCheckCount++;
                    if (videoCheckCount > 20) {
                        addLog('嵌入播放器长时间无进展，跳过本项', 'warn');
                        STATE.completedCourses.push(STATE.currentCourseIndex);
                        STATE.currentCourseIndex++;
                        videoCheckCount = 0;
                        saveState();
                        updateUI();
                    }
                } else {
                    // 无视频：可能在列表页或加载中
                    videoCheckCount++;
                    if (videoCheckCount > 12) {
                        handlePopup();
                        if (clickPlayButton()) {
                            videoCheckCount = 0;
                        } else if (STATE.courseList.length > 0 && isProbablyListPage()) {
                            addLog('在列表页，尝试进入下一项', 'info');
                            scanCourses();
                            STATE.currentCourseIndex = Math.min(STATE.completedCourses.length, STATE.courseList.length - 1);
                            clickCourse(STATE.currentCourseIndex);
                            videoCheckCount = 0;
                        }
                    }
                }

                updateUI();
                saveState();
                await sleep(CONFIG.pollInterval);
            } catch (e) {
                addLog(`主循环异常: ${e.message}`, 'error');
                await sleep(CONFIG.pollInterval);
            }
        }
    }

    // ==================== 课程操作 ====================
    function clickCourse(index) {
        if (index >= STATE.courseList.length) return false;
        const course = STATE.courseList[index];
        if (!course) return false;
        addLog(`进入：${course.title}`, 'info');
        if (safeClick(course.clickElement)) return true;
        // 兜底：直接 href 跳转
        const link = course.element.querySelector('a[href]');
        if (link && link.href && link.href.startsWith('http')) {
            location.href = link.href;
            return true;
        }
        addLog(`无法进入课程`, 'error');
        return false;
    }

    // ==================== 控制函数 ====================
    async function startAutomation() {
        if (STATE.courseList.length === 0) scanCourses();
        if (STATE.courseList.length === 0) {
            addLog('未扫描到可播放项，请进入课程列表/视频页后再试', 'error');
            return;
        }

        STATE.running = true;
        STATE.paused = false;
        STATE.currentStep = 'playing';
        videoCheckCount = 0; stallCount = 0;

        document.getElementById('btn-start').style.display = 'none';
        document.getElementById('btn-pause').style.display = 'block';
        document.getElementById('btn-pause').textContent = '⏸ 暂停';

        addLog('自动播放已启动', 'success');

        // 如果当前已经在视频页，直接处理；否则点击第一课
        if (!detectVideo() && STATE.completedCourses.length === 0) {
            clickCourse(STATE.currentCourseIndex);
        }

        if (!mainLoopPromise) {
            mainLoopPromise = mainLoop().finally(() => { mainLoopPromise = null; });
        }

        // 启动模拟真人行为
        if (!humanSimInterval) {
            humanSimInterval = setInterval(() => {
                if (STATE.running && !STATE.paused) {
                    document.dispatchEvent(new MouseEvent('mousemove', {
                        bubbles: true, clientX: Math.random() * window.innerWidth, clientY: Math.random() * window.innerHeight,
                    }));
                }
            }, 12000 + Math.random() * 12000);
        }

        updateUI();
    }

    function pauseAutomation() {
        STATE.paused = !STATE.paused;
        const btn = document.getElementById('btn-pause');
        if (STATE.paused) {
            STATE.currentStep = 'paused';
            btn.textContent = '▶ 继续';
            addLog('已暂停', 'warn');
        } else {
            STATE.currentStep = 'playing';
            btn.textContent = '⏸ 暂停';
            addLog('已继续', 'info');
            if (!mainLoopPromise) {
                mainLoopPromise = mainLoop().finally(() => { mainLoopPromise = null; });
            }
        }
        updateUI();
    }

    function stopAutomation() {
        STATE.running = false;
        STATE.paused = false;
        STATE.currentStep = 'idle';
        stopMainLoop();
        clearSavedState();

        document.getElementById('btn-start').style.display = 'block';
        document.getElementById('btn-pause').style.display = 'none';

        addLog('已停止并清空进度', 'warn');
        updateUI();
    }

    function stopMainLoop() {
        if (humanSimInterval) { clearInterval(humanSimInterval); humanSimInterval = null; }
        // mainLoopPromise 会在 running=false 后自然退出
    }

    function skipCourse() {
        addLog(`跳过：${STATE.courseList[STATE.currentCourseIndex]?.title || '未知'}`, 'warn');
        STATE.completedCourses.push(STATE.currentCourseIndex);
        STATE.currentCourseIndex++;
        videoCheckCount = 0; stallCount = 0;
        saveState();
        updateUI();
        if (STATE.currentCourseIndex >= STATE.courseList.length) {
            stopAutomation();
        } else if (STATE.running && !STATE.paused) {
            goBackToList().then(() => {
                scanCourses();
                STATE.currentCourseIndex = Math.min(STATE.completedCourses.length, STATE.courseList.length - 1);
                clickCourse(STATE.currentCourseIndex);
            });
        }
    }

    // ==================== 初始化 ====================
    function init() {
        createPanel();

        document.getElementById('btn-scan').addEventListener('click', () => scanCourses());
        document.getElementById('btn-start').addEventListener('click', () => startAutomation());
        document.getElementById('btn-pause').addEventListener('click', () => pauseAutomation());
        document.getElementById('btn-stop').addEventListener('click', () => stopAutomation());
        document.getElementById('btn-skip').addEventListener('click', () => {
            if (confirm('确定跳过当前项吗？')) skipCourse();
        });

        document.getElementById('setting-speed').addEventListener('change', (e) => {
            CONFIG.speed = parseFloat(e.target.value);
            addLog(`倍速设为: ${CONFIG.speed === 0 ? '自动' : CONFIG.speed + 'x'}`, 'info');
        });

        const mutedToggle = document.getElementById('setting-muted');
        mutedToggle.addEventListener('click', () => {
            CONFIG.muted = !CONFIG.muted;
            mutedToggle.textContent = CONFIG.muted ? '开' : '关';
            mutedToggle.className = 'toggle-btn ' + (CONFIG.muted ? 'on' : 'off');
        });

        const requiredToggle = document.getElementById('setting-required');
        requiredToggle.addEventListener('click', () => {
            CONFIG.requiredOnly = !CONFIG.requiredOnly;
            requiredToggle.textContent = CONFIG.requiredOnly ? '开' : '关';
            requiredToggle.className = 'toggle-btn ' + (CONFIG.requiredOnly ? 'on' : 'off');
            if (STATE.courseList.length > 0) scanCourses();
        });

        document.getElementById('setting-delay').addEventListener('change', (e) => {
            CONFIG.nextDelay = parseInt(e.target.value) || 5;
        });

        // 折叠
        let collapsed = false;
        document.getElementById('panel-minimize').addEventListener('click', () => {
            collapsed = !collapsed;
            const panel = document.getElementById('auto-player-panel');
            panel.classList.toggle('collapsed', collapsed);
            document.getElementById('panel-minimize').textContent = collapsed ? '+' : '−';
        });

        // 快捷键
        document.addEventListener('keydown', (e) => {
            if (!e.ctrlKey || !e.shiftKey) return;
            if (e.key === 'S' || e.key === 's') {
                e.preventDefault();
                if (STATE.running) pauseAutomation(); else startAutomation();
            } else if (e.key === 'Q' || e.key === 'q') {
                e.preventDefault();
                stopAutomation();
            }
        });

        // 油猴菜单
        try {
            GM_registerMenuCommand('▶ 开始/暂停', () => STATE.running ? pauseAutomation() : startAutomation());
            GM_registerMenuCommand('⏹ 停止', stopAutomation);
            GM_registerMenuCommand('🔍 扫描', scanCourses);
        } catch (e) { }

        // SPA 路由切换监听
        let lastUrl = location.href;
        new MutationObserver(debounce(() => {
            const url = location.href;
            if (url !== lastUrl) {
                lastUrl = url;
                addLog(`页面切换: ${url}`, 'info');
                videoCheckCount = 0;
                if (STATE.running) {
                    // 如果路由变了且没视频，可能回到列表了，需要重新扫描
                    setTimeout(() => {
                        if (!detectVideo()) scanCourses();
                    }, 1500);
                }
            }
        }, 300)).observe(document, { subtree: true, childList: true });

        // 尝试恢复进度
        const saved = loadState();
        if (saved && saved.courseTitles && saved.courseTitles.length > 0) {
            addLog(`检测到未完成的进度（${saved.completedCourses.length}/${saved.totalCourses}），可点击"开始"继续`, 'info');
            STATE.currentCourseIndex = saved.currentCourseIndex || 0;
            STATE.completedCourses = saved.completedCourses || [];
            STATE.totalCourses = saved.totalCourses || 0;
        }

        addLog('通用自动播放器已就绪', 'success');
        updateUI();
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();
