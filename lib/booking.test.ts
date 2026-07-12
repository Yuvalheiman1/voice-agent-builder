import { describe, it, expect, beforeEach, vi } from "vitest";
import { createDbMock, type DbMock } from "@/lib/test-utils/db-mock";

let mockDb: DbMock;
vi.mock("@/lib/db", () => ({ db: () => mockDb.db() }));

import { getAvailability, bookSlot } from "./booking";

const SETTINGS_ROW = { id: 1, work_days: [0, 1, 2, 3, 4], day_start: "09:00", day_end: "17:00", meeting_minutes: 30, timezone: "Asia/Jerusalem" };
const NOW = Date.parse("2026-07-12T06:00:00.000Z"); // Sunday 09:00 IDT
const VALID = "2026-07-13T06:00:00.000Z";           // Monday 09:00 IDT

beforeEach(() => {
  mockDb = createDbMock();
});

function settingsAndMeetings(meetings: { start_ts: string }[]) {
  mockDb.setResolver((rec) =>
    rec.table === "booking_settings"
      ? { data: SETTINGS_ROW, error: null }
      : rec.table === "meetings"
        ? { data: meetings, error: null }
        : { data: null, error: null },
  );
}

// The mock records ops per-chain as { method, args }[] (no top-level `op`
// field on `rec`) - check the last recorded op to tell an insert chain from
// a select chain on the same "meetings" table.
const isInsert = (rec: { ops: { method: string }[] }) => rec.ops.some((o) => o.method === "insert");

describe("getAvailability", () => {
  it("computes free slots minus booked meetings and renders text", async () => {
    settingsAndMeetings([{ start_ts: "2026-07-12T08:00:00.000Z" }]); // first slot taken
    const a = await getAvailability("en", NOW);
    expect(a.slots[0]).toBe("2026-07-12T08:30:00.000Z");
    expect(a.text).toContain('(startTime: "2026-07-12T08:30:00.000Z")');
  });
  it("throws on a settings DB error", async () => {
    mockDb.setResolver(() => ({ data: null, error: { message: "boom" } }));
    await expect(getAvailability("en", NOW)).rejects.toThrow("boom");
  });
});

describe("bookSlot", () => {
  it("inserts a meeting row and returns ok for a valid free slot", async () => {
    settingsAndMeetings([]);
    const r = await bookSlot({ name: "Dana", email: "d@x.com", startTime: VALID, callId: "c1" }, NOW);
    expect(r).toEqual({ ok: true, startISO: VALID });
    const ins = mockDb.op("meetings", "insert");
    expect(ins?.args[0]).toMatchObject({ start_ts: VALID, lead_name: "Dana", lead_email: "d@x.com", call_id: "c1" });
  });
  it("rejects an off-grid / invalid time WITHOUT inserting, and offers alternatives", async () => {
    settingsAndMeetings([]);
    const r = await bookSlot({ startTime: "2026-07-13T06:15:00.000Z" }, NOW);
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.kind).toBe("invalid");
      expect(r.sayToLead).toContain("still free");
    }
    expect(mockDb.op("meetings", "insert")).toBeUndefined();
  });
  it("maps a unique-violation (23505) to a spoken conflict with alternatives", async () => {
    mockDb.setResolver((rec) =>
      rec.table === "booking_settings"
        ? { data: SETTINGS_ROW, error: null }
        : isInsert(rec)
          ? { data: null, error: { code: "23505", message: "duplicate key" } }
          : { data: [], error: null },
    );
    const r = await bookSlot({ startTime: VALID }, NOW);
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.kind).toBe("conflict");
      expect(r.sayToLead).toContain("just taken");
    }
  });
  it("maps any other DB error to kind error with a follow-up promise", async () => {
    mockDb.setResolver((rec) =>
      rec.table === "booking_settings"
        ? { data: SETTINGS_ROW, error: null }
        : isInsert(rec)
          ? { data: null, error: { code: "XX000", message: "db down" } }
          : { data: [], error: null },
    );
    const r = await bookSlot({ startTime: VALID }, NOW);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.kind).toBe("error");
  });
});
