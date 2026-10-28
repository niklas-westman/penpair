import { mkdtemp, readFile, writeFile, readdir } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  clearDeadLocks,
  describeCommand,
  guardRevision,
  listLocks,
  writeCoordinator,
} from "../src/coordination.js";
import { onboardingChecklist } from "../src/onboard.js";
import { runSnippet, snippet } from "../src/snippet.js";
import type { PenpotToolClient } from "../src/client.js";

const folder = () => mkdtemp(path.join(os.tmpdir(), "penpair-lock-"));
const target = {
  fileId: "file",
  revision: 1,
};
const AsyncFunction = Object.getPrototypeOf(async function () {}).constructor;
function editor() {
  let marker = "";
  const file = {
    id: "file",
    revn: 1,
    getSharedPluginData: () => marker,
    setSharedPluginData: (_namespace: string, _key: string, value: string) => {
      marker = value;
      file.revn++;
    },
  };
  const penpot = {
    currentFile: file,
    writes: 0,
  };
  const client: PenpotToolClient = {
    async callTool(_name, args) {
      return {
        text: JSON.stringify({
          result: await new AsyncFunction("penpot", String(args.code))(penpot),
          log: "",
        }),
        isError: false,
      };
    },
    async close() {},
  };
  return {
    client,
    penpot,
    marker: () => marker,
    setMarker: (value: string) => {
      marker = value;
    },
  };
}

