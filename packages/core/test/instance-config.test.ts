import { describe, expect, it } from "vitest";
import { composeProjectOf, validateConfig, ConfigError } from "../src/instance/config.js";

const good = {
  instance: "tradient",
  penpotVersion: "2.18.3",
  ports: {
    frontend: 9002,
    mail: 1082,
  },
  directory: ".penpair",
};

describe("instance config", () => {
  it("accepts a good config and derives the compose project", () => {
    const config = validateConfig(good);
    expect(composeProjectOf(config)).toBe("penpair-tradient");
    expect(
      composeProjectOf({
        ...config,
        composeProject: "penpot",
      }),
    ).toBe("penpot");
  });

  it.each([
    [
      {
        ...good,
        instance: "Trading Journal",
      },
      /instance/,
    ],
    [
      {
        ...good,
        penpotVersion: "latest",
      },
      /penpotVersion/,
    ],
    [
      {
        ...good,
        ports: {
          frontend: 80,
          mail: 1082,
        },
      },
      /ports.frontend/,
    ],
    [
      {
        ...good,
        ports: {
          frontend: 9002,
          mail: 9002,
        },
      },
      /differ/,
    ],
    [
      {
        ...good,
        directory: "/etc/penpair",
      },
      /relative/,
    ],
    [
      {
        ...good,
        composeProject: "Bad Name",
      },
      /composeProject/,
    ],
  ])("rejects %j", (value, message) => {
    expect(() => validateConfig(value)).toThrow(ConfigError);
    expect(() => validateConfig(value)).toThrow(message);
  });
});

describe("validateConfig reports every missing required field at once", () => {
  it("names all problems and a minimal file in one message", () => {
    let message = "";
    try {
      validateConfig({});
    } catch (error) {
      message = (error as ConfigError).message;
    }
    for (const part of [
      "instance must",
      "penpotVersion must",
      "ports.frontend must",
      "ports.mail must",
      "directory must",
      "A minimal file",
    ]) {
      expect(message).toContain(part);
    }
  });

  it("keeps the single-problem message unchanged", () => {
    expect(() =>
      validateConfig({
        instance: "demo",
        penpotVersion: "2.18.3",
        ports: {
          frontend: 9001,
          mail: 9001,
        },
        directory: "penpot",
      }),
    ).toThrow(/ports.frontend and ports.mail must differ/);
  });
});
