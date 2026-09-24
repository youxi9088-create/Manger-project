import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const deployRoot = path.resolve(fileURLToPath(new URL('..', import.meta.url)));
const repoRoot = path.resolve(deployRoot, '..', '..');
function run(args, env = process.env) {
  execFileSync('pnpm', args, {
    cwd: repoRoot,
    env,
    stdio: 'inherit',
    shell: process.platform === 'win32',
  });
}

run(['-F', '@openclaw/server', 'build']);
run(['-F', '@openclaw/im-analyzer', 'build'], {
  ...process.env,
  VITE_BASE_PATH: '/a/openclaw/im-analyzer/',
  VITE_API_BASE: '/a/openclaw',
});
run(['-F', '@openclaw/web', 'build'], {
  ...process.env,
  NEXT_PUBLIC_BASE_PATH: '/a/openclaw',
  NEXT_PUBLIC_SERVER_API: '/a/openclaw',
  NEXT_PUBLIC_IM_ANALYZER_URL: '/a/openclaw/im-analyzer/',
});
execFileSync(process.execPath, ['scripts/prepare.mjs'], { cwd: deployRoot, stdio: 'inherit' });
