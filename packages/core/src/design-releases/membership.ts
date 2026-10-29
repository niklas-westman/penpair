import { validateMemberApproval } from "./member-evidence.js";
import { observationHash } from "../journal.js";
import { readArtifact } from "./artifact-paths.js";
import { inspectionContentHash, decodedPixels } from "./fidelity.js";
import { readReleaseInspection, readReleaseContract, assertReleaseContracts } from "./store.js";
import { validateDesignRelease } from "./validation.js";
import { validateAdoptionPlan } from "./membership-validation.js";
import { readReleaseBundle, checkRelease, type ReleaseBundle } from "./check.js";
import type {
  DeltaDesignReleasePlanInput,
  DesignRelease,
  DesignReleaseAdoptionInput,
  ReleaseMember,
  ReleaseMemberInput,
  ReleaseOptions,
  ReleaseArtifactRef,
} from "./types.js";

/** Full frozen inventory; legacy source IDs remain stable during normalization. */
export function releaseMembers(release: DesignRelease): ReleaseMember[] {
  if (release.schemaVersion === 2) {
    return structuredClone(release.members ?? []);
  }
  return release.sources.map((source) => ({
    id: source.id,
    disposition: "changed",
    source: structuredClone(source),
  }));
}

async function pinMember(
  root: string,
  fileId: string,
  input: ReleaseMemberInput,
  disposition: "changed" | "adopted",
  options: ReleaseOptions,
): Promise<ReleaseMember> {
  const { approval, route, case: intent, comparisonThreshold, ...source } = input;
  const inspection = await readReleaseInspection(root, source.inspection);
  if (
    inspection.fileId !== fileId ||
    inspection.pageId !== source.pageId ||
    inspection.nodes?.[0]?.id !== source.frameId
  ) {
    throw new Error("Member inspection does not match the pinned file/page/frame");
  }
  if (options.redact && options.redact(JSON.stringify(inspection)) !== JSON.stringify(inspection)) {
    throw new Error("Protected data in member inspection");
  }
  if (source.render) {
    await decodedPixels(await readArtifact(root, source.render, 64 * 1024 * 1024));
  }
  if (source.dependencies) {
    await readArtifact(root, source.dependencies);
  }
  if (approval) {
    await readArtifact(root, approval.record);
    await readArtifact(root, approval.image, 64 * 1024 * 1024);
  }
  return {
    id: source.id,
    disposition,
    comparisonThreshold: comparisonThreshold ?? 0.05,
    source: {
      ...source,
      contentHash: inspectionContentHash(inspection),
    },
    ...(approval
      ? {
          approval,
        }
      : {}),
    ...(route
      ? {
          route,
        }
      : {}),
    ...(intent
      ? {
          case: intent,
        }
      : {}),
  };
}

type MembershipArtifactReader = (reference: ReleaseArtifactRef) => Promise<Buffer>;

async function inheritFinalizedMembers(
  base: DesignRelease,
  bundle: ReleaseBundle,
  baseBundle: ReleaseArtifactRef,
  artifact: MembershipArtifactReader,
): Promise<ReleaseMember[]> {
  const frozen = (reference: ReleaseArtifactRef): ReleaseArtifactRef => {
    const entry = bundle.artifacts.find(
      (item) => observationHash(item.original) === observationHash(reference),
    );
    if (!entry) {
      throw new Error("Base immutable bundle omits member evidence");
    }
    return entry.snapshot;
  };
  return Promise.all(
    releaseMembers(base).map(async (member) => {
      const receipt = base.receipts.find((entry) => entry.sourceId === member.id);
      const source =
        member.disposition === "changed"
          ? (() => {
              if (!receipt) {
                throw new Error("Finalized base omits a changed member copy receipt");
              }
              return {
                ...member.source,
                pageId: receipt.targetPageId,
                frameId: receipt.targetFrameId,
                inspection: receipt.targetInspection,
                render: receipt.targetRender,
                contentHash: receipt.targetContentHash,
              };
            })()
          : member.source;
      if (member.disposition === "changed") {
        const inspection = JSON.parse((await artifact(frozen(source.inspection))).toString("utf8"));
        source.contentHash = inspectionContentHash(inspection);
      }
      const approval = member.approval ?? receipt?.approval;
      return {
        ...member,
        disposition: "retained",
        source: {
          ...source,
          inspection: frozen(source.inspection),
          ...(source.render
            ? {
                render: frozen(source.render),
              }
            : {}),
          ...(source.dependencies
            ? {
                dependencies: frozen(source.dependencies),
              }
            : {}),
        },
        origin: member.origin ?? {
          releaseId: base.id,
          productVersion: base.productVersion,
          bundle: baseBundle,
        },
        ...(approval
          ? {
              approval: {
                ...approval,
                record: frozen(approval.record),
                image: frozen(approval.image),
              },
            }
          : {}),
      };
    }),
  );
}

