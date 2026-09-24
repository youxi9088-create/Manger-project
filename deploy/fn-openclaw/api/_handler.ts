import fs from 'node:fs';
import path from 'node:path';
import { gzipSync, gunzipSync } from 'node:zlib';
import { fileURLToPath } from 'node:url';
import type { Express } from 'express';
import type { AddressInfo } from 'node:net';
import { mongodb } from '@fn/mongodb';

const deployRoot = path.resolve(fileURLToPath(new URL('..', import.meta.url)));
const serverCwd = path.join(deployRoot, 'packages', 'server');

let originPromise: Promise<string> | null = null;

type WaitUntil = (promise: Promise<unknown>) => void;
type GlobalWithFnContext = typeof globalThis & {
  __OPENCLAW_WAIT_UNTIL__?: WaitUntil;
  [key: symbol]: unknown;
};

function loadInternalStoreConfig() {
  const configPath = path.join(deployRoot, 'api', '_internal-store.json');
  try {
    const config = JSON.parse(fs.readFileSync(configPath, 'utf8')) as { secret?: string; origin?: string };
    if (config.secret) process.env.OPENCLAW_INTERNAL_STORE_SECRET = config.secret;
    if (config.origin) process.env.OPENCLAW_INTERNAL_STORE_ORIGIN = config.origin;
  } catch {
    // Local development can continue without the FN-only persistence callback.
  }
}

function prepareWritableDatabase(): { databasePath: string; dataDir: string } {
  const sourceDatabase = path.join(deployRoot, 'api', '_data', 'chat.db');
  const dataDir = path.join('/tmp', 'openclaw-data', path.basename(deployRoot));
  const databasePath = path.join(dataDir, 'chat.db');

  fs.mkdirSync(dataDir, { recursive: true });
  if (!fs.existsSync(databasePath)) {
    for (const suffix of ['', '-wal', '-shm']) {
      const source = `${sourceDatabase}${suffix}`;
      if (fs.existsSync(source)) fs.copyFileSync(source, `${databasePath}${suffix}`);
    }
  }

  // The packaged SQLite files are read-only. copyFileSync can preserve that
  // mode, so make every runtime copy writable before opening WAL mode.
  for (const suffix of ['', '-wal', '-shm']) {
    const target = `${databasePath}${suffix}`;
    if (fs.existsSync(target)) fs.chmodSync(target, 0o600);
  }

  return { databasePath, dataDir };
}

function prepareWritableMeetingData(dataDir: string) {
  const sourceDir = path.join(deployRoot, 'api', '_data', 'meetings');
  const targetDir = path.join(dataDir, 'meetings');
  fs.mkdirSync(targetDir, { recursive: true });
  if (!fs.existsSync(sourceDir)) return targetDir;

  for (const entry of fs.readdirSync(sourceDir, { withFileTypes: true })) {
    if (!entry.isFile() || !entry.name.endsWith('.json')) continue;
    const source = path.join(sourceDir, entry.name);
    const target = path.join(targetDir, entry.name);
    if (!fs.existsSync(target)) fs.copyFileSync(source, target);
  }
  return targetDir;
}

async function getLocalOrigin() {
  if (!originPromise) {
    originPromise = (async () => {
      const runtimeData = prepareWritableDatabase();
      // The production environment may contain a source DB_PATH. Always use
      // the per-runtime copy so SQLite WAL and migrations never write into
      // the read-only deployment bundle.
      process.env.DB_PATH = runtimeData.databasePath;
      // Deployment bundles are read-only in FN. Meeting downloads and generated
      // minutes must use the per-runtime writable directory.
      process.env.MEETING_DATA_DIR = prepareWritableMeetingData(runtimeData.dataDir);
      process.env.OPENCLAW_DATA_DIR ||= runtimeData.dataDir;
      process.chdir(serverCwd);

      const mod = await import('../packages/server/src/index.js') as { app: Express };

      return await new Promise<string>((resolve, reject) => {
        const server = mod.app.listen(0, '127.0.0.1', () => {
          const address = server.address() as AddressInfo;
          resolve(`http://127.0.0.1:${address.port}`);
        });
        server.once('error', reject);
      });
    })();
  }

  return originPromise;
}

function isInternalStoreRequest(request: Request) {
  const expectedSecret = process.env.OPENCLAW_INTERNAL_STORE_SECRET;
  return Boolean(expectedSecret) && request.headers.get('x-openclaw-internal-store') === expectedSecret;
}

