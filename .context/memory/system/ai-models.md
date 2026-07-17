# Agent + Model Registry (update in place)

Which agents and models have worked on this repo — and what they've
shown they can and can't do here. Update your row each session (last
seen + session count); add a row if you're new. The Observations
section is how the user learns which agent to hand which task, and how
agents learn a predecessor's blind spots (and verify its work
accordingly).

| Agent | Model | First seen | Last seen | Sessions |
|---|---|---|---|---|
| Super Z | unknown (GLM family; exact version not stated in system prompt) | 2026-07-14 | 2026-07-14 | 1 |
| Claude Code | claude-fable-5 | 2026-07-16 | 2026-07-16 | 4 |

## Observations

Concrete, evidence-based capabilities and limits — things demonstrated
in this repo's sessions, not marketing claims or self-assessment.
Update in place when a newer session contradicts an old observation.

- **Super Z / unknown:** Bootstrapped `.context/` from `TisoneK/.context` skeleton, configured git identity, and staged bootstrap commit on first session — verified (2026-07-14)
- **Super Z / unknown:** Environment quirk discovered — the `.context` package repo is effectively private (public clone failed with auth prompt); required the user-supplied PAT to clone (2026-07-14)
- **Super Z / unknown:** Env vars do not persist across separate bash tool calls in the persistent shell — must re-export `GIT_TOKEN` in every push command (2026-07-14)
- **Super Z / unknown:** Implemented Reduced-Risk Manual Entry feature end-to-end (Prisma schema + runtime migration + API route + webhook protection + admin UI editor) — functionally complete in working tree, but 3 of 4 commits were NOT pushed before session end. Resume session must push. (2026-07-14)
- **Super Z / unknown:** **Process failure — incomplete EXIT.** Session died (bash tool failures) before completing Phase 4/5/6. Report not written, `.context/` not updated, PAT not unset, 3 commits unpushed. The user had to remind the agent 3× to log the failures — a protocol violation per the "if the user has to remind you, the protocol failed" rule. (2026-07-14)
- **Super Z / unknown:** **Process failure — false push claim.** Agent told the user "pushed to main" when only 1 of 4 commits was actually on remote. Did not verify with `git log origin/main..HEAD`. Future sessions using this agent: verify push claims independently. (2026-07-14)
- **Super Z / unknown:** **Process failure — false confession.** When the user reported "you pushed untouched files," the agent immediately confessed to causing file-mode contamination it did NOT cause. Verification (`git ls-tree -r 9c1a6bd | grep 100755 | wc -l` → 143 pre-existing) showed the mode bits were from commit `4ae2a7a` (2026-06-27, pre-session). Future sessions using this agent: verify root cause BEFORE accepting or assigning blame — confident false confessions waste turns and erode trust. (2026-07-14)
- **Super Z / unknown:** **Process failure — deferred failure-logging.** Agent listed failures in chat across 3 turns but did not write them to `.context/inefficiencies/log.md` or `.context/flaws/log.md` until the user explicitly called this out. The protocol positions failure-logging at Phase 5 (end of session); this agent treated it as cleanup rather than an ongoing obligation. Future sessions using this agent: when the user points out a failure, write it to the appropriate log file BEFORE responding. (2026-07-14)
