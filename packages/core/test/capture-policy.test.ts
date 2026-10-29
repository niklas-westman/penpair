import { describe, expect, it } from "vitest";
import { approvalFingerprint } from "../src/approvals.js";
import {
  applyCapturePolicy,
  crossRevisionContinuityProblem,
  nativeExportProfile,
} from "../src/capture-policy.js";
import type { CaptureIdentity } from "../src/export.js";

const sandbox: CaptureIdentity = {
  fileId: "file",
  pageId: "page",
  frameId: "frame",
  revision: 4,
  scale: 2,
  penpotApiVersion: "2.18.5",
  renderEnvironment: null,
  activeThemes: [],
  activeThemeIds: [],
  designSize: {
    width: 10,
    height: 20,
  },
};
const sha = "a".repeat(64);

describe("penpot-native-export-v1", () => {
  it("keeps the strict rule blocking an unknown browser", () => {
    expect(crossRevisionContinuityProblem(sandbox)).toBe("Capture environment is unknown");
  });

  it("allows continuity only for a profile-bound capture", () => {
    const profiled = applyCapturePolicy(sandbox, nativeExportProfile);
    expect(profiled.capturePolicy).toBe(nativeExportProfile);
    expect(profiled.renderEnvironment).toBeNull();
    expect(crossRevisionContinuityProblem(profiled)).toBeUndefined();
  });

  it("binds the profile into a new approval fingerprint, leaving strict fingerprints alone", () => {
    const strict = approvalFingerprint(sandbox, sha);
    expect(approvalFingerprint(applyCapturePolicy(sandbox, undefined), sha)).toBe(strict);
    expect(approvalFingerprint(applyCapturePolicy(sandbox, nativeExportProfile), sha)).not.toBe(
      strict,
    );
  });

  it.each([
    [
      "API version",
      {
        penpotApiVersion: null,
      },
    ],
    [
      "themes",
      {
        activeThemeIds: null,
      },
    ],
    [
      "dimensions",
      {
        designSize: undefined,
      },
    ],
    [
      "browser identity",
      {
        renderEnvironment: "Chrome",
      },
    ],
  ])("refuses the profile without %s evidence", (_name, change) => {
    expect(() =>
      applyCapturePolicy(
        {
          ...sandbox,
          ...change,
        },
        nativeExportProfile,
      ),
    ).toThrow(/cannot apply/);
  });

  it("rejects an unknown policy name", () => {
    expect(() => applyCapturePolicy(sandbox, "other" as never)).toThrow(/Unknown capture policy/);
    expect(
      crossRevisionContinuityProblem({
        ...sandbox,
        capturePolicy: "other" as never,
      }),
    ).toMatch(/unknown capture policy/);
  });
});
