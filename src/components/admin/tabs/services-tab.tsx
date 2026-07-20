/**
 * ServicesTab — service management tab content (the largest tab).
 *
 * Extracted from src/app/page.tsx during Phase C modularization.
 *
 * Shows the Scraper card (status + trigger/stop/refresh + inline log stream),
 * the Engine card (status + reload/export/config + inline log stream),
 * a Pipeline Flow diagram, and an admin-only manual match entry form.
 */

"use client";

import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Progress } from "@/components/ui/progress";
import { Separator } from "@/components/ui/separator";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  RefreshCw,
  Loader2,
  Search,
  Cpu,
  Activity,
  Activity as ActivityIcon,
  Download,
  Settings,
  Play,
  Eye,
  AlertTriangle,
  CheckCircle2,
  XCircle,
  Database,
  ChevronRight,
  ChevronUp,
  ChevronDown,
  ZapOff,
  TestTube,
  Flame,
  TrendingUp,
  Info,
  RotateCcw,
  CalendarClock,
  Clock,
  Trophy,
} from "lucide-react";
import type {
  ServiceStatus,
  StoredPredictions,
  ServiceName,
} from "@/lib/types";
import { formatTime } from "@/lib/admin/formatters";
import { StatusDot } from "../primitives";
import { ServiceLogStream } from "../service-log-stream";

export interface ServicesTabProps {
  // Service status
  serviceStatus: {
    scraper: ServiceStatus;
    engine: ServiceStatus;
    scraperUrl: string;
    engineUrl: string;
  } | null;
  loadingStatus: boolean;
  fetchServiceStatus: () => void;
  // Scraper controls
  scraperDay: "Today" | "Tomorrow";
  setScraperDay: (v: "Today" | "Tomorrow") => void;
  scraperLoading: boolean;
  stopLoading: boolean;
  handleTriggerScraper: () => void;
  handleStopScraper: () => void;
  // Engine controls
  loadingPred: boolean;
  allPredictionsData: StoredPredictions | null;
  fetchAllPredictions: () => void;
  handleDownloadPredictions: () => void;
  // Config jump
  setSelectedService: (v: ServiceName) => void;
  // Admin-only manual match entry
  isAdmin: boolean;
  showManualEntry: boolean;
  setShowManualEntry: (v: boolean) => void;
  manualMatch: {
    match_id: string;
    home_team: string;
    away_team: string;
    match_total: string;
    over_odds: string;
    under_odds: string;
    home_odds: string;
    away_odds: string;
  };
  setManualMatch: (v: ServicesTabProps["manualMatch"]) => void;
  manualH2H: string;
  setManualH2H: (v: string) => void;
  manualLoading: boolean;
  handleManualSubmit: () => void;
}

