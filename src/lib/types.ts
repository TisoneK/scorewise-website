export interface WinningStreakData {
  home_team_h2h_wins: number;
  away_team_h2h_wins: number;
  home_team_recent_wins: number;
  away_team_recent_wins: number;
  home_team_winning_streak: number;
  away_team_winning_streak: number;
  total_h2h_matches: number;
}

export interface Prediction {
  match_id: string;
  home_team?: string;
  away_team?: string;
  country?: string;
  league?: string;
  date?: string;
  time?: string;
  over_odds?: number | null;
  under_odds?: number | null;
  // Reduced-risk (alternative) lines — only for Totals (O/U)
  reduced_over_total?: number | null;
  reduced_over_odds?: number | null;
  reduced_under_total?: number | null;
  reduced_under_odds?: number | null;
  home_odds?: number | null;
  away_odds?: number | null;
  scope: string;
  success: boolean;
  validation_errors: string[];
  recommendation: string | null;
  team_winner: string | null;
  recommendation_confidence: string | null;
  team_winner_confidence: string | null;
  confidence: string | null;
  bookmaker_line: number | null;
  average_rate: number;
  matches_above: number;
  matches_below: number;
  decrement_test: number;
  increment_test: number;
  h2h_totals: number[];
  rate_values: number[];
  winning_streak_data: WinningStreakData | null;
  bet_code: string | null;
  home_score: number | null;
  away_score: number | null;
  result_status: "PENDING" | "LIVE" | "FINAL" | "POSTPONED" | "CANCELLED" | null;
  result_source: "manual" | "scraper" | null;
  result_updated_at: string | null;
  created_at: string | null;
}

export interface StoredPredictions {
  updated_at: string;
  source: string | null;
  total: number;
  succeeded: number;
  failed: number;
  predictions: Prediction[];
}

export type ConfidenceLevel = "HIGH" | "MEDIUM" | "LOW";
export type Recommendation = "OVER" | "UNDER";
export type UserRole = "ADMIN" | "OPERATOR" | "USER";

export interface AppUser {
  id: string;
  email: string;
  name: string | null;
  role: UserRole;
  createdAt: string;
}

export interface ServiceStatus {
  status: "online" | "offline" | "error" | "degraded";
  statusCode?: number | null;
  message?: string;
  // Scraper-specific fields
  scraperStatus?: "idle" | "running" | "error" | "unknown";
  lastRun?: {
    status: string;
    error?: string | null;
    scrape_type?: string | null;
    day?: string | null;
    date?: string | null;
    complete_matches: number;
    incomplete_matches: number;
    started_at?: string | null;
    finished_at?: string | null;
  } | null;
  currentDay?: string | null;
  progress?: {
    busy: boolean;
    scrape_id?: string | null;
    scrape_type?: string | null;
    day?: string | null;
    started_at?: string | null;
    current_match_index: number;
    total_matches: number;
    complete_matches: number;
    incomplete_matches: number;
    progress_message?: string | null;
    status_message?: string | null;
    stop_requested: boolean;
    error?: string | null;
  } | null;
  predictions?: number;
}

export interface ServiceConfigEntry {
  id: string;
  service: string;
  key: string;
  value: string;
  secret: boolean;
  _hasValue: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface ActivityLogEntry {
  id: string;
  userId: string;
  action: string;
  service: string | null;
  details: string | null;
  createdAt: string;
  user: {
    email: string;
    name: string | null;
  };
}

export type ServiceName = "scraper" | "engine" | "website";
