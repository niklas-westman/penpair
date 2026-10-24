import path from "node:path";
import { observationHash } from "../journal.js";
import type {
  MapContract,
  MapEdge,
  MapFinding,
  MapNode,
  MapOrigin,
  MapRequirement,
  MapSource,
} from "./types.js";

export const maxMapBytes = 16 * 1024 * 1024;

export function mapObject(value: unknown, label: string, keys: string[]): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`${label} must be an object`);
  }

  const object = value as Record<string, unknown>;
  if (Object.keys(object).some((key) => !keys.includes(key))) {
    throw new Error(`${label} contains an unsupported field`);
  }
  return object;
}

export function mapText(value: unknown, label: string, maxLength = 2000): string {
  if (
    typeof value !== "string" ||
    !value.trim() ||
    value.length > maxLength ||
    value.includes("\0")
  ) {
    throw new Error(`${label} requires nonempty text of at most ${maxLength} characters`);
  }
  return value;
}

export function mapId(value: unknown, label: string): string {
  if (typeof value !== "string" || !/^[a-zA-Z0-9][a-zA-Z0-9._:-]{0,127}$/.test(value)) {
    throw new Error(`${label} requires a stable logical ID`);
  }
  return value;
}

export function mapHash(value: unknown, label: string): string {
  if (typeof value !== "string" || !/^[a-f0-9]{64}$/.test(value)) {
    throw new Error(`${label} requires a SHA-256 hash`);
  }
  return value;
}

export function mapPath(value: unknown, label: string): string {
  const entry = mapText(value, label, 2000);
  if (path.isAbsolute(entry) || /^[a-zA-Z]:/.test(entry) || entry.split(/[\\/]/).includes("..")) {
    throw new Error(`${label} must stay inside the project`);
  }
  return entry;
}

function mapOrigin(value: unknown): MapOrigin {
  if (
    value !== "observed" &&
    value !== "proposed" &&
    value !== "owner-decision" &&
    value !== "unknown"
  ) {
    throw new Error("Map origin must distinguish observed, proposed, owner-decision or unknown");
  }
  return value;
}

function mapList(value: unknown, label: string, maximum: number): unknown[] {
  if (!Array.isArray(value) || value.length > maximum) {
    throw new Error(`${label} must contain at most ${maximum} entries`);
  }
  return value;
}

function references(value: unknown, label: string): string[] | undefined {
  if (value === undefined) {
    return undefined;
  }
  const entries = mapList(value, label, 1000).map((entry) => mapId(entry, label));
  if (new Set(entries).size !== entries.length) {
    throw new Error(`${label} contains duplicate references`);
  }
  return entries.sort();
}

function optionalReferences(
  object: Record<string, unknown>,
  key: string,
): Record<string, string[]> {
  const value = references(object[key], key);
  return value === undefined
    ? {}
    : {
        [key]: value,
      };
}

function validateSource(raw: unknown): MapSource {
  const source = mapObject(raw, "Map source", [
    "id",
    "kind",
    "sha256",
    "path",
    "fileId",
    "pageId",
    "frameId",
    "revision",
  ]);
  if (
    typeof source.kind !== "string" ||
    ![
      "inspection",
      "baseline",
      "code",
      "contract",
      "other",
    ].includes(source.kind)
  ) {
    throw new Error("Unsupported map source kind");
  }
  const result: MapSource = {
    id: mapId(source.id, "Source ID"),
    kind: source.kind as MapSource["kind"],
    sha256: mapHash(source.sha256, "Source hash"),
  };
  if (source.path !== undefined) {
    result.path = mapPath(source.path, "Source path");
  }
  for (const key of [
    "fileId",
    "pageId",
    "frameId",
  ] as const) {
    if (source[key] !== undefined) {
      result[key] = mapText(source[key], key, 200);
    }
  }
  if (source.revision !== undefined) {
    if (!Number.isSafeInteger(source.revision) || Number(source.revision) < 0) {
      throw new Error("Source revision must be a nonnegative safe integer");
    }
    result.revision = Number(source.revision);
  }
  return result;
}

