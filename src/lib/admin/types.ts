/**
 * Shared types for the admin dashboard.
 *
 * Extracted from src/app/page.tsx during the Phase A modularization.
 * Some types are re-exported from src/lib/types for convenience.
 */

export type {
  StoredPredictions,
  Prediction,
  AppUser,
  UserRole,
  ServiceStatus,
  ServiceConfigEntry,
  ActivityLogEntry,
  ServiceName,
} from "@/lib/types";

/**
 * A unified event in the Overview tab's Live Event Feed.
 * Merges activity log entries + recent predictions into one stream.
 *
 * Produced by /api/admin/events/recent.
 */
export type FeedEvent = {
  id: string;
  timestamp: string;
  type: string;
  service: string | null;
  title: string;
  detail?: string;
  severity: "info" | "success" | "warning" | "error";
};

/**
 * A single log entry from the scraper or engine's /api/logs endpoint.
 * Used by ServiceLogStream and the standalone Service Logs tab.
 */
export type ServiceLogEntry = {
  timestamp: string;
  level: string;
  logger: string;
  message: string;
};

/**
 * Service filter type for the Configuration tab + Activity Log tab.
 */
export type LogServiceFilter = "all" | "scraper" | "engine" | "website";
