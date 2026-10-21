import { expect,it } from "vitest";
import { audit,tokensDump,tree } from "../src/snippets/read.js";
const AsyncFunction=Object.getPrototypeOf(async function(){}).constructor;
function fixture(count=20){
  const children=Array.from({length:count},(_,i)=>({id:`shape-${i}`,type:"board",name:"Frame",x:0,y:0,width:10,height:10,fills:[{fillColor:"#000"}],strokes:[],tokens:{},children:[]}));
  const page={id:"page",name:"P",root:{children}};
  return{currentFile:{id:"file",revn:1,pages:[page]},currentPage:page};
}
it("does not falsely truncate an exact readable line limit and exposes real depth/text limits",async()=>{
  const f=fixture(2);
  expect(await new AsyncFunction("penpot",tree({page:"P",limit:2}).code)(f)).toMatchObject({complete:true,truncated:false,returnedLines:2});
  expect(await new AsyncFunction("penpot",tree({page:"P",limit:1}).code)(f)).toMatchObject({complete:false,truncated:true});
  Object.assign(f.currentPage.root.children[0]!,{type:"text",characters:"A".repeat(100)});
  expect(await new AsyncFunction("penpot",tree({page:"P"}).code)(f)).toMatchObject({complete:false,limits:{textLimited:true}});
});
it("keeps audit totals beyond sampled examples and preserves duplicate frame names",async()=>{
  const f=fixture(2);
  f.currentPage.root.children[0]!.children=Array.from({length:12},(_,i)=>({...f.currentPage.root.children[1]!,id:`child-${i}`,name:`Child ${i}`,children:[]}));
  const result=await new AsyncFunction("penpot",audit({page:"P",framePrefix:"Frame"}).code)(f);
  expect(Object.keys(result.frames)).toHaveLength(2);
  expect(result.frames["shape-0"]).toMatchObject({totals:{unboundFills:13},truncated:true,scanComplete:true});
  expect(result.frames["shape-0"].unboundFills).toHaveLength(8);
  expect(result).toMatchObject({complete:false,countsComplete:true});
});
it("marks raw token preview budgets instead of emitting an unbounded dump",async()=>{
  const values=Array.from({length:6000},(_,i)=>({name:`token.${i}`,type:"string",value:"example",description:""}));
  const penpot={currentFile:{id:"file",revn:1},library:{local:{tokens:{sets:[{name:"Core",active:true,tokens:values}],themes:[]}}}};
  expect(await new AsyncFunction("penpot",tokensDump().code)(penpot)).toMatchObject({complete:false,truncated:true,counts:{totalTokens:null}});
});
