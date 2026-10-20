#!/usr/bin/env node
import { runCli } from "@penpair/core";

// The `penpair` command for Penpot on the web. (@penpair/docker is the same command with the Docker commands added.)
process.exitCode = await runCli(process.argv.slice(2));
