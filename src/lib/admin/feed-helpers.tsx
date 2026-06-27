/**
 * Helpers for rendering the Live Event Feed's severity icons + colors.
 *
 * Extracted from src/app/page.tsx during the Phase A modularization.
 */

import React from "react";
import {
  Target,
  Settings,
  Users,
  Server,
  XCircle,
  AlertTriangle,
  CheckCircle2,
  Activity as ActivityIcon,
} from "lucide-react";
import type { FeedEvent } from "./types";

/**
 * Pick an icon for a feed event based on its type + severity.
 * Type-specific icons take precedence (e.g. PREDICTION_* → Target icon).
 */
export function severityIcon(
  sev: FeedEvent["severity"],
  type: string,
): React.ReactNode {
  if (type.startsWith("PREDICTION_"))
    return <Target className="w-3.5 h-3.5 text-neon-green" />;
  if (type.startsWith("CONFIG_"))
    return <Settings className="w-3.5 h-3.5 text-neon-cyan" />;
  if (type.startsWith("USER_"))
    return <Users className="w-3.5 h-3.5 text-neon-yellow" />;
  if (type.startsWith("SERVICE_"))
    return <Server className="w-3.5 h-3.5 text-neon-green" />;
  if (sev === "error")
    return <XCircle className="w-3.5 h-3.5 text-destructive" />;
  if (sev === "warning")
    return <AlertTriangle className="w-3.5 h-3.5 text-neon-yellow" />;
  if (sev === "success")
    return <CheckCircle2 className="w-3.5 h-3.5 text-neon-green" />;
  return <ActivityIcon className="w-3.5 h-3.5 text-muted-foreground" />;
}

/**
 * Tailwind class for the left-border color of a feed event row,
 * based on its severity.
 */
export function severityColor(sev: FeedEvent["severity"]): string {
  if (sev === "error") return "border-l-destructive";
  if (sev === "warning") return "border-l-neon-yellow";
  if (sev === "success") return "border-l-neon-green";
  return "border-l-muted-foreground/50";
}
