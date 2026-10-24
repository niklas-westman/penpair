import type { CommandOutput } from "../command-result.js";
import type { PenpotToolClient } from "../client.js";

/** Project-owned artifact commands can work offline; a live operation opens a strictly pinned connection. */
export interface DesignCommandContext {
  root: string;
  output: CommandOutput;
  redact(value: string): string;
  withPenpot<T>(work: (client: PenpotToolClient) => Promise<T>): Promise<T>;
}
