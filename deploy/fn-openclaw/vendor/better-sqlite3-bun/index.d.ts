declare module 'better-sqlite3' {
  export default class Database {
    constructor(filename: string, options?: { readonly?: boolean; fileMustExist?: boolean });
    prepare(sql: string): {
      get(...args: unknown[]): unknown;
      all(...args: unknown[]): unknown[];
      run(...args: unknown[]): { changes: number; lastInsertRowid: number | bigint };
      iterate(...args: unknown[]): IterableIterator<unknown>;
    };
    exec(sql: string): this;
    pragma(sql: string): unknown;
    transaction<T extends (...args: unknown[]) => unknown>(fn: T): T;
    close(): void;
  }

  export type Database = InstanceType<typeof Database>;
}
