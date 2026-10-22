# Private credential references

Legacy hidden `connect` input remains supported. To keep the MCP URL outside the repository, set `PENPAIR_MCP_URL_FILE` to an owner-private file containing exactly one URL line. The variable can live in the environment or private project `.env.local`; relative file references are resolved from the explicit project root (or containing env-file folder). No URL value belongs in shell arguments or committed config.

A declarative project reference is also supported:

```json
{"connection":{"credential":{"type":"file","path":"/private/personal/location/penpot-url"}}}
```

On macOS, store the URL through the Keychain UI and reference the generic-password service/account:

```json
{"connection":{"credential":{"type":"keychain","service":"project.design","account":"penpair"}}}
```

References contain labels/paths, not secrets. The fixed Keychain read uses `/usr/bin/security` with argument arrays, a five-second timeout and 16 KiB output limit; provider stderr/error objects are never printed. Keychain creation, access-policy changes and the actual OS permission dialog remain the person's actions. Other platforms use private files; Windows ACL privacy is managed by the owner because POSIX mode bits cannot establish its ACL policy.

Resolution happens at connection time, without a cache. Precedence: configured reference, environment file-reference, env-file reference, legacy environment URL, legacy env-file URL, then global client fallback where allowed. An explicit invalid/unreadable reference fails closed instead of falling back. The project MCP server additionally disables global fallback. Files must be regular, owned by the current user and 0600 on POSIX; symlinks, oversized/multiline output and unsupported providers refuse. A validated URL remains subject to instance/file guards and known-key redaction.

`connect` uses a configured reference without copying its result into `.env.local`. `connect --replace` applies to the legacy pasted-URL flow; for references, rotate the value in private storage and reconnect. Arbitrary `PENPAIR_MCP_URL_COMMAND` execution is deliberately deferred. No credential store, personal key or connection file was modified by implementing this feature.

Doctor checks `.env.local` storage permissions, Git exclusion and history metadata. It never reads historical key contents. A history warning calls for provider-side rotation and an owner decision about history remediation; it does not rewrite history or revoke credentials automatically.

## Rotation

Use the provider's key-management UI, obtain the new URL privately and update the private file/Keychain entry, or run the legacy hidden `connect --replace` flow. Reconnect the intended visible editor, confirm the same public file ID with doctor and verify a read. Decide separately whether the old key must be revoked and whether Git-history remediation is necessary. Keep both old and new values out of chat, logs and reports.
