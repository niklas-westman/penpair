import { copyOptions } from "./options.js";
import { CommandArgumentError, parseCommandArgs } from "../cli-arguments.js";
import { commandSignal } from "../command-result.js";
import { progressReporter } from "../capture-progress.js";
import { copyReleaseBoards } from "../design-releases/copy.js";
import { connectNativeClipboard } from "../native-editor-clipboard.js";
import type { DesignCommandContext } from "./context.js";

const copyUsage =
  "design-release copy --source-page PAGE --frame ID [--frame ID ...] --release VERSION [--debug-port PORT --apply] [--resume RUN_ID] [--progress human|json|off]";

function boundedText(value: string | undefined): value is string {
  return (
    typeof value === "string" &&
    !!value.trim() &&
    value.length <= 1000 &&
    !/[\x00-\x1f]/.test(value)
  );
}

/** Preview resolves native boards; only explicit apply obtains clipboard control. */
export async function runDesignReleaseCopyCommand(
  args: string[],
  context: DesignCommandContext,
): Promise<number> {
  const { values, positionals } = parseCommandArgs({
    args,
    allowPositionals: true,
    options: copyOptions,
  });
  if (values.help) {
    context.output.log(copyUsage);
    return 0;
  }

  const frameIds = values.frame ?? [];
  if (
    positionals.length ||
    !boundedText(values["source-page"]) ||
    !boundedText(values.release) ||
    !/^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/.test(values.release) ||
    frameIds.length < 1 ||
    frameIds.length > 100 ||
    frameIds.some((frameId) => !boundedText(frameId)) ||
    new Set(frameIds).size !== frameIds.length
  ) {
    throw new CommandArgumentError(copyUsage);
  }
  if (values.resume && (!values.apply || !/^[a-zA-Z0-9-]{1,100}$/.test(values.resume))) {
    throw new CommandArgumentError(
      "Copy recovery requires --apply and the original --resume RUN_ID",
    );
  }
  if (
    (values.apply && !values["debug-port"]) ||
    (values["debug-port"] !== undefined &&
      (!/^\d+$/.test(values["debug-port"]) ||
        Number(values["debug-port"]) < 1 ||
        Number(values["debug-port"]) > 65535))
  ) {
    throw new CommandArgumentError(
      "Copy --apply requires --debug-port with an integer from 1 to 65535",
    );
  }
  const target = context.copyTarget;
  if (!target?.fileId) {
    throw new CommandArgumentError("Native copy requires the project's owner-confirmed file pin");
  }

  const progress = progressReporter(values.progress, "design-release copy", (text) =>
    context.redact(text),
  );
  const started = Date.now();
  const result = await context.withPenpot((client) =>
    copyReleaseBoards(
      client,
      context.root,
      {
        fileId: target.fileId,
        sourcePage: values["source-page"]!,
        frameIds,
        releaseVersion: values.release!,
      },
      {
        apply: values.apply === true,
        resume: !!values.resume,
        runId: values.resume,
        redact: (text) => context.redact(text),
        signal: commandSignal(),
        onProgress: progress,
        onStep: (message) =>
          progress({
            schemaVersion: 1,
            kind: "progress",
            command: "design-release copy",
            phase: "journal",
            status: "info",
            elapsedMs: Date.now() - started,
            message,
          }),
        ...(values.apply
          ? {
              clipboard: () =>
                connectNativeClipboard({
                  origin: target.origin,
                  fileId: target.fileId,
                  allowLoopbackAlias: target.allowLoopbackAlias,
                  port: Number(values["debug-port"]),
                  timeoutMs: 30000,
                  signal: commandSignal(),
                }),
            }
          : {}),
      },
    ),
  );
  context.output.result(result);
  context.output.log(JSON.stringify(result, null, 2));
  return result.status === "incomplete" ? 3 : 0;
}
