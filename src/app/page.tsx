"use client";

import { useEffect, useState, useMemo, useCallback, useRef } from "react";
import { useSession, signIn, signOut } from "next-auth/react";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter, DialogClose } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { Progress } from "@/components/ui/progress";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import {
  PieChart, Pie, Cell, BarChart, Bar, XAxis, YAxis, Tooltip as RTooltip,
  ResponsiveContainer, RadarChart, PolarGrid, PolarAngleAxis, PolarRadiusAxis, Radar,
  AreaChart, Area, CartesianGrid, Legend,
} from "recharts";
import {
  Search, RefreshCw, TrendingUp, TrendingDown, Minus, Shield, Zap, Activity,
  Clock, Filter, Users, Settings, Database, Server, Play, Download,
  Eye, Trash2, UserPlus, LogOut, BarChart3, AlertTriangle, CheckCircle2,
  XCircle, Loader2, Lock, ChevronRight, ArrowUpRight, ArrowDownRight,
  Target, Percent, Layers, Cpu, Wifi, WifiOff, GitBranch, Timer,
  Calendar, ZapOff, Flame, Gauge, BarChart2, PieChart as PieIcon,
  Save, Plus, X, EyeOff, TestTube, FileText, Globe, Key, Link, Trophy,
  ChevronDown, ChevronUp, Copy, RotateCcw, ExternalLink, Info, Upload,
  Terminal, Maximize2, Radio, Pause,
  Activity as ActivityIcon, ArrowRight, Ticket,
} from "lucide-react";
import type { StoredPredictions, Prediction, AppUser, UserRole, ServiceStatus, ServiceConfigEntry, ActivityLogEntry, ServiceName } from "@/lib/types";

// Phase A modularization — extracted leaf components + helpers
import { BasketballIcon } from "@/components/admin/icons";
import { ConfidenceBadge, RecommendationBadge } from "@/components/admin/badges";
import { StatCard, StatusDot, MiniProgressBar } from "@/components/admin/primitives";
import { formatTime, relativeTime, maskDisplay, renderLogDetails } from "@/lib/admin/formatters";
import { severityIcon, severityColor } from "@/lib/admin/feed-helpers";
import type { FeedEvent, ServiceLogEntry } from "@/lib/admin/types";
// Phase B modularization — extracted composite components
import { LiveEventFeed } from "@/components/admin/live-event-feed";
import { ServiceHealthCard, ServiceHealthBar } from "@/components/admin/service-health-card";
import { PipelineFlow } from "@/components/admin/pipeline-flow";
import { PredictionDetailDrawer } from "@/components/admin/prediction-detail-drawer";
import { ServiceLogStream } from "@/components/admin/service-log-stream";
// Phase E modularization — extracted auth pages + user view
import { SignInPage, SignupPage } from "@/components/admin/auth-pages";
import { UserPredictionsView } from "@/components/admin/user-predictions-view";
// Phase C modularization — extracted tab content components
import { OverviewTab } from "@/components/admin/tabs/overview-tab";
import { PredictionsTab } from "@/components/admin/tabs/predictions-tab";
import { AnalyticsTab } from "@/components/admin/tabs/analytics-tab";
import { ServicesTab } from "@/components/admin/tabs/services-tab";
import { ConfigurationTab } from "@/components/admin/tabs/configuration-tab";
import { ActivityLogTab } from "@/components/admin/tabs/activity-log-tab";
import { ServiceLogsTab } from "@/components/admin/tabs/service-logs-tab";
import { UsersTab } from "@/components/admin/tabs/users-tab";
import { BetslipCodesTab } from "@/components/admin/tabs/betslip-codes-tab";
import { ResultsTab } from "@/components/admin/tabs/results-tab";

// ===================== CONFIG =====================

type ConfFilter = "ALL" | "HIGH" | "MEDIUM" | "LOW";
type RecFilter = "ALL" | "OVER" | "UNDER";

// ===================== SUB-COMPONENTS =====================

// All sub-components extracted to src/components/admin/ during Phases A-E:
//   - PredictionCard, PredictionCardSkeleton → prediction-card.tsx
//   - SignInPage, SignupPage                → auth-pages.tsx
//   - UserPredictionsView                   → user-predictions-view.tsx
//   - LiveEventFeed, ServiceHealthCard, PipelineFlow,
//     PredictionDetailDrawer, ServiceLogStream → live-event-feed.tsx, etc.
//   - All 8 tabs                             → tabs/*.tsx


// All sub-components (LiveEventFeed, ServiceHealthCard, PipelineFlow,
// PredictionDetailDrawer, ServiceLogStream) extracted to src/components/admin/
// during Phase B modularization.

// ===================== ADMIN DASHBOARD =====================

