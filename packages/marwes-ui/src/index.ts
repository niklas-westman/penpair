import { defineAdapter } from "@penpair/core";
import { marwesCommand } from "./commands.js";

/** The adapter penpair loads when `@penpair/marwes-ui` is listed under "adapters" in penpair.config.json. */
export default defineAdapter({ name: "@penpair/marwes-ui", commands: [marwesCommand] });

export * from "./commands.js";
export * from "./config.js";
export * from "./marwes.js";
export * from "./penpot.js";
export * from "./snapshot-file.js";
export * from "./theme-input.js";
export * from "./tokens.js";

export * from "./ownership.js";
