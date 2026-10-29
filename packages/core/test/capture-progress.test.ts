import { afterEach, expect, it, vi } from "vitest";
import { capturePhase, progressReporter, type CaptureProgress } from "../src/capture-progress.js";
import { collectCommand, commandRedactor } from "../src/command-result.js";

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

it("emits waiting only while work is pending and clears timers on completion", async () => {
  vi.useFakeTimers();
  const events: CaptureProgress[] = [];
  let finish!: () => void;
  const pending = capturePhase(
    {
      onProgress: (event) => events.push(event),
    },
    "export",
    "render",
    () =>
      new Promise<void>((resolve) => {
        finish = resolve;
      }),
    "name\nwith control",
  );
  expect(events.map((event) => event.status)).toEqual([
    "started",
  ]);
  await vi.advanceTimersByTimeAsync(10000);
  expect(events.filter((event) => event.status === "waiting")).toHaveLength(2);
  finish();
  await pending;
  expect(events.at(-1)?.status).toBe("completed");
  expect(events.at(-1)?.elapsedMs).toBe(10000);
  await vi.advanceTimersByTimeAsync(15000);
  expect(events).toHaveLength(4);
  expect(vi.getTimerCount()).toBe(0);
});

it("clears waiting on cancellation even if the underlying request has not settled", async () => {
  vi.useFakeTimers();
  const controller = new AbortController();
  let finish!: () => void;
  const events: CaptureProgress[] = [];
  const pending = capturePhase(
    {
      signal: controller.signal,
      onProgress: (event) => events.push(event),
    },
    "export",
    "render",
    () =>
      new Promise<void>((resolve) => {
        finish = resolve;
      }),
  );
  controller.abort();
  await vi.advanceTimersByTimeAsync(10000);
  expect(events).toHaveLength(1);
  finish();
  await expect(pending).rejects.toThrow();
  expect(vi.getTimerCount()).toBe(0);
});

it("streams redacted JSON or quoted human names separately from the result and supports off", async () => {
  const stderr = vi.spyOn(console, "error").mockImplementation(() => undefined);
  const event: CaptureProgress = {
    schemaVersion: 1,
    kind: "progress",
    command: "export",
    phase: "render",
    status: "waiting",
    elapsedMs: 5000,
    frame: "line\nSECRET",
  };
  const result = await collectCommand("export", async () => {
    commandRedactor((text) => text.replaceAll("SECRET", "[redacted]"));
    progressReporter("json", "export")(event);
    progressReporter("off", "export")(event);
    progressReporter("human", "export")(event);
    return 0;
  });
  expect(stderr).toHaveBeenCalledTimes(2);
  expect(JSON.parse(String(stderr.mock.calls[0]?.[0])).frame).toBe("line\n[redacted]");
  expect(String(stderr.mock.calls[1]?.[0])).toContain('"line\\n[redacted]"');
  expect(result.warnings).toEqual([]);
  expect(result.messages).toEqual([]);
  expect(() => progressReporter("tail", "export")).toThrow("--progress");
});
