# Foyer

Foyer reads a repository you just cloned and writes a briefing: how to run it, which environment names the code uses, and where the files disagree with each other.

It stays on your machine. It does not install dependencies, start databases, or upload the tree.

## Do this first

You need [Node.js](https://nodejs.org) 20.9 or newer. Node 22 is what this repo is developed with. npm is included with Node.

Open a terminal and check:

```bash
node -v
npm -v
```

`node -v` should print `v20.9.0` or a higher number, for example `v22.14.0`. If the terminal says `command not found`, install Node from nodejs.org and **open a new terminal**. The old window keeps the old PATH.

Then:

```bash
git clone https://github.com/633Labs/foyer.git
cd foyer
npm install
npm run brief -- samples/harbor-api
```

Stay in the `foyer` folder for every command below. You are in the right folder when `package.json` is in the current directory and its name field is `foyer`.

`npm install` is finished when it stops printing and there is no `npm ERR!` line. A `node_modules` folder appears next to `package.json`.

The last command prints a briefing for a sample payments API. The top of it looks like this:

```text
# harbor-api

Accepts payment webhooks and stores them for the ledger.

6 things to fix before you trust the setup, 3 worth a look.
```

The process exits with code 1. That is the successful demo: Harbor API disagrees with itself on purpose, and Foyer is telling you so. A clean checkout exits 0.

## Look at the same briefing in the browser

In the `foyer` folder:

```bash
npm run dev
```

Leave that terminal open. When it says the app is ready, open [http://127.0.0.1:43123](http://127.0.0.1:43123).

You should see **Harbor API** already loaded, with findings listed under it. You do not type a path for this. The two buttons are the samples that ship in this repo:

| Button | What it is |
| --- | --- |
| Harbor API | A small payments service whose files disagree. This is the demo. |
| Tidy Lib | The same kind of project after those disagreements are gone. |

**Copy briefing** puts the markdown on your clipboard.

Stop the server with Ctrl+C in that terminal when you are done. Closing the terminal also stops it.

## Check a repository you actually work on

Foyer is not installed inside the other project. You keep this `foyer` folder, and you point it at the other folder.

### In the terminal

Open a second terminal, `cd` into `foyer`, and pass the other project. A relative path is fine here:

```bash
cd foyer
npm run brief -- ../my-app
```

Or pass an absolute path:

```bash
npm run brief -- /Users/you/projects/my-app
```

On Windows PowerShell, an absolute path looks like `C:\Users\you\projects\my-app`.

Get the absolute path by standing in the project and running `pwd` (macOS and Linux) or `(Get-Location).Path` (Windows PowerShell). Copy that whole line.

The `--` is required when you add flags. It tells npm "everything after this belongs to Foyer." Without it, npm swallows `--json` and `--strict`, the briefing still prints, and the flag quietly does nothing.

```bash
npm run brief -- ../my-app --json
npm run brief -- ../my-app --strict
```

| Flag | Effect |
| --- | --- |
| *(none)* | Markdown on stdout. Exit 1 if anything is marked **Attention**. |
| `--json` | The same briefing as JSON. |
| `--strict` | Exit 1 for **Attention** and **Watch**. **Note** still does not fail the run. |

Exit codes:

| Code | Meaning |
| --- | --- |
| 0 | Nothing is marked Attention (and, with `--strict`, nothing is marked Watch). |
| 1 | The checkout was read, and at least one finding failed the run. |
| 2 | Foyer did not run the scan: missing path, or the path could not be read. The message is on stderr. |

`npm run brief` with no path prints the usage line and exits 2.

### In the browser

With `npm run dev` still running, paste an **absolute** path into **Local checkout** and press **Scan checkout**.

The path has to be a folder on the computer running Foyer, which is the computer where you typed `npm run dev`. A path that exists only on another laptop will not be found.

These are rejected, with the message in red under the form:

| What you typed | Message |
| --- | --- |
| `my-app` or `../my-app` | Use an absolute path, such as /absolute/path/to/checkout. |
| `~/projects/my-app` | Same message. The form does not expand `~`. |
| A path that is not there | No directory at … |
| A file, such as `package.json` | … is a file, not a checkout. |
| `/`, `/etc`, `/usr/bin`, and similar | That path is too broad to scan. Point Foyer at a single checkout. |

Scanning the `foyer` folder itself does **not** show the Harbor demo. `samples/` is listed in `.foyerignore`, so those two checkouts are skipped on purpose. Use the Harbor API button, or `npm run brief -- samples/harbor-api`.

## How to read a briefing

Findings come first. Each one names the files that disagree.

| Label | What to do with it |
| --- | --- |
| Attention | Fix this before you trust the setup. This is what makes the CLI exit 1. |
| Watch | Worth a look. The CLI exits 0 unless you passed `--strict`. |
| Note | Recorded, and left out of the pass/fail. |

Under the findings, the briefing lists package scripts, Make targets, Compose services, environment names, and runtime pins. Environment **values** are never copied. Only names.

A briefing of Harbor API calls out the ordinary mess: Node 18 in the image, 20 in `.nvmrc`, 22 in CI, `STRIPE_WEBHOOK_SECRET` missing from `.env.example`, and a README that still tells you to seed the database with a Make target the Makefile no longer has.

## When a command fails

| What you see | What to do |
| --- | --- |
| `node: command not found` or `npm: command not found` | Install Node.js 20.9+ from nodejs.org, then open a new terminal and run `node -v` again. |
| `node -v` prints `v18` or lower | Install Node 20 or 22. Next.js 16 refuses to start on older Node. |
| `npm ERR! enoent` and a missing `package.json` | You are not in the `foyer` folder. `cd` there and run the command again. |
| `npm ERR! Missing script: "brief"` | Same problem, or you are inside `samples/harbor-api`. Come back up to `foyer`. |
| The briefing is markdown even though you added `--json` | Put `--` before the path and the flag: `npm run brief -- ../my-app --json`. |
| The browser cannot connect to port 43123 | The dev server is not running, or it quit. Run `npm run dev` again and read the terminal. If it says the port is in use, another Foyer (or something else) already has 43123. |
| The path box is greyed out and says this copy only opens the two samples | This is a production server. Samples still work. To scan a local folder, start it with `FOYER_ALLOW_LOCAL_SCAN=1` (see below). `npm run dev` already allows path scans. |
| `Foyer could not read that checkout.` | The folder exists but a read failed for a reason other than the messages above. Check permissions on that folder. |

## What it reads

- `package.json` scripts, engines, Volta, and workspaces
- `.nvmrc`, `.node-version`, `.python-version`, `.ruby-version`, `.tool-versions`, `mise.toml`
- `go.mod`, and `requires-python` in `pyproject.toml`
- Dockerfiles (including `ARG` defaults on `FROM`), Compose services, Makefiles
- GitHub Actions `setup-node`, `setup-python`, `setup-go`, and `setup-ruby`
- Literal environment reads in JS, TS, Python, Go, Ruby, PHP, and Rust, compared with `.env.example`
- Commands in the README against scripts, Make targets, and Compose
- `.gitignore` coverage for `.env` and `node_modules`, and a missing `.dockerignore` next to a Dockerfile

These directories are skipped: `node_modules`, `.git`, `dist`, `build`, `coverage`, `.next`, `.venv`, `venv`, `__pycache__`, `vendor`, `target`, `.turbo`, `out`, `.cache`, and most other dot-directories. `.github` is still read.

A scan stops after 4,000 files. The briefing then includes a note that says so. Point Foyer at one package if the monorepo is larger than that.

`.foyerignore` in the checkout root skips extra paths. One path per line. A line ending in `/` skips that directory and everything under it. Other lines match one relative path exactly. `#` starts a comment. This is smaller than gitignore: no globs.

```text
# skip generated fixtures
samples/
```

## What a briefing will not claim

- It does not prove the app boots or the tests pass.
- Dynamic lookups such as `process.env[name]` are invisible.
- LTS codenames are reported and left uncompared.
- Ignore matching covers the patterns that leak `.env` and `node_modules`. It is narrower than git's matcher.
- Env file values are never copied into the briefing or the markdown.

## The gap this fills

The first hour in an unfamiliar checkout is still a README plus whoever is online. The usual disagreements:

- `.nvmrc` says Node 20, the Dockerfile says 18, and GitHub Actions installs 22.
- A webhook secret is read in code and missing from `.env.example`.
- The README still tells you to seed the database with a Make target that was deleted.
- `.gitignore` covers `.env`, and `.dockerignore` does not exist, so `COPY .` still ships it.

| Tooling | What it settles | What it leaves open |
| --- | --- | --- |
| Internal portals (Backstage and similar) | A catalog and owners, once a platform team runs the portal | A single repo you cloned this morning |
| Dev Containers, mise, asdf | Rebuilding a toolchain from a pin | The pin can still disagree with CI and the image |
| Single-check CLIs such as [node-drift](https://github.com/gapchix/node-drift), [toolchain-version-doctor](https://github.com/Naviepoo22/toolchain-version-doctor), [envsniff](https://github.com/harish124/envsniff), [driftguard](https://github.com/muhammetsafak/driftguard), and [ignorewhy](https://pkg.go.dev/github.com/3nrikas/ignorewhy) | One disagreement, as a pass or fail | You have to already know which question to ask |
| A generated tour of the repository | A fluent summary | A summary you can check against a file and a line |

Foyer is the one sitting: one briefing, evidence attached, produced on the machine that has the checkout. The same notes are in the app under **Why this exists**.

## Work on Foyer

```bash
npm test
npm run lint
```

A production build serves the two samples and, unless you opt in, refuses arbitrary paths:

```bash
npm run build
npm start
```

That listens on [http://127.0.0.1:43123](http://127.0.0.1:43123). To allow absolute-path scans from a production server:

```bash
FOYER_ALLOW_LOCAL_SCAN=1 npm start
```

Leave that unset on any copy that is reachable by people other than you. The variable is documented in `.env.example`.
