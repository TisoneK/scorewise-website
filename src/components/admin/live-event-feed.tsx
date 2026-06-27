/**
 * LiveEventFeed — auto-scrolling list of recent events for the Overview tab.
 *
 * Extracted from src/app/page.tsx during Phase B modularization.
 *
 * Shows a merged feed of activity log entries + recent predictions,
 * color-coded by severity (info/success/warning/error). Each event shows
 * an icon, title, service badge, detail, and relative timestamp.
 */

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Skeleton } from "@/components/ui/skeleton";
import { Radio } from "lucide-react";
import type { FeedEvent } from "@/lib/admin/types";
import { severityIcon, severityColor } from "@/lib/admin/feed-helpers";
import { relativeTime } from "@/lib/admin/formatters";

export function LiveEventFeed({
  events,
  loading,
}: {
  events: FeedEvent[];
  loading: boolean;
}) {
  return (
    <Card className="bg-card/60 border-border/40 h-full flex flex-col">
      <CardHeader className="pb-3">
        <CardTitle className="text-sm font-semibold flex items-center gap-2">
          <Radio className="w-4 h-4 text-neon-green animate-pulse" />
          Live Event Feed
          <span className="ml-auto text-xs text-muted-foreground font-normal">
            {events.length} event{events.length === 1 ? "" : "s"}
          </span>
        </CardTitle>
      </CardHeader>
      <CardContent className="flex-1 overflow-hidden p-0">
        <ScrollArea className="h-[400px]">
          {loading && events.length === 0 ? (
            <div className="p-4 space-y-2">
              {Array.from({ length: 4 }).map((_, i) => (
                <div key={i} className="flex items-center gap-2">
                  <Skeleton className="w-3.5 h-3.5 rounded-full bg-muted/30" />
                  <Skeleton className="h-3 flex-1 bg-muted/30" />
                </div>
              ))}
            </div>
          ) : events.length === 0 ? (
            <div className="p-6 text-center">
              <Radio className="w-6 h-6 text-muted-foreground/30 mx-auto mb-2" />
              <p className="text-xs text-muted-foreground">No events yet</p>
              <p className="text-[10px] text-muted-foreground/70 mt-0.5">
                Activity will appear here in real time
              </p>
            </div>
          ) : (
            <div className="divide-y divide-border/20">
              {events.map((ev) => (
                <div
                  key={ev.id}
                  className={`flex items-start gap-2.5 px-3 py-2 hover:bg-card/80 border-l-2 ${severityColor(
                    ev.severity,
                  )}`}
                >
                  <div className="mt-0.5 shrink-0">
                    {severityIcon(ev.severity, ev.type)}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 text-xs">
                      <span className="font-medium text-foreground/90 truncate">
                        {ev.title}
                      </span>
                      {ev.service && (
                        <Badge
                          variant="outline"
                          className="text-[9px] border-border/50 text-muted-foreground capitalize shrink-0"
                        >
                          {ev.service}
                        </Badge>
                      )}
                    </div>
                    {ev.detail && (
                      <p className="text-[11px] text-muted-foreground truncate mt-0.5 font-mono">
                        {ev.detail}
                      </p>
                    )}
                  </div>
                  <span className="text-[10px] text-muted-foreground/70 font-mono shrink-0 mt-1">
                    {relativeTime(ev.timestamp)}
                  </span>
                </div>
              ))}
            </div>
          )}
        </ScrollArea>
      </CardContent>
    </Card>
  );
}
