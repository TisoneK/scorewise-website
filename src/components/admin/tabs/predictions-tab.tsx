/**
 * PredictionsTab — card-based prediction browser.
 *
 * Shows predictions as clickable cards with:
 * - Match info (teams, league, date/time)
 * - Prediction (O/U + line + odds, 1X2 winner)
 * - Reduced-risk line (if available)
 * - Result (score + WON/LOST badges)
 * - Color-coded confidence + recommendation badges
 *
 * Per-card click → opens PredictionDetailDrawer (tabbed Bet365-style)
 */

"use client";

import { useState, useMemo } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import {
  RefreshCw,
  Download,
  Loader2,
  Trash2,
  Search,
  TrendingUp,
  TrendingDown,
  Trophy,
  Calendar,
  Clock,
  CheckCircle2,
  XCircle,
  ChevronRight,
  ExternalLink,
} from "lucide-react";
import { toast } from "sonner";
import type { Prediction, StoredPredictions } from "@/lib/types";
import { ConfidenceBadge, RecommendationBadge } from "../badges";
import { computeReducedRiskOutcome, computeWinnerOutcome } from "@/lib/result-utils";

export interface PredictionsTabProps {
  preds: Prediction[];
  totalPreds: number;
  successCount: number;
  failCount: number;
  loadingPred: boolean;
  allPredictionsData: StoredPredictions | null;
  fetchAllPredictions: () => void;
  handleDownloadPredictions: () => void;
  setDrawerPrediction: (p: Prediction | null) => void;
}

