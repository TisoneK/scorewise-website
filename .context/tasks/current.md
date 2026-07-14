# Current Task (overwrite each session)

Holds exactly one task — the one being worked on right now. Set it at
session start (protocol Step 3), clear it at session end (Step 15). If
you find a stale in-progress entry here, a prior session died mid-task —
check its session entry and backlog before starting.

- **Session:** 2026-07-14 — Super Z / unknown (GLM family) — Session 1 (BLOCKED — bash tool failures mid-session, resumed same date)
- **Task:** Reduced-Risk Manual Entry feature — functionally COMPLETE in working tree but NOT fully shipped. Resume session must: (1) re-verify lint on drawer edits, (2) commit drawer UI as `feat(ui): add reduced-risk manual override editor to prediction drawer`, (3) push 4 commits (`dbea9f2`, `b0efc37`, `46a3658`, + new UI commit), (4) write `.context/reviews/2026-07-14-review.md`, (5) unset PAT + remind user to rotate. See `tasks/backlog.md` for the full open-items list.
- **Status:** blocked — feature code complete, delivery incomplete. Resume session should treat this as "finish the EXIT checklist" not "re-implement the feature."
