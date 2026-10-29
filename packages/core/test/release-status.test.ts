import { execFileSync } from "node:child_process";
import { describe, expect, it } from "vitest";
import { evaluateReleaseStatus, releaseCaseIds } from "../src/design-releases/status-evaluation.js";
import type { DesignRelease, ReleaseCheck } from "../src/design-releases/types.js";
import type { ReleaseImplementationStatus } from "../src/design-releases/status-types.js";

const hash = "a".repeat(64);
const artifact = {
  path: "evidence.json",
  sha256: hash,
};

function release(): DesignRelease {
  return {
    schemaVersion: 2,
    kind: "design-release",
    id: "release-101",
    title: "Release",
    productVersion: "1.0.1",
    fileId: "file",
    status: "planned",
    sources: [],
    contracts: [],
    target: {
      name: "release/1.0.1",
      ownerKey: "owner",
    },
    members: [
      {
        id: "login",
        disposition: "retained",
        source: {
          id: "login",
          label: "Login",
          pageId: "old-page",
          frameId: "login-frame",
          inspection: artifact,
          render: artifact,
          contentHash: hash,
        },
        approval: {
          record: artifact,
          recordId: "owner-approval",
          image: artifact,
        },
        route: "/login",
        case: {
          viewport: {
            width: 100,
            height: 100,
          },
          theme: "light",
          state: "empty",
          fixture: "default",
        },
      },
    ],
    receipts: [],
    maps: [],
    reviews: [],
    implementation: {
      status: "not-assessed",
      evidence: [],
    },
    createdAt: "2026-10-29T00:00:00Z",
  };
}

function checked(valid = false, live = false): ReleaseCheck {
  return {
    valid,
    live,
    finalized: false,
    designHash: hash,
    reasons: valid
      ? []
      : [
          "Missing verified evidence",
        ],
    implementation: "not-assessed",
  };
}

function implementation(): ReleaseImplementationStatus {
  return {
    recorded: "not-assessed",
    comparison: "not-assessed",
    complete: false,
    caseIds: [
      "login",
    ],
    reasons: [],
    ownerAcceptance: "not-recorded",
  };
}

function assemble(value: DesignRelease): void {
  value.target.pageId = "new-page";
  value.target.overviewFrameId = "overview";
  value.overview = {
    contentHash: hash,
    render: artifact,
    decodedPixelsHash: hash,
  };
}

function fidelity(value: DesignRelease): void {
  value.fidelity = {
    schemaVersion: 1,
    kind: "design-release-fidelity",
    verifiedAt: "2026-10-29T00:00:00Z",
    receiptsHash: hash,
    exactDecodedPixels: true,
    nativeStructure: true,
  };
}