function toMongoMeetingResult(result: Record<string, unknown>) {
  const stored = { ...result } as Record<string, unknown>;
  if (typeof stored.transcript === 'string') {
    stored.transcriptGzip = gzipSync(Buffer.from(stored.transcript, 'utf8')).toString('base64');
    delete stored.transcript;
  }
  if (Array.isArray(stored.versions)) {
    // Version metadata is useful for audit history, but repeating full
    // transcripts makes a Mongo bridge request exceed FN's payload limit.
    stored.versions = stored.versions.map((version) => {
      const copy = { ...(version as Record<string, unknown>) };
      delete copy.transcript;
      return copy;
    });
  }
  return stored;
}

function fromMongoMeetingResult(result: Record<string, unknown> | null) {
  if (!result) return null;
  const restored = { ...result } as Record<string, unknown>;
  if (typeof restored.transcriptGzip === 'string') {
    restored.transcript = gunzipSync(Buffer.from(restored.transcriptGzip, 'base64')).toString('utf8');
    delete restored.transcriptGzip;
  }
  return restored;
}

function readU9ConversationMigration() {
  try {
    const migrationPath = path.join(deployRoot, 'api', '_data', 'u9-conversations-migration.json');
    const payload = JSON.parse(fs.readFileSync(migrationPath, 'utf8')) as { conversations?: Array<{ id?: unknown; name?: unknown }> };
    return Array.isArray(payload.conversations) ? payload.conversations : [];
  } catch {
    return [];
  }
}

async function handleMeetingResultStore(request: Request, url: URL) {
  if (!isInternalStoreRequest(request)) return new Response('Not Found', { status: 404 });
  const collection = mongodb.collection<Record<string, unknown>>('meeting_results');

  if (request.method === 'GET') {
    const key = url.searchParams.get('key');
    if (key) return Response.json({ result: fromMongoMeetingResult(await collection.findOne({ key })) });
    const rawLimit = Number(url.searchParams.get('limit') || '200');
    const limit = Math.min(Math.max(Number.isFinite(rawLimit) ? rawLimit : 200, 1), 1000);
    const results = await collection.find({}).sort({ updatedAt: -1 }).limit(limit).toArray();
    return Response.json({ results: results.map((result) => fromMongoMeetingResult(result)) });
  }

  if (request.method === 'POST') {
    const body = await request.json().catch(() => ({})) as { result?: Record<string, unknown> };
    const result = body.result;
    if (!result || typeof result.key !== 'string' || !result.key) {
      return Response.json({ error: '会议结果格式无效' }, { status: 400 });
    }
    await collection.updateOne({ key: result.key }, { $set: toMongoMeetingResult(result) }, { upsert: true });
    return Response.json({ success: true });
  }

  return new Response('Method Not Allowed', { status: 405 });
}

async function handleMeetingIntelligenceStore(request: Request, url: URL) {
  if (!isInternalStoreRequest(request)) return new Response('Not Found', { status: 404 });
  const collection = mongodb.collection<Record<string, unknown>>('meeting_intelligence');
  const meetingId = String(url.searchParams.get('meetingId') || '').trim();

  if (request.method === 'GET') {
    if (!meetingId) return Response.json({ error: 'meetingId is required' }, { status: 400 });
    return Response.json({ intelligence: await collection.findOne({ meetingId }) });
  }

  if (request.method === 'POST') {
    const body = await request.json().catch(() => ({})) as { intelligence?: Record<string, unknown> };
    const intelligence = body.intelligence;
    const storedMeetingId = String(intelligence?.meetingId || '').trim();
    if (!intelligence || !storedMeetingId || !intelligence.result || typeof intelligence.result !== 'object') {
      return Response.json({ error: '会议深度分析格式无效' }, { status: 400 });
    }
    await collection.updateOne({ meetingId: storedMeetingId }, { $set: intelligence }, { upsert: true });
    return Response.json({ success: true });
  }

  if (request.method === 'DELETE') {
    if (!meetingId) return Response.json({ error: 'meetingId is required' }, { status: 400 });
    await collection.deleteOne({ meetingId });
    return Response.json({ success: true });
  }

  return new Response('Method Not Allowed', { status: 405 });
}

