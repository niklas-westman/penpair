import assert from "node:assert/strict";
import { checkKits, coreKit, instanceKit, kit } from "@penpair/core";

const report = checkKits([coreKit, instanceKit]);
assert.equal(report.valid, true);
assert.ok(report.bytes <= 48 * 1024);
assert.ok(report.sources.every((source) => source.bytes <= 32 * 1024));

const root = {
  id: "root",
  x: 0,
  y: 0,
  width: 100,
  height: 100,
  children: [],
  waitForLayoutUpdate: async () => undefined,
};
const penpot = {
  currentFile: { id: "file" },
  currentPage: { id: "page", root },
};
const helpers = new Function("penpot", `${kit()}\nreturn pp;`)(penpot);

for (const emptyRoot of [undefined, null, false, 0, 0n, NaN, ""]) {
  await assert.rejects(helpers.flush({ root: emptyRoot }), /Flush root must exist/);
}
for (const invalidRoots of [[], [undefined]]) {
  await assert.rejects(helpers.flush({ root: invalidRoots }), /layout target does not exist/);
}
for (const options of [{}, { timeoutMs: 1000 }, { root }, { root: [root] }]) {
  const flushed = await helpers.flush(options);
  assert.equal(flushed.layout.stable, true);
  assert.deepEqual(flushed.layout.rootIds, [root.id]);
}

console.log(JSON.stringify(report));
