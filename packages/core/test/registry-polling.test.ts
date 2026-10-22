import { describe, expect, it, vi } from "vitest";
// @ts-expect-error Release tooling remains executable JavaScript.
import { waitForRegistryVisibility } from "../../../scripts/lib/registry-polling.mjs";

type RegistryQuery = (
  name: string,
  version: string,
  options: {
    timeoutMs: number;
  },
) => Promise<boolean>;

function virtualClock() {
  let elapsedMs = 0;
  const wait = vi.fn(async (delayMs: number) => {
    elapsedMs += delayMs;
  });

  return {
    now: () => elapsedMs,
    wait,
    advance: (durationMs: number) => {
      elapsedMs += durationMs;
    },
  };
}

describe("post-publish npm visibility", () => {
  it("accepts immediate visibility without waiting", async () => {
    const clock = virtualClock();
    const query = vi.fn<RegistryQuery>().mockResolvedValue(true);

    expect(
      await waitForRegistryVisibility("@penpair/core", "0.3.0", {
        ...clock,
        query,
      }),
    ).toBe(true);
    expect(query).toHaveBeenCalledExactlyOnceWith("@penpair/core", "0.3.0", {
      timeoutMs: 30_000,
    });
    expect(clock.wait).not.toHaveBeenCalled();
  });

  it("checks once per minute until a delayed package becomes visible and logs progress", async () => {
    const clock = virtualClock();
    const query = vi
      .fn<RegistryQuery>()
      .mockResolvedValueOnce(false)
      .mockResolvedValueOnce(false)
      .mockResolvedValueOnce(false)
      .mockResolvedValue(true);
    const log = vi.fn();

    expect(
      await waitForRegistryVisibility("@penpair/core", "0.3.0", {
        ...clock,
        query,
        log,
      }),
    ).toBe(true);
    expect(query).toHaveBeenCalledTimes(4);
    expect(clock.wait.mock.calls).toEqual([
      [
        60_000,
      ],
      [
        60_000,
      ],
      [
        60_000,
      ],
    ]);
    expect(clock.now()).toBe(180_000);
    expect(log).toHaveBeenCalledTimes(3);
    expect(log.mock.calls[2]![0]).toContain("120s elapsed; checking again in 60s");
  });

  it("stops at ten minutes without a lookup or sleep after the deadline", async () => {
    const clock = virtualClock();
    const query = vi.fn<RegistryQuery>().mockResolvedValue(false);

    expect(
      await waitForRegistryVisibility("@penpair/core", "0.3.0", {
        ...clock,
        query,
      }),
    ).toBe(false);
    expect(query).toHaveBeenCalledTimes(10);
    expect(clock.wait.mock.calls).toEqual(
      Array.from(
        {
          length: 10,
        },
        () => [
          60_000,
        ],
      ),
    );
    expect(clock.now()).toBe(600_000);
  });

  it("includes query duration in the deadline and keeps minute start times", async () => {
    const clock = virtualClock();
    const queryStartedAt: number[] = [];
    const query = vi.fn<RegistryQuery>(async () => {
      queryStartedAt.push(clock.now());
      clock.advance(20_000);
      return false;
    });

    expect(
      await waitForRegistryVisibility("@penpair/core", "0.3.0", {
        ...clock,
        query,
      }),
    ).toBe(false);
    expect(queryStartedAt).toEqual(
      Array.from(
        {
          length: 10,
        },
        (_, index) => index * 60_000,
      ),
    );
    expect(clock.wait.mock.calls).toEqual(
      Array.from(
        {
          length: 10,
        },
        () => [
          40_000,
        ],
      ),
    );
    expect(clock.now()).toBe(600_000);
  });

  it("caps the last query to the remaining budget", async () => {
    const now = vi.fn().mockReturnValueOnce(0).mockReturnValue(599_990);
    const query = vi.fn<RegistryQuery>().mockResolvedValue(true);

    expect(
      await waitForRegistryVisibility("@penpair/core", "0.3.0", {
        now,
        query,
      }),
    ).toBe(true);
    expect(query).toHaveBeenCalledExactlyOnceWith("@penpair/core", "0.3.0", {
      timeoutMs: 10,
    });
  });

  it("does not accept an observation returned after the deadline", async () => {
    const clock = virtualClock();
    const query = vi.fn<RegistryQuery>(async () => {
      clock.advance(600_001);
      return true;
    });

    expect(
      await waitForRegistryVisibility("@penpair/core", "0.3.0", {
        ...clock,
        query,
      }),
    ).toBe(false);
    expect(clock.wait).not.toHaveBeenCalled();
  });

  it("skips the lookup if the deadline passes while preparing it", async () => {
    const now = vi
      .fn()
      .mockReturnValueOnce(0)
      .mockReturnValueOnce(599_990)
      .mockReturnValue(600_001);
    const query = vi.fn<RegistryQuery>();

    expect(
      await waitForRegistryVisibility("@penpair/core", "0.3.0", {
        now,
        query,
      }),
    ).toBe(false);
    expect(query).not.toHaveBeenCalled();
  });

  it("propagates registry errors without treating them as pending publication", async () => {
    const clock = virtualClock();
    const query = vi.fn<RegistryQuery>().mockRejectedValue(new Error("npm authentication failed"));

    await expect(
      waitForRegistryVisibility("@penpair/core", "0.3.0", {
        ...clock,
        query,
      }),
    ).rejects.toThrow("authentication failed");
    expect(query).toHaveBeenCalledTimes(1);
    expect(clock.wait).not.toHaveBeenCalled();
  });
});
