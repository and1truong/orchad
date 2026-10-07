import type { Code } from "@orchard/bridge-contract";
export class DomainError extends Error {
  constructor(
    readonly code: Code,
    message: string,
  ) {
    super(message);
  }
}
export function reject(code: Code, message: string): never {
  throw new DomainError(code, message);
}
export function boundedPage(rows: any[], offset = 0, limit = 20) {
  const items: any[] = [];
  for (const row of rows.slice(offset, offset + limit)) {
    if (Buffer.byteLength(JSON.stringify([...items, row])) > 48 * 1024) break;
    items.push(row);
  }
  return {
    items,
    total: rows.length,
    offset,
    nextOffset:
      offset + items.length < rows.length ? offset + items.length : null,
  };
}
