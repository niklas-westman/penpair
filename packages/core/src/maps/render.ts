import { designDataBlock } from "../project-input.js";
import {
  mapDrawingGeometryProblems,
  mapLabelHeight,
  mapNodeLayers,
  routeMapEdges,
} from "./layout.js";
import type { MapContract, MapDrawingPlan, MapDetailTarget } from "./types.js";
import { hashMapContract, validateMapContract, validateMapDetail } from "./validation.js";

function mermaidLabel(value: string): string {
  return Array.from(value)
    .map((character) =>
      /^[a-zA-Z0-9 .,_-]$/.test(character) ? character : `#${character.codePointAt(0)};`,
    )
    .join("");
}

function tableText(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll("|", "&#124;")
    .replace(/[\\`*_[\]#!~]/g, (character) => `\\${character}`)
    .replace(/[\r\n]+/g, " / ")
    .replace(
      /[\u2028\u2029\u202a-\u202e\u2066-\u2069]/g,
      (character) => `\\u${character.charCodeAt(0).toString(16).padStart(4, "0")}`,
    );
}

function reviewTables(contract: MapContract): string {
  const nodes = [
    "## Regions and responsibilities",
    "",
    "| ID | Kind | Origin | Label | Requirements |",
    "| --- | --- | --- | --- | --- |",
    ...contract.nodes.map(
      (node) =>
        `| ${tableText(node.id)} | ${tableText(node.kind)} | ${node.origin} | ${tableText(node.label)} | ${tableText((node.requirementIds ?? []).join(", "))} |`,
    ),
  ];
  const requirements = [
    "## Requirements",
    "",
    "| ID | Origin | Declared requirement |",
    "| --- | --- | --- |",
    ...contract.requirements.map(
      (requirement) =>
        `| ${tableText(requirement.id)} | ${requirement.origin} | ${tableText(requirement.text)} |`,
    ),
  ];
  const findings = [
    "## Findings and decisions",
    "",
    "| ID | Severity | Status | Finding | Resolution |",
    "| --- | --- | --- | --- | --- |",
    ...contract.findings.map(
      (finding) =>
        `| ${tableText(finding.id)} | ${finding.severity} | ${finding.status} | ${tableText(finding.message)} | ${tableText(finding.resolution ?? "Pending")} |`,
    ),
  ];
  const detailRows = contract.nodes
    .filter((node) => node.kind === "detail-link")
    .map((node) => {
      const source = contract.sources.find((entry) => entry.id === node.sourceIds![0])!;
      const target = `./${source
        .path!.split("/")
        .map((segment) =>
          encodeURIComponent(segment).replace(
            /[()]/g,
            (character) => `%${character.charCodeAt(0).toString(16)}`,
          ),
        )
        .join("/")}`;
      return `| ${tableText(node.id)} | [${tableText(source.path!)}](<${target}>) | ${tableText(source.pageId!)} / ${tableText(source.frameId!)} | ${tableText(node.requirementIds!.join(", "))} | Separate artifact review required |`;
    });
  const details = detailRows.length
    ? [
        "## Linked detail contracts",
        "",
        "Links are project-relative. Each detail is published and reviewed independently; its contents are not inlined here.",
        "",
        "| Region | Contract | Native page / board | Requirements | Review |",
        "| --- | --- | --- | --- | --- |",
        ...detailRows,
        "",
        "",
      ].join("\n")
    : "";
  return `${nodes.join("\n")}\n\n${requirements.join("\n")}\n\n${findings.join("\n")}\n\n${details}`;
}

export function renderMapMermaid(raw: MapContract): string {
  const contract = validateMapContract(raw);
  const aliases = new Map(
    contract.nodes.map((node, index) => [
      node.id,
      `node${index}`,
    ]),
  );
  const lines = [
    "flowchart LR",
  ];
  for (const node of contract.nodes) {
    lines.push(
      `  ${aliases.get(node.id)}["${mermaidLabel((node.kind === "detail-link" ? "Details: " : "") + node.label)}"]`,
    );
  }
  for (const edge of contract.edges) {
    lines.push(
      `  ${aliases.get(edge.from)} -->|"${mermaidLabel(edge.label)}"| ${aliases.get(edge.to)}`,
    );
  }
  return `${lines.join("\n")}\n`;
}

export function renderMapMarkdown(raw: MapContract): string {
  const contract = validateMapContract(raw);
  const hash = hashMapContract(contract);
  return (
    `# ${contract.kind === "journey-map" ? "Journey map" : "Integration map"}\n\n` +
    `Contract hash: ${hash}\n\n` +
    "Proposed and observed design data; review records are separate. Appearance does not establish behavior, accessibility or implementation verification.\n\n" +
    `\`\`\`mermaid\n${renderMapMermaid(contract)}\`\`\`\n\n` +
    reviewTables(contract) +
    designDataBlock(contract)
  );
}

export function buildMapDrawingPlan(
  raw: MapContract,
  detailMaps: Record<string, MapContract> = {},
): MapDrawingPlan {
  const contract = validateMapContract(raw);
  const detailReasons: string[] = [];
  const layers = mapNodeLayers(contract);
  const columns = Math.max(...layers.values()) + 1;
  const columnEnds = Array.from(
    {
      length: columns,
    },
    () => 180,
  );
  const nodes = contract.nodes.map((node) => {
    const column = layers.get(node.id)!;
    const y = columnEnds[column]!;
    const height = Math.max(144, 56 + mapLabelHeight(node.label, 248));
    columnEnds[column] = y + height + 160;
    let detail: MapDetailTarget | undefined;
    if (node.kind === "detail-link") {
      const source = contract.sources.find((entry) => entry.id === node.sourceIds![0])!;
      const child = detailMaps[source.id];
      if (!child) {
        detailReasons.push(
          `Resolve the independently reviewed detail contract before native publication: ${source.id}`,
        );
      } else {
        const target = validateMapDetail(contract, node, child);
        detail = {
          sourceId: source.id,
          path: source.path!,
          sha256: source.sha256,
          fileId: source.fileId!,
          pageId: source.pageId!,
          frameId: source.frameId!,
          mapId: `${target.kind}:${target.id}`,
          contractHash: hashMapContract(target),
        };
      }
    }
    return {
      ...node,
      ...(detail
        ? {
            detail,
          }
        : {}),
      x: 400 + column * 760,
      y,
      width: 280,
      height,
    };
  });
  const edges = routeMapEdges(nodes, contract.edges);
  const width =
    Math.max(
      ...nodes.map((node) => node.x + node.width),
      ...edges.map((edge) => edge.labelBox.x + edge.labelBox.width),
    ) + 80;
  const height =
    Math.max(
      ...nodes.map((node) => node.y + node.height),
      ...edges.map((edge) => edge.labelBox.y + edge.labelBox.height + 48),
      ...edges.flatMap((edge) => edge.points.map((point) => point.y)),
    ) + 80;
  const reasons = [
    ...detailReasons,
    ...mapDrawingGeometryProblems(nodes, edges),
  ];
  if (width > 16384 || height > 16384) {
    reasons.push(
      "Layered diagram exceeds 16384 px per axis; use linked detail boards before native publication",
    );
  }
  const plan: MapDrawingPlan = {
    schemaVersion: 1,
    kind: "map-drawing-plan",
    mapKind: contract.kind,
    mapId: contract.id,
    mapHash: hashMapContract(contract),
    title: contract.title,
    fontFamily: contract.presentation?.fontFamily ?? "Inter",
    width,
    height,
    nodes,
    edges,
    complete: reasons.length === 0,
    reasons,
  };
  if (Buffer.byteLength(JSON.stringify(plan)) > 64 * 1024) {
    plan.complete = false;
    plan.reasons.push(
      "Drawing plan exceeds 64 KiB; use linked detail boards to reserve the plugin snippet budget",
    );
  }
  return plan;
}
