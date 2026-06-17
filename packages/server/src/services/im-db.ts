import crypto from 'crypto';
import path from 'path';
import { fileURLToPath } from 'url';
import Database from 'better-sqlite3';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const DEFAULT_IM_DB_BASE_PATH = 'D:/Program Files (x86)/Netdragon/imData/mulproplus/db/0.56/_@_prpl-91u-nd';

export interface ImDbConfig {
  basePath?: string;
  employeeId: string;
}

export interface ImMessage {
  msg_id: string;
  sender_id: string;
  sender_name: string;
  group_id: string | null;
  group_name: string | null;
  content: string;
  msg_type: string;
  create_time: string;
  is_mentioned: number;
}

function generateKey(employeeId: string): Buffer {
  // 确保使用纯工号（不含 _ 前缀和 @nd 后缀）
  const normalizedId = employeeId.replace(/^_/, '').replace(/@nd$/, '');
  const md5Hash = crypto.createHash('md5').update(`prpl-91u-nd_${normalizedId}`).digest('hex');
  const withPrefix = '???91u' + md5Hash;
  const padded = withPrefix.padEnd(256, '7');
  return Buffer.from(padded.slice(0, 256), 'utf8');
}

export function getDbPath(basePath: string, employeeId: string): string {
  // 兼容传入 _986916@nd 格式或纯工号 986916 格式
  const normalizedId = employeeId.replace(/^_/, '').replace(/@nd$/, '');
  return path.join(basePath, `_${normalizedId}@nd`);
}

export function openImDatabase(config: ImDbConfig): Database.Database | null {
  const basePath = config.basePath || DEFAULT_IM_DB_BASE_PATH;
  const dbPath = getDbPath(basePath, config.employeeId);
  const encryptionKey = generateKey(config.employeeId);

  console.log(`[IM-DB] Attempting to open database at: ${dbPath}`);
  console.log(`[IM-DB] Using encryption key (first 16 bytes hex): ${encryptionKey.slice(0, 16).toString('hex')}`);

  const dbFiles = ['btree_2.db', 'btree_3.db', 'storage.db', 'messages.db'];

  for (const file of dbFiles) {
    const fullPath = path.join(dbPath, file);
    try {
      const db = new Database(fullPath, {
        readonly: true,
        fileMustExist: true
      });

      db.pragma('key = "' + encryptionKey.toString('hex') + '"');

      const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all();
      console.log(`[IM-DB] Opened ${file}, tables: ${tables.map((t: any) => t.name).join(', ')}`);

      if (tables.some((t: any) => t.name === 'messages' || t.name === 'Buddies' || t.name === 'Message' || t.name === 'Roster' || t.name === 'Chat')) {
        console.log(`[IM-DB] Successfully opened encrypted database: ${fullPath}`);
        return db;
      }
      db.close();
    } catch (e: any) {
      console.log(`[IM-DB] Failed to open ${file}: ${e.message}`);
    }
  }

  return null;
}

export function getMessageTables(db: Database.Database): string[] {
  const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all() as { name: string }[];
  return tables.map(t => t.name).filter(name =>
    name.toLowerCase().includes('message') ||
    name.toLowerCase().includes('chat') ||
    name.toLowerCase().includes('msg')
  );
}

export function getMessagesFromDb(db: Database.Database, options?: {
  startTime?: number;
  endTime?: number;
  limit?: number;
  offset?: number;
}): ImMessage[] {
  const messages: ImMessage[] = [];

  const tables = getMessageTables(db);

  for (const table of tables) {
    try {
      let query = `SELECT * FROM ${table}`;
      const conditions: string[] = [];
      const params: any[] = [];

      if (options?.startTime) {
        conditions.push('create_time >= ?');
        params.push(options.startTime);
      }
      if (options?.endTime) {
        conditions.push('create_time <= ?');
        params.push(options.endTime);
      }

      if (conditions.length > 0) {
        query += ' WHERE ' + conditions.join(' AND ');
      }

      query += ' ORDER BY create_time DESC';

      if (options?.limit) {
        query += ' LIMIT ' + options.limit;
      }
      if (options?.offset) {
        query += ' OFFSET ' + options.offset;
      }

      const results = db.prepare(query).all(...params) as any[];

      for (const row of results) {
        messages.push({
          msg_id: row.msg_id || row.id || row._id || String(Date.now()),
          sender_id: row.sender_id || row.from_id || row.fromJid || '',
          sender_name: row.sender_name || row.nick || row.from || 'Unknown',
          group_id: row.group_id || row.gid || row.room_id || null,
          group_name: row.group_name || row.group || row.room_name || null,
          content: row.content || row.body || row.message || row.text || '',
          msg_type: row.msg_type || row.type || 'text',
          create_time: row.create_time || row.time || row.timestamp || new Date().toISOString(),
          is_mentioned: row.is_mentioned || row.mentioned || 0,
        });
      }
    } catch (e) {
      console.log(`[IM-DB] Error reading table ${table}:`, (e as Error).message);
    }
  }

  return messages;
}

