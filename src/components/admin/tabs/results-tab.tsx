/**
 * ResultsTab — admin/operator form for entering match results.
 *
 * Lists all predictions grouped by result status:
 *   - LIVE NOW (matches in progress)
 *   - AWAITING RESULT (finished — start time + 2h50m < now, no FINAL yet)
 *   - UPCOMING (start time in the future)
 *   - FINAL (already has scores)
 *   - OTHER (POSTPONED / CANCELLED)
 *
 * Each row has inline inputs for home_score + away_score + a status dropdown +
 * a Save button. Save All saves all dirty rows in a batch.
 *
 * Visible to: ADMIN + OPERATOR only.
 */

"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Trophy,
  Save,
  Loader2,
  RefreshCw,
  Check,
  AlertTriangle,
  Calendar,
  Search,
  Filter,
  Radio,
  Clock,
  CheckCircle2,
  XCircle,
  DownloadCloud,
  Play,
  ExternalLink,
  Trash2,
} from "lucide-react";
import type { Prediction, StoredPredictions } from "@/lib/types";
import {
  parseMatchDateTime,
  formatLocalDateTime,
  formatLocalDateLong,
  localDateKey,
  getTimezoneAbbr,
} from "@/lib/timezone";
import { computeOverUnderOutcome, computeWinnerOutcome } from "@/lib/result-utils";

type ResultStatus = "PENDING" | "LIVE" | "FINAL" | "POSTPONED" | "CANCELLED";
type FilterMode = "needs_result" | "awaiting" | "live" | "final" | "all";

const VALID_STATUSES: ResultStatus[] = ["PENDING", "LIVE", "FINAL", "POSTPONED", "CANCELLED"];

// Basketball match duration: ~2h-2h50m. We use 2h50m as the "likely finished" threshold.
// Matches with start_time + this duration < now are flagged as AWAITING RESULT.
const MATCH_DURATION_MS = 2 * 60 * 60 * 1000 + 50 * 60 * 1000; // 2h50m

interface RowState {
  homeInput: string;
  awayInput: string;
  statusInput: ResultStatus;
  savedHome: number | null;
  savedAway: number | null;
  savedStatus: ResultStatus | null;
  dirty: boolean;
  saving: boolean;
  msg: { kind: "ok" | "err"; text: string } | null;
  scrapingSingle: boolean;
  scrapeMsg: { kind: "ok" | "err"; text: string } | null;
}

function getRowState(p: Prediction, prev?: RowState): RowState {
  const savedHome = p.home_score ?? null;
  const savedAway = p.away_score ?? null;
  const savedStatus = (p.result_status as ResultStatus | null) || "PENDING";

  // ── Preserve user's manual edits (dirty rows) ────────────────────────
  // If the user has manually edited a row (dirty=true), DON'T overwrite
  // their inputs with server state. This prevents the auto-refresh from
  // wiping out manual changes before the user clicks Save.
  //
  // For non-dirty rows, sync from server state so scraped results flow
  // through automatically.
  if (prev?.dirty) {
    // User has unsaved manual edits — preserve everything
    return {
      homeInput: prev.homeInput,
      awayInput: prev.awayInput,
      statusInput: prev.statusInput,
      savedHome,  // update saved* from server so isDirty() recomputes correctly
      savedAway,
      savedStatus,
      dirty: true,  // still dirty — user hasn't saved yet
      saving: false,
      msg: prev.msg ?? null,
      scrapingSingle: false,
      scrapeMsg: prev.scrapeMsg ?? null,
    };
  }

  // Non-dirty row — sync inputs from server state
  const homeInput = savedHome !== null ? String(savedHome) : "";
  const awayInput = savedAway !== null ? String(savedAway) : "";
  const statusInput = savedStatus;

  return {
    homeInput,
    awayInput,
    statusInput,
    savedHome,
    savedAway,
    savedStatus,
    dirty: false,
    saving: false,
    msg: prev?.msg ?? null,
    scrapingSingle: false,
    scrapeMsg: prev?.scrapeMsg ?? null,
  };
}

function isDirty(row: RowState): boolean {
  const homeVal = row.homeInput.trim() === "" ? null : parseInt(row.homeInput, 10);
  const awayVal = row.awayInput.trim() === "" ? null : parseInt(row.awayInput, 10);
  return (
    homeVal !== row.savedHome ||
    awayVal !== row.savedAway ||
    row.statusInput !== row.savedStatus
  );
}

/** Format a raw match status string from the scraper for display.
 *  Handles cases like "4TH QUARTER1'" → "4TH QUARTER 1'" (inserts space
 *  between letter→digit boundaries only — e.g. "QUARTER1" → "QUARTER 1").
 *  Does NOT insert space between digit→letter (so "4TH" stays as "4TH").
 */
function formatMatchStatus(raw: string): string {
  if (!raw) return "unknown";
  let s = raw.trim();
  // Insert a space ONLY between a letter and a digit (e.g. "QUARTER1'" → "QUARTER 1'")
  // This fixes Flashscore's concatenated status strings where the quarter name
  // runs directly into the time. We do NOT add space between digit→letter
  // because that would break "4TH" → "4 TH" (wrong).
  s = s.replace(/([A-Za-z])(\d)/g, "$1 $2");
  // Collapse any double spaces we might have introduced
  s = s.replace(/\s+/g, " ").trim();
  return s;
}

/** Render a scrape message with the time portion (e.g. "1'", "12'") highlighted
 *  in red. The apostrophe (') blinks to indicate the match is live.
 *  No space between the digit and the apostrophe — renders as "1'" not "1 '".
 *
 *  Handles multiple scraper output formats:
 *  1. With apostrophe: "4TH QUARTER 1', 64-70" → 1' red+blink
 *  2. Without apostrophe, before comma: "4TH QUARTER 1, 64-70" → 1' red+blink
 *  3. Without apostrophe, at end: "4TH QUARTER 1" → 1' red+blink
 */