function AdminDashboard() {
  // --- Get current user's role ---
  const { data: adminSession } = useSession();
  const currentUserRole = (adminSession?.user as { role: string })?.role || "USER";
  const isAdmin = currentUserRole === "ADMIN";
  const isOperatorOrAbove = currentUserRole === "ADMIN" || currentUserRole === "OPERATOR";

  // --- Prediction state ---
  const [allPredictionsData, setAllPredictionsData] = useState<StoredPredictions | null>(null);
  const [loadingPred, setLoadingPred] = useState(false);

  // --- Service status state ---
  const [serviceStatus, setServiceStatus] = useState<{
    scraper: ServiceStatus;
    engine: ServiceStatus;
    scraperUrl: string;
    engineUrl: string;
  } | null>(null);
  const [loadingStatus, setLoadingStatus] = useState(false);
  const [scraperLoading, setScraperLoading] = useState(false);
  const [scraperDay, setScraperDay] = useState<"Today" | "Tomorrow">("Today");
  const [stopLoading, setStopLoading] = useState(false);

  // --- Manual match entry state (admin-only, Services tab) ---
  const [manualMatch, setManualMatch] = useState({
    match_id: "",
    home_team: "",
    away_team: "",
    match_total: "",
    over_odds: "",
    under_odds: "",
    home_odds: "",
    away_odds: "",
  });
  const [manualH2H, setManualH2H] = useState<string>("");
  const [manualLoading, setManualLoading] = useState(false);
  const [showManualEntry, setShowManualEntry] = useState(false);

  // --- Users state ---
  const [users, setUsers] = useState<AppUser[]>([]);
  const [loadingUsers, setLoadingUsers] = useState(false);
  const [addUserOpen, setAddUserOpen] = useState(false);
  const [newUserEmail, setNewUserEmail] = useState("");
  const [newUserName, setNewUserName] = useState("");
  const [newUserPassword, setNewUserPassword] = useState("");
  const [newUserRole, setNewUserRole] = useState<UserRole>("USER");
  const [creatingUser, setCreatingUser] = useState(false);
  const [changingRole, setChangingRole] = useState<string | null>(null);

  // --- Configuration state ---
  const [configs, setConfigs] = useState<ServiceConfigEntry[]>([]);
  const [loadingConfigs, setLoadingConfigs] = useState(false);
  const [selectedService, setSelectedService] = useState<ServiceName>("engine");
  const [editingConfig, setEditingConfig] = useState<string | null>(null);
  const [editValue, setEditValue] = useState("");
  const [savingConfig, setSavingConfig] = useState(false);
  const [revealedSecrets, setRevealedSecrets] = useState<Set<string>>(new Set());
  const [addConfigOpen, setAddConfigOpen] = useState(false);
  const [newConfigKey, setNewConfigKey] = useState("");
  const [newConfigValue, setNewConfigValue] = useState("");
  const [newConfigSecret, setNewConfigSecret] = useState(false);
  const [testResult, setTestResult] = useState<{ service: string; success: boolean; message: string; status?: string } | null>(null);
  const [testingService, setTestingService] = useState(false);
  // Push-to-service state (Phase: Configuration tab enhancement)
  const [pushingService, setPushingService] = useState<string | null>(null);
  const [pushResult, setPushResult] = useState<{ service: string; pushed: string[]; failed: { key: string; error: string }[]; message?: string } | null>(null);
  const [remoteConfigs, setRemoteConfigs] = useState<Record<string, { key: string; value: string; has_override: boolean; is_secret: boolean }[]>>({});

  // --- Activity logs state ---
  const [logs, setLogs] = useState<ActivityLogEntry[]>([]);
  const [logsTotal, setLogsTotal] = useState(0);
  const [loadingLogs, setLoadingLogs] = useState(false);
  const [logServiceFilter, setLogServiceFilter] = useState<string>("all");

  // --- Service logs state (live operational logs from scraper/engine) ---
  type ServiceLogEntry = { timestamp: string; level: string; logger: string; message: string };
  type ServiceLogService = "scraper" | "engine";
  const [svcLogsService, setSvcLogsService] = useState<ServiceLogService>("engine");
  const [svcLogs, setSvcLogs] = useState<ServiceLogEntry[]>([]);
  const [svcLogsLoading, setSvcLogsLoading] = useState(false);
  const [svcLogsAutoRefresh, setSvcLogsAutoRefresh] = useState(true);
  const [svcLogsLevel, setSvcLogsLevel] = useState<string>("INFO");
  const [svcLogsQuery, setSvcLogsQuery] = useState<string>("");
  const [svcLogsSince, setSvcLogsSince] = useState<string | null>(null);
  const [svcLogsNewest, setSvcLogsNewest] = useState<string | null>(null);
  const [svcLogsError, setSvcLogsError] = useState<string | null>(null);

  // --- Live event feed state (Overview command center) ---
  const [feedEvents, setFeedEvents] = useState<FeedEvent[]>([]);
  const [feedLoading, setFeedLoading] = useState(false);

  // --- Prediction detail drawer state ---
  const [drawerPrediction, setDrawerPrediction] = useState<Prediction | null>(null);

  // --- Computed values ---
  const preds = allPredictionsData?.predictions || [];
  const totalPreds = preds.length;
  const successCount = preds.filter(p => p.success).length;
  const failCount = totalPreds - successCount;
  const successRate = totalPreds > 0 ? Math.round((successCount / totalPreds) * 100) : 0;
  const highConf = preds.filter(p => p.confidence?.toUpperCase() === "HIGH").length;
  const overRecs = preds.filter(p => p.recommendation?.toUpperCase() === "OVER").length;
  const underRecs = preds.filter(p => p.recommendation?.toUpperCase() === "UNDER").length;

  const serviceConfigs = useMemo(() => configs.filter(c => c.service === selectedService), [configs, selectedService]);

  // --- Fetch functions ---
  const fetchAllPredictions = useCallback(async () => {
    setLoadingPred(true);
    try {
      const res = await fetch("/api/admin/engine");
      if (!res.ok) throw new Error("Failed to fetch");
      const data = await res.json();
      if (data.error) throw new Error(data.error);
      setAllPredictionsData(data);
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Failed to fetch predictions");
    } finally {
      setLoadingPred(false);
    }
  }, []);

  const fetchServiceStatus = useCallback(async () => {
    setLoadingStatus(true);
    try {
      const res = await fetch("/api/admin/scraper");
      if (!res.ok) throw new Error("Failed to fetch status");
      const data = await res.json();
      if (data.error) throw new Error(data.error);
      setServiceStatus(data);
    } catch {
      toast.error("Failed to check service status");
    } finally {
      setLoadingStatus(false);
    }
  }, []);

  const fetchUsers = useCallback(async () => {
    setLoadingUsers(true);
    try {
      const res = await fetch("/api/admin/users");
      if (!res.ok) throw new Error("Failed to fetch users");
      const data = await res.json();
      setUsers(data.users || []);
    } catch {
      toast.error("Failed to fetch users");
    } finally {
      setLoadingUsers(false);
    }
  }, []);

  const fetchConfigs = useCallback(async () => {
    setLoadingConfigs(true);
    try {
      const res = await fetch("/api/admin/config");
      if (!res.ok) throw new Error("Failed to fetch configs");
      const data = await res.json();
      setConfigs(data.configs || []);
    } catch {
      toast.error("Failed to fetch configuration");
    } finally {
      setLoadingConfigs(false);
    }
  }, []);

  const fetchLogs = useCallback(async () => {
    setLoadingLogs(true);
    try {
      const params = new URLSearchParams();
      params.set("limit", "100");
      if (logServiceFilter !== "all") params.set("service", logServiceFilter);
      const res = await fetch(`/api/admin/logs?${params}`);
      if (!res.ok) throw new Error("Failed to fetch logs");
      const data = await res.json();
      setLogs(data.logs || []);
      setLogsTotal(data.total || 0);
    } catch {
      toast.error("Failed to fetch activity logs");
    } finally {
      setLoadingLogs(false);
    }
  }, [logServiceFilter]);

  // --- Service logs fetch (live operational logs from scraper/engine) ---
  const fetchServiceLogs = useCallback(async (mode: "initial" | "poll" = "poll") => {
    setSvcLogsLoading(true);
    setSvcLogsError(null);
    try {
      const params = new URLSearchParams({
        service: svcLogsService,
        limit: "200",
        level: svcLogsLevel,
      });
      if (svcLogsQuery.trim()) params.set("q", svcLogsQuery.trim());
      if (mode === "poll" && svcLogsSince) params.set("since", svcLogsSince);
      const res = await fetch(`/api/admin/logs/stream?${params.toString()}`);
      if (!res.ok) {
        const errBody = await res.json().catch(() => ({}));
        throw new Error(errBody?.error || `HTTP ${res.status}`);
      }
      const data = await res.json();
      const incoming: ServiceLogEntry[] = Array.isArray(data?.logs) ? data.logs : [];
      if (mode === "initial" || !svcLogsSince) {
        setSvcLogs(incoming);
      } else {
        // Append only new entries to keep existing scroll position stable.
        // Dedupe by composite key — the backend uses `>=` for the since
        // filter, so each poll re-returns the last entry from the previous
        // response. Without dedupe, single log lines get duplicated per poll.
        setSvcLogs((prev) => {
          const seen = new Set(prev.map(l => `${l.timestamp}|${l.level}|${l.logger}|${l.message}`));
          const fresh = incoming.filter(l => !seen.has(`${l.timestamp}|${l.level}|${l.logger}|${l.message}`));
          if (fresh.length === 0) return prev;
          return [...prev, ...fresh].slice(-500);
        });
      }
      if (incoming.length > 0) {
        const newest = incoming[incoming.length - 1].timestamp;
        setSvcLogsNewest(newest);
        setSvcLogsSince(newest);
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      setSvcLogsError(msg);
    } finally {
      setSvcLogsLoading(false);
    }
  }, [svcLogsService, svcLogsLevel, svcLogsQuery, svcLogsSince]);

  // --- Live event feed fetch (Overview command center) ---
  const fetchFeedEvents = useCallback(async () => {
    try {
      const res = await fetch("/api/admin/events/recent?limit=30");
      if (!res.ok) return;
      const data = await res.json();
      setFeedEvents(data.events || []);
    } catch {
      // Silent fail — feed is non-critical
    } finally {
      setFeedLoading(false);
    }
  }, []);

  // --- Init ---
  useEffect(() => {
    fetchAllPredictions();
    fetchServiceStatus();
    fetchUsers();
    fetchConfigs();
    fetchFeedEvents();
  }, [fetchAllPredictions, fetchServiceStatus, fetchUsers, fetchConfigs, fetchFeedEvents]);

  // Live event feed: auto-poll every 15s
  useEffect(() => {
    const id = setInterval(() => {
      fetchFeedEvents();
    }, 15000);
    return () => clearInterval(id);
  }, [fetchFeedEvents]);

  useEffect(() => {
    fetchLogs();
  }, [fetchLogs]);

  // Service logs: reset buffer + refetch on service / level change
  useEffect(() => {
    setSvcLogs([]);
    setSvcLogsSince(null);
    setSvcLogsNewest(null);
    setSvcLogsError(null);
    fetchServiceLogs("initial");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [svcLogsService, svcLogsLevel]);

  // Service logs: manual search trigger (debounced via explicit dependency)
  useEffect(() => {
    const t = setTimeout(() => {
      setSvcLogs([]);
      setSvcLogsSince(null);
      fetchServiceLogs("initial");
    }, 400);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [svcLogsQuery]);

  // Service logs: auto-refresh polling every 3s when enabled
  useEffect(() => {
    if (!svcLogsAutoRefresh) return;
    const id = setInterval(() => {
      fetchServiceLogs("poll");
    }, 3000);
    return () => clearInterval(id);
  }, [svcLogsAutoRefresh, fetchServiceLogs]);

  // Service logs: clear buffer on remote service
  const clearServiceLogs = useCallback(async () => {
    try {
      const res = await fetch(`/api/admin/logs/stream?service=${svcLogsService}`, { method: "DELETE" });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      setSvcLogs([]);
      setSvcLogsSince(null);
      setSvcLogsNewest(null);
      toast.success(`${svcLogsService} log buffer cleared`);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      toast.error(`Failed to clear ${svcLogsService} logs: ${msg}`);
    }
  }, [svcLogsService]);

  useEffect(() => {
    fetchLogs();
  }, [fetchLogs]);

  // Auto-poll scraper status when it's running
  useEffect(() => {
    if (serviceStatus?.scraper?.scraperStatus !== "running") return;
    const interval = setInterval(() => {
      fetchServiceStatus();
    }, 5000); // Poll every 5s while running
    return () => clearInterval(interval);
  }, [serviceStatus?.scraper?.scraperStatus, fetchServiceStatus]);

  // Auto-refresh predictions + service status every 30s so the dashboard
  // picks up new predictions after a scrape finishes (without the user
  // having to click Reload manually).
  useEffect(() => {
    const id = setInterval(() => {
      fetchAllPredictions();
      fetchServiceStatus();
    }, 30000);
    return () => clearInterval(id);
  }, [fetchAllPredictions, fetchServiceStatus]);

  // --- Handlers ---
  const handleTriggerScraper = async () => {
    setScraperLoading(true);
    try {
      const res = await fetch("/api/admin/scraper", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ day: scraperDay }),
      });
      const data = await res.json();
      if (data.status === "triggered") {
        toast.success(`Scrape started for ${data.day}`, { description: `Run ID: ${data.run_id}` });
      } else if (data.status === "online") {
        toast.success("Scraper is online");
      } else if (data.status === "offline") {
        toast.warning("Scraper is unreachable", { description: data.message || "The scraper may not have the API server deployed yet." });
      } else if (data.status === "error") {
        toast.error("Scraper error", { description: data.message });
      } else {
        toast.info("Scraper response", { description: data.message || JSON.stringify(data) });
      }
      fetchServiceStatus();
    } catch {
      toast.error("Failed to trigger scraper");
    } finally {
      setScraperLoading(false);
    }
  };

  const handleStopScraper = async () => {
    setStopLoading(true);
    try {
      const res = await fetch("/api/admin/scraper/stop", { method: "POST", signal: AbortSignal.timeout(10000) });
      const data = await res.json();
      if (res.ok && data.success) {
        toast.success("Stop signal sent", { description: data.message || "Scraper will stop after current match" });
      } else {
        toast.error("Failed to stop scraper", { description: data.message || data.error || `HTTP ${res.status}` });
      }
      fetchServiceStatus();
    } catch {
      toast.error("Could not reach server to stop scraper");
    } finally {
      setStopLoading(false);
    }
  };

  // --- Manual match entry → POST /api/admin/engine ---
  // Builds a single-match ingest payload and forwards to the engine. The
  // engine stores the prediction + fires Phase 4 webhooks back to us (cache
  // invalidation + activity log). See /api/admin/engine/route.ts for validation.
  const handleManualSubmit = async () => {
    // Client-side validation mirroring the server-side checks
    const matchId = manualMatch.match_id.trim();
    const homeTeam = manualMatch.home_team.trim();
    const awayTeam = manualMatch.away_team.trim();
    if (!matchId || !homeTeam || !awayTeam) {
      toast.error("Missing required fields", { description: "Match ID, Home Team, and Away Team are required" });
      return;
    }

    const matchTotal = parseFloat(manualMatch.match_total);
    if (!isFinite(matchTotal) || matchTotal <= 0) {
      toast.error("Invalid match total", { description: "Match total must be a positive number" });
      return;
    }
    if (Math.abs((matchTotal % 1) - 0.5) > 1e-9) {
      toast.error("Match total must end in .5", { description: "Bookmaker lines must end in .5 (e.g. 174.5, 217.5)" });
      return;
    }

    // Parse optional odds — empty string means "not provided"
    const parseOptionalOdds = (s: string): number | undefined => {
      const t = s.trim();
      if (!t) return undefined;
      const n = parseFloat(t);
      return isFinite(n) && n > 0 ? n : undefined;
    };

    const odds: Record<string, number> = { match_total: matchTotal };
    const overOdds = parseOptionalOdds(manualMatch.over_odds);
    const underOdds = parseOptionalOdds(manualMatch.under_odds);
    const homeOdds = parseOptionalOdds(manualMatch.home_odds);
    const awayOdds = parseOptionalOdds(manualMatch.away_odds);
    if (overOdds !== undefined) odds.over_odds = overOdds;
    if (underOdds !== undefined) odds.under_odds = underOdds;
    if (homeOdds !== undefined) odds.home_odds = homeOdds;
    if (awayOdds !== undefined) odds.away_odds = awayOdds;

    // Parse optional H2H JSON
    let h2hMatches: unknown = [];
    if (manualH2H.trim()) {
      try {
        h2hMatches = JSON.parse(manualH2H);
        if (!Array.isArray(h2hMatches)) {
          throw new Error("H2H must be a JSON array");
        }
      } catch (e) {
        toast.error("Invalid H2H JSON", { description: e instanceof Error ? e.message : "Could not parse JSON" });
        return;
      }
    }

    const payload = {
      match_id: matchId,
      home_team: homeTeam,
      away_team: awayTeam,
      odds,
      h2h_matches: h2hMatches,
    };

    setManualLoading(true);
    try {
      const res = await fetch("/api/admin/engine", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
        signal: AbortSignal.timeout(30000),
      });
      const data = await res.json();

      if (!res.ok) {
        const detail = data.detail || data.error || `HTTP ${res.status}`;
        toast.error("Engine rejected the submission", { description: detail });
        return;
      }

      const eng = data.engine_response || {};
      const succeeded = eng.succeeded ?? 0;
      const failed = eng.failed ?? 0;

      if (succeeded > 0) {
        toast.success("Prediction generated", {
          description: `${homeTeam} vs ${awayTeam} — succeeded: ${succeeded}, failed: ${failed}, store total: ${eng.store_total ?? "?"}`,
        });
      } else {
        toast.warning("Match submitted but prediction failed", {
          description: "The engine stored the match but its validation pipeline rejected it. Check engine logs for details.",
        });
      }

      // Clear form + collapse card on success
      setManualMatch({
        match_id: "", home_team: "", away_team: "",
        match_total: "", over_odds: "", under_odds: "", home_odds: "", away_odds: "",
      });
      setManualH2H("");
      setShowManualEntry(false);

      // Refresh predictions list — the engine webhook will also fire and
      // invalidate the cache, but we proactively refresh for instant feedback.
      fetchAllPredictions();
    } catch (e) {
      toast.error("Failed to submit match", {
        description: e instanceof Error ? e.message : "Could not reach the engine",
      });
    } finally {
      setManualLoading(false);
    }
  };

  const handleDownloadPredictions = () => {
    if (!allPredictionsData) return;
    const blob = new Blob([JSON.stringify(allPredictionsData, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = `scorewise-predictions-${new Date().toISOString().slice(0, 10)}.json`; a.click();
    URL.revokeObjectURL(url);
  };

  const handleCreateUser = async () => {
    if (!newUserEmail || !newUserPassword) { toast.error("Email and password are required"); return; }
    setCreatingUser(true);
    try {
      const res = await fetch("/api/admin/users", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: newUserEmail, name: newUserName, password: newUserPassword, role: newUserRole }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to create user");
      toast.success("User created successfully");
      setAddUserOpen(false);
      setNewUserEmail(""); setNewUserName(""); setNewUserPassword(""); setNewUserRole("USER");
      fetchUsers();
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Failed to create user");
    } finally {
      setCreatingUser(false);
    }
  };

  const handleChangeRole = async (userId: string, newRole: UserRole) => {
    setChangingRole(userId);
    try {
      const res = await fetch("/api/admin/users", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId, newRole }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to change role");
      toast.success(`Role changed to ${newRole}`);
      fetchUsers();
    } catch (e: any) {
      toast.error(e.message || "Failed to change role");
    } finally {
      setChangingRole(null);
    }
  };

  const handleDeleteUser = async (userId: string, email: string) => {
    if (!confirm(`Delete user ${email}?`)) return;
    try {
      const res = await fetch("/api/admin/users", { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ userId }) });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to delete");
      toast.success("User deleted");
      fetchUsers();
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Failed to delete user");
    }
  };

  // --- Config handlers ---
  const handleSaveConfig = async (configId: string, service: string, key: string, value: string, secret: boolean) => {
    setSavingConfig(true);
    try {
      const res = await fetch("/api/admin/config", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ service, key, value, secret }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to save config");
      toast.success(`Saved ${key} for ${service}`);
      setEditingConfig(null);
      setEditValue("");
      fetchConfigs();
      fetchServiceStatus();
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Failed to save config");
    } finally {
      setSavingConfig(false);
    }
  };

  const handleAddConfig = async () => {
    if (!newConfigKey) { toast.error("Key is required"); return; }
    setSavingConfig(true);
    try {
      const res = await fetch("/api/admin/config", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ service: selectedService, key: newConfigKey, value: newConfigValue, secret: newConfigSecret }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to add config");
      toast.success(`Added ${newConfigKey} for ${selectedService}`);
      setAddConfigOpen(false);
      setNewConfigKey(""); setNewConfigValue(""); setNewConfigSecret(false);
      fetchConfigs();
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Failed to add config");
    } finally {
      setSavingConfig(false);
    }
  };

  const handleDeleteConfig = async (service: string, key: string) => {
    if (!confirm(`Delete config "${key}" from ${service}?`)) return;
    try {
      const res = await fetch("/api/admin/config", { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ service, key }) });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to delete");
      toast.success(`Deleted ${key}`);
      fetchConfigs();
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Failed to delete config");
    }
  };

  const handleTestConnection = async (service: ServiceName) => {
    setTestingService(true);
    setTestResult(null);
    try {
      const res = await fetch("/api/admin/config", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ service, testType: "connection" }),
      });
      const data = await res.json();
      setTestResult({ service, success: data.success, message: data.message, status: data.status });
      if (data.success) toast.success(`${service} connection OK`, { description: data.message });
      else toast.error(`${service} connection failed`, { description: data.message });
    } catch (err: unknown) {
      setTestResult({ service, success: false, message: "Connection test failed" });
      toast.error("Connection test failed");
    } finally {
      setTestingService(false);
    }
  };

  // Push website DB config values to engine/scraper
  const handlePushConfig = async (service: "engine" | "scraper", keys?: string[]) => {
    // If keys not provided, push ALL keys for the currently-selected service
    let keysToPush = keys;
    if (!keysToPush) {
      keysToPush = serviceConfigs
        .filter(c => c.service === service)
        .map(c => `${c.service}:${c.key}`);
    }
    if (keysToPush.length === 0) {
      toast.error("No config keys to push", { description: `Add some variables under the ${service} service first.` });
      return;
    }
    setPushingService(service);
    setPushResult(null);
    try {
      const res = await fetch("/api/admin/config/push", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ service, keys: keysToPush }),
      });
      const data = await res.json();
      if (!res.ok) {
        setPushResult({ service, pushed: [], failed: [], message: data.error || `HTTP ${res.status}` });
        toast.error(`Push to ${service} failed`, { description: data.error || `HTTP ${res.status}` });
        return;
      }
      setPushResult(data);
      if (data.pushed?.length > 0 && data.failed?.length === 0) {
        toast.success(`Pushed ${data.pushed.length} key${data.pushed.length === 1 ? "" : "s"} to ${service}`, {
          description: data.pushed.join(", "),
        });
      } else if (data.pushed?.length > 0 && data.failed?.length > 0) {
        toast.warning(`Partial push to ${service}`, {
          description: `${data.pushed.length} succeeded, ${data.failed.length} failed`,
        });
      } else if (data.unreachable) {
        toast.error(`Could not reach ${service}`, { description: data.message });
      } else if (data.failed?.length > 0) {
        toast.error(`Push to ${service} failed`, {
          description: data.failed.map((f: { key: string; error: string }) => `${f.key}: ${f.error}`).join("; "),
        });
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Network error";
      setPushResult({ service, pushed: [], failed: [], message: msg });
      toast.error(`Push to ${service} failed`, { description: msg });
    } finally {
      setPushingService(null);
    }
  };

  // Fetch current values FROM engine/scraper (for side-by-side comparison)
  const handleFetchRemoteConfig = async (service: "engine" | "scraper") => {
    try {
      const res = await fetch(`/api/admin/config/push?service=${service}`, { method: "GET" });
      const data = await res.json();
      if (!res.ok) {
        toast.error(`Failed to fetch ${service} config`, { description: data.error });
        return;
      }
      setRemoteConfigs(prev => ({ ...prev, [service]: data.configs || [] }));
      toast.success(`Loaded live config from ${service}`, { description: `${data.total ?? 0} keys` });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Network error";
      toast.error(`Failed to fetch ${service} config`, { description: msg });
    }
  };

  const toggleReveal = (id: string) => {
    setRevealedSecrets(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  // --- Chart data ---


  return (
    <div className="min-h-screen bg-background flex flex-col">
      <header className="border-b border-border/40 bg-card/60 backdrop-blur-md sticky top-0 z-40">
        <div className="max-w-7xl mx-auto px-3 sm:px-4 h-12 sm:h-14 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="flex items-center justify-center w-8 h-8 rounded-lg bg-neon-green/10 border border-neon-green/20">
              <BasketballIcon className="w-4 h-4 text-neon-green" />
            </div>
            <span className="font-black text-lg tracking-tight">ScoreWise</span>
            <Badge className={`ml-1 text-[10px] font-bold ${isAdmin ? "bg-neon-green/15 text-neon-green border-neon-green/30" : "bg-neon-yellow/15 text-neon-yellow border-neon-yellow/30"}`}>
              {isAdmin ? <Shield className="w-3 h-3 mr-1" /> : <Eye className="w-3 h-3 mr-1" />}{currentUserRole}
            </Badge>
          </div>
          <div className="flex items-center gap-1.5">
            <Button variant="ghost" size="sm" onClick={() => { fetchAllPredictions(); fetchServiceStatus(); if (isAdmin) { fetchConfigs(); fetchLogs(); } }} className="gap-1.5 text-muted-foreground hover:text-foreground">
              <RefreshCw className="w-3.5 h-3.5" /><span className="hidden sm:inline">Refresh</span>
            </Button>
            <Button variant="ghost" size="sm" onClick={() => signOut()} className="gap-1.5 text-muted-foreground hover:text-foreground">
              <LogOut className="w-4 h-4" /><span className="hidden sm:inline">Sign Out</span>
            </Button>
          </div>
        </div>
      </header>

      <main className="flex-1 max-w-7xl mx-auto px-3 sm:px-4 py-4 sm:py-6 w-full">
        <Tabs defaultValue="overview" className="space-y-6">
          <div className="overflow-x-auto">
            <div className="overflow-x-auto -mx-3 px-3 sm:mx-0 sm:px-0 pb-1">
            <TabsList className="bg-card/40 border border-border/30 p-1 h-auto flex-nowrap gap-0.5 inline-flex">
              <TabsTrigger value="overview" className="gap-1 text-xs data-[state=active]:bg-neon-green/10 data-[state=active]:text-neon-green rounded-md whitespace-nowrap">
                <Gauge className="w-3.5 h-3.5" />Overview
              </TabsTrigger>
              <TabsTrigger value="predictions" className="gap-1 text-xs data-[state=active]:bg-neon-green/10 data-[state=active]:text-neon-green rounded-md whitespace-nowrap">
                <Database className="w-3.5 h-3.5" />Predictions
              </TabsTrigger>
              {isOperatorOrAbove && (
                <TabsTrigger value="betslip-codes" className="gap-1 text-xs data-[state=active]:bg-neon-cyan/10 data-[state=active]:text-neon-cyan rounded-md whitespace-nowrap">
                  <Ticket className="w-3.5 h-3.5" />Betslip Codes
                </TabsTrigger>
              )}
              {isOperatorOrAbove && (
                <TabsTrigger value="results" className="gap-1 text-xs data-[state=active]:bg-neon-green/10 data-[state=active]:text-neon-green rounded-md whitespace-nowrap">
                  <Trophy className="w-3.5 h-3.5" />Results
                </TabsTrigger>
              )}
              <TabsTrigger value="analytics" className="gap-1 text-xs data-[state=active]:bg-neon-green/10 data-[state=active]:text-neon-green rounded-md whitespace-nowrap">
                <BarChart3 className="w-3.5 h-3.5" />Analytics
              </TabsTrigger>
              <TabsTrigger value="services" className="gap-1 text-xs data-[state=active]:bg-neon-green/10 data-[state=active]:text-neon-green rounded-md whitespace-nowrap">
                <Server className="w-3.5 h-3.5" />Services
              </TabsTrigger>
              {isAdmin && (
                <TabsTrigger value="configuration" className="gap-1 text-xs data-[state=active]:bg-neon-cyan/10 data-[state=active]:text-neon-cyan rounded-md whitespace-nowrap">
                  <Settings className="w-3.5 h-3.5" />Config
              </TabsTrigger>
            )}
            {isAdmin && (
              <TabsTrigger value="logs" className="gap-1 text-xs data-[state=active]:bg-neon-yellow/10 data-[state=active]:text-neon-yellow rounded-md whitespace-nowrap">
                <FileText className="w-3.5 h-3.5" />Activity
              </TabsTrigger>
            )}
            {isAdmin && (
              <TabsTrigger value="service-logs" className="gap-1 text-xs data-[state=active]:bg-neon-cyan/10 data-[state=active]:text-neon-cyan rounded-md whitespace-nowrap">
                <Terminal className="w-3.5 h-3.5" />Logs
              </TabsTrigger>
            )}
            <TabsTrigger value="users" className="gap-1 text-xs data-[state=active]:bg-neon-green/10 data-[state=active]:text-neon-green rounded-md whitespace-nowrap">
              <Users className="w-3.5 h-3.5" />Users
            </TabsTrigger>
          </TabsList>
          </div>
          </div>

          {/* ============ OVERVIEW TAB ============ */}
          <TabsContent value="overview" className="space-y-6">
            <OverviewTab
              preds={preds}
              totalPreds={totalPreds}
              successCount={successCount}
              failCount={failCount}
              successRate={successRate}
              highConf={highConf}
              overRecs={overRecs}
              underRecs={underRecs}
              loadingPred={loadingPred}
              fetchAllPredictions={fetchAllPredictions}
              serviceStatus={serviceStatus}
              feedEvents={feedEvents}
              feedLoading={feedLoading}
              setDrawerPrediction={setDrawerPrediction}
            />
          </TabsContent>

          {/* ============ PREDICTIONS TAB ============ */}
          <TabsContent value="predictions" className="space-y-6">
            <PredictionsTab
              preds={preds}
              totalPreds={totalPreds}
              successCount={successCount}
              failCount={failCount}
              loadingPred={loadingPred}
              allPredictionsData={allPredictionsData}
              fetchAllPredictions={fetchAllPredictions}
              handleDownloadPredictions={handleDownloadPredictions}
              setDrawerPrediction={setDrawerPrediction}
            />
          </TabsContent>

          {/* ============ BETSLIP CODES TAB (admin + operator) ============ */}
          {isOperatorOrAbove && (
            <TabsContent value="betslip-codes" className="space-y-6">
              <BetslipCodesTab />
            </TabsContent>
          )}

          {/* ============ RESULTS TAB (admin + operator) ============ */}
          {isOperatorOrAbove && (
            <TabsContent value="results" className="space-y-6">
              <ResultsTab />
            </TabsContent>
          )}

          {/* ============ ANALYTICS TAB ============ */}
          <TabsContent value="analytics" className="space-y-6">
            <AnalyticsTab
              preds={preds}
              totalPreds={totalPreds}
              successCount={successCount}
              failCount={failCount}
              successRate={successRate}
              highConf={highConf}
              overRecs={overRecs}
              underRecs={underRecs}
            />
          </TabsContent>

          {/* ============ SERVICES TAB ============ */}
          <TabsContent value="services" className="space-y-6">
            <ServicesTab
              serviceStatus={serviceStatus}
              loadingStatus={loadingStatus}
              fetchServiceStatus={fetchServiceStatus}
              scraperDay={scraperDay}
              setScraperDay={setScraperDay}
              scraperLoading={scraperLoading}
              stopLoading={stopLoading}
              handleTriggerScraper={handleTriggerScraper}
              handleStopScraper={handleStopScraper}
              loadingPred={loadingPred}
              allPredictionsData={allPredictionsData}
              fetchAllPredictions={fetchAllPredictions}
              handleDownloadPredictions={handleDownloadPredictions}
              setSelectedService={setSelectedService}
              isAdmin={isAdmin}
              showManualEntry={showManualEntry}
              setShowManualEntry={setShowManualEntry}
              manualMatch={manualMatch}
              setManualMatch={setManualMatch}
              manualH2H={manualH2H}
              setManualH2H={setManualH2H}
              manualLoading={manualLoading}
              handleManualSubmit={handleManualSubmit}
            />
          </TabsContent>

          {/* ============ CONFIGURATION TAB (ADMIN ONLY) ============ */}
          {isAdmin && <TabsContent value="configuration" className="space-y-6">
            <ConfigurationTab
              serviceConfigs={serviceConfigs}
              loadingConfigs={loadingConfigs}
              fetchConfigs={fetchConfigs}
              selectedService={selectedService}
              setSelectedService={setSelectedService}
              editingConfig={editingConfig}
              setEditingConfig={setEditingConfig}
              editValue={editValue}
              setEditValue={setEditValue}
              savingConfig={savingConfig}
              handleSaveConfig={handleSaveConfig}
              handleDeleteConfig={handleDeleteConfig}
              revealedSecrets={revealedSecrets}
              toggleReveal={toggleReveal}
              addConfigOpen={addConfigOpen}
              setAddConfigOpen={setAddConfigOpen}
              newConfigKey={newConfigKey}
              setNewConfigKey={setNewConfigKey}
              newConfigValue={newConfigValue}
              setNewConfigValue={setNewConfigValue}
              newConfigSecret={newConfigSecret}
              setNewConfigSecret={setNewConfigSecret}
              handleAddConfig={handleAddConfig}
              pushingService={pushingService}
              pushResult={pushResult}
              handlePushConfig={handlePushConfig}
              remoteConfigs={remoteConfigs}
              handleFetchRemoteConfig={handleFetchRemoteConfig}
              handleTestConnection={handleTestConnection}
              testingService={testingService}
              testResult={testResult}
            />
          </TabsContent>}

          {/* ============ ACTIVITY LOG TAB (ADMIN ONLY) ============ */}
          {isAdmin && <TabsContent value="logs" className="space-y-6">
            <ActivityLogTab
              logs={logs}
              logsTotal={logsTotal}
              loadingLogs={loadingLogs}
              logServiceFilter={logServiceFilter}
              setLogServiceFilter={setLogServiceFilter}
              fetchLogs={fetchLogs}
            />
          </TabsContent>}

          {/* ============ SERVICE LOGS TAB ============ */}
          {isAdmin && <TabsContent value="service-logs" className="space-y-6">
            <ServiceLogsTab
              svcLogsService={svcLogsService}
              setSvcLogsService={setSvcLogsService}
              svcLogs={svcLogs}
              svcLogsLoading={svcLogsLoading}
              svcLogsAutoRefresh={svcLogsAutoRefresh}
              setSvcLogsAutoRefresh={setSvcLogsAutoRefresh}
              svcLogsLevel={svcLogsLevel}
              setSvcLogsLevel={setSvcLogsLevel}
              svcLogsQuery={svcLogsQuery}
              setSvcLogsQuery={setSvcLogsQuery}
              svcLogsNewest={svcLogsNewest}
              svcLogsError={svcLogsError}
              fetchServiceLogs={fetchServiceLogs}
              clearServiceLogs={clearServiceLogs}
            />
          </TabsContent>}

          {/* ============ USERS TAB ============ */}
          <TabsContent value="users" className="space-y-6">
            <UsersTab
              isAdmin={isAdmin}
              users={users}
              loadingUsers={loadingUsers}
              fetchUsers={fetchUsers}
              addUserOpen={addUserOpen}
              setAddUserOpen={setAddUserOpen}
              newUserEmail={newUserEmail}
              setNewUserEmail={setNewUserEmail}
              newUserName={newUserName}
              setNewUserName={setNewUserName}
              newUserPassword={newUserPassword}
              setNewUserPassword={setNewUserPassword}
              newUserRole={newUserRole}
              setNewUserRole={setNewUserRole}
              creatingUser={creatingUser}
              handleCreateUser={handleCreateUser}
              changingRole={changingRole}
              handleChangeRole={handleChangeRole}
              handleDeleteUser={handleDeleteUser}
            />
          </TabsContent>
        </Tabs>
      </main>

      <footer className="border-t border-border/30 bg-card/20 mt-auto">
        <div className="max-w-7xl mx-auto px-4 py-3 text-center text-[11px] text-muted-foreground/50">
          ScoreWise {isAdmin ? "Admin" : "Dashboard"} — Data-driven basketball predictions
        </div>
      </footer>

      {/* Prediction detail drawer — global, can be triggered from any tab */}
      <PredictionDetailDrawer
        prediction={drawerPrediction}
        onClose={() => setDrawerPrediction(null)}
      />
    </div>
  );
}

// ===================== MAIN PAGE =====================

export default function Home() {
  const { data: session, status } = useSession();
  const [seeded, setSeeded] = useState(false);

  useEffect(() => {
    if (seeded) return;
    fetch("/api/admin/seed", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ secret: "scorewise-seed-2024" }), })
      .then(res => res.json()).then(() => setSeeded(true)).catch(() => setSeeded(true));
  }, [seeded]);

  if (status === "loading") {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="text-center"><Loader2 className="w-8 h-8 animate-spin text-neon-green mx-auto mb-3" /><p className="text-muted-foreground">Loading...</p></div>
      </div>
    );
  }

  if (!session) return <SignInPage />;

  const role = (session.user as { role: string })?.role;
  if (role === "ADMIN" || role === "OPERATOR") return <AdminDashboard />;
  return <UserPredictionsView />;
}
