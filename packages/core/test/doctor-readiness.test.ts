import { afterEach, expect, it, vi } from "vitest";
import { doctorExternal } from "../src/instance/connection.js";
import { runCommand } from "../src/cli-main.js";
const config = { instance: "fixture", profile: { type: "external" as const, origin: "https://example.test" }, file: { id: "expected" } };
const answering = vi.fn(async () => ({ status: 200 })) as unknown as typeof fetch;
afterEach(() => vi.useRealTimers());
it("separates transport, fresh challenge, page identity and file pin observations", async () => {
 const challenges: string[] = [];
 for (let i = 0; i < 2; i++) {
  const result = await doctorExternal(config, { fetch: answering, mcp: { origin: config.profile.origin, connect: async request => { challenges.push(request!.challenge); request!.onTransport(); return { file: "Fixture", fileId: "wrong", pageId: "page", challenge: request!.challenge }; } } });
  expect(result.map(row => [row.layer, row.ok])).toEqual([["origin", true], ["transport", true], ["execution", true], ["file-pin", false]]);
  expect(result[2]).toMatchObject({ durationMs: expect.any(Number), observedAt: expect.any(String), evidence: { heartbeat: "unknown" } });
 }
 expect(challenges[0]).not.toBe(challenges[1]);
});
it.each(["stale", "missing-page", "old-probe"])("refuses %s execution evidence", async mode => {
 const result = await doctorExternal(config, { fetch: answering, mcp: { origin: config.profile.origin, connect: async request => {
  if (mode !== "old-probe") request!.onTransport();
  return { file: "Fixture", fileId: "expected", pageId: mode === "missing-page" ? undefined : "page", challenge: "stale" };
 } } });
 expect(result.find(row => row.layer === "execution")?.ok).toBe(false);
});
it("bounds a sleeping origin and a sleeping editor within one deadline", async () => {
 vi.useFakeTimers();
 for (const sleepOrigin of [true, false]) {
  const pending = doctorExternal(config, { timeoutMs: 1000, fetch: sleepOrigin ? (async () => new Promise(() => undefined)) as typeof fetch : answering, mcp: { origin: config.profile.origin, connect: async request => { request!.onTransport(); return new Promise(() => undefined); } } });
  await vi.runAllTimersAsync();
  expect((await pending).some(row => !row.ok && /deadline/i.test(row.detail))).toBe(true);
 }
});
it("redacts secret-bearing probe errors", async () => {
 const result = await doctorExternal(config, { fetch: answering, mcp: { origin: config.profile.origin, connect: async () => { throw new Error("https://example.test/mcp?userToken=PRIVATE"); } } });
 expect(JSON.stringify(result)).not.toContain("PRIVATE");
});
it.each(["999", "30001", "NaN", "1000.5"])("rejects invalid doctor timeout %s without connecting", async timeout => {
 expect((await runCommand(["doctor", "--timeout-ms", timeout])).exitCode).toBe(1);
});
