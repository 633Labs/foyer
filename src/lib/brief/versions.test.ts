import { describe, expect, it } from "vitest";
import { comparePins, parseConstraint, parsePin, pinSatisfies } from "./versions";

describe("version constraints", () => {
  it("treats a bare major as a major range", () => {
    const range = parseConstraint("22.x");
    const pin = parsePin("22.14.0");
    const other = parsePin("20.11.1");
    expect(pin && pinSatisfies(range, pin)).toBe(true);
    expect(other && pinSatisfies(range, other)).toBe(false);
  });

  it("keeps a major-only pin inside a caret that needs a minor", () => {
    const range = parseConstraint("^20.11.0");
    const vague = parsePin("20");
    const older = parsePin("20.10.0");
    const newer = parsePin("20.11.1");
    expect(vague && pinSatisfies(range, vague)).toBeNull();
    expect(older && pinSatisfies(range, older)).toBe(false);
    expect(newer && pinSatisfies(range, newer)).toBe(true);
  });

  it("excludes a pin that falls outside engines", () => {
    const range = parseConstraint(">=20");
    const image = parsePin("18");
    const local = parsePin("20.11.1");
    expect(image && pinSatisfies(range, image)).toBe(false);
    expect(local && pinSatisfies(range, local)).toBe(true);
  });

  it("flags different Node majors and Python feature releases", () => {
    const node = [parsePin("18"), parsePin("20.11.1"), parsePin("22")].filter(
      (pin) => pin != null,
    );
    expect(comparePins("node", node)).toMatchObject({
      level: "release",
      keys: ["18", "20", "22"],
    });

    const python = [parsePin("3.11.9"), parsePin("3.12")].filter((pin) => pin != null);
    expect(comparePins("python", python)).toMatchObject({
      level: "release",
      keys: ["3.11", "3.12"],
    });
  });

  it("treats an unresolved codename as not a pin", () => {
    expect(parsePin("lts/iron")).toBeNull();
  });
});
