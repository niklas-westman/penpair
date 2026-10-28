import { PenpairError } from "./errors.js";
import { commandSleep } from "./command-result.js";
import type { PenpotToolClient } from "./client.js";
import { runSnippet, snippet } from "./snippet.js";
import { layoutPolicySource } from "./layout-policy.js";
import { settleLayout } from "./layout-settling.js";

export type LayoutStrategy = "auto" | "native" | "geometry";
/** `inspected` observes the roots the inspection reports as `layoutRoots`; `page` samples the whole page. */
export type LayoutScope = "inspected" | "page";
export interface LayoutOptions {
  scope?: LayoutScope;
  shapeId?: string;
  shapeIds?: string[];
  maxNodes?: number;
  strategy?: LayoutStrategy;
  timeoutMs?: number;
  intervalMs?: number;
  sleep?: (ms: number) => Promise<void>;
}
export interface LayoutResult {
  stable: boolean;
  method: "native" | "geometry" | "partial" | "unavailable" | "skipped";
  rootIds?: string[];
  nodeCount?: number;
  maxNodes?: number;
  truncated?: boolean;
  samples: number;
  reason?: string;
  strategy?: LayoutStrategy;
  nativeOutcome?: "skipped" | "unsupported" | "completed" | "failed";
  fallbackReason?: string;
  elapsedMs?: number;
}

/** Layout evidence is independent of render equality and visual approval. Transport failures propagate without fallback. */
export async function waitForStableLayout(
  client: PenpotToolClient,
  options: LayoutOptions = {},
): Promise<LayoutResult> {
  const {
    timeoutMs = 30000,
    intervalMs = 200,
    strategy = "auto",
    sleep = commandSleep,
    shapeId,
    shapeIds,
    maxNodes = 10000,
  } = options;
  const roots =
    shapeIds ??
    (shapeId
      ? [
          shapeId,
        ]
      : []);
  if (
    !Array.isArray(roots) ||
    roots.some((id) => typeof id !== "string" || !id.trim()) ||
    new Set(roots).size !== roots.length
  ) {
    throw new Error("Layout roots must be distinct nonempty shape IDs");
  }
  if (!Number.isInteger(maxNodes) || maxNodes < 1 || maxNodes > 100000) {
    throw new Error("Layout node budget must be an integer from 1 to 100000");
  }
  try {
    return await settleLayout(
      async (nativeMs, remaining) =>
        runSnippet(
          client,
          snippet(
            "layout-state",
            `${layoutPolicySource}\nconst roots = CFG.shapeIds.length ? CFG.shapeIds.map(id => penpot.currentPage.getShapeById(id)) : [penpot.currentPage.root];\nreturn await observeLayout(penpot, roots, CFG);`,
            {
              shapeIds: roots,
              maxNodes,
              nativeMs,
            },
            "read",
          ),
          {
            retries: 0,
            timeoutMs: remaining,
          },
        ),
      {
        timeoutMs,
        intervalMs,
        strategy,
        maxNodes,
        sleep,
      },
    );
  } catch (error) {
    if (error instanceof PenpairError && error.code === "mcp-unavailable") {
      return {
        stable: false,
        method: "unavailable",
        samples: 0,
        strategy,
        reason: "Layout observation did not complete within its request budget",
      };
    }
    throw error;
  }
}
