/**
 * 最小 ambient 宣告：bun:sqlite（只涵蓋 genbank.ts 用到的 API 表面）。
 * runtime 由 bun 提供（webctl.sh:66 跑 `bun run src/server.ts`）；此檔僅供 tsc typecheck。
 * 完整型別見 bun-types；此處刻意只宣告用到的子集，零依賴。
 */
declare module 'bun:sqlite' {
  export interface Statement {
    get(...params: unknown[]): unknown
    all(...params: unknown[]): unknown[]
    run(...params: unknown[]): { changes: number; lastInsertRowid: number | bigint }
  }
  export class Database {
    constructor(filename?: string, options?: { create?: boolean; readonly?: boolean; readwrite?: boolean })
    exec(sql: string): void
    query(sql: string): Statement
    transaction<T extends (...args: never[]) => unknown>(fn: T): T
    close(): void
  }
}
