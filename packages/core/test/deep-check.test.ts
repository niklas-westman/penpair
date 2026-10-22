import { describe, expect, it } from "vitest";
import type { PenpotToolClient } from "../src/client.js";
import {
  deepCheckBody,
  deepLeftoversBody,
  formatDeepReport,
  runDeepCheck,
} from "../src/deep-check.js";
import { compiles, wrap } from "../src/snippet.js";
import { maxSnippetBytes } from "../src/client.js";

const reply = (result: unknown) => ({
  text: JSON.stringify({
    result,
    log: "",
  }),
  isError: false,
});

function editor(
  first: unknown,
  left: string[],
): PenpotToolClient & {
  codes: string[];
} {
  const codes: string[] = [];
  return {
    codes,
    async callTool(_name, args) {
      const code = String(args.code);
      codes.push(code);
      return reply(
        code.includes("readOnly: true, left")
          ? {
              ok: true,
              left,
            }
          : first,
      );
    },
    async close() {},
  };
}
const passing = {
  ok: true,
  penpotVersion: "2.18.3",
  cleanup: [
    "board: removed",
  ],
  steps: [
    "create board",
    "flex layout and children",
    "text content",
    "token set, token and binding",
    "component and swap",
    "clone",
    "export png",
  ].map((step) => ({
    step,
    ok: true,
    ms: 12,
    detail: "observed",
  })),
};

describe("the deep check's plugin code", () => {
  it("is valid and small, and names no project", () => {
    for (const body of [
      deepCheckBody,
      deepLeftoversBody,
    ]) {
      const code = wrap(body, {
        tag: "penpair-deep-abc123",
      });
      expect(compiles(code)).toBeUndefined();
      expect(Buffer.byteLength(code)).toBeLessThan(maxSnippetBytes);
      expect(code.toLowerCase()).not.toMatch(/sourcer|tradient|marwes/);
    }
  });

  it("waits for the token binding, which is recorded a few seconds after the call", () => {
    expect(deepCheckBody).toContain("rect.tokens.fill === token.name");
    expect(deepCheckBody).toMatch(/while \(Date\.now\(\) - t0 < 12000/);
  });

  it("tags everything it makes and removes the board, the token set and the components", () => {
    expect(deepCheckBody).toContain('tag + "-board"');
    expect(deepCheckBody).toContain('tag + "-set"');
    expect(deepCheckBody).toMatch(/c\.remove\(\)/);
    expect(deepCheckBody).toContain("made.set.remove()");
    expect(deepCheckBody).toContain("made.board.remove()");
  });
});

describe("running the deep check", () => {
  it("does not pass without the complete required observations", async () => {
    expect(
      (
        await runDeepCheck(
          editor(
            {
              ok: true,
              steps: [],
              cleanup: [],
            },
            [],
          ),
          {
            settleMs: 0,
          },
        )
      ).ok,
    ).toBe(false);
  });
  it("passes when every step works and nothing is left behind", async () => {
    const client = editor(passing, []);
    const report = await runDeepCheck(client, {
      settleMs: 0,
    });
    expect(report.ok).toBe(true);
    expect(report.tag).toMatch(/^penpair-deep-[0-9a-f]{6}$/);
    expect(client.codes.every((code) => code.includes(report.tag))).toBe(true);
    expect(formatDeepReport(report)).toMatch(/ok {3}clean-up: nothing left in the file/);
  });

  it("fails and names what to remove by hand when something is left", async () => {
    const report = await runDeepCheck(
      editor(passing, [
        "token set penpair-deep-x-set",
      ]),
      {
        settleMs: 0,
      },
    );
    expect(report.ok).toBe(false);
    expect(formatDeepReport(report)).toMatch(/FAIL clean-up: .*token set penpair-deep-x-set/);
  });

  it("fails on a failing step, and says which", async () => {
    const failing = {
      ...passing,
      steps: [
        ...passing.steps,
        {
          step: "component and swap",
          ok: false,
          ms: 5,
          detail: "the instance did not switch",
        },
      ],
    };
    const report = await runDeepCheck(editor(failing, []), {
      settleMs: 0,
    });
    expect(report.ok).toBe(false);
    expect(formatDeepReport(report)).toMatch(
      /FAIL component and swap \(5 ms\): the instance did not switch/,
    );
  });

  it("reports a check that could not run at all", async () => {
    await expect(
      runDeepCheck(
        editor(
          {
            ok: false,
            message: "no page",
          },
          [],
        ),
        {
          settleMs: 0,
        },
      ),
    ).rejects.toThrow(/could not run: no page/);
  });
});
