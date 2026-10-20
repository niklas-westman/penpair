# Getting started

Draft. Written for someone who has not used a terminal much. The steps marked **(not tried yet)** come from Penpot's help pages, not from a run; the first person to follow this guide on a clean machine should mark what differs.

There are two roles. You may be both.

- **The designer** works in Penpot in the browser. Nothing to install if someone runs Penpot for the team (go to "If you are the designer").
- **The person who sets Penpot up** runs it on a computer with Docker and connects the AI assistant to it (go to "If you set it up").

## If you are the designer
You need a link to your team's Penpot and an account.

1. Open the link and log in.
2. Open the design file you will work on.
3. Choose **File, MCP Server, Connect** (not tried yet). A small window may appear; leave it open.
4. Keep this browser tab **visible** while the assistant works. If the browser puts the tab to sleep, the assistant stops and says the tab is suspended. Bring the tab to the front and it carries on.
5. Tell the assistant which page to work on. It works on the page you have open.

That is all. The assistant looks first, changes things in one go, and checks its own work; you review the result in Penpot as usual.

## If you set it up
You need: a Mac or Linux computer, **Docker Desktop** running, **Node.js** (the current LTS version), and a terminal.

### 1. Create the project's Penpot
In the folder of your project:

```
npx penpair init --gitignore
npx penpair up
```

`init` writes a small settings file (`penpair.config.json`, commit it) and a hidden folder `.penpair/` with the Penpot settings and secret keys (it is kept out of git for you). `up` starts Penpot. The first start downloads about 2 GB and can take several minutes; after that it takes seconds.

When it says "Penpot is up at http://127.0.0.1:9001" (your port may differ), open that address.

If it says a port is taken, run `init` again with `--port 9002` (any free number from 1024 up).

### 2. Make your account (once)
Open the address, choose **Create an account** and fill it in. No email confirmation is needed on your own computer.

### 3. Connect the assistant (once)
1. In Penpot open **Account, Integrations, MCP Server** and switch it on (not tried yet). Copy the address it shows; it contains your personal key, so treat it like a password.
2. In your project folder, open the file `.env.local` (create it if it does not exist; it is kept out of git) and add one line:
   ```
   PENPAIR_MCP_URL=<paste the address here>
   ```
3. Open any file in Penpot, choose **File, MCP Server, Connect**, and keep that tab visible.

### 4. Check that it works
```
npx penpair doctor
```
Every line should say `ok`. If one says `FAIL`, the line under it says what to do. The usual ones:

| It says | What to do |
| --- | --- |
| docker: not answering | Start Docker Desktop and wait until it says it is running |
| containers: not running | Run `npx penpair up` |
| backend: not ready yet | Wait ten seconds and run `doctor` again |
| editor and plugin: the MCP address points at another instance | The address in `.env.local` belongs to a different Penpot. Copy the one from this Penpot |
| editor and plugin: not connected | Do step 3.3 again and keep the tab visible |

Then try: `npx penpair pages` lists the pages in the open file.

### Every day
- Start: `npx penpair up` (if Docker was restarted). Stop: `npx penpair down`. Your designs stay.
- Back up before big changes: `npx penpair backup`. Prove a backup works: `npx penpair backup verify <the folder it printed>`. The backup contains account data, so never put it in git.

## If your team already runs Penpot (or you use the hosted one)
You do not need Docker. In your project folder:

```
npx penpair init --external https://design.penpot.app
```

(Use your team's address instead if it runs its own.) Then do steps 2 and 3 above in that Penpot: your account, the MCP key into `.env.local`, and **File, MCP Server, Connect**. `npx penpair doctor` checks that the Penpot answers, that the key belongs to it and that the plugin is connected.

Some things differ: `up`, `down`, `status`, `backup` and `restore` do not apply (Penpot's own version history and export are your safety net), and the hosted service may offer fewer tools than your own computer's Penpot. `npx penpair probe` lists exactly what it offers; if `execute_code` is missing from that list, penpair cannot work with it. On the hosted service, the probe found the same four tools as a local Penpot and the same limits (checked once, on an empty file; changes to a file with content are not tried yet).

## What it will not do
It needs the Penpot tab open and visible while the assistant works, so it cannot run on its own overnight. It changes one Penpot at a time and only the page you have open.

## Still to make easier (see PLAN.md)
- One guided command that does steps 1 to 4, waits for each browser step and says what it sees.
- A shared Penpot for a team, so designers need no setup.
