import type { DesignRelease, ReleaseCheck } from "./types.js";
import type {
  ReleaseImplementationStatus,
  ReleaseNextAction,
  ReleaseRecovery,
  ReleaseStatus,
} from "./status-types.js";

export function releaseCaseIds(release: DesignRelease): string[] {
  if (release.schemaVersion === 2) {
    return (release.members ?? []).filter((member) => member.route).map((member) => member.id);
  }

  return [];
}

function shellArgument(value: string): string {
  return "'" + value.replace(/'/g, "'\\''") + "'";
}

/** A recorded phase never substitutes for validated evidence or a live observation. */
export function evaluateReleaseStatus(
  release: DesignRelease,
  checked: ReleaseCheck,
  implementation: ReleaseImplementationStatus,
  options: {
    from?: string;
    recovery?: ReleaseRecovery[];
    checkedAt?: string;
  } = {},
): ReleaseStatus {
  const members = release.members;
  const inventory = {
    total: members?.length ?? release.sources.length,
    changed:
      members?.filter((member) => member.disposition === "changed").length ??
      release.sources.length,
    retained: members?.filter((member) => member.disposition === "retained").length ?? 0,
    adopted: members?.filter((member) => member.disposition === "adopted").length ?? 0,
    copied: release.receipts.length,
  };
  const assembled = Boolean(
    release.target.pageId &&
      release.target.overviewFrameId &&
      release.overview &&
      release.maps.length === release.contracts.length,
  );
  const recovery = options.recovery ?? [];
  const blockers = [
    ...checked.reasons,
  ];
  const completed = [
    "inventory-planned",
  ];
  const nextActions: ReleaseNextAction[] = [];
  const sourceFlag = options.from ? ` --from ${shellArgument(options.from)}` : undefined;
  const action = (
    id: string,
    kind: ReleaseNextAction["kind"],
    reason: string,
    suffix = "",
  ): void => {
    nextActions.push({
      id,
      kind: sourceFlag ? kind : "input-required",
      ...(sourceFlag
        ? {
            command: `penpair design-release ${id}${sourceFlag}${suffix}`,
          }
        : {
            missingInputs: [
              "release record path (--from)",
            ],
          }),
      reason,
    });
  };
  const missingMemberEvidence = (members ?? []).filter(
    (member) => member.disposition !== "changed" && (!member.approval || !member.source.render),
  );
  let step: ReleaseStatus["step"];

  if (assembled) {
    completed.push("native-assembly-recorded");
  }
  if (release.fidelity && checked.valid) {
    completed.push("native-evidence-validated");
  }
  if (checked.live && checked.valid) {
    completed.push("live-penpot-verified");
  }
  if (release.status === "final" && checked.valid) {
    completed.push("design-finalized");
  }

  const unresolvedRecovery = recovery.filter((journal) => !journal.reconciled);
  if (unresolvedRecovery.length) {
    step = "repair";
    blockers.push(
      "Interrupted release operations require journal inspection and independent readback before another write",
    );
    for (const journal of unresolvedRecovery) {
      nextActions.push({
        id: "inspect-journal",
        kind: "read-only",
        command: `penpair runs ${shellArgument(journal.runId)} --json`,
        reason: journal.reason,
      });
    }
  } else if (release.status === "final") {
    if (!checked.valid) {
      step = "repair";
      action("check", "read-only", "Inspect drift without replacing finalized evidence", " --live");
    } else {
      step =
        implementation.comparison === "passed"
          ? "implementation-review"
          : implementation.comparison !== "not-assessed" ||
              implementation.recorded !== "not-assessed"
            ? "implementation-verify"
            : "handoff";
      action(
        "context",
        "read-only",
        "Use the exact finalized inventory for implementation and browser verification",
      );
      if (step === "implementation-verify") {
        nextActions.push({
          id: "compare-implementation",
          kind: "input-required",
          missingInputs: [
            "a complete current implementation comparison report for this exact release",
          ],
          reason:
            "Use the installed browser-verification skill with the frozen inventory and policy; assess its report with --comparison FILE",
        });
      }
    }
  } else if (missingMemberEvidence.length) {
    step = "review";
    for (const member of missingMemberEvidence) {
      blockers.push(
        `Member ${member.id} needs pinned render and authentic owner approval before native assembly`,
      );
      nextActions.push({
        id: "supply-member-evidence",
        kind: "input-required",
        missingInputs: [
          ...(!member.source.render
            ? [
                `${member.id}: pinned source render`,
              ]
            : []),
          ...(!member.approval
            ? [
                `${member.id}: actual owner approval record, record ID and original image`,
              ]
            : []),
          "updated adoption or release plan with these exact references",
        ],
        reason:
          "Recover authentic historical evidence or collect fresh exact-artifact approval, then re-adopt/re-plan the draft; never invent earlier approval",
      });
    }
  } else if (!assembled) {
    step = "assemble";
    action(
      "assemble",
      "write-preview",
      "Preview changed-frame destinations, retained links and required native maps",
    );
  } else if (!release.fidelity || release.receipts.length !== inventory.changed) {
    step = "verify";
    if (inventory.changed && !release.receipts.length) {
      nextActions.push({
        id: "refresh-overview",
        kind: "input-required",
        missingInputs: [
          "actual native copy target IDs in the receipt file",
        ],
        reason:
          "After copying changed frames, preview and apply assemble --receipts FILE to link actual destinations before verify; verification does not edit Penpot",
      });
    }
    nextActions.push({
      id: "verify",
      kind: "input-required",
      missingInputs: inventory.changed
        ? [
            "reviewed source-to-target receipt file, including target approvals where required",
          ]
        : [],
      ...(sourceFlag && !inventory.changed
        ? {
            command: `penpair design-release verify${sourceFlag}`,
          }
        : {}),
      reason:
        "Collect complete native fidelity and retained-source continuity; verify never supplies owner approval",
    });
  } else if (!checked.valid) {
    step = "review";
    action(
      "check",
      "read-only",
      "Resolve missing approval or invalid saved evidence before finalization",
    );
  } else {
    step = "finalize";
    action(
      "finalize",
      "write-preview",
      "Preview the exact verified design hash; finalization still requires current live verification and supplied owner words",
    );
    nextActions.push({
      id: "owner-review",
      kind: "approval-required",
      missingInputs: [
        "owner identity",
        "owner's exact words for this design hash",
      ],
      reason: "Record real approval only after the owner reviews this exact candidate",
    });
  }

  if (!checked.live) {
    action(
      "check",
      "read-only",
      "Saved evidence cannot establish current Penpot freshness",
      " --live",
    );
  }

  return {
    schemaVersion: 1,
    kind: "design-release-status",
    id: release.id,
    productVersion: release.productVersion,
    designHash: checked.designHash,
    recordedState: release.status,
    step,
    design: {
      valid: checked.valid,
      finalized: release.status === "final",
      ready: checked.valid && release.status === "final",
    },
    freshness: {
      scope: checked.live ? "live-penpot" : "saved-evidence",
      verified: checked.live && checked.valid,
      checkedAt: options.checkedAt ?? new Date().toISOString(),
      ...(!checked.live
        ? {
            limitation:
              "Saved evidence only; current Penpot content and browser implementation were not observed",
          }
        : {}),
    },
    inventory,
    completed,
    blockers,
    implementation,
    recovery,
    nextActions,
  };
}
