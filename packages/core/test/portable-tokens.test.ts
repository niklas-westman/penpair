import { describe, expect, it } from "vitest";
import { importDtcg, exportDtcg } from "../src/portable-tokens.js";
import { migrateProjectConfig } from "../src/formats.js";
import { validateProjectConfig } from "../src/instance/config.js";
const dimension = {
  $type: "dimension",
  $value: {
    value: 1,
    unit: "rem",
  },
};
const fixture = {
  $description: "portable fixture",
  $extensions: {
    "example.org": {
      owner: "design",
    },
  },
  spacing: {
    base: dimension,
    medium: {
      $type: "dimension",
      $value: "{spacing.base}",
    },
    roomy: {
      $type: "dimension",
      $value: "{spacing.medium}",
    },
  },
  colors: {
    brand: {
      $type: "color",
      $value: {
        colorSpace: "display-p3",
        components: [
          0.2,
          0.6,
          0.3,
        ],
        alpha: 0.8,
      },
    },
  },
  fonts: {
    $type: "fontFamily",
    primary: {
      $value: [
        "Example Sans",
        "sans-serif",
      ],
    },
  },
  type: {
    body: {
      $type: "typography",
      $value: {
        fontFamily: "{fonts.primary}",
        fontSize: "{spacing.base}",
        fontWeight: 500,
        letterSpacing: {
          value: 0,
          unit: "px",
        },
        lineHeight: 1.5,
      },
    },
  },
};
describe("published-format portable token subset", () => {
  it("preserves nested aliases, dimensions/units, composite typography, color space and metadata", () => {
    const imported = importDtcg(fixture);
    const output = exportDtcg(imported);
    const again = importDtcg(output);
    expect(again).toEqual(imported);
    expect(imported.tokens.find((t) => t.path.join(".") === "spacing.roomy")!.value).toBe(
      "{spacing.medium}",
    );
    expect(imported.tokens.find((t) => t.type === "typography")!.value).toMatchObject({
      fontSize: "{spacing.base}",
    });
    expect(imported.losses).toEqual([]);
  });
  it("rejects cycles, broken/type-mismatched references, native arithmetic and unsupported units/spaces", () => {
    expect(() =>
      importDtcg({
        a: {
          $type: "dimension",
          $value: "{b}",
        },
        b: {
          $type: "dimension",
          $value: "{a}",
        },
      }),
    ).toThrow(/cycle/);
    expect(() =>
      importDtcg({
        a: {
          $type: "dimension",
          $value: "{missing}",
        },
      }),
    ).toThrow(/alias/);
    expect(() =>
      importDtcg({
        a: {
          $type: "number",
          $value: 1,
        },
        b: {
          $type: "dimension",
          $value: "{a}",
        },
      }),
    ).toThrow(/type-mismatched/);
    expect(() =>
      importDtcg({
        a: {
          $type: "dimension",
          $value: "{spacing.base} * 2",
        },
      }),
    ).toThrow(/dimension/);
    expect(() =>
      importDtcg({
        a: {
          $type: "dimension",
          $value: {
            value: 2,
            unit: "em",
          },
        },
      }),
    ).toThrow(/px\/rem/);
    expect(() =>
      importDtcg({
        a: {
          $type: "color",
          $value: {
            colorSpace: "oklch",
            components: [
              0.5,
              0.2,
              40,
            ],
          },
        },
      }),
    ).toThrow(/color/);
    expect(() =>
      importDtcg({
        a: {
          $type: "number",
          $value: {
            $ref: "#/b/$value",
          },
        },
      }),
    ).toThrow(/Pointer/);
  });
  it("migrates legacy config explicitly while preserving extension blocks and rejects unsupported majors", () => {
    const config = {
      instance: "trial",
      profile: {
        type: "external",
        origin: "https://design.penpot.app",
      },
      customAdapter: {
        future: {
          preserve: true,
        },
      },
    };
    expect(migrateProjectConfig(config)).toEqual({
      ...config,
      schemaVersion: 1,
    });
    expect(() =>
      validateProjectConfig({
        ...config,
        schemaVersion: 2,
      }),
    ).toThrow(/migration/);
  });
});
