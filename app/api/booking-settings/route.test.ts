import { describe, it, expect, beforeEach, vi } from "vitest";
import { createDbMock, type DbMock } from "@/lib/test-utils/db-mock";

let mockDb: DbMock;
vi.mock("@/lib/db", () => ({ db: () => mockDb.db() }));

import { GET, PATCH } from "./route";

const SETTINGS_ROW = { id: 1, work_days: [0, 1, 2, 3, 4], day_start: "09:00", day_end: "17:00", meeting_minutes: 30, timezone: "Asia/Jerusalem" };
const patch = (body: unknown) => PATCH(new Request("http://t/api/booking-settings", { method: "PATCH", body: JSON.stringify(body) }));

beforeEach(() => {
  mockDb = createDbMock();
  mockDb.setResolver((rec) => (rec.table === "booking_settings" ? { data: SETTINGS_ROW, error: null } : { data: null, error: null }));
});

describe("GET /api/booking-settings", () => {
  it("returns camelCase settings", async () => {
    const res = await GET();
    expect((await res.json()).settings).toEqual({ workDays: [0, 1, 2, 3, 4], dayStart: "09:00", dayEnd: "17:00", meetingMinutes: 30, timezone: "Asia/Jerusalem" });
  });
  it("maps a DB error to 500", async () => {
    mockDb.setResolver(() => ({ data: null, error: { message: "boom" } }));
    expect((await GET()).status).toBe(500);
  });
});

describe("PATCH /api/booking-settings", () => {
  it("updates snake_case columns for a valid patch", async () => {
    const res = await patch({ dayStart: "10:00", meetingMinutes: 45 });
    expect(res.status).toBe(200);
    expect(mockDb.op("booking_settings", "update")?.args[0]).toEqual({ day_start: "10:00", meeting_minutes: 45 });
  });
  it("400 on bad workDays", async () => {
    expect((await patch({ workDays: [7] })).status).toBe(400);
    expect((await patch({ workDays: [] })).status).toBe(400);
  });
  it("400 on malformed time and on end <= start", async () => {
    expect((await patch({ dayStart: "9am" })).status).toBe(400);
    expect((await patch({ dayEnd: "08:00" })).status).toBe(400); // current start 09:00
  });
  it("400 on out-of-range meetingMinutes and on empty patch", async () => {
    expect((await patch({ meetingMinutes: 5 })).status).toBe(400);
    expect((await patch({})).status).toBe(400);
  });
  it("maps a DB error to 500", async () => {
    mockDb.setResolver((rec) =>
      rec.ops.some((o) => o.method === "update") ? { data: null, error: { message: "boom" } } : { data: SETTINGS_ROW, error: null },
    );
    expect((await patch({ dayStart: "10:00" })).status).toBe(500);
  });
});
