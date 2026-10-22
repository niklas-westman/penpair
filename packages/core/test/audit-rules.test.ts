import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";
import { auditDesignRules, contrastRatio, validateAuditRules } from "../src/audit-rules.js";
import type { InspectionDocument } from "../src/inspection.js";
async function fixture() {
  const source = JSON.parse(
    await readFile(new URL("fixtures/spec/inspection.json", import.meta.url), "utf8"),
  ) as InspectionDocument;
  const frame = source.nodes![0]!;
  const text = source.nodes![1]!;
  frame.style = {
    opacity: 1,
    blendMode: "normal",
    fills: [
      {
        fillColor: "#FFFFFF",
        fillOpacity: 1,
      },
    ],
  };
  frame.tokens = {
    fill: "surface",
  };
  text.style = {
    opacity: 1,
    blendMode: "normal",
    fills: [
      {
        fillColor: "#AAAAAA",
        fillOpacity: 1,
      },
    ],
  };
  text.tokens = {
    fill: "text",
  };
  text.unknowns = [];
  text.text = {
    characters: "\u00a0",
    typography: {
      fontSize: 14,
      fontWeight: 400,
    },
  };
  text.geometry = {
    width: 20,
    height: 20,
  };
  const tokens: InspectionDocument = {
    schemaVersion: 1,
    kind: "token-inspection",
    fileId: source.fileId,
    pageId: source.pageId,
    revision: source.revision,
    complete: true,
    reasons: [],
    counts: {},
    producer: source.producer,
    sets: [
      {
        order: 0,
        name: "Active",
        active: true,
        tokens: [
          {
            name: "surface",
            type: "color",
            resolvedValue: "#FFFFFF",
          },
          {
            name: "text",
            type: "color",
            resolvedValue: "#AAAAAA",
          },
        ],
      },
    ],
    themes: [],
  };
  return {
    source,
    tokens,
  };
}
describe("advisory design rules", () => {
  it("measures only observed resolved opaque colors and retains explicit size/blank signals", async () => {
    const { source, tokens } = await fixture();
    const report = auditDesignRules(
      source,
      {
        contrast: true,
        touchTargets: true,
        interactiveIds: [
          "title",
        ],
        blankText: true,
      },
      tokens,
    );
    expect(report).toMatchObject({
      advisory: true,
      accessibilityCompliance: "not-assessed",
      contrast: {
        measured: 1,
        unknown: 0,
      },
      totalFindings: 3,
    });
    expect(report.findings.find((f) => f.rule === "contrast")!.evidence).toMatchObject({
      threshold: 4.5,
    });
    expect(
      contrastRatio(
        [
          0,
          0,
          0,
        ],
        [
          1,
          1,
          1,
        ],
      ),
    ).toBe(21);
  });
  it("leaves mixed/alpha/unresolved/foreign token evidence unknown", async () => {
    const { source, tokens } = await fixture();
    tokens.fileId = "other";
    expect(
      auditDesignRules(
        source,
        {
          contrast: true,
        },
        tokens,
      ).contrast,
    ).toEqual({
      measured: 0,
      unknown: 1,
    });
    tokens.fileId = source.fileId;
    source.nodes![1]!.unknowns = [
      "text.mixedRangeStyles",
    ];
    expect(
      auditDesignRules(
        source,
        {
          contrast: true,
        },
        tokens,
      ).contrast.unknown,
    ).toBe(1);
    source.nodes![1]!.unknowns = [];
    (
      source.nodes![1]!.style as {
        fills: unknown[];
      }
    ).fills = [
      {
        fillColor: "#AAAAAA",
        fillOpacity: 0.5,
      },
    ];
    expect(
      auditDesignRules(
        source,
        {
          contrast: true,
        },
        tokens,
      ).contrast.unknown,
    ).toBe(1);
  });
  it("keeps reasoned suppressions visible and reports finding truncation", async () => {
    const { source, tokens } = await fixture();
    const report = auditDesignRules(
      source,
      {
        contrast: true,
        blankText: true,
        suppressions: [
          {
            rule: "blank-text",
            nodeId: "title",
            reason: "Intentional layout spacer",
          },
        ],
      },
      tokens,
    );
    expect(report.suppressed).toBe(1);
    expect(report.findings.find((f) => f.rule === "blank-text")!.suppression).toMatch(
      /Intentional/,
    );
    expect(
      auditDesignRules(
        source,
        {
          blankText: true,
          contrast: true,
        },
        tokens,
        1,
      ),
    ).toMatchObject({
      complete: false,
      totalFindings: 2,
    });
    expect(
      auditDesignRules(
        source,
        {
          blankText: true,
          allowBlank: [
            "title",
          ],
        },
        tokens,
      ).totalFindings,
    ).toBe(0);
    expect(() =>
      validateAuditRules({
        suppressions: [
          {
            rule: "blank-text",
            nodeId: "title",
            reason: "",
          },
        ],
      }),
    ).toThrow(/reason/);
  });
});
