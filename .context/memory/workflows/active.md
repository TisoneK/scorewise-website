# Active Workflow (overwrite when the workflow changes)

The workflow currently in force for this repo — which protocol edition
agents follow and the standing session parameters. Update only when the
user changes the rules; note the change in your session entry.

- **Protocol:** by agent type — local agents → .context/core/rules/ai-engineering-protocol-local.md; cloud/sandbox agents → .context/core/rules/ai-engineering-protocol.md
  <!-- ALWAYS record it exactly like that — "by agent type", naming BOTH.
  NEVER record only the edition YOU happen to be: the next agent on this
  project may be the other type, will read this field as binding, and
  will inherit your platform's behavior (a local agent doing cloud PAT
  dances, or a cloud agent skipping its clone). The edition is a
  per-agent-type fact, not a project fact. -->
- **Protocol location:** on disk — vendored in `.context/core/` (no network fetch needed; version in `.context/core/VERSION`, last verified in `../core.lock`)
- **Package upstream (for flaw back-ports + core updates):** https://github.com/TisoneK/.context.git
- **Since:** 2026-07-14 (protocol location updated 2026-07-16 — migrated to vendored core 0.2.0)
- **Default role:** engineer — unless a session says otherwise; see `.context/core/roles/`
- **Scope:** discovery + review + implement feature
- **Target:** feature — Reduced-Risk Manual Entry (allow admins/operators to manually enter or update reduced-risk values when scraped source (e.g., Flashscore) odds diverge from betting-site odds)
- **Focus areas:** all — backend (Prisma schema, API routes), frontend (admin UI), data integrity, security (authz for admin/operator), testing
- **Findings handling:** fix safe, flag architectural
- **Push policy:** push to main directly after each commit
- **Commit style:** Conventional Commits with scope; `chore(context):` for this directory
- **Commit granularity:** one logical change per commit
- **Deliverable:** report in `.context/memory/reviews/` + chat summary
