import { validateBaselineCase } from "../baselines-config.js";
import { mapObject, mapId, mapText, mapHash } from "../maps/validation.js";
import { screen, contract, releaseHeader, releaseReference } from "./validation.js";
import type {
  DeltaDesignReleasePlanInput,
  DesignReleaseAdoptionInput,
  ReleaseBaseReference,
  ReleaseMember,
  ReleaseMemberApproval,
  ReleaseMemberInput,
  ReleaseMemberEvidence,
} from "./types.js";

function list(raw: unknown, label: string, nonempty = false): unknown[] {
  if (!Array.isArray(raw) || raw.length > 100 || (nonempty && !raw.length)) {
    throw new Error(`${label} requires ${nonempty ? "1–" : "0–"}100 entries`);
  }
  return raw;
}

function unique(values: string[], label: string): void {
  if (new Set(values).size !== values.length) {
    throw new Error(`Duplicate ${label}`);
  }
}

export function validateBaseReference(raw: unknown): ReleaseBaseReference {
  const value = mapObject(raw, "Pinned release base", [
    "release",
    "bundle",
  ]);
  return {
    release: releaseReference(value.release),
    bundle: releaseReference(value.bundle),
  };
}

export function validateReleaseApprovalReference(raw: unknown): ReleaseMemberApproval {
  const value = mapObject(raw, "Release member approval", [
    "record",
    "recordId",
    "image",
  ]);
  return {
    record: releaseReference(value.record),
    recordId: mapId(value.recordId, "Approval record ID"),
    image: releaseReference(value.image),
  };
}

function intent(
  value: Record<string, unknown>,
): Pick<ReleaseMemberInput, "route" | "case" | "approval" | "comparisonThreshold"> {
  if (
    value.comparisonThreshold !== undefined &&
    (typeof value.comparisonThreshold !== "number" ||
      !Number.isFinite(value.comparisonThreshold) ||
      value.comparisonThreshold < 0 ||
      value.comparisonThreshold > 1)
  ) {
    throw new Error("Release comparisonThreshold must be a finite ratio from 0 to 1");
  }
  if (value.case !== undefined) {
    validateBaselineCase(value.case, (message) => {
      throw new Error(message);
    });
    if (typeof value.route !== "string" || !value.route) {
      throw new Error("Release case requires an implementation route");
    }
  }
  return {
    comparisonThreshold:
      value.comparisonThreshold === undefined ? 0.05 : (value.comparisonThreshold as number),
    ...(value.route === undefined
      ? {}
      : {
          route: mapText(value.route, "Implementation route", 2000),
        }),
    ...(value.case === undefined
      ? {}
      : {
          case: structuredClone(value.case) as ReleaseMemberInput["case"],
        }),
    ...(value.approval === undefined
      ? {}
      : {
          approval: validateReleaseApprovalReference(value.approval),
        }),
  };
}

export function validateMemberInput(raw: unknown): ReleaseMemberInput {
  const value = mapObject(raw, "Release member input", [
    "id",
    "label",
    "pageId",
    "frameId",
    "inspection",
    "render",
    "dependencies",
    "route",
    "case",
    "approval",
    "comparisonThreshold",
  ]);
  const {
    comparisonThreshold: _comparisonThreshold,
    route: _route,
    case: _case,
    approval: _approval,
    ...source
  } = value;
  return {
    ...screen(source),
    ...intent(value),
  };
}

export function validateDeltaReleasePlan(raw: unknown): DeltaDesignReleasePlanInput {
  const value = mapObject(raw, "Delta release plan", [
    "schemaVersion",
    "kind",
    "id",
    "title",
    "productVersion",
    "fileId",
    "base",
    "changes",
    "contracts",
  ]);
  if (value.schemaVersion !== 2 || value.kind !== "design-release-plan") {
    throw new Error("Unsupported delta release plan");
  }
  const changes = mapObject(value.changes, "Release changes", [
    "add",
    "replace",
    "remove",
  ]);
  const add = list(changes.add, "Added members").map(validateMemberInput);
  const replace = list(changes.replace, "Replaced members").map(validateMemberInput);
  const remove = list(changes.remove, "Removed members").map((raw) => {
    const item = mapObject(raw, "Removed member", [
      "id",
      "reason",
    ]);
    return {
      id: mapId(item.id, "Removed member ID"),
      reason: mapText(item.reason, "Removal reason", 2000),
    };
  });
  unique(
    [
      ...add,
      ...replace,
      ...remove,
    ].map((item) => item.id),
    "release change IDs",
  );
  if (value.base === undefined && (replace.length || remove.length)) {
    throw new Error("Replacing or removing members requires a pinned finalized base");
  }
  const contracts = list(value.contracts, "Release contracts", true).map((entry) =>
    contract(entry),
  );
  unique(
    contracts.map((entry) => entry.path),
    "contract paths",
  );
  return {
    schemaVersion: 2,
    kind: "design-release-plan",
    ...releaseHeader(value),
    ...(value.base === undefined
      ? {}
      : {
          base: validateBaseReference(value.base),
        }),
    changes: {
      add,
      replace,
      remove,
    },
    contracts,
  };
}

