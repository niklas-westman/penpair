import { describe, expect, it } from "vitest";
// @ts-expect-error Repository release helper is plain JavaScript.
import {
  confirmReleaseVersion,
  trustedPublishingContext,
} from "../../../scripts/lib/release-auth.mjs";
const environment = {
  GITHUB_ACTIONS: "true",
  GITHUB_EVENT_NAME: "workflow_dispatch",
  GITHUB_REF: "refs/heads/main",
  ACTIONS_ID_TOKEN_REQUEST_URL: "https://example.actions.test",
  ACTIONS_ID_TOKEN_REQUEST_TOKEN: "fake-oidc-test-only",
  PENPAIR_RELEASE_ENVIRONMENT: "npm-release",
};
describe("additional release confirmation and trusted-auth preconditions", () => {
  it("requires an exact version and never accepts a different or missing confirmation", () => {
    expect(confirmReleaseVersion("0.1.3", "0.1.3")).toBe(true);
    expect(() => confirmReleaseVersion("0.1.3", undefined)).toThrow();
    expect(() => confirmReleaseVersion("0.1.3", "0.1.4")).toThrow();
  });
  it("requires authorized main-branch OIDC context, minimum clients and no token fallback", () => {
    expect(
      trustedPublishingContext(environment, {
        node: "v24.0.0",
        npm: "11.5.1",
      }),
    ).toMatchObject({
      mode: "oidc",
      provenance: true,
    });
    for (const bad of [
      {
        ...environment,
        GITHUB_REF: "refs/heads/other",
      },
      {
        ...environment,
        GITHUB_EVENT_NAME: "push",
      },
      {
        ...environment,
        ACTIONS_ID_TOKEN_REQUEST_TOKEN: "",
      },
      {
        ...environment,
        NODE_AUTH_TOKEN: "fake-token",
      },
    ]) {
      expect(() =>
        trustedPublishingContext(bad, {
          node: "v24.0.0",
          npm: "11.5.1",
        }),
      ).toThrow();
    }
    expect(() =>
      trustedPublishingContext(environment, {
        node: "22.13.0",
        npm: "11.5.1",
      }),
    ).toThrow();
    expect(() =>
      trustedPublishingContext(environment, {
        node: "24.0.0",
        npm: "11.5.0",
      }),
    ).toThrow();
  });
  it("accepts the API-gated merged-release-PR push and rejects missing or malformed PR evidence", () => {
    expect(
      trustedPublishingContext(
        {
          ...environment,
          GITHUB_EVENT_NAME: "push",
          PENPAIR_RELEASE_PR: "42",
        },
        {
          node: "v24.0.0",
          npm: "11.5.1",
        },
      ),
    ).toMatchObject({
      mode: "oidc",
    });
    for (const value of [
      undefined,
      "",
      "0",
      "42oops",
    ]) {
      expect(() =>
        trustedPublishingContext(
          {
            ...environment,
            GITHUB_EVENT_NAME: "push",
            PENPAIR_RELEASE_PR: value,
          },
          {
            node: "v24.0.0",
            npm: "11.5.1",
          },
        ),
      ).toThrow();
    }
  });
});
