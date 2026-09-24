import { chromium } from 'playwright';
import { fileURLToPath } from 'url';
import { dirname, resolve } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const htmlPath = resolve(__dirname, 'openclaw-design-v1.html');

const browser = await chromium.launch();
const page = await browser.newPage({
  viewport: { width: 1440, height: 900 },
});

const errors = [];
page.on('pageerror', err => errors.push(`pageerror: ${err.message}`));
page.on('console', msg => {
  if (msg.type() === 'error') errors.push(`console: ${msg.text()}`);
});

const fileUrl = 'file://' + htmlPath;
await page.goto(fileUrl, { waitUntil: 'networkidle' });
await page.waitForTimeout(1000);

const pages = ['dashboard', 'daily', 'projects', 'project', 'workflow', 'meeting', 'agent', 'quicksearch', 'employees', 'kanban', 'tools'];

for (const pageId of pages) {
  const nav = page.locator(`.nav-item[data-page="${pageId}"]`);
  await nav.click();
  await page.waitForTimeout(400);
  const activePage = await page.locator(`#page-${pageId}`).isVisible();
  if (!activePage) {
    errors.push(`navigation failed: ${pageId} page not visible after click`);
  }
  const activeNav = await nav.evaluate(el => el.classList.contains('active'));
  if (!activeNav) {
    errors.push(`navigation failed: ${pageId} nav item not active after click`);
  }
}

// Test project detail tabs
await page.locator('.nav-item[data-page="project"]').click();
await page.waitForTimeout(300);
const tabs = ['requirements', 'tasks', 'members', 'deliverables', 'logs'];
for (const tab of tabs) {
  await page.locator(`#page-project .tab[data-tab="${tab}"]`).click();
  await page.waitForTimeout(200);
  const visible = await page.locator(`#tab-${tab}`).isVisible();
  if (!visible) {
    errors.push(`project tab failed: ${tab} not visible`);
  }
}

await browser.close();

if (errors.length > 0) {
  console.error('Verification failed:');
  errors.forEach(e => console.error('  - ' + e));
  process.exit(1);
}

console.log('Verification passed: all 11 pages navigable, project tabs switch correctly, no console errors.');
