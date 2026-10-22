import { PenpairError } from "./errors.js";
import { commandSleep } from "./command-result.js";
import type { PenpotToolClient } from "./client.js";
import { runSnippet, snippet } from "./snippet.js";
import { layoutPolicySource } from "./layout-policy.js";

export type LayoutStrategy = "auto" | "native" | "geometry";
export interface LayoutOptions {
  shapeId?: string;
  strategy?: LayoutStrategy;
  timeoutMs?: number;
  intervalMs?: number;
  sleep?: (ms: number) => Promise<void>;
}
export interface LayoutResult {
  stable: boolean;
  method: "native" | "geometry" | "unavailable";
  samples: number;
  reason?: string;
  strategy?: LayoutStrategy;
  nativeOutcome?: "skipped" | "unsupported" | "completed" | "failed";
  fallbackReason?: string;
  elapsedMs?: number;
}
// This evaluates only the static policy above, never project or transport content.
const settle = new Function(`${layoutPolicySource}\nreturn settleLayout;`)() as (
  observe: (nativeMs: number, remaining: number) => Promise<unknown>,
  options: Required<Pick<LayoutOptions, "timeoutMs" | "intervalMs" | "strategy" | "sleep">>,
) => Promise<LayoutResult>;

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
  } = options;
  try {
    return await settle(
      async (nativeMs, remaining) =>
        runSnippet(
          client,
          snippet(
            "layout-state",
            `${layoutPolicySource}\nconst shape = CFG.shapeId ? penpot.currentPage.getShapeById(CFG.shapeId) : penpot.currentPage.root;\nreturn await observeLayout(penpot, shape, CFG);`,
            {
              shapeId,
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