function ScrapeMessageText({ text }: { text: string }) {
  // Try to match digits followed by apostrophe: "1'", "12'"
  let timeMatch = text.match(/(\d+)(')/);
  if (!timeMatch || timeMatch.index === undefined) {
    // No apostrophe — try matching digits right before the comma
    // (e.g. "4TH QUARTER 1, 64-70" — the "1" is the live minute)
    timeMatch = text.match(/(\d+)(?=\s*,)/);
  }
  if (!timeMatch || timeMatch.index === undefined) {
    // No comma either — try matching trailing digits at end of string
    // (e.g. "4TH QUARTER 1" with no score)
    timeMatch = text.match(/(\d+)$/);
  }
  if (!timeMatch || timeMatch.index === undefined) {
    // No time pattern — just render as plain text
    return <>{text}</>;
  }
  const before = text.substring(0, timeMatch.index);
  const minutes = timeMatch[1]; // the digits
  const after = text.substring(timeMatch.index + timeMatch[0].length);
  // Always render a blinking apostrophe after the minutes — whether or not the
  // scraper included one. This indicates the match is live.
  // NOTE: spans must be on the same line with no whitespace between them,
  // otherwise React inserts a space → "1 '" instead of "1'".
  return <>{before}<span className="text-neon-red font-bold">{minutes}</span><span className="text-neon-red font-bold animate-hard-blink">'</span>{after}</>;
}

/** Categorize a match into a status bucket for grouping.
 *  Handles missing row state gracefully by falling back to the prediction's
 *  stored result_status. */
function categorizeMatch(p: Prediction, row: RowState | undefined): "live" | "awaiting" | "upcoming" | "final" | "other" {
  // Use row status if available, otherwise fall back to the prediction's stored status
  const status = row?.statusInput || (p.result_status as string | null) || "PENDING";
  if (status === "LIVE") return "live";
  if (status === "FINAL") return "final";
  if (status === "POSTPONED" || status === "CANCELLED") return "other";
  // PENDING — figure out if it's awaiting result or upcoming
  const matchDate = parseMatchDateTime(p.date, p.time);
  if (!matchDate) return "upcoming";
  const likelyFinishedAt = matchDate.getTime() + MATCH_DURATION_MS;
  if (Date.now() > likelyFinishedAt) return "awaiting";
  if (Date.now() > matchDate.getTime()) return "live"; // started but no LIVE status set
  return "upcoming";
}

const CATEGORY_META = {
  live:     { label: "Live Now",          icon: Radio,         color: "text-neon-red" },
  awaiting: { label: "Awaiting Result",   icon: Clock,         color: "text-neon-yellow" },
  upcoming: { label: "Upcoming",          icon: Calendar,      color: "text-neon-cyan" },
  final:    { label: "Final",             icon: CheckCircle2,  color: "text-neon-green" },
  other:    { label: "Postponed / Cancelled", icon: XCircle,    color: "text-muted-foreground" },
} as const;

export function ResultsTab() {
  const [data, setData] = useState<StoredPredictions | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<FilterMode>("needs_result");
  const [search, setSearch] = useState("");
  const [rows, setRows] = useState<Record<string, RowState>>({});
  const [savingAll, setSavingAll] = useState(false);
  const [batchMsg, setBatchMsg] = useState<{ kind: "ok" | "err"; text: string } | null>(null);
  const [scraping, setScraping] = useState(false);
  const [scrapeMsg, setScrapeMsg] = useState<{ kind: "ok" | "err"; text: string } | null>(null);
  const [lastLiveRefresh, setLastLiveRefresh] = useState<Date | null>(null);
  // Delete panel state
  const [showDeletePanel, setShowDeletePanel] = useState(false);
  const [deleteMode, setDeleteMode] = useState<"single" | "range">("single");
  const [deleteFromDate, setDeleteFromDate] = useState("");
  const [deleteToDate, setDeleteToDate] = useState("");
  const [deleting, setDeleting] = useState(false);
  const tzAbbr = getTimezoneAbbr();

  // Ref to hold the latest data so the live auto-refresh effect can read
  // the current LIVE matches without re-subscribing on every data change.
  // Without this, the 30s interval would reset every time fetchPredictions
  // updates `data` (which happens after every scrapeSingle call).
  const dataRef = useRef<StoredPredictions | null>(null);
  useEffect(() => {
    dataRef.current = data;
  }, [data]);

  // Ref to hold the latest rows state so the auto-refresh can check which
  // rows are dirty (user has manual unsaved edits). Dirty rows are SKIPPED
  // during auto-refresh — the user's manual edits take priority until they
  // click Save or Save All.
  const rowsRef = useRef<Record<string, RowState>>({});
  useEffect(() => {
    rowsRef.current = rows;
  }, [rows]);

  const fetchPredictions = useCallback(async (): Promise<StoredPredictions | null> => {
    try {
      setError(null);
      const res = await fetch("/api/admin/engine");
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json: StoredPredictions = await res.json();
      setData(json);
      setRows((prev) => {
        const next: Record<string, RowState> = {};
        for (const p of json.predictions || []) {
          next[p.match_id] = getRowState(p, prev[p.match_id]);
        }
        // Recompute dirty for each row (in case server state changed)
        for (const id of Object.keys(next)) {
          next[id].dirty = isDirty(next[id]);
        }
        return next;
      });
      return json;
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      return null;
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchPredictions();
  }, [fetchPredictions]);

  const updateRow = (matchId: string, partial: Partial<RowState>) => {
    setRows((prev) => {
      const row = prev[matchId];
      if (!row) return prev;
      const next = { ...row, ...partial, msg: null };
      next.dirty = isDirty(next);
      return { ...prev, [matchId]: next };
    });
  };

  const saveOne = async (matchId: string) => {
    const row = rows[matchId];
    if (!row) return;
    setRows((prev) => ({ ...prev, [matchId]: { ...prev[matchId], saving: true, msg: null } }));
    try {
      const homeScore = row.homeInput.trim() === "" ? null : Number(row.homeInput);
      const awayScore = row.awayInput.trim() === "" ? null : Number(row.awayInput);
      const res = await fetch("/api/admin/predictions/result", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          matchId,
          homeScore,
          awayScore,
          resultStatus: row.statusInput,
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || `HTTP ${res.status}`);
      setRows((prev) => ({
        ...prev,
        [matchId]: {
          ...prev[matchId],
          saving: false,
          savedHome: json.homeScore,
          savedAway: json.awayScore,
          savedStatus: json.resultStatus,
          dirty: false,
          msg: { kind: "ok", text: "Saved" },
        },
      }));
      setTimeout(() => {
        setRows((prev) => ({ ...prev, [matchId]: { ...prev[matchId], msg: null } }));
      }, 3000);
    } catch (e) {
      setRows((prev) => ({
        ...prev,
        [matchId]: { ...prev[matchId], saving: false, msg: { kind: "err", text: e instanceof Error ? e.message : String(e) } },
      }));
    }
  };

  const saveAll = async () => {
    // First, sync local row state with server state so we can detect
    // any new scraped results that haven't been reflected in the UI yet.
    // This handles the case where the scraper webhook saved to DB but
    // our local inputs are stale (showing empty while DB has scores).
    await fetchPredictions();

    const dirtyIds = Object.keys(rows).filter((id) => rows[id].dirty);
    if (dirtyIds.length === 0) {
      setBatchMsg({ kind: "ok", text: "Nothing to save — all results are already synced from the scraper." });
      setTimeout(() => setBatchMsg(null), 3000);
      return;
    }
    setSavingAll(true);
    setBatchMsg(null);
    let okCount = 0;
    let errCount = 0;
    for (const id of dirtyIds) {
      // eslint-disable-next-line no-await-in-loop
      try {
        await saveOne(id);
        okCount++;
      } catch {
        errCount++;
      }
    }
    setSavingAll(false);
    if (errCount === 0) {
      setBatchMsg({ kind: "ok", text: `Saved ${okCount} result${okCount !== 1 ? "s" : ""}.` });
    } else {
      setBatchMsg({ kind: "err", text: `Saved ${okCount}, failed ${errCount}. See row messages.` });
    }
    setTimeout(() => setBatchMsg(null), 5000);
  };

  /**
   * Trigger the scraper to fetch final scores for today's matches.
   *
   * Calls POST /api/admin/scraper/results which proxies to the scraper's
   * POST /api/scrape/results endpoint. The scraper:
   *   1. Loads match IDs from matches_{date}.json
   *   2. For each match, navigates to its Flashscore summary page
   *   3. Skips matches that aren't "finished" yet
   *   4. Extracts final scores (home + away)
   *   5. Pushes the results to /api/webhook/result on this website
   *      (HMAC-signed with WEBHOOK_SECRET)
   *
   * The webhook receiver updates the Prediction table with result_status = FINAL,
   * result_source = "scraper". This component auto-refreshes to show the new
   * results within a few seconds.
   *
   * The scrape takes ~30s-2min depending on how many matches are finished.
   * The button shows a spinner during the scrape.
   */
  /**
   * "Scrape Results" button — triggers the scraper's BULK results endpoint
   * which uses a SINGLE browser to process all matches for today's date.
   *
   * This is far more memory-efficient than enqueuing individual single-match
   * scrapes (each of which launches its own Chrome browser = ~300MB each).
   * With 50+ matches, individual scrapes cause OOM kills on Railway's 1GB
   * container. The bulk endpoint uses 1 browser for all matches.
   *
   * The scraper pushes results incrementally to the website via webhook
   * as each match is scraped — users see updates in real-time.
   */
  const triggerResultsScrape = async () => {
    setScraping(true);
    setScrapeMsg(null);

    // ── Kill any active/stuck scraper threads first ────────────────────
    // If there are stuck threads from a previous run (zombie Chrome,
    // hung scrapeSingle, etc.), new scrapes would just pile on top.
    // Kill everything first, then resume the queue, then start fresh.
    setScrapeMsg({ kind: "ok", text: "Killing any active scraper threads..." });
    try {
      await fetch("/api/admin/scraper", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ operation: "kill_all" }),
      });
    } catch {
      // Kill failed — continue anyway (maybe nothing was running)
    }
    // Resume the queue (kill_all pauses it)
    try {
      await fetch("/api/admin/scraper", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ operation: "resume_queue" }),
      });
    } catch {
      // Resume failed — not critical
    }

    // Collect matches that need result updates
    const matchesToScrape: string[] = [];
    if (data?.predictions) {
      for (const p of data.predictions) {
        const rs = p.result_status;
        if (rs === "FINAL" || rs === "POSTPONED" || rs === "CANCELLED") continue;
        const matchDate = parseMatchDateTime(p.date, p.time);
        if (!matchDate) continue;
        const now = Date.now();
        if (now < matchDate.getTime()) continue;
        matchesToScrape.push(p.match_id);
      }
    }

    if (matchesToScrape.length === 0) {
      setScrapeMsg({ kind: "ok", text: "All matches already have results — nothing to scrape." });
      setScraping(false);
      setTimeout(() => setScrapeMsg(null), 5000);
      return;
    }

    setScrapeMsg({
      kind: "ok",
      text: `Scraping ${matchesToScrape.length} matches individually — each will update + save as it completes...`,
    });

    // ── Scrape each match INDIVIDUALLY ─────────────────────────────────
    // Previous approach used the bulk endpoint which relied on the webhook
    // to push results back. If the webhook was broken, nothing showed up.
    //
    // NEW approach: call scrapeSingle() for each match. Each call:
    //   1. Enqueues a job on the scraper's queue (max 3 concurrent browsers)
    //   2. Polls until the job is DONE
    //   3. Fills the local inputs with the scraped scores + status
    //   4. EXPLICITLY saves to DB via /api/admin/predictions/result
    //   5. Shows "Scraped: HALF TIME, 46-56" per-row message
    //
    // This is slightly slower than the bulk endpoint but 100% reliable —
    // each match updates individually with its own status message, and
    // results are saved to DB regardless of webhook state.
    let completed = 0;
    let failed = 0;
    for (const matchId of matchesToScrape) {
      try {
        await scrapeSingle(matchId);
        completed++;
        setScrapeMsg({
          kind: "ok",
          text: `Scraped ${completed}/${matchesToScrape.length} matches${failed > 0 ? ` (${failed} failed)` : ""}...`,
        });
      } catch {
        failed++;
      }
    }

    setScraping(false);
    // Fetch updated data from DB so the UI reflects the freshly scraped results
    await fetchPredictions();
    setScrapeMsg({
      kind: "ok",
      text: `✅ Done — scraped ${completed}/${matchesToScrape.length} matches${failed > 0 ? ` (${failed} failed)` : ""}. All results saved.`,
    });
    setTimeout(() => setScrapeMsg(null), 8000);
  };

  // Group predictions by category (live / awaiting / upcoming / final / other)
  /**
   * Scrape the result for a SINGLE match via the job queue.
   *
   * Flow:
   * 1. POST /api/admin/predictions/scrape-single → enqueues job, returns { job_id, status }
   * 2. Poll GET /api/admin/predictions/scrape-single?job_id=xxx every 2s
   * 3. When status = DONE, extract result + auto-fill inputs + auto-save
   * 4. When status = ERROR, show error message
   *
   * Multiple matches can be scraped simultaneously — the queue handles
   * concurrency limits (max 3 browsers). Excess jobs wait in queue.
   */
  const scrapeSingle = async (matchId: string) => {
    // Mark as scraping
    setRows((prev) => ({
      ...prev,
      [matchId]: { ...prev[matchId], scrapingSingle: true, scrapeMsg: null },
    }));

    try {
      // 1. Enqueue the job
      const enqueueRes = await fetch("/api/admin/predictions/scrape-single", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ matchId }),
      });
      const enqueueData = await enqueueRes.json();
      if (!enqueueRes.ok) {
        throw new Error(enqueueData.error || enqueueData.message || `HTTP ${enqueueRes.status}`);
      }

      const jobId = enqueueData.job_id;
      if (!jobId) {
        throw new Error("No job_id returned from scraper");
      }

      // If the match was already queued/running, show that status
      if (enqueueData.message && enqueueData.message.includes("already")) {
        setRows((prev) => ({
          ...prev,
          [matchId]: {
            ...prev[matchId],
            scrapingSingle: true,
            scrapeMsg: { kind: "ok", text: enqueueData.message },
          },
        }));
      }

      // 2. Poll for completion (max 10 minutes = 120 polls × 5s)
      // When Scrape Results enqueues 30+ matches, each waits in queue.
      // 35 queued ÷ 3 workers × ~10s each = ~120s wait + ~10s scrape = ~130s.
      // 10 min timeout gives plenty of room for large batches.
      let pollCount = 0;
      const maxPolls = 120;
      const poll = async (): Promise<void> => {
        pollCount++;
        if (pollCount > maxPolls) {
          throw new Error("Timed out (10 min) — check queue status on scraper");
        }

        const pollRes = await fetch(`/api/admin/predictions/scrape-single?job_id=${jobId}`);
        const pollData = await pollRes.json();
        if (!pollRes.ok) {
          throw new Error(pollData.error || `Poll failed: HTTP ${pollRes.status}`);
        }

        const jobStatus = pollData.status;
        if (jobStatus === "DONE") {
          // Extract result — the job result is nested:
          // pollData.result = { status: "ok", result: { home_score, away_score, status } }
          // or pollData.result = { status: "error", message: "..." }
          const outerResult = pollData.result || {};
          if (outerResult.status === "error") {
            throw new Error(outerResult.message || "Scrape failed");
          }
          const result = outerResult.result || {};
          const matchStatus = result.status || "unknown";
          const home = result.home_score;
          const away = result.away_score;
          const scoreStr = (home != null && away != null) ? `${home}-${away}` : "no score";

          // Fill local inputs with the scraped scores immediately so the admin
          // sees them — don't rely solely on fetchPredictions() because the
          // webhook might not have processed yet (timing race).
          // Set dirty=false because the scraper's webhook should have saved
          // to the DB already. If the webhook failed, the admin can still
          // manually edit + Save.
          const mappedStatus = (() => {
            const s = matchStatus.toUpperCase();
            if (s === "FINISHED" || s.includes("AFTER") || s === "FT") return "FINAL" as ResultStatus;
            if (s.includes("IN_PROGRESS") || s === "LIVE" ||
                s.includes("Q1") || s.includes("Q2") || s.includes("Q3") || s.includes("Q4") ||
                s.includes("HT") || s.includes("HALF") || s.includes("BREAK") ||
                s.includes("QUARTER") || s.includes("PERIOD") || s.includes("OVERTIME") ||
                s.match(/\d+:\d+/) || s.match(/\d+(ST|ND|RD|TH)\s*(QUARTER|PERIOD|Q)/i)) return "LIVE" as ResultStatus;
            if (s.includes("POSTPONED") || s.includes("DELAYED")) return "POSTPONED" as ResultStatus;
            if (s.includes("CANCEL") || s.includes("ABANDONED")) return "CANCELLED" as ResultStatus;
            if (home != null && away != null) return "LIVE" as ResultStatus;
            return "PENDING" as ResultStatus;
          })();

          setRows((prev) => ({
            ...prev,
            [matchId]: {
              ...prev[matchId],
              scrapingSingle: false,
              homeInput: home != null ? String(home) : prev[matchId].homeInput,
              awayInput: away != null ? String(away) : prev[matchId].awayInput,
              statusInput: mappedStatus,
              savedHome: home,
              savedAway: away,
              savedStatus: mappedStatus,
              dirty: false,
              scrapeMsg: { kind: "ok", text: `Scraped: ${formatMatchStatus(matchStatus)}, ${scoreStr}` },
            },
          }));

          // ── EXPLICITLY SAVE TO DB ──────────────────────────────────────
          // Don't rely on the webhook — it may be misconfigured (secret mismatch).
          // Save the scraped result directly via the admin API. This guarantees
          // the result persists even if the webhook push failed silently.
          if (mappedStatus !== "PENDING" && (home != null || away != null || mappedStatus === "POSTPONED" || mappedStatus === "CANCELLED")) {
            try {
              await fetch("/api/admin/predictions/result", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                  matchId,
                  homeScore: home,
                  awayScore: away,
                  resultStatus: mappedStatus,
                  resultSource: "scraper",
                }),
              });
            } catch {
              // Save failed — the local UI still shows the scraped scores.
              // Admin can manually click Save if needed.
            }
          }

          // Refresh from server to confirm the save.
          setTimeout(() => fetchPredictions(), 1000);
          return;
        }

        if (jobStatus === "ERROR") {
          throw new Error(pollData.error || "Scrape failed");
        }

        // Still QUEUED or RUNNING — update the message and poll again
        const posMsg = jobStatus === "QUEUED" && pollData.position > 0
          ? `Queued #${pollData.position} — est. ${Math.ceil(pollData.position / 3 * 10)}s wait...`
          : jobStatus === "RUNNING"
            ? "Scraping from Flashscore..."
            : "Waiting...";

        setRows((prev) => ({
          ...prev,
          [matchId]: { ...prev[matchId], scrapeMsg: { kind: "ok", text: posMsg } },
        }));

        // Wait 5s then poll again (longer interval for large batches)
        await new Promise(resolve => setTimeout(resolve, 5000));
        return poll();
      };

      await poll();
    } catch (e) {
      setRows((prev) => ({
        ...prev,
        [matchId]: {
          ...prev[matchId],
          scrapingSingle: false,
          scrapeMsg: { kind: "err", text: e instanceof Error ? e.message : String(e) },
        },
      }));
    }
  };

  // ── SMART AUTO-REFRESH (always on, no toggle) ───────────────────────
  // Automatically scrapes matches based on their state:
  //
  //   - LIVE matches: scrape every 30s (real-time livescore updates)
  //   - JUST-STARTED matches (kickoff detected): scrape immediately, then every 30s
  //   - AWAITING RESULT (finished but no score): scrape every 2 min (slower, less urgent)
  //   - FINAL/POSTPONED/CANCELLED: never scrape (done)
  //   - UPCOMING (not started): never scrape (wait for kickoff)
  //
  // This replaces the manual LIVE ON/OFF toggle. Auto-refresh is ALWAYS ON.
  // Users never need to manually click "Scrape Results" — the system
  // detects when matches start and scrapes them automatically.
  //
  // Dirty rows (user manual edits) are ALWAYS skipped — user edits take priority.
  const scrapeSingleRef = useRef(scrapeSingle);
  useEffect(() => {
    scrapeSingleRef.current = scrapeSingle;
  });

  useEffect(() => {
    let cancelled = false;
    let liveIntervalId: ReturnType<typeof setInterval> | null = null;
    let awaitingIntervalId: ReturnType<typeof setInterval> | null = null;
    let liveRunning = false;  // guard against overlapping live runs
    let awaitingRunning = false;  // guard against overlapping awaiting runs

    /** Scrape matches that need real-time updates (LIVE + just-started).
     *  Runs every 30 seconds. Skips if previous run is still in progress. */
    const refreshLiveMatches = async () => {
      if (cancelled || liveRunning) return;
      liveRunning = true;
      const liveMatchIds: string[] = [];
      const currentData = dataRef.current;
      const currentRows = rowsRef.current;
      if (currentData?.predictions) {
        for (const p of currentData.predictions) {
          const rs = p.result_status;
          const isLive = rs === "LIVE";
          // Also include matches that have just started but still show PENDING
          let isJustStarted = false;
          if (rs === "PENDING" || rs === null) {
            const matchDate = parseMatchDateTime(p.date, p.time);
            if (matchDate) {
              const now = Date.now();
              const likelyFinishedAt = matchDate.getTime() + MATCH_DURATION_MS;
              if (now > matchDate.getTime() && now < likelyFinishedAt) {
                isJustStarted = true;
              }
            }
          }
          if (isLive || isJustStarted) {
            const row = currentRows[p.match_id];
            if (row?.dirty) continue;
            liveMatchIds.push(p.match_id);
          }
        }
      }

      if (liveMatchIds.length === 0 || cancelled) {
        liveRunning = false;
        return;
      }

      for (const matchId of liveMatchIds) {
        if (cancelled) break;
        try {
          await scrapeSingleRef.current(matchId);
        } catch {
          // Ignore individual failures — keep going
        }
      }
      setLastLiveRefresh(new Date());
      liveRunning = false;
    };

    /** Scrape matches that are awaiting results (finished but no score).
     *  Runs every 2 minutes. Processes ALL old matches — not just today's.
     *  Skips if previous run is still in progress (prevents queue buildup).
     *  Processes in batches of 5 to avoid overwhelming the scraper. */
    const refreshAwaitingMatches = async () => {
      if (cancelled || awaitingRunning) return;
      awaitingRunning = true;
      const awaitingMatchIds: string[] = [];
      const currentData = dataRef.current;
      const currentRows = rowsRef.current;
      if (currentData?.predictions) {
        for (const p of currentData.predictions) {
          const rs = p.result_status;
          // Only PENDING/null matches that should have finished by now
          // This catches BOTH today's finished matches AND old ones from
          // previous days that were never scraped or had scraping failures
          if (rs === "PENDING" || rs === null) {
            const matchDate = parseMatchDateTime(p.date, p.time);
            if (matchDate) {
              const now = Date.now();
              const likelyFinishedAt = matchDate.getTime() + MATCH_DURATION_MS;
              if (now > likelyFinishedAt) {
                const row = currentRows[p.match_id];
                if (row?.dirty) continue;
                awaitingMatchIds.push(p.match_id);
              }
            }
          }
        }
      }

      if (awaitingMatchIds.length === 0 || cancelled) {
        awaitingRunning = false;
        return;
      }

      // Process in batches of 5 to avoid overwhelming the scraper queue.
      // Each scrapeSingle takes ~10s, so 5 matches = ~50s per batch.
      // With a 2-minute interval, this leaves time for the batch to finish
      // before the next run starts (guarded by awaitingRunning flag).
      const BATCH_SIZE = 5;
      const batch = awaitingMatchIds.slice(0, BATCH_SIZE);

      for (const matchId of batch) {
        if (cancelled) break;
        try {
          await scrapeSingleRef.current(matchId);
        } catch {
          // Ignore individual failures — keep going
        }
      }
      setLastLiveRefresh(new Date());
      awaitingRunning = false;
    };

    // Run immediately on mount, then on intervals
    refreshLiveMatches();
    refreshAwaitingMatches();
    // LIVE matches: every 30s (real-time livescore)
    liveIntervalId = setInterval(refreshLiveMatches, 30_000);
    // AWAITING matches: every 2 min (less urgent, match is over)
    awaitingIntervalId = setInterval(refreshAwaitingMatches, 2 * 60 * 1000);

    return () => {
      cancelled = true;
      if (liveIntervalId) clearInterval(liveIntervalId);
      if (awaitingIntervalId) clearInterval(awaitingIntervalId);
    };
  }, []); // Empty deps — runs once on mount, always on

  const grouped = useMemo(() => {
    if (!data?.predictions) return [];
    const filtered = data.predictions.filter((p) => {
      const row = rows[p.match_id];
      if (!row) return false;
      const category = categorizeMatch(p, row);
      // Apply filter
      if (filter === "needs_result" && category !== "awaiting" && category !== "live") return false;
      if (filter === "awaiting" && category !== "awaiting") return false;
      if (filter === "live" && category !== "live") return false;
      if (filter === "final" && category !== "final") return false;
      // Search
      if (search) {
        const s = search.toLowerCase();
        const haystack = [p.home_team || "", p.away_team || "", p.league || "", p.country || ""].join(" ").toLowerCase();
        if (!haystack.includes(s)) return false;
      }
      return true;
    });
    // Sort: live first, then awaiting (oldest first), then upcoming, then final, then other
    const sorted = [...filtered].sort((a, b) => {
      const ra = rows[a.match_id];
      const rb = rows[b.match_id];
      const ca = categorizeMatch(a, ra);
      const cb = categorizeMatch(b, rb);
      const order: Record<string, number> = { live: 0, awaiting: 1, upcoming: 2, final: 3, other: 4 };
      if (order[ca] !== order[cb]) return order[ca] - order[cb];
      const da = parseMatchDateTime(a.date, a.time)?.getTime() || 0;
      const db = parseMatchDateTime(b.date, b.time)?.getTime() || 0;
      return da - db;
    });
    // Group by category
    const groups: { category: keyof typeof CATEGORY_META; predictions: Prediction[] }[] = [];
    for (const p of sorted) {
      const cat = categorizeMatch(p, rows[p.match_id]);
      const last = groups[groups.length - 1];
      if (last && last.category === cat) last.predictions.push(p);
      else groups.push({ category: cat, predictions: [p] });
    }
    return groups;
  }, [data, rows, filter, search]);

  const stats = useMemo(() => {
    const total = data?.predictions?.length || 0;
    let live = 0, awaiting = 0, final = 0, upcoming = 0, other = 0;
    for (const p of data?.predictions || []) {
      const cat = categorizeMatch(p, rows[p.match_id]);
      if (cat === "live") live++;
      else if (cat === "awaiting") awaiting++;
      else if (cat === "final") final++;
      else if (cat === "upcoming") upcoming++;
      else other++;
    }
    return { total, live, awaiting, final, upcoming, other };
  }, [data, rows]);

  const dirtyCount = Object.values(rows).filter((r) => r.dirty).length;

  // ── Delete handler — converts DD/MM/YYYY to YYYY-MM-DD for the API ──
  const handleDelete = async () => {
    // Convert from DD/MM/YYYY (user-friendly) to YYYY-MM-DD (API format)
    const convertDate = (input: string): string => {
      const trimmed = input.trim();
      // Already YYYY-MM-DD
      if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) return trimmed;
      // DD/MM/YYYY → YYYY-MM-DD
      const m = trimmed.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
      if (m) return `${m[3]}-${m[2].padStart(2, "0")}-${m[1].padStart(2, "0")}`;
      // DD-MM-YYYY → YYYY-MM-DD
      const m2 = trimmed.match(/^(\d{1,2})-(\d{1,2})-(\d{4})$/);
      if (m2) return `${m2[3]}-${m2[2].padStart(2, "0")}-${m2[1].padStart(2, "0")}`;
      return "";
    };

    let payload: Record<string, string> = {};
    let label = "";

    if (deleteMode === "single") {
      const converted = convertDate(deleteFromDate);
      if (!converted) { setScrapeMsg({ kind: "err", text: "Invalid date format. Use DD/MM/YYYY" }); return; }
      payload = { date: converted };
      label = converted;
    } else {
      const from = convertDate(deleteFromDate);
      const to = convertDate(deleteToDate);
      if (!from || !to) { setScrapeMsg({ kind: "err", text: "Invalid date format. Use DD/MM/YYYY" }); return; }
      payload = { fromDate: from, toDate: to };
      label = `${from} to ${to}`;
    }

    if (!confirm(`Delete ALL predictions for ${label}? This cannot be undone.`)) return;
    setDeleting(true);
    try {
      const res = await fetch("/api/admin/predictions/delete-by-date", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
      setScrapeMsg({ kind: "ok", text: `Deleted ${data.deleted} prediction(s) for ${label}` });
      setTimeout(() => setScrapeMsg(null), 5000);
      setShowDeletePanel(false);
      setDeleteFromDate("");
      setDeleteToDate("");
      fetchPredictions();
    } catch (err) {
      setScrapeMsg({ kind: "err", text: err instanceof Error ? err.message : "Delete failed" });
    } finally {
      setDeleting(false);
    }
  };

  return (
    <div className="space-y-4">
      {/* Header + actions */}
      <Card className="bg-card/60 border-border/40">
        <CardContent className="p-4 space-y-3">
          <div className="flex items-start justify-between gap-3 flex-wrap">
            <div className="flex items-center gap-2 min-w-0">
              <Trophy className="w-5 h-5 text-neon-cyan shrink-0" />
              <div className="min-w-0">
                <h2 className="text-sm font-bold">Results</h2>
                <p className="text-[11px] text-muted-foreground">
                  Enter final scores to mark predictions as WIN / LOSS / PUSH. Matches auto-flag as &quot;Awaiting Result&quot; ~2h50m after start time.
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2 shrink-0 flex-wrap">
              {/* Refresh — triggers a scrape of all matches that need results,
                  then fetches the updated data from DB. Use as a manual fallback
                  if auto-refresh missed something or you want to force-update now. */}
              <Button
                variant="outline"
                size="sm"
                onClick={triggerResultsScrape}
                disabled={scraping || loading}
                className="gap-1.5 h-8 border-neon-cyan/30 text-neon-cyan hover:bg-neon-cyan/10"
                title="Scrape all matches that need results + refresh from DB"
              >
                {(scraping || loading) ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />}
                <span className="hidden sm:inline">{scraping ? "Scraping..." : "Refresh"}</span>
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={triggerResultsScrape}
                disabled={scraping}
                className="gap-1.5 h-8 border-neon-cyan/30 text-neon-cyan hover:bg-neon-cyan/10"
                title="Trigger the scraper to fetch final scores from Flashscore for today's matches. Results are pushed back automatically when done."
              >
                {scraping ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <DownloadCloud className="w-3.5 h-3.5" />}
                <span className="hidden sm:inline">{scraping ? "Scraping..." : "Scrape Results"}</span>
              </Button>
              {/* Delete — opens a date picker panel */}
              <Button
                variant="outline"
                size="sm"
                onClick={() => setShowDeletePanel(!showDeletePanel)}
                className="gap-1.5 h-8 border-neon-red/30 text-neon-red hover:bg-neon-red/10"
                title="Delete predictions by date or date range"
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">Delete</span>
              </Button>
              {/* Save All — only visible when there are dirty rows (manual edits) */}
              {dirtyCount > 0 && (
                <Button
                  size="sm"
                  onClick={saveAll}
                  disabled={savingAll}
                  className="gap-1.5 h-8"
                >
                  {savingAll ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
                  Save All ({dirtyCount})
                </Button>
              )}
            </div>
          </div>

          {/* Scrape message */}
          {scrapeMsg && (
            <div className={`text-xs flex items-center gap-1.5 ${scrapeMsg.kind === "ok" ? "text-neon-cyan" : "text-neon-red"}`}>
              {scrapeMsg.kind === "ok" ? <DownloadCloud className="w-3.5 h-3.5" /> : <AlertTriangle className="w-3.5 h-3.5" />}
              {scrapeMsg.text}
            </div>
          )}

          {/* Auto-refresh status indicator — always visible (always on) */}
          <div className="text-xs flex items-center gap-1.5 text-neon-red">
            <Radio className="w-3.5 h-3.5 animate-pulse" />
            <span>Auto-refresh ON — LIVE every 30s · Awaiting every 2 min</span>
            {lastLiveRefresh && (
              <span className="text-muted-foreground/60 ml-2">· last: {lastLiveRefresh.toLocaleTimeString()}</span>
            )}
          </div>

          {/* Delete panel — date picker for single date or range */}
          {showDeletePanel && (
            <Card className="bg-card/60 border-neon-red/30">
              <CardContent className="p-4 space-y-3">
                <div className="flex items-center gap-2">
                  <Trash2 className="w-4 h-4 text-neon-red" />
                  <p className="text-sm font-bold text-neon-red">Delete Predictions</p>
                </div>
                {/* Mode toggle */}
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setDeleteMode("single")}
                    className={`text-xs px-3 py-1.5 rounded-md border transition-colors ${
                      deleteMode === "single"
                        ? "border-neon-red/50 bg-neon-red/10 text-neon-red font-bold"
                        : "border-border/40 text-muted-foreground"
                    }`}
                  >
                    Single Date
                  </button>
                  <button
                    type="button"
                    onClick={() => setDeleteMode("range")}
                    className={`text-xs px-3 py-1.5 rounded-md border transition-colors ${
                      deleteMode === "range"
                        ? "border-neon-red/50 bg-neon-red/10 text-neon-red font-bold"
                        : "border-border/40 text-muted-foreground"
                    }`}
                  >
                    Date Range
                  </button>
                </div>
                {/* Date pickers */}
                <div className="flex items-center gap-2 flex-wrap">
                  {deleteMode === "single" ? (
                    <>
                      <label className="text-xs text-muted-foreground">Date:</label>
                      <input
                        type="date"
                        value={deleteFromDate}
                        onChange={(e) => setDeleteFromDate(e.target.value)}
                        className="bg-background border border-border/50 rounded-md h-9 px-3 text-sm"
                      />
                    </>
                  ) : (
                    <>
                      <label className="text-xs text-muted-foreground">From:</label>
                      <input
                        type="date"
                        value={deleteFromDate}
                        onChange={(e) => setDeleteFromDate(e.target.value)}
                        className="bg-background border border-border/50 rounded-md h-9 px-3 text-sm"
                      />
                      <label className="text-xs text-muted-foreground">To:</label>
                      <input
                        type="date"
                        value={deleteToDate}
                        onChange={(e) => setDeleteToDate(e.target.value)}
                        className="bg-background border border-border/50 rounded-md h-9 px-3 text-sm"
                      />
                    </>
                  )}
                  <Button
                    size="sm"
                    onClick={handleDelete}
                    disabled={deleting || !deleteFromDate || (deleteMode === "range" && !deleteToDate)}
                    className="gap-1.5 bg-neon-red text-background hover:bg-neon-red/85"
                  >
                    {deleting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Trash2 className="w-3.5 h-3.5" />}
                    Delete
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => { setShowDeletePanel(false); setDeleteFromDate(""); setDeleteToDate(""); }}
                    className="text-muted-foreground"
                  >
                    Cancel
                  </Button>
                </div>
                <p className="text-[10px] text-muted-foreground/60">
                  {deleteMode === "single"
                    ? "Deletes all predictions for the selected date. Date is converted automatically — no need to worry about format."
                    : "Deletes all predictions from the start date to the end date (inclusive). Useful for clearing old data."}
                </p>
              </CardContent>
            </Card>
          )}

          {/* Stats badges — all categories shown so math adds up:
              total = live + awaiting + final + upcoming + other */}
          <div className="flex items-center gap-2 flex-wrap text-[10px]">
            <Badge variant="outline" className="text-[10px] border-border/40 bg-background/30">{stats.total} total</Badge>
            {stats.live > 0 && (
              <Badge
                variant="outline"
                className={`text-[10px] gap-1 cursor-pointer transition-colors ${
                  filter === "live"
                    ? "border-neon-red/60 text-neon-red bg-neon-red/15"
                    : "border-neon-red/30 text-neon-red bg-neon-red/5 hover:bg-neon-red/10"
                }`}
                onClick={() => setFilter("live")}
                title="Click to filter: Live now only"
              >
                <Radio className="w-2.5 h-2.5 animate-pulse" /> {stats.live} live
              </Badge>
            )}
            {stats.awaiting > 0 && (
              <Badge
                variant="outline"
                className={`text-[10px] gap-1 cursor-pointer transition-colors ${
                  filter === "awaiting"
                    ? "border-neon-yellow/60 text-neon-yellow bg-neon-yellow/15"
                    : "border-neon-yellow/30 text-neon-yellow bg-neon-yellow/5 hover:bg-neon-yellow/10"
                }`}
                onClick={() => setFilter("awaiting")}
                title="Click to filter: Awaiting result only (unresolved matches)"
              >
                <Clock className="w-2.5 h-2.5" /> {stats.awaiting} awaiting
              </Badge>
            )}
            <Badge
              variant="outline"
              className={`text-[10px] gap-1 cursor-pointer transition-colors ${
                filter === "final"
                  ? "border-neon-green/60 text-neon-green bg-neon-green/15"
                  : "border-neon-green/30 text-neon-green bg-neon-green/5 hover:bg-neon-green/10"
              }`}
              onClick={() => setFilter("final")}
              title="Click to filter: Final results only"
            >
              <CheckCircle2 className="w-2.5 h-2.5" /> {stats.final} final
            </Badge>
            {stats.upcoming > 0 && (
              <Badge variant="outline" className="text-[10px] gap-1 border-neon-cyan/30 text-neon-cyan bg-neon-cyan/5">
                <Calendar className="w-2.5 h-2.5" /> {stats.upcoming} upcoming
              </Badge>
            )}
            {stats.other > 0 && (
              <Badge variant="outline" className="text-[10px] gap-1 border-muted-foreground/30 text-muted-foreground bg-muted/5">
                {stats.other} other
              </Badge>
            )}
            {dirtyCount > 0 && (
              <Badge variant="outline" className="text-[10px] border-neon-cyan/30 text-neon-cyan bg-neon-cyan/5">
                {dirtyCount} unsaved
              </Badge>
            )}
          </div>

          {/* Batch message */}
          {batchMsg && (
            <div className={`text-xs flex items-center gap-1.5 ${batchMsg.kind === "ok" ? "text-neon-green" : "text-neon-red"}`}>
              {batchMsg.kind === "ok" ? <Check className="w-3.5 h-3.5" /> : <AlertTriangle className="w-3.5 h-3.5" />}
              {batchMsg.text}
            </div>
          )}

          {/* Filters */}
          <div className="flex items-center gap-2 flex-wrap">
            <div className="relative flex-1 min-w-[200px]">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
              <Input
                placeholder="Search team, league, country..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-9 bg-card border-border/50 h-8 text-xs"
              />
            </div>
            <div className="flex items-center gap-1 text-[10px] text-muted-foreground">
              <Filter className="w-3 h-3" />
              <select
                value={filter}
                onChange={(e) => setFilter(e.target.value as FilterMode)}
                className="bg-card border border-border/50 rounded h-8 px-2 text-xs"
              >
                <option value="needs_result">Needs result (live + awaiting)</option>
                <option value="awaiting">Awaiting only (unresolved)</option>
                <option value="live">Live now</option>
                <option value="final">Final results</option>
                <option value="all">All matches</option>
              </select>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Loading / error / empty states */}
      {loading ? (
        <Card className="bg-card/60 border-border/40">
          <CardContent className="p-8 flex items-center justify-center gap-2 text-muted-foreground">
            <Loader2 className="w-4 h-4 animate-spin" /> Loading predictions...
          </CardContent>
        </Card>
      ) : error ? (
        <Card className="bg-card/60 border-neon-red/30">
          <CardContent className="p-6 text-center text-neon-red text-sm flex items-center justify-center gap-2">
            <AlertTriangle className="w-4 h-4" /> Failed to load: {error}
          </CardContent>
        </Card>
      ) : grouped.length === 0 ? (
        <Card className="bg-card/60 border-border/40">
          <CardContent className="p-8 text-center text-muted-foreground text-sm">
            {filter === "needs_result" && "🎉 No matches need results right now."}
            {filter === "awaiting" && "🎉 No unresolved matches — all finished games have results."}
            {filter === "live" && "No live matches right now."}
            {filter === "final" && "No final results yet."}
            {filter === "all" && "No matches found."}
          </CardContent>
        </Card>
      ) : (
        /* Form: grouped list of matches with inline score inputs */
        <div className="space-y-4">
          {grouped.map((group) => {
            const meta = CATEGORY_META[group.category];
            const Icon = meta.icon;
            return (
              <div key={group.category} className="space-y-2">
                {/* Category header */}
                <div className="flex items-center gap-2 px-1 pt-2">
                  <Icon className={`w-3.5 h-3.5 ${meta.color} shrink-0 ${group.category === "live" ? "animate-pulse" : ""}`} />
                  <span className={`text-xs font-bold uppercase tracking-wide ${meta.color}`}>{meta.label}</span>
                  <div className="flex-1 h-px bg-border/30" />
                  <span className="text-[10px] text-muted-foreground/50">{group.predictions.length} match{group.predictions.length !== 1 ? "es" : ""}</span>
                </div>

                {/* Match rows */}
                <div className="space-y-2">
                  {group.predictions.map((p) => {
                    const row = rows[p.match_id];
                    if (!row) return null;
                    const matchDate = parseMatchDateTime(p.date, p.time);
                    const ouOutcome = computeOverUnderOutcome(p);
                    const winOutcome = computeWinnerOutcome(p);
                    return (
                      <Card
                        key={p.match_id}
                        className={`bg-card/60 border-border/40 overflow-hidden transition-colors ${row.dirty ? "ring-1 ring-neon-cyan/30" : ""}`}
                      >
                        <CardContent className="p-4 space-y-3">
                          {/* Row 1: match info + outcome badges */}
                          <div className="flex items-start justify-between gap-3 flex-wrap">
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-1.5">
                                <p className="text-sm font-bold leading-tight break-words">
                                  {p.home_team || "Home"}{" "}
                                  <span className="text-muted-foreground/50 mx-0.5">vs</span>{" "}
                                  {p.away_team || "Away"}
                                </p>
                                <a
                                  href={`https://www.flashscore.co.ke/match/${p.match_id}/`}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="text-muted-foreground/40 hover:text-neon-cyan transition-colors shrink-0"
                                  title="Open match on Flashscore"
                                  onClick={(e) => e.stopPropagation()}
                                >
                                  <ExternalLink className="w-3.5 h-3.5" />
                                </a>
                              </div>
                              <p className="text-[11px] text-muted-foreground mt-1 truncate">
                                {[p.league, p.country].filter(Boolean).join(" · ")}
                                {matchDate && (
                                  <>
                                    <span className="mx-1.5 text-muted-foreground/30">•</span>
                                    {formatLocalDateTime(matchDate)} <span className="text-muted-foreground/50">{tzAbbr}</span>
                                  </>
                                )}
                                {p.recommendation && (
                                  <>
                                    <span className="mx-1.5 text-muted-foreground/30">•</span>
                                    <span className={`font-bold ${p.recommendation === "OVER" ? "text-neon-green" : p.recommendation === "UNDER" ? "text-neon-red" : "text-muted-foreground"}`}>
                                      {p.recommendation} {p.bookmaker_line != null && `@${p.bookmaker_line}`}
                                    </span>
                                  </>
                                )}
                              </p>
                            </div>
                            {/* Outcome badge (only if FINAL) */}
                            {row.statusInput === "FINAL" && (
                              <div className="flex items-center gap-1 shrink-0">
                                {ouOutcome !== "MISSING" && (
                                  <Badge variant="outline" className={`text-[10px] ${ouOutcome === "WIN" ? "border-neon-green/30 text-neon-green" : ouOutcome === "LOSS" ? "border-neon-red/30 text-neon-red" : "border-neon-yellow/30 text-neon-yellow"}`}>
                                    {p.recommendation} {ouOutcome}
                                  </Badge>
                                )}
                                {winOutcome !== "MISSING" && (
                                  <Badge variant="outline" className={`text-[10px] ${winOutcome === "WIN" ? "border-neon-green/30 text-neon-green" : "border-neon-red/30 text-neon-red"}`}>
                                    Winner {winOutcome}
                                  </Badge>
                                )}
                              </div>
                            )}
                          </div>

                          {/* Row 2: score inputs + status + actions — BIGGER + BETTER */}
                          <div className="flex items-center gap-3 flex-wrap">
                            {/* Score inputs — wider + taller for easy entry */}
                            <div className="flex items-center gap-2">
                              <div className="flex flex-col items-center gap-0.5">
                                <span className="text-[9px] text-muted-foreground/60 font-bold uppercase truncate max-w-[60px]">{p.home_team?.split(" ").slice(-2).join(" ") || "Home"}</span>
                                <Input
                                  type="number"
                                  inputMode="numeric"
                                  min="0"
                                  max="999"
                                  value={row.homeInput}
                                  onChange={(e) => updateRow(p.match_id, { homeInput: e.target.value })}
                                  placeholder="0"
                                  className="bg-background font-mono text-lg font-bold h-12 w-20 text-center"
                                  disabled={row.saving || row.scrapingSingle}
                                  aria-label={`${p.home_team} score`}
                                />
                              </div>
                              <span className="text-sm text-muted-foreground/40 font-bold pt-5">-</span>
                              <div className="flex flex-col items-center gap-0.5">
                                <span className="text-[9px] text-muted-foreground/60 font-bold uppercase truncate max-w-[60px]">{p.away_team?.split(" ").slice(-2).join(" ") || "Away"}</span>
                                <Input
                                  type="number"
                                  inputMode="numeric"
                                  min="0"
                                  max="999"
                                  value={row.awayInput}
                                  onChange={(e) => updateRow(p.match_id, { awayInput: e.target.value })}
                                  placeholder="0"
                                  className="bg-background font-mono text-lg font-bold h-12 w-20 text-center"
                                  disabled={row.saving || row.scrapingSingle}
                                  aria-label={`${p.away_team} score`}
                                />
                              </div>
                            </div>

                            {/* Status dropdown — bigger, color-coded for LIVE/FINAL */}
                            <select
                              value={row.statusInput}
                              onChange={(e) => updateRow(p.match_id, { statusInput: e.target.value as ResultStatus })}
                              className={`bg-background border rounded-md h-10 px-3 text-sm font-bold ${
                                row.statusInput === "LIVE"
                                  ? "border-neon-red/50 text-neon-red bg-neon-red/5"
                                  : row.statusInput === "FINAL"
                                    ? "border-neon-green/50 text-neon-green bg-neon-green/5"
                                    : row.statusInput === "POSTPONED" || row.statusInput === "CANCELLED"
                                      ? "border-muted-foreground/40 text-muted-foreground"
                                      : "border-border/50 text-foreground"
                              }`}
                              disabled={row.saving || row.scrapingSingle}
                            >
                              {VALID_STATUSES.map((s) => (
                                <option key={s} value={s}>{s}</option>
                              ))}
                            </select>

                            {/* Action buttons — right aligned */}
                            <div className="flex items-center gap-2 ml-auto">
                              {/* Per-match scrape button */}
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => scrapeSingle(p.match_id)}
                                disabled={row.scrapingSingle || row.saving}
                                className="gap-1.5 h-10 border-neon-cyan/30 text-neon-cyan hover:bg-neon-cyan/10"
                                title="Scrape this match's result from Flashscore now"
                              >
                                {row.scrapingSingle ? <Loader2 className="w-4 h-4 animate-spin" /> : <Play className="w-4 h-4" />}
                                <span className="hidden sm:inline">{row.scrapingSingle ? "Scraping..." : "Scrape"}</span>
                              </Button>

                              {/* Save button — only visible when row is dirty (manual edit) */}
                              {row.dirty ? (
                                <Button
                                  size="sm"
                                  variant="default"
                                  onClick={() => saveOne(p.match_id)}
                                  disabled={row.saving || row.scrapingSingle}
                                  className="h-10 gap-1.5 px-4"
                                >
                                  {row.saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                                  <span>{row.saving ? "Saving" : "Save"}</span>
                                </Button>
                              ) : (
                                /* Subtle "Saved" indicator — only for rows that have actual data
                                   (scores or non-PENDING status). PENDING + no scores = nothing saved. */
                                (row.savedHome !== null || row.savedAway !== null || row.savedStatus !== "PENDING") && (
                                  <span className="flex items-center gap-1 text-[10px] text-neon-green/60 font-medium px-2 h-10">
                                    <Check className="w-3 h-3" />
                                    Saved
                                  </span>
                                )
                              )}
                            </div>
                          </div>

                          {/* Per-row messages */}
                          {(row.msg || row.scrapeMsg) && (
                            <div className="flex flex-col gap-1">
                              {row.scrapeMsg && (
                                <p className={`text-[11px] flex items-center gap-1.5 ${row.scrapeMsg.kind === "ok" ? "text-neon-cyan" : "text-neon-red"}`}>
                                  {row.scrapeMsg.kind === "ok" ? <Play className="w-3 h-3" /> : <AlertTriangle className="w-3 h-3" />}
                                  <ScrapeMessageText text={row.scrapeMsg.text} />
                                </p>
                              )}
                              {row.msg && (
                                <p className={`text-[11px] flex items-center gap-1.5 ${row.msg.kind === "ok" ? "text-neon-green" : "text-neon-red"}`}>
                                  {row.msg.kind === "ok" ? <Check className="w-3 h-3" /> : <AlertTriangle className="w-3 h-3" />}
                                  {row.msg.text}
                                </p>
                              )}
                            </div>
                          )}
                        </CardContent>
                      </Card>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
