import type { LayoutResult, LayoutStrategy } from "./layout.js";

interface LayoutSettlingOptions {
  maxNodes?: number;
  timeoutMs: number;
  intervalMs: number;
  strategy: LayoutStrategy;
  sleep: (ms: number) => Promise<void>;
}

type GeometryRow = [
  string,
  number,
  number,
  number,
  number,
  string | null,
  number,
];

interface LayoutObservation {
  ok?: boolean;
  fileId?: string;
  pageId?: string;
  native?: boolean;
  nativeOutcome?: LayoutResult["nativeOutcome"];
  nativeError?: string;
  error?: string;
  geometry?: GeometryRow[];
  truncated?: boolean;
  rootIds?: string[];
}

/** Self-contained policy: its JavaScript source also runs inside the Penpot sandbox. */
export async function settleLayout(
  observe: (nativeMs: number, remaining: number) => Promise<unknown>,
  options: LayoutSettlingOptions,
): Promise<LayoutResult> {
  const { timeoutMs, intervalMs, strategy = "auto", maxNodes = 10000, sleep } = options;

  if (
    !Number.isInteger(maxNodes) ||
    maxNodes < 1 ||
    maxNodes > 100000 ||
    ![
      "auto",
      "native",
      "geometry",
    ].includes(strategy) ||
    !Number.isFinite(timeoutMs) ||
    timeoutMs < 1 ||
    timeoutMs > 30000 ||
    !Number.isFinite(intervalMs) ||
    intervalMs <= 0 ||
    Math.ceil(timeoutMs / intervalMs) + 1 > 1000
  ) {
    throw new Error("Invalid layout strategy or settling budgets");
  }

  const started = Date.now();
  const deadline = started + timeoutMs;
  let samples = 0;
  let nodeCount = 0;
  let rootIds: string[] = [];
  let truncated = false;
  let nativeOutcome: LayoutResult["nativeOutcome"] = "skipped";
  let fallbackReason: string | undefined;
  let targetIdentity: string | undefined;
  let previousGeometry: string | undefined;
  let matchingSamples = 0;

  const createResult = (
    stable: boolean,
    method: LayoutResult["method"],
    reason?: string,
  ): LayoutResult => ({
    stable,
    method: truncated ? "partial" : method,
    samples,
    rootIds,
    nodeCount,
    maxNodes,
    truncated,
    strategy,
    nativeOutcome,
    ...(fallbackReason
      ? {
          fallbackReason,
        }
      : {}),
    elapsedMs: Date.now() - started,
    ...(reason || truncated
      ? {
          reason:
            reason ??
            "Only the bounded layout sample was observed; independent readback is required",
        }
      : {}),
  });

  for (let sampleIndex = 0; sampleIndex < Math.ceil(timeoutMs / intervalMs) + 1; sampleIndex++) {
    const remaining = deadline - Date.now();
    if (remaining <= 0) {
      return createResult(
        false,
        strategy === "native" ? "native" : "geometry",
        "Layout observation exceeded its deadline",
      );
    }

    const nativeMs =
      sampleIndex === 0 && strategy !== "geometry"
        ? strategy === "native"
          ? remaining
          : Math.max(1, Math.min(500, Math.floor(remaining / 4)))
        : 0;
    const observation = (await observe(nativeMs, remaining)) as LayoutObservation | undefined;
    samples++;
    if (
      !observation ||
      observation.ok !== true ||
      typeof observation.fileId !== "string" ||
      !observation.fileId ||
      typeof observation.pageId !== "string" ||
      !observation.pageId
    ) {
      throw new Error("Layout returned no target identity evidence");
    }
    if (
      typeof observation.native !== "boolean" ||
      typeof observation.truncated !== "boolean" ||
      (observation.nativeOutcome !== undefined &&
        ![
          "skipped",
          "unsupported",
          "completed",
          "failed",
        ].includes(observation.nativeOutcome))
    ) {
      throw new Error("Malformed layout attempt evidence");
    }

    const nextTargetIdentity = JSON.stringify([
      observation.fileId,
      observation.pageId,
      observation.rootIds ?? [
        observation.geometry?.[0]?.[0],
      ],
    ]);
    if (targetIdentity && targetIdentity !== nextTargetIdentity) {
      throw new Error("Layout target changed between samples");
    }
    targetIdentity = nextTargetIdentity;
    if (
      !Array.isArray(observation.geometry) ||
      !observation.geometry.length ||
      observation.geometry.length > maxNodes
    ) {
      throw new Error("Incomplete layout geometry evidence");
    }

    const observedRoots = observation.rootIds ?? [
      observation.geometry[0]![0],
    ];
    if (
      !Array.isArray(observedRoots) ||
      !observedRoots.length ||
      observedRoots.some((id) => typeof id !== "string" || !id) ||
      new Set(observedRoots).size !== observedRoots.length
    ) {
      throw new Error("Malformed layout root evidence");
    }
    rootIds = observedRoots;
    nodeCount = observation.geometry.length;
    truncated = observation.truncated;
    const observedShapeIds = new Set<string>();
    const siblingCountByParent = new Map<string, number>();
    let rootIndex = 0;
    for (const geometryRow of observation.geometry) {
      if (
        !Array.isArray(geometryRow) ||
        geometryRow.length !== 7 ||
        typeof geometryRow[0] !== "string" ||
        !geometryRow[0] ||
        observedShapeIds.has(geometryRow[0]) ||
        !geometryRow
          .slice(1, 5)
          .every((value) => typeof value === "number" && Number.isFinite(value)) ||
        (geometryRow[5] !== null && !observedShapeIds.has(geometryRow[5])) ||
        !Number.isInteger(geometryRow[6]) ||
        geometryRow[6] < 0
      ) {
        throw new Error("Layout API returned no geometry evidence or malformed hierarchy");
      }
      if (geometryRow[5] === null) {
        if (geometryRow[0] !== rootIds[rootIndex++] || geometryRow[6] !== 0) {
          throw new Error("Malformed layout root hierarchy");
        }
      } else if (typeof geometryRow[5] !== "string") {
        throw new Error("Malformed layout root hierarchy");
      }
      if (geometryRow[5] !== null) {
        const expectedIndex = siblingCountByParent.get(geometryRow[5]) || 0;
        if (geometryRow[6] !== expectedIndex) {
          throw new Error("Malformed layout sibling order");
        }
        siblingCountByParent.set(geometryRow[5], expectedIndex + 1);
      }
      observedShapeIds.add(geometryRow[0]);
    }

    if (!truncated && rootIndex !== rootIds.length) {
      throw new Error("Incomplete layout root evidence");
    }

    if (sampleIndex === 0) {
      nativeOutcome =
        observation.nativeOutcome ||
        (observation.native
          ? observation.error
            ? "failed"
            : "completed"
          : strategy === "geometry"
            ? "skipped"
            : "unsupported");
      if (Date.now() >= deadline) {
        return createResult(
          false,
          strategy === "native" || observation.native ? "native" : "geometry",
          "Layout observation exceeded its deadline",
        );
      }
      if (nativeOutcome === "completed") {
        return createResult(true, "native");
      }
      if (strategy === "native") {
        return createResult(
          false,
          "native",
          observation.nativeError || observation.error || "Native layout API unavailable",
        );
      }
      if (strategy === "auto") {
        fallbackReason =
          observation.nativeError || observation.error || "Native layout API unavailable";
      }
    }
    if (Date.now() >= deadline) {
      return createResult(false, "geometry", "Layout observation exceeded its deadline");
    }

    const currentGeometry = JSON.stringify([
      observation.geometry,
      observation.truncated,
    ]);
    matchingSamples = currentGeometry === previousGeometry ? matchingSamples + 1 : 1;
    if (matchingSamples >= 3) {
      return createResult(true, "geometry");
    }
    previousGeometry = currentGeometry;
    await sleep(Math.min(intervalMs, Math.max(0, deadline - Date.now())));
  }

  return createResult(false, "geometry", "Layout did not settle within its bounded samples");
}
