import { attestOptions } from "./options.js";
import { CommandArgumentError, parseCommandArgs } from "../cli-arguments.js";
import { commandSignal } from "../command-result.js";
import { attestRelease, type AttestPage } from "../design-releases/index.js";
import { PenpairError } from "../errors.js";
import { redactAccessToken, resolveAccessToken } from "../penpot-access-token.js";
import { createPenpotBackendClient } from "../penpot-backend.js";
import { runSnippet } from "../snippet.js";
import { pages } from "../snippets/read.js";
import type { DesignCommandContext } from "./context.js";

const attestUsage =
  "design-release attest --release VERSION [--source-page PAGE ...] [--write --by OWNER --note OWNER_WORDS [--replace]]";

function isEditorPage(value: unknown): value is AttestPage {
  const page = value as AttestPage;
  return !!page && typeof page.id === "string" && typeof page.name === "string";
}

/**
 * Checks that `release/VERSION` equals its sources on Penpot's stored data and, with the owner's words,
 * records it. Needs the access token: there is no plugin route, because the point is to render nothing.
 */
export async function runDesignReleaseAttestCommand(
  args: string[],
  context: DesignCommandContext,
): Promise<number> {
  const { values, positionals } = parseCommandArgs({
    args,
    allowPositionals: true,
    options: attestOptions,
  });
  if (values.help) {
    context.output.log(attestUsage);
    return 0;
  }
  const hasWords = !!values.by?.trim() && !!values.note?.trim();
  if (
    positionals.length ||
    !values.release ||
    !/^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/.test(values.release) ||
    (values.write && !hasWords) ||
    (!values.write && (values.by || values.note || values.replace))
  ) {
    throw new CommandArgumentError(
      `${attestUsage}\n--write needs --by and --note with the owner's exact words; they are not accepted without --write.`,
    );
  }
  const target = context.copyTarget;
  if (!target?.fileId) {
    throw new CommandArgumentError("Attesting needs the project's owner-confirmed file pin");
  }
  const token = await resolveAccessToken();
  if (!token) {
    throw new PenpairError(
      "access-token-invalid",
      "design-release attest reads Penpot's stored data and needs PENPAIR_PAT_TOKEN, which is not set",
    );
  }
  const redact = (text: string): string => redactAccessToken(context.redact(text), token);
  const editorPages = await context.withPenpot(async (client) => {
    const listing = await runSnippet(client, pages(), {
      effect: "read",
    });
    return (Array.isArray(listing.pages) ? listing.pages : []).filter(isEditorPage);
  });
  const report = await attestRelease(
    context.root,
    {
      fileId: target.fileId,
      origin: target.origin,
      releaseVersion: values.release,
      pages: editorPages.map((page) => ({
        id: page.id,
        name: page.name,
      })),
      sourcePages: values["source-page"],
    },
    {
      backend: createPenpotBackendClient({
        origin: target.origin,
        token,
      }),
      ...(values.write
        ? {
            write: {
              note: context.redact(values.note!),
              by: context.redact(values.by!),
              replace: values.replace === true,
            },
          }
        : {}),
      redact,
      signal: commandSignal(),
    },
  );
  context.output.result(report);
  context.output.log(JSON.stringify(report, null, 2));
  return report.status === "failed" || report.status === "changed-since-attestation" ? 3 : 0;
}
