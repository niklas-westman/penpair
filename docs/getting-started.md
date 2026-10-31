# Manual installation

Run each step yourself, at your own pace. Prefer your assistant to guide you? [Choose the recommended route](installation.md#recommended-set-it-up-with-your-assistant). Both routes produce the same setup.

Browser menu labels below marked **(not tried yet)** still need a fresh live check; use [compatibility](compatibility.md) for the recorded environment checks.

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

### 0. Install the command package

In your application's folder (not a clone of Penpair):

```sh
pnpm add -D @penpair/web
```

Using npm? Run `npm install --save-dev @penpair/web`, then use `npx penpair` in place of `pnpm exec penpair` below. In a pnpm workspace, add `-w` when installing at its root. Start with a `package.json`; in an empty trial folder, create one with `npm init -y` first.

For Docker, install `@penpair/docker` instead and follow the [local Penpot steps](#alternative-run-penpot-on-your-own-computer). Install only one command package.

### 1. Connect your project to that Penpot
In the folder of your project:

```
pnpm exec penpair init --external https://design.penpot.app --gitignore
```

`init` writes a small settings file (`penpair.config.json`, commit it) and keeps your private files out of git for you.

### 2. Make your account and a file (once)
Open the Penpot address, create an account and log in. Create a project and a design file for this work.

### 3. Connect the assistant (once)

1. In Penpot click your **profile image**, choose **Your account**, then **Integration**. Toggle MCP to enabled, then copy the URL shown on that page (the full address, not only the token); it contains your personal key, so treat it like a password. Each teammate uses their own key.
2. Open the intended design file, choose **File, MCP Server, Connect**, and keep that tab visible.
3. In your project's terminal run `pnpm exec penpair connect` and paste the address into the hidden prompt. It saves the address in private, git-ignored `.env.local` and refuses an address for a different Penpot. Never paste the address into chat. [Private file and Keychain references](credentials.md) are also supported.
4. When asked to pin the file, check its displayed name and ID before accepting. If you skipped the prompt, verify the correct file is open before running `pnpm exec penpair connect --pin-file`; that flag accepts the pin without another confirmation.

The pin is saved in `penpair.config.json`; commit it for teammates. A different open file blocks writes and file-specific exports. Basic reads warn. If doctor reports a mismatch, open the expected file and reconnect its plugin.

### 4. Check that it works
```
pnpm exec penpair doctor
```
Every line should say `ok`. If one says `FAIL`, the line under it says what to do. The usual ones:

| It says | What to do |
| --- | --- |
| penpot: not answering | Check the address in the config and your internet connection |
| editor and plugin: the MCP address points at another instance | The address in `.env.local` belongs to a different Penpot. Copy the one from this Penpot |
| editor and plugin: the MCP endpoint (from `claude-config` or `codex-config`) points at another Penpot | The address comes from your assistant's own config, not this project. Run `pnpm exec penpair connect` and paste this Penpot's address; the project's `.env.local` takes precedence |
| editor and plugin: not connected | Reconnect the plugin in step 3.2 and keep the tab visible |

Then try: `pnpm exec penpair pages` lists the pages in the open file.

If you want to know what your Penpot offers before you start, `pnpm exec penpair probe` lists its tools and limits. If `execute_code` is missing from that list, penpair cannot work with it. The hosted service, checked 2026-10-20 on Penpot 2.18.4, offers the same four tools and the same limits as a local Penpot (see `compatibility.md`).

### 5. Give the assistant its rules (once)
```
pnpm exec penpair skills install --agents AGENTS.md --dry-run
pnpm exec penpair skills install --agents AGENTS.md
pnpm exec penpair skills check --agents AGENTS.md --json
```
Review the preview before applying it. This copies the rules the assistant follows into the project's skill folder, creates discovery links and adds task routing to `AGENTS.md`. Use `CLAUDE.md` instead if that is your instruction file. Existing project text outside the owned section is preserved. The final command checks discovery and routing; observe actual skill use separately.

Then fill in `penpair-design/references/project-facts.md` in the skill folder printed by the installer (your file, never replaced): the Penpot file, the token sets, the names you use, who approves. See [skill installation](skill-installation.md) for destination choices and existing setups.

### 6. Finish and choose companions

Commit your dependency and lockfile, `penpair.config.json`, Git ignore rules and reviewed skill/instruction files. Keep `.env.local` and private connection files out of Git.

Choose [companion adapters](adapters.md): add Marwes UI when your app uses it, and the recommended Reflection Check adapter for frontend comparison. Keep versions aligned. Installation and registration do not replace approved references or a real browser provider.

You are connection-ready when `doctor` is healthy, `pages` names the intended file and skill discovery checks pass. Observe actual skill use in your assistant separately; comparison readiness is a further step. Try the [read-only first task](../README.md#try-your-first-task).

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
