# User Stats Bar — O/U + 1X2 Outcome Counting Bug

**Date:** 2026-07-17 · **Agent:** Super Z / GLM family · **Session:** 8 · **Commit:** `a783e15` (pushed to `main`) · **Files changed:** 1 (`src/components/admin/user-predictions-view.tsx`)

## User complaint

> "Fix the data displaying eg 1 lost under yet there are actually 2 one lost 1 won"

## Root cause

`UserPredictionsView` (the non-admin user's main predictions page) renders a compact performance summary card showing Wins / Losses / Hit Rate / ROI + a row of recent-form dots. The for-loop that populated those counts combined the O/U outcome and the 1X2 (winner) outcome of a single prediction using "OR" logic:

```ts
for (const p of settled) {
  const ou = computeReducedRiskOutcome(p);
  const win = computeWinnerOutcome(p);
  if (ou === "WIN" || win === "WIN") {
    wins++; staked++;
    profit += (od ? Number(od) - 1 : 0) + (wod && win === "WIN" && ou !== "WIN" ? Number(wod) - 1 : 0);
    form.push("W");
  } else if (ou === "LOSS" || win === "LOSS") {
    losses++; staked++;
    profit -= 1;
    form.push("L");
  }
}
```

Because every basketball match carries **both** an O/U bet AND a 1X2 bet, a single settled match has two outcomes. When they differed (e.g. O/U lost + 1X2 won, or vice versa), the buggy `||` collapsed them into a single dot — **the LOSS was silently dropped whenever any WIN existed**. Symmetrically, when both markets lost, the two losses collapsed to one (`losses++` ran once).

Net effect on the user-facing compact bar:

| Reality (1 match, both markets) | OLD display | Should display |
|---|---|---|
| O/U LOSS + 1X2 WIN | `1W / 0L` | `1W / 1L` |
| O/U WIN + 1X2 LOSS | `1W / 0L` | `1W / 1L` |
| O/U WIN + 1X2 WIN | `1W / 0L` | `2W / 0L` |
| O/U LOSS + 1X2 LOSS | `0W / 1L` | `0W / 2L` |

This is exactly the "1 lost under yet there are actually 2 one lost 1 won" pattern the user reported.

The admin `OverviewTab` already handled this correctly — it tracks `ouResult` and `winResult` separately per prediction in its `settledBets` memo, then sums them. The bug was scoped to the user-facing compact bar.

## Fix

Replaced the single `if (ou === WIN || win === WIN)` branch with two independent blocks — one for the O/U bet, one for the 1X2 bet. Each settled bet now contributes its own `wins++/losses++/staked++`, its own profit delta, and its own form dot.

```ts
for (const p of settled) {
  const ou = computeReducedRiskOutcome(p);
  const win = computeWinnerOutcome(p);

  // O/U outcome (one bet)
  if (ou === "WIN" || ou === "LOSS") {
    staked++;
    if (ou === "WIN") { wins++; profit += od ? Number(od) - 1 : 0; form.push("W"); }
    else { losses++; profit -= 1; form.push("L"); }
  }

  // Winner (1X2) outcome (another bet — counted independently)
  if (win === "WIN" || win === "LOSS") {
    staked++;
    if (win === "WIN") { wins++; profit += wod ? Number(wod) - 1 : 0; form.push("W"); }
    else { losses++; profit -= 1; form.push("L"); }
  }
}
```

PUSH outcomes (`computeOverUnderOutcome` returns `"PUSH"` when total === bookmaker line — basketball half-point lines make this rare, but possible with whole-number lines) are skipped: no `staked++`, no `profit` delta, no form dot. This matches the existing UI which only renders W (green) / L (red) dots — no P slot exists in the compact bar. (The admin `OverviewTab` and the public `PublicStatsBanner` both track pushes in their own displays; bringing P support to this compact bar would be a separate feature pass, not part of this bug fix.)

## Verification

Standalone script at `/home/z/my-project/scripts/verify-fix.mjs` runs 6 scenarios through both the OLD and NEW logic and asserts the NEW logic matches the expected counts. All 6 pass; the OLD logic undercounted in 4 of 6.

| Scenario | OLD | NEW | Expected |
|---|---|---|---|
| 1 match: O/U LOSS + 1X2 WIN | `1W/0L`, form `["W"]` | `1W/1L`, form `["L","W"]` | `1W/1L`, form `["L","W"]` ✓ |
| 1 match: O/U WIN + 1X2 LOSS | `1W/0L`, form `["W"]` | `1W/1L`, form `["W","L"]` | `1W/1L`, form `["W","L"]` ✓ |
| 1 match: both WON | `1W/0L`, form `["W"]` | `2W/0L`, form `["W","W"]` | `2W/0L`, form `["W","W"]` ✓ |
| 1 match: both LOST | `0W/1L`, form `["L"]` | `0W/2L`, form `["L","L"]` | `0W/2L`, form `["L","L"]` ✓ |
| 2 matches: O/U-only LOSS + 1X2-only WIN | `1W/1L`, form `["L","W"]` | `1W/1L`, form `["L","W"]` | `1W/1L`, form `["L","W"]` ✓ (OLD already correct here) |
| 1 match: O/U PUSH + 1X2 WIN | `1W/0L`, form `["W"]`, profit 1.52 | `1W/0L`, form `["W"]`, profit 0.67 | `1W/0L`, form `["W"]`, profit 0.67 ✓ |

The 6th scenario also catches a secondary profit bug: the OLD `profit += (od ? od - 1 : 0) + (wod && win === WIN && ou !== WIN ? wod - 1 : 0)` line always added the O/U win profit even when `ou === "PUSH"` (because `od` was non-null). The NEW logic only adds O/U profit when `ou === "WIN"`, so the PUSH case correctly contributes 0 from O/U.

## TypeScript / lint baseline

- `bunx tsc --noEmit` on the changed file: 0 errors. (2 pre-existing baseline errors in `src/lib/db.ts:20` and `src/app/api/debug/route.ts:48` — Prisma adapter type friction, documented in `tasks/backlog.md`.)
- `bun run lint`: 2 pre-existing baseline errors (`prediction-card.tsx:117` and `configuration-tab.tsx:836` — both `react-hooks/set-state-in-effect`, documented in Session 7's note as "the codebase's standard fetch-on-mount effect (react-hooks/set-state-in-effect fires on it, as it does 13× repo-wide — pre-existing baseline pattern)"). The fix introduces 0 new lint errors.

## What this fix does NOT cover

1. **Admin `AnalyticsTab` "Success vs Failed" pie chart** uses `successCount = preds.filter(p => p.success).length`, where `p.success` is set to `p.success ?? true` in `prediction-upsert.ts` — i.e. it's a "saved successfully" flag, NOT a betting-outcome flag. The pie chart label is misleading (it shows "saved vs failed to save", not "won vs lost"). This is a separate pre-existing issue, not in scope for this fix.
2. **Admin `OverviewTab` streak calculation** (lines 160-172) iterates `settledBets` in reverse and picks only the LAST outcome in `outcomes` per prediction — so a single match with both markets settled contributes only one outcome to the streak. This is a similar "collapse" pattern but in a different display, and not what the user complained about. Flagging for a future session.
3. **No PUSH support in the compact bar's form dots.** The public `PublicStatsBanner` shows pushes (yellow dots); the admin `OverviewTab` tracks `ouPushes`; the user-facing compact bar does not. Adding P dots here would require a UI change (yellow dot slot) — out of scope for this bug fix.
4. **PAT rotation.** Same standing item as every prior session — the PAT in the user's first chat message should be rotated.

## Files

- `src/components/admin/user-predictions-view.tsx` — fix (commit `a783e15`)
- `/home/z/my-project/scripts/verify-fix.mjs` — verification script (not committed; lives in the sandbox only)
