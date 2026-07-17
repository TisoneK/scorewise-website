# Environments (update in place)

Machines and sandboxes agents have run on, and what it takes to work on
this project from each. One block per environment; update the matching
block (and its "last verified" date) every time you run on it again.

## Rules

1. **Match before you add.** At session start, check whether the machine
   you're on already has a block (use its "Identify by" line). Update the
   match; add a new block only for a genuinely new environment.
2. **Record what you verified, not what you assume.** A command belongs
   under "Verified commands" only after it ran successfully on this
   environment, this project.
3. **Agents never delete blocks.** An environment the project no longer
   uses may be pruned by the user; if you can't verify a block, leave it
   alone — its last-verified date already says how stale it is.
4. **Machine facts only.** Secret values go in `secrets/`; user
   preferences in `user/`; project-wide decisions in `plans/`.

---
## Z.ai cloud sandbox (last verified 2026-07-14)
- **Identify by:** workspace path `/home/z/my-project`; hostname `c-*-144c75ca-*`; Debian 13 (trixie) container
- **OS:** Debian GNU/Linux 13 (trixie); kernel 5.10.134
- **Runtimes:** Node v24.18.0, Bun 1.3.14, Python 3.12.13
- **Package manager:** npm 11.16.0 (project default — uses `package-lock.json`); bun available as fallback
- **Verified commands:** `git clone` (public + PAT-authenticated), `git config user.name/email`, `cp -r ../.context/context-skeleton .context` (bootstrap), `npm install` (283 packages, 9 moderate vulns), `npx prisma generate` (post-schema-change), `npx tsc -b` (typecheck — 12 pre-existing errors, see backlog), `npx eslint <file>` (lint — 14 pre-existing errors baseline), `git commit` + `git push origin main` (PAT re-added to remote URL then stripped)
- **Quirks:**
  - No `psql` client installed — use Prisma migrations and `prisma db push` for schema work; can't introspect the DB directly from CLI.
  - **Env vars DO NOT persist across separate `Bash` tool calls** despite the "persistent shell" description. Re-export `GIT_TOKEN` in EVERY push command. Forgetting this produces a confusing auth failure on push.
  - The project repo is public (clone works without PAT), but **pushes require the PAT** (re-add the token to the remote URL before push, then strip it after — see protocol Step 12 for the pattern; the authenticated URL form must never be recorded in tracked files per Pitfall #40).
  - The `.context` package repo (`TisoneK/.context`) is documented as public but **required the PAT to clone** — treat as effectively private.
  - **The `Bash` tool can fail intermittently** with `tool call failed: Bash` / `Post "http://prod-wsmgr-svc:8080/mcp": EOF` — no output, no exit code. If this happens 2+ times consecutively, tell the user to restart (Rule 12) and commit/push any uncommitted work BEFORE the failures cascade.
  - **The repo has 143+ files at mode `100755` (executable)** — this is PRE-EXISTING (from commit `4ae2a7a` authored 2026-06-27), not caused by agent sessions. `git diff` will show mode changes if `core.fileMode` is true; set `git config core.fileMode false` locally to suppress the noise. Do NOT "fix" the mode bits — it would create a huge noise commit and the user has not requested it.

---
## Baos-Mac-mini.local (last verified 2026-07-16)
- **Identify by:** hostname `Baos-Mac-mini.local`, `$USER` = `bao`, repo at `/Users/bao/Code/scorewise-website`
- **OS:** macOS 15.7.7 (Darwin 24.6.0)
- **Runtimes:** node v24.17.0, Python 3.9.6 (system)
- **Package manager:** npm 11.13.0
- **Verified commands:** git clone/mv/rm/commit/push (migration session); `npm install` and app commands not yet run here
- **Quirks:** pushes to TisoneK repos from this machine used a chat-supplied PAT (one-off URL form, never stored in `.git/config`); node_modules not installed yet
