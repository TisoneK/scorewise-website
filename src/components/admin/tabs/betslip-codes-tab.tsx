/**
 * BetslipCodesTab — admin/operator form for managing betslip booking codes.
 *
 * Replaces the per-match drawer workflow with a dedicated tab where you can:
 *   - See all matches that need codes (or all matches, filterable)
 *   - Paste Linebet/Paripesa/1xbet codes into inline inputs
 *   - Submit per-row (Save) or in a batch (Save All)
 *
 * Visible to: ADMIN + OPERATOR only (middleware + role check at the route layer).
 *
 * Data flow:
 *   - Loads all predictions from /api/admin/engine on mount
 *   - User edits inputs (local state, keyed by matchId)
 *   - On Save (per-row) or Save All (batch), POSTs to /api/admin/predictions/bet-code
 *   - Server stores the code in the Prediction.betCode column
 *   - User-facing cards pick up the code via /api/predictions within ~60s
 *     (the auto-refresh interval) or immediately on next page load
 */

"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Ticket,
  Save,
  Loader2,
  RefreshCw,
  Check,
  AlertTriangle,
  Calendar,
  Search,
  Filter,
  ExternalLink,
} from "lucide-react";
import type { Prediction, StoredPredictions } from "@/lib/types";
import {
  parseMatchDateTime,
  formatLocalDateTime,
  formatLocalDateLong,
  localDateKey,
  isTodayLocal,
  getTimezoneAbbr,
} from "@/lib/timezone";

type FilterMode = "missing" | "all" | "today";

interface RowState {
  /** Current value in the input field (may differ from saved). */
  input: string;
  /** Last saved value on the server. */
  saved: string;
  /** True if input differs from saved (i.e. has unsaved changes). */
  dirty: boolean;
  /** Per-row save state. */
  saving: boolean;
  /** Per-row last save outcome message (cleared after 3s). */
  msg: { kind: "ok" | "err"; text: string } | null;
}

