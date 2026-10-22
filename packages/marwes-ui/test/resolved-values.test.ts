import { describe, expect, it } from "vitest";
import { compareResolved, expectedResolved, numericExpression } from "../src/resolved-values.js";
import type { TokenSnapshot } from "../src/tokens.js";

describe("bounded independent resolution expectations", () => {
  it("evaluates a numeric grammar with precedence and refuses code, nonfinite results and unsupported syntax", () => {
    expect(numericExpression("-(2 + 3) * 4 / 2 + 11")).toBe(1);
    expect(numericExpression("1e-2 * .5")).toBe(0.005);
    for (const value of ["globalThis.secret", "1/0", "2px", "Math.max(1,2)", "2**3", "(1+2", "" ]) expect(() => numericExpression(value)).toThrow();
  });
  it("resolves cross-set references under snapshot order, with cycles and unsupported functions explicit", () => {
    const snapshot = { sets: [{ name: "Base", tokens: [{ name: "radius", type: "borderRadius", value: "8" }, { name: "double", type: "borderRadius", value: "{radius} * 2" }, { name: "cycle", type: "number", value: "{cycle}" }, { name: "unsupported", type: "number", value: "max(1,2)" }] }, { name: "Overlay", tokens: [{ name: "radius", type: "borderRadius", value: "12" }] }] } as TokenSnapshot;
    expect(expectedResolved(snapshot, { sets: ["Overlay", "Base"] })).toEqual(expect.arrayContaining([{ name: "double", type: "borderRadius", value: 24 }, expect.objectContaining({ name: "cycle", unknown: expect.stringMatching(/Cyclic/) }), expect.objectContaining({ name: "unsupported", unknown: expect.any(String) })]));
  });
  it("compares actual numeric/color/font/typography forms without flattening unknown composites", () => {
    expect(compareResolved({ name: "r", type: "borderRadius", value: 16 }, 16)).toEqual({ equal: true });
    expect(compareResolved({ name: "c", type: "color", value: "#FFFFFF" }, "rgb(255, 255, 255)")).toEqual({ equal: true });
    expect(compareResolved({ name: "t", type: "typography", value: { fontFamilies: "Instrument Sans", fontSize: "16", fontWeight: "400" } }, [{ fontFamilies: ["Instrument Sans"], fontSizes: 16, fontWeights: "400", textCase: "none" }])).toEqual({ equal: true });
    expect(compareResolved({ name: "f", type: "fontFamilies", value: "Instrument Sans" }, [["Instrument", "Sans"]])).toHaveProperty("unknown");
    expect(compareResolved({ name: "s", type: "shadow", value: "x" }, [])).toHaveProperty("unknown");
    expect(compareResolved({ name: "r", type: "number", value: 1 }, undefined)).toHaveProperty("unknown");
  });
});