async function handleMeetingIntelligenceJobStore(request: Request, url: URL) {
  if (!isInternalStoreRequest(request)) return new Response('Not Found', { status: 404 });
  const collection = mongodb.collection<Record<string, unknown>>('meeting_intelligence_jobs');

  if (request.method === 'GET') {
    const jobId = String(url.searchParams.get('jobId') || '').trim();
    if (!jobId) return Response.json({ error: 'jobId is required' }, { status: 400 });
    return Response.json({ job: await collection.findOne({ jobId }) });
  }

  if (request.method === 'POST') {
    const body = await request.json().catch(() => ({})) as { job?: Record<string, unknown> };
    const job = body.job;
    const jobId = String(job?.jobId || '').trim();
    const meetingId = String(job?.meetingId || '').trim();
    if (!job || !jobId || !meetingId) {
      return Response.json({ error: '会议分析任务格式无效' }, { status: 400 });
    }
    await collection.updateOne({ jobId }, { $set: job }, { upsert: true });
    return Response.json({ success: true });
  }

  return new Response('Method Not Allowed', { status: 405 });
}

// Process job results embed the full transcript, so apply the same gzip
// treatment as meeting results to stay under FN's payload limit.
function toMongoMeetingProcessJob(job: Record<string, unknown>) {
  const stored = { ...job } as Record<string, unknown>;
  const result = stored.result as Record<string, unknown> | undefined;
  if (result && typeof result.transcript === 'string') {
    stored.result = {
      ...result,
      transcriptGzip: gzipSync(Buffer.from(result.transcript, 'utf8')).toString('base64'),
    };
    delete (stored.result as Record<string, unknown>).transcript;
  }
  return stored;
}

function fromMongoMeetingProcessJob(job: Record<string, unknown> | null) {
  if (!job) return null;
  const restored = { ...job } as Record<string, unknown>;
  const result = restored.result as Record<string, unknown> | undefined;
  if (result && typeof result.transcriptGzip === 'string') {
    restored.result = {
      ...result,
      transcript: gunzipSync(Buffer.from(result.transcriptGzip, 'base64')).toString('utf8'),
    };
    delete (restored.result as Record<string, unknown>).transcriptGzip;
  }
  return restored;
}

async function handleMeetingProcessJobStore(request: Request, url: URL) {
  if (!isInternalStoreRequest(request)) return new Response('Not Found', { status: 404 });
  const collection = mongodb.collection<Record<string, unknown>>('meeting_process_jobs');

  if (request.method === 'GET') {
    const jobId = String(url.searchParams.get('jobId') || '').trim();
    if (!jobId) return Response.json({ error: 'jobId is required' }, { status: 400 });
    return Response.json({ job: fromMongoMeetingProcessJob(await collection.findOne({ jobId })) });
  }

  if (request.method === 'POST') {
    const body = await request.json().catch(() => ({})) as { job?: Record<string, unknown> };
    const job = body.job;
    const jobId = String(job?.jobId || '').trim();
    const meetingId = String(job?.meetingId || '').trim();
    if (!job || !jobId || !meetingId) {
      return Response.json({ error: '会议转录任务格式无效' }, { status: 400 });
    }
    await collection.updateOne({ jobId }, { $set: toMongoMeetingProcessJob(job) }, { upsert: true });
    return Response.json({ success: true });
  }

  return new Response('Method Not Allowed', { status: 405 });
}

async function handleWorkflowJobStore(request: Request, url: URL) {
  if (!isInternalStoreRequest(request)) return new Response('Not Found', { status: 404 });
  const collection = mongodb.collection<Record<string, unknown>>('workflow_jobs');

  if (request.method === 'GET') {
    const jobId = String(url.searchParams.get('jobId') || '').trim();
    if (!jobId) return Response.json({ error: 'jobId is required' }, { status: 400 });
    return Response.json({ job: await collection.findOne({ jobId }) });
  }

  if (request.method === 'POST') {
    const body = await request.json().catch(() => ({})) as { job?: Record<string, unknown> };
    const job = body.job;
    const jobId = String(job?.jobId || '').trim();
    const proid = String(job?.proid || '').trim();
    if (!job || !jobId || !proid) return Response.json({ error: '工作流任务格式无效' }, { status: 400 });
    await collection.updateOne({ jobId }, { $set: job }, { upsert: true });
    return Response.json({ success: true });
  }

  return new Response('Method Not Allowed', { status: 405 });
}

