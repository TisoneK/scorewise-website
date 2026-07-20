# Linebet UX Borrow Exploration — 2026-07-20

Design exploration (NOT implemented): reviewed 11 Linebet mobile screenshots
to decide which UX patterns ScoreWise should borrow. Visual "borrow board"
artifact delivered to the user.

**Framing:** Linebet is a sportsbook; ScoreWise is a tipster (predicts + hands
a bet code to copy elsewhere). Borrow the app SHELL + information design, NOT
the wagering machinery. Every recommended borrow reuses data ScoreWise already
computes (results, hit rate, ROI, h2h_totals, winning_streak_data, reduced
lines, Top/Value Picks) — presentation upgrade, not a data project.

## Ranked borrows
TIER 1 (now): (1) Results History page — status-dot cards + "stats for the
period" (hit rate/ROI), from Bet history; (2) Bottom tab nav — Predictions/Top
Picks/History/Stats/Menu; (3) "Starting soon" time-window filter chips;
(4) Kickoff countdown "starts in HH:MM:SS".
TIER 2 (next): (5) user Match detail page (reuse admin drawer data);
(6) per-match Statistics/H2H surfaced to users; (7) "Pick of the Day" hero
(reuse Top/Value Picks); (8) Favorites + alerts (needs favorites store + push).
TIER 3 (later): (9) grouped settings w/ icon rows; (10) odds display toggle
(Decimal/Fractional/American); (11) line/odds movement sparkline (needs
historical line snapshots — not retained yet).

## Leave behind (off-brand for a tipster)
bet slip / accumulator builder, deposits & withdrawals, wallet/balance,
one-click bet, live in-play odds ladders, mirrors & proxies.

## Design language (already ~80% aligned — both neon-green on near-black)
left status dots, count badges, pin/collapse chevrons, segmented toggles,
icon-circle rows, helpful empty states.

**Status:** exploration only. Await user's pick of which to build first.
Screenshots in session scratchpad (not committed).
