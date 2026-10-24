import { afterEach, describe, expect, it, vi } from "vitest";
// @ts-expect-error Release tooling remains executable JavaScript.
import {
  publishPackageBatch,
  verifyPackageVisibility,
} from "../../../scripts/lib/publication-batch.mjs";

function deferredUpload() {
  let resolve!: () => void;
  let reject!: (error: Error) => void;
  const promise = new Promise<void>((accept, fail) => {
    resolve = accept;
    reject = fail;
  });

  return {
    promise,
    resolve,
    reject,
  };
}

const packages = [
  "one",
  "two",
  "three",
  "four",
  "five",
].map((name) => ({
  name,
}));

afterEach(() => {
  vi.useRealTimers();
});

describe("bounded package uploads", () => {
  it("starts at most three uploads and schedules siblings without waiting for registry visibility", async () => {
    const uploads = packages.map(deferredUpload);
    const publish = vi.fn(
      (packageEntry: { name: string }) => uploads[packages.indexOf(packageEntry)]!.promise,
    );
    const batch = publishPackageBatch(packages, publish);

    expect(publish.mock.calls.map(([entry]) => entry.name)).toEqual([
      "one",
      "two",
      "three",
    ]);
    uploads[0]!.resolve();
    await Promise.resolve();
    expect(publish.mock.calls.map(([entry]) => entry.name)).toEqual([
      "one",
      "two",
      "three",
      "four",
    ]);
    uploads[1]!.resolve();
    await Promise.resolve();
    expect(publish).toHaveBeenCalledTimes(5);
    uploads.slice(2).forEach((upload) => upload.resolve());

    expect(await batch).toEqual(
      packages.map((packageEntry) => ({
        package: packageEntry,
        status: "accepted",
      })),
    );
  });

  it("stops new scheduling after failure and awaits every in-flight upload", async () => {
    const uploads = packages.map(deferredUpload);
    const publish = vi.fn(
      (packageEntry: { name: string }) => uploads[packages.indexOf(packageEntry)]!.promise,
    );
    let settled = false;
    const batch = publishPackageBatch(packages, publish).then((result: unknown) => {
      settled = true;
      return result;
    });
    const failure = new Error("upload rejected");
    const siblingFailure = new Error("in-flight upload rejected");

    uploads[1]!.reject(failure);
    await Promise.resolve();
    expect(settled).toBe(false);
    expect(publish).toHaveBeenCalledTimes(3);
    uploads[0]!.resolve();
    uploads[2]!.reject(siblingFailure);

    expect(await batch).toEqual([
      {
        package: packages[0],
        status: "accepted",
      },
      {
        package: packages[1],
        status: "failed",
        error: failure,
      },
      {
        package: packages[2],
        status: "failed",
        error: siblingFailure,
      },
      {
        package: packages[3],
        status: "not-started",
      },
      {
        package: packages[4],
        status: "not-started",
      },
    ]);
    expect(publish).toHaveBeenCalledTimes(3);
  });

  it("supports serial uploads and rejects invalid concurrency before starting any", async () => {
    const publish = vi.fn().mockResolvedValue(undefined);

    await expect(
      publishPackageBatch(packages, publish, {
        concurrency: 4,
      }),
    ).rejects.toThrow(/1 to 3/);
    expect(publish).not.toHaveBeenCalled();
    expect(
      await publishPackageBatch(packages, publish, {
        concurrency: 1,
      }),
    ).toHaveLength(5);
    expect(await publishPackageBatch([], publish)).toEqual([]);
  });
});

describe("batch registry visibility", () => {
  it("overlaps visibility waits so total delay is the slowest package, without publishing", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(0);
    const query = vi.fn(async (name: string) => Date.now() >= (name === "one" ? 120_000 : 180_000));
    const publish = vi.fn();
    const verification = verifyPackageVisibility(packages.slice(0, 2), "1.0.0", {
      query,
      now: () => Date.now(),
      wait: (delayMs: number) => new Promise((resolve) => setTimeout(resolve, delayMs)),
      publish,
    });

    expect(query.mock.calls.map(([name]) => name)).toEqual([
      "one",
      "two",
    ]);
    await vi.advanceTimersByTimeAsync(180_000);

    expect(await verification).toEqual(
      packages.slice(0, 2).map((packageEntry) => ({
        package: packageEntry,
        visible: true,
      })),
    );
    expect(Date.now()).toBe(180_000);
    expect(publish).not.toHaveBeenCalled();
  });

  it("uses one ten-minute deadline even when individual waits start later", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(0);
    const now = vi.fn(() => Date.now() + (now.mock.calls.length > 1 ? 20_000 : 0));
    const query = vi.fn(async () => false);
    const verification = verifyPackageVisibility(packages.slice(0, 2), "1.0.0", {
      query,
      now,
      wait: (delayMs: number) => new Promise((resolve) => setTimeout(resolve, delayMs)),
    });

    await vi.advanceTimersByTimeAsync(580_000);

    expect(await verification).toEqual(
      packages.slice(0, 2).map((packageEntry) => ({
        package: packageEntry,
        visible: false,
      })),
    );
    expect(Date.now()).toBe(580_000);
    expect(vi.getTimerCount()).toBe(0);
  });

  it("distinguishes registry errors from missing versions and still awaits siblings", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(0);
    const failure = new Error("npm authentication failed");
    const query = vi.fn(async (name: string) => {
      if (name === "one") {
        throw failure;
      }
      return false;
    });
    let settled = false;
    const verification = verifyPackageVisibility(packages.slice(0, 2), "1.0.0", {
      query,
      now: () => Date.now(),
      deadline: 60_000,
      wait: (delayMs: number) => new Promise((resolve) => setTimeout(resolve, delayMs)),
    }).then((results: unknown) => {
      settled = true;
      return results;
    });

    await vi.advanceTimersByTimeAsync(59_999);
    expect(settled).toBe(false);
    await vi.advanceTimersByTimeAsync(1);
    expect(await verification).toEqual([
      {
        package: packages[0],
        visible: false,
        error: failure,
      },
      {
        package: packages[1],
        visible: false,
      },
    ]);
  });
});
