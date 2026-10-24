import { observationHash } from "../journal.js";
import type { MapContract, MapProposal } from "./types.js";
import { hashMapContract, mapHash, mapObject, mapText, validateMapContract } from "./validation.js";

export function validateMapProposal(raw: unknown): MapProposal {
  const proposal = mapObject(raw, "Map proposal", [
    "schemaVersion",
    "kind",
    "baseHash",
    "proposedHash",
    "proposedMap",
    "reason",
    "hash",
  ]);
  if (proposal.schemaVersion !== 1 || proposal.kind !== "map-proposal") {
    throw new Error("Unsupported map proposal schema");
  }
  const result: MapProposal = {
    schemaVersion: 1,
    kind: "map-proposal",
    baseHash: mapHash(proposal.baseHash, "Proposal base hash"),
    proposedHash: mapHash(proposal.proposedHash, "Proposed map hash"),
    proposedMap: validateMapContract(proposal.proposedMap),
    reason: mapText(proposal.reason, "Proposal reason", 8000),
    hash: mapHash(proposal.hash, "Proposal record hash"),
  };
  const { hash, ...body } = result;
  if (
    hash !== observationHash(body) ||
    result.proposedHash !== hashMapContract(result.proposedMap)
  ) {
    throw new Error("Map proposal evidence hash mismatch");
  }
  return result;
}

export function createMapProposal(
  current: MapContract,
  proposed: MapContract,
  reason: string,
): MapProposal {
  const base = validateMapContract(current);
  const proposedMap = validateMapContract(proposed);
  if (base.kind !== proposedMap.kind || base.id !== proposedMap.id) {
    throw new Error("A proposal must preserve map identity and kind");
  }
  if (hashMapContract(base) === hashMapContract(proposedMap)) {
    throw new Error("A proposal requires a semantic contract change");
  }
  const body = {
    schemaVersion: 1 as const,
    kind: "map-proposal" as const,
    baseHash: hashMapContract(base),
    proposedHash: hashMapContract(proposedMap),
    proposedMap,
    reason,
  };
  return validateMapProposal({
    ...body,
    hash: observationHash(body),
  });
}

/** Accepting changes the canonical revision; it neither creates nor carries forward owner approval. */
export function acceptMapProposal(current: MapContract, raw: MapProposal): MapContract {
  const base = validateMapContract(current);
  const proposal = validateMapProposal(raw);
  if (
    hashMapContract(base) !== proposal.baseHash ||
    base.id !== proposal.proposedMap.id ||
    base.kind !== proposal.proposedMap.kind
  ) {
    throw new Error(
      "Map proposal is stale or belongs to another map; review against the current contract",
    );
  }
  if (proposal.proposedHash === proposal.baseHash) {
    throw new Error("A proposal must change the canonical revision before it can be accepted");
  }
  return structuredClone(proposal.proposedMap);
}