describe("write coordination", () => {
  it("acquires, independently checks and releases both markers", async () => {
    const e = editor();
    const root = await folder();
    const lease = await writeCoordinator(e.client, {
      root,
      operation: "test",
    })("run-a", target);
    expect(JSON.parse(e.marker())).toMatchObject({
      runId: "run-a",
      operation: "test",
    });
    await lease.check();
    await lease.release();
    expect(e.marker()).toBe("");
    expect(await readdir(path.join(root, ".penpair/locks"))).toEqual([]);
    expect(await readFile(path.join(root, ".gitignore"), "utf8")).toContain(".penpair/");
  });
  it("refuses another local live process even with force", async () => {
    const e = editor();
    const root = await folder();
    const first = await writeCoordinator(e.client, {
      root,
      operation: "first",
    })("run-a", target);
    await expect(
      writeCoordinator(e.client, {
        root,
        operation: "second",
        forceLock: true,
      })("run-b", target),
    ).rejects.toThrow(/still running/);
    await first.release();
  });
  it("refuses an active shared marker from another checkout unless explicitly overridden", async () => {
    const e = editor();
    const first = await writeCoordinator(e.client, {
      root: await folder(),
      operation: "first",
    })("run-a", target);
    await expect(
      writeCoordinator(e.client, {
        root: await folder(),
        operation: "second",
      })("run-b", target),
    ).rejects.toThrow(/Another writer/);
    const second = await writeCoordinator(e.client, {
      root: await folder(),
      operation: "second",
      forceLock: true,
    })("run-b", target);
    await expect(first.check()).rejects.toThrow(/lost or expired/);
    await first.release();
    expect(JSON.parse(e.marker()).runId).toBe("run-b");
    await second.release();
  });
  it("replaces an expired remote marker and detects lease expiry before further steps", async () => {
    const e = editor();
    e.setMarker(
      JSON.stringify({
        runId: "old",
        expiresAt: Date.now() - 1,
      }),
    );
    const lease = await writeCoordinator(e.client, {
      root: await folder(),
      operation: "test",
    })("new", target);
    e.setMarker(
      JSON.stringify({
        ...JSON.parse(e.marker()),
        expiresAt: 0,
      }),
    );
    await expect(lease.check()).rejects.toThrow(/expired/);
    await lease.release();
  });
  it("does not overwrite malformed shared data, even with force", async () => {
    const e = editor();
    e.setMarker("broken");
    await expect(
      writeCoordinator(e.client, {
        root: await folder(),
        operation: "test",
        forceLock: true,
      })("new", target),
    ).rejects.toThrow(/Malformed/);
    expect(e.marker()).toBe("broken");
  });
  it("can remove a dead local lock only with explicit force", async () => {
    const e = editor();
    const root = await folder();
    const first = await writeCoordinator(e.client, {
      root,
      operation: "first",
    })("old", target);
    const lock = path.join(
      root,
      ".penpair/locks",
      (await readdir(path.join(root, ".penpair/locks")))[0]!,
    );
    const record = JSON.parse(await readFile(lock, "utf8"));
    await writeFile(
      lock,
      JSON.stringify({
        ...record,
        host: "abandoned-host",
      }),
    );
    await expect(
      writeCoordinator(e.client, {
        root,
        operation: "new",
      })("new", target),
    ).rejects.toThrow(/abandoned/);
    const second = await writeCoordinator(e.client, {
      root,
      operation: "new",
      forceLock: true,
    })("new", target);
    // A forced takeover changes the token, so the old release cannot clear the new lock.
    await first.release();
    await second.release();
  });
  it("names the run, operation and command of the writer that holds the lock", async () => {
    const e = editor();
    const root = await folder();
    const first = await writeCoordinator(e.client, {
      root,
      operation: "build-log",
    })("run-one", target);
    await expect(
      writeCoordinator(e.client, {
        root,
        operation: "second",
      })("run-two", target),
    ).rejects.toThrow(
      /run-one \(operation build-log, pid \d+ on .*since .*\) holds this file.*duplicate background run/,
    );
    await first.release();
  });
  it("keeps credentials out of the command a lock names", () => {
    expect(
      describeCommand([
        "export",
        "x",
        "--url",
        "https://h/mcp?userToken=SECRET&a=1",
      ]),
    ).not.toContain("SECRET");
  });
  it("clears only locks whose process is gone on this host", async () => {
    const e = editor();
    const root = await folder();
    const first = await writeCoordinator(e.client, {
      root,
      operation: "first",
    })("old", target);
    const lock = path.join(
      root,
      ".penpair/locks",
      (await readdir(path.join(root, ".penpair/locks")))[0]!,
    );
    const record = JSON.parse(await readFile(lock, "utf8"));
    expect((await listLocks(root))[0]).toMatchObject({
      status: "running",
    });
    expect(await clearDeadLocks(root)).toMatchObject({
      cleared: [],
    });
    await writeFile(
      lock,
      JSON.stringify({
        ...record,
        pid: 2 ** 22 + 12345,
      }),
    );
    expect((await listLocks(root))[0]).toMatchObject({
      status: "dead",
    });
    const outcome = await clearDeadLocks(root);
    expect(outcome.cleared).toHaveLength(1);
    expect(await listLocks(root)).toEqual([]);
    await writeFile(
      lock,
      JSON.stringify({
        ...record,
        host: "another-host",
      }),
    );
    expect((await clearDeadLocks(root)).kept[0]).toMatchObject({
      status: "foreign",
    });
    expect(await listLocks(root)).toHaveLength(1);
    await first.release().catch(() => undefined);
  });
  it("checks revision inside the mutation before touching content", async () => {
    const e = editor();
    e.penpot.currentFile.revn = 2;
    await expect(
      runSnippet(
        guardRevision(e.client, target),
        snippet("write", "penpot.writes++; return {ok:true};", {}, "write"),
      ),
    ).rejects.toThrow(/revision changed/);
    expect(e.penpot.writes).toBe(0);
  });
});

it("builds a personal-key onboarding checklist from the pinned config", () => {
  const report = onboardingChecklist({
    instance: "shared",
    profile: {
      type: "external",
      origin: "https://example.test",
    },
    file: {
      id: "file",
      name: "Shared",
    },
  });
  expect(report.fileUrl).toBe("https://example.test/#/workspace?file-id=file");
  expect(report.steps.join(" ")).toMatch(/own personal MCP key/);
  expect(report.steps.join(" ")).toMatch(/doctor --json/);
  expect(report.warnings.join(" ")).toMatch(/advisory/);
});
