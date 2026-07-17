# Reduced-Risk Wiring Verification — Phase-One Exit Report

**Date:** 2026-07-16 · **Agent:** Claude Code / claude-fable-5 · **Method:** static code verification across all three repos — **no scrapes triggered** (phase-two data collection is the user's job).

**Goal:** phase one ends when the reduced-risk pipeline is wired correctly end-to-end: scraper → engine → website webhook → DB → API → UI → analytics.

## Verified-correct links (as of the commits below)

1. **Scraper extracts reduced lines** (`flashscore-scraper`, since `093981d` 2026-06-24): `odds_data_extractor.get_lowest_alternative()` (reduced OVER) / `get_highest_alternative()` (reduced UNDER) → `scraper.py` maps to `reduced_over_total/odds`, `reduced_under_total/odds` on the odds model.
2. **Scraper → engine:** `webhook_utils.transform_payload` passes every odds key through to the engine's `/api/ingest`; the engine's request schema (`api/schemas/request.py:36-39,94-97`) validates (`gt=0`) and maps them to the input model.
3. **Engine passthrough:** reduced lines are scraped, not computed (s11 was reverted to passthrough, `c7ec083`); `PredictionOutput.from_context` copies them from input and `to_dict()` serializes all four (`engine/result/output.py:105-108,209-212`).
4. **Engine → website:** `notify_predictions_updated(..., predictions=new_results)` sends the ingested batch (both ingest paths) — **fixed this session, see gap A**.
5. **Website webhook receiver** (`/api/webhook/predictions`): HMAC-verified; upserts reduced fields **only when no manual override exists** (`reducedRiskSource === "manual"` is never clobbered by the scraper); stamps `scraper` source only when values are actually present.
6. **Manual override path:** `POST /api/admin/predictions/reduced-risk` (admin/operator, validated, audited, `clear` support) + drawer editor UI.
7. **API exposure (design updated 2026-07-16, session 6):** for regular users `/api/predictions` COLLAPSES the line hierarchy server-side — `bookmaker_line`/odds are overwritten with the reduced values when present, and the `reduced_*` keys are stripped entirely. Users see exactly one line and cannot tell multiple line types exist (no field names, no labels). `?all=true` is enforced server-side to ADMIN/OPERATOR only. Admins see both lines uncollapsed.
8. **UI:** the user card (`prediction-card.tsx`) shows the single collapsed line; strikethrough/dual-line displays exist only in the admin dashboard components, which are never rendered for USER role.
9. **Analytics grading:** win profit uses `reduced_*_odds ?? *_odds` (`src/lib/analytics.ts:35`) — phase-two ROI will automatically be computed on the reduced lines where present.

## Gaps found and fixed this session

- **A (CRITICAL) — engine repo ≠ production:** the website's Turso architecture (website `9de8946`, 2026-06-19) requires the engine to send full prediction payloads in the `predictions_updated` webhook. That engine-side change was deployed but **never committed** — the repo's sender was counts-only. Any engine redeploy from the repo would have silently stopped ALL prediction delivery. Fixed: engine `34103d7`.
  - **Likely also explains phase one's 0/101 reduced lines:** if the deployed engine predates the scraper's 06-24 reduced extraction or the 07-02 passthrough, the deployed (uncommitted) webhook code wouldn't include reduced fields in its payload.
  - **⚠️ Residual risk:** the deployed Railway engine may contain other uncommitted changes; the repo↔production diff is unknowable from source. First phase-two scrape must confirm reduced fields land in the website DB. If Railway does not auto-deploy from this repo, redeploy the engine before phase two.
- **B — users couldn't see reduced lines:** `USER_FIELDS` in `/api/predictions` stripped all four `reduced_*` fields, so regular users always fell back to the primary line. Fixed: website `c357c1c`.

## Phase-two first-scrape checklist (user runs the scrape)

1. After the first ingest, check a prediction in the DB/admin drawer: `reduced_*` populated, `reducedRiskSource = "scraper"`.
2. Set a manual override on one match, re-scrape it, confirm the override survives.
3. Log in as a regular USER: the card should show the reduced line + odds presented as THE line — with no hint (label, second line, strikethrough, or API field) that any other line type exists. Also verify `/api/predictions?all=true` as a USER returns the stripped, collapsed payload.
4. Confirm results arrive (the `needingResults` cron crash was fixed this session, website `51a21d5`) — phase one lost 24/101 results to it.
