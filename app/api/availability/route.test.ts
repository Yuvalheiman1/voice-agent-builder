import { describe, it, expect, beforeEach, vi } from "vitest";

const getAvailabilityMock = vi.fn();
vi.mock("@/lib/booking", () => ({ getAvailability: (...a: unknown[]) => getAvailabilityMock(...a) }));

import { GET } from "./route";

beforeEach(() => {
  getAvailabilityMock.mockReset();
});

describe("GET /api/availability", () => {
  it("returns slots + text, defaulting to english", async () => {
    getAvailabilityMock.mockResolvedValue({ slots: ["2026-07-13T06:00:00.000Z"], text: "- Monday..." });
    const res = await GET(new Request("http://t/api/availability"));
    expect(await res.json()).toEqual({ slots: ["2026-07-13T06:00:00.000Z"], text: "- Monday..." });
    expect(getAvailabilityMock).toHaveBeenCalledWith("en");
  });
  it("passes language=he through", async () => {
    getAvailabilityMock.mockResolvedValue({ slots: [], text: "אין זמנים פנויים השבוע." });
    await GET(new Request("http://t/api/availability?language=he"));
    expect(getAvailabilityMock).toHaveBeenCalledWith("he");
  });
  it("maps an error to 500", async () => {
    getAvailabilityMock.mockRejectedValue(new Error("boom"));
    const res = await GET(new Request("http://t/api/availability"));
    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({ error: "boom" });
  });
});
