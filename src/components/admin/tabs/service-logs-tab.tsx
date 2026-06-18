/**
 * ServiceLogsTab — standalone full-page log viewer for scraper/engine.
 *
 * Extracted from src/app/page.tsx during Phase C modularization.
 *
 * Distinct from the inline ServiceLogStream component (which appears under
 * each service card on the Services tab). This is the dedicated "Service Logs"
 * tab with a larger viewport, separate search/filter controls, and a live
 * indicator.
 */

"use client";

import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Terminal,
  Search,
  Cpu,
  RefreshCw,
  Trash2,
  AlertTriangle,
  Loader2,
} from "lucide-react";
import type { ServiceLogEntry } from "@/lib/admin/types";

export interface ServiceLogsTabProps {
  svcLogsService: "scraper" | "engine";
  setSvcLogsService: (v: "scraper" | "engine") => void;
  svcLogs: ServiceLogEntry[];
  svcLogsLoading: boolean;
  svcLogsAutoRefresh: boolean;
  setSvcLogsAutoRefresh: (v: boolean) => void;
  svcLogsLevel: string;
  setSvcLogsLevel: (v: string) => void;
  svcLogsQuery: string;
  setSvcLogsQuery: (v: string) => void;
  svcLogsNewest: string | null;
  svcLogsError: string | null;
  fetchServiceLogs: (mode?: "initial" | "poll") => Promise<void>;
  clearServiceLogs: () => Promise<void>;
}

