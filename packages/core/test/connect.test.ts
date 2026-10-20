import { mkdtemp, readFile, stat, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { validateProjectConfig } from "../src/instance/config.js";
import { belongsToProject, connectProject, ConnectError, keyFileCheck, parseMcpAddress, waitForEditor, writeKeyFile, type ConnectIo } from "../src/instance/connect.js";
import { init } from "../src/instance/init.js";
import type { Runner } from "../src/instance/runner.js";

const KEY = "SECRETTOKEN123";
const hostedUrl = `https://design.penpot.app/mcp/stream?userToken=${KEY}`;
const hosted = validateProjectConfig({ instance: "design", profile: { type: "external", origin: "https://design.penpot.app" } });
const local = validateProjectConfig({ instance: "x", penpotVersion: "2.18.3", ports: { frontend: 9002, mail: 1082 }, directory: ".penpair" });
const folder = (): Promise<string> => mkdtemp(path.join(os.tmpdir(), "penpair-connect-"));

function fakeIo(openFile: ConnectIo["openFile"], pasted = hostedUrl): { io: ConnectIo; said: string[]; asked: string[] } {
  const said: string[] = [];
  const asked: string[] = [];
  return {
    said,
    asked,
    io: {
      say: (line) => void said.push(line),
      askHidden: async (question) => {
        asked.push(question);
        return pasted;
      },
      sleep: async () => undefined,
      openFile,
    },
  };
}
const editor = async (): Promise<{ file: string; pages: string[] }> => ({ file: "Brand", pages: ["Login", "Candidate"] });

describe("parseMcpAddress", () => {
  it.each([
    [hostedUrl, "https://design.penpot.app"],
    [`  "${hostedUrl}"  `, "https://design.penpot.app"],
    [`PENPAIR_MCP_URL=${hostedUrl}`, "https://design.penpot.app"],
    [`export PENPAIR_MCP_URL='http://localhost:9002/mcp/stream?userToken=${KEY}'`, "http://localhost:9002"],
  ])("accepts %#", (pasted, origin) => {
    expect(parseMcpAddress(pasted).origin).toBe(origin);
  });

  it.each([
    ["not an address", /address/],
    ["ftp://x/mcp?userToken=a", /https/],
    ["https://design.penpot.app/#/workspace?userToken=a", /\/mcp/],
    ["https://design.penpot.app/mcp/stream", /key/],
  ])("rejects %s without repeating it", (pasted, message) => {
    try {
      parseMcpAddress(pasted);
      expect.unreachable();
    } catch (error) {
      expect(error).toBeInstanceOf(ConnectError);
      expect((error as Error).message).toMatch(message);
      expect((error as Error).message).not.toContain(pasted);
    }
  });
});

describe("which Penpot an address belongs to", () => {
  it("matches the origin of a web project and the port of a Docker one", () => {
    expect(belongsToProject("https://design.penpot.app", hosted)).toBe(true);
    expect(belongsToProject("https://penpot.example.org", hosted)).toBe(false);
    expect(belongsToProject("http://localhost:9002", local)).toBe(true);
    expect(belongsToProject("http://localhost:9001", local)).toBe(false);
  });
});

describe("the key file", () => {
  it("is created for the owner only, with git told to ignore it", async () => {
    const root = await folder();
    const result = await writeKeyFile(root, hostedUrl);
    expect(result).toEqual({ created: true, ignoreAdded: true });
    expect((await stat(path.join(root, ".env.local"))).mode & 0o777).toBe(0o600);
    expect(await readFile(path.join(root, ".gitignore"), "utf8")).toMatch(/^\.env\.local$/m);
  });

  it("replaces only its own line and keeps the rest, and does not add the ignore line twice", async () => {
    const root = await folder();
    await writeFile(path.join(root, ".env.local"), `OTHER=1\nPENPAIR_MCP_URL=old\n# note\n`);
    await writeKeyFile(root, hostedUrl);
    const second = await writeKeyFile(root, hostedUrl);
    expect(await readFile(path.join(root, ".env.local"), "utf8")).toBe(`OTHER=1\nPENPAIR_MCP_URL=${hostedUrl}\n# note\n`);
    expect(second.ignoreAdded).toBe(false);
    expect((await readFile(path.join(root, ".gitignore"), "utf8")).match(/\.env\.local/g)).toHaveLength(1);
  });

  it("is checked against git: ignored, not ignored, not a repository, no file", async () => {
    const root = await folder();
    const runner = (code: number): Runner => ({ run: async () => ({ code, stdout: "", stderr: "" }) });
    expect(await keyFileCheck(root, runner(0))).toBeUndefined();
    await writeFile(path.join(root, ".env.local"), "x\n");
    expect(await keyFileCheck(root, runner(0))).toMatchObject({ ok: true });
    expect(await keyFileCheck(root, runner(1))).toMatchObject({ ok: false, remedy: expect.stringContaining(".gitignore") });
    expect(await keyFileCheck(root, runner(128))).toMatchObject({ ok: true, detail: expect.stringContaining("not a git repository") });
  });
});

describe("waiting for the editor", () => {
  it("keeps trying, says what to do in the browser, and returns the file when it appears", async () => {
    let tries = 0;
    const { io, said } = fakeIo(async () => {
      if (++tries < 3) throw new Error("no plugin yet");
      return editor();
    });
    expect(await waitForEditor(hostedUrl, io, { intervalMs: 1000, remindMs: 1000 })).toMatchObject({ file: "Brand" });
    expect(said.join("\n")).toMatch(/File, then MCP Server, then Connect/);
  });

  it("gives up after the timeout", async () => {
    const { io } = fakeIo(async () => {
      throw new Error("never");
    });
    expect(await waitForEditor(hostedUrl, io, { timeoutMs: 5000, intervalMs: 1000 })).toBeUndefined();
  });
});

describe("connecting a project", () => {
  it("asks for the key, checks it, stores it, waits for the editor, and never says the key", async () => {
    const root = await folder();
    const { io, said, asked } = fakeIo(editor);
    const result = await connectProject(root, hosted, io);
    expect(result).toMatchObject({ keyWritten: true, file: "Brand", pages: ["Login", "Candidate"] });
    expect(asked).toHaveLength(1);
    expect(await readFile(path.join(root, ".env.local"), "utf8")).toContain(KEY);
    expect(said.join("\n")).not.toContain(KEY);
  });

  it("refuses a key for another Penpot and writes nothing", async () => {
    const root = await folder();
    const { io } = fakeIo(editor, `http://localhost:9001/mcp/stream?userToken=${KEY}`);
    await expect(connectProject(root, hosted, io)).rejects.toThrow(/belongs to http:\/\/localhost:9001/);
    await expect(readFile(path.join(root, ".env.local"), "utf8")).rejects.toThrow();
  });

  it("uses a key that is already there and belongs, unless told to replace it", async () => {
    const root = await folder();
    await writeKeyFile(root, hostedUrl);
    const first = fakeIo(editor);
    expect(await connectProject(root, hosted, first.io)).toMatchObject({ keyWritten: false });
    expect(first.asked).toHaveLength(0);
    const second = fakeIo(editor, `https://design.penpot.app/mcp/stream?userToken=NEWKEY`);
    expect(await connectProject(root, hosted, second.io, { replace: true })).toMatchObject({ keyWritten: true });
    expect(await readFile(path.join(root, ".env.local"), "utf8")).toContain("NEWKEY");
  });

  it("explains how to continue when the editor never shows up", async () => {
    const root = await folder();
    const { io } = fakeIo(async () => {
      throw new Error("tab suspended");
    });
    await expect(connectProject(root, hosted, io, { wait: { timeoutMs: 2000, intervalMs: 1000 } })).rejects.toThrow(/penpair connect/);
  });
});

describe("init with the gitignore flag for a web project", () => {
  it("also keeps the key file out of git", async () => {
    const root = await folder();
    const result = await init(root, { external: "https://design.penpot.app", instance: "design", gitignore: true });
    expect(result.gitignoreAdded).toBe(true);
    expect(await readFile(path.join(root, ".gitignore"), "utf8")).toMatch(/^\.env\.local$/m);
  });
});
