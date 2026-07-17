# Backlog (append-only)

Open items for future sessions. Append at the bottom; never delete or
reorder. When an item is done, check it off and note the session/commit —
don't remove the line.

<!-- TEMPLATE — copy below the last entry:
---
- [ ] **<short title>** (added YYYY-MM-DD by <agent>) — <enough context that
      a fresh agent can act on this without any chat history. Severity if known.>
-->

---
- [x] **Push unpushed commits + commit drawer UI** _(done — resolved before Session 2: all 4 commits pushed, drawer committed as 8491623; see Session 1 corrections)_ (added 2026-07-14 by Super Z, Session 1) — Commits `dbea9f2` (schema), `b0efc37` (api/webhook/types), `46a3658` (reduced-risk route) are local-only. On top of `46a3658` there are uncommitted edits to `src/components/admin/prediction-detail-drawer.tsx` (the Reduced-Risk Manual Override editor in the Odds tab — 4 inputs in 2x2 grid, Save/Clear buttons, source badge, validation). The drawer edits passed typecheck and lint (no new errors vs baseline). Resume session must: (1) re-verify lint is still clean, (2) commit the drawer edits as `feat(ui): add reduced-risk manual override editor to prediction drawer`, (3) push all 4 commits. Severity: HIGH — feature is not usable on production until pushed.

---
- [ ] **Write Session 1 report** (added 2026-07-14 by Super Z, Session 1) — `.context/reviews/2026-07-14-review.md` was never written. Protocol Step 13 mandates it. The report should cover: discovery phase (tech stack, structure, conventions), baseline health (12 pre-existing TS errors, 14 pre-existing ESLint errors — all documented), Phase 2 findings (the 4 reduced-risk columns + the source-tracking gap), Phase 3 fixes applied (schema + API + webhook protection + UI), open items (this backlog), recommended next steps. Severity: MEDIUM — protocol compliance, not blocking the feature.

---
- [x] **Fix duplicate `signIn` callback in src/lib/auth.ts** _(done — Session 5, commit 0026356)_ (added 2026-07-14 by Super Z, Session 1) — Lines 68–90 define a `signIn` callback that auto-creates Google OAuth users on first sign-in. Lines 91–117 define a SECOND `signIn` callback that logs login events. JavaScript object literal semantics: the second declaration silently shadows the first. Net effect: Google OAuth users are NEVER auto-created on sign-in — the first callback is dead code. This is a real bug, not a style issue. Baseline TS error `TS2300: Duplicate identifier 'signIn'` at line 91 confirms it. Severity: HIGH — Google OAuth signup is broken. Fix: merge the two callbacks into one that does both (auto-create AND log).

---
- [x] **Fix undefined `needingResults` in src/app/api/cron/scrape-results/route.ts:181** _(done — Session 5, commit 51a21d5)_ (added 2026-07-14 by Super Z, Session 1) — Baseline TS error `TS2304: Cannot find name 'needingResults'`. This is a runtime ReferenceError waiting to happen — when that code path executes, it will throw. The cron job that scrapes final scores is likely broken. Severity: HIGH — results scraping may be non-functional. Fix: define `needingResults` earlier in the function, or correct the variable name (possibly a rename that missed one usage).

---
- [x] **Fix `react-hooks/immutability` error in prediction-detail-drawer.tsx:189** _(done — Session 5, commit 5a99f93 — also fixed the setState-in-effect error)_ (added 2026-07-14 by Super Z, Session 1) — The existing `saveBetCode` handler mutates the `prediction` prop directly: `prediction.bet_code = betCodeInput.trim() || null;`. This is a baseline ESLint error. I noticed it, replicated it in my new `saveReducedRisk` handler (then fixed my copy), but left the original broken. Severity: LOW (lint error, no runtime impact because the parent doesn't re-render the drawer with the same object identity) — but it's a bad pattern that future code might copy. Fix: lift the bet-code state to the parent, or use a callback prop `onBetCodeSaved(matchId, newCode)` that updates the parent's predictions array.

---
- [x] **Investigate 4 dependabot vulnerabilities** _(done — Session 5, commit 869364c — npm audit now 0 vulnerabilities via same-major overrides)_ (added 2026-07-14 by Super Z, Session 1) — GitHub reported "4 moderate vulnerabilities on default branch" on every push this session. I never ran `npm audit` or investigated. The Security Review section of the protocol mandates this. Severity: MEDIUM — moderate vulns, but unknown whether exploitable. Fix: run `npm audit`, review the 4 advisories, apply safe fixes, flag breaking ones.

---
- [x] **Other pre-existing TS errors (10 of 12)** _(done — Session 5, commit 76a39fe — tsc --noEmit is 0 errors)_ (added 2026-07-14 by Super Z, Session 1) — Beyond the duplicate `signIn` and `needingResults` (backlogged separately), baseline has 10 more TS errors: `examples/websocket/{frontend,server}.tsx` missing `socket.io-client` / `socket.io` modules (likely just missing devDeps — examples may be non-functional); `src/app/api/admin/scraper/route.ts:265,268` property access on `never` (likely a narrowed type that needs widening); `src/app/api/admin/users/stats/route.ts:59` `any` not assignable to `never` (likely a `reduce` with wrong initial type); `src/app/api/predictions/route.ts:101` `Record<string, unknown>[]` not assignable to typed array (the `USER_FIELDS` stripping branch — needs an explicit cast or a proper type); `src/lib/db.ts:20,24` `string[]` not assignable to `(LogLevel | LogDefinition)[]` (Prisma log level config — needs proper enum values). Severity: LOW individually, MEDIUM collectively — the codebase builds despite these (Vercel build apparently tolerates them) but they indicate type-safety debt. Fix each file in a separate commit.

---
- [ ] **Unset PAT + remind user to rotate** (added 2026-07-14 by Super Z, Session 1) — `GIT_TOKEN` was never unset (Step 19 skipped). The PAT was pasted in the user's first chat message. Resume session must: (1) `unset GIT_TOKEN` in the shell, (2) verify with `echo "${GIT_TOKEN}"` (should be empty), (3) remind the user to rotate the PAT (reference by last 4 chars only — never the full value). Severity: HIGH (security) — the PAT is in the chat transcript and may be logged.

---
- [ ] **Admin OverviewTab streak-calc collapses both-market matches to one outcome** (added 2026-07-17 by Super Z, Session 8) — `src/components/admin/tabs/overview-tab.tsx` lines 160-172 (the streak loop). For each settled bet it builds `outcomes: ("W"|"L")[]` by pushing `b.ou` then `b.win`, then takes `outcomes[outcomes.length - 1]` — i.e. only the LAST outcome (always the 1X2 outcome, since it's pushed second). So a match where O/U won and 1X2 lost contributes only "L" to the streak; a match where O/U lost and 1X2 won contributes only "W". Same family as the user-predictions-view.tsx bug fixed in `a783e15`, but in the admin streak calc. Severity: LOW-MEDIUM — streak is a vanity metric, not a financial number, but it's still wrong. Fix: probably count O/U and 1X2 streaks separately and display both, or pick the WORST outcome per match (loss dominates) for a "conservative" streak. Needs a product decision before fixing.
