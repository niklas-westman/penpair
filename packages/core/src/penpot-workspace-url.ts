/** Routing identity only; never retain unrelated query parameters or fragments. */
export interface PenpotWorkspaceIdentity {
  origin: string;
  fileId: string;
  pageId?: string;
}

function uniqueIdentity(parameters: URLSearchParams, key: string): string | undefined {
  const values = parameters.getAll(key);
  const value = values[0];
  if (values.length !== 1 || !value || value.length > 256 || /[\u0000-\u0020\u007f]/.test(value)) {
    return undefined;
  }
  return value;
}

/** Accept one unambiguous workspace route: hash, direct path, or screen query. */
export function parsePenpotWorkspaceUrl(input: string | URL): PenpotWorkspaceIdentity | undefined {
  let url: URL;
  try {
    url = new URL(input);
  } catch {
    return undefined;
  }
  if (
    ![
      "http:",
      "https:",
    ].includes(url.protocol) ||
    url.username ||
    url.password
  ) {
    return undefined;
  }

  let parameters: URLSearchParams;
  if (url.hash) {
    const route = url.hash.slice(1);
    const query = route.indexOf("?");
    if (
      url.pathname !== "/" ||
      query < 0 ||
      route.slice(0, query) !== "/workspace" ||
      [
        "screen",
        "file-id",
        "page-id",
      ].some((key) => url.searchParams.has(key))
    ) {
      return undefined;
    }
    parameters = new URLSearchParams(route.slice(query + 1));
    if (parameters.has("screen")) {
      return undefined;
    }
  } else if (url.pathname === "/workspace") {
    parameters = url.searchParams;
    if (parameters.has("screen")) {
      return undefined;
    }
  } else if (
    url.pathname === "/" &&
    url.searchParams.getAll("screen").length === 1 &&
    url.searchParams.get("screen") === "workspace"
  ) {
    parameters = url.searchParams;
  } else {
    return undefined;
  }

  const fileId = uniqueIdentity(parameters, "file-id");
  const pageId = uniqueIdentity(parameters, "page-id");
  if (!fileId || (parameters.has("page-id") && !pageId)) {
    return undefined;
  }
  return {
    origin: url.origin,
    fileId,
    ...(pageId
      ? {
          pageId,
        }
      : {}),
  };
}
