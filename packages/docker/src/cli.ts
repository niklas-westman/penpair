#!/usr/bin/env node
import { runCli } from "@penpair/core";
import { dockerProfile } from "./index.js";

// The same `penpair` command as @penpair/core, with the commands that run Penpot in Docker added.
process.exitCode = await runCli(process.argv.slice(2), {
  local: dockerProfile,
});
