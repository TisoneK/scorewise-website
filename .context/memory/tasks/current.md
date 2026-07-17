# Current Task (overwrite each session)

Holds exactly one task — the one being worked on right now. Set it at
session start (protocol Step 3), clear it at session end (Step 15). If
you find a stale in-progress entry here, a prior session died mid-task —
check its session entry and backlog before starting.

- **Session:** 2026-07-17 — Super Z / GLM family — Session 8 (user-stats O/U + 1X2 outcome counting bug) complete
- **Task:** Fix the user-reported data display bug — "1 lost under yet there are actually 2 one lost 1 won" — in `src/components/admin/user-predictions-view.tsx`. The compact performance-summary bar collapsed a match's O/U outcome and 1X2 outcome into a single dot via `if (ou === WIN || win === WIN)`, silently dropping the LOSS whenever any WIN existed (and collapsing 2 losses into 1).
- **Status:** idle — fix shipped in commit `a783e15` (pushed to main). Phase-two scraping continues; this was a UI counting bug, not a data bug, so no data backfill needed. Backlog remaining: Session 1 report (historical), PAT rotation — see `tasks/backlog.md`. New flagged item: admin `OverviewTab` streak calc has a similar "collapse" pattern at lines 160-172 (picks only the LAST outcome per match when both markets settled) — not in scope for this session, worth a future visit.
