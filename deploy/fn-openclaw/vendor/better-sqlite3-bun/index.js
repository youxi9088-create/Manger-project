import { Database as BunDatabase } from 'bun:sqlite';

function normalizeArgs(args) {
  if (args.length === 1 && Array.isArray(args[0])) return args[0];
  return args;
}

class Statement {
  constructor(statement) {
    this.statement = statement;
  }

  get(...args) {
    return this.statement.get(...normalizeArgs(args));
  }

  all(...args) {
    return this.statement.all(...normalizeArgs(args));
  }

  run(...args) {
    const result = this.statement.run(...normalizeArgs(args));
    return {
      changes: result?.changes ?? 0,
      lastInsertRowid: result?.lastInsertRowid ?? 0,
    };
  }

  iterate(...args) {
    return this.statement.iterate(...normalizeArgs(args));
  }
}

export default class Database {
  constructor(filename, options = {}) {
    this.db = new BunDatabase(filename, {
      readonly: Boolean(options.readonly),
      create: options.fileMustExist ? false : true,
    });
  }

  prepare(sql) {
    return new Statement(this.db.query(sql));
  }

  exec(sql) {
    this.db.exec(sql);
    return this;
  }

  pragma(sql) {
    return this.db.exec(`PRAGMA ${sql}`);
  }

  transaction(fn) {
    return (...args) => {
      this.db.exec('BEGIN');
      try {
        const result = fn(...args);
        this.db.exec('COMMIT');
        return result;
      } catch (error) {
        this.db.exec('ROLLBACK');
        throw error;
      }
    };
  }

  close() {
    this.db.close();
  }
}