describe("evidence-derived release status", () => {
  it("distinguishes inventory and saved evidence from live freshness", () => {
    const value = evaluateReleaseStatus(release(), checked(), implementation(), {
      from: "design/release.json",
    });
    expect(value.step).toBe("assemble");
    expect(value.inventory).toEqual({
      total: 1,
      changed: 0,
      retained: 1,
      adopted: 0,
      copied: 0,
    });
    expect(value.freshness).toMatchObject({
      scope: "saved-evidence",
      verified: false,
    });
    expect(value.nextActions).toContainEqual(
      expect.objectContaining({
        id: "assemble",
        kind: "write-preview",
        command: "penpair design-release assemble --from 'design/release.json'",
      }),
    );
    expect(releaseCaseIds(release())).toEqual([
      "login",
    ]);
  });

  it("allows retained-only verification without fabricated copy receipts", () => {
    const value = release();
    assemble(value);
    const status = evaluateReleaseStatus(value, checked(), implementation(), {
      from: "release.json",
    });
    expect(status.step).toBe("verify");
    expect(status.nextActions[0]?.command).toBe(
      "penpair design-release verify --from 'release.json'",
    );
  });

  it("does not promote recorded verification over invalid evidence", () => {
    const value = release();
    assemble(value);
    fidelity(value);
    value.status = "verified";
    const status = evaluateReleaseStatus(value, checked(), implementation());
    expect(status.step).toBe("review");
    expect(status.design.ready).toBe(false);
    expect(status.completed).not.toContain("native-evidence-validated");
  });

  it("asks for actual owner review of the verified exact candidate", () => {
    const value = release();
    assemble(value);
    fidelity(value);
    value.status = "verified";
    const status = evaluateReleaseStatus(value, checked(true, true), implementation(), {
      from: "release.json",
    });
    expect(status.step).toBe("finalize");
    expect(status.nextActions).toContainEqual(
      expect.objectContaining({
        kind: "approval-required",
      }),
    );
    expect(status.design.finalized).toBe(false);
  });

  it("preserves finalized history while exposing live drift", () => {
    const value = release();
    value.status = "final";
    const status = evaluateReleaseStatus(value, checked(false, true), implementation());
    expect(status.recordedState).toBe("final");
    expect(status.design).toEqual({
      valid: false,
      finalized: true,
      ready: false,
    });
    expect(status.step).toBe("repair");
    expect(status.freshness.verified).toBe(false);
  });

  it("keeps finalized design separate from implementation and owner acceptance", () => {
    const value = release();
    value.status = "final";
    const status = evaluateReleaseStatus(value, checked(true), implementation());
    expect(status.step).toBe("handoff");
    expect(status.design.ready).toBe(true);
    expect(status.implementation.complete).toBe(false);
    const passed = evaluateReleaseStatus(value, checked(true), {
      ...implementation(),
      comparison: "passed",
      complete: true,
    });
    expect(passed.step).toBe("implementation-review");
    expect(passed.implementation.ownerAcceptance).toBe("not-recorded");
  });

  it("requires journal inspection rather than proposing a duplicate write or unverified resume", () => {
    const status = evaluateReleaseStatus(release(), checked(), implementation(), {
      from: "release.json",
      recovery: [
        {
          runId: "run-123",
          operation: "design-release-assemble",
          state: "uncertain",
          inputsMatch: true,
          resumeEligible: false,
          reason: "Independent readback required",
        },
      ],
    });
    expect(status.step).toBe("repair");
    expect(status.nextActions[0]?.command).toBe("penpair runs 'run-123' --json");
    expect(status.nextActions.some((action) => action.command?.includes("--resume"))).toBe(false);
  });
});

it("quotes next-action paths literally when an agent executes the suggested command", () => {
  const file = "release'$(printf injected)' file.json";
  const status = evaluateReleaseStatus(release(), checked(), implementation(), {
    from: file,
  });
  const command = status.nextActions.find((action) => action.id === "assemble")!.command!;
  const actual = execFileSync(
    "sh",
    [
      "-c",
      `penpair() { printf '%s' "$4"; }; ${command}`,
    ],
    {
      encoding: "utf8",
    },
  );
  expect(actual).toBe(file);
});

it("identifies unapproved adopted members before proposing an assembly that would reject them", () => {
  const value = release();
  value.members![0]!.disposition = "adopted";
  delete value.members![0]!.approval;
  const status = evaluateReleaseStatus(value, checked(), implementation(), {
    from: "release.json",
  });
  expect(status.step).toBe("review");
  expect(status.nextActions).toContainEqual(
    expect.objectContaining({
      id: "supply-member-evidence",
      kind: "input-required",
      missingInputs: expect.arrayContaining([
        "login: actual owner approval record, record ID and original image",
      ]),
    }),
  );
  expect(status.nextActions.some((action) => action.id === "assemble")).toBe(false);
});

it("keeps historical journal diagnostics without blocking a separately live-verified finalized release", () => {
  const value = release();
  value.status = "final";
  const status = evaluateReleaseStatus(value, checked(true, true), implementation(), {
    recovery: [
      {
        runId: "old-failure",
        operation: "design-release-assemble",
        state: "failed",
        inputsMatch: false,
        resumeEligible: false,
        reconciled: true,
        reason: "Independently verified final marker supersedes old attempt",
      },
    ],
  });
  expect(status.step).toBe("handoff");
  expect(status.recovery).toHaveLength(1);
  expect(status.blockers).toEqual([]);
});
