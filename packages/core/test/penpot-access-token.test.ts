import { mkdtemp, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { redactAccessToken, resolveAccessToken } from "../src/penpot-access-token.js";

const token = "tok.en-123_abc";

async function envFile(text: string): Promise<string> {
  const directory = await mkdtemp(path.join(os.tmpdir(), "penpair-pat-"));
  const file = path.join(directory, ".env.local");
  await writeFile(file, text);
  return file;
}

describe("resolving the access token", () => {
  it("prefers the environment over the env file", async () => {
    const file = await envFile("PENPAIR_PAT_TOKEN=from-file\n");
    expect(
      await resolveAccessToken({
        environment: {
          PENPAIR_PAT_TOKEN: token,
        },
        envFiles: [
          file,
        ],
      }),
    ).toBe(token);
  });

  it("reads quoted values and ignores other variables in the env file", async () => {
    const file = await envFile(`OTHER=1\nexport PENPAIR_PAT_TOKEN="${token}" # mine\n`);
    expect(
      await resolveAccessToken({
        environment: {},
        envFiles: [
          file,
        ],
      }),
    ).toBe(token);
  });

  it("is absent, not an error, when nothing is configured", async () => {
    expect(
      await resolveAccessToken({
        environment: {},
        envFiles: [
          path.join(os.tmpdir(), "penpair-no-such-file", ".env.local"),
        ],
      }),
    ).toBeUndefined();
  });

  it("refuses a malformed token without echoing it", async () => {
    const bad = "has a space";
    await expect(
      resolveAccessToken({
        environment: {
          PENPAIR_PAT_TOKEN: bad,
        },
      }),
    ).rejects.toMatchObject({
      code: "access-token-invalid",
    });
    await expect(
      resolveAccessToken({
        environment: {
          PENPAIR_PAT_TOKEN: bad,
        },
      }),
    ).rejects.not.toThrow(bad);
  });
});

describe("redacting the access token", () => {
  it("removes the token in plain, URL-encoded and JSON forms", () => {
    const special = "a/b+c";
    const text = `x ${special} y ${encodeURIComponent(special)} z ${JSON.stringify(special).slice(1, -1)}`;
    expect(redactAccessToken(text, special)).not.toContain(special);
    expect(redactAccessToken(text, special)).not.toContain(encodeURIComponent(special));
  });
});
