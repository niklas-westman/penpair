import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  applyPlan,
  compareToPenpot,
  formatDrift,
  inBatches,
  planPush,
  readLive,
  type LiveTokens,
} from "../src/penpot.js";
import { buildSnapshot, type PenpotToken } from "../src/tokens.js";
import { loadInstalledMarwes } from "../src/marwes.js";
import { fakePenpot, fixture, acmeThemes } from "./helpers.js";

describe("independent token verification evidence", () => {
  const missing = {
    callTool: async () => ({
      text: JSON.stringify({
        result: {
          ok: true,
        },
        log: "",
      }),
      isError: false,
    }),
    close: async () => undefined,
  };
  it("rejects an empty token readback", async () => {
    await expect(readLive(missing)).rejects.toThrow(/not verified/);
  });
  it("rejects a missing structure fingerprint before any planned write", async () => {
    await expect(
      applyPlan(missing, await expected(), [], undefined, {
        layout: false,
      }),
    ).rejects.toThrow(/count and hash/);
  });
});

async function expected(themes = acmeThemes) {
  const f = await fixture();
  const installed = await loadInstalledMarwes(path.join(f.root, "packages/app"));
  return buildSnapshot({
    core: installed.core,
    version: installed.version,
    name: "Acme",
    project: themes,
    generatedBy: "test",
  });
}

/** What Penpot would hold if the expectation had been pushed: the same tokens, typography normalised the way Penpot stores it. */
function liveFrom(
  snapshot: Awaited<ReturnType<typeof expected>>,
  activeTheme = "Light",
): LiveTokens {
  return {
    sets: snapshot.sets.map((s, order) => ({
      order,
      name: s.name,
      active: false,
      tokens: s.tokens.map((t) => ({
        name: t.name,
        type: t.type,
        description: t.description,
        value:
          t.type === "typography"
            ? Object.fromEntries(
                Object.entries(t.value as Record<string, string>).map(([k, v]) =>
                  k === "fontFamilies"
                    ? [
                        "fontFamily",
                        [
                          v,
                        ],
                      ]
                    : [
                        k,
                        v,
                      ],
                ),
              )
            : t.value,
      })),
    })),
    themes: snapshot.themes.map((t) => ({
      group: t.group,
      name: t.name,
      active: t.name === activeTheme,
      sets: t.sets,
    })),
  };
}

describe("comparing the file with the expectation", () => {
  it("finds nothing when Penpot holds what was expected, typography stored the way Penpot stores it included", async () => {
    const snapshot = await expected();
    expect(compareToPenpot(snapshot, liveFrom(snapshot)).inSync).toBe(true);
  });

  it("finds a missing set, a missing token, a value changed by hand, a token added by hand, and an old description", async () => {
    const snapshot = await expected();
    const live = liveFrom(snapshot);
    live.sets = live.sets.filter((s) => s.name !== "Acme · Dark");
    const core = live.sets.find((s) => s.name === "Marwes · Core")!;
    core.tokens = core.tokens.filter((t) => t.name !== "mw-color-text");
    core.tokens.find((t) => t.name === "mw-color-background")!.value = "#FAFAFA";
    core.tokens.find((t) => t.name === "mw-spacing-sp-4")!.description =
      "--mw-spacing-sp-4 (Marwes 1.10.0)";
    core.tokens.push({
      name: "my-own",
      type: "color",
      value: "#123456",
      description: "",
    });
    const drift = compareToPenpot(snapshot, live);
    expect(drift.inSync).toBe(false);
    expect(drift.sets.find((s) => s.set === "Acme · Dark")).toMatchObject({
      missing: true,
    });
    expect(drift.sets.find((s) => s.set === "Marwes · Core")!.tokens).toEqual(
      expect.arrayContaining([
        {
          name: "mw-color-text",
          kind: "missing",
        },
        {
          name: "mw-color-background",
          kind: "value",
          expected: "#FFFFFF",
          actual: "#FAFAFA",
        },
        {
          name: "my-own",
          kind: "extra",
        },
        expect.objectContaining({
          name: "mw-spacing-sp-4",
          kind: "description",
        }),
      ]),
    );
  });

  it("says what a changed token reaches when it knows how many shapes use it", async () => {
    const snapshot = await expected();
    const live = liveFrom(snapshot);
    live.sets
      .find((s) => s.name === "Marwes · Core")!
      .tokens.find((t) => t.name === "mw-color-primary-base")!.value = "#000000";
    const lines = formatDrift(compareToPenpot(snapshot, live), {
      "mw-color-primary-base": 143,
    });
    expect(lines.join("\n")).toMatch(
      /mw-color-primary-base is #000000, expected #2F31FC \(used by 143 shapes\)/,
    );
  });

  it("notices a theme that is missing or built from other sets, and a managed set that is no longer expected", async () => {
    const snapshot = await expected();
    const live = liveFrom(snapshot);
    live.themes = live.themes.filter((t) => t.name !== "Dark");
    live.themes.find((t) => t.name === "Light")!.sets = [
      "Marwes · Core",
      "My brand",
    ];
    live.sets.push(
      {
        order: 9,
        name: "Marwes · Old",
        active: false,
        tokens: [],
      },
      {
        order: 10,
        name: "My brand",
        active: false,
        tokens: [],
      },
    );
    const drift = compareToPenpot(snapshot, live);
    expect(drift.themes).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          theme: "Mode/Dark",
          missing: true,
        }),
        {
          theme: "Mode/Light",
          missingSets: [
            "Acme · Light",
          ],
          extraSets: [],
        },
      ]),
    );
    expect(drift.unexpectedSets).toEqual([]); // Names never establish ownership.
  });
});

