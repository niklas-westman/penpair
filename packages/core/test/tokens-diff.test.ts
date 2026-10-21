import { describe, expect, it } from "vitest";
import { diffEffective, effectiveValues, type TokenDump } from "../src/tokens-diff.js";

const dump = (override: string[]): TokenDump => ({
  sets: [
    { order: 0, name: "Base", active: true, tokens: ["color-a=#111", "color-b=#222", "shadow=[object Object]"] },
    { order: 1, name: "Brand", active: true, tokens: override },
  ],
  themes: [{ group: "Mode", name: "Light", active: true, sets: ["Base", "Brand"] }],
});

describe("effective token values", () => {
  it("lets a later set win", () => {
    const values = effectiveValues(dump(["color-a=#999"]), "Light");
    expect(values.get("color-a")).toBe("#999");
    expect(values.get("color-b")).toBe("#222");
  });

  it("shows no difference when a value moves between sets without changing", () => {
    const before = effectiveValues(dump(["color-a=#999"]), "Light");
    const moved: TokenDump = { ...dump([]), sets: [{ order: 0, name: "Base", active: true, tokens: ["color-a=#999", "color-b=#222", "shadow=[object Object]"] }, { order: 1, name: "Brand", active: true, tokens: [] }] };
    expect(diffEffective(before, effectiveValues(moved, "Light"))).toEqual({ complete:false, unknown:["shadow"], added: [], removed: [], changed: [] });
  });

  it("lists what was added, removed and changed, and compares object-valued tokens by name only", () => {
    const before = effectiveValues(dump(["color-a=#999"]), "Light");
    const after = effectiveValues(dump(["color-a=#888", "color-c=#333"]), "Light");
    const diff = diffEffective(before, after);
    expect(diff.added).toEqual(["color-c"]);
    expect(diff.changed).toEqual([{ name: "color-a", before: "#999", after: "#888" }]);
    expect(diff.removed).toEqual([]);
  });

  it("refuses an unknown theme", () => {
    expect(() => effectiveValues(dump([]), "Dark")).toThrow(/no theme/);
  });
});

describe("typed token evidence",()=>{
  const typed=(value:unknown,type="typography"):TokenDump=>({schemaVersion:1,complete:true,sets:[{order:0,name:"Base",active:true,tokens:[{name:"body",type,value}]}],themes:[{group:"Mode",name:"Light",active:true,sets:["Base"]}]});
  it("compares composite values structurally rather than flattening them",()=>{
    const first=effectiveValues(typed({fontFamily:["Example"],fontSize:16}),"Light");
    const reordered=effectiveValues(typed({fontSize:16,fontFamily:["Example"]}),"Light");
    expect(diffEffective(first,reordered)).toMatchObject({complete:true,changed:[]});
    const changed=effectiveValues(typed({fontFamily:["Example"],fontSize:18}),"Light");
    expect(diffEffective(first,changed)).toMatchObject({complete:true,changed:[{name:"body"}]});
  });
  it("detects type changes and respects a caller editing its returned map",()=>{
    const before=effectiveValues(typed(12,"number"),"Light"),after=effectiveValues(typed(12,"dimension"),"Light");
    expect(diffEffective(before,after).changed).toHaveLength(1);
    const same=effectiveValues(typed(12,"number"),"Light");same.set("body","13");
    expect(diffEffective(before,same).changed).toHaveLength(1);
  });
  it("keeps real literal strings distinct from a legacy flattened-object marker",()=>{
    const value=effectiveValues(typed("[object Object]","string"),"Light");
    expect(diffEffective(value,value)).toMatchObject({complete:true,unknown:[]});
  });
  it("refuses incomplete dumps, unsupported formats and ambiguous theme names",()=>{
    expect(()=>effectiveValues({...typed({}),complete:false},"Light")).toThrow(/incomplete/);
    expect(()=>effectiveValues({...typed({}),schemaVersion:2} as unknown as TokenDump,"Light")).toThrow(/Unsupported/);
    const data=typed({});data.themes.push({...data.themes[0]!,group:"Other"});
    expect(()=>effectiveValues(data,"Light")).toThrow(/ambiguous/);
  });
});
