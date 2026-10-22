import { runCommand } from "../src/cli-main.js";
import * as endpointModule from "../src/endpoint.js";
import { chmod, mkdir, mkdtemp, symlink, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it, vi } from "vitest";
import { readCredential } from "../src/credentials.js";
import { endpointRedactor, resolveEndpoint } from "../src/endpoint.js";
import { keyFileCheck } from "../src/instance/connect.js";
const url="https://penpot.example.test/mcp?userToken=FAKE_PRIVATE_TEST_VALUE";
describe("private credential references",()=>{
 it("keeps doctor non-green when credential resolution cannot establish an editor connection", async () => {
  const root=await mkdtemp(path.join(os.tmpdir(),"penpair-credentials-")); await writeFile(path.join(root,"penpair.config.json"),JSON.stringify({instance:"trial",profile:{type:"external",origin:"https://design.penpot.app"}}));
  const resolve=vi.spyOn(endpointModule,"resolveEndpoint").mockRejectedValue(new Error("Credential source unavailable"));
  const request=vi.spyOn(globalThis,"fetch").mockResolvedValue(new Response("ok",{status:200}));
  try { const result=await runCommand(["doctor"],{root});expect(result).toMatchObject({outcome:"failed",data:{ok:false,mcpConfigured:false}}); } finally {resolve.mockRestore();request.mockRestore();}
 });
 it("refuses an unreadable project connection source instead of falling through to another URL",async()=>{
  const root=await mkdtemp(path.join(os.tmpdir(),"penpair-credentials-")); const file=path.join(root,".env.local"); await mkdir(file);
  await expect(resolveEndpoint({environment:{PENPAIR_MCP_URL:url},envFiles:[file],home:root})).rejects.toThrow(/cannot be read/);
 });
 it("resolves an explicit private file at connection time, outranks stale globals and redacts returned secrets",async()=>{
  const root=await mkdtemp(path.join(os.tmpdir(),"penpair-credentials-")), file=path.join(root,"credential");
  await writeFile(file,url+"\n",{mode:0o600});
  const endpoint=await resolveEndpoint({environment:{PENPAIR_MCP_URL_FILE:file,PENPAIR_MCP_URL:"https://stale.test"},envFiles:[],home:root});
  expect(endpoint.description).toMatchObject({source:"credential-file",origin:"https://penpot.example.test"});
  expect(endpointRedactor(endpoint)(url+" FAKE_PRIVATE_TEST_VALUE")).not.toContain("FAKE_PRIVATE_TEST_VALUE");
  await writeFile(file,url.replace("FAKE_PRIVATE_TEST_VALUE","ROTATED_TEST_VALUE"));
  expect(await readCredential({type:"file",path:"credential"},{root})).toContain("ROTATED_TEST_VALUE");
  await chmod(file,0o644);
  if(process.platform!=="win32")await expect(resolveEndpoint({environment:{PENPAIR_MCP_URL_FILE:file,PENPAIR_MCP_URL:url},envFiles:[],home:root})).rejects.toThrow(/owner-private/);
 });
 it("refuses symlinks, oversized files, invalid output and arbitrary executable providers",async()=>{
  const root=await mkdtemp(path.join(os.tmpdir(),"penpair-credentials-"));await writeFile(path.join(root,"credential"),url,{mode:0o600});await symlink("credential",path.join(root,"link"));
  await expect(readCredential({type:"file",path:"link"},{root})).rejects.toThrow();
  await writeFile(path.join(root,"huge"),"x".repeat(17000),{mode:0o600});await expect(readCredential({type:"file",path:"huge"},{root})).rejects.toThrow();
  await expect(resolveEndpoint({environment:{PENPAIR_MCP_URL_COMMAND:"echo secret"},envFiles:[],home:root})).rejects.toThrow(/not enabled/);
 });
 it("uses only fixed bounded Keychain argv and never repeats provider output in errors",async()=>{
  let called:unknown;
  const reference={type:"keychain" as const,service:"project.design",account:"personal"};
  expect(await readCredential(reference,{root:"/tmp",platform:"darwin",keychainRead:async(command,args,options)=>{called={command,args,options};return url;}})).toBe(url);
  expect(called).toMatchObject({command:"/usr/bin/security",args:["find-generic-password","-s","project.design","-a","personal","-w"],options:{timeout:5000,maxBuffer:16384}});
  await expect(readCredential(reference,{root:"/tmp",platform:"darwin",keychainRead:async()=>{throw new Error(url);}})).rejects.not.toThrow(/FAKE_PRIVATE/);
  await expect(readCredential(reference,{root:"/tmp",platform:"linux"})).rejects.toThrow(/require macOS/);
 });
 it("checks storage permissions and history metadata without reading historical key content",async()=>{
  const root=await mkdtemp(path.join(os.tmpdir(),"penpair-credentials-"));await writeFile(path.join(root,".env.local"),"FAKE",{mode:0o600});
  const calls:string[][]=[];const result=await keyFileCheck(root,{run:async(_command,args)=>{calls.push(args);return{code:0,stdout:args.includes("log")?"commit-id":"",stderr:""};}});
  expect(result).toMatchObject({ok:true,warning:true,detail:expect.stringContaining("history")});expect(calls[1]).toContain("--format=%H");
 });
});
