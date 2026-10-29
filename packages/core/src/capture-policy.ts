import type { CaptureIdentity } from "./export.js";

/** Opt-in profile for Penpot MCP sandboxes, which hide the browser. The strict default is unchanged. */
export const nativeExportProfile = "penpot-native-export-v1";
export type CapturePolicyName = typeof nativeExportProfile;

type PolicyFields = Pick<
  CaptureIdentity,
  | "scale"
  | "penpotApiVersion"
  | "renderEnvironment"
  | "activeThemeIds"
  | "designSize"
  | "capturePolicy"
>;

export function isCapturePolicy(value: unknown): value is CapturePolicyName {
  return value === nativeExportProfile;
}

/**
 * Why a capture cannot carry the native-export profile, or undefined when it can.
 * Browser identity must stay unknown: an observed user agent is never rewritten or relabelled.
 */
function nativeExportProblem(capture: PolicyFields): string | undefined {
  if (!capture.penpotApiVersion) {
    return "Penpot API version was not observed";
  }
  if (!Number.isFinite(capture.scale) || capture.scale <= 0) {
    return "Export scale was not observed";
  }
  if (!Array.isArray(capture.activeThemeIds)) {
    return "Active theme identities were not observed";
  }
  if (
    !capture.designSize ||
    !Number.isFinite(capture.designSize.width) ||
    !Number.isFinite(capture.designSize.height)
  ) {
    return "Design dimensions were not observed";
  }
  if (capture.renderEnvironment !== null) {
    return "Browser identity is observed, so the strict rule applies; the profile is for an unknown browser";
  }
  return undefined;
}

/** Stamp a freshly observed capture with the requested profile, or fail with the missing evidence. */
export function applyCapturePolicy(
  capture: CaptureIdentity,
  policy: CapturePolicyName | undefined,
): CaptureIdentity {
  if (policy === undefined) {
    return capture;
  }
  if (!isCapturePolicy(policy)) {
    throw new Error(`Unknown capture policy: ${String(policy)}`);
  }
  const problem = nativeExportProblem(capture);
  if (problem) {
    throw new Error(`Capture policy ${policy} cannot apply: ${problem}`);
  }
  return {
    ...capture,
    capturePolicy: policy,
  };
}

/**
 * The one rule for trusting an approval across file revisions. Strict captures need a known
 * browser; profile-bound captures need the profile's evidence. Old null-environment approvals
 * carry no profile and so never qualify.
 */
export function crossRevisionContinuityProblem(original: PolicyFields): string | undefined {
  if (original.capturePolicy !== undefined) {
    if (!isCapturePolicy(original.capturePolicy)) {
      return "Approval names an unknown capture policy";
    }
    return nativeExportProblem(original);
  }
  if (
    !original.penpotApiVersion ||
    !original.renderEnvironment ||
    !Array.isArray(original.activeThemeIds)
  ) {
    return "Capture environment is unknown";
  }
  return undefined;
}
