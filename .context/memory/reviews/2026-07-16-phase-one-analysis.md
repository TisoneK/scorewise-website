# Phase One Performance Analysis — Baseline Before Reduced-Risk Reset

**Date:** 2026-07-16 · **Agent:** Claude Code / claude-fable-5 · **Data source:** live site (`scorewise-ke.vercel.app`) via authenticated browser session (USER role — public analytics shape + full predictions payload)

**Purpose:** Baseline record of phase-one algorithm performance, captured immediately before deleting all phase-one predictions and restarting data collection with the reduced-risk algorithm (phase two). After the wipe, these numbers are the only record.

## Dataset

- 101 totals predictions / 104 winner predictions, dates **19.06.2026 – 05.07.2026** (16 distinct days, stored as `DD.MM.YYYY`)
- Results: 76 FINAL, 1 POSTPONED, **24 never resolved** (`result_status` null — matches long finished; see caveats)
- **0 predictions have reduced-risk lines** — phase one ran entirely on primary bookmaker lines (reduced-risk feature shipped 2026-07-14, after most of this window)
- `recommendation_confidence` was null on every row — confidence calibration impossible for phase one

## Headline results

| Algorithm | Resolved | Record | Hit rate | ROI |
|---|---|---|---|---|
| **1X2 (WINNER)** | 81 | 56W–25L | **69.1%** | **+7.2%** |
| **Totals (O/U)** | 76 | 34W–42L | **44.7%** | **−21.8%** |

Totals split by direction: **UNDER 30W–40L (43%)** across 70 picks; OVER 4W–2L (67%) across 6. The totals problem is almost entirely an UNDER problem — the algorithm picked UNDER 92% of the time and those lines were too tight.

- Avg bookmaker line: 175.9 · avg UNDER odds: 1.74 (break-even needs 57.5% hits; actual 43%)

## Loss-margin distribution (totals, 76 graded)

| Outcome margin | Count |
|---|---|
| Won by 20+ | 9 |
| Won by 10–19 | 12 |
| Won by 0–9 | 13 |
| **Lost by 1–10** | **17** |
| Lost by 11–20 | 19 |
| Lost by 20+ | 6 |

17 of 42 losses (40%) missed by ≤10 points — exactly the band a reduced-risk (safer) line converts to wins.

## Reduced-risk simulation (re-grading phase one with the line shifted safer by N points)

| Shift | Record | Hit rate | Profitable if odds above |
|---|---|---|---|
| +0 | 34W–42L | 45% | 2.24 |
| +4 | 44W–32L | 58% | 1.73 |
| +6 | 47W–29L | 62% | 1.62 |
| +8 | 49W–27L | 64% | 1.55 |
| +10 | 51W–25L | 67% | 1.49 |
| +12 | 53W–23L | 70% | 1.43 |
| +15 | 58W–18L | 76% | 1.31 |

**Reading:** hit rate responds strongly to safer lines, but profitability depends entirely on the odds the bookmaker actually offers at the alternative line. E.g. +15 pts reaches 76% but is only break-even if the reduced odds average 1.31. Phase two's job is to measure real reduced-line odds vs this curve.

## Caveats on phase-one numbers

1. **24 of 101 predictions never got results** — excluded from every rate above. If the misses aren't random, true hit rates differ. Likely cause: the results-scraping cron bug (`needingResults` undefined, `src/app/api/cron/scrape-results/route.ts:181`, backlogged 2026-07-14).
2. Confidence tiers were never populated, so no calibration view exists for phase one.
3. ROI assumes flat 1-unit stakes at recorded odds.

## Why "delete all games" failed for the user (diagnosed, not yet fixed)

- Stored dates are consistently `DD.MM.YYYY`; `POST /api/admin/predictions/delete-by-date` handles that format correctly — format is NOT the problem.
- The endpoint (and the middleware for `/api/admin/predictions`) requires **ADMIN or OPERATOR**; the browser session used for this analysis is role **USER**. A user-role session gets 401/403 — shown in the UI as a small error toast. Deletion requires an admin/operator login.
- There is **no delete-all endpoint**; nearest is date-range mode (`fromDate: 2026-06-19, toDate: 2026-07-05` covers everything currently in the DB).
- There is **no endpoint that clears ActivityLog** (`DELETE /api/admin/logs/stream` clears upstream service buffers, not the DB table). The user wants activity logs wiped for phase two → needs a small new admin endpoint or direct DB access.

## Phase-two reset plan (user-approved scope)

Delete **predictions + activity logs**, keep **user accounts**. Steps: admin login → capture done (this file) → delete predictions via date-range → clear ActivityLog (endpoint to be added) → verify zero rows → phase two begins with reduced-risk lines populated by scraper/manual override.
