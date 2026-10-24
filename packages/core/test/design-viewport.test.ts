import { expect, it } from "vitest";
import { matchesDesignViewport } from "../src/design-viewport.js";

it.each([
  [
    1511.9999999999995,
    1512,
    true,
  ],
  [
    834.0000000000001,
    834,
    true,
  ],
  [
    1512.005,
    1512,
    true,
  ],
  [
    1511.995,
    1512,
    true,
  ],
  [
    1513,
    1512,
    false,
  ],
  [
    1511,
    1512,
    false,
  ],
  [
    1512.02,
    1512,
    false,
  ],
  [
    1512.5,
    1512,
    false,
  ],
  [
    Number.NaN,
    1512,
    false,
  ],
  [
    Number.POSITIVE_INFINITY,
    1512,
    false,
  ],
])("compares design size %s against viewport %s (matches=%s)", (observed, declared, matches) => {
  expect(
    matchesDesignViewport(
      {
        width: observed,
        height: 984,
      },
      {
        width: declared,
        height: 984,
      },
    ),
  ).toBe(matches);
  expect(
    matchesDesignViewport(
      {
        width: 984,
        height: observed,
      },
      {
        width: 984,
        height: declared,
      },
    ),
  ).toBe(matches);
});

it("requires observed geometry instead of treating missing dimensions as a match", () => {
  expect(
    matchesDesignViewport(undefined, {
      width: 1512,
      height: 984,
    }),
  ).toBe(false);
});
