import { defineAdapter } from "@penpair/core";
import { marwesKit } from "./build-kit.js";
import { checkSnapshotFor } from "./commands.js";
import { marwesCommand } from "./commands.js";

/** The adapter penpair loads when `@penpair/marwes-ui` is listed under "adapters" in penpair.config.json. */
export default defineAdapter({
  name: "@penpair/marwes-ui",
  commands: [
    marwesCommand,
  ],
  kits: [
    marwesKit,
  ],
  async status(context) {
    const check = await checkSnapshotFor(context.root, context.rawConfig, context.config.instance);
    return [
      {
        id: "library-tokens",
        label: "Token snapshot",
        state: check.current ? ("ok" as const) : ("warning" as const),
        detail: check.current
          ? "Declarations match installed library/theme; live tokens not inspected"
          : "Missing/stale snapshot or mixed library versions",
      },
    ];
  },
});

export * from "./commands.js";
export * from "./config.js";
export * from "./marwes.js";
export * from "./penpot.js";
export * from "./snapshot-file.js";
export * from "./theme-input.js";
export * from "./tokens.js";

export * from "./ownership.js";

export * from "./resolved-values.js";
export * from "./mode-trial.js";

export * from "./build-kit.js";

export * from "./components.js";

export * from "./theme-lint.js";