export function validateAdoptionPlan(raw: unknown): DesignReleaseAdoptionInput {
  const value = mapObject(raw, "Release adoption", [
    "schemaVersion",
    "kind",
    "id",
    "title",
    "productVersion",
    "fileId",
    "screens",
    "contracts",
  ]);
  if (value.schemaVersion !== 2 || value.kind !== "design-release-adoption") {
    throw new Error("Unsupported release adoption plan");
  }
  const screens = list(value.screens, "Adopted members", true).map(validateMemberInput);
  unique(
    screens.map((entry) => entry.id),
    "adopted member IDs",
  );
  return {
    schemaVersion: 2,
    kind: "design-release-adoption",
    ...releaseHeader(value),
    screens,
    contracts: list(value.contracts, "Release contracts", true).map((entry) => contract(entry)),
  };
}

export function validateReleaseMembers(raw: unknown): ReleaseMember[] {
  const members = list(raw, "Resolved release members", true).map((raw) => {
    const value = mapObject(raw, "Resolved release member", [
      "id",
      "disposition",
      "source",
      "origin",
      "route",
      "case",
      "approval",
      "comparisonThreshold",
    ]);
    if (
      ![
        "changed",
        "retained",
        "adopted",
      ].includes(String(value.disposition))
    ) {
      throw new Error("Unsupported release member disposition");
    }
    const source = mapObject(value.source, "Resolved member source", [
      "id",
      "label",
      "pageId",
      "frameId",
      "inspection",
      "render",
      "dependencies",
      "contentHash",
    ]);
    const member: ReleaseMember = {
      id: mapId(value.id, "Member ID"),
      disposition: value.disposition as ReleaseMember["disposition"],
      source: {
        ...screen(source, false),
        contentHash: mapHash(source.contentHash, "Member content hash"),
      },
      ...intent(value),
    };
    if (member.id !== member.source.id) {
      throw new Error("Member and source identity differ");
    }
    if (value.origin !== undefined) {
      const origin = mapObject(value.origin, "Member origin", [
        "releaseId",
        "productVersion",
        "bundle",
      ]);
      member.origin = {
        releaseId: mapId(origin.releaseId, "Origin release ID"),
        productVersion: mapText(origin.productVersion, "Origin product version", 100),
        bundle: releaseReference(origin.bundle),
      };
    }
    if ((member.disposition === "retained") !== Boolean(member.origin)) {
      throw new Error("Only retained members require a pinned historical origin");
    }
    return member;
  });
  unique(
    members.map((member) => member.id),
    "resolved member IDs",
  );
  unique(
    members.map((member) => member.source.frameId),
    "resolved member frame IDs",
  );
  return members;
}

export function validateMemberEvidence(raw: unknown): ReleaseMemberEvidence[] {
  const evidence = list(raw, "Member continuity evidence").map((raw) => {
    const value = mapObject(raw, "Member continuity evidence", [
      "id",
      "inspection",
      "render",
      "contentHash",
      "decodedPixelsHash",
      "width",
      "height",
    ]);
    if (
      !Number.isInteger(value.width) ||
      Number(value.width) < 1 ||
      !Number.isInteger(value.height) ||
      Number(value.height) < 1
    ) {
      throw new Error("Continuity evidence requires exact image dimensions");
    }
    return {
      id: mapId(value.id, "Evidence member ID"),
      inspection: releaseReference(value.inspection),
      render: releaseReference(value.render),
      contentHash: mapHash(value.contentHash, "Evidence content hash"),
      decodedPixelsHash: mapHash(value.decodedPixelsHash, "Evidence pixel hash"),
      width: Number(value.width),
      height: Number(value.height),
    };
  });
  unique(
    evidence.map((item) => item.id),
    "member evidence IDs",
  );
  return evidence;
}
