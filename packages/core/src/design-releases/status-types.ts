import type { DesignRelease } from "./types.js";

export interface ReleaseNextAction {
  id: string;
  kind: "read-only" | "write-preview" | "approval-required" | "input-required";
  command?: string;
  missingInputs?: string[];
  reason: string;
}

export interface ReleaseRecovery {
  runId: string;
  operation: string;
  state: string;
  inputsMatch: boolean;
  resumeEligible: false;
  reconciled?: boolean;
  reason: string;
}

export interface ReleaseImplementationStatus {
  recorded: DesignRelease["implementation"]["status"];
  comparison: "not-assessed" | "incomplete" | "drift" | "passed";
  complete: boolean;
  caseIds: string[];
  reasons: string[];
  ownerAcceptance: "not-recorded";
}

export interface ReleaseStatus {
  schemaVersion: 1;
  kind: "design-release-status";
  id: string;
  productVersion: string;
  designHash: string;
  recordedState: DesignRelease["status"];
  step:
    | "assemble"
    | "verify"
    | "review"
    | "finalize"
    | "repair"
    | "handoff"
    | "implementation-review"
    | "implementation-verify";
  design: {
    valid: boolean;
    finalized: boolean;
    ready: boolean;
  };
  freshness: {
    scope: "saved-evidence" | "live-penpot";
    verified: boolean;
    checkedAt: string;
    limitation?: string;
  };
  inventory: {
    total: number;
    changed: number;
    retained: number;
    adopted: number;
    copied: number;
  };
  completed: string[];
  blockers: string[];
  implementation: ReleaseImplementationStatus;
  recovery: ReleaseRecovery[];
  nextActions: ReleaseNextAction[];
}
