import { execFileSync } from "node:child_process";

const supportedReleaseProtocol = 1;

export function assertReleaseSha(sha) {
  if (typeof sha !== "string" || !/^[a-f0-9]{40}$/i.test(sha)) {
    throw new Error("Release SHA must be a full 40-character commit SHA");
  }
}

export function assertReleaseHistory(root, sha) {
  assertReleaseSha(sha);

  try {
    execFileSync(
      "git",
      [
        "merge-base",
        "--is-ancestor",
        sha,
        "origin/main",
      ],
      {
        cwd: root,
        stdio: "pipe",
      },
    );
  } catch {
    throw new Error("Release SHA must be a commit in origin/main history");
  }
}

export function assertReleaseSnapshot(root, sha) {
  assertReleaseHistory(root, sha);
  assertReleaseProtocol(root, sha);

  const head = execFileSync(
    "git",
    [
      "rev-parse",
      "HEAD",
    ],
    {
      cwd: root,
      encoding: "utf8",
    },
  ).trim();

  if (head !== sha.toLowerCase()) {
    throw new Error("Release checkout HEAD must exactly match the reviewed release SHA");
  }
}

export function assertReleaseProtocol(root, sha) {
  assertReleaseSha(sha);

  let protocol;
  try {
    protocol = JSON.parse(
      execFileSync(
        "git",
        [
          "show",
          `${sha}:scripts/release-protocol.json`,
        ],
        {
          cwd: root,
          encoding: "utf8",
          stdio: "pipe",
        },
      ),
    );
  } catch {
    throw new Error(
      "Release snapshot has no valid release protocol marker; historical publisher is unsupported",
    );
  }

  if (protocol?.version !== supportedReleaseProtocol) {
    throw new Error(
      `Release snapshot protocol must be supported version ${supportedReleaseProtocol}`,
    );
  }
}
