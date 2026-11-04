import { copyOptions } from "./options.js";
import { CommandArgumentError, parseCommandArgs } from "../cli-arguments.js";
import { commandSignal } from "../command-result.js";
import { progressReporter } from "../capture-progress.js";
import { abandonCopyRun, copyReleaseBoards } from "../design-releases/copy.js";
import { findPastedBoards } from "../design-releases/copy-find.js";
import { connectNativeClipboard } from "../native-editor-clipboard.js";
import { redactAccessToken, resolveAccessToken } from "../penpot-access-token.js";
import { PenpairError } from "../errors.js";
import { createPenpotBackendClient } from "../penpot-backend.js";
import type { DesignCommandContext } from "./context.js";

const copyUsage =
  "design-release copy --source-page PAGE --frame ID [--frame ID ...] --release VERSION [--debug-port PORT --apply [--diagnose]] [--evidence auto|backend|plugin] [--verify-pixels none|sample|all] [--pixel-renderer exporter|editor] [--resume RUN_ID] [--progress human|json|off]\n" +
  "design-release copy --diagnose --debug-port PORT\n" +
  "design-release copy --find-pasted RUN_ID\n" +
  "design-release copy --abandon RUN_ID --reason TEXT [--destination-inspected]";

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

  if (values["find-pasted"] !== undefined) {
    if (
      !/^[a-zA-Z0-9-]{1,100}$/.test(values["find-pasted"]) ||
      values.apply ||
      values.resume ||
      values.abandon !== undefined ||
      values["debug-port"] !== undefined
    ) {
      throw new CommandArgumentError(
        "Finding pasted boards requires --find-pasted RUN_ID and nothing else; it only reads",
      );
    }
    const runId = values["find-pasted"];
    const found = await context.withPenpot((client) =>
      findPastedBoards(client, context.root, runId),
    );
    context.output.result(found);
    context.output.log(JSON.stringify(found, null, 2));
    return found.misplaced.length ? 3 : 0;
  }
  if (values.abandon !== undefined) {
    if (
      !/^[a-zA-Z0-9-]{1,100}$/.test(values.abandon) ||
      !boundedText(values.reason) ||
      values.apply ||
      values.resume
    ) {
      throw new CommandArgumentError(
        "Abandoning a copy run requires --abandon RUN_ID and --reason TEXT, without --apply or --resume",
      );
    }
    const abandoned = await abandonCopyRun(
      context.root,
      values.abandon,
      context.redact(values.reason),
      {
        destinationInspected: values["destination-inspected"] === true,
      },
    );
    context.output.result(abandoned);
    context.output.log(JSON.stringify(abandoned, null, 2));
    return 0;
  }
  const debugPort = Number(values["debug-port"]);
  if (values.diagnose && !values.apply) {
    if (
      !values["debug-port"] ||
      !Number.isInteger(debugPort) ||
      debugPort < 1 ||
      debugPort > 65535
    ) {
      throw new CommandArgumentError(
        "--diagnose requires --debug-port with an integer from 1 to 65535",
      );
    }
    if (!context.copyTarget?.fileId) {
      throw new CommandArgumentError("Native copy requires the project's owner-confirmed file pin");
    }
    const diagnosisTarget = context.copyTarget;
    const stages: string[] = [];
    const session = await connectNativeClipboard({
      origin: diagnosisTarget.origin,
      fileId: diagnosisTarget.fileId,
      allowLoopbackAlias: diagnosisTarget.allowLoopbackAlias,
      port: debugPort,
      timeoutMs: 30000,
      signal: commandSignal(),
      trace: (event) => stages.push(`${event.elapsedMs} ms ${event.stage}`),
    });
    try {
      const report = {
        schemaVersion: 1,
        kind: "native-copy-diagnosis",
        ...(await session.diagnose?.()),
        stages,
      };
      context.output.result(report);
      context.output.log(JSON.stringify(report, null, 2));
      return 0;
    } finally {
      await session.close();
    }
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

  const evidenceMode = values.evidence ?? "auto";
  const pixelMode = values["verify-pixels"];
  const pixelRenderer = values["pixel-renderer"];
  if (
    pixelRenderer !== undefined &&
    ![
      "exporter",
      "editor",
    ].includes(pixelRenderer)
  ) {
    throw new CommandArgumentError("--pixel-renderer takes exporter or editor");
  }
  if (pixelRenderer === "editor" && !(values.apply && values["debug-port"])) {
    throw new CommandArgumentError(
      "--pixel-renderer editor captures the open editor tab, so it needs --apply and --debug-port",
    );
  }
  if (
    ![
      "auto",
      "backend",
      "plugin",
    ].includes(evidenceMode) ||
    (pixelMode !== undefined &&
      ![
        "none",
        "sample",
        "all",
      ].includes(pixelMode))
  ) {
    throw new CommandArgumentError(
      "--evidence takes auto, backend or plugin; --verify-pixels takes none, sample or all",
    );
  }
  const token = evidenceMode === "plugin" || !values.apply ? undefined : await resolveAccessToken();
  if (evidenceMode === "backend" && values.apply && !token) {
    throw new PenpairError(
      "access-token-invalid",
      "--evidence backend needs PENPAIR_PAT_TOKEN, which is not set",
    );
  }
  const redact = (text: string): string =>
    token ? redactAccessToken(context.redact(text), token) : context.redact(text);
  const backend =
    token && values.apply
      ? createPenpotBackendClient({
          origin: target.origin,
          token,
        })
      : undefined;
  const progress = progressReporter(values.progress, "design-release copy", redact);
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
        redact,
        ...(backend
          ? {
              backend,
            }
          : {}),
        ...(pixelRenderer === "editor"
          ? {
              pixelRenderer: {
                renderer: "editor" as const,
                browser: {
                  origin: target.origin,
                  fileId: target.fileId,
                  allowLoopbackAlias: target.allowLoopbackAlias,
                  port: Number(values["debug-port"]),
                  timeoutMs: 30000,
                  signal: commandSignal(),
                },
              },
            }
          : {}),
        ...(pixelMode
          ? {
              verifyPixels: pixelMode as "none" | "sample" | "all",
            }
          : {}),
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
                  trace:
                    values.diagnose || process.env.PENPAIR_CLIPBOARD_TRACE
                      ? (event) => console.error(`clipboard-trace ${JSON.stringify(event)}`)
                      : undefined,
                  signal: commandSignal(),
                }),
            }
          : {}),
      },
    ),
  );
  context.output.result(result);
  context.output.log(JSON.stringify(result, null, 2));
  return result.status === "copied" || result.status === "preview" ? 0 : 3;
}
