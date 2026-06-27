/**
 * ServiceHealthCard + ServiceHealthBar — service health display for the Overview tab.
 *
 * Extracted from src/app/page.tsx during Phase B modularization.
 *
 * Each card shows a service's status with a 24-hour uptime bar, status badge,
 * optional predictions count, and optional last-run summary.
 */

import React from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { relativeTime } from "@/lib/admin/formatters";

/**
 * 24-segment uptime bar — each segment represents 1 hour.
 * Until we have actual uptime history, we render the current state across all
 * 24 segments (green=online, red=offline), with a pulse on the current hour.
 */
export function ServiceHealthBar({ online }: { online: boolean }) {
  const segments = Array.from({ length: 24 }, (_, i) => i);
  return (
    <div className="flex items-center gap-0.5">
      {segments.map((i) => (
        <div
          key={i}
          className={`h-4 flex-1 rounded-sm ${
            online ? "bg-neon-green/60" : "bg-destructive/60"
          } ${i === 23 ? "animate-pulse" : "opacity-70"}`}
          title={`${i}:00 - ${i + 1}:00 UTC`}
        />
      ))}
    </div>
  );
}

/**
 * A service health card — shows status + uptime bar + optional stats.
 * Used for the Scraper, Engine, and Website cards on the Overview tab.
 */
export function ServiceHealthCard({
  label,
  icon,
  status,
  predictions,
  lastRun,
}: {
  label: string;
  icon: React.ReactNode;
  status: string;
  predictions?: number;
  lastRun?: {
    complete_matches: number;
    incomplete_matches: number;
    started_at?: string | null;
    finished_at?: string | null;
  } | null;
}) {
  const online = status === "online";
  return (
    <Card
      className={`bg-card/60 border-border/40 ${
        online
          ? "border-l-2 border-l-neon-green/60"
          : "border-l-2 border-l-destructive/60"
      }`}
    >
      <CardContent className="p-3 space-y-2">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            {icon}
            <span className="text-xs font-semibold">{label}</span>
          </div>
          <Badge
            variant="outline"
            className={`text-[9px] ${
              online
                ? "border-neon-green/40 text-neon-green"
                : "border-destructive/40 text-destructive"
            }`}
          >
            {status.toUpperCase()}
          </Badge>
        </div>
        <ServiceHealthBar online={online} />
        <div className="grid grid-cols-2 gap-2 text-[10px] text-muted-foreground">
          <div>
            <span className="text-muted-foreground/60">24h status:</span>{" "}
            <span className={online ? "text-neon-green" : "text-destructive"}>
              {online ? "Operational" : "Down"}
            </span>
          </div>
          {typeof predictions === "number" && (
            <div className="text-right">
              <span className="text-muted-foreground/60">Predictions:</span>{" "}
              <span className="text-foreground font-mono">{predictions}</span>
            </div>
          )}
          {lastRun && (
            <div className="col-span-2 text-[10px] text-muted-foreground font-mono">
              Last run: {lastRun.complete_matches} ok /{" "}
              {lastRun.incomplete_matches} skipped
              {lastRun.started_at && ` · ${relativeTime(lastRun.started_at)}`}
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
