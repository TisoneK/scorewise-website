/**
 * ActivityLogTab — audit trail of all admin actions and config changes.
 *
 * Extracted from src/app/page.tsx during Phase C modularization.
 *
 * Shows a filterable table of activity log entries from the website's DB
 * (Turso). Each row shows action type, service, details, user, and time.
 */

"use client";

import React from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  RefreshCw,
  Loader2,
  FileText,
  Settings,
  Users,
  Server,
  Trophy,
  Ticket,
  DownloadCloud,
  Database,
  Activity as ActivityIcon,
} from "lucide-react";
import type { ActivityLogEntry } from "@/lib/types";
import { formatTime, renderLogDetails } from "@/lib/admin/formatters";

/** Pick an icon for an activity log entry based on its action. */
function actionIcon(action: string): React.ReactNode {
  if (action.startsWith("CONFIG_"))
    return <Settings className="w-4 h-4 text-neon-cyan" />;
  if (action.startsWith("USER_"))
    return <Users className="w-4 h-4 text-neon-yellow" />;
  if (action.startsWith("SERVICE_"))
    return <Server className="w-4 h-4 text-neon-green" />;
  if (action === "RESULT_UPDATE")
    return <Trophy className="w-4 h-4 text-neon-green" />;
  if (action === "BET_CODE_UPDATE")
    return <Ticket className="w-4 h-4 text-neon-cyan" />;
  if (action === "SCRAPER_RESULTS_PUSH")
    return <DownloadCloud className="w-4 h-4 text-neon-cyan" />;
  if (action === "ENGINE_PREDICTIONS_UPDATED" || action === "ENGINE_INGEST_COMPLETE")
    return <Database className="w-4 h-4 text-neon-green" />;
  return <ActivityIcon className="w-4 h-4 text-muted-foreground" />;
}

/** Pick a Tailwind class for an activity log entry's badge based on its action. */
function actionBadgeColor(action: string): string {
  if (action.includes("CREATE")) return "border-neon-green/40 text-neon-green";
  if (action.includes("UPDATE")) return "border-neon-cyan/40 text-neon-cyan";
  if (action.includes("DELETE")) return "border-neon-red/40 text-neon-red";
  if (action.includes("CHECK")) return "border-neon-yellow/40 text-neon-yellow";
  if (action.includes("TRIGGER")) return "border-neon-green/40 text-neon-green";
  return "border-border text-muted-foreground";
}

export interface ActivityLogTabProps {
  logs: ActivityLogEntry[];
  logsTotal: number;
  loadingLogs: boolean;
  logServiceFilter: string;
  setLogServiceFilter: (v: string) => void;
  fetchLogs: () => void;
}

export function ActivityLogTab({
  logs,
  logsTotal,
  loadingLogs,
  logServiceFilter,
  setLogServiceFilter,
  fetchLogs,
}: ActivityLogTabProps) {
  return (
    <>
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-bold">Activity Log</h2>
          <p className="text-sm text-muted-foreground">
            Audit trail of all admin actions and configuration changes
          </p>
        </div>
        <div className="flex gap-2">
          <Select value={logServiceFilter} onValueChange={setLogServiceFilter}>
            <SelectTrigger className="w-[140px] bg-card border-border/50 text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Services</SelectItem>
              <SelectItem value="scraper">Scraper</SelectItem>
              <SelectItem value="engine">Engine</SelectItem>
              <SelectItem value="website">Website</SelectItem>
            </SelectContent>
          </Select>
          <Button
            variant="outline"
            size="sm"
            onClick={fetchLogs}
            disabled={loadingLogs}
            className="gap-1.5 border-border/50 text-muted-foreground hover:text-foreground"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loadingLogs ? "animate-spin" : ""}`} />
            Refresh
          </Button>
        </div>
      </div>

      {/* Log stats */}
      <div className="grid grid-cols-3 gap-3">
        <div className="bg-card/60 border border-border/40 rounded-lg px-3 py-2 text-center">
          <p className="text-xl font-black">{logsTotal}</p>
          <p className="text-[10px] text-muted-foreground">Total Events</p>
        </div>
        <div className="bg-card/60 border border-neon-cyan/20 rounded-lg px-3 py-2 text-center">
          <p className="text-xl font-black text-neon-cyan">
            {logs.filter((l) => l.action.startsWith("CONFIG_")).length}
          </p>
          <p className="text-[10px] text-muted-foreground">Config Changes</p>
        </div>
        <div className="bg-card/60 border border-neon-yellow/20 rounded-lg px-3 py-2 text-center">
          <p className="text-xl font-black text-neon-yellow">
            {logs.filter((l) => l.action.startsWith("USER_")).length}
          </p>
          <p className="text-[10px] text-muted-foreground">User Actions</p>
        </div>
      </div>

      {/* Log entries */}
      <Card className="bg-card/60 border-border/40">
        <CardContent className="p-0">
          {loadingLogs ? (
            <div className="p-8 text-center">
              <Loader2 className="w-6 h-6 animate-spin text-muted-foreground mx-auto" />
            </div>
          ) : logs.length === 0 ? (
            <div className="p-8 text-center">
              <FileText className="w-8 h-8 text-muted-foreground/30 mx-auto mb-2" />
              <p className="text-sm text-muted-foreground">No activity recorded yet</p>
            </div>
          ) : (
            <ScrollArea className="max-h-[600px]">
              <div className="overflow-x-auto"><Table>
                <TableHeader>
                  <TableRow className="border-border/40 hover:bg-transparent">
                    <TableHead className="text-xs w-[40px]">Type</TableHead>
                    <TableHead className="text-xs w-[150px]">Action</TableHead>
                    <TableHead className="text-xs w-[90px]">Service</TableHead>
                    <TableHead className="text-xs">Details</TableHead>
                    <TableHead className="text-xs w-[130px]">User</TableHead>
                    <TableHead className="text-xs w-[160px]">Time</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {logs.map((log) => {
                    let details: Record<string, unknown> = {};
                    try {
                      details = JSON.parse(log.details || "{}");
                    } catch {
                      // ignore parse errors
                    }
                    return (
                      <TableRow
                        key={log.id}
                        className="border-border/20 hover:bg-card/80"
                      >
                        <TableCell>{actionIcon(log.action)}</TableCell>
                        <TableCell>
                          <Badge
                            variant="outline"
                            className={`text-[10px] ${actionBadgeColor(log.action)}`}
                          >
                            {log.action}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          {log.service ? (
                            <Badge
                              variant="outline"
                              className="text-[10px] border-border text-muted-foreground capitalize"
                            >
                              {log.service}
                            </Badge>
                          ) : (
                            "—"
                          )}
                        </TableCell>
                        <TableCell className="text-xs text-muted-foreground font-mono max-w-[300px] truncate">
                          {renderLogDetails(log.action, details)}
                        </TableCell>
                        <TableCell className="text-xs">
                          <span className="text-muted-foreground">
                            {log.user?.name || log.user?.email || "—"}
                          </span>
                        </TableCell>
                        <TableCell className="text-xs text-muted-foreground font-mono">
                          {formatTime(log.createdAt)}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table></div>
            </ScrollArea>
          )}
        </CardContent>
      </Card>
    </>
  );
}
