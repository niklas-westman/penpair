import { releaseOptions, releaseActions } from "./options.js";
import path from "node:path";
import { mkdir } from "node:fs/promises";
import { parseCommandArgs, CommandArgumentError } from "../cli-arguments.js";
import { atomicWriteFile } from "../atomic-output.js";
import { readProjectBytes } from "../bounded-file.js";
import { resolveProjectOutput } from "../project-input.js";
import { createArtifactReview } from "../maps/index.js";
import {
  planRelease,
  assembleRelease,
  verifyRelease,
  finalizeRelease,
  checkRelease,
  releaseContext,
  releaseDesignHash,
  readDesignRelease,
  writeDesignRelease,
  type ReceiptInput,
} from "../design-releases/index.js";
import type { DesignCommandContext } from "./context.js";
import { runDesignReleaseCopyCommand } from "./copy-command.js";

const releaseUsage =
  "design-release plan|assemble|verify|finalize|check|context --from FILE [--out FILE]\n" +
  "design-release copy --source-page PAGE --frame ID [--frame ID ...] --release VERSION [--debug-port PORT --apply] [--resume RUN_ID]";

async function readReleaseJson(context: DesignCommandContext, file: string): Promise<unknown> {
  return JSON.parse(
    (await readProjectBytes(context.root, file, 16 * 1024 * 1024)).toString("utf8"),
  );
}

async function writeReleaseOutput(
  context: DesignCommandContext,
  file: string,
  data: unknown,
): Promise<void> {
  const encoded = JSON.stringify(data, null, 2) + "\n";
  if (context.redact(encoded) !== encoded) {
    throw new Error("Release output requires credential redaction; no artifact was published");
  }
  const output = await resolveProjectOutput(context.root, file);
  await mkdir(path.dirname(output), {
    recursive: true,
  });
  await atomicWriteFile(output, encoded);
}

function validateReceiptInput(raw: unknown): ReceiptInput[] {
  if (!Array.isArray(raw) || raw.length > 100) {
    throw new CommandArgumentError(
      "--receipts must contain an array of at most 100 explicit sourceId/targetFrameId pairs",
    );
  }
  return raw.map((entry: unknown) => {
    if (!entry || typeof entry !== "object" || Array.isArray(entry)) {
      throw new CommandArgumentError("Every transfer receipt needs sourceId and targetFrameId");
    }
    const record = entry as Record<string, unknown>;
    if (
      typeof record.sourceId !== "string" ||
      !record.sourceId ||
      typeof record.targetFrameId !== "string" ||
      !record.targetFrameId ||
      Object.keys(record).some((key) => key !== "sourceId" && key !== "targetFrameId")
    ) {
      throw new CommandArgumentError(
        "Every transfer receipt needs only sourceId and targetFrameId",
      );
    }
    return {
      sourceId: record.sourceId,
      targetFrameId: record.targetFrameId,
    };
  });
}

