import { mkdtemp, readFile, readdir, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  loadConfig,
  readRawConfig,
  type AdapterContext,
  type PenpotToolClient,
} from "@penpair/core";
import {
  assertSafeDestruction,
  ownershipReport,
  readSyncAncestor,
  saveSyncAncestor,
} from "../src/ownership.js";
import { applyPlan, planPush, readLive, type LiveTokens } from "../src/penpot.js";
import { marwesCommand } from "../src/commands.js";
import type { TokenSnapshot } from "../src/tokens.js";
import { fixture, fakePenpot } from "./helpers.js";

const token = {
  name: "radius",
  type: "borderRadius" as const,
  value: "8",
  description: "radius",
};
function snapshot(value = "8"): TokenSnapshot {
  return {
    schemaVersion: 2,
    marwesVersion: "1",
    generatedBy: "test",
    project: "Acme",
    hash: "hash",
    unmapped: [],
    sets: [
      {
        name: "Project",
        tokens: [
          {
            ...token,
            value,
          },
        ],
      },
    ],
    themes: [],
    ownership: {
      Project: "project",
    },
  };
}
function live(value = "8"): LiveTokens {
  return {
    sets: [
      {
        name: "Project",
        order: 0,
        active: true,
        tokens: [
          {
            ...token,
            value,
          },
        ],
      },
    ],
    themes: [],
  };
}

