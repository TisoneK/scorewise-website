/**
 * PipelineFlow — visual flow of items through Scrape → Ingest → Predict → Push.
 *
 * Extracted from src/app/page.tsx during Phase B modularization.
 *
 * Each stage shows a count of items that have passed through. Drops between
 * stages (e.g. scraper pushed 12 but engine only ingested 10) immediately
 * reveal where data is being lost.
 */

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Search,
  Download,
  Cpu,
  Globe,
  ArrowRight,
  Activity as ActivityIcon,
} from "lucide-react";

export function PipelineFlow({
  scrapeCount,
  ingestCount,
  predictCount,
  pushCount,
}: {
  scrapeCount: number;
  ingestCount: number;
  predictCount: number;
  pushCount: number;
}) {
  const steps = [
    {
      label: "Scrape",
      count: scrapeCount,
      icon: <Search className="w-3.5 h-3.5" />,
      color: "text-neon-cyan",
      border: "border-neon-cyan/40",
      bg: "bg-neon-cyan/10",
    },
    {
      label: "Ingest",
      count: ingestCount,
      icon: <Download className="w-3.5 h-3.5" />,
      color: "text-neon-yellow",
      border: "border-neon-yellow/40",
      bg: "bg-neon-yellow/10",
    },
    {
      label: "Predict",
      count: predictCount,
      icon: <Cpu className="w-3.5 h-3.5" />,
      color: "text-neon-green",
      border: "border-neon-green/40",
      bg: "bg-neon-green/10",
    },
    {
      label: "Push",
      count: pushCount,
      icon: <Globe className="w-3.5 h-3.5" />,
      color: "text-neon-purple",
      border: "border-neon-purple/40",
      bg: "bg-neon-purple/10",
    },
  ];
  return (
    <Card className="bg-card/60 border-border/40">
      <CardHeader className="pb-3">
        <CardTitle className="text-sm font-semibold flex items-center gap-2">
          <ActivityIcon className="w-4 h-4 text-neon-cyan" />
          Pipeline Flow
          <span className="ml-auto text-[10px] text-muted-foreground font-normal">
            Last 24h
          </span>
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="flex items-center gap-2">
          {steps.map((s, i) => (
            <div key={s.label} className="flex items-center gap-2 flex-1">
              <div
                className={`flex-1 rounded-md border ${s.border} ${s.bg} px-3 py-2 flex items-center gap-2`}
              >
                {s.icon}
                <div className="flex-1 min-w-0">
                  <div className="text-[10px] text-muted-foreground">
                    {s.label}
                  </div>
                  <div className={`text-base font-bold ${s.color}`}>
                    {s.count}
                  </div>
                </div>
              </div>
              {i < steps.length - 1 && (
                <ArrowRight className="w-4 h-4 text-muted-foreground/50 shrink-0" />
              )}
            </div>
          ))}
        </div>
        <p className="text-[10px] text-muted-foreground/70 mt-3">
          Each stage shows the count of items that have passed through in the
          last 24 hours. Drops between stages indicate failures (e.g. scraper
          pushed 12 but engine only ingested 10).
        </p>
      </CardContent>
    </Card>
  );
}
