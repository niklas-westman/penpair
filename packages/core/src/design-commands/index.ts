import type { DesignCommandContext } from "./context.js";
import { runMapCommand } from "./map-command.js";
import { runDesignReleaseCommand } from "./release-command.js";

export type { DesignCommandContext } from "./context.js";

export async function runDesignCommand(
  family: "journey-map" | "integration-map" | "design-release",
  args: string[],
  context: DesignCommandContext,
): Promise<number> {
  return family === "design-release"
    ? runDesignReleaseCommand(args, context)
    : runMapCommand(family, args, context);
}
