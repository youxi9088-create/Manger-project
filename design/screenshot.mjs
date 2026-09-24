import { chromium } from 'playwright';
import { fileURLToPath } from 'url';
import { dirname, resolve } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const htmlPath = resolve(__dirname, 'openclaw-design-v1.html');
const outputPath = resolve(__dirname, 'openclaw-design-v1-dashboard.png');

const browser = await chromium.launch();
const page = await browser.newPage({
  viewport: { width: 1440, height: 900 },
  deviceScaleFactor: 1,
});

const fileUrl = 'file://' + htmlPath;
await page.goto(fileUrl, { waitUntil: 'networkidle' });

// Wait for Lucide icons and fonts to render
await page.waitForTimeout(1500);

// Check for console errors
const errors = [];
page.on('pageerror', err => errors.push(err.message));
page.on('console', msg => {
  if (msg.type() === 'error') errors.push(msg.text());
});

await page.screenshot({ path: outputPath, fullPage: false });

await browser.close();

if (errors.length > 0) {
  console.error('Console errors detected:');
  errors.forEach(e => console.error('  - ' + e));
  process.exit(1);
}

console.log('Screenshot saved to:', outputPath);
