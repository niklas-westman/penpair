import { afterEach, expect, it, vi } from "vitest";
import { runCli, runCommand } from "@penpair/core";
import { marwesCommand } from "../src/commands.js";
import { fixture } from "./helpers.js";

afterEach(() => { vi.restoreAllMocks(); vi.unstubAllEnvs(); });
it("uses the core envelope for real adapter snapshot/check/status commands", async () => {
  const f = await fixture();
  vi.spyOn(process, "cwd").mockReturnValue(f.root);
  vi.spyOn(console, "error").mockImplementation(() => undefined);
  const output = vi.spyOn(console, "log").mockImplementation(() => undefined);
  const options = { adapters: [{ name: "test", commands: [marwesCommand] }] };
  expect(await runCommand(["marwes", "tokens", "snapshot"], options)).toMatchObject({ schemaVersion: 1, outcome: "drift", exitCode: 2 });
  expect(await runCli(["marwes", "tokens", "snapshot", "--write", "--json"], options)).toBe(0);
  expect(output).toHaveBeenCalledTimes(1);
  expect(JSON.parse(String(output.mock.calls[0]![0]))).toMatchObject({ outcome: "success", data: { current: true, written: true } });
  expect(await runCommand(["marwes", "tokens", "check"], options)).toMatchObject({ outcome: "success", data: { current: true } });
  vi.stubEnv("PENPAIR_MCP_URL", "not-a-url");
  expect(await runCommand(["marwes", "tokens", "status"], options)).toMatchObject({ outcome: "incomplete", exitCode: 3, completeness: { complete: false }, data: { penpotInSync: null } });
  expect(await runCommand(["marwes", "tokens", "check", "--apply"], options)).toMatchObject({ outcome: "failed" });
});
