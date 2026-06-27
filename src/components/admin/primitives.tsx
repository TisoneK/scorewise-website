/**
 * Small UI primitives used across the admin dashboard.
 *
 * Extracted from src/app/page.tsx during the Phase A modularization.
 */

import React from "react";
import { Card, CardContent } from "@/components/ui/card";

/**
 * Animated status dot — pulses with a glow for online/degraded/error states.
 * Used in service status rows.
 */
export function StatusDot({ status }: { status: string }) {
  const colors: Record<string, string> = {
    online: "bg-neon-green shadow-[0_0_6px_rgba(0,255,136,0.5)]",
    offline: "bg-muted-foreground/40",
    degraded: "bg-neon-yellow shadow-[0_0_6px_rgba(255,204,0,0.5)]",
    error: "bg-neon-red shadow-[0_0_6px_rgba(255,51,102,0.5)]",
  };
  return (
    <div
      className={`w-2.5 h-2.5 rounded-full ${colors[status] || colors.offline} animate-pulse`}
    />
  );
}

/**
 * KPI stat card — title, big value, icon, optional subtitle.
 * Used in the Overview tab's KPI row.
 */
export function StatCard({
  title,
  value,
  icon,
  color,
  sub,
}: {
  title: string;
  value: string | number;
  icon: React.ReactNode;
  color: string;
  sub?: string;
}) {
  return (
    <Card className="bg-card/50 border-border/30 hover-lift">
      <CardContent className="p-3.5">
        <div className="flex items-center justify-between mb-1.5">
          <span className="text-[10px] text-muted-foreground uppercase tracking-wider font-semibold">
            {title}
          </span>
          <div className={`${color} opacity-80`}>{icon}</div>
        </div>
        <p className="text-2xl font-black tracking-tight">{value}</p>
        {sub && <p className="text-[10px] text-muted-foreground mt-0.5 font-mono">{sub}</p>}
      </CardContent>
    </Card>
  );
}

/**
 * Tiny horizontal progress bar — used for showing proportions (e.g. OVER vs UNDER).
 */
export function MiniProgressBar({
  value,
  max,
  color,
}: {
  value: number;
  max: number;
  color: string;
}) {
  const pct = max > 0 ? Math.round((value / max) * 100) : 0;
  return (
    <div className="flex items-center gap-2">
      <div className="flex-1 h-1.5 bg-muted/50 rounded-full overflow-hidden">
        <div
          className={`h-full rounded-full ${color}`}
          style={{ width: `${pct}%` }}
        />
      </div>
      <span className="text-[10px] text-muted-foreground font-mono w-8 text-right">
        {pct}%
      </span>
    </div>
  );
}
