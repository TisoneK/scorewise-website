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

import { useState, useMemo, useEffect, useCallback } from "react";
import { Switch } from "@/components/ui/switch";
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
} from "lucide-react";
import { toast } from "sonner";
import type { Prediction, StoredPredictions } from "@/lib/types";
import { PredictionCard } from "../prediction-card";

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

  // Breakdown across ALL predictions — surfaces data the old header omitted.
  const summary = useMemo(() => {
    let ou = 0, winner = 0, noBet = 0, failed = 0, reduced = 0, withResult = 0, hi = 0;
    for (const p of preds) {
      const rec = p.recommendation?.toUpperCase();
      if (p.success === false) failed++;
      if (rec === "OVER" || rec === "UNDER") ou++;
      if (rec === "NO_BET") noBet++;
      if (p.team_winner === "HOME_TEAM" || p.team_winner === "AWAY_TEAM") winner++;
      if (p.reduced_over_total != null || p.reduced_under_total != null) reduced++;
      if (p.result_status === "FINAL") withResult++;
      if (p.confidence?.toUpperCase() === "HIGH") hi++;
    }
    return { ou, winner, noBet, failed, reduced, withResult, hi };
  }, [preds]);

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
        <div className="flex gap-2 flex-wrap items-center">
          {/* Admin-only: per-market user visibility (O/U + 1X2 suspension) */}
          <UserVisibilityControls />
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

      {/* Breakdown stats — clickable chips double as recommendation filters */}
      <div className="flex items-center gap-1.5 flex-wrap text-[10px]">
        <Badge variant="outline" className="border-border/40 bg-background/30">{totalPreds} total</Badge>
        <button onClick={() => setFilterRec("OVER")} className="focus:outline-none">
          <Badge variant="outline" className="border-neon-green/30 text-neon-green bg-neon-green/5 hover:bg-neon-green/10 cursor-pointer gap-1">
            <TrendingUp className="w-2.5 h-2.5" />O/U {summary.ou}</Badge>
        </button>
        <button onClick={() => setFilterRec("1X2")} className="focus:outline-none">
          <Badge variant="outline" className="border-neon-cyan/30 text-neon-cyan bg-neon-cyan/5 hover:bg-neon-cyan/10 cursor-pointer gap-1">
            <Trophy className="w-2.5 h-2.5" />1X2 {summary.winner}</Badge>
        </button>
        {summary.reduced > 0 && (
          <Badge variant="outline" className="border-neon-green/30 text-neon-green bg-neon-green/5 gap-1">
            <TrendingDown className="w-2.5 h-2.5" />reduced {summary.reduced}</Badge>
        )}
        <Badge variant="outline" className="border-neon-yellow/30 text-neon-yellow bg-neon-yellow/5">HIGH conf {summary.hi}</Badge>
        <button onClick={() => setFilterRec("NO_BET")} className="focus:outline-none">
          <Badge variant="outline" className="border-neon-yellow/30 text-neon-yellow bg-neon-yellow/5 hover:bg-neon-yellow/10 cursor-pointer">NO BET {summary.noBet}</Badge>
        </button>
        {summary.failed > 0 && (
          <Badge variant="outline" className="border-neon-red/30 text-neon-red bg-neon-red/5">failed {summary.failed}</Badge>
        )}
        <Badge variant="outline" className="border-border/40 text-muted-foreground">results in {summary.withResult}</Badge>
        {filterRec !== "ALL" && (
          <button onClick={() => setFilterRec("ALL")} className="focus:outline-none">
            <Badge variant="outline" className="border-border/40 text-muted-foreground hover:text-foreground cursor-pointer">clear filter ✕</Badge>
          </button>
        )}
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
        <div className="grid gap-2 lg:grid-cols-2 lg:gap-3 xl:grid-cols-3">
          {filtered.map((p) => (
            <PredictionCard key={p.match_id} prediction={p} admin onSelect={setDrawerPrediction} />
          ))}
        </div>
      )}
    </>
  );
}

/**
 * UserVisibilityControls — admin-only cluster to suspend / re-enable each
 * user-facing market independently:
 *   - O/U (totals)  → website/suspend_user_totals  (default SUSPENDED)
 *   - 1X2 (winner)  → website/suspend_user_winner  (default LIVE)
 * When a market is suspended, /api/predictions strips its fields and
 * /api/analytics omits its track-record card — nothing leaks. Admins always
 * see everything. No redeploy — takes effect on the users' next poll.
 * Self-gating: config GET is admin-only, so operators see nothing.
 */
function UserVisibilityControls() {
  const [rows, setRows] = useState<Record<string, string> | null>(null);
  const [saving, setSaving] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/admin/config");
      if (!res.ok) return; // 403 for operators → cluster stays hidden
      const data = await res.json();
      const map: Record<string, string> = {};
      for (const c of data.configs || []) {
        if (c.service === "website") map[c.key] = c.value ?? "";
      }
      setRows(map);
    } catch {}
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- fetch-on-mount: setState runs after the first await, not synchronously in the effect
    load();
    const id = setInterval(load, 60000);
    return () => clearInterval(id);
  }, [load]);

  if (!rows) return null;

  const setKey = async (key: string, value: string, msg: string) => {
    setSaving(key);
    try {
      const res = await fetch("/api/admin/config", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ service: "website", key, value, secret: false }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      setRows((prev) => ({ ...(prev || {}), [key]: value }));
      toast.success(msg);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to update");
    } finally {
      setSaving(null);
    }
  };

  // O/U: suspended unless explicitly "false". 1X2: suspended only if "true".
  const ouSuspended = (rows["suspend_user_totals"] ?? "") !== "false";
  const winnerSuspended = (rows["suspend_user_winner"] ?? "") === "true";

  return (
    <>
      <SuspensionPill
        label="User O/U" suspended={ouSuspended} busy={saving === "suspend_user_totals"}
        aria="Toggle O/U picks visibility for users"
        onToggle={(live) => setKey("suspend_user_totals", live ? "false" : "true",
          live ? "O/U picks LIVE for users again." : "O/U picks SUSPENDED for users.")}
      />
      <SuspensionPill
        label="User 1X2" suspended={winnerSuspended} busy={saving === "suspend_user_winner"}
        aria="Toggle 1X2 picks visibility for users"
        onToggle={(live) => setKey("suspend_user_winner", live ? "false" : "true",
          live ? "1X2 picks LIVE for users again." : "1X2 picks SUSPENDED for users.")}
      />
    </>
  );
}

/** One SUSPENDED/LIVE pill + switch. Hoisted to module scope (never define a
 *  component inside another component's render). */
function SuspensionPill({ label, suspended, busy, onToggle, aria }: {
  label: string; suspended: boolean; busy: boolean; onToggle: (live: boolean) => void; aria: string;
}) {
  return (
    <div className={`flex items-center gap-2 rounded-md border px-2.5 h-9 ${suspended ? "border-neon-yellow/40 bg-neon-yellow/5" : "border-neon-green/30 bg-neon-green/5"}`}>
      <span className="text-xs font-semibold whitespace-nowrap">
        {label}:{" "}
        <span className={suspended ? "text-neon-yellow" : "text-neon-green"}>{suspended ? "SUSPENDED" : "LIVE"}</span>
      </span>
      <Switch checked={!suspended} disabled={busy} onCheckedChange={(checked) => onToggle(checked)} aria-label={aria} />
    </div>
  );
}