async function handleU9ConversationStore(request: Request) {
  if (!isInternalStoreRequest(request)) return new Response('Not Found', { status: 404 });
  const collection = mongodb.collection<Record<string, unknown>>('u9_conversations');

  if (request.method === 'GET') {
    const migration = readU9ConversationMigration()
      .map((conversation) => ({ id: String(conversation.id || '').trim(), name: String(conversation.name || '').trim() }))
      .filter((conversation) => conversation.id);
    if (migration.length > 0) {
      await Promise.all(migration.map((conversation) => collection.updateOne(
        { id: conversation.id },
        { $setOnInsert: { ...conversation, updatedAt: new Date().toISOString() } },
        { upsert: true },
      )));
    }
    const conversations = await collection.find({}).sort({ updatedAt: -1 }).limit(5000).toArray();
    return Response.json({ conversations });
  }

  if (request.method === 'PUT') {
    const body = await request.json().catch(() => ({})) as { conversations?: Array<{ id?: unknown; name?: unknown }> };
    const conversations = Array.isArray(body.conversations) ? body.conversations : [];
    const now = new Date().toISOString();
    const normalized = conversations
      .map((conversation) => ({ id: String(conversation.id || '').trim(), name: String(conversation.name || '').trim() }))
      .filter((conversation) => conversation.id);
    // @fn/mongodb exposes updateOne but not the driver's bulkWrite helper.
    await Promise.all(normalized.map((conversation) => collection.updateOne(
      { id: conversation.id },
      { $set: { ...conversation, updatedAt: now } },
      { upsert: true },
    )));
    return Response.json({ success: true, stored: normalized.length });
  }

  return new Response('Method Not Allowed', { status: 405 });
}

export async function fetch(request: Request) {
  loadInternalStoreConfig();
  const incomingUrl = new URL(request.url);
  if (incomingUrl.pathname === '/api/internal/meeting-results') {
    return handleMeetingResultStore(request, incomingUrl);
  }
  if (incomingUrl.pathname === '/api/internal/meeting-intelligence') {
    return handleMeetingIntelligenceStore(request, incomingUrl);
  }
  if (incomingUrl.pathname === '/api/internal/meeting-intelligence-jobs') {
    return handleMeetingIntelligenceJobStore(request, incomingUrl);
  }
  if (incomingUrl.pathname === '/api/internal/meeting-process-jobs') {
    return handleMeetingProcessJobStore(request, incomingUrl);
  }
  if (incomingUrl.pathname === '/api/internal/workflow-jobs') {
    return handleWorkflowJobStore(request, incomingUrl);
  }
  if (incomingUrl.pathname === '/api/internal/u9-conversations') {
    return handleU9ConversationStore(request);
  }

  const apiIndex = incomingUrl.pathname.indexOf('/api/');
  const appBasePath = apiIndex >= 0 ? incomingUrl.pathname.slice(0, apiIndex) : '';
  process.env.OPENCLAW_INTERNAL_STORE_ORIGIN ||= `${incomingUrl.origin}${appBasePath}`;
  const origin = await getLocalOrigin();
  const target = new URL(incomingUrl.pathname + incomingUrl.search, origin);
  const method = request.method.toUpperCase();
  const body = method === 'GET' || method === 'HEAD'
    ? undefined
    : await request.arrayBuffer();

  // The Express server runs behind this function proxy and therefore loses
  // FN's async request context. Capture its waitUntil callback so a route can
  // still register a real background transcription job.
  const root = globalThis as GlobalWithFnContext;
  const contextStore = root[Symbol.for('@fn/request-context')] as { get?: () => { waitUntil?: WaitUntil } | undefined } | undefined;
  const requestContext = contextStore?.get?.();
  const previousWaitUntil = root.__OPENCLAW_WAIT_UNTIL__;
  root.__OPENCLAW_WAIT_UNTIL__ = requestContext?.waitUntil?.bind(requestContext);
  try {
    return await globalThis.fetch(target, {
      method,
      headers: request.headers,
      body,
    });
  } finally {
    root.__OPENCLAW_WAIT_UNTIL__ = previousWaitUntil;
  }
}

export const GET = fetch;
export const POST = fetch;
export const PUT = fetch;
export const PATCH = fetch;
export const DELETE = fetch;
export const OPTIONS = fetch;

export default fetch;
