import { performance } from "node:perf_hooks";
import { registryVisibilityTimeoutMs, waitForRegistryVisibility } from "./registry-polling.mjs";

/**
 * Settle every started upload before returning, and stop scheduling after a failure.
 * @template T
 * @param {T[]} packages
 * @param {(packageEntry: T) => Promise<void>} publish
 * @param {{ concurrency?: number }} [options]
 * @returns {Promise<Array<{ package: T, status: 'accepted' | 'failed' | 'not-started', error?: unknown }>>}
 */
export async function publishPackageBatch(packages, publish, { concurrency = 3 } = {}) {
  if (!Number.isInteger(concurrency) || concurrency < 1 || concurrency > 3) {
    throw new RangeError("Publication concurrency must be an integer from 1 to 3");
  }

  const results = packages.map((packageEntry) => ({
    package: packageEntry,
    status: "not-started",
  }));
  let nextIndex = 0;
  let failed = false;

  async function uploadNext() {
    while (!failed && nextIndex < packages.length) {
      const index = nextIndex++;
      const packageEntry = packages[index];

      try {
        await publish(packageEntry);
        results[index] = {
          package: packageEntry,
          status: "accepted",
        };
      } catch (error) {
        failed = true;
        results[index] = {
          package: packageEntry,
          status: "failed",
          error,
        };
      }
    }
  }

  await Promise.all(
    Array.from(
      {
        length: Math.min(concurrency, packages.length),
      },
      uploadNext,
    ),
  );

  return results;
}

/**
 * Observe all packages concurrently under one deadline. Never retry an upload.
 * @template {{ name: string }} T
 * @param {T[]} packages
 * @param {string} version
 * @param {Parameters<typeof waitForRegistryVisibility>[2]} [options]
 * @returns {Promise<Array<{ package: T, visible: boolean, error?: unknown }>>}
 */
export async function verifyPackageVisibility(packages, version, options = {}) {
  const now = options.now ?? (() => performance.now());
  const deadline = options.deadline ?? now() + registryVisibilityTimeoutMs;

  return Promise.all(
    packages.map(async (packageEntry) => {
      try {
        const visible = await waitForRegistryVisibility(packageEntry.name, version, {
          ...options,
          now,
          deadline,
        });

        return {
          package: packageEntry,
          visible,
        };
      } catch (error) {
        return {
          package: packageEntry,
          visible: false,
          error,
        };
      }
    }),
  );
}