export function ServicesTab({
  serviceStatus,
  loadingStatus,
  fetchServiceStatus,
  scraperDay,
  setScraperDay,
  scraperLoading,
  stopLoading,
  handleTriggerScraper,
  handleStopScraper,
  loadingPred,
  allPredictionsData,
  fetchAllPredictions,
  handleDownloadPredictions,
  setSelectedService,
  isAdmin,
  showManualEntry,
  setShowManualEntry,
  manualMatch,
  setManualMatch,
  manualH2H,
  setManualH2H,
  manualLoading,
  handleManualSubmit,
}: ServicesTabProps) {
  return (
    <>
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-bold">Service Management</h2>
          <p className="text-sm text-muted-foreground">Monitor and control the scraper and engine services</p>
        </div>
        <Button variant="outline" size="sm" onClick={fetchServiceStatus} disabled={loadingStatus} className="gap-1.5 border-border/50 text-muted-foreground hover:text-foreground">
          <RefreshCw className={`w-3.5 h-3.5 ${loadingStatus ? "animate-spin" : ""}`} /> Refresh Status
        </Button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Scraper card — full-width on mobile, half on desktop */}
        <Card className="bg-card/60 border-border/40">
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className={`w-2.5 h-2.5 rounded-full ${serviceStatus?.scraper?.status === "online" ? "bg-neon-green" : serviceStatus?.scraper?.status === "degraded" ? "bg-neon-yellow" : serviceStatus?.scraper?.status === "error" ? "bg-neon-red" : "bg-muted-foreground"} animate-pulse`} />
                <CardTitle className="text-base">FlashScore Scraper</CardTitle>
              </div>
              <div className="flex items-center gap-1.5">
                {serviceStatus?.scraper?.scraperStatus === "running" && (
                  <Badge className="bg-neon-yellow/15 text-neon-yellow border-neon-yellow/30 text-[10px] animate-pulse">
                    <Loader2 className="w-3 h-3 mr-1 animate-spin" />RUNNING
                  </Badge>
                )}
                <Badge variant="outline" className={
                  serviceStatus?.scraper?.status === "online" ? "border-neon-green/40 text-neon-green"
                    : serviceStatus?.scraper?.status === "degraded" ? "border-neon-yellow/40 text-neon-yellow"
                    : serviceStatus?.scraper?.status === "error" ? "border-neon-red/40 text-neon-red"
                    : "border-muted-foreground/30 text-muted-foreground"
                }>
                  {serviceStatus?.scraper?.status?.toUpperCase() || "UNKNOWN"}
                </Badge>
              </div>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* Stat blocks row */}
            <div className="grid grid-cols-3 gap-2">
              <div className="rounded-lg bg-background/50 border border-border/30 p-2.5 text-center">
                <div className="text-[10px] text-muted-foreground mb-0.5">HTTP</div>
                <div className={`text-lg font-bold font-mono ${serviceStatus?.scraper?.statusCode === 200 ? "text-neon-green" : "text-foreground"}`}>
                  {serviceStatus?.scraper?.statusCode ?? "—"}
                </div>
              </div>
              <div className="rounded-lg bg-background/50 border border-border/30 p-2.5 text-center">
                <div className="text-[10px] text-muted-foreground mb-0.5">STATE</div>
                <div className={`text-sm font-bold ${serviceStatus?.scraper?.scraperStatus === "idle" ? "text-neon-green" : serviceStatus?.scraper?.scraperStatus === "running" ? "text-neon-yellow" : serviceStatus?.scraper?.scraperStatus === "error" ? "text-neon-red" : "text-muted-foreground"}`}>
                  {serviceStatus?.scraper?.scraperStatus?.toUpperCase() || (serviceStatus?.scraper?.status === "online" ? "IDLE" : "N/A")}
                </div>
              </div>
              <div className="rounded-lg bg-background/50 border border-border/30 p-2.5 text-center">
                <div className="text-[10px] text-muted-foreground mb-0.5">SCRAPE</div>
                <div className="text-sm font-bold text-neon-yellow">
                  {serviceStatus?.scraper?.currentDay || serviceStatus?.scraper?.lastRun?.day || "—"}
                </div>
              </div>
            </div>

            {/* Last Run summary */}
            {serviceStatus?.scraper?.lastRun && (
              <div className={`rounded-lg border p-3 ${serviceStatus.scraper.lastRun.status === "success" ? "bg-neon-green/5 border-neon-green/20" : "bg-neon-red/5 border-neon-red/20"}`}>
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-1.5">
                    {serviceStatus.scraper.lastRun.status === "success"
                      ? <CheckCircle2 className="w-3.5 h-3.5 text-neon-green" />
                      : <XCircle className="w-3.5 h-3.5 text-neon-red" />}
                    <span className="text-xs font-semibold">Last Run</span>
                  </div>
                  {serviceStatus.scraper.lastRun.scrape_type && (
                    <Badge variant="outline" className="text-[9px] h-4 border-border/40">
                      {serviceStatus.scraper.lastRun.scrape_type === "scheduled" ? "Scheduled" : "Results"}
                    </Badge>
                  )}
                </div>
                <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs">
                  {serviceStatus.scraper.lastRun.status === "success" ? (
                    <>
                      <div><span className="text-muted-foreground">Complete: </span><span className="text-neon-green font-semibold">{serviceStatus.scraper.lastRun.complete_matches}</span></div>
                      <div><span className="text-muted-foreground">Skipped: </span><span className="text-neon-yellow font-semibold">{serviceStatus.scraper.lastRun.incomplete_matches}</span></div>
                    </>
                  ) : (
                    <div className="col-span-2 text-neon-red break-all">{serviceStatus.scraper.lastRun.error || "Failed"}</div>
                  )}
                  {serviceStatus.scraper.lastRun.started_at && (
                    <div><span className="text-muted-foreground">Started: </span><span className="font-mono">{new Date(serviceStatus.scraper.lastRun.started_at).toLocaleTimeString()}</span></div>
                  )}
                  {serviceStatus.scraper.lastRun.finished_at && serviceStatus.scraper.lastRun.started_at && (
                    <div><span className="text-muted-foreground">Duration: </span>
                      <span className="font-mono">
                        {(() => {
                          const start = new Date(serviceStatus.scraper.lastRun.started_at!).getTime();
                          const end = new Date(serviceStatus.scraper.lastRun.finished_at!).getTime();
                          const secs = Math.round((end - start) / 1000);
                          if (secs < 60) return `${secs}s`;
                          const mins = Math.floor(secs / 60);
                          const remSecs = secs % 60;
                          return `${mins}m ${remSecs}s`;
                        })()}
                      </span>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* No runs yet message */}
            {!serviceStatus?.scraper?.lastRun && serviceStatus?.scraper?.scraperStatus !== "running" && (
              <div className="rounded-lg border border-border/30 bg-background/30 p-3 text-center">
                <div className="text-xs text-muted-foreground">No scrape runs recorded yet</div>
              </div>
            )}

            {/* Live progress section when running */}
            {serviceStatus?.scraper?.scraperStatus === "running" && serviceStatus?.scraper?.progress && (
              <div className="rounded-lg border border-neon-yellow/20 bg-neon-yellow/5 p-3 space-y-2.5">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold text-neon-yellow flex items-center gap-1.5">
                    <Activity className="w-3.5 h-3.5" /> Live Progress
                  </span>
                  <span className="text-xs font-mono text-neon-yellow">
                    {serviceStatus.scraper.progress.current_match_index}/{serviceStatus.scraper.progress.total_matches || "?"}
                  </span>
                </div>
                <Progress
                  value={serviceStatus.scraper.progress.total_matches > 0
                    ? Math.round((serviceStatus.scraper.progress.current_match_index / serviceStatus.scraper.progress.total_matches) * 100)
                    : 0
                  }
                  className="h-2.5"
                />
                <div className="text-[11px] text-muted-foreground truncate">
                  {serviceStatus.scraper.progress.progress_message || serviceStatus.scraper.progress.status_message || "Processing..."}
                </div>
                <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-[11px] text-muted-foreground">
                  {serviceStatus.scraper.progress.day && (
                    <div><span className="text-muted-foreground/60">Day: </span>{serviceStatus.scraper.progress.day}</div>
                  )}
                  {serviceStatus.scraper.progress.started_at && (
                    <>
                      <div><span className="text-muted-foreground/60">Started: </span><span className="font-mono">{new Date(serviceStatus.scraper.progress.started_at).toLocaleTimeString()}</span></div>
                      <div><span className="text-muted-foreground/60">Elapsed: </span>
                        <span className="font-mono">
                          {(() => {
                            const start = new Date(serviceStatus.scraper.progress.started_at!).getTime();
                            const elapsed = Math.round((Date.now() - start) / 1000);
                            if (elapsed < 60) return `${elapsed}s`;
                            const mins = Math.floor(elapsed / 60);
                            const remSecs = elapsed % 60;
                            return `${mins}m ${remSecs}s`;
                          })()}
                        </span>
                      </div>
                    </>
                  )}
                  {serviceStatus.scraper.progress.scrape_id && (
                    <div className="col-span-2"><span className="text-muted-foreground/60">Run: </span><span className="font-mono text-[10px]">{serviceStatus.scraper.progress.scrape_id}</span></div>
                  )}
                </div>
                {serviceStatus.scraper.progress.stop_requested && (
                  <div className="flex items-center gap-1.5 text-[11px] text-neon-yellow">
                    <AlertTriangle className="w-3 h-3" /><span>Stop requested — finishing current match</span>
                  </div>
                )}
                {serviceStatus.scraper.progress.error && (
                  <div className="p-1.5 rounded bg-neon-red/10 border border-neon-red/20">
                    <span className="text-[11px] text-neon-red break-all">{serviceStatus.scraper.progress.error}</span>
                  </div>
                )}
              </div>
            )}

            <Separator className="bg-border/30" />
            {/* Service info */}
            <div className="space-y-1 text-xs text-muted-foreground">
              <div className="flex justify-between"><span>Endpoint</span><span className="font-mono text-[10px] truncate ml-2">{serviceStatus?.scraperUrl || "—"}</span></div>
            </div>

            {/* Rich scraper control cockpit (admin/operator): manual scheduled
                + results triggers, force, stop, and the autonomous schedulers.
                Replaces the old scheduled-only Run/Stop. */}
            {isAdmin && <ScraperControlPanel onAction={fetchServiceStatus} />}
            <div className={`grid ${isAdmin ? 'grid-cols-2' : 'grid-cols-1'} gap-2`}>
              {isAdmin && <Button variant="outline" onClick={() => { setSelectedService("scraper"); }} className="gap-2 border-neon-cyan/30 text-neon-cyan hover:bg-neon-cyan/10 text-xs">
                <Settings className="w-4 h-4" />Configure
              </Button>}
              <Button variant="outline" onClick={fetchServiceStatus} disabled={loadingStatus} className="gap-2 border-border/50 text-muted-foreground hover:text-foreground text-xs">
                <RefreshCw className={`w-4 h-4 ${loadingStatus ? "animate-spin" : ""}`} />Refresh
              </Button>
            </div>

            {/* Live log stream — polls /api/logs on the scraper, shows each match/event as it happens */}
            <div className="mt-2">
              <ServiceLogStream service="scraper" />
            </div>
          </CardContent>
        </Card>

        {/* Engine card */}
        <Card className="bg-card/60 border-border/40">
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className={`w-2.5 h-2.5 rounded-full ${serviceStatus?.engine?.status === "online" ? "bg-neon-green" : serviceStatus?.engine?.status === "error" ? "bg-neon-red" : serviceStatus?.engine?.status === "degraded" ? "bg-neon-yellow" : "bg-muted-foreground"} animate-pulse`} />
                <CardTitle className="text-base">ScoreWise Engine</CardTitle>
              </div>
              <Badge variant="outline" className={
                serviceStatus?.engine?.status === "online" ? "border-neon-green/40 text-neon-green"
                  : serviceStatus?.engine?.status === "error" ? "border-neon-red/40 text-neon-red"
                  : serviceStatus?.engine?.status === "degraded" ? "border-neon-yellow/40 text-neon-yellow"
                  : "border-muted-foreground/30 text-muted-foreground"
              }>
                {serviceStatus?.engine?.status?.toUpperCase() || "UNKNOWN"}
              </Badge>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* Stat blocks row */}
            <div className="grid grid-cols-3 gap-2">
              <div className="rounded-lg bg-background/50 border border-border/30 p-2.5 text-center">
                <div className="text-[10px] text-muted-foreground mb-0.5">HTTP</div>
                <div className={`text-lg font-bold font-mono ${serviceStatus?.engine?.statusCode === 200 ? "text-neon-green" : serviceStatus?.engine?.statusCode === 401 ? "text-neon-yellow" : "text-foreground"}`}>
                  {serviceStatus?.engine?.statusCode ?? "—"}
                </div>
              </div>
              <div className="rounded-lg bg-background/50 border border-border/30 p-2.5 text-center">
                <div className="text-[10px] text-muted-foreground mb-0.5">PREDICTIONS</div>
                <div className="text-lg font-bold text-neon-green">{allPredictionsData?.total ?? "—"}</div>
              </div>
              <div className="rounded-lg bg-background/50 border border-border/30 p-2.5 text-center">
                <div className="text-[10px] text-muted-foreground mb-0.5">SUCCESS</div>
                <div className="text-lg font-bold font-mono">
                  {allPredictionsData && allPredictionsData.total > 0
                    ? `${Math.round((allPredictionsData.succeeded / allPredictionsData.total) * 100)}%`
                    : "—"}
                </div>
              </div>
            </div>

            {/* Prediction health breakdown */}
            {allPredictionsData && allPredictionsData.total > 0 && (
              <div className="rounded-lg border border-neon-green/20 bg-neon-green/5 p-3">
                <div className="flex items-center gap-1.5 mb-2">
                  <CheckCircle2 className="w-3.5 h-3.5 text-neon-green" />
                  <span className="text-xs font-semibold">Prediction Health</span>
                </div>
                <div className="grid grid-cols-3 gap-2 text-xs text-center">
                  <div>
                    <div className="text-neon-green font-bold text-sm">{allPredictionsData.succeeded}</div>
                    <div className="text-muted-foreground text-[10px]">Succeeded</div>
                  </div>
                  <div>
                    <div className="text-neon-red font-bold text-sm">{allPredictionsData.failed}</div>
                    <div className="text-muted-foreground text-[10px]">Failed</div>
                  </div>
                  <div>
                    <div className="font-bold text-sm">{allPredictionsData.total}</div>
                    <div className="text-muted-foreground text-[10px]">Total</div>
                  </div>
                </div>
                {/* Mini progress bar showing success rate */}
                <div className="mt-2 h-1.5 rounded-full bg-muted overflow-hidden">
                  <div
                    className="h-full rounded-full bg-neon-green transition-all"
                    style={{ width: `${Math.round((allPredictionsData.succeeded / allPredictionsData.total) * 100)}%` }}
                  />
                </div>
              </div>
            )}

            {/* Last updated info */}
            <div className="space-y-1 text-xs text-muted-foreground">
              <div className="flex justify-between"><span>Last Updated</span><span className="font-mono">{formatTime(allPredictionsData?.updated_at)}</span></div>
              <div className="flex justify-between"><span>Source</span><span className="font-mono text-[10px] truncate ml-2">{allPredictionsData?.source || "N/A"}</span></div>
              <div className="flex justify-between"><span>Endpoint</span><span className="font-mono text-[10px] truncate ml-2">{serviceStatus?.engineUrl || "—"}</span></div>
            </div>

            <Separator className="bg-border/30" />
            <div className={`grid ${isAdmin ? 'grid-cols-2' : 'grid-cols-1'} gap-2`}>
              <Button variant="outline" onClick={fetchAllPredictions} disabled={loadingPred} className="gap-2 border-border/50 text-muted-foreground hover:text-foreground text-xs">
                <RefreshCw className={`w-4 h-4 ${loadingPred ? "animate-spin" : ""}`} />Reload
              </Button>
              {/* Pulls the engine store into the website DB — the recovery
                  path when the engine→website webhook is down during an
                  ingest. Does NOT scrape or re-ingest anything. */}
              <SyncFromEngineButton onSynced={fetchAllPredictions} />
              <Button variant="outline" onClick={handleDownloadPredictions} disabled={!allPredictionsData} className="gap-2 border-border/50 text-muted-foreground hover:text-foreground text-xs">
                <Download className="w-4 h-4" />Export
              </Button>
              {isAdmin && <Button variant="outline" onClick={() => { setSelectedService("engine"); }} className="gap-2 border-neon-cyan/30 text-neon-cyan hover:bg-neon-cyan/10 text-xs">
                <Settings className="w-4 h-4" />Config
              </Button>}
            </div>

            {/* Live log stream — polls /api/logs on the engine, shows ingest/predict/webhook events as they happen */}
            <div className="mt-2">
              <ServiceLogStream service="engine" />
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Pipeline flow */}
      <Card className="bg-card/60 border-border/40">
        <CardHeader className="pb-3"><CardTitle className="text-sm font-semibold">Data Pipeline</CardTitle></CardHeader>
        <CardContent>
          <div className="flex items-center justify-center gap-2 sm:gap-4 py-4 overflow-x-auto">
            <div className="flex flex-col items-center gap-1 min-w-[100px]">
              <div className="w-12 h-12 rounded-xl bg-neon-cyan/10 flex items-center justify-center"><Search className="w-6 h-6 text-neon-cyan" /></div>
              <span className="text-xs font-semibold">Scraper</span><StatusDot status={serviceStatus?.scraper?.status || "offline"} />
            </div>
            <ChevronRight className="w-5 h-5 text-muted-foreground/40 shrink-0" />
            <div className="flex flex-col items-center gap-1 min-w-[100px]">
              <div className="w-12 h-12 rounded-xl bg-neon-green/10 flex items-center justify-center"><Database className="w-6 h-6 text-neon-green" /></div>
              <span className="text-xs font-semibold">Engine</span><StatusDot status={serviceStatus?.engine?.status || "offline"} />
            </div>
            <ChevronRight className="w-5 h-5 text-muted-foreground/40 shrink-0" />
            <div className="flex flex-col items-center gap-1 min-w-[100px]">
              <div className="w-12 h-12 rounded-xl bg-neon-yellow/10 flex items-center justify-center"><Eye className="w-6 h-6 text-neon-yellow" /></div>
              <span className="text-xs font-semibold">Website</span><StatusDot status="online" />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Manual match entry (admin only) — Phase 6 */}
      {isAdmin && (
        <Card className="bg-card/60 border-border/40">
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-lg bg-neon-purple/10 flex items-center justify-center">
                  <TestTube className="w-4 h-4 text-neon-purple" />
                </div>
                <div>
                  <CardTitle className="text-sm font-semibold">Manual Match Entry</CardTitle>
                  <CardDescription className="text-xs">Bypass the scraper — submit a single match directly to the engine</CardDescription>
                </div>
              </div>
              <Button variant="outline" size="sm" onClick={() => setShowManualEntry(!showManualEntry)} className="gap-1.5 text-xs">
                {showManualEntry ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                {showManualEntry ? "Hide" : "Show"}
              </Button>
            </div>
          </CardHeader>
          {showManualEntry && (
            <CardContent className="space-y-4">
              <div className="rounded-lg border border-neon-cyan/20 bg-neon-cyan/5 p-2.5 text-[11px] text-muted-foreground">
                <Info className="w-3 h-3 inline mr-1 text-neon-cyan" />
                The match is sent to <code className="text-neon-cyan">POST /api/ingest</code> with <code className="text-neon-cyan">source="manual_entry"</code>.
                It runs the full prediction pipeline, merges into the store, and triggers the website webhook (cache invalidation + activity log).
              </div>

              {/* Required fields */}
              <div className="grid sm:grid-cols-3 gap-3">
                <div className="space-y-1.5">
                  <Label className="text-xs">Match ID <span className="text-neon-red">*</span></Label>
                  <Input
                    value={manualMatch.match_id}
                    onChange={(e) => setManualMatch({ ...manualMatch, match_id: e.target.value })}
                    placeholder="e.g. manual-2026-001"
                    className="h-9 text-xs bg-background/50"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">Home Team <span className="text-neon-red">*</span></Label>
                  <Input
                    value={manualMatch.home_team}
                    onChange={(e) => setManualMatch({ ...manualMatch, home_team: e.target.value })}
                    placeholder="e.g. Lakers"
                    className="h-9 text-xs bg-background/50"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">Away Team <span className="text-neon-red">*</span></Label>
                  <Input
                    value={manualMatch.away_team}
                    onChange={(e) => setManualMatch({ ...manualMatch, away_team: e.target.value })}
                    placeholder="e.g. Celtics"
                    className="h-9 text-xs bg-background/50"
                  />
                </div>
              </div>

              {/* Odds fields */}
              <div>
                <Label className="text-xs mb-1.5 block">Odds</Label>
                <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
                  <div className="space-y-1">
                    <Label className="text-[10px] text-muted-foreground">Match Total <span className="text-neon-red">*</span></Label>
                    <Input
                      type="number" step="0.5" min="0"
                      value={manualMatch.match_total}
                      onChange={(e) => setManualMatch({ ...manualMatch, match_total: e.target.value })}
                      placeholder="174.5"
                      className="h-9 text-xs bg-background/50"
                    />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-[10px] text-muted-foreground">Over Odds</Label>
                    <Input
                      type="number" step="0.01" min="0"
                      value={manualMatch.over_odds}
                      onChange={(e) => setManualMatch({ ...manualMatch, over_odds: e.target.value })}
                      placeholder="1.90"
                      className="h-9 text-xs bg-background/50"
                    />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-[10px] text-muted-foreground">Under Odds</Label>
                    <Input
                      type="number" step="0.01" min="0"
                      value={manualMatch.under_odds}
                      onChange={(e) => setManualMatch({ ...manualMatch, under_odds: e.target.value })}
                      placeholder="1.90"
                      className="h-9 text-xs bg-background/50"
                    />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-[10px] text-muted-foreground">Home Odds</Label>
                    <Input
                      type="number" step="0.01" min="0"
                      value={manualMatch.home_odds}
                      onChange={(e) => setManualMatch({ ...manualMatch, home_odds: e.target.value })}
                      placeholder="1.85"
                      className="h-9 text-xs bg-background/50"
                    />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-[10px] text-muted-foreground">Away Odds</Label>
                    <Input
                      type="number" step="0.01" min="0"
                      value={manualMatch.away_odds}
                      onChange={(e) => setManualMatch({ ...manualMatch, away_odds: e.target.value })}
                      placeholder="1.95"
                      className="h-9 text-xs bg-background/50"
                    />
                  </div>
                </div>
                <p className="text-[10px] text-muted-foreground mt-1">
                  Match total must end in <code className="text-neon-cyan">.5</code> — bookmaker lines cannot push.
                </p>
              </div>

              {/* H2H JSON (optional, power-user) */}
              <div className="space-y-1.5">
                <Label className="text-xs">
                  H2H Matches <span className="text-muted-foreground">(optional — JSON array)</span>
                </Label>
                <Textarea
                  value={manualH2H}
                  onChange={(e) => setManualH2H(e.target.value)}
                  placeholder={`[
  {
    "home_team": "Lakers",
    "away_team": "Celtics",
    "home_score": 112,
    "away_score": 108,
    "date": "2025-12-10"
  }
]`}
                  className="font-mono text-[11px] bg-background/50 min-h-[100px]"
                />
                <p className="text-[10px] text-muted-foreground">
                  Dates must be <code className="text-neon-cyan">YYYY-MM-DD</code>. Scores must be integers in [0, 300].
                </p>
              </div>

              {/* Actions */}
              <div className="flex justify-end gap-2 pt-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    setManualMatch({
                      match_id: "", home_team: "", away_team: "",
                      match_total: "", over_odds: "", under_odds: "", home_odds: "", away_odds: "",
                    });
                    setManualH2H("");
                  }}
                  className="text-xs"
                >
                  <RotateCcw className="w-3.5 h-3.5 mr-1" />Clear
                </Button>
                <Button
                  size="sm"
                  onClick={handleManualSubmit}
                  disabled={manualLoading}
                  className="gap-2 bg-neon-green/15 border border-neon-green/40 text-neon-green hover:bg-neon-green/25"
                >
                  {manualLoading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Play className="w-3.5 h-3.5" />}
                  Submit to Engine
                </Button>
              </div>
            </CardContent>
          )}
        </Card>
      )}

      {/* Last scrape report — the FULL match list from the most recent scrape,
          including matches that did NOT qualify for prediction and why. Only
          complete matches travel to the engine, so this panel is the only
          place admins can see the whole run. */}
      <LastScrapeReport />
    </>
  );
}