function validateNode(raw: unknown): MapNode {
  const node = mapObject(raw, "Map node", [
    "id",
    "label",
    "kind",
    "origin",
    "requirementIds",
    "sourceIds",
  ]);
  return {
    id: mapId(node.id, "Node ID"),
    label: mapText(node.label, "Node label"),
    kind: mapId(node.kind, "Node kind"),
    origin: mapOrigin(node.origin),
    ...optionalReferences(node, "requirementIds"),
    ...optionalReferences(node, "sourceIds"),
  };
}

function validateEdge(raw: unknown): MapEdge {
  const edge = mapObject(raw, "Map edge", [
    "id",
    "from",
    "to",
    "label",
    "origin",
    "requirementIds",
  ]);
  return {
    id: mapId(edge.id, "Edge ID"),
    from: mapId(edge.from, "Edge source"),
    to: mapId(edge.to, "Edge target"),
    label: mapText(edge.label, "Edge label"),
    origin: mapOrigin(edge.origin),
    ...optionalReferences(edge, "requirementIds"),
  };
}

function validateRequirement(raw: unknown): MapRequirement {
  const requirement = mapObject(raw, "Map requirement", [
    "id",
    "text",
    "origin",
    "sourceIds",
  ]);
  return {
    id: mapId(requirement.id, "Requirement ID"),
    text: mapText(requirement.text, "Requirement text", 8000),
    origin: mapOrigin(requirement.origin),
    ...optionalReferences(requirement, "sourceIds"),
  };
}

function validateFinding(raw: unknown): MapFinding {
  const finding = mapObject(raw, "Map finding", [
    "id",
    "message",
    "severity",
    "status",
    "resolution",
  ]);
  if (
    typeof finding.severity !== "string" ||
    ![
      "blocking",
      "warning",
      "info",
    ].includes(finding.severity) ||
    (finding.status !== "open" && finding.status !== "resolved")
  ) {
    throw new Error("Map findings require explicit severity and open/resolved status");
  }
  const result: MapFinding = {
    id: mapId(finding.id, "Finding ID"),
    message: mapText(finding.message, "Finding message", 8000),
    severity: finding.severity as MapFinding["severity"],
    status: finding.status,
  };
  if (finding.resolution !== undefined) {
    result.resolution = mapText(finding.resolution, "Finding resolution", 8000);
  }
  if (result.status === "resolved" && !result.resolution) {
    throw new Error("A resolved finding requires an explicit resolution");
  }
  return result;
}

function uniqueSorted<
  T extends {
    id: string;
  },
>(entries: T[], label: string): T[] {
  if (new Set(entries.map((entry) => entry.id)).size !== entries.length) {
    throw new Error(`Duplicate ${label} ID`);
  }
  return entries.sort((left, right) => (left.id < right.id ? -1 : left.id > right.id ? 1 : 0));
}

function validateReferences(contract: MapContract): void {
  const nodeIds = new Set(contract.nodes.map((node) => node.id));
  const sourceIds = new Set(contract.sources.map((source) => source.id));
  const requirementIds = new Set(contract.requirements.map((requirement) => requirement.id));
  for (const edge of contract.edges) {
    if (!nodeIds.has(edge.from) || !nodeIds.has(edge.to)) {
      throw new Error(`Edge ${edge.id} refers to a missing node`);
    }
  }
  for (const item of [
    ...contract.nodes,
    ...contract.edges,
  ]) {
    if ((item.requirementIds ?? []).some((id) => !requirementIds.has(id))) {
      throw new Error(`${item.id} refers to a missing requirement`);
    }
  }
  for (const item of [
    ...contract.nodes,
    ...contract.requirements,
  ]) {
    if ((item.sourceIds ?? []).some((id) => !sourceIds.has(id))) {
      throw new Error(`${item.id} refers to a missing source`);
    }
    if (item.origin === "observed" && !item.sourceIds?.length) {
      throw new Error(`Observed ${item.id} requires an explicit source reference`);
    }
  }
  const details = contract.nodes.filter((node) => node.kind === "detail-link");
  if (details.length > 64) {
    throw new Error("A map supports at most 64 explicit direct detail links");
  }
  for (const node of details) {
    const source = contract.sources.find((entry) => entry.id === node.sourceIds?.[0]);
    if (
      node.sourceIds?.length !== 1 ||
      !node.requirementIds?.length ||
      !source ||
      source.kind !== "contract" ||
      !source.path ||
      !source.fileId ||
      !source.pageId ||
      !source.frameId
    ) {
      throw new Error(
        "Detail links require one contract source with path, raw SHA, file/page/frame IDs and explicit mapped requirements",
      );
    }
  }
  if (
    details.length &&
    new Set(
      contract.sources.flatMap((source) =>
        source.fileId
          ? [
              source.fileId,
            ]
          : [],
      ),
    ).size > 1
  ) {
    throw new Error("Linked native detail boards must belong to the same pinned file");
  }
}