async function inheritedMembers(
  root: string,
  input: DeltaDesignReleasePlanInput,
): Promise<ReleaseMember[]> {
  if (!input.base) {
    return [];
  }
  const base = validateDesignRelease(
    JSON.parse((await readArtifact(root, input.base.release)).toString("utf8")),
  );
  assertBaseIdentity(input, base);
  const checked = await checkRelease(undefined, root, base);
  if (!checked.valid) {
    throw new Error(`Base release evidence is invalid: ${checked.reasons.join("; ")}`);
  }
  const bundle = await readReleaseBundle(root, base);
  return inheritFinalizedMembers(base, bundle, input.base.bundle, (reference) =>
    readArtifact(root, reference, 64 * 1024 * 1024),
  );
}

function assertBaseIdentity(
  release: Pick<DesignRelease, "base" | "id" | "productVersion" | "fileId">,
  base: DesignRelease,
): void {
  if (
    base.status !== "final" ||
    !base.finalized ||
    !release.base ||
    observationHash(base.finalized.bundle) !== observationHash(release.base.bundle)
  ) {
    throw new Error("Base must name the exact finalized immutable release bundle");
  }
  if (
    base.id === release.id ||
    base.productVersion === release.productVersion ||
    base.fileId !== release.fileId
  ) {
    throw new Error("Base release must be a different release in the same pinned file");
  }
}

/** Recheck persisted lineage; a saved release must obey the same membership rules as planning. */
export async function validateReleaseMembership(
  root: string,
  raw: DesignRelease,
  artifact: MembershipArtifactReader = (reference) =>
    readArtifact(root, reference, 64 * 1024 * 1024),
): Promise<void> {
  await validateMembershipChain(root, validateDesignRelease(raw), artifact, new Set());
}

async function validateMembershipChain(
  root: string,
  release: DesignRelease,
  artifact: MembershipArtifactReader,
  ancestors: Set<string>,
): Promise<void> {
  if (release.schemaVersion !== 2) {
    return;
  }
  const members = releaseMembers(release);
  if (!release.base) {
    if (members.some((member) => member.disposition === "retained")) {
      throw new Error("Retained release membership requires an immediate pinned base");
    }
    if (release.changes?.replaced.length || release.changes?.removed.length) {
      throw new Error("Replacement/removal lineage requires an immediate pinned base");
    }
    if (
      members.some((member) => member.disposition === "adopted") &&
      (release.changes || members.some((member) => member.disposition !== "adopted"))
    ) {
      throw new Error("Adoption membership must form a standalone complete base");
    }
    if (members.some((member) => member.disposition === "changed") && !release.changes) {
      throw new Error("Changed release membership requires an explicit change ledger");
    }
    return;
  }
  if (!release.changes || members.some((member) => member.disposition === "adopted")) {
    throw new Error(
      "Inherited release membership requires explicit changes and cannot adopt members",
    );
  }
  const identity = release.base.bundle.sha256;
  if (ancestors.has(identity) || ancestors.size >= 100) {
    throw new Error("Cyclic or unbounded release inheritance");
  }
  const chain = new Set(ancestors);
  chain.add(identity);
  const base = validateDesignRelease(
    JSON.parse((await artifact(release.base.release)).toString("utf8")),
  );
  assertBaseIdentity(release, base);
  const bundle = await readReleaseBundle(root, base, artifact);
  const snapshots = new Map(
    bundle.artifacts.map((entry) => [
      `${entry.original.path}:${entry.original.sha256}`,
      entry.snapshot,
    ]),
  );
  const readBaseArtifact: MembershipArtifactReader = async (reference) => {
    const snapshot = snapshots.get(`${reference.path}:${reference.sha256}`);
    if (!snapshot) {
      throw new Error("Immediate base bundle omits required lineage evidence");
    }
    return readArtifact(root, snapshot, 64 * 1024 * 1024);
  };
  await validateMembershipChain(root, base, readBaseArtifact, chain);
  const inherited = await inheritFinalizedMembers(base, bundle, release.base.bundle, (reference) =>
    readArtifact(root, reference, 64 * 1024 * 1024),
  );
  const byId = new Map(
    members.map((member) => [
      member.id,
      member,
    ]),
  );
  const changed = (ids: string[]): ReleaseMember[] =>
    ids.map((id) => {
      const member = byId.get(id);
      if (!member || member.disposition !== "changed") {
        throw new Error("Release change ledger must select explicit changed members");
      }
      return member;
    });
  const expected = resolveReleaseMemberChanges(inherited, {
    add: changed(release.changes.added),
    replace: changed(release.changes.replaced),
    remove: release.changes.removed,
  });
  const normalized = (inventory: ReleaseMember[]): ReleaseMember[] =>
    [
      ...inventory,
    ].sort((first, second) => first.id.localeCompare(second.id));
  if (observationHash(normalized(expected)) !== observationHash(normalized(members))) {
    throw new Error(
      "Persisted release membership does not match its immediate predecessor and explicit changes",
    );
  }
}

