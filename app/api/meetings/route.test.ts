import { describe, it, expect, beforeEach, vi } from "vitest";
import { createDbMock, type DbMock } from "@/lib/test-utils/db-mock";

let mockDb: DbMock;
vi.mock("@/lib/db", () => ({ db: () => mockDb.db() }));

import { GET } from "./route";

beforeEach(() => {
  mockDb = createDbMock();
});

describe("GET /api/meetings", () => {
  it("returns mapped meetings ascending", async () => {
    mockDb.setResult({ data: [{ id: "m1", start_ts: "2026-07-13T06:00:00.000Z", lead_name: "Dana", created_at: "2026-07-12T00:00:00Z" }], error: null });
    const res = await GET();
    const json = await res.json();
    expect(res.status).toBe(200);
    expect(json.meetings[0]).toMatchObject({ id: "m1", startTs: "2026-07-13T06:00:00.000Z", leadName: "Dana" });
    expect(mockDb.op("meetings", "order")?.args).toEqual(["start_ts", { ascending: true }]);
  });
  it("maps a DB error to 500", async () => {
    mockDb.setResult({ data: null, error: { message: "boom" } });
    const res = await GET();
    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({ error: "boom" });
  });
});
