import { performance } from "node:perf_hooks";
import { setTimeout as sleep } from "node:timers/promises";
import { isPublished } from "./versions.mjs";

export const registryPollIntervalMs = 60_000;
export const registryVisibilityTimeoutMs = 10 * 60_000;
export const registryQueryTimeoutMs = 30_000;

/**
 * Wait only for registry visibility after a successful publish; never publish again.
 * @param {string} name
 * @param {string} version
 * @param {{
 *   query?: typeof isPublished,
 *   now?: () => number,
 *   wait?: (delayMs: number) => Promise<void>,
 *   log?: (message: string) => void,
 * }} [options]
 * @returns {Promise<boolean>}
 */
export async function waitForRegistryVisibility(
  name,
  version,
  { query = isPublished, now = () => performance.now(), wait = sleep, log = () => {} } = {},
) {
  const startedAt = now();
  const deadline = startedAt + registryVisibilityTimeoutMs;
  let nextPollAt = startedAt;

  while (now() < deadline) {
    const remainingMs = Math.ceil(deadline - now());

    if (remainingMs <= 0) {
      break;
    }

    const visible = await query(name, version, {
      timeoutMs: Math.min(registryQueryTimeoutMs, remainingMs),
    });

    if (visible) {
      return now() <= deadline;
    }

    nextPollAt += registryPollIntervalMs;

    const delayMs = Math.max(0, Math.min(nextPollAt, deadline) - now());

    if (delayMs > 0) {
      const elapsedSeconds = Math.floor((now() - startedAt) / 1000);
      const delaySeconds = Math.ceil(delayMs / 1000);
      const nextStep =
        nextPollAt < deadline
          ? `checking again in ${delaySeconds}s`
          : `visibility deadline in ${delaySeconds}s`;

      log(
        `Waiting for npm to expose ${name}@${version}: ${elapsedSeconds}s elapsed; ${nextStep} (10-minute limit per package).`,
      );

      await wait(delayMs);
    }
  }

  return false;
}
