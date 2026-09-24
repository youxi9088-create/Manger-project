import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

const deployRoot = path.resolve(fileURLToPath(new URL('..', import.meta.url)));
const repoRoot = path.resolve(deployRoot, '..', '..');

function rmInsideDeploy(relativePath) {
  const target = path.join(deployRoot, relativePath);
  const resolved = path.resolve(target);
  if (!resolved.startsWith(deployRoot + path.sep)) {
    throw new Error(`Refusing to remove outside deploy root: ${resolved}`);
  }
  fs.rmSync(resolved, { recursive: true, force: true });
}

function copy(from, to) {
  fs.cpSync(path.join(repoRoot, from), path.join(deployRoot, to), {
    recursive: true,
    force: true,
  });
}

function copyIfExists(from, to) {
  const source = path.join(repoRoot, from);
  if (fs.existsSync(source)) copy(from, to);
}

function ensureDir(relativePath) {
  fs.mkdirSync(path.join(deployRoot, relativePath), { recursive: true });
}

function writeNextHtmlRoute(sourcePath, routePath) {
  const targetDir = path.join(deployRoot, 'dist', routePath);
  ensureDir(path.join('dist', routePath));
  fs.copyFileSync(sourcePath, path.join(targetDir, 'index.html'));

  if (routePath) {
    fs.copyFileSync(sourcePath, path.join(deployRoot, 'dist', `${routePath}.html`));
  } else {
    fs.copyFileSync(sourcePath, path.join(deployRoot, 'dist', 'index.html'));
  }
}

for (const entry of ['dist', 'packages', 'data', 'api/_data']) {
  rmInsideDeploy(entry);
}

copy('packages/server/dist/server/src', 'packages/server/src');
copyIfExists('packages/shared/types', 'packages/shared/types');
copyIfExists('packages/im-analyzer/dist', 'dist/im-analyzer');
copy('packages/web/.next/static', 'dist/_next/static');
copyIfExists('packages/web/public', 'dist');

const nextAppDir = path.join(repoRoot, 'packages', 'web', '.next', 'server', 'app');
const htmlFiles = fs.readdirSync(nextAppDir, { recursive: true })
  .filter((file) => typeof file === 'string' && file.endsWith('.html'));
for (const htmlFile of htmlFiles) {
  if (htmlFile.startsWith('_not-found')) continue;
  const sourcePath = path.join(nextAppDir, htmlFile);
  let routePath = htmlFile.replace(/\.html$/, '').replace(/\\/g, '/');
  if (routePath === 'index') routePath = '';
  writeNextHtmlRoute(sourcePath, routePath);
}

const robotsBody = path.join(nextAppDir, 'robots.txt.body');
if (fs.existsSync(robotsBody)) {
  fs.copyFileSync(robotsBody, path.join(deployRoot, 'dist', 'robots.txt'));
}

ensureDir('data');
ensureDir('api/_data');
for (const file of ['chat.db', 'chat.db-wal', 'chat.db-shm', 'kbtest.json']) {
  copyIfExists(path.join('data', file), path.join('data', file));
  copyIfExists(path.join('data', file), path.join('api', '_data', file));
}
copyIfExists('data/feishu-docs', 'data/feishu-docs');
copyIfExists('data/workflow-inbox', 'data/workflow-inbox');
copyIfExists('data/feishu-docs', 'api/_data/feishu-docs');
copyIfExists('data/workflow-inbox', 'api/_data/workflow-inbox');

ensureDir('data/meetings');
ensureDir('api/_data/meetings');
ensureDir('packages/server/data/meetings');
const meetingsSource = path.join(repoRoot, 'data', 'meetings');
if (fs.existsSync(meetingsSource)) {
  for (const entry of fs.readdirSync(meetingsSource, { withFileTypes: true })) {
    if (entry.isFile() && entry.name.toLowerCase().endsWith('.json')) {
      fs.copyFileSync(path.join(meetingsSource, entry.name), path.join(deployRoot, 'data', 'meetings', entry.name));
      fs.copyFileSync(path.join(meetingsSource, entry.name), path.join(deployRoot, 'api', '_data', 'meetings', entry.name));
      fs.copyFileSync(path.join(meetingsSource, entry.name), path.join(deployRoot, 'packages', 'server', 'data', 'meetings', entry.name));
    }
  }
}

