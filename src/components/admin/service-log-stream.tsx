/**
 * ServiceLogStream — inline live log stream shown beneath each service's
 * controls on the Services tab.
 *
 * Extracted from src/app/page.tsx during Phase B modularization.
 *
 * Each instance polls /api/admin/logs/stream independently and keeps its own
 * "since" cursor so it only fetches new entries on each poll. Rows are
 * expandable to reveal the full message + logger name + ISO timestamp.
 *
 * Polling cadence: every 3s when auto-scroll is on, every 5s when paused.
 */

"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";
import {
  Search,
  RefreshCw,
  Trash2,
  Loader2,
  AlertTriangle,
  Terminal,
  Play,
  Pause,
  ChevronRight,
  ChevronDown,
  ChevronUp,
} from "lucide-react";
import type { ServiceLogEntry } from "@/lib/admin/types";

export function ServiceLogStream({
  service,
}: {
  service: "scraper" | "engine";
}) {
  const [logs, setLogs] = useState<ServiceLogEntry[]>([]);
  const [since, setSince] = useState<string | null>(null);
  const [autoScroll, setAutoScroll] = useState(true);
  const [level, setLevel] = useState<string>("INFO");
  const [query, setQuery] = useState<string>("");
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [collapsed, setCollapsed] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [initialLoading, setInitialLoading] = useState(true);
  const [isPolling, setIsPolling] = useState(false);
  const isFetchingRef = useRef(false);
  const scrollRef = useRef<HTMLDivElement | null>(null);

  const fetchLogs = useCallback(
    async (mode: "initial" | "poll" = "poll") => {
      if (isFetchingRef.current) return;
      isFetchingRef.current = true;
      if (mode === "initial") setInitialLoading(true);
      else setIsPolling(true);
      setError(null);
      try {
        const params = new URLSearchParams({ service, limit: "100", level });
        if (query.trim()) params.set("q", query.trim());
        if (mode === "poll" && since) params.set("since", since);
        const res = await fetch(`/api/admin/logs/stream?${params.toString()}`);
        if (!res.ok) {
          const err = await res.json().catch(() => ({}));
          throw new Error(err?.error || `HTTP ${res.status}`);
        }
        const data = await res.json();
        const incoming: ServiceLogEntry[] = Array.isArray(data?.logs)
          ? data.logs
          : [];
        if (incoming.length > 0) {
          setLogs((prev) => {
            const seen = new Set(
              prev.map(
                (l) =>
                  `${l.timestamp}|${l.level}|${l.logger}|${l.message}`,
              ),
            );
            const fresh = incoming.filter(
              (l) =>
                !seen.has(
                  `${l.timestamp}|${l.level}|${l.logger}|${l.message}`,
                ),
            );
            if (fresh.length === 0) return prev;
            return [...prev, ...fresh].slice(-200);
          });
          setSince(incoming[incoming.length - 1].timestamp);
        }
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        setError(msg);
      } finally {
        isFetchingRef.current = false;
        if (mode === "initial") setInitialLoading(false);
        else setIsPolling(false);
      }
    },
    [service, level, query, since],
  );

  useEffect(() => {
    setLogs([]);
    setSince(null);
    setError(null);
    setInitialLoading(true);
    fetchLogs("initial");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [service, level]);

  useEffect(() => {
    const t = setTimeout(() => {
      setLogs([]);
      setSince(null);
      setInitialLoading(true);
      fetchLogs("initial");
    }, 400);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query]);

  useEffect(() => {
    if (collapsed) return;
    const intervalMs = autoScroll ? 3000 : 5000;
    const id = setInterval(() => {
      fetchLogs("poll");
    }, intervalMs);
    return () => clearInterval(id);
  }, [autoScroll, collapsed, fetchLogs]);

  useEffect(() => {
    if (!autoScroll || collapsed) return;
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [logs, autoScroll, collapsed]);

  const toggleExpand = (id: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const clearLogs = async () => {
    try {
      const res = await fetch(
        `/api/admin/logs/stream?service=${service}`,
        { method: "DELETE" },
      );
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      setLogs([]);
      setSince(null);
      toast.success(`${service} log buffer cleared`);
    } catch (err) {
      toast.error(
        `Failed to clear: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  };

  const levelColor = (lvl: string) =>
    lvl === "ERROR" || lvl === "CRITICAL"
      ? "text-destructive"
      : lvl === "WARNING"
        ? "text-neon-yellow"
        : lvl === "INFO"
          ? "text-neon-green"
          : "text-muted-foreground";

  const levelBg = (lvl: string) =>
    lvl === "ERROR" || lvl === "CRITICAL"
      ? "bg-destructive/5 hover:bg-destructive/10 border-l-destructive"
      : lvl === "WARNING"
        ? "bg-neon-yellow/5 hover:bg-neon-yellow/10 border-l-neon-yellow"
        : lvl === "INFO"
          ? "bg-card/40 hover:bg-card/80 border-l-neon-green/50"
          : "bg-card/40 hover:bg-card/80 border-l-muted-foreground/50";

  return (
    <div className="border border-border/40 rounded-lg overflow-hidden bg-background/40">
      {/* Header bar */}
      <div
        className="flex items-center gap-2 px-3 py-2 bg-card/60 border-b border-border/40 cursor-pointer select-none"
        onClick={() => setCollapsed((c) => !c)}
      >
        <Terminal
          className={`w-3.5 h-3.5 text-neon-cyan ${!collapsed ? "animate-pulse" : ""}`}
        />
        <span className="text-xs font-semibold flex-1">
          Live Logs
          <span className="text-muted-foreground font-normal ml-2">
            {logs.length} {logs.length === 1 ? "entry" : "entries"}
          </span>
        </span>
        {error && (
          <Badge
            variant="outline"
            className="text-[9px] border-destructive/40 text-destructive"
          >
            <AlertTriangle className="w-2.5 h-2.5 mr-1" />
            {error.slice(0, 30)}
          </Badge>
        )}
        {!collapsed && autoScroll && logs.length > 0 && (
          <span className="flex items-center gap-1 text-[9px] text-neon-green">
            <span className="w-1.5 h-1.5 rounded-full bg-neon-green animate-pulse" />
            LIVE
          </span>
        )}
        {collapsed ? (
          <ChevronRight className="w-3.5 h-3.5 text-muted-foreground" />
        ) : (
          <ChevronDown className="w-3.5 h-3.5 text-muted-foreground" />
        )}
      </div>

      {!collapsed && (
        <>
          {/* Filter / control bar */}
          <div className="flex items-center gap-2 px-3 py-1.5 bg-background/30 border-b border-border/30 flex-wrap">
            <Select value={level} onValueChange={setLevel}>
              <SelectTrigger className="w-[90px] bg-card border-border/50 text-[10px] h-6">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="DEBUG">DEBUG+</SelectItem>
                <SelectItem value="INFO">INFO+</SelectItem>
                <SelectItem value="WARNING">WARN+</SelectItem>
                <SelectItem value="ERROR">ERROR+</SelectItem>
              </SelectContent>
            </Select>
            <div className="relative flex-1 min-w-[120px] max-w-[200px]">
              <Search className="absolute left-1.5 top-1/2 -translate-y-1/2 w-3 h-3 text-muted-foreground" />
              <Input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="filter..."
                className="pl-6 h-6 text-[10px] bg-card border-border/50"
              />
            </div>
            <Button
              variant="ghost"
              size="sm"
              onClick={(e) => {
                e.stopPropagation();
                setAutoScroll((a) => !a);
              }}
              className={`h-6 px-2 text-[10px] gap-1 ${autoScroll ? "text-neon-green" : "text-muted-foreground"}`}
              title={
                autoScroll ? "Pause auto-scroll" : "Resume auto-scroll"
              }
            >
              {autoScroll ? (
                <Pause className="w-3 h-3" />
              ) : (
                <Play className="w-3 h-3" />
              )}
              {autoScroll ? "Live" : "Paused"}
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={(e) => {
                e.stopPropagation();
                fetchLogs("initial");
              }}
              disabled={initialLoading || isPolling}
              className="h-6 px-2 text-[10px] gap-1 text-muted-foreground"
              title="Refresh now"
            >
              <RefreshCw
                className={`w-3 h-3 ${initialLoading || isPolling ? "animate-spin" : ""}`}
              />
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={(e) => {
                e.stopPropagation();
                clearLogs();
              }}
              className="h-6 px-2 text-[10px] gap-1 text-muted-foreground hover:text-destructive"
              title="Clear remote buffer"
            >
              <Trash2 className="w-3 h-3" />
            </Button>
          </div>

          {/* Log entries */}
          <div
            ref={scrollRef}
            style={{ height: "400px", overflowY: "auto" }}
            className="font-mono text-[11px]"
          >
            {logs.length === 0 && !initialLoading ? (
              <div className="p-6 text-center text-muted-foreground/70">
                <Terminal className="w-5 h-5 mx-auto mb-1.5 opacity-30" />
                <p className="text-[10px]">No log entries yet</p>
                <p className="text-[9px] mt-0.5">
                  Waiting for {service} to log something...
                </p>
              </div>
            ) : (
              logs.map((log, i) => {
                const id = `${log.timestamp}-${i}`;
                const isExpanded = expanded.has(id);
                const ts = new Date(log.timestamp);
                const tsStr =
                  ts.toLocaleTimeString(undefined, { hour12: false }) +
                  "." +
                  String(ts.getMilliseconds()).padStart(3, "0");
                const isMultiline =
                  log.message.includes("\n") || log.message.length > 100;
                return (
                  <div
                    key={id}
                    className={`border-l-2 border-b border-border/20 px-2 py-1 ${levelBg(log.level)}`}
                  >
                    <div
                      className={`flex items-start gap-2 ${isMultiline ? "cursor-pointer" : ""}`}
                      onClick={() => isMultiline && toggleExpand(id)}
                    >
                      <span className="text-muted-foreground/60 shrink-0 w-[85px]">
                        {tsStr}
                      </span>
                      <span
                        className={`shrink-0 w-[55px] font-bold ${levelColor(log.level)}`}
                      >
                        {log.level}
                      </span>
                      <span
                        className="text-muted-foreground/60 shrink-0 w-[120px] truncate"
                        title={log.logger}
                      >
                        {log.logger}
                      </span>
                      <span
                        className={`flex-1 ${isExpanded ? "whitespace-pre-wrap break-all" : "truncate"} text-foreground/90`}
                      >
                        {log.message}
                      </span>
                      {isMultiline && (
                        <span className="shrink-0 text-muted-foreground/60">
                          {isExpanded ? (
                            <ChevronUp className="w-3 h-3" />
                          ) : (
                            <ChevronDown className="w-3 h-3" />
                          )}
                        </span>
                      )}
                    </div>
                    {isExpanded && (
                      <div className="mt-1.5 pl-[165px] text-[10px] text-muted-foreground/80 space-y-1">
                        <div>
                          <span className="text-muted-foreground/60">
                            Logger:
                          </span>{" "}
                          <span className="font-mono">{log.logger}</span>
                        </div>
                        <div>
                          <span className="text-muted-foreground/60">
                            Time (UTC):
                          </span>{" "}
                          <span className="font-mono">{log.timestamp}</span>
                        </div>
                        <div>
                          <span className="text-muted-foreground/60">
                            Level:
                          </span>{" "}
                          <span
                            className={`font-mono font-bold ${levelColor(log.level)}`}
                          >
                            {log.level}
                          </span>
                        </div>
                        <div className="whitespace-pre-wrap break-all border-l border-border/40 pl-2 mt-1">
                          {log.message}
                        </div>
                      </div>
                    )}
                  </div>
                );
              })
            )}
            {initialLoading && logs.length === 0 && (
              <div className="p-3 text-center text-muted-foreground">
                <Loader2 className="w-3.5 h-3.5 animate-spin inline mr-1.5" />
                <span className="text-[10px]">Loading...</span>
              </div>
            )}
          </div>

          {/* Footer */}
          <div className="px-3 py-1 bg-background/30 border-t border-border/30 flex items-center justify-between text-[9px] text-muted-foreground/70">
            <span>
              Buffer: last 200 entries • Poll: {autoScroll ? "3s" : "5s"}
            </span>
            <span>Click long entries to expand</span>
          </div>
        </>
      )}
    </div>
  );
}
