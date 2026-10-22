import { expect, it } from "vitest";
import { runCommand } from "../src/cli-main.js";
it("discovers the complete workflow from installed help without loading adapters", async () => {
 const result = await runCommand(["--help"]);
 expect(result.exitCode).toBe(0);
 const help = result.messages.join("\n");
 for (const label of ["Connect / diagnose", "Build:", "Inspect / spec", "Snapshot / diff", "Capture / approve", "Compare:"]) expect(help).toContain(label);
 for (const command of ["penpair spec check --from", "penpair snapshot diff", "penpair reflection check", "--layout auto|native|geometry", "--timeout-ms 5000"]) expect(help).toContain(command);
 expect(help).not.toContain("--update also replaces images whose design changed (approving");
});