export function ServiceLogsTab({
  svcLogsService,
  setSvcLogsService,
  svcLogs,
  svcLogsLoading,
  svcLogsAutoRefresh,
  setSvcLogsAutoRefresh,
  svcLogsLevel,
  setSvcLogsLevel,
  svcLogsQuery,
  setSvcLogsQuery,
  svcLogsNewest,
  svcLogsError,
  fetchServiceLogs,
  clearServiceLogs,
}: ServiceLogsTabProps) {
  return (
    <>
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h2 className="text-lg font-bold flex items-center gap-2">
            <Terminal className="w-5 h-5 text-neon-cyan" />
            Service Logs
          </h2>
          <p className="text-sm text-muted-foreground">
            Live operational logs from the running scraper and engine services —
            no Railway dashboard needed.
          </p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <div className="flex bg-card/60 border border-border/40 rounded-md p-1 gap-1">
            <Button
              size="sm"
              variant={svcLogsService === "engine" ? "default" : "ghost"}
              className={`text-xs h-7 ${svcLogsService === "engine" ? "bg-neon-green/20 text-neon-green hover:bg-neon-green/30" : "text-muted-foreground"}`}
              onClick={() => setSvcLogsService("engine")}
            >
              <Cpu className="w-3.5 h-3.5" />Engine
            </Button>
            <Button
              size="sm"
              variant={svcLogsService === "scraper" ? "default" : "ghost"}
              className={`text-xs h-7 ${svcLogsService === "scraper" ? "bg-neon-cyan/20 text-neon-cyan hover:bg-neon-cyan/30" : "text-muted-foreground"}`}
              onClick={() => setSvcLogsService("scraper")}
            >
              <Search className="w-3.5 h-3.5" />Scraper
            </Button>
          </div>

          <Select value={svcLogsLevel} onValueChange={setSvcLogsLevel}>
            <SelectTrigger className="w-[120px] bg-card border-border/50 text-xs h-8">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="DEBUG">DEBUG+</SelectItem>
              <SelectItem value="INFO">INFO+</SelectItem>
              <SelectItem value="WARNING">WARNING+</SelectItem>
              <SelectItem value="ERROR">ERROR+</SelectItem>
            </SelectContent>
          </Select>

          <div className="flex items-center gap-2 bg-card/60 border border-border/40 rounded-md px-3 h-8">
            <Switch
              checked={svcLogsAutoRefresh}
              onCheckedChange={setSvcLogsAutoRefresh}
              className="scale-75"
            />
            <span className="text-xs text-muted-foreground">Auto</span>
          </div>

          <Button
            variant="outline"
            size="sm"
            onClick={() => fetchServiceLogs("poll")}
            disabled={svcLogsLoading}
            className="gap-1.5 border-border/50 text-muted-foreground hover:text-foreground h-8"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${svcLogsLoading ? "animate-spin" : ""}`} />
            Refresh
          </Button>

          <Button
            variant="outline"
            size="sm"
            onClick={clearServiceLogs}
            className="gap-1.5 border-border/50 text-muted-foreground hover:text-destructive h-8"
            title={`Clear ${svcLogsService} log buffer (in-memory only — does not affect on-disk logs)`}
          >
            <Trash2 className="w-3.5 h-3.5" />
            Clear
          </Button>
        </div>
      </div>

      {/* Search + stats row */}
      <div className="flex items-center gap-3 flex-wrap">
        <div className="relative flex-1 min-w-[200px] max-w-md">
          <Search className="absolute left-2 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            value={svcLogsQuery}
            onChange={(e) => setSvcLogsQuery(e.target.value)}
            placeholder={`Search ${svcLogsService} logs by message or logger...`}
            className="pl-8 h-8 text-xs bg-card border-border/50"
          />
        </div>
        <div className="flex items-center gap-3 text-xs text-muted-foreground">
          <span>
            {svcLogs.length} {svcLogs.length === 1 ? "entry" : "entries"}
          </span>
          {svcLogsNewest && (
            <span className="font-mono">
              last: {new Date(svcLogsNewest).toLocaleTimeString()}
            </span>
          )}
          {svcLogsAutoRefresh && (
            <span className="flex items-center gap-1 text-neon-green">
              <span className="w-1.5 h-1.5 rounded-full bg-neon-green animate-pulse" />
              Live
            </span>
          )}
        </div>
      </div>

      {/* Error banner */}
      {svcLogsError && (
        <div className="bg-destructive/10 border border-destructive/30 rounded-md p-3 flex items-start gap-2">
          <AlertTriangle className="w-4 h-4 text-destructive mt-0.5 shrink-0" />
          <div className="text-xs">
            <p className="font-medium text-destructive">
              Failed to fetch {svcLogsService} logs
            </p>
            <p className="text-muted-foreground font-mono mt-1">{svcLogsError}</p>
            <p className="text-muted-foreground mt-1">
              Check that the {svcLogsService} service is reachable from the
              website and that the API key is correct.
            </p>
          </div>
        </div>
      )}

      {/* Log viewer */}
      <Card className="bg-card/60 border-border/40">
        <CardContent className="p-0">
          {svcLogs.length === 0 && !svcLogsLoading ? (
            <div className="p-8 text-center">
              <Terminal className="w-8 h-8 text-muted-foreground/30 mx-auto mb-2" />
              <p className="text-sm text-muted-foreground">No log entries yet</p>
              <p className="text-xs text-muted-foreground/70 mt-1">
                {svcLogsAutoRefresh
                  ? `Waiting for ${svcLogsService} to log something...`
                  : `Auto-refresh is off. Click Refresh to fetch latest logs.`}
              </p>
            </div>
          ) : (
            <ScrollArea className="h-[600px]">
              <div className="font-mono text-xs">
                {svcLogs.map((log, i) => {
                  const ts = new Date(log.timestamp);
                  const tsStr =
                    ts.toLocaleTimeString(undefined, { hour12: false }) +
                    "." +
                    String(ts.getMilliseconds()).padStart(3, "0");
                  const levelColor =
                    log.level === "ERROR" || log.level === "CRITICAL"
                      ? "text-destructive"
                      : log.level === "WARNING"
                        ? "text-neon-yellow"
                        : log.level === "INFO"
                          ? "text-neon-green"
                          : "text-muted-foreground";
                  return (
                    <div
                      key={`${log.timestamp}-${i}`}
                      className="flex items-start gap-3 px-3 py-1 border-b border-border/20 hover:bg-card/80"
                    >
                      <span className="text-muted-foreground/70 shrink-0 w-[100px]">
                        {tsStr}
                      </span>
                      <span className={`shrink-0 w-[80px] font-bold ${levelColor}`}>
                        {log.level}
                      </span>
                      <span
                        className="text-muted-foreground/70 shrink-0 w-[160px] truncate"
                        title={log.logger}
                      >
                        {log.logger}
                      </span>
                      <span className="text-foreground/90 break-all whitespace-pre-wrap">
                        {log.message}
                      </span>
                    </div>
                  );
                })}
                {svcLogsLoading && svcLogs.length === 0 && (
                  <div className="p-4 text-center text-muted-foreground">
                    <Loader2 className="w-4 h-4 animate-spin inline mr-2" />
                    Loading {svcLogsService} logs...
                  </div>
                )}
              </div>
            </ScrollArea>
          )}
        </CardContent>
      </Card>

      <p className="text-xs text-muted-foreground/70">
        Buffer holds the last 1000 log entries on each service. New entries are
        appended to the bottom in real time. Clearing the buffer only affects
        this view — it does not delete on-disk log files.
      </p>
    </>
  );
}