function SyncFromEngineButton({ onSynced }: { onSynced: () => void }) {
  const [syncing, setSyncing] = useState(false);
  const handleSync = async () => {
    setSyncing(true);
    try {
      const res = await fetch("/api/admin/engine/sync", { method: "POST" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
      toast.success(`Engine sync: ${data.fetched} fetched — ${data.stored} new, ${data.updated} updated${data.errors ? `, ${data.errors} errors` : ""}`);
      onSynced();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Engine sync failed");
    } finally {
      setSyncing(false);
    }
  };
  return (
    <Button variant="outline" onClick={handleSync} disabled={syncing} className="gap-2 border-neon-cyan/30 text-neon-cyan hover:bg-neon-cyan/10 text-xs">
      <RefreshCw className={`w-4 h-4 ${syncing ? "animate-spin" : ""}`} />Sync to DB
    </Button>
  );
}

interface ScrapeReportMatch {
  match_id?: string;
  home_team?: string;
  away_team?: string;
  country?: string;
  league?: string;
  date?: string;
  time?: string;
  status?: string;
  skip_reason?: string | null;
}

interface ScrapeReport {
  scrape_id?: string;
  day?: string;
  total_collected?: number;
  complete_matches?: number;
  incomplete_matches?: number;
  matches?: ScrapeReportMatch[];
  received_at?: string;
}

function LastScrapeReport() {
  const [report, setReport] = useState<ScrapeReport | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // No setState before the first await — the react-hooks lint rule forbids
  // synchronous setState inside an effect (loading starts true; the refresh
  // button sets it back to true itself before re-invoking).
  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/admin/logs?action=SCRAPE_REPORT&limit=1");
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      const row = data.logs?.[0];
      setReport(row ? (JSON.parse(row.details || "{}") as ScrapeReport) : null);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load scrape report");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
    // Reports arrive right after each scrape finishes — poll so the panel
    // updates without a manual refresh (same cadence as the user dashboard).
    const interval = setInterval(load, 60000);
    return () => clearInterval(interval);
  }, [load]);

  const matches = report?.matches || [];
  // Incomplete first — those are the ones needing an admin's eyes.
  const sorted = [...matches].sort((a, b) => (a.status === "complete" ? 1 : 0) - (b.status === "complete" ? 1 : 0));

  return (
    <Card className="bg-card/60 border-border/40">
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <div>
            <CardTitle className="text-sm">Last Scrape Report — every match, including non-qualifying</CardTitle>
            <CardDescription className="text-[11px]">
              {report
                ? `${report.day || "?"} · ${report.total_collected ?? matches.length} collected · ${report.complete_matches ?? 0} sent to engine · ${report.incomplete_matches ?? 0} did not qualify`
                : "No scrape report received yet — reports arrive automatically after each scrape (scraper redeploy required for older scraper builds)."}
            </CardDescription>
          </div>
          <Button variant="outline" size="sm" onClick={() => { setLoading(true); load(); }} disabled={loading} className="gap-1.5 border-border/50 text-muted-foreground hover:text-foreground">
            Refresh
          </Button>
        </div>
      </CardHeader>
      <CardContent className="pt-0">
        {error ? (
          <p className="text-xs text-neon-red">{error}</p>
        ) : loading ? (
          <p className="text-xs text-muted-foreground">Loading…</p>
        ) : matches.length === 0 ? null : (
          <ScrollArea className="max-h-72">
            <div className="space-y-1">
              {sorted.map((m, i) => (
                <div key={m.match_id || i} className={`flex items-start gap-2 text-[11px] rounded px-2 py-1 border ${m.status === "complete" ? "border-neon-green/15 bg-neon-green/5" : "border-neon-yellow/20 bg-neon-yellow/5"}`}>
                  {m.status === "complete"
                    ? <CheckCircle2 className="w-3 h-3 text-neon-green shrink-0 mt-0.5" />
                    : <XCircle className="w-3 h-3 text-neon-yellow shrink-0 mt-0.5" />}
                  <div className="min-w-0">
                    <span className="font-semibold">{m.home_team || "?"} vs {m.away_team || "?"}</span>
                    <span className="text-muted-foreground/70"> · {[m.league, m.country].filter(Boolean).join(", ") || "unknown league"} · {m.time || "—"}</span>
                    {m.status !== "complete" && (
                      <p className="text-neon-yellow/90 break-words">{m.skip_reason || "no reason recorded"}</p>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </ScrollArea>
        )}
      </CardContent>
    </Card>
  );
}

/**
 * ScraperControlPanel — the rich scraper cockpit for the Services tab.
 *
 * Manual triggers (kept alongside the scraper's autonomous schedulers):
 *   - Scheduled scrape: fetch matches + predict, Today/Tomorrow, optional force
 *   - Results scrape: fetch final scores for a date
 *   - Stop (kill all) + Resume queue
 * Autonomous schedulers (drive the site without manual clicks):
 *   - Scheduled-matches loop (every N hours) — enable + interval + day
 *   - Results loop (live/awaiting) — enable
 *
 * Everything is self-contained (its own fetches) so it needs no new props.
 * Admin/operator gated by the endpoints it calls.
 */
interface SchedulerState {
  results_scheduler?: { enabled?: boolean; running?: boolean; current_action?: string; matches_scraped?: number };
  scheduled_scraper?: { enabled?: boolean; running?: boolean; interval_hours?: number; day?: string; runs_triggered?: number; last_run?: string | null; next_run?: string | null; current_action?: string };
  config?: Record<string, unknown>;
}

function ScraperControlPanel({ onAction }: { onAction?: () => void }) {
  const [mode, setMode] = useState<"scheduled" | "results">("scheduled");
  const [day, setDay] = useState<"Today" | "Tomorrow">("Today");
  const [force, setForce] = useState(false);
  const [resultsDate, setResultsDate] = useState<string>(() => new Date().toISOString().slice(0, 10));
  const [busy, setBusy] = useState<string | null>(null); // which action is in-flight
  const [sched, setSched] = useState<SchedulerState | null>(null);
  const [schedErr, setSchedErr] = useState<string | null>(null);
  const [savingSched, setSavingSched] = useState(false);

  const loadSched = useCallback(async () => {
    try {
      const res = await fetch("/api/admin/scraper/schedule");
      if (!res.ok) { setSchedErr(`scheduler unreachable (HTTP ${res.status})`); return; }
      setSched(await res.json());
      setSchedErr(null);
    } catch {
      setSchedErr("scheduler unreachable");
    }
  }, []);

  useEffect(() => {
    loadSched();
    const id = setInterval(loadSched, 20000);
    return () => clearInterval(id);
  }, [loadSched]);

  const post = async (label: string, body: Record<string, unknown>) => {
    setBusy(label);
    try {
      const res = await fetch("/api/admin/scraper", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.message || data.error || `HTTP ${res.status}`);
      toast.success(data.message || `${label} triggered`);
      onAction?.();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : `${label} failed`);
    } finally {
      setBusy(null);
    }
  };

  const runScheduled = () => post("Scheduled scrape", { day, force });
  const runResults = () => {
    // scraper expects DD.MM.YYYY
    const [y, m, d] = resultsDate.split("-");
    if (!y || !m || !d) { toast.error("Pick a valid date"); return; }
    post("Results scrape", { operation: "scrape_results", date: `${d}.${m}.${y}` });
  };
  const stopAll = () => post("Stop", { operation: "kill_all" });
  const resumeQueue = () => post("Resume queue", { operation: "resume_queue" });

  // Push a full scheduler config (the scraper PUT wants the whole object).
  const putSched = async (patch: Record<string, unknown>) => {
    const rs = sched?.results_scheduler || {};
    const ss = sched?.scheduled_scraper || {};
    const cfg = (sched?.config || {}) as Record<string, unknown>;
    const payload = {
      results_enabled: rs.enabled ?? true,
      live_interval_seconds: (cfg.live_interval_seconds as number) ?? 60,
      awaiting_interval_seconds: (cfg.awaiting_interval_seconds as number) ?? 30,
      idle_interval_seconds: (cfg.idle_interval_seconds as number) ?? 120,
      scheduled_enabled: ss.enabled ?? true,
      scheduled_interval_hours: ss.interval_hours ?? 6,
      scheduled_day: ss.day ?? "Today",
      ...patch,
    };
    setSavingSched(true);
    try {
      const res = await fetch("/api/admin/scraper/schedule", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      toast.success("Scheduler updated");
      await loadSched();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Scheduler update failed");
    } finally {
      setSavingSched(false);
    }
  };

  const rs = sched?.results_scheduler;
  const ss = sched?.scheduled_scraper;
  const [intervalInput, setIntervalInput] = useState<string>("6");
  useEffect(() => { if (ss?.interval_hours != null) setIntervalInput(String(ss.interval_hours)); }, [ss?.interval_hours]);

  return (
    <div className="space-y-3">
      {/* ── Manual trigger ─────────────────────────────────────────── */}
      <div className="rounded-lg border border-border/40 bg-background/40 p-3 space-y-2.5">
        <div className="flex items-center gap-1.5 text-xs font-semibold">
          <Play className="w-3.5 h-3.5 text-neon-green" /> Manual trigger
        </div>
        {/* Mode segmented control */}
        <div className="flex gap-1 p-0.5 rounded-md bg-background border border-border/50 w-fit">
          <button
            onClick={() => setMode("scheduled")}
            className={`text-[11px] px-2.5 py-1 rounded flex items-center gap-1 ${mode === "scheduled" ? "bg-neon-green/15 text-neon-green font-bold" : "text-muted-foreground"}`}
          >
            <CalendarClock className="w-3 h-3" /> Scheduled (matches)
          </button>
          <button
            onClick={() => setMode("results")}
            className={`text-[11px] px-2.5 py-1 rounded flex items-center gap-1 ${mode === "results" ? "bg-neon-cyan/15 text-neon-cyan font-bold" : "text-muted-foreground"}`}
          >
            <Trophy className="w-3 h-3" /> Results (scores)
          </button>
        </div>

        {mode === "scheduled" ? (
          <div className="flex items-end gap-2 flex-wrap">
            <div>
              <Label className="text-[10px] text-muted-foreground">Day</Label>
              <Select value={day} onValueChange={(v) => setDay(v as "Today" | "Tomorrow")}>
                <SelectTrigger className="h-8 text-xs bg-background border-border/50 w-28"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="Today">Today</SelectItem>
                  <SelectItem value="Tomorrow">Tomorrow</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <label className="flex items-center gap-1.5 text-[11px] text-muted-foreground h-8">
              <Switch checked={force} onCheckedChange={setForce} aria-label="Force re-scrape" />
              Force <span title="Re-scrape matches already scraped (use after a code update)" className="text-muted-foreground/50">(re-do all)</span>
            </label>
            <Button size="sm" onClick={runScheduled} disabled={!!busy}
              className="h-8 gap-1.5 bg-neon-green/15 border border-neon-green/40 text-neon-green hover:bg-neon-green/25">
              {busy === "Scheduled scrape" ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Play className="w-3.5 h-3.5" />} Run
            </Button>
          </div>
        ) : (
          <div className="flex items-end gap-2 flex-wrap">
            <div>
              <Label className="text-[10px] text-muted-foreground">Date</Label>
              <Input type="date" value={resultsDate} onChange={(e) => setResultsDate(e.target.value)}
                className="h-8 text-xs bg-background border-border/50 w-40" />
            </div>
            <Button size="sm" onClick={runResults} disabled={!!busy}
              className="h-8 gap-1.5 bg-neon-cyan/15 border border-neon-cyan/40 text-neon-cyan hover:bg-neon-cyan/25">
              {busy === "Results scrape" ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Play className="w-3.5 h-3.5" />} Run
            </Button>
          </div>
        )}

        {/* Stop / resume */}
        <div className="flex gap-2 pt-1">
          <Button size="sm" variant="outline" onClick={stopAll} disabled={!!busy}
            className="h-8 gap-1.5 border-neon-red/30 text-neon-red hover:bg-neon-red/10">
            {busy === "Stop" ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <ZapOff className="w-3.5 h-3.5" />} Stop (kill all)
          </Button>
          <Button size="sm" variant="outline" onClick={resumeQueue} disabled={!!busy}
            className="h-8 gap-1.5 border-border/50 text-muted-foreground hover:text-foreground">
            {busy === "Resume queue" ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RotateCcw className="w-3.5 h-3.5" />} Resume queue
          </Button>
        </div>
      </div>

      {/* ── Autonomous schedulers ──────────────────────────────────── */}
      <div className="rounded-lg border border-border/40 bg-background/40 p-3 space-y-2.5">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-1.5 text-xs font-semibold">
            <Clock className="w-3.5 h-3.5 text-neon-cyan" /> Autonomous schedulers
          </div>
          {schedErr && <span className="text-[10px] text-neon-yellow">{schedErr}</span>}
        </div>

        {/* Scheduled-matches scheduler */}
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <div className="min-w-0">
            <div className="flex items-center gap-1.5 text-[11px] font-semibold">
              <CalendarClock className="w-3 h-3 text-neon-green" /> Scheduled matches
              <span className={`text-[9px] px-1.5 rounded-full border ${ss?.running ? "border-neon-green/40 text-neon-green bg-neon-green/5" : "border-border/40 text-muted-foreground"}`}>
                {ss?.running ? "RUNNING" : "OFF"}
              </span>
            </div>
            <p className="text-[10px] text-muted-foreground/70">
              every {ss?.interval_hours ?? 6}h · {ss?.day ?? "Today"} · {ss?.runs_triggered ?? 0} run(s)
              {ss?.next_run && ` · next ${new Date(ss.next_run).toLocaleTimeString()}`}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Input
              type="number" step="0.5" min="0.5" max="24"
              value={intervalInput}
              onChange={(e) => setIntervalInput(e.target.value)}
              onBlur={() => { const n = Number(intervalInput); if (n >= 0.5 && n <= 24 && n !== ss?.interval_hours) putSched({ scheduled_interval_hours: n }); }}
              disabled={savingSched}
              className="h-7 w-16 text-xs font-mono bg-background" aria-label="Scheduled interval hours"
            />
            <span className="text-[10px] text-muted-foreground">h</span>
            <Switch checked={!!ss?.enabled} disabled={savingSched}
              onCheckedChange={(v) => putSched({ scheduled_enabled: v })}
              aria-label="Toggle scheduled-matches scheduler" />
          </div>
        </div>

        <Separator className="bg-border/30" />

        {/* Results scheduler */}
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <div className="min-w-0">
            <div className="flex items-center gap-1.5 text-[11px] font-semibold">
              <Trophy className="w-3 h-3 text-neon-cyan" /> Results (live + awaiting)
              <span className={`text-[9px] px-1.5 rounded-full border ${rs?.running ? "border-neon-green/40 text-neon-green bg-neon-green/5" : "border-border/40 text-muted-foreground"}`}>
                {rs?.running ? "RUNNING" : "OFF"}
              </span>
            </div>
            <p className="text-[10px] text-muted-foreground/70">
              {rs?.current_action || "idle"} · {rs?.matches_scraped ?? 0} scraped
            </p>
          </div>
          <Switch checked={!!rs?.enabled} disabled={savingSched}
            onCheckedChange={(v) => putSched({ results_enabled: v })}
            aria-label="Toggle results scheduler" />
        </div>
      </div>
    </div>
  );
}
