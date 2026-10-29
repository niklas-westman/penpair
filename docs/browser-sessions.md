# Recovering a suspended Penpot tab

Penpair executes live design operations through the Penpot browser plugin. A
reachable Penpot server does not establish that its editor tab is responsive.
Browser timer throttling, freezing and discarding are separate from computer
sleep; keeping the computer awake does not prevent them.

## Wake an existing tab

From the configured project, with an owner-confirmed file pin and an existing
MCP connection:

```sh
penpair wake --debug-port 9222
penpair wake --debug-port 9222 --timeout-ms 10000 --json
```

The browser must already expose a debugging endpoint on `127.0.0.1` at the
specified port. Penpair does not start a browser or enable debugging in an
existing browser. `--timeout-ms` accepts 1000–30000; the default 5000 ms budget
covers activation and verification together.

Penpair lists the browser's targets, requires exactly one editor page matching
both the project's Penpot origin and pinned `file-id`, then requests activation
through `/json/activate/<target-id>`. It refuses duplicate matching tabs rather
than choosing one. Hosted deployments require an exact origin. For a local
instance, both `http://127.0.0.1:<frontend-port>` and
`http://localhost:<frontend-port>` are accepted, matching Penpair's existing
opening commands. Other hosts and ports are refused; duplicate matching tabs
across the two aliases still fail.

After activation, Penpair performs a fresh read with a challenge and checks the
actual file ID. Exit 0 means activation was acknowledged and that read verified
the intended editor. Activation can succeed while readiness fails: JSON then
reports `activated: true, ready: false`. A browser may also leave a minimized
window minimized; check the actual window when activation alone is insufficient.

Without `--reload` this command does not reload, navigate, restart the plugin,
inject page code or resume a write. Its `keepAlive: "none"` result means activation is momentary
recovery, with no sustained keep-alive mechanism. Browser focus can affect legacy
MCP routing, which is why a fresh identity check follows activation. A target can
navigate between discovery and activation; the acknowledgment is not an atomic
guarantee of tab identity or exclusive ownership.

## When the editor stays silent

`doctor` can say "Connected" while the editor never answers. Add the debugging port
and it also looks at the browser:

```sh
penpair doctor --debug-port 9222
```

The `browser tabs` check lists the tabs on the project's Penpot origin, by origin
and route only (query strings can carry tokens and are never shown), and says which
one is the pinned file's workspace. The usual causes it makes visible: the file open
in two tabs (two sessions drop the plugin connection), the tab sitting on the
dashboard or the account Integrations page, or no workspace tab at all.
`wake` names the same tabs when it refuses ("Tabs seen: ...").

If the tab is the right one but the plugin has dropped its connection, first
verify in the editor that Penpot finished saving, then reload it:

```sh
penpair wake --debug-port 9222 --reload
```

`--reload` runs after the usual checks (exactly one tab on the pinned file's
workspace), sends only `Page.reload` through that page's loopback debugging socket
(Node.js 22 or newer), then looks again every second until the plugin answers or
the budget ends (default 20 s with `--reload`, up to 30 s). It refuses a socket
that is not this loopback browser's page socket. It evaluates no page code and
replays no write: a reload does not tell you whether an earlier write completed.
Reconcile an uncertain run from its journal before resuming it.

Reload can discard unsaved editor work. The CLI prints this warning before
dispatching `Page.reload` and retains it in JSON warnings. It does not inspect
Penpot's save indicator or confirm durable storage. Transport health, independent
readback and an advanced editor revision are not save receipts. If saving cannot
be confirmed, preserve the session and recover the connection without reload.

When a writer lock blocks a run, the message names the holding run, its operation,
process and command line. `penpair locks` lists the local locks and
`penpair locks clear` removes only those whose process is gone on this host.

If a write became uncertain, retain its journal, inspect the intended target
independently and reconcile it before explicitly resuming. Waking a tab does not
establish whether the previous write completed. See [recovery](recovery.md).

## Understand doctor evidence

```sh
penpair doctor --json
```

Doctor stays read-only: it does not activate tabs or install a keep-alive.
The execution check exposes `evidence.pluginHealth`:

```json
{
  "state": "suspended",
  "heartbeatAgeMs": 36000,
  "heartbeatSource": "upstream-error",
  "keepAlive": { "method": "unknown", "verified": false }
}
```