copyIfExists('data/auth', 'data/auth');
copyIfExists('data/auth', 'api/_data/auth');
copyIfExists('data/auth', 'packages/server/data/auth');

// The desktop meeting service stores refreshed browser authorization under the
// server package. Prefer that file when it is newer than the root snapshot.
const rootMeetingAuth = path.join(repoRoot, 'data', 'auth', 'meeting-auth.json');
const serverMeetingAuth = path.join(repoRoot, 'packages', 'server', 'data', 'auth', 'meeting-auth.json');
const newestMeetingAuth = [rootMeetingAuth, serverMeetingAuth]
  .filter((candidate) => fs.existsSync(candidate))
  .sort((left, right) => fs.statSync(right).mtimeMs - fs.statSync(left).mtimeMs)[0];
if (newestMeetingAuth) {
  for (const target of [
    path.join(deployRoot, 'data', 'auth', 'meeting-auth.json'),
    path.join(deployRoot, 'api', '_data', 'auth', 'meeting-auth.json'),
    path.join(deployRoot, 'packages', 'server', 'data', 'auth', 'meeting-auth.json'),
  ]) {
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.copyFileSync(newestMeetingAuth, target);
  }
}

const configPath = path.join(repoRoot, 'data', 'server-config.json');
const deploymentConfig = fs.existsSync(configPath)
  ? JSON.parse(fs.readFileSync(configPath, 'utf8'))
  : {};

// One-time U9 directory migration. The runtime consumes this private snapshot
// into Mongo; the source keys are removed after the migration is verified.
const legacyU9Conversations = Object.entries(deploymentConfig)
  .filter(([key, value]) => key.startsWith('U9_CONVERSATION_NAMES_') && typeof value === 'string')
  .map(([key, value]) => ({ id: key.slice('U9_CONVERSATION_NAMES_'.length), name: value }));
if (legacyU9Conversations.length > 0) {
  fs.writeFileSync(
    path.join(deployRoot, 'api', '_data', 'u9-conversations-migration.json'),
    JSON.stringify({ conversations: legacyU9Conversations }),
    'utf8',
  );
}

// The Express application accesses FN-managed MongoDB through the outer
// function handler. Keep this callback private to the deployed process.
if (!deploymentConfig.OPENCLAW_INTERNAL_STORE_SECRET) {
  deploymentConfig.OPENCLAW_INTERNAL_STORE_SECRET = crypto.randomBytes(32).toString('hex');
}
deploymentConfig.OPENCLAW_INTERNAL_STORE_ORIGIN = 'https://f.new.ndhy.com/a/openclaw';
fs.writeFileSync(
  path.join(deployRoot, 'api', '_internal-store.json'),
  JSON.stringify({
    secret: deploymentConfig.OPENCLAW_INTERNAL_STORE_SECRET,
    origin: deploymentConfig.OPENCLAW_INTERNAL_STORE_ORIGIN,
  }),
  null,
  2,
  'utf8',
);

// Keep the local ASR/LLM configuration available to the function without
// copying unrelated local environment settings into the deployment package.
const localEnvPath = path.join(repoRoot, '.env');
if (fs.existsSync(localEnvPath)) {
  for (const line of fs.readFileSync(localEnvPath, 'utf8').split(/\r?\n/)) {
    const match = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/);
    if (!match) continue;
    const key = match[1];
    if (!/^(VOLC_ASR_|ASR_|MOONSHOT_|LLM_|OPENAI_|AIHUB_)/.test(key)) continue;
    const value = match[2].replace(/^(["'])(.*)\1$/, '$2');
    if (value && !(key in deploymentConfig)) deploymentConfig[key] = value;
  }
}

{
  const lines = Object.entries(deploymentConfig)
    // U9 会话目录 belongs in Mongo data management. Do not carry its
    // historical file-backed entries into future deployment environments.
    .filter(([key, value]) => typeof value === 'string'
      && /^[A-Za-z_][A-Za-z0-9_]*$/.test(key)
      && key !== 'U9_CONVERSATIONS'
      && !key.startsWith('U9_CONVERSATION_NAMES_'))
    .map(([key, value]) => `${key}=${JSON.stringify(value)}`);
  fs.writeFileSync(path.join(deployRoot, '.env.production'), `${lines.join('\n')}\n`, 'utf8');
}

console.log('Prepared FN deploy package from real OpenClaw code and local data.');
