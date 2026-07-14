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
- **Verified commands:** `git clone`, `git config user.name/email`, `cp -r` (skeleton bootstrap) — see Phase 1 for build/lint/test commands
- **Quirks:** No `psql` client installed — use Prisma migrations and `prisma db push` for schema work; can't introspect the DB directly from CLI. Persistent shell session across bash calls but env vars DO NOT persist — re-export `GIT_TOKEN` in every command that pushes. The project repo is public (clone works without PAT), but pushes require the PAT (re-add via `git remote set-url` then strip after push). The `.context` package repo required the PAT to clone even though the kickoff said public — treat as effectively private.
