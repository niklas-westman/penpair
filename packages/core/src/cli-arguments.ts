import { parseArgs, type ParseArgsConfig } from "node:util";

export class CommandArgumentError extends Error {
  readonly code = "invalid-arguments";
  remedy = "Use the command's supported flags and required values; see penpair --help.";
}
function distance(a: string, b: string): number {
  let previous = Array.from(
    {
      length: b.length + 1,
    },
    (_, index) => index,
  );
  for (let i = 1; i <= a.length; i++) {
    const next = [
      i,
    ];
    for (let j = 1; j <= b.length; j++) {
      next[j] = Math.min(
        next[j - 1]! + 1,
        previous[j]! + 1,
        previous[j - 1]! + (a[i - 1] === b[j - 1] ? 0 : 1),
      );
    }
    previous = next;
  }
  return previous[b.length]!;
}
/** Suggestions are explanatory only; never reinterpret a supplied option. */
export function parseCommandArgs<T extends ParseArgsConfig>(
  config: T,
): ReturnType<typeof parseArgs<T>> {
  try {
    return parseArgs(config);
  } catch (error) {
    const value = error as {
      code?: string;
      message?: string;
    };
    if (!value.code?.startsWith("ERR_PARSE_ARGS")) {
      throw error;
    }
    const unknown = /Unknown option ['"]--([^'"]+)['"]/.exec(value.message ?? "")?.[1];
    let hint = "";
    if (unknown && unknown.length <= 100) {
      const candidates = Object.keys(config.options ?? {})
        .map((name) => ({
          name,
          distance: distance(unknown.toLowerCase(), name.toLowerCase()),
        }))
        .sort((a, b) => a.distance - b.distance || a.name.localeCompare(b.name));
      const best = candidates[0];
      if (best && best.distance <= Math.max(2, Math.ceil(unknown.length / 2))) {
        hint = ` Did you mean --${best.name}?`;
      }
    }
    throw new CommandArgumentError((value.message ?? "Invalid command arguments") + hint);
  }
}
