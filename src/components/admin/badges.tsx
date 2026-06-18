/**
 * Reusable badge components for displaying prediction metadata.
 *
 * Extracted from src/app/page.tsx during the Phase A modularization.
 */

import React from "react";
import { Badge } from "@/components/ui/badge";
import { Shield, Zap, Activity, TrendingUp, TrendingDown } from "lucide-react";

/**
 * Badge showing the confidence level of a prediction (HIGH / MEDIUM / LOW).
 * Color-coded: green for HIGH, yellow for MEDIUM, red for LOW.
 * Returns null if level is null/undefined.
 */
export function ConfidenceBadge({ level }: { level: string | null }) {
  if (!level) return null;
  const up = level.toUpperCase();
  const styles: Record<string, string> = {
    HIGH: "bg-neon-green/15 text-neon-green border-neon-green/30",
    MEDIUM: "bg-neon-yellow/15 text-neon-yellow border-neon-yellow/30",
    LOW: "bg-neon-red/15 text-neon-red border-neon-red/30",
  };
  const icons: Record<string, React.ReactNode> = {
    HIGH: <Shield className="w-3 h-3" />,
    MEDIUM: <Zap className="w-3 h-3" />,
    LOW: <Activity className="w-3 h-3" />,
  };
  return (
    <Badge
      variant="outline"
      className={`gap-1 text-xs font-bold ${styles[up] || "border-border text-muted-foreground"}`}
    >
      {icons[up]}
      {up}
    </Badge>
  );
}

/**
 * Badge showing the recommendation (OVER / UNDER) for a prediction.
 * Color-coded: green for OVER, red for UNDER.
 * Returns a muted "—" badge if rec is null/undefined.
 */
export function RecommendationBadge({ rec }: { rec: string | null }) {
  if (!rec) return <Badge className="bg-muted text-muted-foreground">—</Badge>;
  const up = rec.toUpperCase();
  const isOver = up === "OVER";
  return (
    <Badge
      className={`text-sm font-black px-3 py-1 ${
        isOver
          ? "bg-neon-green/20 text-neon-green border border-neon-green/40"
          : "bg-neon-red/20 text-neon-red border border-neon-red/40"
      }`}
    >
      {isOver ? (
        <TrendingUp className="w-4 h-4 mr-1" />
      ) : (
        <TrendingDown className="w-4 h-4 mr-1" />
      )}
      {up}
    </Badge>
  );
}
