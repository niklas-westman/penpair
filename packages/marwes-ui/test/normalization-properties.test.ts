import { describe, expect, it } from "vitest";
import { normalizeValue } from "../src/tokens.js";

describe("storage normalization invariants", () => {
  it("preserves color identity across hexadecimal case changes", () => {
    let seed = 417;
    for (let i = 0; i < 200; i++) {
      seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
      const color = `#${(seed & 0xffffff).toString(16).padStart(6, "0")}`;
      expect(normalizeValue("color", color)).toBe(normalizeValue("color", color.toUpperCase()));
      const other = `#${((seed + 1) & 0xffffff).toString(16).padStart(6, "0")}`;
      expect(normalizeValue("color", color)).not.toBe(normalizeValue("color", other));
    }
  });
  it("compares equivalent font and typography storage forms without losing identity", () => {
    for (let i = 0; i < 100; i++) {
      const family = `Family ${i}`;
      const weight = 100 + i * 5;
      expect(normalizeValue("fontFamilies", family)).toBe(
        normalizeValue("fontFamilies", [
          family,
        ]),
      );
      expect(
        normalizeValue("typography", {
          fontFamily: family,
          fontWeight: weight,
        }),
      ).toBe(
        normalizeValue("typography", {
          fontWeight: String(weight),
          fontFamilies: [
            family,
          ],
        }),
      );
      expect(normalizeValue("fontFamilies", family)).not.toBe(
        normalizeValue("fontFamilies", [
          `Other ${i}`,
        ]),
      );
    }
  });
});
