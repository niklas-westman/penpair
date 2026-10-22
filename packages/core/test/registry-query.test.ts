import { beforeEach, describe, expect, it, vi } from "vitest";

const executeNpm = vi.hoisted(() => vi.fn());

vi.mock("node:child_process", async () => {
  const { promisify } = await import("node:util");
  const execFile = Object.assign(() => {}, {
    [promisify.custom]: executeNpm,
  });

  return {
    execFile,
  };
});

// @ts-expect-error Release tooling remains executable JavaScript.
import { isPublished } from "../../../scripts/lib/versions.mjs";

beforeEach(() => {
  executeNpm.mockReset();
});

describe("bounded registry metadata queries", () => {
  it("limits the subprocess and npm request and disables hidden retries", async () => {
    executeNpm.mockResolvedValue({
      stdout: '"0.3.0"',
      stderr: "",
    });

    expect(
      await isPublished("@penpair/core", "0.3.0", {
        timeoutMs: 12_345,
      }),
    ).toBe(true);
    expect(executeNpm).toHaveBeenCalledExactlyOnceWith(
      "npm",
      [
        "view",
        "@penpair/core@0.3.0",
        "version",
        "--json",
        "--fetch-retries=0",
        "--fetch-timeout=12345",
      ],
      {
        timeout: 12_345,
      },
    );
  });

  it("uses a bounded thirty-second default for preflight and final checks", async () => {
    executeNpm.mockResolvedValue({
      stdout: '"0.3.0"',
      stderr: "",
    });

    await isPublished("@penpair/core", "0.3.0");

    expect(executeNpm.mock.calls[0]![2]).toEqual({
      timeout: 30_000,
    });
  });

  it("treats a registry 404 as not visible", async () => {
    executeNpm.mockRejectedValue({
      stdout: "",
      stderr: "npm error E404",
    });

    expect(await isPublished("@penpair/core", "0.3.0")).toBe(false);
  });

  it.each([
    "E401",
    "E403",
    "ECONNRESET",
  ])("refuses %s instead of assuming absence", async (code) => {
    executeNpm.mockRejectedValue({
      stdout: "",
      stderr: `npm error ${code}`,
    });

    await expect(isPublished("@penpair/core", "0.3.0")).rejects.toThrow("could not ask npm");
  });

  it("does not mistake a killed lookup with partial 404 output for absence", async () => {
    executeNpm.mockRejectedValue({
      killed: true,
      stdout: "",
      stderr: "npm error E404",
    });

    await expect(
      isPublished("@penpair/core", "0.3.0", {
        timeoutMs: 100,
      }),
    ).rejects.toThrow("timed out after 100ms");
  });
});
