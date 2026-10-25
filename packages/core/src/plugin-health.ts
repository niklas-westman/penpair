export interface PluginHealth {
  state: "responsive" | "suspended" | "unknown";
  heartbeatAgeMs: number | null;
  heartbeatSource: "upstream-error" | "unavailable";
  keepAlive: {
    method: "unknown";
    verified: false;
  };
}

function health(state: PluginHealth["state"], heartbeatAgeMs: number | null): PluginHealth {
  return {
    state,
    heartbeatAgeMs,
    heartbeatSource: heartbeatAgeMs === null ? "unavailable" : "upstream-error",
    keepAlive: {
      method: "unknown",
      verified: false,
    },
  };
}

/** Fresh execution proves responsiveness, not the plugin's heartbeat time or browser policy. */
export function responsivePluginHealth(): PluginHealth {
  return health("responsive", null);
}

/** Upstream error text is the only heartbeat telemetry exposed by the current connection. */
export function pluginHealthFromError(error: unknown): PluginHealth {
  const message =
    error instanceof Error
      ? error.message.slice(0, 8192)
      : typeof error === "string"
        ? error.slice(0, 8192)
        : "";
  const code =
    typeof error === "object" && error !== null && "code" in error ? error.code : undefined;
  const suspended = code === "plugin-suspended" || /\bsuspended\b|\bno heartbeat\b/i.test(message);
  if (!suspended) {
    return health("unknown", null);
  }

  const duration = /\bno heartbeat\s+for\s+([^\s,)]+?)\s*(milliseconds?|ms|seconds?|s)\b/i.exec(
    message,
  );
  if (!duration || !/^\d+(?:\.\d+)?$/.test(duration[1]!)) {
    return health("suspended", null);
  }

  const value = Number(duration[1]);
  const heartbeatAgeMs = value * (/^(?:ms|milliseconds?)$/i.test(duration[2]!) ? 1 : 1000);
  return health(
    "suspended",
    Number.isFinite(heartbeatAgeMs) &&
      heartbeatAgeMs >= 0 &&
      heartbeatAgeMs <= Number.MAX_SAFE_INTEGER
      ? heartbeatAgeMs
      : null,
  );
}
