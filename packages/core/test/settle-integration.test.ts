import { mkdtemp } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { expect, it } from "vitest";
import { runOperation, type Operation } from "../src/operation.js";
import { exportShapePng } from "../src/export.js";
import { snippet } from "../src/snippet.js";
import type { PenpotToolClient } from "../src/client.js";

function editor(mode: "settles" | "forever") {
  let samples = 0, exports = 0;
  const shape = { id: "shape", x:0, y:0, width:10, height:10, children: [], export: async () => { exports++; return Buffer.from(String(shape.width)); } };
  const penpot = { currentFile: { id:"file", revn:1 }, currentPage: { id:"page", root:shape, getShapeById:()=>shape }, value:0, writes:0 };
  let changing = true;
  const AsyncFunction = Object.getPrototypeOf(async function () {}).constructor;
  const client: PenpotToolClient = { async callTool(_name, args) {
    if (String(args.code).includes("const geometry = [], stack")) {
      samples++;
      if (changing && (mode !== "forever" || penpot.value === 1)) shape.width = mode === "settles" ? Math.min(samples,3)*10 : samples;
    }
    return {text:JSON.stringify({result:await new AsyncFunction("penpot",String(args.code))(penpot),log:""}),isError:false};
  }, async close(){} };
  return { client, penpot, stop:()=>{changing=false;}, exports:()=>exports };
}
const operation: Operation<Record<string, never>> = {
  name:"settled-value", page:()=>undefined,
  inspect:()=>snippet("inspect","return {ok:true,value:penpot.value};"),
  apply:()=>snippet("apply","penpot.value=1;penpot.writes++;return {ok:true,changed:1};"),
  readback:()=>snippet("readback","return {ok:true,value:penpot.value,width:penpot.currentPage.root.width};"),
  verify:({readback})=>readback.value===1?[]:["value did not arrive"],
};
const noSleep = async()=>undefined;
it("waits for changing geometry before independent operation readback", async()=>{
  const e=editor("settles");
  expect(await runOperation(e.client,operation,{}, {apply:true,sleep:noSleep})).toMatchObject({verified:true,layout:{stable:true,method:"geometry",samples:5},readback:{width:30}});
  expect(e.penpot.writes).toBe(1);
});
it("checks layout and then still requires two matching renders",async()=>{
  const e=editor("settles");
  expect(await exportShapePng(e.client,"shape",{sleep:noSleep})).toMatchObject({stable:true,exports:3,layout:{stable:true,method:"geometry",samples:5}});
  expect(e.exports()).toBe(3);
});
it("cannot verify a write whose layout keeps moving",async()=>{
  const e=editor("forever");
  const report=await runOperation(e.client,operation,{}, {apply:true,sleep:noSleep,layout:{timeoutMs:100,intervalMs:20}});
  expect(report).toMatchObject({verified:false,outcome:"failed",apply:{changed:1}});
  expect(report.problems.join()).toMatch(/Layout did not settle/);
  expect(e.penpot.writes).toBe(1);
});
it("keeps failed post-write settling recoverable without a duplicate write",async()=>{
  const root=await mkdtemp(path.join(os.tmpdir(),"penpair-settle-")), e=editor("forever");
  const options={apply:true,sleep:noSleep,layout:{timeoutMs:100,intervalMs:20},journal:{root,runId:"settle-run"}};
  await expect(runOperation(e.client,operation,{},options)).rejects.toMatchObject({outcome:"uncertain"});
  e.stop();
  expect(await runOperation(e.client,operation,{}, {...options,journal:{...options.journal,resume:true}})).toMatchObject({verified:true,layout:{stable:true},journal:{state:"verified"}});
  expect(e.penpot.writes).toBe(1);
});
