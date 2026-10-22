import { ConfigError, type LocalProfile } from "@penpair/core";
import { initDocker } from "./init.js";
import { backup, doctor, down, restore, status, up, verifyBackup } from "./lifecycle.js";

// Everything the core has, so that a project with the Docker package imports from one place.
export * from "@penpair/core";
export { composeArgs, parseComposePs, readyUrl, waitForHttp } from "./lifecycle.js";
export { firstFreePort, initDocker, isPortFree } from "./init.js";
export { generateSecrets, readEnvValues, renderEnv, writeSecretFile } from "./secrets.js";
export { renderCompose } from "./template.js";

/** The Docker way of running Penpot: what the `penpair` command is started with. */
export const dockerProfile: LocalProfile = {
  async preflight(runner) {
    const version = await runner.run("docker", [
      "version",
      "--format",
      "{{.Server.Version}}",
    ]);
    if (version.code !== 0) {
      throw new ConfigError(
        "Docker is not running. Start Docker Desktop, wait until it says it is running, then run the command again.",
      );
    }
  },
  init: initDocker,
  up,
  down,
  status,
  doctor,
  backup,
  verifyBackup,
  restore,
};
