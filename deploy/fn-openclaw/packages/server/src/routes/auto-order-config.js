import { Router } from "express";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { dirname } from "path";
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const router = Router();
const DATA_DIR = path.resolve(__dirname, '..', '..', '..', '..', 'data');
const CONFIG_FILE = path.join(DATA_DIR, 'auto-order-config.json');
const TASKS_FILE = path.join(DATA_DIR, 'auto-order-tasks.json');
function readJson(filePath, fallback = null) {
    try {
        if (fs.existsSync(filePath)) {
            return JSON.parse(fs.readFileSync(filePath, 'utf-8'));
        }
    }
    catch { }
    return fallback;
}
function writeJson(filePath, data) {
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    fs.writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf-8');
}
// GET /api/auto-order/config
router.get('/api/auto-order/config', (req, res) => {
    const config = readJson(CONFIG_FILE);
    res.json({ success: true, config });
});
// PUT /api/auto-order/config
router.put('/api/auto-order/config', (req, res) => {
    try {
        writeJson(CONFIG_FILE, req.body);
        res.json({ success: true });
    }
    catch (e) {
        res.status(500).json({ success: false, error: e.message });
    }
});
// GET /api/auto-order/tasks
router.get('/api/auto-order/tasks', (req, res) => {
    const tasks = readJson(TASKS_FILE, []);
    res.json({ success: true, tasks });
});
// PUT /api/auto-order/tasks
router.put('/api/auto-order/tasks', (req, res) => {
    try {
        writeJson(TASKS_FILE, req.body);
        res.json({ success: true });
    }
    catch (e) {
        res.status(500).json({ success: false, error: e.message });
    }
});
export default router;
//# sourceMappingURL=auto-order-config.js.map