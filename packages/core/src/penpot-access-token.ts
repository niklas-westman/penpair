import { readFile } from "node:fs/promises";
import path from "node:path";
import { parseEnvFileValue } from "./endpoint.js";
import { PenpairError } from "./errors.js";

export const accessTokenVariableName = "PENPAIR_PAT_TOKEN";

const longestAcceptedToken = 512;

interface AccessTokenOptions {
  /** Defaults to the process environment. */
  environment?: NodeJS.ProcessEnv;
  /** Git-ignored env files read after the environment. Defaults to `.env.local`, and only for the real process environment. */
  envFiles?: string[];
}

function acceptedToken(value: string): string {
  if (!value || value.length > longestAcceptedToken || /[\s\x00-\x1f"'\\]/.test(value)) {
    throw new PenpairError(
      "access-token-invalid",
      `${accessTokenVariableName} is not a valid access token`,
    );
  }
  return value;
}

async function readEnvFile(file: string): Promise<string | undefined> {
  try {
    return await readFile(file, "utf8");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return undefined;
    }
    // The error text would reveal a local path layout, so it is not forwarded.
    throw new PenpairError(
      "access-token-invalid",
      "The project env file holding the access token cannot be read",
    );
  }
}

/**
 * The optional Penpot personal access token: the environment first, then the git-ignored `.env.local`.
 * Without one, copy verification keeps using the plugin route, so absence is not an error.
 */
export async function resolveAccessToken(
  options: AccessTokenOptions = {},
): Promise<string | undefined> {
  const environment = options.environment ?? process.env;
  const fromEnvironment = environment[accessTokenVariableName]?.trim();
  if (fromEnvironment) {
    return acceptedToken(fromEnvironment);
  }
  const envFiles =
    options.envFiles ??
    (environment === process.env
      ? [
          path.join(process.cwd(), ".env.local"),
        ]
      : []);
  for (const file of envFiles) {
    const text = await readEnvFile(file);
    const fromFile =
      text === undefined ? undefined : parseEnvFileValue(text, accessTokenVariableName);
    if (fromFile) {
      return acceptedToken(fromFile);
    }
  }
  return undefined;
}

/** Removes the token, in the forms it can take inside URLs and JSON, from text that may be printed or persisted. */
export function redactAccessToken(text: string, token: string): string {
  let redacted = text;
  for (const form of new Set([
    token,
    encodeURIComponent(token),
    JSON.stringify(token).slice(1, -1),
  ])) {
    if (form.length > 1) {
      redacted = redacted.split(form).join("[redacted]");
    }
  }
  return redacted;
}
