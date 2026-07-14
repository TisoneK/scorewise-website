# Current Task (overwrite each session)

Holds exactly one task — the one being worked on right now. Set it at
session start (protocol Step 3), clear it at session end (Step 15). If
you find a stale in-progress entry here, a prior session died mid-task —
check its session entry and backlog before starting.

- **Session:** 2026-07-14 — Super Z / unknown (GLM family)
- **Task:** Implement Reduced-Risk Manual Entry feature — allow admins/operators to manually enter or update reduced-risk values when the scraped source (e.g., Flashscore, up to ~1.6) diverges from the betting site's actual odds (which can be ≤1.10). Add Prisma schema, API routes, and admin/operator UI.
- **Status:** in-progress
