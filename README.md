# Foyer

A local briefing for a repository you just cloned. Foyer reads the checkout and writes down how to run it, which environment names the code actually uses, and where the repo disagrees with itself.

It is an open source, offline static analysis tool. It does not install dependencies, boot services, or send the tree anywhere.

## The need

The first hour in an unfamiliar checkout is still held together by a README and whoever is online. Typical disagreements:

- `.nvmrc` says Node 20, the Dockerfile says 18, and GitHub Actions installs 22.
- A webhook secret is read in code and missing from `.env.example`.
- The README still tells you to seed the database with a Make target that was deleted.
- `.gitignore` covers `.env`, and `.dockerignore` does not exist, so `COPY .` still ships it.

## What already exists

| Tooling | What it settles | What it leaves open |
| --- | --- | --- |
| Internal portals (Backstage and similar) | A catalog and owners, once a platform team runs the portal | A single repo you cloned this morning |
| Dev Containers, mise, asdf | Rebuilding a toolchain from a pin | The pin can still disagree with CI and the image |
| Single-check CLIs such as [node-drift](https://github.com/gapchix/node-drift), [toolchain-version-doctor](https://github.com/Naviepoo22/toolchain-version-doctor), [envsniff](https://github.com/harish124/envsniff), [driftguard](https://github.com/muhammetsafak/driftguard), and [ignorewhy](https://pkg.go.dev/github.com/3nrikas/ignorewhy) | One disagreement, as a pass or fail | You have to already know which question to ask |
| A generated tour of the repository | A fluent summary | A summary you can check against a file and a line |

Those checkers showed up because the pain is real. The thin spot is the artifact a person can read in one sitting: one briefing, evidence attached, produced on the machine that has the checkout.

## Run it

Requires Node.js 22 or newer.

```bash
npm install
npm run dev
```

The app listens on [http://127.0.0.1:43123](http://127.0.0.1:43123). Harbor API loads first: a small payments service whose files disagree. Tidy Lib is the same kind of checkout once they agree.

To brief a checkout on disk, paste its absolute path. `npm run dev` allows that. A production server allows it only when `FOYER_ALLOW_LOCAL_SCAN=1` is set, so a public deploy stays limited to the two samples.

The same engine runs as a CLI:

```bash
npm run brief -- samples/harbor-api
npm run brief -- /absolute/path/to/checkout --json
```

The process exits 1 when a finding needs attention. `--strict` also exits 1 for items worth a look.

```bash
npm test
npm run lint
```

## What it reads

- `package.json` scripts, engines, Volta, and workspaces
- `.nvmrc`, `.node-version`, `.python-version`, `.ruby-version`, `.tool-versions`, `mise.toml`
- `go.mod`, `pyproject.toml` `requires-python`
- Dockerfiles (including `ARG` defaults on `FROM`), Compose services, Makefiles
- GitHub Actions `setup-node`, `setup-python`, `setup-go`, and `setup-ruby`
- Literal environment reads in JS, TS, Python, Go, Ruby, PHP, and Rust, compared with `.env.example`
- Commands in the README against scripts, Make targets, and Compose
- `.gitignore` coverage for `.env` and `node_modules`, and a missing `.dockerignore` next to a Dockerfile

`.foyerignore` skips paths. This repo ignores `samples/` so a briefing of Foyer itself does not inherit the demo drift.

## Limits

Foyer does not prove the app boots. Dynamic lookups such as `process.env[name]` are invisible. LTS codenames are reported and left uncompared. Ignore matching is narrower than git's. Env file values are never copied into the briefing.
