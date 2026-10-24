import type { BaselineCase } from "@penpair/core";

export interface ImplementationMapping {
  schemaVersion: 1;
  cases: Array<{
    id: string;
    setup: string;
  }>;
}

export interface ImplementationCase {
  id: string;
  route: string;
  intent: BaselineCase;
  setup: string;
  baseline: {
    path: string;
    sha256: string;
    scale: number;
  };
  threshold: number;
}

export interface CasePlan {
  schemaVersion: 1;
  kind: "implementation-case-plan";
  cases: ImplementationCase[];
  pending: Array<{
    id: string;
    reason: string;
  }>;
  complete: boolean;
  visualApproval: false;
}

export interface BrowserCaptureMetadata {
  schemaVersion: 1;
  root: string;
  rootBox: {
    x: number;
    y: number;
    width: number;
    height: number;
  };
  clip: {
    x: number;
    y: number;
    width: number;
    height: number;
  };
  rounding: "outward-css-pixels";
  deviceScaleFactor: number;
  browser: {
    name: string;
    version: string;
  };
  fonts: Array<{
    family: string;
    weight: string;
    style: string;
    status: "loaded";
  }>;
  pointer: {
    x: number;
    y: number;
    outsideRoot: boolean;
    hoveredControls: number;
  };
  occlusion?: {
    samples: number;
    blocked: number;
  };
  scroll: {
    x: number;
    y: number;
  };
  layoutSamples: number;
}

export interface ProviderEvidence {
  schemaVersion: 1;
  id: string;
  route: string;
  setup: string;
  observed: Pick<BaselineCase, "viewport" | "theme" | "state" | "fixture">;
  fonts: string[];
  fontsReady: boolean;
  baselineHash: string;
  capture?: BrowserCaptureMetadata;
  /** Independently captured static lossless WebP (preferred) or legacy PNG evidence. */
  screenshot: string;
  diffPixelRatio: number;
  provider: {
    name: string;
    version: string;
  };
}

export interface ImplementationProvider {
  runCase(implementationCase: ImplementationCase): Promise<ProviderEvidence>;
}

export interface ImplementationCaseReport {
  id: string;
  complete: boolean;
  withinThreshold?: boolean;
  evidence?: ProviderEvidence;
  screenshotHash?: string;
  reason?: string;
}

export interface ImplementationReport {
  schemaVersion: 1;
  kind: "implementation-case-evidence";
  complete: boolean;
  cases: ImplementationCaseReport[];
  pending: CasePlan["pending"];
  visualApproval: false;
  verdict: "owner-review-required";
  accessibility: "not-assessed";
}
