import { describe, expect, it } from "vitest";
import { compiles } from "../../../packages/core/src/snippet.js";
import { findInvalidCodeDirectories } from "../../../scripts/check-code-paths.mjs";
import { formatFrameLabel } from "./frame-label.js";
import { createFrameInspection } from "./frame-inspection.js";

describe("convention examples", () => {
  it("normalizes names and refuses incomplete labels", () => {
    expect(
      formatFrameLabel({
        pageName: " Dashboard ",
        frameName: " Empty ",
      }),
    ).toBe("Dashboard / Empty");
    expect(() =>
      formatFrameLabel({
        pageName: " ",
        frameName: "Empty",
      }),
    ).toThrow("requires");
  });

  it("compiles and executes the generated read-only sandbox body", async () => {
    const inspection = createFrameInspection("Empty");
    expect(compiles(inspection.code)).toBeUndefined();
    const AsyncFunction = Object.getPrototypeOf(async function () {}).constructor;
    const executeInspection = new AsyncFunction("penpot", inspection.code);
    const frame = {
      id: "frame-1",
      type: "board",
      name: "Empty",
    };

    expect(
      await executeInspection({
        currentPage: {
          children: [
            frame,
          ],
        },
      }),
    ).toEqual({
      ok: true,
      frameId: "frame-1",
      frameName: "Empty",
    });
    expect(
      await executeInspection({
        currentPage: {
          children: [
            frame,
            frame,
          ],
        },
      }),
    ).toMatchObject({
      ok: false,
    });
  });

  it("checks new code folders while leaving data paths outside the code rule", () => {
    expect(
      findInvalidCodeDirectories([
        "packages/core/src/capture-validation.ts",
        "examples/browser-capture/provider.mjs",
        "docs/conventions/templates/frame-label.ts",
        "docs/trials/ImportedEvidence/report.json",
      ]),
    ).toEqual([]);
    expect(
      findInvalidCodeDirectories([
        "packages/core/src/captureHelpers/geometry.ts",
        "packages/core/src/captureHelpers/fonts.ts",
        "examples/BrowserCapture/provider.mjs",
      ]),
    ).toEqual([
      "examples/BrowserCapture",
      "packages/core/src/captureHelpers",
    ]);
  });
});
