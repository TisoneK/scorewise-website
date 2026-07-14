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

## Observations

Concrete, evidence-based capabilities and limits — things demonstrated
in this repo's sessions, not marketing claims or self-assessment.
Update in place when a newer session contradicts an old observation.

- **Super Z / unknown:** Bootstrapped `.context/` from `TisoneK/.context` skeleton, configured git identity, and staged bootstrap commit on first session — verified (2026-07-14)
- **Super Z / unknown:** Environment quirk discovered — the `.context` package repo is effectively private (public clone failed with auth prompt); required the user-supplied PAT to clone (2026-07-14)
- **Super Z / unknown:** Env vars do not persist across separate bash tool calls in the persistent shell — must re-export `GIT_TOKEN` in every push command (2026-07-14)
