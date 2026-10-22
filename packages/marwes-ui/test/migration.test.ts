import { describe, expect, it } from "vitest";
import { migrateTokenSnapshot } from "../src/snapshot-file.js";
import { computeExpectation } from "../src/commands.js";
import { readRawConfig } from "@penpair/core";
import { fixture } from "./helpers.js";
it("migrates a legacy token snapshot only with a complete explicit ownership decision", async () => {
 const f = await fixture(), fresh = (await computeExpectation(f.root, await readRawConfig(f.root), "acme")).fresh;
 const old = { ...fresh, schemaVersion: 1, ownership: undefined };
 expect(() => migrateTokenSnapshot(old, {})).toThrow(/every legacy set/);
 const migrated = migrateTokenSnapshot(old, fresh.ownership!);
 expect(migrated).toEqual(fresh);
 expect(old.schemaVersion).toBe(1);
 expect(() => migrateTokenSnapshot({ ...old, schemaVersion: 99 }, fresh.ownership!)).toThrow(/unsupported majors/);
});

it.fails("PP-02: explains metadata-only legacy drift even when token values are identical", async () => {
 const { writeSnapshot } = await import("../src/snapshot-file.js");
 const { checkSnapshotFor } = await import("../src/commands.js");
 const f = await fixture(), config = await readRawConfig(f.root), expectation = await computeExpectation(f.root, config, "acme");
 await writeSnapshot(f.root, expectation.settings.snapshot, { ...expectation.fresh, schemaVersion: 1, ownership: undefined, hash: "legacy-metadata-hash" });
 const result = await checkSnapshotFor(f.root, config, "acme");
 expect(result).toMatchObject({ current: false, diff: { identical: true } });
 expect(result.problems.join(" ")).toMatch(/migrat/);
});