export function getConversationList(db: Database.Database): Array<{ id: string; name: string; type: string; lastMessage?: string; lastTime?: string }> {
  const conversations: Array<{ id: string; name: string; type: string; lastMessage?: string; lastTime?: string }> = [];

  const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all() as { name: string }[];

  for (const table of tables) {
    const tableName = table.name.toLowerCase();
    if (tableName.includes('buddy') || tableName.includes('roster') || tableName.includes('contact') || tableName.includes('group')) {
      try {
        const results = db.prepare(`SELECT * FROM ${table.name} LIMIT 50`).all() as any[];

        for (const row of results) {
          conversations.push({
            id: row.buddy_id || row.id || row.jid || row.uid || String(Math.random()),
            name: row.nick || row.name || row.buddy_name || row.display_name || 'Unknown',
            type: tableName.includes('group') ? 'group' : 'direct',
            lastTime: row.last_time || row.update_time || undefined,
          });
        }
      } catch (e) {
        console.log(`[IM-DB] Error reading table ${table.name}:`, (e as Error).message);
      }
    }
  }

  return conversations;
}

export function getMessagesByConversation(db: Database.Database, convId: string, options?: {
  startTime?: number;
  endTime?: number;
  limit?: number;
  offset?: number;
}): ImMessage[] {
  const messages: ImMessage[] = [];

  const tables = getMessageTables(db);

  for (const table of tables) {
    try {
      const columns = (db.pragma(`table_info(${table})`) as { name: string }[]).map(c => c.name.toLowerCase());
      const hasConvId = columns.some((c: string) => c.includes('gid') || c.includes('group') || c.includes('room') || c.includes('conv'));

      let query = `SELECT * FROM ${table}`;
      const conditions: string[] = [];
      const params: any[] = [];

      if (hasConvId) {
        const gidCol = columns.find((c: string) => c.includes('gid') || c.includes('group') || c.includes('room') || c.includes('conv'));
        if (gidCol) {
          conditions.push(`${gidCol} = ?`);
          params.push(convId);
        }
      }

      if (options?.startTime) {
        conditions.push('create_time >= ?');
        params.push(options.startTime);
      }
      if (options?.endTime) {
        conditions.push('create_time <= ?');
        params.push(options.endTime);
      }

      if (conditions.length > 0) {
        query += ' WHERE ' + conditions.join(' AND ');
      }

      query += ' ORDER BY create_time DESC';

      if (options?.limit) {
        query += ' LIMIT ' + options.limit;
      }

      const results = db.prepare(query).all(...params) as any[];

      for (const row of results) {
        messages.push({
          msg_id: row.msg_id || row.id || row._id || String(Date.now()),
          sender_id: row.sender_id || row.from_id || row.fromJid || '',
          sender_name: row.sender_name || row.nick || row.from || 'Unknown',
          group_id: row.group_id || row.gid || row.room_id || convId,
          group_name: row.group_name || row.group || row.room_name || null,
          content: row.content || row.body || row.message || row.text || '',
          msg_type: row.msg_type || row.type || 'text',
          create_time: row.create_time || row.time || row.timestamp || new Date().toISOString(),
          is_mentioned: row.is_mentioned || row.mentioned || 0,
        });
      }
    } catch (e) {
      console.log(`[IM-DB] Error reading messages from table ${table}:`, (e as Error).message);
    }
  }

  return messages;
}

export function testConnection(config: ImDbConfig): { success: boolean; message: string; keyPreview?: string } {
  try {
    const key = generateKey(config.employeeId);
    const keyPreview = key.toString('hex').slice(0, 40) + '...';

    const basePath = config.basePath || DEFAULT_IM_DB_BASE_PATH;
    const dbPath = getDbPath(basePath, config.employeeId);

    console.log(`[IM-DB] Testing connection at: ${dbPath}`);

    const dbFiles = ['btree_2.db', 'btree_3.db', 'storage.db', 'messages.db'];

    for (const file of dbFiles) {
      const fullPath = path.join(dbPath, file);
      try {
        const db = new Database(fullPath, { readonly: true, fileMustExist: true });

        try {
          db.pragma('key = "' + key.toString('hex') + '"');
        } catch (e) {
          console.log(`[IM-DB] Could not set key pragma: ${(e as Error).message}`);
        }

        const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all();
        db.close();

        return {
          success: true,
          message: `Successfully connected to ${file}. Found tables: ${tables.map((t: any) => t.name).join(', ')}`,
          keyPreview,
        };
      } catch (e) {
        console.log(`[IM-DB] Failed to test ${file}: ${(e as Error).message}`);
        continue;
      }
    }

    return {
      success: false,
      message: 'Could not open any database file. The database may be encrypted or path is incorrect.',
      keyPreview,
    };
  } catch (e: any) {
    return {
      success: false,
      message: `Error: ${e.message}`,
    };
  }
}