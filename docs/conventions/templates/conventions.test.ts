import { describe, expect, it } from "vitest";
import { compiles } from "../../../packages/core/src/snippet.js";
import { findInvalidCodeDirectories } from "../../../scripts/check-code-paths.mjs";
import { formatFrameLabel } from "./frame-label.js";
import { createFrameInspection } from "./frame-inspection.js";
import { exampleStatusCommand } from "./adapter-command.js";
import type { AdapterContext } from "../../../packages/core/src/adapters.js";

describe("convention examples", () => {
  it("normalizes names and refuses incomplete labels", () => {
    expect(
      formatFrameLabel({
        pageName: " Dashboard ",
        frameName: " Empty ",
      }),
    ).toBe("Dashboard / Empty");
    expect(() =>
      formatFrameLabel({
        pageName: " ",
        frameName: "Empty",
      }),
    ).toThrow("requires");
  });

  it("compiles and executes the generated read-only sandbox body", async () => {
    const inspection = createFrameInspection("Empty");
    expect(compiles(inspection.code)).toBeUndefined();
    const AsyncFunction = Object.getPrototypeOf(async function () {}).constructor;
    const executeInspection = new AsyncFunction("penpot", inspection.code);
    const frame = {
      id: "frame-1",
      type: "board",
      name: "Empty",
    };

    expect(
      await executeInspection({
        currentPage: {
          children: [
            frame,
          ],
        },
      }),
    ).toEqual({
      ok: true,
      frameId: "frame-1",
      frameName: "Empty",
    });
    expect(
      await executeInspection({
        currentPage: {
          children: [
            frame,
            frame,
          ],
        },
      }),
    ).toMatchObject({
      ok: false,
    });
  });

  it("checks new code folders while leaving data paths outside the code rule", () => {
    expect(
      findInvalidCodeDirectories([
        "packages/core/src/capture-validation.ts",
        "examples/browser-capture/provider.mjs",
        "docs/conventions/templates/frame-label.ts",
        "docs/trials/ImportedEvidence/report.json",
      ]),
    ).toEqual([]);
    expect(
      findInvalidCodeDirectories([
        "packages/core/src/captureHelpers/geometry.ts",
        "packages/core/src/captureHelpers/fonts.ts",
        "examples/BrowserCapture/provider.mjs",
      ]),
    ).toEqual([
      "examples/BrowserCapture",
      "packages/core/src/captureHelpers",
    ]);
  });

  it("covers installable skills, which also carry plugin snippets", () => {
    expect(
      findInvalidCodeDirectories([
        "skills/penpair-setup-guide/references/poc-snippet.mjs",
      ]),
    ).toEqual([]);
    expect(
      findInvalidCodeDirectories([
        "skills/penpairSetupGuide/references/poc-snippet.mjs",
        "skills/penpair-setup-guide/Reference Files/poc-snippet.mjs",
        "skills/penpair-setup-guide/references/notes.md",
      ]),
    ).toEqual([
      "skills/penpair-setup-guide/Reference Files",
      "skills/penpairSetupGuide",
    ]);
  });
});

describe("the adapter command example", () => {
  interface Recorded {
    results: unknown[];
    logs: string[];
  }

  function context(
    file:
      | {
          id: string;
        }
      | undefined,
    recorded: Recorded,
  ): AdapterContext {
    return {
      root: "/project",
      config: {
        ...(file
          ? {
              file,
            }
          : {}),
      },
      rawConfig: {},
      log: (message: string) => recorded.logs.push(message),
      output: {
        result: (value: unknown) => recorded.results.push(value),
      },
    } as unknown as AdapterContext;
  }

  it("reports a pinned file as ready and an unpinned one as incomplete", async () => {
    const pinned: Recorded = {
      results: [],
      logs: [],
    };
    expect(
      await exampleStatusCommand.run(
        context(
          {
            id: "file",
          },
          pinned,
        ),
        [],
      ),
    ).toBe(0);
    expect(pinned.results).toEqual([
      {
        configured: true,
      },
    ]);
    expect(pinned.logs).toEqual([
      '{"configured":true}',
    ]);

    const unpinned: Recorded = {
      results: [],
      logs: [],
    };
    expect(await exampleStatusCommand.run(context(undefined, unpinned), [])).toBe(3);
    expect(unpinned.results).toEqual([
      {
        configured: false,
      },
    ]);
  });

  it("throws on a usage error rather than returning an exit code", async () => {
    const recorded: Recorded = {
      results: [],
      logs: [],
    };
    await expect(
      exampleStatusCommand.run(context(undefined, recorded), [
        "unexpected",
      ]),
    ).rejects.toThrow(/Usage: example-status/);
    expect(recorded.results).toEqual([]);
  });

  it("declares the metadata penpair --help needs", () => {
    expect(exampleStatusCommand).toMatchObject({
      name: "example-status",
      summary: "Report offline file-pin readiness",
      usage: [
        "penpair example-status",
      ],
    });
  });
});
