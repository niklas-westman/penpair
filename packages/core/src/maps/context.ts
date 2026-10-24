import { findArtifactReview } from "./review.js";
import type { ArtifactReview, MapContext, MapContract, MapDetailContext } from "./types.js";
import { hashMapContract, validateMapContract, validateMapDetail } from "./validation.js";

export interface MapContextOptions {
  reviews?: ArtifactReview[];
  sourceHashes?: Record<string, string>;
  journeyHash?: string;
  journeyRequirementIds?: string[];
  detailMaps?: Record<string, MapContract>;
  detailReadiness?: Record<string, boolean>;
  reviewEvidenceValid?: boolean;
  maxItems?: number;
  maxBytes?: number;
}

export function buildMapContext(raw: MapContract, options: MapContextOptions = {}): MapContext {
  const contract = validateMapContract(raw);
  const mapHash = hashMapContract(contract);
  const maxItems = options.maxItems ?? 100;
  const maxBytes = options.maxBytes ?? 128 * 1024;
  if (
    !Number.isInteger(maxItems) ||
    maxItems < 1 ||
    maxItems > 1000 ||
    !Number.isInteger(maxBytes) ||
    maxBytes < 4096 ||
    maxBytes > 1024 * 1024
  ) {
    throw new Error("Map context requires 1–1000 items and a 4 KiB–1 MiB byte budget");
  }
  const reviewed =
    !!findArtifactReview(options.reviews ?? [], contract.kind, contract.id, mapHash) &&
    options.reviewEvidenceValid !== false;
  const staleSources = contract.sources.filter(
    (source) =>
      options.sourceHashes &&
      Object.hasOwn(options.sourceHashes, source.id) &&
      options.sourceHashes[source.id] !== source.sha256,
  );
  const unknownSources = contract.sources.filter(
    (source) => !options.sourceHashes || !Object.hasOwn(options.sourceHashes, source.id),
  );
  const staleJourney =
    !!contract.journey &&
    options.journeyHash !== undefined &&
    options.journeyHash !== contract.journey.sha256;
  const missingJourney = contract.kind === "integration-map" && !contract.journey;
  const unknownJourney =
    !!contract.journey &&
    (options.journeyHash === undefined || options.journeyRequirementIds === undefined);
  const mappedRequirements = new Set(
    [
      ...contract.nodes,
      ...contract.edges,
    ].flatMap((entry) => entry.requirementIds ?? []),
  );
  const unmappedRequirements = contract.requirements.filter(
    (requirement) => !mappedRequirements.has(requirement.id),
  );
  const requirementIds = new Set(contract.requirements.map((requirement) => requirement.id));
  const missingJourneyRequirements =
    contract.kind === "integration-map"
      ? (options.journeyRequirementIds ?? []).filter((id) => !requirementIds.has(id))
      : [];
  const details: MapDetailContext[] = contract.nodes
    .filter((node) => node.kind === "detail-link")
    .map((node) => {
      const source = contract.sources.find((entry) => entry.id === node.sourceIds![0])!;
      const supplied = options.detailMaps?.[source.id];
      const child = supplied ? validateMapDetail(contract, node, supplied) : undefined;
      return {
        nodeId: node.id,
        sourceId: source.id,
        path: source.path!,
        sha256: source.sha256,
        fileId: source.fileId!,
        pageId: source.pageId!,
        frameId: source.frameId!,
        ...(child
          ? {
              mapId: child.id,
              mapHash: hashMapContract(child),
            }
          : {}),
        ready: !!child && options.detailReadiness?.[source.id] === true,
        review: "separate-artifact",
        contents: "not-inlined",
      };
    });
  const unreadyDetails = details.filter((detail) => !detail.ready);
  const blockers = contract.findings.filter(
    (finding) => finding.severity === "blocking" && finding.status === "open",
  );
  const unknowns = [
    ...contract.nodes,
    ...contract.edges,
    ...contract.requirements,
  ].filter((entry) => entry.origin === "unknown");
  const freshness =
    staleSources.length || staleJourney
      ? "stale"
      : unknownSources.length || unknownJourney
        ? "unassessed"
        : "matches-supplied-inputs";
  const reasons: string[] = [];
  if (!reviewed) {
    reasons.push("Exact current contract owner review is missing or its evidence is invalid");
  }
  if (staleSources.length) {
    reasons.push(
      `${staleSources.length} changed source(s): ${staleSources
        .slice(0, 5)
        .map((source) => source.id)
        .join(", ")}`,
    );
  }
  if (unknownSources.length || unknownJourney) {
    reasons.push("Source freshness is unassessed for one or more declared references");
  }
  if (staleJourney || missingJourney) {
    reasons.push(
      staleJourney
        ? "Referenced journey contract changed"
        : "Integration map requires an explicit journey contract reference",
    );
  }
  if (blockers.length) {
    reasons.push(
      `${blockers.length} unresolved blocking finding(s): ${blockers
        .slice(0, 5)
        .map((finding) => finding.id)
        .join(", ")}`,
    );
  }
  if (unknowns.length) {
    reasons.push(`${unknowns.length} unresolved unknown semantic element(s)`);
  }
  if (unmappedRequirements.length) {
    reasons.push(
      `${unmappedRequirements.length} unmapped local requirement(s): ${unmappedRequirements
        .slice(0, 5)
        .map((requirement) => requirement.id)
        .join(", ")}`,
    );
  }
  if (missingJourneyRequirements.length) {
    reasons.push(
      `${missingJourneyRequirements.length} omitted journey requirement(s): ${missingJourneyRequirements.slice(0, 5).join(", ")}`,
    );
  }
  if (unreadyDetails.length) {
    reasons.push(
      `${unreadyDetails.length} linked detail contract(s) require separate source/readiness/review checks; contents are not inlined`,
    );
  }
  const context: MapContext = {
    schemaVersion: 1,
    kind: "map-context",
    mapKind: contract.kind,
    mapId: contract.id,
    mapHash,
    title: contract.title,
    goal: contract.goal,
    reviewed,
    ready:
      reviewed &&
      freshness === "matches-supplied-inputs" &&
      !missingJourney &&
      !blockers.length &&
      !unknowns.length &&
      !unmappedRequirements.length &&
      !missingJourneyRequirements.length &&
      !unreadyDetails.length,
    freshness,
    reasons,
    nodes: contract.nodes.slice(0, maxItems),
    edges: contract.edges.slice(0, maxItems),
    requirements: contract.requirements.slice(0, maxItems),
    findings: [
      ...blockers,
      ...contract.findings.filter((finding) => !blockers.includes(finding)),
    ].slice(0, maxItems),
    sources: contract.sources.slice(0, maxItems),
    details: details.slice(0, maxItems),
    truncated: [
      contract.nodes,
      contract.edges,
      contract.requirements,
      contract.findings,
      contract.sources,
      details,
    ].some((entries) => entries.length > maxItems),
    implementation: "not-assessed",
  };
  const collections = [
    "nodes",
    "edges",
    "requirements",
    "findings",
    "sources",
    "details",
  ] as const;
  const markTruncated = () => {
    context.truncated = true;
    context.ready = false;
    const reason = "Context is truncated; inspect the complete contract before deciding readiness";
    if (!context.reasons.includes(reason)) {
      context.reasons.push(reason);
    }
  };
  if (context.truncated) {
    markTruncated();
  }
  while (true) {
    const visibleNodes = new Set(context.nodes.map((node) => node.id));
    const visibleEdges = context.edges.filter(
      (edge) => visibleNodes.has(edge.from) && visibleNodes.has(edge.to),
    );
    if (visibleEdges.length !== context.edges.length) {
      markTruncated();
      context.edges = visibleEdges;
    }
    if (Buffer.byteLength(JSON.stringify(context)) <= maxBytes) {
      break;
    }
    markTruncated();
    const largest = collections.reduce((previous, key) =>
      JSON.stringify(context[key]).length > JSON.stringify(context[previous]).length
        ? key
        : previous,
    );
    if (!context[largest].length) {
      context.goal = context.goal.slice(0, Math.floor(context.goal.length / 2));
    } else {
      context[largest].splice(Math.floor(context[largest].length / 2));
    }
  }
  return context;
}