describe("the plan", () => {
  it("builds everything in an empty file, and activates Light because no theme is active", async () => {
    const snapshot = await expected();
    const plan = planPush(snapshot, {
      sets: [],
      themes: [],
    });
    expect(plan.map((a) => a.kind)).toEqual([
      "createSet",
      "addTokens",
      "createSet",
      "addTokens",
      "createSet",
      "addTokens",
      "createSet",
      "addTokens",
      "createTheme",
      "createTheme",
      "activateTheme",
    ]);
    expect(plan.at(-1)).toMatchObject({
      kind: "activateTheme",
      name: "Light",
    });
  });

  it("leaves the project's active theme alone", async () => {
    const snapshot = await expected();
    const live = liveFrom(snapshot);
    live.themes = [];
    live.themes.push({
      group: "Mode",
      name: "Dark",
      active: true,
      sets: [],
    });
    expect(planPush(snapshot, live).some((a) => a.kind === "activateTheme")).toBe(false);
  });

  it("updates plain values in place, but removes and adds a typography token again, because assigning it stores it un-normalised", async () => {
    const snapshot = await expected();
    const live = liveFrom(snapshot);
    const core = live.sets.find((s) => s.name === "Marwes · Core")!;
    core.tokens.find((t) => t.name === "mw-color-text")!.value = "#000000";
    (
      core.tokens.find((t) => t.name === "mw-typography-h1")!.value as Record<string, unknown>
    ).fontSize = "50";
    const plan = planPush(snapshot, live);
    expect(plan).toEqual([
      expect.objectContaining({
        kind: "updateTokens",
        set: "Marwes · Core",
        tokens: [
          expect.objectContaining({
            name: "mw-color-text",
          }),
        ],
      }),
      expect.objectContaining({
        kind: "replaceTokens",
        set: "Marwes · Core",
        tokens: [
          expect.objectContaining({
            name: "mw-typography-h1",
          }),
        ],
      }),
    ]);
  });

  it("preserves unowned hand additions even with prune, and never touches an unmanaged set", async () => {
    const snapshot = await expected();
    const live = liveFrom(snapshot);
    live.sets
      .find((s) => s.name === "Marwes · Core")!
      .tokens.push({
        name: "my-own",
        type: "color",
        value: "#123456",
        description: "",
      });
    live.sets.push({
      order: 9,
      name: "My brand",
      active: false,
      tokens: [
        {
          name: "x",
          type: "color",
          value: "#000000",
          description: "",
        },
      ],
    });
    expect(planPush(snapshot, live)).toEqual([]);
    expect(
      planPush(snapshot, live, {
        prune: true,
      }),
    ).toEqual([]);
  });

  it("splits long token lists into batches that stay under the request limit", () => {
    const tokens: PenpotToken[] = Array.from(
      {
        length: 130,
      },
      (_, i) => ({
        name: `t${i}`,
        type: "color",
        value: "#000000",
        description: "d".repeat(100),
      }),
    );
    const batches = inBatches(tokens);
    expect(batches.length).toBeGreaterThanOrEqual(4);
    expect(batches.every((b) => b.length <= 40 && JSON.stringify(b).length < 46_000)).toBe(true);
    const big: PenpotToken[] = Array.from(
      {
        length: 30,
      },
      (_, i) => ({
        name: `b${i}`,
        type: "color",
        value: "#000000",
        description: "x".repeat(4000),
      }),
    );
    expect(inBatches(big).every((b) => JSON.stringify(b).length < 46_000)).toBe(true);
    expect(inBatches(big).flat()).toHaveLength(30);
  });
});

