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
