---
"@penpair/core": patch
"@penpair/docker": patch
"@penpair/web": patch
"penpair": patch
"@penpair/marwes-ui": patch
"@penpair/reflection-check": patch
---

First-run polish found by installing the published package in an empty project

`penpair doctor` no longer reports a bare "the MCP endpoint points at another
Penpot" when the address came from the assistant's own configuration. It now
names that source (`claude-config` or `codex-config`) and says to run
`penpair connect`, which stores this project's own address and takes precedence.

`penpair --help` opens with the five commands that set a project up, in order,
above the full command list. `--all` and `--search` are unchanged.

The README and installation guide now say the guides assume a Mac or Linux
computer.

The Penpot path to the MCP address is corrected everywhere it is written (guides,
setup skill, `init` and `connect` messages, error text): profile image, Your
account, Integration, toggle MCP on, copy the URL.
