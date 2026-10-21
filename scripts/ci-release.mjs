// This wrapper is invoked only by the owner-enabled protected workflow. It never changes versions/tags or prints credentials.
import { spawn } from "node:child_process";
const version=process.env.PENPAIR_EXPECTED_VERSION;
if(!version||!/^\d+\.\d+\.\d+$/.test(version))throw new Error("Supply the exact checked release version");
const resume=process.env.PENPAIR_CONTINUE_RELEASE;
if(resume!=="true"&&resume!=="false")throw new Error("Explicit continue-release boolean required");
const args=["release","--publish","--trusted-publishing","--confirm-version",version,...(resume==="true"?["--continue"]:[])];
const child=spawn("pnpm",args,{stdio:"inherit",env:process.env});
child.on("error",()=>{process.exitCode=1;});child.on("close",code=>{process.exitCode=code??1;});
