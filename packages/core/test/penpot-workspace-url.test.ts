import { describe, expect, it } from "vitest";
import { parsePenpotWorkspaceUrl } from "../src/penpot-workspace-url.js";

const origin = "https://design.example.test";

describe("Penpot workspace URL identity", () => {
  it.each([
    "/#/workspace?file-id=file&team-id=team&page-id=page",
    "/workspace?file-id=file&page-id=page",
    "/?screen=workspace&file-id=file&page-id=page",
  ])("normalizes supported route %# without retaining unrelated parameters", (route) => {
    expect(parsePenpotWorkspaceUrl(`${origin}${route}&unrelated=omitted`)).toEqual({
      origin,
      fileId: "file",
      pageId: "page",
    });
  });

  it("permits a workspace without an active page for browser discovery", () => {
    expect(parsePenpotWorkspaceUrl(`${origin}/?screen=workspace&file-id=file`)).toEqual({
      origin,
      fileId: "file",
    });
  });

  it.each([
    "/?screen=workspace&screen=workspace&file-id=file",
    "/?screen=workspace&screen=settings&file-id=file",
    "/?screen=workspace&file-id=file&file-id=file",
    "/?screen=workspace&file-id=file&page-id=page&page-id=page",
    "/?screen=workspace&file-id=file&page-id=",
    "/?screen=workspace&file-id=",
    "/?screen=settings&file-id=file",
    "/?screen=workspace&file-id=file#/workspace?file-id=file",
    "/?file-id=file#/workspace?file-id=file",
    "/?page-id=page#/workspace?file-id=file",
    "/workspace?screen=workspace&file-id=file",
    "/workspace?file-id=file#/workspace?file-id=file",
    "/#/workspace?screen=workspace&file-id=file",
    "/dashboard#/workspace?file-id=file",
    "/?screen=workspace&file-id=file%0A",
  ])("rejects ambiguous, mixed or invalid route %#", (route) => {
    expect(parsePenpotWorkspaceUrl(`${origin}${route}`)).toBeUndefined();
  });

  it.each([
    "ftp://design.example.test/?screen=workspace&file-id=file",
    "https://user:password@design.example.test/?screen=workspace&file-id=file",
    "invalid",
  ])("rejects invalid or credential-bearing address %#", (url) => {
    expect(parsePenpotWorkspaceUrl(url)).toBeUndefined();
  });
});
