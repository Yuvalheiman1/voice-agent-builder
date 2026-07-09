import { vi } from "vitest";

// Chainable stub for the Supabase query builder used by the route handlers.
// Every builder method (from/select/order/eq/not/limit/insert/update/delete/
// upsert) returns the same chain, and the chain is awaitable - awaiting it
// resolves to a configurable `{ data, error }`, matching how the handlers do
// `const { error } = await db().from(...).insert(...)`.

export type Result = { data: unknown; error: unknown };
export type Op = { method: string; args: unknown[] };
export type Recorded = { table: string; ops: Op[] };

const METHODS = [
  "select", "order", "eq", "not", "limit",
  "insert", "update", "delete", "upsert",
] as const;

export function createDbMock() {
  const chains: Recorded[] = [];
  let resolver: (rec: Recorded) => Result = () => ({ data: [], error: null });

  const from = vi.fn((table: string) => {
    const rec: Recorded = { table, ops: [] };
    chains.push(rec);
    const chain: Record<string, unknown> = {};
    for (const m of METHODS) {
      chain[m] = vi.fn((...args: unknown[]) => {
        rec.ops.push({ method: m, args });
        return chain;
      });
    }
    // Awaitable: `await chain` resolves via the configured resolver.
    chain.then = (onFulfilled: (r: Result) => unknown, onRejected?: (e: unknown) => unknown) =>
      Promise.resolve(resolver(rec)).then(onFulfilled, onRejected);
    return chain;
  });

  return {
    db: () => ({ from }),
    from,
    chains,
    /** Same `{data,error}` for every awaited query. */
    setResult(r: Result) {
      resolver = () => r;
    },
    /** Per-query result, chosen from the recorded table + ops. */
    setResolver(fn: (rec: Recorded) => Result) {
      resolver = fn;
    },
    /** First recorded chain for a table. */
    chain(table: string) {
      return chains.find((c) => c.table === table);
    },
    /** Args passed to `method` on the first matching chain (undefined if never called). */
    op(table: string, method: string): Op | undefined {
      for (const c of chains) {
        if (c.table !== table) continue;
        const found = c.ops.find((o) => o.method === method);
        if (found) return found;
      }
      return undefined;
    },
  };
}

export type DbMock = ReturnType<typeof createDbMock>;