/** CLI entrypoint: local planning stays offline and all live work uses a strictly pinned connection. */
export async function runDesignReleaseCommand(
  args: string[],
  context: DesignCommandContext,
): Promise<number> {
  if (args[0] === "copy") {
    return runDesignReleaseCopyCommand(args.slice(1), context);
  }
  const parsed = parseCommandArgs({
    args,
    allowPositionals: true,
    options: releaseOptions,
  });
  const { values, positionals } = parsed;
  const [action] = positionals;
  const allowed = releaseActions;
  if (values.help) {
    context.output.log(releaseUsage);
    return 0;
  }
  if (!action || !Object.hasOwn(allowed, action) || positionals.length !== 1 || !values.from) {
    throw new CommandArgumentError(releaseUsage);
  }
  const acceptedFlags = new Set([
    "from",
    "out",
    "json",
    ...allowed[action]!,
  ]);
  for (const flag of Object.keys(values)) {
    if (!acceptedFlags.has(flag)) {
      throw new CommandArgumentError(`--${flag} is not supported by design-release ${action}`);
    }
  }
  if (values.resume && !values.apply) {
    throw new CommandArgumentError("--resume requires --apply");
  }
  if (
    action === "finalize" &&
    ((values.apply && (!values.by?.trim() || !values.note?.trim())) ||
      (!values.apply && (values.by || values.note)))
  ) {
    throw new CommandArgumentError(
      "Finalization previews by default; --apply requires --by and --note with the owner's exact words",
    );
  }
  if (action === "plan") {
    const planned = await planRelease(context.root, await readReleaseJson(context, values.from), {
      redact: context.redact,
    });
    if (values.out) {
      await writeDesignRelease(context.root, values.out, planned, {
        redact: context.redact,
      });
    }
    context.output.result(planned);
    context.output.log(JSON.stringify(planned, null, 2));
    return 0;
  }
  const release = await readDesignRelease(context.root, values.from);
  const options = {
    apply: values.apply === true,
    resume: !!values.resume,
    runId: values.resume,
    pointerPath: values.out ?? values.from,
    redact: (value: string) => context.redact(value),
    onStep: (message: string) => context.output.error(`… ${message}`),
  };
  if (action === "assemble") {
    const assembled = await context.withPenpot((client) =>
      assembleRelease(client, context.root, release, options),
    );
    if (values.apply) {
      await writeDesignRelease(context.root, values.out ?? values.from, assembled, {
        redact: context.redact,
      });
    } else if (values.out) {
      await writeReleaseOutput(context, values.out, assembled);
    }
    context.output.result(assembled);
    context.output.log(JSON.stringify(assembled, null, 2));
    return assembled.status === "final" || assembled.status === "verified" ? 0 : 3;
  }
  if (action === "verify") {
    if (!values.receipts) {
      throw new CommandArgumentError(
        "design-release verify requires --receipts FILE with explicit source/target frame IDs",
      );
    }
    const receipts = validateReceiptInput(await readReleaseJson(context, values.receipts));
    const verified = await context.withPenpot((client) =>
      verifyRelease(client, context.root, release, receipts, options),
    );
    await writeDesignRelease(context.root, values.out ?? values.from, verified, {
      redact: context.redact,
    });
    context.output.result(verified);
    context.output.log(JSON.stringify(verified, null, 2));
    return verified.status === "verified" ? 0 : 3;
  }
  if (action === "finalize") {
    if (!values.apply) {
      const checked = await checkRelease(undefined, context.root, release);
      const preview = {
        ...checked,
        recorded: false,
        artifactHash: releaseDesignHash(release),
        requiresLiveVerification: true,
      };
      if (values.out) {
        await writeReleaseOutput(context, values.out, preview);
      }
      context.output.result(preview);
      context.output.log(JSON.stringify(preview, null, 2));
      return checked.valid ? 0 : 3;
    }
    const review = createArtifactReview({
      artifactKind: "design-release",
      artifactId: release.id,
      artifactHash: releaseDesignHash(release),
      by: values.by!,
      note: values.note!,
    });
    const finalized = await context.withPenpot((client) =>
      finalizeRelease(client, context.root, release, review, options),
    );
    context.output.result(finalized);
    context.output.log(JSON.stringify(finalized, null, 2));
    return finalized.status === "final" ? 0 : 3;
  }
  if (action === "check") {
    const checked = values.live
      ? await context.withPenpot((client) => checkRelease(client, context.root, release))
      : await checkRelease(undefined, context.root, release);
    if (values.out) {
      await writeReleaseOutput(context, values.out, checked);
    }
    context.output.result(checked);
    context.output.log(JSON.stringify(checked, null, 2));
    return checked.valid
      ? 0
      : checked.reasons.some((reason) => /changed|differ|drift/i.test(reason))
        ? 2
        : 3;
  }
  if (release.status !== "final" && !values.draft) {
    throw new CommandArgumentError(
      "Release context requires a finalized release; use --draft to inspect explicitly unapproved context",
    );
  }
  const generated = await releaseContext(context.root, release);
  if (values.out) {
    await writeReleaseOutput(context, values.out, generated);
  }
  context.output.result(generated);
  context.output.log(JSON.stringify(generated, null, 2));
  return generated.ready ? 0 : 3;
}
