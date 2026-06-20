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

import { useCallback, useEffect, useMemo, useState } from "react";
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
type FilterMode = "needs_result" | "live" | "final" | "all";

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
  // If user has in-flight input, preserve it. Otherwise initialize from server state.
  const homeInput = prev?.homeInput ?? (savedHome !== null ? String(savedHome) : "");
  const awayInput = prev?.awayInput ?? (savedAway !== null ? String(savedAway) : "");
  const statusInput = prev?.statusInput ?? savedStatus;
  return {
    homeInput,
    awayInput,
    statusInput,
    savedHome,
    savedAway,
    savedStatus,
    dirty: prev?.dirty ?? false,
    saving: false,
    msg: prev?.msg ?? null,
    scrapingSingle: prev?.scrapingSingle ?? false,
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

/** Categorize a match into a status bucket for grouping. */
function categorizeMatch(p: Prediction, row: RowState): "live" | "awaiting" | "upcoming" | "final" | "other" {
  const status = row.statusInput || "PENDING";
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
  const tzAbbr = getTimezoneAbbr();

  const fetchPredictions = useCallback(async () => {
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
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
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
    const dirtyIds = Object.keys(rows).filter((id) => rows[id].dirty);
    if (dirtyIds.length === 0) {
      setBatchMsg({ kind: "ok", text: "Nothing to save — no unsaved changes." });
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
  const triggerResultsScrape = async () => {
    setScraping(true);
    setScrapeMsg(null);
    try {
      // Use today's date in DD.MM.YYYY format (matches the scraper's file naming)
      const today = new Date();
      const dateStr = `${String(today.getDate()).padStart(2, "0")}.${String(today.getMonth() + 1).padStart(2, "0")}.${today.getFullYear()}`;
      setScrapeMsg({ kind: "ok", text: `Triggering scraper for ${dateStr}... this takes 30s-2min.` });

      const res = await fetch("/api/admin/scraper", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          operation: "scrape_results",
          date: dateStr,
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || json.message || `HTTP ${res.status}`);

      setScrapeMsg({
        kind: "ok",
        text: `Scraper triggered. It'll push final scores here automatically when done — refresh in ~1 min.`,
      });
      // Auto-refresh predictions after a delay to pick up scraper-pushed results
      setTimeout(() => {
        fetchPredictions();
      }, 60000);
    } catch (e) {
      setScrapeMsg({ kind: "err", text: e instanceof Error ? e.message : String(e) });
    } finally {
      setScraping(false);
      setTimeout(() => setScrapeMsg(null), 8000);
    }
  };

  // Group predictions by category (live / awaiting / upcoming / final / other)
  /**
   * Scrape the result for a SINGLE match — opens one Flashscore page, extracts
   * the score + status, and pushes it to the website. Takes ~5-10 seconds.
   */
  const scrapeSingle = async (matchId: string) => {
    setRows((prev) => ({
      ...prev,
      [matchId]: { ...prev[matchId], scrapingSingle: true, scrapeMsg: null },
    }));
    try {
      const res = await fetch("/api/admin/predictions/scrape-single", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ matchId }),
      });
      const json = await res.json();
      if (!res.ok || json.status === "error") {
        throw new Error(json.message || json.error || `HTTP ${res.status}`);
      }
      const result = json.result || {};
      const status = result.status || "unknown";
      const home = result.home_score;
      const away = result.away_score;
      const scoreStr = (home != null && away != null) ? `${home}-${away}` : "no score";

      // Update the row inputs with the scraped values
      setRows((prev) => ({
        ...prev,
        [matchId]: {
          ...prev[matchId],
          scrapingSingle: false,
          homeInput: home != null ? String(home) : prev[matchId].homeInput,
          awayInput: away != null ? String(away) : prev[matchId].awayInput,
          // Map Flashscore status to our status — same logic as the webhook receiver
          statusInput: (() => {
            const s = status.toUpperCase();
            if (s === "FINISHED" || s.includes("AFTER") || s === "FT") return "FINAL" as ResultStatus;
            if (s.includes("IN_PROGRESS") || s === "LIVE" ||
                s.includes("Q1") || s.includes("Q2") || s.includes("Q3") || s.includes("Q4") ||
                s.includes("HT") || s.includes("HALF") || s.includes("BREAK") ||
                s.includes("QUARTER") || s.includes("PERIOD") ||
                s.match(/\d+:\d+/) || s.match(/\d+(ST|ND|RD|TH)\s*(QUARTER|PERIOD|Q)/i)) return "LIVE" as ResultStatus;
            if (s.includes("POSTPONED")) return "POSTPONED" as ResultStatus;
            if (s.includes("CANCEL") || s.includes("ABANDONED")) return "CANCELLED" as ResultStatus;
            // Unknown status + scores present → LIVE (match must be in progress)
            if (home != null && away != null) return "LIVE" as ResultStatus;
            // No scores + unknown → keep current status
            return prev[matchId].statusInput;
          })(),
          dirty: true,
          scrapeMsg: { kind: "ok", text: `Scraped: ${status}, ${scoreStr}` },
        },
      }));

      // Auto-save the scraped result
      setTimeout(() => saveOne(matchId), 500);

      // Also refresh from server to pick up the webhook-pushed result
      setTimeout(() => fetchPredictions(), 3000);
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

  const grouped = useMemo(() => {
    if (!data?.predictions) return [];
    const filtered = data.predictions.filter((p) => {
      const row = rows[p.match_id];
      if (!row) return false;
      const category = categorizeMatch(p, row);
      // Apply filter
      if (filter === "needs_result" && category !== "awaiting" && category !== "live") return false;
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
    let live = 0, awaiting = 0, final = 0, pending = 0;
    for (const p of data?.predictions || []) {
      const cat = categorizeMatch(p, rows[p.match_id]);
      if (cat === "live") live++;
      else if (cat === "awaiting") awaiting++;
      else if (cat === "final") final++;
      else pending++;
    }
    return { total, live, awaiting, final, pending };
  }, [data, rows]);

  const dirtyCount = Object.values(rows).filter((r) => r.dirty).length;

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
            <div className="flex items-center gap-2 shrink-0">
              <Button variant="outline" size="sm" onClick={fetchPredictions} disabled={loading} className="gap-1.5 h-8">
                <RefreshCw className={`w-3.5 h-3.5 ${loading ? "animate-spin" : ""}`} />
                <span className="hidden sm:inline">Refresh</span>
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
              <Button
                size="sm"
                onClick={saveAll}
                disabled={savingAll || dirtyCount === 0}
                className="gap-1.5 h-8"
              >
                {savingAll ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
                Save All{dirtyCount > 0 ? ` (${dirtyCount})` : ""}
              </Button>
            </div>
          </div>

          {/* Scrape message */}
          {scrapeMsg && (
            <div className={`text-xs flex items-center gap-1.5 ${scrapeMsg.kind === "ok" ? "text-neon-cyan" : "text-neon-red"}`}>
              {scrapeMsg.kind === "ok" ? <DownloadCloud className="w-3.5 h-3.5" /> : <AlertTriangle className="w-3.5 h-3.5" />}
              {scrapeMsg.text}
            </div>
          )}

          {/* Stats badges */}
          <div className="flex items-center gap-2 flex-wrap text-[10px]">
            <Badge variant="outline" className="text-[10px] border-border/40 bg-background/30">{stats.total} total</Badge>
            {stats.live > 0 && (
              <Badge variant="outline" className="text-[10px] border-neon-red/30 text-neon-red bg-neon-red/5 gap-1">
                <Radio className="w-2.5 h-2.5 animate-pulse" /> {stats.live} live
              </Badge>
            )}
            {stats.awaiting > 0 && (
              <Badge variant="outline" className="text-[10px] border-neon-yellow/30 text-neon-yellow bg-neon-yellow/5">
                {stats.awaiting} awaiting
              </Badge>
            )}
            <Badge variant="outline" className="text-[10px] border-neon-green/30 text-neon-green bg-neon-green/5">
              {stats.final} final
            </Badge>
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
            {filter === "needs_result" ? "🎉 No matches need results right now." : "No matches match your filters."}
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
                              <p className="text-sm font-bold leading-tight break-words">
                                {p.home_team || "Home"}{" "}
                                <span className="text-muted-foreground/50 mx-0.5">vs</span>{" "}
                                {p.away_team || "Away"}
                              </p>
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

                            {/* Status dropdown — bigger */}
                            <select
                              value={row.statusInput}
                              onChange={(e) => updateRow(p.match_id, { statusInput: e.target.value as ResultStatus })}
                              className="bg-background border border-border/50 rounded-md h-10 px-3 text-sm font-medium"
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

                              {/* Save button */}
                              <Button
                                size="sm"
                                variant={row.dirty ? "default" : "outline"}
                                onClick={() => saveOne(p.match_id)}
                                disabled={row.saving || row.scrapingSingle || !row.dirty}
                                className="h-10 gap-1.5 px-4"
                              >
                                {row.saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                                <span>{row.saving ? "Saving" : row.dirty ? "Save" : "Saved"}</span>
                              </Button>
                            </div>
                          </div>

                          {/* Per-row messages */}
                          {(row.msg || row.scrapeMsg) && (
                            <div className="flex flex-col gap-1">
                              {row.scrapeMsg && (
                                <p className={`text-[11px] flex items-center gap-1.5 ${row.scrapeMsg.kind === "ok" ? "text-neon-cyan" : "text-neon-red"}`}>
                                  {row.scrapeMsg.kind === "ok" ? <Play className="w-3 h-3" /> : <AlertTriangle className="w-3 h-3" />}
                                  {row.scrapeMsg.text}
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
