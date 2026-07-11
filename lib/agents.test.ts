import { describe, it, expect } from "vitest";
import { PERSONAS, PERSONAS_BY_LANG, personaToConfig, getPersona } from "./agents";

describe("hebrew personas", () => {
  it("has 4 hebrew personas with hebrew names and the agreed voices", () => {
    const he = PERSONAS_BY_LANG("he");
    expect(he.map((p) => p.id)).toEqual(["maya", "noa", "uri", "tal"]);
    expect(he.map((p) => p.voiceId)).toEqual(["nova", "shimmer", "onyx", "Layla"]); // tal = Vapi-voice experiment
    he.forEach((p) => expect(p.language).toBe("he"));
  });
  it("english list is exactly the original five", () => {
    expect(PERSONAS_BY_LANG("en").map((p) => p.id)).toEqual(["ellie", "vera", "vince", "remi", "theo"]);
  });
  it("hebrew persona seeds a hebrew config with a hebrew first message", () => {
    const cfg = personaToConfig(getPersona("maya")!);
    expect(cfg.language).toBe("he");
    expect(cfg.firstMessage).toMatch(/[֐-׿]/); // contains Hebrew characters
    expect(cfg.booking).toBe(true);
  });
  it("english persona seeds language 'en'", () => {
    expect(personaToConfig(getPersona("ellie")!).language).toBe("en");
  });
});