export function validateMapContract(raw: unknown): MapContract {
  const encoded = JSON.stringify(raw);
  if (!encoded || Buffer.byteLength(encoded) > maxMapBytes) {
    throw new Error("Map contract exceeds the 16 MiB byte budget");
  }
  const object = mapObject(raw, "Map contract", [
    "schemaVersion",
    "kind",
    "id",
    "title",
    "goal",
    "sources",
    "nodes",
    "edges",
    "requirements",
    "findings",
    "journey",
    "presentation",
  ]);
  if (
    object.schemaVersion !== 1 ||
    (object.kind !== "journey-map" && object.kind !== "integration-map")
  ) {
    throw new Error("Unsupported map schema or kind");
  }
  const contract: MapContract = {
    schemaVersion: 1,
    kind: object.kind,
    id: mapId(object.id, "Map ID"),
    title: mapText(object.title, "Map title", 200),
    goal: mapText(object.goal, "Map goal", 8000),
    sources: uniqueSorted(
      mapList(object.sources, "Map sources", 1000).map(validateSource),
      "source",
    ),
    nodes: uniqueSorted(mapList(object.nodes, "Map nodes", 1000).map(validateNode), "node"),
    edges: uniqueSorted(mapList(object.edges, "Map edges", 2000).map(validateEdge), "edge"),
    requirements: uniqueSorted(
      mapList(object.requirements, "Map requirements", 1000).map(validateRequirement),
      "requirement",
    ),
    findings: uniqueSorted(
      mapList(object.findings, "Map findings", 2000).map(validateFinding),
      "finding",
    ),
  };
  if (!contract.nodes.length) {
    throw new Error("A map requires at least one explicit node");
  }
  if (object.journey !== undefined) {
    if (contract.kind !== "integration-map") {
      throw new Error("Only an integration map may reference a journey contract");
    }
    const journey = mapObject(object.journey, "Journey reference", [
      "path",
      "sha256",
    ]);
    contract.journey = {
      path: mapPath(journey.path, "Journey path"),
      sha256: mapHash(journey.sha256, "Journey hash"),
    };
  }
  if (object.presentation !== undefined) {
    const presentation = mapObject(object.presentation, "Map presentation", [
      "fontFamily",
    ]);
    contract.presentation = {
      fontFamily: mapText(presentation.fontFamily, "Map font", 200),
    };
  }
  validateReferences(contract);
  return contract;
}

export function hashMapContract(raw: unknown): string {
  return observationHash(validateMapContract(raw));
}

export function validateMapDetail(
  parent: Pick<MapContract, "kind" | "id" | "sources">,
  node: Pick<MapNode, "id" | "sourceIds" | "requirementIds">,
  raw: unknown,
): MapContract {
  const detail = validateMapContract(raw);
  if (detail.kind !== parent.kind || detail.id === parent.id) {
    throw new Error("A detail must reference a different contract of the same map kind");
  }
  const required = new Set(detail.requirements.map((requirement) => requirement.id));
  if ((node.requirementIds ?? []).some((id) => !required.has(id))) {
    throw new Error(`Linked detail omits a requirement assigned to ${node.id}`);
  }
  const source = parent.sources.find((entry) => entry.id === node.sourceIds?.[0]);
  if (source && detail.sources.some((entry) => entry.fileId && entry.fileId !== source.fileId)) {
    throw new Error("Linked detail sources belong to a different pinned native file");
  }
  return detail;
}