export function BetslipCodesTab() {
  const [data, setData] = useState<StoredPredictions | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<FilterMode>("missing");
  const [search, setSearch] = useState("");
  const [rows, setRows] = useState<Record<string, RowState>>({});
  const [savingAll, setSavingAll] = useState(false);
  const [batchMsg, setBatchMsg] = useState<{ kind: "ok" | "err"; text: string } | null>(null);
  const tzAbbr = getTimezoneAbbr();

  const fetchPredictions = useCallback(async () => {
    try {
      setError(null);
      // ?all=true so we get ALL predictions including NO_BET (operators may still
      // want to set codes on NO_BET matches in case the bookmaker line moves).
      const res = await fetch("/api/admin/engine");
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json: StoredPredictions = await res.json();
      setData(json);
      // Initialize row state from server data (preserve any in-flight input
      // values the user is currently editing — don't clobber them).
      setRows((prev) => {
        const next: Record<string, RowState> = {};
        for (const p of json.predictions || []) {
          const saved = p.bet_code || "";
          const existing = prev[p.match_id];
          next[p.match_id] = {
            input: existing?.input ?? saved,
            saved,
            dirty: (existing?.input ?? saved) !== saved,
            saving: false,
            msg: existing?.msg ?? null,
          };
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

  const saveOne = async (matchId: string) => {
    const row = rows[matchId];
    if (!row) return;
    setRows((prev) => ({ ...prev, [matchId]: { ...prev[matchId], saving: true, msg: null } }));
    try {
      const res = await fetch("/api/admin/predictions/bet-code", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ matchId, betCode: row.input }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || `HTTP ${res.status}`);
      setRows((prev) => ({
        ...prev,
        [matchId]: { ...prev[matchId], saving: false, saved: row.input, dirty: false, msg: { kind: "ok", text: "Saved" } },
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
    // Sequential saves — easier to track than Promise.all, and Turso is fine with the rate.
    for (const id of dirtyIds) {
      // eslint-disable-next-line no-await-in-loop
      await saveOne(id).then(() => { okCount++; }).catch(() => { errCount++; });
    }
    setSavingAll(false);
    if (errCount === 0) {
      setBatchMsg({ kind: "ok", text: `Saved ${okCount} code${okCount !== 1 ? "s" : ""}.` });
    } else {
      setBatchMsg({ kind: "err", text: `Saved ${okCount}, failed ${errCount}. See row messages.` });
    }
    setTimeout(() => setBatchMsg(null), 5000);
  };

  // Filtered + grouped predictions
  const grouped = useMemo(() => {
    if (!data?.predictions) return [];
    const filtered = data.predictions.filter((p) => {
      const row = rows[p.match_id];
      // Filter: missing = no saved code, all = everything, today = local-TZ today
      if (filter === "missing" && row?.saved) return false;
      if (filter === "today") {
        const d = parseMatchDateTime(p.date, p.time);
        if (!d || !isTodayLocal(d)) return false;
      }
      // Search
      if (search) {
        const s = search.toLowerCase();
        const haystack = [p.home_team || "", p.away_team || "", p.league || "", p.country || ""].join(" ").toLowerCase();
        if (!haystack.includes(s)) return false;
      }
      return true;
    });
    // Sort by local datetime
    const sorted = [...filtered].sort((a, b) => {
      const da = parseMatchDateTime(a.date, a.time);
      const db = parseMatchDateTime(b.date, b.time);
      return (da?.getTime() || 0) - (db?.getTime() || 0);
    });
    // Group by local date
    const groups: { dateKey: string; label: string; predictions: Prediction[] }[] = [];
    for (const p of sorted) {
      const d = parseMatchDateTime(p.date, p.time);
      const dateKey = d ? localDateKey(d) : "unknown";
      const label = d ? formatLocalDateLong(d) : "Unknown Date";
      const last = groups[groups.length - 1];
      if (last && last.dateKey === dateKey) last.predictions.push(p);
      else groups.push({ dateKey, label, predictions: [p] });
    }
    return groups;
  }, [data, rows, filter, search]);

  const stats = useMemo(() => {
    const total = data?.predictions?.length || 0;
    const withCode = Object.values(rows).filter((r) => r.saved).length;
    return { total, withCode, missing: total - withCode };
  }, [data, rows]);

  const dirtyCount = Object.values(rows).filter((r) => r.dirty).length;

  return (
    <div className="space-y-4">
      {/* Header + actions */}
      <Card className="bg-card/60 border-border/40">
        <CardContent className="p-4 space-y-3">
          <div className="flex items-start justify-between gap-3 flex-wrap">
            <div className="flex items-center gap-2 min-w-0">
              <Ticket className="w-5 h-5 text-neon-cyan shrink-0" />
              <div className="min-w-0">
                <h2 className="text-sm font-bold">Betslip Codes</h2>
                <p className="text-[11px] text-muted-foreground">
                  Paste booking codes from Linebet / Paripesa / 1xbet — users can copy them from prediction cards to generate a betslip.
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <Button variant="outline" size="sm" onClick={fetchPredictions} disabled={loading} className="gap-1.5 h-8">
                <RefreshCw className={`w-3.5 h-3.5 ${loading ? "animate-spin" : ""}`} />
                <span className="hidden sm:inline">Refresh</span>
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

          {/* Stats badges */}
          <div className="flex items-center gap-2 flex-wrap text-[10px]">
            <Badge variant="outline" className="text-[10px] border-border/40 bg-background/30">{stats.total} total</Badge>
            <Badge variant="outline" className="text-[10px] border-neon-green/30 text-neon-green bg-neon-green/5">{stats.withCode} with code</Badge>
            <Badge variant="outline" className="text-[10px] border-neon-yellow/30 text-neon-yellow bg-neon-yellow/5">{stats.missing} missing</Badge>
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
                <option value="missing">Missing codes only</option>
                <option value="today">Today&apos;s matches</option>
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
            {filter === "missing" ? "🎉 All matches have betslip codes!" : "No matches match your filters."}
          </CardContent>
        </Card>
      ) : (
        /* Form: grouped list of matches with inline code inputs */
        <div className="space-y-4">
          {grouped.map((group) => (
            <div key={group.dateKey} className="space-y-2">
              {/* Date header */}
              <div className="flex items-center gap-2 px-1 pt-2">
                <Calendar className="w-3.5 h-3.5 text-neon-cyan shrink-0" />
                <span className="text-xs font-bold text-foreground uppercase tracking-wide">{group.label}</span>
                <div className="flex-1 h-px bg-border/30" />
                <span className="text-[10px] text-muted-foreground/50">{group.predictions.length} match{group.predictions.length !== 1 ? "es" : ""}</span>
              </div>

              {/* Match rows */}
              <div className="space-y-2">
                {group.predictions.map((p) => {
                  const row = rows[p.match_id];
                  if (!row) return null;
                  const matchDate = parseMatchDateTime(p.date, p.time);
                  return (
                    <Card
                      key={p.match_id}
                      className={`bg-card/60 border-border/40 overflow-hidden transition-colors ${row.dirty ? "ring-1 ring-neon-cyan/30" : ""}`}
                    >
                      <CardContent className="p-3">
                        <div className="flex items-center gap-3 flex-wrap sm:flex-nowrap">
                          {/* Match info */}
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-1.5">
                              <p className="text-xs font-bold leading-tight break-words">
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
                              >
                                <ExternalLink className="w-3 h-3" />
                              </a>
                            </div>
                            <p className="text-[10px] text-muted-foreground mt-0.5 truncate">
                              {[p.league, p.country].filter(Boolean).join(" · ")}
                              {matchDate && (
                                <>
                                  <span className="mx-1 text-muted-foreground/30">•</span>
                                  {formatLocalDateTime(matchDate)} <span className="text-muted-foreground/50">{tzAbbr}</span>
                                </>
                              )}
                              {p.recommendation && (
                                <>
                                  <span className="mx-1 text-muted-foreground/30">•</span>
                                  <span className={p.recommendation === "OVER" ? "text-neon-green" : p.recommendation === "UNDER" ? "text-neon-red" : "text-muted-foreground"}>
                                    {p.recommendation}
                                  </span>
                                </>
                              )}
                            </p>
                          </div>

                          {/* Code input + Save */}
                          <div className="flex items-center gap-1.5 w-full sm:w-auto">
                            <div className="relative flex-1 sm:flex-none">
                              <Ticket className="absolute left-2 top-1/2 -translate-y-1/2 w-3 h-3 text-muted-foreground/60" />
                              <Input
                                value={row.input}
                                onChange={(e) => setRows((prev) => ({
                                  ...prev,
                                  [p.match_id]: { ...prev[p.match_id], input: e.target.value, dirty: e.target.value !== prev[p.match_id].saved, msg: null },
                                }))}
                                placeholder="e.g. SD:OP-12345"
                                className="pl-7 bg-background font-mono text-xs h-8 sm:w-44"
                                disabled={row.saving}
                              />
                            </div>
                            <Button
                              size="sm"
                              variant={row.dirty ? "default" : "outline"}
                              onClick={() => saveOne(p.match_id)}
                              disabled={row.saving || !row.dirty}
                              className="h-8 gap-1 shrink-0"
                            >
                              {row.saving ? <Loader2 className="w-3 h-3 animate-spin" /> : <Save className="w-3 h-3" />}
                              <span className="hidden sm:inline">{row.saving ? "Saving" : row.dirty ? "Save" : "Saved"}</span>
                            </Button>
                          </div>
                        </div>

                        {/* Per-row message */}
                        {row.msg && (
                          <p className={`text-[10px] mt-1.5 flex items-center gap-1 ${row.msg.kind === "ok" ? "text-neon-green" : "text-neon-red"}`}>
                            {row.msg.kind === "ok" ? <Check className="w-3 h-3" /> : <AlertTriangle className="w-3 h-3" />}
                            {row.msg.text}
                          </p>
                        )}
                      </CardContent>
                    </Card>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
