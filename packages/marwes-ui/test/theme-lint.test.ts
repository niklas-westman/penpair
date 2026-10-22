import { describe, expect, it } from "vitest";
import { buildSnapshot } from "../src/tokens.js";
import { lintThemeFamily } from "../src/theme-lint.js";
const core={resolveThemeInput:(input:Record<string,unknown>)=>input,themeToCSSVars:(input:unknown)=>({"--mw-color-primary-base":String((input as {primary?:string}).primary??"#2F31FC"),"--mw-color-border-brand":"#2F31FC","--mw-color-text-link":"#2F31FC","--mw-color-surface-brand":"#888888","--mw-font-primary":"Example","--mw-font-secondary":"Example","--mw-font-mono":"Example"}),mwThemeVars:{spacing:{}}};
const snapshot=(green=false)=>buildSnapshot({core,version:"1.11.0",name:"Example",generatedBy:"test",...(green?{project:{light:{primary:"#008800"}}}:{})});
describe("theme-family default lint",()=>{
 it("warns when an overridden green primary leaves blue brand siblings and retains intentional suppression",()=>{
  const report=lintThemeFamily(snapshot(),snapshot(true),{suppressions:[{theme:"light",token:"mw-color-border-brand",reason:"Intentional blue navigation"}]});
  expect(report).toMatchObject({advisory:true,changed:false,warnings:expect.arrayContaining([expect.objectContaining({token:"mw-color-border-brand",suppression:"Intentional blue navigation"}),expect.objectContaining({token:"mw-color-text-link"})])});
  expect(report.unknown).toEqual(expect.arrayContaining([expect.objectContaining({token:"mw-color-surface-brand"})]));
 });
 it("leaves unchanged themes quiet and refuses empty suppression rationale",()=>{
  expect(lintThemeFamily(snapshot(),snapshot()).warnings).toEqual([]);
  expect(()=>lintThemeFamily(snapshot(),snapshot(true),{suppressions:[{theme:"light",token:"x",reason:""}]})).toThrow(/reason/);
 });
});