export function PredictionsTab({
  preds,
  totalPreds,
  successCount,
  failCount,
  loadingPred,
  allPredictionsData,
  fetchAllPredictions,
  handleDownloadPredictions,
  setDrawerPrediction,
}: PredictionsTabProps) {
  const [deleting, setDeleting] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [showDeleteBox, setShowDeleteBox] = useState(false);

  // Pull the engine's store directly into the website DB — the recovery
  // path when the engine→website webhook was down during an ingest.
  const handleEngineSync = async () => {
    setSyncing(true);
    try {
      const res = await fetch("/api/admin/engine/sync", { method: "POST" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
      toast.success(`Engine sync: ${data.fetched} fetched — ${data.stored} new, ${data.updated} updated${data.errors ? `, ${data.errors} errors` : ""}`);
      fetchAllPredictions();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Engine sync failed");
    } finally {
      setSyncing(false);
    }
  };
  const [deleteFromDate, setDeleteFromDate] = useState("");
  const [deleteToDate, setDeleteToDate] = useState("");
  const [deleteMode, setDeleteMode] = useState<"single" | "range">("single");
  const [search, setSearch] = useState("");
  const [filterRec, setFilterRec] = useState<"ALL" | "OVER" | "UNDER" | "1X2" | "NO_BET">("ALL");
  const [filterConf, setFilterConf] = useState<"ALL" | "HIGH" | "MEDIUM" | "LOW">("ALL");

  // Filter predictions
  const filtered = useMemo(() => {
    return preds.filter((p) => {
      // Search
      if (search) {
        const s = search.toLowerCase();
        const haystack = [p.match_id, p.home_team, p.away_team, p.country, p.league].join(" ").toLowerCase();
        if (!haystack.includes(s)) return false;
      }
      // Recommendation filter
      if (filterRec !== "ALL") {
        if (filterRec === "1X2") {
          if (!p.team_winner || p.team_winner === "NO_WINNER_PREDICTION") return false;
        } else if (filterRec === "NO_BET") {
          if (p.recommendation !== "NO_BET" && p.recommendation) return false;
        } else {
          if (p.recommendation?.toUpperCase() !== filterRec) return false;
        }
      }
      // Confidence filter
      if (filterConf !== "ALL" && p.confidence?.toUpperCase() !== filterConf) return false;
      return true;
    });
  }, [preds, search, filterRec, filterConf]);

  const handleDelete = async () => {
    let payload: Record<string, string> = {};
    let label = "";
    if (deleteMode === "single") {
      if (!deleteFromDate) { toast.error("Select a date"); return; }
      payload = { date: deleteFromDate };
      label = deleteFromDate;
    } else {
      if (!deleteFromDate || !deleteToDate) { toast.error("Select both dates"); return; }
      payload = { fromDate: deleteFromDate, toDate: deleteToDate };
      label = `${deleteFromDate} to ${deleteToDate}`;
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
      toast.success(`Deleted ${data.deleted} prediction(s) for ${label}`);
      setShowDeleteBox(false);
      setDeleteFromDate("");
      setDeleteToDate("");
      fetchAllPredictions();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Delete failed");
    } finally {
      setDeleting(false);
    }
  };

  return (
    <>
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h2 className="text-lg font-bold">All Predictions</h2>
          <p className="text-sm text-muted-foreground">
            {totalPreds} total · {successCount} processed · {failCount} errors · showing {filtered.length}
          </p>
        </div>
        <div className="flex gap-2 flex-wrap">
          <Button variant="outline" size="sm" onClick={fetchAllPredictions} disabled={loadingPred} className="gap-1.5 border-border/50 text-muted-foreground hover:text-foreground">
            <RefreshCw className={`w-3.5 h-3.5 ${loadingPred ? "animate-spin" : ""}`} /> Reload
          </Button>
          {/* Pulls the engine store into the website DB — use when the
              webhook channel was down during an ingest (does NOT scrape). */}
          <Button variant="outline" size="sm" onClick={handleEngineSync} disabled={syncing} className="gap-1.5 border-neon-cyan/30 text-neon-cyan hover:bg-neon-cyan/10">
            <RefreshCw className={`w-3.5 h-3.5 ${syncing ? "animate-spin" : ""}`} /> Sync from engine
          </Button>
          <Button variant="outline" size="sm" onClick={handleDownloadPredictions} disabled={!allPredictionsData} className="gap-1.5 border-border/50 text-muted-foreground hover:text-foreground">
            <Download className="w-3.5 h-3.5" /> Export
          </Button>
          <Button variant="outline" size="sm" onClick={() => setShowDeleteBox(!showDeleteBox)} className="gap-1.5 border-neon-red/30 text-neon-red hover:bg-neon-red/10">
            <Trash2 className="w-3.5 h-3.5" /> Delete
          </Button>
        </div>
      </div>

      {/* Delete panel */}
      {showDeleteBox && (
        <Card className="bg-card/60 border-neon-red/30">
          <CardContent className="p-4 space-y-3">
            <div className="flex items-center gap-2">
              <Trash2 className="w-4 h-4 text-neon-red" />
              <p className="text-sm font-bold text-neon-red">Delete Predictions</p>
            </div>
            <div className="flex items-center gap-2">
              <button type="button" onClick={() => setDeleteMode("single")} className={`text-xs px-3 py-1.5 rounded-md border ${deleteMode === "single" ? "border-neon-red/50 bg-neon-red/10 text-neon-red font-bold" : "border-border/40 text-muted-foreground"}`}>Single Date</button>
              <button type="button" onClick={() => setDeleteMode("range")} className={`text-xs px-3 py-1.5 rounded-md border ${deleteMode === "range" ? "border-neon-red/50 bg-neon-red/10 text-neon-red font-bold" : "border-border/40 text-muted-foreground"}`}>Date Range</button>
            </div>
            <div className="flex items-center gap-2 flex-wrap">
              {deleteMode === "single" ? (
                <>
                  <label className="text-xs text-muted-foreground">Date:</label>
                  <input type="date" value={deleteFromDate} onChange={(e) => setDeleteFromDate(e.target.value)} className="bg-background border border-border/50 rounded-md h-9 px-3 text-sm" />
                </>
              ) : (
                <>
                  <label className="text-xs text-muted-foreground">From:</label>
                  <input type="date" value={deleteFromDate} onChange={(e) => setDeleteFromDate(e.target.value)} className="bg-background border border-border/50 rounded-md h-9 px-3 text-sm" />
                  <label className="text-xs text-muted-foreground">To:</label>
                  <input type="date" value={deleteToDate} onChange={(e) => setDeleteToDate(e.target.value)} className="bg-background border border-border/50 rounded-md h-9 px-3 text-sm" />
                </>
              )}
              <Button size="sm" onClick={handleDelete} disabled={deleting || !deleteFromDate || (deleteMode === "range" && !deleteToDate)} className="gap-1.5 bg-neon-red text-background hover:bg-neon-red/85">
                {deleting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Trash2 className="w-3.5 h-3.5" />} Delete
              </Button>
              <Button variant="outline" size="sm" onClick={() => { setShowDeleteBox(false); setDeleteFromDate(""); setDeleteToDate(""); }} className="text-muted-foreground">Cancel</Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Search + Filters */}
      <div className="flex flex-col sm:flex-row gap-2">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input placeholder="Search team, league, country..." value={search} onChange={(e) => setSearch(e.target.value)} className="pl-9 bg-card border-border/50 h-9" />
        </div>
        <div className="flex gap-2">
          <select value={filterRec} onChange={(e) => setFilterRec(e.target.value as any)} className="bg-card border border-border/50 rounded-md h-9 px-3 text-xs">
            <option value="ALL">All Picks</option>
            <option value="OVER">OVER</option>
            <option value="UNDER">UNDER</option>
            <option value="1X2">1X2</option>
            <option value="NO_BET">NO BET</option>
          </select>
          <select value={filterConf} onChange={(e) => setFilterConf(e.target.value as any)} className="bg-card border border-border/50 rounded-md h-9 px-3 text-xs">
            <option value="ALL">All Levels</option>
            <option value="HIGH">HIGH</option>
            <option value="MEDIUM">MEDIUM</option>
            <option value="LOW">LOW</option>
          </select>
        </div>
      </div>

      {/* Prediction cards — the loading state only shows when there is no
          data yet; background auto-refreshes keep the current list rendered
          (stale-while-revalidate) so the page doesn't flicker every 30s. */}
      {loadingPred && preds.length === 0 ? (
        <div className="text-center py-12">
          <Loader2 className="w-6 h-6 animate-spin mx-auto mb-2 text-muted-foreground" />
          <p className="text-sm text-muted-foreground">Loading predictions...</p>
        </div>
      ) : filtered.length === 0 ? (
        <Card className="bg-card/60 border-border/40">
          <CardContent className="p-8 text-center">
            <p className="text-sm text-muted-foreground">No predictions match your filters</p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-2">
          {filtered.map((p) => {
            const rec = p.recommendation?.toUpperCase() || "";
            const isOver = rec === "OVER";
            const isUnder = rec === "UNDER";
            const hasWinner = p.team_winner && p.team_winner !== "NO_WINNER_PREDICTION";
            const ouOutcome = computeReducedRiskOutcome(p);
            const winOutcome = computeWinnerOutcome(p);
            const hasScores = p.home_score != null && p.away_score != null;
            const total = hasScores ? Number(p.home_score) + Number(p.away_score) : null;
            const reducedLine = isOver ? p.reduced_over_total : isUnder ? p.reduced_under_total : null;
            const reducedOdds = isOver ? p.reduced_over_odds : isUnder ? p.reduced_under_odds : null;
            const effectiveLine = reducedLine ?? p.bookmaker_line;

            return (
              <div
                key={p.match_id}
                className="rounded-lg bg-card/90 border-2 border-border hover:border-neon-green/40 transition-all overflow-hidden cursor-pointer"
                onClick={() => setDrawerPrediction(p)}
              >
                {/* Header — league + date + result status */}
                <div className="px-3 py-1.5 bg-background/40 border-b border-border/20 flex items-center justify-between gap-2">
                  <p className="text-[10px] text-muted-foreground/70 truncate text-left">
                    {[p.league, p.country].filter(Boolean).join(" · ") || "Unknown league"}
                  </p>
                  <div className="flex items-center gap-2 shrink-0">
                    <span className="text-[10px] text-muted-foreground/60 flex items-center gap-1">
                      <Calendar className="w-2.5 h-2.5" />{p.date || "—"}
                    </span>
                    <span className="text-[10px] text-muted-foreground/60 flex items-center gap-1">
                      <Clock className="w-2.5 h-2.5" />{p.time || "—"}
                    </span>
                    {p.result_status === "FINAL" && (
                      <Badge variant="outline" className="text-[8px] border-neon-green/30 text-neon-green">FINAL</Badge>
                    )}
                    {p.result_status === "LIVE" && (
                      <Badge variant="outline" className="text-[8px] border-neon-red/30 text-neon-red animate-pulse">LIVE</Badge>
                    )}
                  </div>
                </div>

                {/* Body — teams + predictions */}
                <div className="p-3 space-y-2">
                  {/* Teams */}
                  <p className="font-bold text-sm leading-tight break-words">
                    {p.home_team || "Home"} <span className="text-muted-foreground/50 mx-0.5">vs</span> {p.away_team || "Away"}
                  </p>

                  {/* Admin transparency — failed predictions show WHY they
                      didn't qualify instead of being indistinguishable from
                      qualifying ones (users never see these rows at all). */}
                  {p.success === false && (
                    <div className="text-[10px] text-neon-red bg-neon-red/5 border border-neon-red/20 rounded px-2 py-1 break-words">
                      <span className="font-bold">DID NOT QUALIFY: </span>
                      {(p.validation_errors || []).join("; ") || "no reason recorded by the engine"}
                    </div>
                  )}
                  {p.success !== false && p.recommendation === "NO_BET" && (
                    <div className="text-[10px] text-neon-yellow bg-neon-yellow/5 border border-neon-yellow/20 rounded px-2 py-1">
                      <span className="font-bold">NO BET</span> — processed successfully, but the algorithm declined to pick a side
                    </div>
                  )}

                  {/* O/U Prediction row */}
                  {(isOver || isUnder) && (
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className={`flex items-center gap-1 text-xs font-bold ${isOver ? "text-neon-green" : "text-neon-red"}`}>
                        {isOver ? <TrendingUp className="w-3 h-3" /> : <TrendingDown className="w-3 h-3" />}
                        {p.recommendation}
                      </span>
                      <span className="text-sm font-black font-mono text-neon-green">{effectiveLine ?? p.bookmaker_line ?? "—"}</span>
                      {reducedOdds != null && <span className="text-[10px] font-mono text-muted-foreground">@{reducedOdds}</span>}
                      {reducedLine != null && p.bookmaker_line != null && (
                        <span className="text-[9px] font-mono text-muted-foreground/50 line-through">{p.bookmaker_line}</span>
                      )}
                      {p.result_status === "FINAL" && ouOutcome !== "MISSING" && (() => {
                        const tone = ouOutcome === "WIN" ? "border-neon-green/40 bg-neon-green/10 text-neon-green" : ouOutcome === "LOSS" ? "border-neon-red/40 bg-neon-red/10 text-neon-red" : "border-neon-yellow/40 bg-neon-yellow/10 text-neon-yellow";
                        const label = ouOutcome === "WIN" ? "WON ✓" : ouOutcome === "LOSS" ? "LOST ✗" : "PUSH";
                        return <span className={`px-1.5 py-0 rounded text-[9px] border font-bold ${tone}`}>{label}</span>;
                      })()}
                    </div>
                  )}

                  {/* 1X2 Prediction row */}
                  {hasWinner && (
                    <div className="flex items-center gap-2 flex-wrap text-[10px] text-muted-foreground">
                      <Trophy className="w-2.5 h-2.5 text-neon-cyan" />
                      <span className="font-bold">{p.team_winner === "HOME_TEAM" ? p.home_team : p.away_team}</span>
                      {p.team_winner === "HOME_TEAM" ? p.home_odds : p.away_odds != null && <span className="font-mono">@{p.team_winner === "HOME_TEAM" ? p.home_odds : p.away_odds}</span>}
                      {p.result_status === "FINAL" && winOutcome !== "MISSING" && (() => {
                        const tone = winOutcome === "WIN" ? "border-neon-green/40 bg-neon-green/10 text-neon-green" : "border-neon-red/40 bg-neon-red/10 text-neon-red";
                        const label = winOutcome === "WIN" ? "WON ✓" : "LOST ✗";
                        return <span className={`px-1.5 py-0 rounded text-[9px] border font-bold ${tone}`}>{label}</span>;
                      })()}
                    </div>
                  )}

                  {/* Result line */}
                  {hasScores && (
                    <div className="flex items-center gap-2 text-[11px] font-bold flex-wrap">
                      <span className="font-mono">{p.home_team || "Home"} {p.home_score} - {p.away_score} {p.away_team || "Away"}</span>
                      {total != null && effectiveLine != null && (() => {
                        const diff = total - effectiveLine;
                        const isUnderRec = p.recommendation?.toUpperCase() === "UNDER";
                        const won = (isUnderRec && diff < 0) || (!isUnderRec && diff >= 0);
                        const diffStr = diff >= 0 ? `+${diff.toFixed(1)}` : diff.toFixed(1);
                        const diffDir = diff >= 0 ? "OVER" : "UNDER";
                        return (
                          <span className="text-[10px] text-muted-foreground/80 font-mono">
                            Total: <span className="text-foreground font-bold">{total}</span> · Line: <span className="text-neon-cyan">{effectiveLine}</span> · <span className={won ? "text-neon-green" : "text-neon-red"}>{diffStr} {diffDir}</span>
                          </span>
                        );
                      })()}
                    </div>
                  )}

                  {/* Bottom row — confidence + badges */}
                  <div className="flex items-center gap-2 pt-1 border-t border-border/10">
                    <ConfidenceBadge level={p.confidence} />
                    {p.recommendation && p.recommendation !== "NO_BET" && <RecommendationBadge rec={p.recommendation} />}
                    {!p.success && <Badge variant="outline" className="text-[9px] border-neon-red/30 text-neon-red">ERR</Badge>}
                    <a
                      href={`https://www.flashscore.co.ke/match/${p.match_id}/`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-muted-foreground/40 hover:text-neon-cyan transition-colors ml-auto"
                      onClick={(e) => e.stopPropagation()}
                    >
                      <ExternalLink className="w-3 h-3" />
                    </a>
                    <ChevronRight className="w-3.5 h-3.5 text-muted-foreground/50" />
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </>
  );
}