describe("pushing to a Penpot", () => {
  const bound = () => [
    {
      id: "s1",
      type: "board",
      name: "Dashboard",
      x: 0,
      y: 0,
      width: 1440,
      height: 900,
      tokens: {
        fill: "mw-color-background",
      },
      children: [
        {
          id: "s2",
          type: "text",
          name: "Title",
          x: 10,
          y: 10,
          width: 200,
          height: 40,
          tokens: {
            typography: "mw-typography-h1",
            fill: "mw-color-primary-base",
          },
        },
      ],
    },
  ];

  it("builds the sets and themes in an empty file, verifies the result, and moves no shape", async () => {
    const snapshot = await expected();
    const penpot = fakePenpot(bound());
    const report = await applyPlan(
      penpot.client,
      snapshot,
      planPush(snapshot, await readLive(penpot.client)),
    );
    expect(report.verified).toBe(true);
    expect(report.structureUnchanged).toBe(true);
    expect(report.structureBefore.count).toBe(2);
    expect(
      penpot.sets.map((s) => [
        s.name,
        s.active,
      ]),
    ).toEqual([
      [
        "Marwes · Core",
        false,
      ],
      [
        "Marwes · Dark",
        false,
      ],
      [
        "Acme · Light",
        false,
      ],
      [
        "Acme · Dark",
        false,
      ],
    ]);
    expect(
      penpot.themes.map((t) => [
        t.name,
        t.active,
        t.activeSets.map((s) => s.name),
      ]),
    ).toEqual([
      [
        "Light",
        true,
        [
          "Marwes · Core",
          "Acme · Light",
        ],
      ],
      [
        "Dark",
        false,
        [
          "Marwes · Core",
          "Marwes · Dark",
          "Acme · Dark",
        ],
      ],
    ]);
    expect(planPush(snapshot, await readLive(penpot.client))).toEqual([]);
  });

  it("puts back a value changed by hand, and stores a replaced typography token the way Penpot does", async () => {
    const snapshot = await expected();
    const penpot = fakePenpot(bound());
    await applyPlan(penpot.client, snapshot, planPush(snapshot, await readLive(penpot.client)));
    const core = penpot.sets.find((s) => s.name === "Marwes · Core")!;
    core.tokens.find((t) => t.name === "mw-color-text")!.value = "#000000";
    core.tokens.find((t) => t.name === "mw-typography-h1")!.value = {
      fontFamilies: "Wrong",
      fontSize: "99",
    };
    const live = await readLive(penpot.client);
    expect(
      compareToPenpot(snapshot, live)
        .sets[0]!.tokens.map((t) => t.name)
        .sort(),
    ).toEqual([
      "mw-color-text",
      "mw-typography-h1",
    ]);
    const report = await applyPlan(penpot.client, snapshot, planPush(snapshot, live));
    expect(report.verified).toBe(true);
    expect(core.tokens.find((t) => t.name === "mw-color-text")!.value).toBe("#141414");
    expect(core.tokens.find((t) => t.name === "mw-typography-h1")!.value).toMatchObject({
      fontFamily: [
        "Instrument Sans",
      ],
      fontSize: "44",
    });
  });

  it("replays an already-satisfied plan without failing", async () => {
    const snapshot = await expected();
    const penpot = fakePenpot();
    const plan = planPush(snapshot, await readLive(penpot.client));
    expect(plan.length).toBeGreaterThan(0);
    expect((await applyPlan(penpot.client, snapshot, plan)).verified).toBe(true);
    // The same plan again: every set, token and theme it names now exists. A
    // resumed or stale plan must not turn that into a failure.
    const again = await applyPlan(penpot.client, snapshot, plan);
    expect(again.verified).toBe(true);
    expect(planPush(snapshot, await readLive(penpot.client))).toEqual([]);
  });

  it("keeps what was added by hand even when pruning without ownership history", async () => {
    const snapshot = await expected();
    const penpot = fakePenpot();
    await applyPlan(penpot.client, snapshot, planPush(snapshot, await readLive(penpot.client)));
    penpot.sets[0]!.addToken({
      type: "color",
      name: "my-own",
      value: "#123456",
    });
    expect(planPush(snapshot, await readLive(penpot.client))).toEqual([]);
    const live = await readLive(penpot.client);
    expect(
      (
        await applyPlan(
          penpot.client,
          snapshot,
          planPush(snapshot, live, {
            prune: true,
          }),
        )
      ).verified,
    ).toBe(true);
    expect(penpot.sets[0]!.tokens.some((t) => t.name === "my-own")).toBe(true);
  });

  it("stops at a token Penpot rejects and says which, instead of carrying on", async () => {
    const snapshot = await expected();
    const penpot = fakePenpot();
    penpot.rejectToken("mw-color-text");
    await expect(
      applyPlan(penpot.client, snapshot, planPush(snapshot, await readLive(penpot.client))),
    ).rejects.toThrow(/mw-color-text: value rejected[\s\S]*Nothing after this was written/);
    expect(penpot.themes).toEqual([]);
  });

  it("reports a change of structure as a failed verification", async () => {
    const snapshot = await expected();
    const penpot = fakePenpot(bound());
    const plan = planPush(snapshot, await readLive(penpot.client));
    const original = penpot.client.callTool.bind(penpot.client);
    let moved = false;
    penpot.client.callTool = async (name, args) => {
      const outcome = await original(name, args);
      if (
        !moved &&
        String(
          (
            args as {
              code: string;
            }
          ).code,
        ).includes("marwes-tokens-structure") === false &&
        String(
          (
            args as {
              code: string;
            }
          ).code,
        ).includes("addTheme")
      ) {
        moved = true;
        penpot.shapes[0]!.x = 999;
      }
      return outcome;
    };
    const report = await applyPlan(penpot.client, snapshot, plan);
    expect(report.structureUnchanged).toBe(false);
    expect(report.verified).toBe(false);
  });
});
