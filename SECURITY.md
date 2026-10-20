# Security

## Your Penpot MCP key is a password

The address Penpot shows under Account, Integrations, MCP Server contains a personal key (`userToken=...`). Anyone with it can read and change every file in your account. penpair never prints it, keeps it only in `.env.local` (readable by you, kept out of git), and refuses a key that belongs to a different Penpot. Do not paste it into chats, issues or logs. If it leaks, switch the MCP Server off and on again in Penpot to get a new one.

Backups made with `penpair backup` (Docker only) contain account data. Never commit them.

## Reporting a problem

Please report a security problem privately, with GitHub's "Report a vulnerability" on this repository's Security tab, not as a public issue. Include what you did and what you saw, without any real key.
