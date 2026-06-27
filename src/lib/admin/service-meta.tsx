/**
 * Service metadata — display info for each service (label, icon, color, description).
 *
 * Shared between the Configuration tab and the Services tab.
 */

import React from "react";
import { Search, Cpu, Globe } from "lucide-react";
import type { ServiceName } from "@/lib/types";

export const SERVICE_META: Record<
  ServiceName,
  { label: string; icon: React.ReactNode; color: string; description: string }
> = {
  scraper: {
    label: "FlashScore Scraper",
    icon: <Search className="w-5 h-5" />,
    color: "text-neon-cyan",
    description:
      "API-controlled scraper that collects basketball match data from FlashScore and posts to the Engine. Can be triggered manually from the dashboard.",
  },
  engine: {
    label: "ScoreWise Engine",
    icon: <Cpu className="w-5 h-5" />,
    color: "text-neon-green",
    description:
      "Prediction engine that processes match data and generates OVER/UNDER basketball predictions.",
  },
  website: {
    label: "Website (This App)",
    icon: <Globe className="w-5 h-5" />,
    color: "text-neon-yellow",
    description:
      "The ScoreWise web application — controls auto-refresh timing, display limits, and other frontend settings.",
  },
};