| Field | Meaning |
| --- | --- |
| `state` | `responsive` after a verified fresh read; `suspended` when the upstream failure explicitly reports suspension; otherwise `unknown`. |
| `heartbeatAgeMs` | Age reported in an upstream error such as `no heartbeat for 36s`; `null` when unavailable. |
| `heartbeatSource` | `upstream-error` when an age was parsed, otherwise `unavailable`. |
| `keepAlive` | The current connection does not expose independently verified browser keep-alive telemetry, so its method remains `unknown` and `verified` remains `false`. |

The check's `observedAt` records when Penpair observed this evidence. A successful
read does not imply a zero-second heartbeat age or prove that the next background
request will succeed. A generic timeout does not establish suspension.

## Browser settings and a dedicated window

Chrome's **Settings → Performance → Always keep these sites active** exclusion
can prevent Memory Saver from deactivating the configured Penpot site. It does
not establish that background timers or Penpot layout will run without delay.
See [Chrome's performance settings](https://support.google.com/chrome/answer/12929150?hl=en).

For an explicit experiment, start a separate Chrome instance with its own profile
outside the repository. This macOS example uses an installed Google Chrome:

```sh
"/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" \
  --user-data-dir="$HOME/Library/Application Support/Penpair/browser-profile" \
  --remote-debugging-address=127.0.0.1 \
  --remote-debugging-port=9222 \
  --disable-background-timer-throttling \
  --disable-renderer-backgrounding \
  --disable-backgrounding-occluded-windows \
  --new-window https://design.penpot.app
```

Use the project's configured origin for a different deployment. These launch
switches do not retrofit an already running ordinary browser instance. Since
Chrome 136, remote debugging requires a non-default user-data directory. Keep
that profile private: it can retain account cookies and cached designs. Keep the
debugging port on loopback and do not expose it on a network. See
[Chrome's debugging changes](https://developer.chrome.com/blog/remote-debugging-port/).

Login and plugin connection in that dedicated profile remain human setup steps;
Penpair does not copy credentials or complete them automatically. The flags above
are an experimental configuration, not a verified guarantee of background
Penpot operation. No managed-browser lifecycle, browser dependency or browser
download is added by the wake command.

A silent audio track does **not** count for Chrome's audio timer-throttling
exemption. Web Workers, SharedWorkers and Web Locks have different lifecycle
behavior, but are not verified here as a complete solution for the Penpot plugin.
Penpair does not inject these workarounds. See
[Chrome timer throttling](https://developer.chrome.com/blog/timer-throttling-in-chrome-88)
and [the Page Lifecycle API](https://developer.chrome.com/docs/web-platform/page-lifecycle-api).

## Verification status and the remaining acceptance trial

The initial manual trial raised an existing Penpot window through native browser
controls without reloading it. Port 9222 was unavailable, and the chat's MCP
connection reported no connected Penpot instance. That trial therefore did not
prove restored plugin heartbeats. A separate real CDP trial used the installed
Brave browser with a temporary unauthenticated profile and the three background
flags above. The wake implementation changed a disposable local fixture page
from hidden to visible. No Penpot account or design was loaded, so this proves
browser activation only. Automated tests also cover target selection, activation
requests, deadlines and refusal paths using fake and local HTTP endpoints.

The required sustained-background acceptance trial remains **unverified**. Use an
owner-authorized disposable file and the intended installed browser build:

1. Record the browser version, launch flags, profile, settings and initial doctor
   evidence. Verify the file pin and establish a normal responsive connection.
2. Run 30 frames, one journaled write per frame, each lasting 20–60 seconds, with
   the Penpot window behind another window. Do not manually focus or reload it.
3. Independently read back the results, export and visually inspect them. Record
   heartbeat failures, layout timeouts and any required intervention.
4. Test minimized, occluded and screen-locked states separately; success in one
   state does not establish the others. Computer sleep is a separate boundary.
5. If any write becomes uncertain, stop and reconcile before replay. Do not
   increase retries or weaken journal, identity or layout checks to pass.

One successful activation is not a passing 30-frame run. The dedicated-browser
configuration and any future plugin keep-alive require that real acceptance
trial before they can be advertised as reliable background execution.
