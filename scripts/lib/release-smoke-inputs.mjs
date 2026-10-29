import { createHash } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";

/** Synthetic unapproved inputs: installation proof only, never live Penpot evidence. */
export async function createReleaseSmokeInputs(root, hashContract) {
  await mkdir(join(root, "release-evidence"));
  const save = async (name, value) => {
    const relative = `release-evidence/${name}.json`;
    const bytes = Buffer.from(`${JSON.stringify(value, null, 2)}\n`);
    await writeFile(join(root, relative), bytes);
    return {
      path: relative,
      sha256: createHash("sha256").update(bytes).digest("hex"),
    };
  };
  const inspection = await save("screen", {
    schemaVersion: 1,
    kind: "shape-inspection",
    fileId: "smoke-file",
    pageId: "earlier-page",
    revision: 1,
    complete: true,
    counts: {
      visited: 1,
      returned: 1,
      total: 1,
    },
    reasons: [],
    producer: {
      name: "penpair",
      version: "smoke",
    },
    scope: {
      shapeId: "login-frame",
      fields: [
        "geometry",
        "text",
        "layout",
        "component",
        "tokens",
        "style",
        "metadata",
      ],
      depth: 1,
    },
    nodes: [
      {
        id: "login-frame",
        parentId: null,
        index: 0,
        depth: 0,
        name: "Login",
        type: "board",
        childIds: [],
        childrenTotal: 0,
        unknowns: [],
        geometry: {
          x: 0,
          y: 0,
          width: 1,
          height: 1,
          rotation: 0,
          hidden: false,
          blocked: false,
          flipX: false,
          flipY: false,
          proportionLock: false,
        },
        text: null,
        layout: {
          showInViewMode: true,
          boardSizing: {
            horizontalSizing: "fix",
            verticalSizing: "fix",
          },
          constraints: {
            constraintsHorizontal: null,
            constraintsVertical: null,
            fixedWhenScrolling: false,
          },
        },
        component: {},
        tokens: {},
        style: {
          blur: null,
          backgroundBlur: null,
        },
        metadata: {
          interactions: [],
        },
      },
    ],
  });
  const journey = {
    schemaVersion: 1,
    kind: "journey-map",
    id: "smoke-journey",
    title: "Synthetic journey",
    goal: "Exercise installed release planning",
    sources: [],
    nodes: [
      {
        id: "login",
        kind: "screen",
        label: "Login",
        origin: "owner-decision",
        requirementIds: [
          "login-required",
        ],
      },
    ],
    edges: [],
    requirements: [
      {
        id: "login-required",
        text: "Login is required",
        origin: "owner-decision",
      },
    ],
    findings: [],
  };
  const journeyReference = await save("journey", journey);
  const integration = await save("integration", {
    ...journey,
    kind: "integration-map",
    id: "smoke-integration",
    journey: {
      path: journeyReference.path,
      sha256: await hashContract(journeyReference.path),
    },
  });
  const adoption = {
    schemaVersion: 2,
    kind: "design-release-adoption",
    id: "smoke-release",
    title: "Synthetic adopted release",
    productVersion: "1.0.0",
    fileId: "smoke-file",
    screens: [
      {
        id: "login",
        label: "Login",
        pageId: "earlier-page",
        frameId: "login-frame",
        inspection,
      },
    ],
    contracts: [
      journeyReference,
      integration,
    ],
  };
  return save("adoption", adoption);
}
