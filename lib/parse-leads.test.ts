import { describe, it, expect } from "vitest";
import { makeLead, parseLeadsText, normalizePhone } from "./parse-leads";

describe("normalizePhone", () => {
  it("keeps leading + and strips formatting", () => {
    expect(normalizePhone(" +972 50-123 4567 ")).toBe("+972501234567");
    expect(normalizePhone("(555) 123.4567")).toBe("5551234567");
  });
});

describe("makeLead", () => {
  it("stores a valid email, trimmed", () => {
    expect(makeLead("Dana", "+972501234567", " dana@acme.com ").email).toBe("dana@acme.com");
  });

  it("drops an invalid or empty email instead of storing junk", () => {
    expect(makeLead("Dana", "+972501234567", "not-an-email").email).toBeUndefined();
    expect(makeLead("Dana", "+972501234567", "").email).toBeUndefined();
    expect(makeLead("Dana", "+972501234567").email).toBeUndefined();
  });
});

describe("parseLeadsText - email support", () => {
  it("reads email from JSON rows", () => {
    const [l] = parseLeadsText('[{"name":"Dana","phone":"+972501234567","email":"dana@acme.com"}]');
    expect(l.email).toBe("dana@acme.com");
    expect(l.name).toBe("Dana");
  });

  it("detects an email column in CSV and keeps it out of the name", () => {
    const [l] = parseLeadsText("Dana, dana@acme.com, +972 50 123 4567");
    expect(l).toMatchObject({ name: "Dana", phone: "+972501234567", email: "dana@acme.com" });
  });

  it("CSV without an email column still parses (name, phone)", () => {
    const [l] = parseLeadsText("Dana, +972 50 123 4567");
    expect(l).toMatchObject({ name: "Dana", phone: "+972501234567" });
    expect(l.email).toBeUndefined();
  });

  it("header rows are skipped and email column parsed", () => {
    const rows = parseLeadsText("name,email,phone\nDana,dana@acme.com,+972501234567\nGuy,,+972541111111");
    expect(rows).toHaveLength(2);
    expect(rows[0].email).toBe("dana@acme.com");
    expect(rows[1].email).toBeUndefined();
  });
});