describe("token ownership and three-way decisions", () => {
  it.each([
    [
      "upstream",
      "10",
      "8",
      "upstream",
    ],
    [
      "designer",
      "8",
      "12",
      "designer",
    ],
    [
      "conflicting",
      "10",
      "12",
      "conflict",
    ],
  ])("classifies %s-only property changes", (_label, desired, actual, kind) => {
    const report = ownershipReport(snapshot(desired), live(actual), snapshot());
    expect(report.changes).toEqual([
      expect.objectContaining({
        property: "value",
        kind,
      }),
    ]);
    expect(report.blockers.length).toBe(kind === "upstream" ? 0 : 1);
  });
  it("accepts convergent changes but refuses untracked replacement and never guesses a rename", () => {
    expect(ownershipReport(snapshot("10"), live("10"), snapshot()).blockers).toEqual([]);
    expect(ownershipReport(snapshot("10"), live()).blockers[0]?.kind).toBe("untracked");
    const desired = snapshot();
    desired.sets[0]!.tokens[0]!.name = "new-radius";
    const report = ownershipReport(desired, live(), snapshot());
    expect(new Set(report.changes.map((change) => change.name))).toEqual(
      new Set([
        "radius",
        "new-radius",
      ]),
    );
    expect(report.blockers).toEqual([]);
    expect(
      planPush(desired, live(), {
        prune: true,
        ancestor: snapshot(),
      }),
    ).toEqual([
      expect.objectContaining({
        kind: "addTokens",
      }),
      {
        kind: "removeTokens",
        set: "Project",
        names: [
          "radius",
        ],
      },
    ]);
  });
  it("preserves unowned tokens, sets and theme membership while retaining declared project ownership", () => {
    const desired = snapshot();
    const actual = live();
    actual.sets[0]!.tokens.push({
      ...token,
      name: "manual",
    });
    actual.sets.push({
      name: "Handmade",
      order: 1,
      active: true,
      tokens: [],
    });
    desired.themes = [
      {
        group: "Mode",
        name: "Light",
        sets: [
          "Project",
        ],
      },
    ];
    actual.themes = [
      {
        group: "Mode",
        name: "Light",
        active: true,
        sets: [
          "Project",
          "Handmade",
        ],
      },
    ];
    const report = ownershipReport(desired, actual, desired);
    expect(report).toMatchObject({
      blockers: [],
      unmanagedSets: [
        "Handmade",
      ],
      unmanagedTokens: [
        {
          set: "Project",
          name: "manual",
        },
      ],
    });
    expect(
      planPush(desired, actual, {
        prune: true,
        ancestor: desired,
      }),
    ).toEqual([]);
  });
  it("refuses cross-set retained references and bound type replacements regardless of overwrite decisions", () => {
    const actual = live();
    actual.sets.push({
      name: "Unmanaged",
      order: 1,
      active: true,
      tokens: [
        {
          ...token,
          name: "alias",
          value: "{radius} * 2",
        },
      ],
    });
    expect(() =>
      assertSafeDestruction(
        [
          {
            kind: "removeTokens",
            set: "Project",
            names: [
              "radius",
            ],
          },
        ],
        actual,
      ),
    ).toThrow(/Unmanaged\/alias/);
    expect(() =>
      assertSafeDestruction(
        [
          {
            kind: "replaceTokens",
            set: "Project",
            tokens: [
              {
                ...token,
                type: "color",
                value: "#fff",
              },
            ],
          },
        ],
        live(),
        {
          radius: 1,
        },
      ),
    ).toThrow(/bound/);
  });
  it("rechecks dependencies inside the actual delivered deletion", async () => {
    const f = fakePenpot();
    const ancestor = snapshot();
    await applyPlan(f.client, ancestor, planPush(ancestor, await readLive(f.client)));
    const desired = snapshot();
    desired.sets[0]!.tokens = [];
    const actions = planPush(desired, await readLive(f.client), {
      prune: true,
      ancestor,
    });
    let injected = false;
    const client: PenpotToolClient = {
      ...f.client,
      async callTool(name, args, options) {
        if (!injected && String(args.code).includes("const live=await")) {
          injected = true;
          f.sets[0]!.addToken({
            ...token,
            name: "late-alias",
            value: "{radius}",
          });
        }
        return f.client.callTool(name, args, options);
      },
    };
    await expect(
      applyPlan(client, desired, actions, undefined, {
        ancestor,
        prune: true,
      }),
    ).rejects.toThrow(/referenced/);
    expect(f.sets[0]!.tokens.some((t) => t.name === "radius")).toBe(true);
  });
  it("pins private ancestors to a file and rejects tampering instead of treating it as first sync", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "penpair-ancestor-"));
    expect(await readSyncAncestor(root, "f")).toBeUndefined();
    await saveSyncAncestor(root, "f", snapshot());
    expect(await readSyncAncestor(root, "f")).toEqual(snapshot());
    expect(await readSyncAncestor(root, "another-file")).toBeUndefined();
    expect(await readFile(path.join(root, ".gitignore"), "utf8")).toMatch(/\.penpair\//);
    const directory = path.join(root, ".penpair/token-sync");
    const file = path.join(directory, (await readdir(directory))[0]!);
    const record = JSON.parse(await readFile(file, "utf8"));
    record.snapshot.sets[0].tokens[0].value = "tampered";
    await writeFile(file, JSON.stringify(record));
    await expect(readSyncAncestor(root, "f")).rejects.toThrow(/Invalid token-sync/);
  });
  it("preserves newer ancestry and carries inspection identity into apply", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "penpair-ancestor-cas-"));
    const old = snapshot();
    const next = snapshot("10");
    await saveSyncAncestor(root, "f", old);
    await expect(saveSyncAncestor(root, "f", next)).rejects.toThrow(/advanced concurrently/);
    expect(await readSyncAncestor(root, "f")).toEqual(old);
    await saveSyncAncestor(root, "f", next, old);
    expect(await readSyncAncestor(root, "f")).toEqual(next);
    const f = fakePenpot();
    await expect(
      applyPlan(
        f.client,
        old,
        planPush(old, {
          sets: [],
          themes: [],
        }),
        undefined,
        {
          expectedFileId: "different-file",
        },
      ),
    ).rejects.toThrow(/file/i);
    expect(f.sets).toEqual([]);
  });
  it("exports adoption evidence for review without silently changing the design or declaring it synced", async () => {
    const project = await fixture();
    const f = fakePenpot();
    const messages: unknown[] = [];
    const context: AdapterContext = {
      root: project.root,
      config: await loadConfig(project.root),
      rawConfig: await readRawConfig(project.root),
      log: () => {},
      withPenpot: (work) => work(f.client),
      output: {
        log: (...args: unknown[]) => {
          messages.push(args);
        },
        error: (...args: unknown[]) => {
          messages.push(args);
        },
        result: (data) => {
          messages.push(data);
        },
      },
    };
    expect(
      await marwesCommand.run(context, [
        "tokens",
        "snapshot",
        "--write",
      ]),
    ).toBe(0);
    expect(
      await marwesCommand.run(context, [
        "tokens",
        "push",
        "--apply",
      ]),
    ).toBe(0);
    const ancestor = await readSyncAncestor(project.root, "fixture-file");
    f.sets[0]!.tokens[0]!.value = "designer-value";
    expect(
      await marwesCommand.run(context, [
        "tokens",
        "push",
        "--adopt",
        "design/adoption.json",
      ]),
    ).toBe(3);
    expect(
      JSON.parse(await readFile(path.join(project.root, "design/adoption.json"), "utf8")),
    ).toMatchObject({
      kind: "token-adoption-proposal",
      ownership: {
        blockers: expect.any(Array),
      },
    });
    expect(f.sets[0]!.tokens[0]!.value).toBe("designer-value");
    expect(await readSyncAncestor(project.root, "fixture-file")).toEqual(ancestor);
    expect(
      await marwesCommand.run(context, [
        "tokens",
        "push",
        "--apply",
      ]),
    ).toBe(2);
  });
});
