import { describe, expect, it } from "vitest";
import type { PenpotToolClient } from "../src/client.js";
import { repairEmptyShapesOperation, runOperation } from "../src/operation.js";

const AsyncFunction = Object.getPrototypeOf(async function () {}).constructor;

function page(clears: boolean, ghostCount = 3) {
  const children: Record<string, unknown>[] = [
    {
      id: "board-1",
      name: "Board",
      type: "board",
    },
    ...Array.from(
      {
        length: ghostCount,
      },
      () => ({
        id: "",
        name: null,
        type: undefined,
      }),
    ),
  ];
  for (const child of children) {
    if (child.id === "") {
      child.remove = () => {
        if (clears) {
          children.splice(children.indexOf(child), 1);
        }
      };
    }
  }
  const penpot = {
    currentPage: {
      name: "P",
      root: {
        children,
      },
    },
    currentFile: {
      id: "file",
      revn: 1,
    },
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
    children,
  };
}
const run = (client: PenpotToolClient, apply: boolean) =>
  runOperation(
    client,
    repairEmptyShapesOperation,
    {
      page: "P",
    },
    {
      apply,
      layout: false,
      settleMs: 0,
    },
  );

describe("repairing empty shapes", () => {
  it("only inspects unless told to apply, and names the shapes", async () => {
    const { client, children } = page(true);
    const report = await run(client, false);
    expect(report).toMatchObject({
      phase: "inspected",
    });
    expect(report.inspect).toMatchObject({
      found: 3,
      ghosts: [
        {
          index: 1,
        },
        {
          index: 2,
        },
        {
          index: 3,
        },
      ],
    });
    expect(children).toHaveLength(4);
  });
  it("removes them and confirms with an independent count", async () => {
    const { client, children } = page(true);
    const report = await run(client, true);
    expect(report).toMatchObject({
      outcome: "verified",
      verified: true,
    });
    expect(children.map((child) => child.id)).toEqual([
      "board-1",
    ]);
  });
  it("says so when Penpot does not clear them", async () => {
    const { client } = page(false);
    const report = await run(client, true);
    expect(report.verified).toBe(false);
    expect(report.problems[0]).toMatch(
      /3 of 3 shapes without an id are still on the page after remove\(\)/,
    );
  });
  it("finds nothing to do on a clean page", async () => {
    const { client } = page(true, 0);
    expect(await run(client, true)).toMatchObject({
      verified: true,
      inspect: {
        found: 0,
      },
    });
  });
});
