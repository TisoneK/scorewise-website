# User Preferences (update in place)

How the user likes things done **on this project**. Seeded from
Pre-Flight at bootstrap; grows as sessions reveal preferences —
corrections the user gives, patterns they approve, things they state
outright. This file exists so the user never has to give the same
correction twice.

## Learning rules

1. **Record preferences, not instructions.** A preference is standing:
   it would apply to future sessions ("plain-language changelog
   entries"). An instruction is one-off ("skip the tests this once") —
   it dies with the session and does not belong here.
2. **Every bullet carries provenance** — how and when it was learned:
   `(pre-flight)`, `(stated, YYYY-MM-DD)`, `(correction, YYYY-MM-DD)`,
   `(approved pattern, YYYY-MM-DD)`. An explicit statement or correction
   outranks an inferred pattern.
3. **Current-state file.** When the user changes their mind, update the
   bullet in place and refresh its provenance — don't keep the stale
   version. History lives in the session log, not here.
4. **A session instruction beats a recorded preference for that
   session.** Follow the instruction; afterwards, if it looked like a
   standing change of mind, update this file.
5. **Committed to git — keep it professional.** Working-style facts
   only. Never personal details, never opinions about people, never
   credentials.

## Workflow

- Push to main directly after each commit; one logical change per commit (pre-flight, 2026-07-14)
- Findings handling: fix safe issues, flag architectural changes for approval (pre-flight, 2026-07-14)
- **Commit and push AFTER EACH logical change, not in batches at end of phase.** A mid-session shell failure left 3 commits unpushed and the user was told the feature was "pushed to main" when it wasn't. Batched commits are fragile. (correction, 2026-07-14)
- **When the user points out a failure, write it to the appropriate `.context/` log file BEFORE responding in chat.** Listing failures in chat without writing them to files is not documentation. (correction, 2026-07-14)

## Communication

- Plain-language changelog entries; technical detail in `.context/reviews/` reports (pre-flight, 2026-07-14)
- Chat summary delivered at session end (pre-flight, 2026-07-14)
- **Verify claims before stating them.** Don't say "pushed to main" without checking `git log origin/main..HEAD`. Don't confess to a bug without verifying with `git ls-tree` / `git log --raw`. A confident false claim (in either direction) wastes the user's time and erodes trust. (correction, 2026-07-14)

## Code style

- Follow existing project conventions; prefer minimal, surgical changes (inferred from project structure, 2026-07-14)
- **When copying a pattern from existing code, lint-check the source pattern first.** If the source has lint errors, don't propagate them — fix or work around them in the new code. (correction, 2026-07-14)

## Review depth

- Discovery + review + fix all safe issues; flag architectural changes (pre-flight, 2026-07-14)
- **Backlog out-of-scope findings, don't silently skip them.** Pre-existing TS errors, the duplicate `signIn` bug, the `needingResults` ReferenceError, and the dependabot vulns were all noticed in Phase 1/2 and silently skipped. They belong in `tasks/backlog.md`. (correction, 2026-07-14)

## Risk & approvals

- Schema changes need explicit approval (default, 2026-07-14)
- Never bump a major dependency version without flagging it (default, 2026-07-14)
