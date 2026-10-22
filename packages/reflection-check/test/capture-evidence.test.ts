import { expect, it } from "vitest";
import { planImplementationCases, runImplementationCases } from "../src/index.js";
import { config, results, mapping, evidence, fixture } from "./helpers/reflection-fixture.js";

it("retains legacy providers and validates optional browser capture metadata independently", async () => {
  const root = await fixture();
  const plan = planImplementationCases(config, results, mapping);
  const capture = {
    schemaVersion: 1 as const,
    root: "#capture",
    rootBox: {
      x: 0.25,
      y: 0.25,
      width: 0.5,
      height: 0.5,
    },
    clip: {
      x: 0,
      y: 0,
      width: 1,
      height: 1,
    },
    rounding: "outward-css-pixels" as const,
    deviceScaleFactor: 1,
    browser: {
      name: "chromium",
      version: "fixture",
    },
    fonts: [
      {
        family: "Test Sans",
        weight: "400",
        style: "normal",
        status: "loaded" as const,
      },
    ],
    pointer: {
      x: -10,
      y: -10,
      outsideRoot: true,
      hoveredControls: 0,
    },
    scroll: {
      x: 0,
      y: 0,
    },
    layoutSamples: 3,
    occlusion: {
      samples: 5,
      blocked: 0,
    },
  };
  expect(
    (
      await runImplementationCases(root, plan, {
        runCase: async () => ({
          ...evidence,
          capture,
        }),
      })
    ).complete,
  ).toBe(true);
  for (const invalid of [
    {
      ...capture,
      deviceScaleFactor: 2,
    },
    {
      ...capture,
      clip: {
        ...capture.clip,
        width: 2,
      },
    },
    {
      ...capture,
      pointer: {
        ...capture.pointer,
        hoveredControls: 1,
      },
    },
    {
      ...capture,
      fonts: [],
    },
    {
      ...capture,
      occlusion: {
        samples: 5,
        blocked: 1,
      },
    },
  ]) {
    expect(
      (
        await runImplementationCases(root, plan, {
          runCase: async () => ({
            ...evidence,
            capture: invalid,
          }),
        })
      ).complete,
    ).toBe(false);
  }
  expect(
    (
      await runImplementationCases(root, plan, {
        runCase: async () => ({
          ...evidence,
          provider: {
            name: "penpair-browser-starter-rgba-exact",
            version: "1",
          },
        }),
      })
    ).complete,
  ).toBe(false);
});
