# Getting started

Draft. Written for someone who has not used a terminal much. The steps marked **(not tried yet)** come from Penpot's help pages, not from a run; the first person to follow this guide on a clean machine should mark what differs.

**Easiest:** let your AI assistant (Claude Code, Codex or GitHub Copilot) walk you through it with the [setup guide skill](https://github.com/niklas-westman/penpair/blob/main/skills/penpair-setup-guide/SKILL.md). This page is the same path by hand.

The normal way is to use Penpot on the web (or your team's own Penpot) and connect the AI assistant to it. Nothing runs on your computer except penpair. If you want your own copy of Penpot on your computer instead, see "Alternative: run Penpot on your own computer" at the end.

There are two roles. You may be both.

- **The designer** works in Penpot in the browser (go to "If you are the designer").
- **The person who sets it up** connects the AI assistant to that Penpot (go to "If you set it up").

## If you are the designer
You need a link to your team's Penpot and an account.

1. Open the link and log in.
2. Open the design file you will work on.
3. Choose **File, MCP Server, Connect** (not tried yet). A small window may appear; leave it open.
4. Keep this browser tab **visible** while the assistant works. If the browser puts the tab to sleep, the assistant stops and says the tab is suspended. Bring the tab to the front and it carries on.
5. Tell the assistant which page to work on. It works on the page you have open.

That is all. The assistant looks first, changes things in one go, and checks its own work; you review the result in Penpot as usual.

## If you set it up
You need: a Mac or Linux computer, **Node.js** (22 or newer), a terminal, and an account on a Penpot (use design.penpot.app or your team's own address).

**The quick way:** in your project's folder run `npx @penpair/web setup`. It asks where your Penpot is (press Enter for the web), does steps 1 to 5 below, and says in plain words what it is waiting for. Run it again if you stop halfway. The rest of this section is what it does, one step at a time, for when you want to do it by hand or something needs fixing.

### 1. Connect your project to that Penpot
In the folder of your project:

```
npx @penpair/web init --external https://design.penpot.app --gitignore
```

`init` writes a small settings file (`penpair.config.json`, commit it) and keeps your private files out of git for you.

### 2. Make your account and a file (once)
Open the Penpot address, create an account and log in. Create a project and a design file for this work.

### 3. Connect the assistant (once)
1. In Penpot open **Account, Integrations, MCP Server** and switch it on (not tried yet). Copy the address it shows; it contains your personal key, so treat it like a password. The key belongs to you, not to the team; each person who uses the assistant makes their own.
2. In your project folder run `npx @penpair/web connect` and paste the address when asked. Nothing is shown as you paste. It saves the address in `.env.local` (readable only by you, and added to `.gitignore`) and refuses an address that belongs to a different Penpot. (By hand instead: put the line `PENPAIR_MCP_URL=<the address>` in `.env.local` and keep that file out of git.)
3. Open your design file in Penpot, choose **File, MCP Server, Connect**, and keep that tab visible.

After connecting, run `npx @penpair/web connect --pin-file` and check the displayed file name and ID. This records the intended file in `penpair.config.json`; commit it for teammates. A different open file now blocks writes and file-specific exports. Basic reads warn. If doctor reports a file mismatch, open the expected file and reconnect its plugin.

### 4. Check that it works
```
npx @penpair/web doctor
```
Every line should say `ok`. If one says `FAIL`, the line under it says what to do. The usual ones:

| It says | What to do |
| --- | --- |
| penpot: not answering | Check the address in the config and your internet connection |
| editor and plugin: the MCP address points at another instance | The address in `.env.local` belongs to a different Penpot. Copy the one from this Penpot |
| editor and plugin: not connected | Do step 3.3 again and keep the tab visible |

Then try: `npx @penpair/web pages` lists the pages in the open file.

If you want to know what your Penpot offers before you start, `npx @penpair/web probe` lists its tools and limits. If `execute_code` is missing from that list, penpair cannot work with it. The hosted service, checked 2026-10-20 on Penpot 2.18.4, offers the same four tools and the same limits as a local Penpot (see `compatibility.md`).

### 5. Give the assistant its rules (once)
```
npx @penpair/web skills install
```
This copies the rules the assistant follows (how to work safely in Penpot, and how to judge a screen) into `.skills/` and makes them visible to Codex and Claude Code. It prints a line for each to add to your `AGENTS.md`. Then fill in `.skills/penpair-design/references/project-facts.md` (your file, never replaced): the Penpot file, the token sets, the names you use, who approves.

### Every day
Before moving into frontend implementation, choose the [companion adapters](adapters.md): use the library adapter for library-aware tokens/recipes and the recommended Reflection Check adapter for comparing the running frontend with approved designs. Installation and registration are the first steps; browser setup/provider evidence is a separate readiness stage.

Open the file in Penpot, choose **File, MCP Server, Connect**, keep the tab visible, and start working with the assistant.

### Your safety net
See the [hosted backup and scratch-restore guide](backup.md). `penpair backup file <new.penpot>` can try a bounded file export; it never replaces an existing archive and does not claim restore proof. Larger/failing exports use the manual UI route. Optional backup-note reminders are disabled unless configured.

`up`, `down`, Docker `status`, instance `backup` and instance `restore` belong to the Docker alternative; `backup file` is the separate hosted-file export candidate described above. Your safety net is Penpot's own version history and the `.penpot` export in the File menu. Whether an archive restores all required components, token sets and themes must be established with the [scratch restore checklist](backup.md#prove-the-restore-on-scratch).

## What it will not do
It needs the Penpot tab open and visible while the assistant works, so it cannot run on its own overnight. It changes one Penpot at a time and only the page you have open.

## Alternative: run Penpot on your own computer
Choose this when you want to work offline, keep the data on your machine, or have one Penpot per project that you can throw away. It needs **Docker Desktop** running in addition to Node.js, and the package `@penpair/docker`, which is kept apart so that web users carry none of it. The first start downloads about 2 GB.

```
npm i -D @penpair/docker
npx penpair init --gitignore
npx penpair up
```

(For a one-off run without installing: `npx @penpair/docker setup --docker`.) `@penpair/docker` is the same command as `@penpair/web` with the Docker commands added, and it includes everything in it, so install it instead of `@penpair/web`, not beside it. Without it, a Docker command stops and says where it comes from.

`init` also writes a hidden folder `.penpair/` with the Penpot settings and secret keys. When `up` says "Penpot is up at http://127.0.0.1:9001" (your port may differ; use `--port 9002` with `init` if one is taken), open that address and create an account (no email confirmation is needed). Then do steps 3 to 5 above in that Penpot (with `npx penpair connect`, `npx penpair doctor` and `npx penpair skills install`). `npx penpair doctor` also checks Docker, the secrets file and the containers:

| It says | What to do |
| --- | --- |
| docker: not answering | Start Docker Desktop and wait until it says it is running |
| containers: not running | Run `npx penpair up` |
| backend: not ready yet | Wait ten seconds and run `doctor` again |

Every day: `npx penpair up` (if Docker was restarted) and `npx penpair down` to stop; your designs stay. Back up before big changes with `npx penpair backup`, and prove a backup works with `npx penpair backup verify <the folder it printed>`. The backup contains account data, so never put it in git.

## Rotate or move a personal key

Follow [private credential storage and rotation](credentials.md). Use the provider UI and a private file/Keychain update, or the legacy hidden `connect --replace` prompt. Reconnect the intended editor and confirm the public file pin with doctor. The assistant should never receive either key value.