async function draft(
  root: string,
  input: DeltaDesignReleasePlanInput | DesignReleaseAdoptionInput,
  members: ReleaseMember[],
  options: ReleaseOptions,
): Promise<DesignRelease> {
  const serialized = JSON.stringify(input);
  if (options.redact && options.redact(serialized) !== serialized) {
    throw new Error("Protected data in release evidence");
  }
  const contracts = await Promise.all(
    input.contracts.map(async (reference) => {
      const map = await readReleaseContract(root, reference);
      const serialized = JSON.stringify(map);
      if (options.redact && options.redact(serialized) !== serialized) {
        throw new Error("Protected data in release contract");
      }
      return {
        ...reference,
        kind: map.kind,
        id: map.id,
      };
    }),
  );
  await assertReleaseContracts(root, contracts, false, undefined, input.fileId);
  const release = validateDesignRelease({
    schemaVersion: 2,
    kind: "design-release",
    id: input.id,
    title: input.title,
    productVersion: input.productVersion,
    fileId: input.fileId,
    status: "planned",
    ...(input.kind === "design-release-plan" && input.base
      ? {
          base: input.base,
        }
      : {}),
    members,
    ...(input.kind === "design-release-plan"
      ? {
          changes: {
            added: input.changes.add.map((member) => member.id),
            replaced: input.changes.replace.map((member) => member.id),
            removed: input.changes.remove,
          },
        }
      : {}),
    sources: members
      .filter((member) => member.disposition === "changed")
      .map((member) => member.source),
    memberEvidence: [],
    contracts,
    target: {
      name: `release/${input.productVersion}`,
      ownerKey: observationHash({
        id: input.id,
        fileId: input.fileId,
        productVersion: input.productVersion,
      }),
    },
    maps: [],
    receipts: [],
    reviews: [],
    implementation: {
      status: "not-assessed",
      evidence: [],
    },
    createdAt: new Date().toISOString(),
  });
  for (const member of members) {
    if (member.disposition !== "changed" && member.approval) {
      await validateMemberApproval(root, release, member);
    }
  }
  return release;
}

export function resolveReleaseMemberChanges(
  inherited: ReleaseMember[],
  changes: {
    add: ReleaseMember[];
    replace: ReleaseMember[];
    remove: Array<{
      id: string;
      reason: string;
    }>;
  },
): ReleaseMember[] {
  const members = new Map(
    inherited.map((member) => [
      member.id,
      structuredClone(member),
    ]),
  );
  if (members.size !== inherited.length) {
    throw new Error("Duplicate inherited release member IDs");
  }
  const changedIds = [
    ...changes.add,
    ...changes.replace,
    ...changes.remove,
  ].map((entry) => entry.id);
  if (new Set(changedIds).size !== changedIds.length) {
    throw new Error("Conflicting release changes");
  }
  for (const removed of changes.remove) {
    if (!removed.reason.trim() || !members.delete(removed.id)) {
      throw new Error(`Cannot remove unknown release member ${removed.id} without a reason`);
    }
  }
  for (const source of changes.replace) {
    if (!members.has(source.id)) {
      throw new Error(`Cannot replace unknown release member ${source.id}`);
    }
    members.set(source.id, structuredClone(source));
  }
  for (const source of changes.add) {
    if (members.has(source.id)) {
      throw new Error(`Cannot add existing release member ${source.id}; use replace`);
    }
    members.set(source.id, structuredClone(source));
  }
  return [
    ...members.values(),
  ];
}

export async function planDeltaRelease(
  root: string,
  input: DeltaDesignReleasePlanInput,
  options: ReleaseOptions = {},
): Promise<DesignRelease> {
  const inherited = await inheritedMembers(root, input);
  const add = [];
  const replace = [];
  for (const source of input.changes.add) {
    add.push(await pinMember(root, input.fileId, source, "changed", options));
  }
  for (const source of input.changes.replace) {
    replace.push(await pinMember(root, input.fileId, source, "changed", options));
  }
  const members = resolveReleaseMemberChanges(inherited, {
    add,
    replace,
    remove: input.changes.remove,
  });
  return draft(root, input, members, options);
}

export async function adoptRelease(
  root: string,
  raw: unknown,
  options: ReleaseOptions = {},
): Promise<DesignRelease> {
  const input = validateAdoptionPlan(raw);
  const members = [];
  for (const source of input.screens) {
    members.push(await pinMember(root, input.fileId, source, "adopted", options));
  }
  return draft(root, input, members, options);
}
