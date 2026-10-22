import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { isExternal, loadConfig, validateConfig } from "../src/instance/config.js";
import type { Runner } from "../src/instance/runner.js";
import type { LocalProfile } from "../src/local-profile.js";
import { hostedOrigin, setup, type SetupIo } from "../src/instance/setup.js";

const KEY = "SECRETTOKEN123";
const folder = (): Promise<string> => mkdtemp(path.join(os.tmpdir(), "penpair-setup-"));
const noDocker: Runner = {
  run: async () => ({
    code: 127,
    stdout: "",
    stderr: "",
  }),
};

function io(
  answers: string[],
  pasted: string,
): {
  io: SetupIo;
  said: string[];
  opened: string[];
} {
  const said: string[] = [];
  const opened: string[] = [];
  const queue = [
    ...answers,
  ];
  return {
    said,
    opened,
    io: {
      say: (line) => void said.push(line),
      ask: async (_question, fallback) => queue.shift() || fallback,
      askHidden: async () => pasted,
      sleep: async () => undefined,
      openBrowser: async (url) => void opened.push(url),
      openFile: async () => ({
        file: "Brand",
        pages: [
          "Login",
        ],
      }),
    },
  };
}

describe("setup", () => {
  it("defaults to the web: the hosted Penpot, a config, the key stored, the rules installed", async () => {
    const root = await folder();
    const { io: fake, said, opened } = io([], `${hostedOrigin}/mcp/stream?userToken=${KEY}`);
    let installed = 0;
    const result = await setup(root, fake, {
      runner: noDocker,
      installSkills: async () => void installed++,
    });
    const config = await loadConfig(root);
    expect(isExternal(config) && config.profile.origin).toBe(hostedOrigin);
    expect(result.connect).toMatchObject({
      file: "Brand",
      keyWritten: true,
    });
    expect(installed).toBe(1);
    expect(opened).toEqual([
      hostedOrigin,
    ]);
    expect(await readFile(path.join(root, ".gitignore"), "utf8")).toMatch(/\.env\.local/);
    expect(said.join("\n")).not.toContain(KEY);
  });

  it("takes a team's own address when the user types one", async () => {
    const root = await folder();
    const { io: fake } = io(
      [
        "1",
        "https://penpot.example.org",
      ],
      "https://penpot.example.org/mcp/stream?userToken=k",
    );
    await setup(root, fake, {
      runner: noDocker,
    });
    const config = await loadConfig(root);
    expect(isExternal(config) && config.profile.origin).toBe("https://penpot.example.org");
  });

  it("stops with a plain instruction when Docker was chosen and is not running", async () => {
    const root = await folder();
    const { io: fake } = io(
      [
        "2",
      ],
      "x",
    );
    const local = {
      init: async (r: string) => {
        const config = validateConfig({
          instance: "x",
          penpotVersion: "2.18.3",
          ports: {
            frontend: 9055,
            mail: 1080,
          },
          directory: ".penpair",
        });
        await writeFile(path.join(r, "penpair.config.json"), JSON.stringify(config));
        return {
          config,
          createdConfig: true,
          createdSecrets: true,
          files: [],
          gitignoreAdded: false,
        };
      },
      preflight: async () => {
        throw new Error("Docker is not running. Start Docker Desktop");
      },
    } as unknown as LocalProfile;
    await expect(
      setup(root, fake, {
        runner: noDocker,
        port: 9055,
        local,
      }),
    ).rejects.toThrow(/Start Docker Desktop/);
  });

  it("says where Docker comes from when this install does not include it", async () => {
    const root = await folder();
    const { io: fake } = io(
      [
        "2",
      ],
      "x",
    );
    await expect(
      setup(root, fake, {
        runner: noDocker,
        port: 9055,
      }),
    ).rejects.toThrow(/not part of this install[\s\S]*@penpair\/docker/);
  });

  it("continues from an existing config instead of asking again", async () => {
    const root = await folder();
    const first = io([], `${hostedOrigin}/mcp/stream?userToken=${KEY}`);
    await setup(root, first.io, {
      runner: noDocker,
      where: {
        type: "web",
        origin: hostedOrigin,
      },
    });
    const second = io(
      [
        "2",
      ],
      "unused",
    );
    const result = await setup(root, second.io, {
      runner: noDocker,
    });
    expect(result.connect.keyWritten).toBe(false);
    expect(second.said.join("\n")).toMatch(/already set up/);
  });
});
