import { execFile } from "node:child_process";
import { constants } from "node:fs";
import { open } from "node:fs/promises";
import path from "node:path";
import { PenpairError } from "./errors.js";
export type CredentialReference = { type: "file"; path: string } | { type: "keychain"; service: string; account: string };
export function validateCredentialReference(raw: unknown): CredentialReference {
 if (!raw || typeof raw !== "object" || Array.isArray(raw)) throw new Error("Credential reference must be a file or keychain object");
 const v=raw as CredentialReference;
 if(v.type==="file") { if(Object.keys(v).some(k=>!["type","path"].includes(k))||typeof v.path!=="string"||!v.path.trim()||v.path.length>4096||/[\x00-\x1f]/.test(v.path))throw new Error("Invalid credential file reference"); }
 else if(v.type==="keychain") { if(Object.keys(v).some(k=>!["type","service","account"].includes(k))||[v.service,v.account].some(s=>typeof s!=="string"||!/^[a-zA-Z0-9][a-zA-Z0-9._ /:@-]{0,199}$/.test(s)))throw new Error("Invalid keychain service/account reference"); }
 else throw new Error("Only file and macOS keychain credential references are supported; arbitrary command providers are deferred");
 return structuredClone(v);
}
type KeychainRead = (command:string,args:string[],options:{timeout:number;maxBuffer:number;encoding:"utf8"})=>Promise<string>;
const keychainRead:KeychainRead=(command,args,options)=>new Promise((resolve,reject)=>execFile(command,args,{...options,killSignal:"SIGKILL"},(error,stdout)=>error?reject(new Error("Credential provider unavailable or access denied")):resolve(stdout)));
const normalize=(raw:string):string=>{
 const value=raw.trim();if(!value||Buffer.byteLength(value)>8192||/[\r\n\x00]/.test(value))throw new PenpairError("endpoint-invalid","Credential provider must return one bounded MCP URL line");return value;
};
/** Resolve only at connection time. No URL, key, child stderr or command error object enters diagnostics. */
export async function readCredential(reference:CredentialReference,options:{root:string;platform?:string;keychainRead?:KeychainRead}):Promise<string>{
 const ref=validateCredentialReference(reference),platform=options.platform??process.platform;
 if(ref.type==="keychain"){
  if(platform!=="darwin")throw new PenpairError("endpoint-unconfigured","macOS Keychain references require macOS; configure a private credential file on this platform");
  try{return normalize(await(options.keychainRead??keychainRead)("/usr/bin/security",["find-generic-password","-s",ref.service,"-a",ref.account,"-w"],{timeout:5000,maxBuffer:16384,encoding:"utf8"}));}
  catch{throw new PenpairError("endpoint-unconfigured","OS credential lookup failed, timed out, or returned invalid output; inspect access in the OS credential UI");}
 }
 let handle:Awaited<ReturnType<typeof open>>|undefined;
 try{
  handle=await open(path.resolve(options.root,ref.path),constants.O_RDONLY|(constants.O_NOFOLLOW??0));
  const info=await handle.stat();
  if(!info.isFile()||info.size>16384)throw new Error("not a bounded regular file");
  if(platform!=="win32"&&((info.mode&0o077)!==0||typeof process.getuid==="function"&&info.uid!==process.getuid()))throw new Error("not private to current owner");
  const buffer=Buffer.alloc(16385),read=await handle.read(buffer,0,buffer.length,0);
  if(read.bytesRead>16384)throw new Error("credential file byte budget exceeded");
  return normalize(buffer.subarray(0,read.bytesRead).toString("utf8"));
 }catch{throw new PenpairError("endpoint-unconfigured","Credential file must be a readable owner-private regular file (0600 on POSIX), not a symlink, with one bounded MCP URL line");}
 finally{await handle?.close();}
}
