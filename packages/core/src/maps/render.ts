import {
  mapCardAnchorHeight,
  mapCardEstimate,
  mapCardHeight,
  mapCardRowGap,
  mapCardSummaryLimit,
  mapCardTitleLimit,
  mapCardWidth,
} from "./card-metrics.js";
import { designDataBlock } from "../project-input.js";
import { mapAnnotationLayout } from "./annotation-layout.js";
import {
  mapDrawingGeometryProblems,
  mapEdgeLabelWidth,
  mapLabelHeight,
  mapNodeLayers,
  routeMapEdges,
} from "./layout.js";
import type {
  MapContract,
  MapDrawingPlan,
  MapDetailTarget,
  MapDrawingAnnotation,
} from "./types.js";
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
    "| ID | Kind | Origin | Title | Summary | Description | Icon | Requirements |",
    "| --- | --- | --- | --- | --- | --- | --- | --- |",
    ...contract.nodes.map(
      (node) =>
        `| ${tableText(node.id)} | ${tableText(node.kind)} | ${node.origin} | ${tableText(node.label)} | ${tableText(node.summary ?? "")} | ${tableText(node.description ?? "")} | ${node.icon ?? ""} | ${tableText((node.requirementIds ?? []).join(", "))} |`,
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
    `  %% title: ${mermaidLabel(contract.title)}`,
    `  %% goal: ${mermaidLabel(contract.goal)}`,
  ];
  if (contract.summary !== undefined) {
    lines.push(`  %% summary: ${mermaidLabel(contract.summary)}`);
  }
  if (contract.description !== undefined) {
    lines.push(`  %% description: ${mermaidLabel(contract.description)}`);
  }
  for (const node of contract.nodes) {
    lines.push(
      `  ${aliases.get(node.id)}["${mermaidLabel((node.kind === "detail-link" ? "Details: " : "") + node.label + (node.summary ? ` / ${node.summary}` : ""))}"]`,
    );
    if (node.description !== undefined) {
      lines.push(`  %% ${aliases.get(node.id)} description: ${mermaidLabel(node.description)}`);
    }
    if (node.icon !== undefined) {
      lines.push(`  %% ${aliases.get(node.id)} icon: ${node.icon}`);
    }
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
    `Title: ${tableText(contract.title)}\n\nGoal: ${tableText(contract.goal)}\n\n` +
    (contract.summary === undefined ? "" : `Summary: ${tableText(contract.summary)}\n\n`) +
    (contract.description === undefined
      ? ""
      : `Description: ${tableText(contract.description)}\n\n`) +
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
  const sameColumn = contract.edges.some((edge) => layers.get(edge.from) === layers.get(edge.to));
  const columnXs = [
    sameColumn ? 400 : 96,
  ];
  for (let column = 0; column < columns - 1; column++) {
    const crossing = contract.edges.filter(
      (edge) => layers.get(edge.from) === column && layers.get(edge.to) === column + 1,
    );
    const gap = Math.max(
      160,
      ...crossing.map((edge) => mapEdgeLabelWidth(edge.label) + 64 + crossing.length * 8),
    );
    columnXs.push(columnXs[column]! + mapCardWidth + gap);
  }
  const titleBox = {
    x: 32,
    y: 24,
    width: 1120,
    height: mapLabelHeight(contract.title, 700) + 8,
  };
  const headerSummary =
    contract.summary ?? (contract.goal.length <= 240 ? contract.goal : undefined);
  const summaryBox =
    headerSummary === undefined
      ? undefined
      : {
          x: 32,
          y: titleBox.y + titleBox.height + 12,
          width: 1120,
          height: mapLabelHeight(headerSummary, 1120),
        };
  const legendY =
    (summaryBox ? summaryBox.y + summaryBox.height : titleBox.y + titleBox.height) + 16;
  const header = {
    titleBox,
    ...(summaryBox
      ? {
          summaryBox,
        }
      : {}),
    legendY,
    height: legendY + 48,
  };
  /** Cuts at a word boundary and attaches the ellipsis, so it never wraps onto a line of its own. */
  const compact = (text: string, limit: number) => {
    if (text.length <= limit) {
      return text;
    }
    const cut = text.slice(0, limit - 1);
    const space = cut.lastIndexOf(" ");
    return `${(space > limit / 2 ? cut.slice(0, space) : cut).trimEnd()}…`;
  };
  const columnEnds = Array.from(
    {
      length: columns,
    },
    () => Math.max(180, header.height + 32),
  );
  const cardEstimates = new Map<string, number>();
  const nodes = contract.nodes.map((node) => {
    const column = layers.get(node.id)!;
    const y = columnEnds[column]!;
    const height = mapCardAnchorHeight;
    const cardTitle = compact(node.label, mapCardTitleLimit);
    const cardSummary =
      node.summary === undefined ? undefined : compact(node.summary, mapCardSummaryLimit);
    const estimate = mapCardEstimate({
      title: cardTitle,
      ...(cardSummary === undefined
        ? {}
        : {
            summary: cardSummary,
          }),
      hasStatus: node.origin !== undefined,
    });
    cardEstimates.set(node.id, estimate);
    columnEnds[column] = y + estimate + mapCardRowGap;
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
      cardTitle,
      ...(cardSummary === undefined
        ? {}
        : {
            cardSummary,
          }),
      ...(node.label.length > mapCardTitleLimit ||
      (node.summary?.length ?? 0) > mapCardSummaryLimit ||
      node.description !== undefined
        ? {
            annotationId: `node:${node.id}`,
          }
        : {}),
      ...(detail
        ? {
            detail,
          }
        : {}),
      x: columnXs[column]!,
      y,
      width: mapCardWidth,
      height,
    };
  });
  const edges = routeMapEdges(nodes, contract.edges);
  const width =
    Math.max(
      titleBox.x + titleBox.width,
      ...nodes.map((node) => node.x + node.width),
      ...edges.map((edge) => edge.labelBox.x + edge.labelBox.width),
    ) + 80;
  const flowHeight =
    Math.max(
      ...nodes.map((node) => node.y + (cardEstimates.get(node.id) ?? mapCardHeight)),
      ...edges.map((edge) => edge.labelBox.y + edge.labelBox.height + 48),
      ...edges.flatMap((edge) => edge.points.map((point) => point.y)),
    ) + 48;
  const annotations: MapDrawingAnnotation[] = [];
  let annotationY = flowHeight + 32;
  const noteWidth = 1120;
  const noteGap = 24;
  const noteColumnWidth = (noteWidth - noteGap) / 2;
  let columnY = [
    annotationY,
    annotationY,
  ];
  const annotate = (annotation: Omit<MapDrawingAnnotation, "x" | "y" | "width" | "height">) => {
    const width = annotation.nodeId ? noteColumnWidth : noteWidth;
    const height = mapAnnotationLayout({
      ...annotation,
      width,
    }).height;
    const column = columnY[0]! <= columnY[1]! ? 0 : 1;
    const y = annotation.nodeId ? columnY[column]! : annotationY;
    annotations.push({
      ...annotation,
      x: 32 + (annotation.nodeId ? column * (noteColumnWidth + noteGap) : 0),
      y,
      width,
      height,
    });
    if (annotation.nodeId) {
      columnY[column] = y + height + noteGap;
    } else {
      annotationY = y + height + noteGap;
      columnY = [
        annotationY,
        annotationY,
      ];
    }
  };
  // The header already carries the summary (or a short goal); notes hold only what it does not.
  if (
    (contract.summary !== undefined && contract.goal !== contract.summary) ||
    contract.goal.length > 240 ||
    contract.description !== undefined
  ) {
    annotate({
      id: "map:details",
      title: contract.title,
      goal: contract.goal,
      ...(contract.description === undefined
        ? {}
        : {
            description: contract.description,
          }),
    });
  }
  for (const node of nodes) {
    if (node.annotationId) {
      annotate({
        id: node.annotationId,
        nodeId: node.id,
        title: node.label,
        ...(node.summary === undefined
          ? {}
          : {
              summary: node.summary,
            }),
        ...(node.description === undefined
          ? {}
          : {
              description: node.description,
            }),
      });
    }
  }
  const height = annotations.length ? Math.max(...columnY) + 32 : flowHeight;
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
    goal: contract.goal,
    ...(contract.summary === undefined
      ? {}
      : {
          summary: contract.summary,
        }),
    ...(contract.description === undefined
      ? {}
      : {
          description: contract.description,
        }),
    ...(headerSummary === undefined
      ? {}
      : {
          headerSummary,
        }),
    header,
    annotations,
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
