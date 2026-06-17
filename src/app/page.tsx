"use client";

import { useEffect, useState, useMemo, useCallback } from "react";
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
  Save, Plus, X, EyeOff, TestTube, FileText, Globe, Key, Link,
  ChevronDown, ChevronUp, Copy, RotateCcw, ExternalLink, Info, Upload,
} from "lucide-react";
import type { StoredPredictions, Prediction, AppUser, UserRole, ServiceStatus, ServiceConfigEntry, ActivityLogEntry, ServiceName } from "@/lib/types";

// ===================== CONFIG =====================

type ConfFilter = "ALL" | "HIGH" | "MEDIUM" | "LOW";
type RecFilter = "ALL" | "OVER" | "UNDER";

// ===================== CHART COLORS =====================

const CHART_COLORS = {
  green: "#00ff88",
  red: "#ff3366",
  yellow: "#ffcc00",
  cyan: "#00ccff",
  purple: "#8855ff",
  greenMuted: "rgba(0,255,136,0.15)",
  redMuted: "rgba(255,51,102,0.15)",
  yellowMuted: "rgba(255,204,0,0.15)",
  cyanMuted: "rgba(0,204,255,0.15)",
};

const SERVICE_META: Record<ServiceName, { label: string; icon: React.ReactNode; color: string; description: string }> = {
  scraper: {
    label: "FlashScore Scraper",
    icon: <Search className="w-5 h-5" />,
    color: "text-neon-cyan",
    description: "API-controlled scraper that collects basketball match data from FlashScore and posts to the Engine. Can be triggered manually from the dashboard.",
  },
  engine: {
    label: "ScoreWise Engine",
    icon: <Cpu className="w-5 h-5" />,
    color: "text-neon-green",
    description: "Prediction engine that processes match data and generates OVER/UNDER basketball predictions.",
  },
  website: {
    label: "Website (This App)",
    icon: <Globe className="w-5 h-5" />,
    color: "text-neon-yellow",
    description: "The ScoreWise web application — controls auto-refresh timing, display limits, and other frontend settings.",
  },
};

// ===================== SUB-COMPONENTS =====================

function ConfidenceBadge({ level }: { level: string | null }) {
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
    <Badge variant="outline" className={`gap-1 text-xs font-bold ${styles[up] || "border-border text-muted-foreground"}`}>
      {icons[up]}{up}
    </Badge>
  );
}

function RecommendationBadge({ rec }: { rec: string | null }) {
  if (!rec) return <Badge className="bg-muted text-muted-foreground">—</Badge>;
  const up = rec.toUpperCase();
  const isOver = up === "OVER";
  return (
    <Badge className={`text-sm font-black px-3 py-1 ${
      isOver ? "bg-neon-green/20 text-neon-green border border-neon-green/40" : "bg-neon-red/20 text-neon-red border border-neon-red/40"
    }`}>
      {isOver ? <TrendingUp className="w-4 h-4 mr-1" /> : <TrendingDown className="w-4 h-4 mr-1" />}{up}
    </Badge>
  );
}

function PredictionCard({ prediction, detailed }: { prediction: Prediction; detailed?: boolean }) {
  return (
    <Card className="bg-card/80 border-border/50 hover:border-neon-green/20 transition-all duration-200 overflow-hidden group">
      <CardContent className="p-5">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-1">
              <span className="font-mono text-xs text-muted-foreground/60">#{prediction.match_id.slice(0, 8)}</span>
              {prediction.team_winner && prediction.team_winner !== "NO_WINNER_PREDICTION" && (
                <Badge variant="outline" className="text-[10px] border-neon-cyan/30 text-neon-cyan/70">
                  {prediction.team_winner.replace(/_/g, " ")}
                </Badge>
              )}
            </div>
            <div className="flex items-center gap-2 mb-2">
              <RecommendationBadge rec={prediction.recommendation} />
              <ConfidenceBadge level={prediction.confidence} />
            </div>
            {detailed && (
              <div className="grid grid-cols-2 gap-x-6 gap-y-1 text-xs mt-2">
                <div><span className="text-muted-foreground">Bookmaker Line: </span><span className="font-mono text-neon-cyan">{prediction.bookmaker_line ?? "N/A"}</span></div>
                <div><span className="text-muted-foreground">Avg Rate: </span><span className="font-mono">{prediction.average_rate.toFixed(2)}</span></div>
                <div><span className="text-muted-foreground">Above: </span><span className="text-neon-green font-mono">{prediction.matches_above}</span></div>
                <div><span className="text-muted-foreground">Below: </span><span className="text-neon-red font-mono">{prediction.matches_below}</span></div>
              </div>
            )}
          </div>
          <div className="flex items-center gap-2">
            {prediction.success ? (
              <div className="flex items-center gap-1.5 text-neon-green"><CheckCircle2 className="w-5 h-5" /><span className="text-xs font-bold">PASS</span></div>
            ) : (
              <div className="flex items-center gap-1.5 text-neon-red"><XCircle className="w-5 h-5" /><span className="text-xs font-bold">FAIL</span></div>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function PredictionCardSkeleton() {
  return (
    <Card className="bg-card/80 border-border/50">
      <CardContent className="p-5">
        <div className="space-y-3">
          <Skeleton className="h-4 w-1/3 bg-muted/50" />
          <div className="flex gap-2"><Skeleton className="h-6 w-16 bg-muted/50" /><Skeleton className="h-6 w-12 bg-muted/50" /></div>
          <Skeleton className="h-3 w-1/2 bg-muted/50" />
        </div>
      </CardContent>
    </Card>
  );
}

function StatusDot({ status }: { status: string }) {
  const colors: Record<string, string> = {
    online: "bg-neon-green shadow-[0_0_6px_rgba(0,255,136,0.5)]",
    offline: "bg-muted-foreground/40",
    degraded: "bg-neon-yellow shadow-[0_0_6px_rgba(255,204,0,0.5)]",
    error: "bg-neon-red shadow-[0_0_6px_rgba(255,51,102,0.5)]",
  };
  return <div className={`w-2.5 h-2.5 rounded-full ${colors[status] || colors.offline} animate-pulse`} />;
}

function StatCard({ title, value, icon, color, sub }: { title: string; value: string | number; icon: React.ReactNode; color: string; sub?: string }) {
  return (
    <Card className="bg-card/60 border-border/40">
      <CardContent className="p-4">
        <div className="flex items-center justify-between mb-2">
          <span className="text-[10px] text-muted-foreground uppercase tracking-wider font-semibold">{title}</span>
          <div className={`${color}`}>{icon}</div>
        </div>
        <p className="text-2xl font-black">{value}</p>
        {sub && <p className="text-[11px] text-muted-foreground mt-0.5">{sub}</p>}
      </CardContent>
    </Card>
  );
}

function MiniProgressBar({ value, max, color }: { value: number; max: number; color: string }) {
  const pct = max > 0 ? Math.round((value / max) * 100) : 0;
  return (
    <div className="flex items-center gap-2">
      <div className="flex-1 h-1.5 bg-muted/50 rounded-full overflow-hidden">
        <div className={`h-full rounded-full ${color}`} style={{ width: `${pct}%` }} />
      </div>
      <span className="text-[10px] font-mono text-muted-foreground w-8 text-right">{pct}%</span>
    </div>
  );
}

// ===================== SIGN IN PAGE =====================

function SignInPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [showSignup, setShowSignup] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    const result = await signIn("credentials", { email, password, redirect: false });
    if (result?.error) {
      toast.error("Invalid email or password");
    }
    setLoading(false);
  };

  if (showSignup) {
    return <SignupPage onBack={() => setShowSignup(false)} />;
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-background px-4">
      <Card className="w-full max-w-md bg-card/80 border-border/50 shadow-2xl">
        <CardHeader className="text-center pb-2">
          <div className="mx-auto mb-4 w-16 h-16 rounded-2xl bg-neon-green/10 flex items-center justify-center">
            <BasketballIcon className="w-8 h-8 text-neon-green" />
          </div>
          <CardTitle className="text-2xl font-black">ScoreWise</CardTitle>
          <CardDescription>Basketball Predictions Dashboard</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label>Email</Label>
              <Input type="email" placeholder="you@example.com" value={email} onChange={(e) => setEmail(e.target.value)} required className="bg-background border-border/50" />
            </div>
            <div className="space-y-2">
              <Label>Password</Label>
              <Input type="password" placeholder="••••••••" value={password} onChange={(e) => setPassword(e.target.value)} required className="bg-background border-border/50" />
            </div>
            <Button type="submit" className="w-full bg-neon-green text-background hover:bg-neon-green/90 font-bold" disabled={loading}>
              {loading ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Lock className="w-4 h-4 mr-2" />}Sign In
            </Button>
          </form>
          <Separator className="my-4 bg-border/30" />
          <div className="text-center">
            <p className="text-xs text-muted-foreground">
              Don&apos;t have an account?{" "}
              <button onClick={() => setShowSignup(true)} className="text-neon-green hover:underline font-medium">
                Create one
              </button>
            </p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function SignupPage({ onBack }: { onBack: () => void }) {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [loading, setLoading] = useState(false);

  const handleSignup = async (e: React.FormEvent) => {
    e.preventDefault();
    if (password !== confirmPassword) {
      toast.error("Passwords do not match");
      return;
    }
    if (password.length < 8) {
      toast.error("Password must be at least 8 characters");
      return;
    }
    setLoading(true);
    try {
      const res = await fetch("/api/auth/signup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, name, password }),
      });
      const data = await res.json();
      if (!res.ok) {
        toast.error(data.error || "Signup failed");
        return;
      }
      toast.success("Account created! You can now sign in.");
      onBack();
    } catch {
      toast.error("Something went wrong");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-background px-4">
      <Card className="w-full max-w-md bg-card/80 border-border/50 shadow-2xl">
        <CardHeader className="text-center pb-2">
          <div className="mx-auto mb-4 w-16 h-16 rounded-2xl bg-neon-green/10 flex items-center justify-center">
            <BasketballIcon className="w-8 h-8 text-neon-green" />
          </div>
          <CardTitle className="text-2xl font-black">Create Account</CardTitle>
          <CardDescription>Join ScoreWise to access predictions</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSignup} className="space-y-4">
            <div className="space-y-2">
              <Label>Name (optional)</Label>
              <Input placeholder="Your name" value={name} onChange={(e) => setName(e.target.value)} className="bg-background border-border/50" />
            </div>
            <div className="space-y-2">
              <Label>Email</Label>
              <Input type="email" placeholder="you@example.com" value={email} onChange={(e) => setEmail(e.target.value)} required className="bg-background border-border/50" />
            </div>
            <div className="space-y-2">
              <Label>Password</Label>
              <Input type="password" placeholder="Min. 8 characters" value={password} onChange={(e) => setPassword(e.target.value)} required className="bg-background border-border/50" />
            </div>
            <div className="space-y-2">
              <Label>Confirm Password</Label>
              <Input type="password" placeholder="••••••••" value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} required className="bg-background border-border/50" />
            </div>
            <Button type="submit" className="w-full bg-neon-green text-background hover:bg-neon-green/90 font-bold" disabled={loading}>
              {loading ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <UserPlus className="w-4 h-4 mr-2" />}Create Account
            </Button>
          </form>
          <Separator className="my-4 bg-border/30" />
          <div className="text-center">
            <p className="text-xs text-muted-foreground">
              Already have an account?{" "}
              <button onClick={onBack} className="text-neon-green hover:underline font-medium">
                Sign in
              </button>
            </p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function BasketballIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="10" />
      <path d="M12 2a14.5 14.5 0 0 0 0 20" />
      <path d="M12 2a14.5 14.5 0 0 1 0 20" />
      <path d="M2 12h20" />
    </svg>
  );
}

// ===================== USER PREDICTIONS VIEW =====================

function UserPredictionsView() {
  const [data, setData] = useState<StoredPredictions | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [confFilter, setConfFilter] = useState<ConfFilter>("ALL");
  const [recFilter, setRecFilter] = useState<RecFilter>("ALL");

  const fetchPredictions = useCallback(async () => {
    try {
      const res = await fetch("/api/predictions");
      if (!res.ok) throw new Error("Failed to load predictions");
      const json = await res.json();
      if (json.error) throw new Error(json.error);
      setData(json);
      setError(null);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Unknown error");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchPredictions();
    const interval = setInterval(fetchPredictions, 60000);
    return () => clearInterval(interval);
  }, [fetchPredictions]);

  const filtered = useMemo(() => {
    if (!data?.predictions) return [];
    return data.predictions.filter((p) => {
      if (search && !p.match_id.toLowerCase().includes(search.toLowerCase()) && !(p.team_winner || "").toLowerCase().includes(search.toLowerCase())) return false;
      if (confFilter !== "ALL" && p.confidence?.toUpperCase() !== confFilter) return false;
      if (recFilter !== "ALL" && p.recommendation?.toUpperCase() !== recFilter) return false;
      return true;
    });
  }, [data, search, confFilter, recFilter]);

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b border-border/30 bg-card/50 backdrop-blur-sm sticky top-0 z-40">
        <div className="max-w-7xl mx-auto px-4 h-14 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <BasketballIcon className="w-5 h-5 text-neon-green" />
            <span className="font-black text-lg">ScoreWise</span>
          </div>
          <Button variant="ghost" size="sm" onClick={() => signOut()} className="gap-1.5 text-muted-foreground hover:text-foreground">
            <LogOut className="w-4 h-4" /> Sign Out
          </Button>
        </div>
      </header>
      <main className="max-w-7xl mx-auto px-4 py-6 space-y-6">
        <div>
          <h1 className="text-2xl font-black">Predictions</h1>
          <p className="text-sm text-muted-foreground">Basketball OVER/UNDER predictions backed by historical data analysis</p>
        </div>
        <div className="flex flex-col sm:flex-row gap-3">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input placeholder="Search match ID or team..." value={search} onChange={(e) => setSearch(e.target.value)} className="pl-9 bg-card border-border/50" />
          </div>
          <div className="flex gap-2">
            <Select value={confFilter} onValueChange={(v) => setConfFilter(v as ConfFilter)}>
              <SelectTrigger className="w-[120px] bg-card border-border/50"><SelectValue placeholder="Confidence" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="ALL">All Levels</SelectItem>
                <SelectItem value="HIGH">High</SelectItem>
                <SelectItem value="MEDIUM">Medium</SelectItem>
                <SelectItem value="LOW">Low</SelectItem>
              </SelectContent>
            </Select>
            <Select value={recFilter} onValueChange={(v) => setRecFilter(v as RecFilter)}>
              <SelectTrigger className="w-[120px] bg-card border-border/50"><SelectValue placeholder="Type" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="ALL">All Types</SelectItem>
                <SelectItem value="OVER">OVER</SelectItem>
                <SelectItem value="UNDER">UNDER</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
        {loading ? (
          <div className="grid gap-3">{Array.from({ length: 4 }).map((_, i) => <PredictionCardSkeleton key={i} />)}</div>
        ) : error ? (
          <Card className="bg-card/60 border-neon-red/30">
            <CardContent className="p-8 text-center">
              <AlertTriangle className="w-8 h-8 text-neon-red mx-auto mb-3" />
              <p className="font-semibold text-neon-red mb-1">Failed to load predictions</p>
              <p className="text-sm text-muted-foreground mb-4">{error}</p>
              <Button variant="outline" onClick={fetchPredictions} className="gap-2"><RefreshCw className="w-4 h-4" />Try Again</Button>
            </CardContent>
          </Card>
        ) : filtered.length === 0 ? (
          <Card className="bg-card/60 border-border/40">
            <CardContent className="p-8 text-center">
              <Search className="w-8 h-8 text-muted-foreground/40 mx-auto mb-3" />
              <p className="text-muted-foreground">No predictions match your filters</p>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <p className="text-sm text-muted-foreground">{filtered.length} prediction{filtered.length !== 1 ? "s" : ""}</p>
              <Button variant="ghost" size="sm" onClick={fetchPredictions} className="gap-1.5 text-muted-foreground"><RefreshCw className="w-3.5 h-3.5" />Refresh</Button>
            </div>
            <div className="grid gap-3">{filtered.map((p) => <PredictionCard key={p.match_id} prediction={p} />)}</div>
          </div>
        )}
      </main>
    </div>
  );
}

// ===================== ADMIN DASHBOARD =====================

function AdminDashboard() {
  // --- Get current user's role ---
  const { data: adminSession } = useSession();
  const currentUserRole = (adminSession?.user as { role: string })?.role || "USER";
  const isAdmin = currentUserRole === "ADMIN";

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

  // --- Format time ---
  const formatTime = (t: string | null | undefined) => {
    if (!t) return "—";
    try { return new Date(t).toLocaleString(); } catch { return t; }
  };

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

  // --- Init ---
  useEffect(() => {
    fetchAllPredictions();
    fetchServiceStatus();
    fetchUsers();
    fetchConfigs();
  }, [fetchAllPredictions, fetchServiceStatus, fetchUsers, fetchConfigs]);

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
  const successPieData = useMemo(() => [
    { name: "Success", value: successCount, color: CHART_COLORS.green },
    { name: "Failed", value: failCount, color: CHART_COLORS.red },
  ], [successCount, failCount]);

  const confPieData = useMemo(() => [
    { name: "HIGH", value: highConf, color: CHART_COLORS.green },
    { name: "MEDIUM", value: preds.filter(p => p.confidence?.toUpperCase() === "MEDIUM").length, color: CHART_COLORS.yellow },
    { name: "LOW", value: preds.filter(p => p.confidence?.toUpperCase() === "LOW").length, color: CHART_COLORS.red },
  ], [preds, highConf]);

  const recPieData = useMemo(() => [
    { name: "OVER", value: overRecs, color: CHART_COLORS.green },
    { name: "UNDER", value: underRecs, color: CHART_COLORS.red },
  ], [overRecs, underRecs]);

  const h2hDistribution = useMemo(() => {
    const buckets: Record<string, number> = {};
    preds.forEach(p => {
      if (p.h2h_totals) p.h2h_totals.forEach(v => {
        const bucket = `${Math.floor(v / 10) * 10}-${Math.floor(v / 10) * 10 + 9}`;
        buckets[bucket] = (buckets[bucket] || 0) + 1;
      });
    });
    return Object.entries(buckets).sort(([a], [b]) => a.localeCompare(b)).map(([range, count]) => ({ range, count }));
  }, [preds]);

  const rateDistribution = useMemo(() => {
    const buckets: Record<string, number> = {};
    preds.forEach(p => {
      const rounded = Math.round(p.average_rate);
      const label = rounded.toString();
      buckets[label] = (buckets[label] || 0) + 1;
    });
    return Object.entries(buckets).sort(([a], [b]) => Number(a) - Number(b)).map(([rate, count]) => ({ rate, count }));
  }, [preds]);

  const radarData = useMemo(() => {
    const p = preds.find(p => p.winning_streak_data);
    if (!p?.winning_streak_data) return [];
    const ws = p.winning_streak_data;
    return [
      { metric: "Home H2H Wins", value: ws.home_team_h2h_wins, full: ws.total_h2h_matches },
      { metric: "Away H2H Wins", value: ws.away_team_h2h_wins, full: ws.total_h2h_matches },
      { metric: "Home Recent", value: ws.home_team_recent_wins, full: 5 },
      { metric: "Away Recent", value: ws.away_team_recent_wins, full: 5 },
      { metric: "Home Streak", value: ws.home_team_winning_streak, full: 5 },
      { metric: "Away Streak", value: ws.away_team_winning_streak, full: 5 },
    ];
  }, [preds]);

  const renderCustomLabel = ({ name, percent }: { name: string; percent: number }) =>
    `${name} ${(percent * 100).toFixed(0)}%`;

  // --- Action icon map for logs ---
  const actionIcon = (action: string) => {
    if (action.startsWith("CONFIG_")) return <Settings className="w-4 h-4 text-neon-cyan" />;
    if (action.startsWith("USER_")) return <Users className="w-4 h-4 text-neon-yellow" />;
    if (action.startsWith("SERVICE_")) return <Server className="w-4 h-4 text-neon-green" />;
    return <Activity className="w-4 h-4 text-muted-foreground" />;
  };

  const actionBadgeColor = (action: string) => {
    if (action.includes("CREATE")) return "border-neon-green/40 text-neon-green";
    if (action.includes("UPDATE")) return "border-neon-cyan/40 text-neon-cyan";
    if (action.includes("DELETE")) return "border-neon-red/40 text-neon-red";
    if (action.includes("CHECK")) return "border-neon-yellow/40 text-neon-yellow";
    if (action.includes("TRIGGER")) return "border-neon-green/40 text-neon-green";
    return "border-border text-muted-foreground";
  };

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <header className="border-b border-border/30 bg-card/50 backdrop-blur-sm sticky top-0 z-40">
        <div className="max-w-7xl mx-auto px-4 h-14 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <BasketballIcon className="w-5 h-5 text-neon-green" />
            <span className="font-black text-lg">ScoreWise</span>
            <Badge className={`ml-2 text-[10px] font-bold ${isAdmin ? "bg-neon-green/15 text-neon-green border-neon-green/30" : "bg-neon-yellow/15 text-neon-yellow border-neon-yellow/30"}`}>
              {isAdmin ? <Shield className="w-3 h-3 mr-1" /> : <Eye className="w-3 h-3 mr-1" />}{currentUserRole}
            </Badge>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="ghost" size="sm" onClick={() => { fetchAllPredictions(); fetchServiceStatus(); if (isAdmin) { fetchConfigs(); fetchLogs(); } }} className="gap-1.5 text-muted-foreground hover:text-foreground">
              <RefreshCw className="w-3.5 h-3.5" />Refresh All
            </Button>
            <Button variant="ghost" size="sm" onClick={() => signOut()} className="gap-1.5 text-muted-foreground hover:text-foreground">
              <LogOut className="w-4 h-4" />Sign Out
            </Button>
          </div>
        </div>
      </header>

      <main className="flex-1 max-w-7xl mx-auto px-4 py-6 w-full">
        <Tabs defaultValue="overview" className="space-y-6">
          <TabsList className="bg-card/60 border border-border/40 p-1 h-auto flex-wrap gap-1">
            <TabsTrigger value="overview" className="gap-1.5 text-xs data-[state=active]:bg-neon-green/10 data-[state=active]:text-neon-green">
              <Gauge className="w-3.5 h-3.5" />Overview
            </TabsTrigger>
            <TabsTrigger value="predictions" className="gap-1.5 text-xs data-[state=active]:bg-neon-green/10 data-[state=active]:text-neon-green">
              <Database className="w-3.5 h-3.5" />Predictions
            </TabsTrigger>
            <TabsTrigger value="analytics" className="gap-1.5 text-xs data-[state=active]:bg-neon-green/10 data-[state=active]:text-neon-green">
              <BarChart3 className="w-3.5 h-3.5" />Analytics
            </TabsTrigger>
            <TabsTrigger value="services" className="gap-1.5 text-xs data-[state=active]:bg-neon-green/10 data-[state=active]:text-neon-green">
              <Server className="w-3.5 h-3.5" />Services
            </TabsTrigger>
            {isAdmin && (
              <TabsTrigger value="configuration" className="gap-1.5 text-xs data-[state=active]:bg-neon-cyan/10 data-[state=active]:text-neon-cyan">
                <Settings className="w-3.5 h-3.5" />Configuration
              </TabsTrigger>
            )}
            {isAdmin && (
              <TabsTrigger value="logs" className="gap-1.5 text-xs data-[state=active]:bg-neon-yellow/10 data-[state=active]:text-neon-yellow">
                <FileText className="w-3.5 h-3.5" />Activity Log
              </TabsTrigger>
            )}
            <TabsTrigger value="users" className="gap-1.5 text-xs data-[state=active]:bg-neon-green/10 data-[state=active]:text-neon-green">
              <Users className="w-3.5 h-3.5" />Users
            </TabsTrigger>
          </TabsList>

          {/* ============ OVERVIEW TAB ============ */}
          <TabsContent value="overview" className="space-y-6">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <StatCard title="Total Predictions" value={totalPreds} icon={<Database className="w-5 h-5 text-neon-green" />} color="text-neon-green" />
              <StatCard title="Success Rate" value={`${successRate}%`} icon={<Target className="w-5 h-5 text-neon-green" />} color="text-neon-green" sub={`${successCount} of ${totalPreds}`} />
              <StatCard title="High Confidence" value={highConf} icon={<Shield className="w-5 h-5 text-neon-yellow" />} color="text-neon-yellow" sub={totalPreds > 0 ? `${Math.round((highConf / totalPreds) * 100)}% of total` : ""} />
              <StatCard title="Services Online" value={
                [serviceStatus?.scraper?.status === "online" ? 1 : 0, serviceStatus?.engine?.status === "online" ? 1 : 0, 1].reduce((a, b) => a + b, 0)
              } icon={<Wifi className="w-5 h-5 text-neon-cyan" />} color="text-neon-cyan" sub="of 3 services" />
            </div>

            <div className="grid md:grid-cols-2 gap-6">
              {/* Service status */}
              <Card className="bg-card/60 border-border/40">
                <CardHeader className="pb-3">
                  <CardTitle className="text-sm font-semibold flex items-center gap-2">
                    <Server className="w-4 h-4 text-neon-cyan" />Service Status
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div className="flex items-center justify-between p-3 bg-background/50 rounded-lg">
                    <div className="flex items-center gap-2">
                      <StatusDot status={serviceStatus?.scraper?.status || "offline"} />
                      <span className="text-sm font-medium">Scraper</span>
                    </div>
                    <Badge variant="outline" className={serviceStatus?.scraper?.status === "online" ? "border-neon-green/40 text-neon-green" : "border-muted-foreground/30 text-muted-foreground"}>
                      {serviceStatus?.scraper?.status?.toUpperCase() || "UNKNOWN"}
                    </Badge>
                  </div>
                  <div className="flex items-center justify-between p-3 bg-background/50 rounded-lg">
                    <div className="flex items-center gap-2">
                      <StatusDot status={serviceStatus?.engine?.status || "offline"} />
                      <span className="text-sm font-medium">Engine</span>
                    </div>
                    <Badge variant="outline" className={
                      serviceStatus?.engine?.status === "online" ? "border-neon-green/40 text-neon-green"
                        : serviceStatus?.engine?.status === "error" ? "border-neon-red/40 text-neon-red"
                        : "border-muted-foreground/30 text-muted-foreground"
                    }>
                      {serviceStatus?.engine?.status?.toUpperCase() || "UNKNOWN"}
                    </Badge>
                  </div>
                  <div className="flex items-center justify-between p-3 bg-background/50 rounded-lg">
                    <div className="flex items-center gap-2">
                      <StatusDot status="online" />
                      <span className="text-sm font-medium">Website</span>
                    </div>
                    <Badge variant="outline" className="border-neon-green/40 text-neon-green">ONLINE</Badge>
                  </div>
                  {serviceStatus?.engine?.message && (
                    <p className="text-xs text-neon-yellow/80 flex items-center gap-1.5">
                      <AlertTriangle className="w-3 h-3 shrink-0" />{serviceStatus.engine.message}
                    </p>
                  )}
                </CardContent>
              </Card>

              {/* Quick stats */}
              <Card className="bg-card/60 border-border/40">
                <CardHeader className="pb-3">
                  <CardTitle className="text-sm font-semibold flex items-center gap-2">
                    <Flame className="w-4 h-4 text-neon-red" />Prediction Breakdown
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div>
                    <div className="flex justify-between text-sm mb-1">
                      <span className="text-muted-foreground">Success Rate</span>
                      <span className="font-mono font-bold text-neon-green">{successRate}%</span>
                    </div>
                    <Progress value={successRate} className="h-2 [&>div]:bg-neon-green" />
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="bg-background/50 rounded-lg p-3">
                      <p className="text-[10px] text-muted-foreground uppercase tracking-wider">OVER</p>
                      <p className="text-xl font-black text-neon-green">{overRecs}</p>
                      <MiniProgressBar value={overRecs} max={totalPreds || 1} color="bg-neon-green" />
                    </div>
                    <div className="bg-background/50 rounded-lg p-3">
                      <p className="text-[10px] text-muted-foreground uppercase tracking-wider">UNDER</p>
                      <p className="text-xl font-black text-neon-red">{underRecs}</p>
                      <MiniProgressBar value={underRecs} max={totalPreds || 1} color="bg-neon-red" />
                    </div>
                  </div>
                  <Separator className="bg-border/30" />
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-muted-foreground">Last Updated</span>
                    <span className="text-xs font-mono">{formatTime(allPredictionsData?.updated_at)}</span>
                  </div>
                </CardContent>
              </Card>
            </div>

            {/* Recent predictions */}
            <Card className="bg-card/60 border-border/40">
              <CardHeader className="pb-2">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-sm font-semibold flex items-center gap-2">
                    <Clock className="w-4 h-4 text-neon-cyan" />Recent Predictions
                  </CardTitle>
                  <Button variant="ghost" size="sm" onClick={fetchAllPredictions} disabled={loadingPred} className="gap-1 text-xs text-muted-foreground">
                    <RefreshCw className={`w-3 h-3 ${loadingPred ? "animate-spin" : ""}`} />Reload
                  </Button>
                </div>
              </CardHeader>
              <CardContent>
                <ScrollArea className="max-h-[300px]">
                  {loadingPred ? (
                    <div className="space-y-2">{Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-12 w-full bg-muted/30" />)}</div>
                  ) : preds.length === 0 ? (
                    <p className="text-sm text-muted-foreground text-center py-6">No predictions yet</p>
                  ) : (
                    <Table>
                      <TableHeader>
                        <TableRow className="border-border/40 hover:bg-transparent">
                          <TableHead className="text-xs">Match</TableHead>
                          <TableHead className="text-xs">Recommendation</TableHead>
                          <TableHead className="text-xs">Confidence</TableHead>
                          <TableHead className="text-xs">Line</TableHead>
                          <TableHead className="text-xs">Result</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {preds.slice(0, 10).map(p => (
                          <TableRow key={p.match_id} className="border-border/20 hover:bg-card/80">
                            <TableCell className="font-mono text-xs">{p.match_id.slice(0, 12)}</TableCell>
                            <TableCell><RecommendationBadge rec={p.recommendation} /></TableCell>
                            <TableCell><ConfidenceBadge level={p.confidence} /></TableCell>
                            <TableCell className="text-neon-cyan font-mono text-xs">{p.bookmaker_line ?? "—"}</TableCell>
                            <TableCell>{p.success ? <CheckCircle2 className="w-4 h-4 text-neon-green" /> : <XCircle className="w-4 h-4 text-neon-red" />}</TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  )}
                </ScrollArea>
              </CardContent>
            </Card>
          </TabsContent>

          {/* ============ PREDICTIONS TAB ============ */}
          <TabsContent value="predictions" className="space-y-6">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-lg font-bold">All Predictions</h2>
                <p className="text-sm text-muted-foreground">Complete prediction data including failed validations</p>
              </div>
              <div className="flex gap-2">
                <Button variant="outline" size="sm" onClick={fetchAllPredictions} disabled={loadingPred} className="gap-1.5 border-border/50 text-muted-foreground hover:text-foreground">
                  <RefreshCw className={`w-3.5 h-3.5 ${loadingPred ? "animate-spin" : ""}`} />Reload
                </Button>
                <Button variant="outline" size="sm" onClick={handleDownloadPredictions} disabled={!allPredictionsData} className="gap-1.5 border-border/50 text-muted-foreground hover:text-foreground">
                  <Download className="w-3.5 h-3.5" />Export JSON
                </Button>
              </div>
            </div>

            <div className="grid grid-cols-3 gap-3">
              <div className="bg-card/60 border border-border/40 rounded-lg px-3 py-2 text-center">
                <p className="text-xl font-black">{totalPreds}</p><p className="text-[10px] text-muted-foreground">Total</p>
              </div>
              <div className="bg-card/60 border border-neon-green/20 rounded-lg px-3 py-2 text-center">
                <p className="text-xl font-black text-neon-green">{successCount}</p><p className="text-[10px] text-muted-foreground">Passed</p>
              </div>
              <div className="bg-card/60 border border-neon-red/20 rounded-lg px-3 py-2 text-center">
                <p className="text-xl font-black text-neon-red">{failCount}</p><p className="text-[10px] text-muted-foreground">Failed</p>
              </div>
            </div>

            <Card className="bg-card/60 border-border/40">
              <CardContent className="p-0">
                <ScrollArea className="max-h-[500px]">
                  <Table>
                    <TableHeader>
                      <TableRow className="border-border/40 hover:bg-transparent">
                        <TableHead className="text-xs">Match ID</TableHead>
                        <TableHead className="text-xs">Rec</TableHead>
                        <TableHead className="text-xs">Conf</TableHead>
                        <TableHead className="text-xs">Line</TableHead>
                        <TableHead className="text-xs">Winner</TableHead>
                        <TableHead className="text-xs">Above/Below</TableHead>
                        <TableHead className="text-xs">Result</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {loadingPred ? (
                        <TableRow><TableCell colSpan={7} className="text-center py-8 text-muted-foreground"><Loader2 className="w-5 h-5 animate-spin mx-auto mb-2" />Loading...</TableCell></TableRow>
                      ) : preds.length === 0 ? (
                        <TableRow><TableCell colSpan={7} className="text-center py-8 text-muted-foreground">No predictions available</TableCell></TableRow>
                      ) : (
                        preds.map(p => (
                          <TableRow key={p.match_id} className="border-border/20 hover:bg-card/80">
                            <TableCell className="font-mono text-xs">{p.match_id.slice(0, 12)}</TableCell>
                            <TableCell><RecommendationBadge rec={p.recommendation} /></TableCell>
                            <TableCell><ConfidenceBadge level={p.confidence} /></TableCell>
                            <TableCell className="text-neon-cyan font-mono text-xs">{p.bookmaker_line ?? "—"}</TableCell>
                            <TableCell className="text-xs">{p.team_winner && p.team_winner !== "NO_WINNER_PREDICTION" ? p.team_winner.replace(/_/g, " ") : "—"}</TableCell>
                            <TableCell className="text-xs"><span className="text-neon-green">{p.matches_above}</span>/<span className="text-neon-red">{p.matches_below}</span></TableCell>
                            <TableCell>{p.success ? <CheckCircle2 className="w-4 h-4 text-neon-green" /> : <XCircle className="w-4 h-4 text-neon-red" />}</TableCell>
                          </TableRow>
                        ))
                      )}
                    </TableBody>
                  </Table>
                </ScrollArea>
              </CardContent>
            </Card>
          </TabsContent>

          {/* ============ ANALYTICS TAB ============ */}
          <TabsContent value="analytics" className="space-y-6">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-lg font-bold">Prediction Analytics</h2>
                <p className="text-sm text-muted-foreground">Visual breakdown of prediction performance and patterns</p>
              </div>
            </div>

            <div className="grid md:grid-cols-3 gap-6">
              {/* Success/Fail pie */}
              <Card className="bg-card/60 border-border/40">
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-semibold flex items-center gap-2"><CheckCircle2 className="w-4 h-4 text-neon-green" /> Success vs Failed</CardTitle>
                </CardHeader>
                <CardContent>
                  <ResponsiveContainer width="100%" height={200}>
                    <PieChart>
                      <Pie data={successPieData} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={70} label={renderCustomLabel} labelLine={false} fontSize={11}>
                        {successPieData.map((entry, i) => <Cell key={i} fill={entry.color} />)}
                      </Pie>
                      <RTooltip />
                    </PieChart>
                  </ResponsiveContainer>
                </CardContent>
              </Card>

              {/* Confidence pie */}
              <Card className="bg-card/60 border-border/40">
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-semibold flex items-center gap-2"><Shield className="w-4 h-4 text-neon-yellow" /> Confidence Distribution</CardTitle>
                </CardHeader>
                <CardContent>
                  <ResponsiveContainer width="100%" height={200}>
                    <PieChart>
                      <Pie data={confPieData} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={70} label={renderCustomLabel} labelLine={false} fontSize={11}>
                        {confPieData.map((entry, i) => <Cell key={i} fill={entry.color} />)}
                      </Pie>
                      <RTooltip />
                    </PieChart>
                  </ResponsiveContainer>
                </CardContent>
              </Card>

              {/* OVER/UNDER pie */}
              <Card className="bg-card/60 border-border/40">
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-semibold flex items-center gap-2"><TrendingUp className="w-4 h-4 text-neon-green" /> OVER vs UNDER</CardTitle>
                </CardHeader>
                <CardContent>
                  <ResponsiveContainer width="100%" height={200}>
                    <PieChart>
                      <Pie data={recPieData} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={70} label={renderCustomLabel} labelLine={false} fontSize={11}>
                        {recPieData.map((entry, i) => <Cell key={i} fill={entry.color} />)}
                      </Pie>
                      <RTooltip />
                    </PieChart>
                  </ResponsiveContainer>
                </CardContent>
              </Card>
            </div>

            <div className="grid md:grid-cols-2 gap-6">
              {/* H2H distribution bar */}
              <Card className="bg-card/60 border-border/40">
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-semibold flex items-center gap-2"><BarChart2 className="w-4 h-4 text-neon-cyan" /> H2H Total Points Distribution</CardTitle>
                </CardHeader>
                <CardContent>
                  <ResponsiveContainer width="100%" height={250}>
                    <BarChart data={h2hDistribution}>
                      <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
                      <XAxis dataKey="range" tick={{ fontSize: 10, fill: "#8888a0" }} />
                      <YAxis tick={{ fontSize: 10, fill: "#8888a0" }} />
                      <RTooltip contentStyle={{ background: "#12121a", border: "1px solid rgba(255,255,255,0.08)", borderRadius: "8px", fontSize: "12px" }} />
                      <Bar dataKey="count" fill={CHART_COLORS.cyan} radius={[4, 4, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </CardContent>
              </Card>

              {/* Rate distribution area */}
              <Card className="bg-card/60 border-border/40">
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-semibold flex items-center gap-2"><Percent className="w-4 h-4 text-neon-green" /> Average Rate Distribution</CardTitle>
                </CardHeader>
                <CardContent>
                  <ResponsiveContainer width="100%" height={250}>
                    <AreaChart data={rateDistribution}>
                      <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
                      <XAxis dataKey="rate" tick={{ fontSize: 10, fill: "#8888a0" }} />
                      <YAxis tick={{ fontSize: 10, fill: "#8888a0" }} />
                      <RTooltip contentStyle={{ background: "#12121a", border: "1px solid rgba(255,255,255,0.08)", borderRadius: "8px", fontSize: "12px" }} />
                      <Area type="monotone" dataKey="count" stroke={CHART_COLORS.green} fill={CHART_COLORS.greenMuted} />
                    </AreaChart>
                  </ResponsiveContainer>
                </CardContent>
              </Card>
            </div>

            {/* Radar + Metrics */}
            <div className="grid md:grid-cols-2 gap-6">
              {radarData.length > 0 && (
                <Card className="bg-card/60 border-border/40">
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm font-semibold flex items-center gap-2"><Target className="w-4 h-4 text-neon-cyan" /> Winning Streak Radar</CardTitle>
                    <CardDescription>Latest prediction with streak data</CardDescription>
                  </CardHeader>
                  <CardContent>
                    <ResponsiveContainer width="100%" height={250}>
                      <RadarChart data={radarData}>
                        <PolarGrid stroke="rgba(255,255,255,0.08)" />
                        <PolarAngleAxis dataKey="metric" tick={{ fontSize: 9, fill: "#8888a0" }} />
                        <PolarRadiusAxis tick={false} axisLine={false} />
                        <Radar name="Value" dataKey="value" stroke={CHART_COLORS.cyan} fill={CHART_COLORS.cyanMuted} />
                      </RadarChart>
                    </ResponsiveContainer>
                  </CardContent>
                </Card>
              )}

              {/* Prediction metrics summary */}
              <Card className="bg-card/60 border-border/40">
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-semibold flex items-center gap-2">
                    <Gauge className="w-4 h-4 text-neon-cyan" /> Prediction Metrics
                  </CardTitle>
                  <CardDescription>Key performance indicators across all predictions</CardDescription>
                </CardHeader>
                <CardContent className="space-y-5">
                  <div>
                    <div className="flex justify-between text-sm mb-1">
                      <span className="text-muted-foreground">Success Rate</span>
                      <span className="font-mono font-bold text-neon-green">{successRate}%</span>
                    </div>
                    <Progress value={successRate} className="h-2 [&>div]:bg-neon-green" />
                  </div>
                  <div>
                    <div className="flex justify-between text-sm mb-1">
                      <span className="text-muted-foreground">High Confidence Rate</span>
                      <span className="font-mono font-bold text-neon-green">{totalPreds > 0 ? Math.round((highConf / totalPreds) * 100) : 0}%</span>
                    </div>
                    <Progress value={totalPreds > 0 ? (highConf / totalPreds) * 100 : 0} className="h-2 [&>div]:bg-neon-green" />
                  </div>
                  <div>
                    <div className="flex justify-between text-sm mb-1">
                      <span className="text-muted-foreground">UNDER Prediction Rate</span>
                      <span className="font-mono font-bold text-neon-red">{totalPreds > 0 ? Math.round((underRecs / totalPreds) * 100) : 0}%</span>
                    </div>
                    <Progress value={totalPreds > 0 ? (underRecs / totalPreds) * 100 : 0} className="h-2 [&>div]:bg-neon-red" />
                  </div>
                  <div>
                    <div className="flex justify-between text-sm mb-1">
                      <span className="text-muted-foreground">OVER Prediction Rate</span>
                      <span className="font-mono font-bold text-neon-green">{totalPreds > 0 ? Math.round((overRecs / totalPreds) * 100) : 0}%</span>
                    </div>
                    <Progress value={totalPreds > 0 ? (overRecs / totalPreds) * 100 : 0} className="h-2 [&>div]:bg-neon-green" />
                  </div>
                  <Separator className="bg-border/30" />
                  <div className="grid grid-cols-2 gap-3">
                    <div className="bg-background/50 rounded-lg p-3">
                      <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Total H2H Games</p>
                      <p className="text-xl font-black text-neon-cyan">{totalPreds}</p>
                    </div>
                    <div className="bg-background/50 rounded-lg p-3">
                      <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Below Line Rate</p>
                      <p className="text-xl font-black text-neon-red">
                        {preds.length > 0 ? Math.round((preds.reduce((s, p) => s + p.matches_below, 0) / preds.reduce((s, p) => s + p.matches_above + p.matches_below, 0)) * 100) : 0}%
                      </p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>

            {/* H2H detailed table per prediction */}
            {preds.some(p => p.h2h_totals && p.h2h_totals.length > 0) && (
              <Card className="bg-card/60 border-border/40">
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-semibold flex items-center gap-2">
                    <Layers className="w-4 h-4 text-neon-cyan" /> H2H Match Details
                  </CardTitle>
                  <CardDescription>Individual historical match totals per prediction</CardDescription>
                </CardHeader>
                <CardContent>
                  <ScrollArea className="max-h-[400px]">
                    <Table>
                      <TableHeader>
                        <TableRow className="border-border/40 hover:bg-transparent">
                          <TableHead className="text-xs">Match</TableHead>
                          <TableHead className="text-xs">Line</TableHead>
                          <TableHead className="text-xs">H2H Totals</TableHead>
                          <TableHead className="text-xs">Above</TableHead>
                          <TableHead className="text-xs">Below</TableHead>
                          <TableHead className="text-xs">Rate Values</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {preds.filter(p => p.h2h_totals && p.h2h_totals.length > 0).map(p => (
                          <TableRow key={p.match_id} className="border-border/20 hover:bg-card/80">
                            <TableCell className="font-mono text-xs">{p.match_id.slice(0, 12)}</TableCell>
                            <TableCell className="text-neon-cyan font-semibold">{p.bookmaker_line}</TableCell>
                            <TableCell className="text-xs font-mono">{p.h2h_totals.join(", ")}</TableCell>
                            <TableCell className="text-xs text-neon-green">{p.matches_above}</TableCell>
                            <TableCell className="text-xs text-neon-red">{p.matches_below}</TableCell>
                            <TableCell className="text-xs font-mono">{p.rate_values.map(v => v.toFixed(1)).join(", ")}</TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </ScrollArea>
                </CardContent>
              </Card>
            )}
          </TabsContent>

          {/* ============ SERVICES TAB ============ */}
          <TabsContent value="services" className="space-y-6">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-lg font-bold">Service Management</h2>
                <p className="text-sm text-muted-foreground">Monitor and control the scraper and engine services</p>
              </div>
              <Button variant="outline" size="sm" onClick={fetchServiceStatus} disabled={loadingStatus} className="gap-1.5 border-border/50 text-muted-foreground hover:text-foreground">
                <RefreshCw className={`w-3.5 h-3.5 ${loadingStatus ? "animate-spin" : ""}`} /> Refresh Status
              </Button>
            </div>

            <div className="grid md:grid-cols-2 gap-6">
              {/* Scraper card — full-width on mobile, half on desktop */}
              <Card className="bg-card/60 border-border/40">
                <CardHeader className="pb-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <div className={`w-2.5 h-2.5 rounded-full ${serviceStatus?.scraper?.status === "online" ? "bg-neon-green" : serviceStatus?.scraper?.status === "degraded" ? "bg-neon-yellow" : serviceStatus?.scraper?.status === "error" ? "bg-neon-red" : "bg-muted-foreground"} animate-pulse`} />
                      <CardTitle className="text-base">FlashScore Scraper</CardTitle>
                    </div>
                    <div className="flex items-center gap-1.5">
                      {serviceStatus?.scraper?.scraperStatus === "running" && (
                        <Badge className="bg-neon-yellow/15 text-neon-yellow border-neon-yellow/30 text-[10px] animate-pulse">
                          <Loader2 className="w-3 h-3 mr-1 animate-spin" />RUNNING
                        </Badge>
                      )}
                      <Badge variant="outline" className={
                        serviceStatus?.scraper?.status === "online" ? "border-neon-green/40 text-neon-green"
                          : serviceStatus?.scraper?.status === "degraded" ? "border-neon-yellow/40 text-neon-yellow"
                          : serviceStatus?.scraper?.status === "error" ? "border-neon-red/40 text-neon-red"
                          : "border-muted-foreground/30 text-muted-foreground"
                      }>
                        {serviceStatus?.scraper?.status?.toUpperCase() || "UNKNOWN"}
                      </Badge>
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="space-y-4">
                  {/* Stat blocks row */}
                  <div className="grid grid-cols-3 gap-2">
                    <div className="rounded-lg bg-background/50 border border-border/30 p-2.5 text-center">
                      <div className="text-[10px] text-muted-foreground mb-0.5">HTTP</div>
                      <div className={`text-lg font-bold font-mono ${serviceStatus?.scraper?.statusCode === 200 ? "text-neon-green" : "text-foreground"}`}>
                        {serviceStatus?.scraper?.statusCode ?? "—"}
                      </div>
                    </div>
                    <div className="rounded-lg bg-background/50 border border-border/30 p-2.5 text-center">
                      <div className="text-[10px] text-muted-foreground mb-0.5">STATE</div>
                      <div className={`text-sm font-bold ${serviceStatus?.scraper?.scraperStatus === "idle" ? "text-neon-green" : serviceStatus?.scraper?.scraperStatus === "running" ? "text-neon-yellow" : serviceStatus?.scraper?.scraperStatus === "error" ? "text-neon-red" : "text-muted-foreground"}`}>
                        {serviceStatus?.scraper?.scraperStatus?.toUpperCase() || (serviceStatus?.scraper?.status === "online" ? "IDLE" : "N/A")}
                      </div>
                    </div>
                    <div className="rounded-lg bg-background/50 border border-border/30 p-2.5 text-center">
                      <div className="text-[10px] text-muted-foreground mb-0.5">SCRAPE</div>
                      <div className="text-sm font-bold text-neon-yellow">
                        {serviceStatus?.scraper?.currentDay || serviceStatus?.scraper?.lastRun?.day || "—"}
                      </div>
                    </div>
                  </div>

                  {/* Last Run summary */}
                  {serviceStatus?.scraper?.lastRun && (
                    <div className={`rounded-lg border p-3 ${serviceStatus.scraper.lastRun.status === "success" ? "bg-neon-green/5 border-neon-green/20" : "bg-neon-red/5 border-neon-red/20"}`}>
                      <div className="flex items-center justify-between mb-2">
                        <div className="flex items-center gap-1.5">
                          {serviceStatus.scraper.lastRun.status === "success"
                            ? <CheckCircle2 className="w-3.5 h-3.5 text-neon-green" />
                            : <XCircle className="w-3.5 h-3.5 text-neon-red" />}
                          <span className="text-xs font-semibold">Last Run</span>
                        </div>
                        {serviceStatus.scraper.lastRun.scrape_type && (
                          <Badge variant="outline" className="text-[9px] h-4 border-border/40">
                            {serviceStatus.scraper.lastRun.scrape_type === "scheduled" ? "Scheduled" : "Results"}
                          </Badge>
                        )}
                      </div>
                      <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs">
                        {serviceStatus.scraper.lastRun.status === "success" ? (
                          <>
                            <div><span className="text-muted-foreground">Complete: </span><span className="text-neon-green font-semibold">{serviceStatus.scraper.lastRun.complete_matches}</span></div>
                            <div><span className="text-muted-foreground">Skipped: </span><span className="text-neon-yellow font-semibold">{serviceStatus.scraper.lastRun.incomplete_matches}</span></div>
                          </>
                        ) : (
                          <div className="col-span-2 text-neon-red break-all">{serviceStatus.scraper.lastRun.error || "Failed"}</div>
                        )}
                        {serviceStatus.scraper.lastRun.started_at && (
                          <div><span className="text-muted-foreground">Started: </span><span className="font-mono">{new Date(serviceStatus.scraper.lastRun.started_at).toLocaleTimeString()}</span></div>
                        )}
                        {serviceStatus.scraper.lastRun.finished_at && serviceStatus.scraper.lastRun.started_at && (
                          <div><span className="text-muted-foreground">Duration: </span>
                            <span className="font-mono">
                              {(() => {
                                const start = new Date(serviceStatus.scraper.lastRun.started_at!).getTime();
                                const end = new Date(serviceStatus.scraper.lastRun.finished_at!).getTime();
                                const secs = Math.round((end - start) / 1000);
                                if (secs < 60) return `${secs}s`;
                                const mins = Math.floor(secs / 60);
                                const remSecs = secs % 60;
                                return `${mins}m ${remSecs}s`;
                              })()}
                            </span>
                          </div>
                        )}
                      </div>
                    </div>
                  )}

                  {/* No runs yet message */}
                  {!serviceStatus?.scraper?.lastRun && serviceStatus?.scraper?.scraperStatus !== "running" && (
                    <div className="rounded-lg border border-border/30 bg-background/30 p-3 text-center">
                      <div className="text-xs text-muted-foreground">No scrape runs recorded yet</div>
                    </div>
                  )}

                  {/* Live progress section when running */}
                  {serviceStatus?.scraper?.scraperStatus === "running" && serviceStatus?.scraper?.progress && (
                    <div className="rounded-lg border border-neon-yellow/20 bg-neon-yellow/5 p-3 space-y-2.5">
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-semibold text-neon-yellow flex items-center gap-1.5">
                          <Activity className="w-3.5 h-3.5" /> Live Progress
                        </span>
                        <span className="text-xs font-mono text-neon-yellow">
                          {serviceStatus.scraper.progress.current_match_index}/{serviceStatus.scraper.progress.total_matches || "?"}
                        </span>
                      </div>
                      <Progress
                        value={serviceStatus.scraper.progress.total_matches > 0
                          ? Math.round((serviceStatus.scraper.progress.current_match_index / serviceStatus.scraper.progress.total_matches) * 100)
                          : 0
                        }
                        className="h-2.5"
                      />
                      <div className="text-[11px] text-muted-foreground truncate">
                        {serviceStatus.scraper.progress.progress_message || serviceStatus.scraper.progress.status_message || "Processing..."}
                      </div>
                      <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-[11px] text-muted-foreground">
                        {serviceStatus.scraper.progress.day && (
                          <div><span className="text-muted-foreground/60">Day: </span>{serviceStatus.scraper.progress.day}</div>
                        )}
                        {serviceStatus.scraper.progress.started_at && (
                          <>
                            <div><span className="text-muted-foreground/60">Started: </span><span className="font-mono">{new Date(serviceStatus.scraper.progress.started_at).toLocaleTimeString()}</span></div>
                            <div><span className="text-muted-foreground/60">Elapsed: </span>
                              <span className="font-mono">
                                {(() => {
                                  const start = new Date(serviceStatus.scraper.progress.started_at!).getTime();
                                  const elapsed = Math.round((Date.now() - start) / 1000);
                                  if (elapsed < 60) return `${elapsed}s`;
                                  const mins = Math.floor(elapsed / 60);
                                  const remSecs = elapsed % 60;
                                  return `${mins}m ${remSecs}s`;
                                })()}
                              </span>
                            </div>
                          </>
                        )}
                        {serviceStatus.scraper.progress.scrape_id && (
                          <div className="col-span-2"><span className="text-muted-foreground/60">Run: </span><span className="font-mono text-[10px]">{serviceStatus.scraper.progress.scrape_id}</span></div>
                        )}
                      </div>
                      {serviceStatus.scraper.progress.stop_requested && (
                        <div className="flex items-center gap-1.5 text-[11px] text-neon-yellow">
                          <AlertTriangle className="w-3 h-3" /><span>Stop requested — finishing current match</span>
                        </div>
                      )}
                      {serviceStatus.scraper.progress.error && (
                        <div className="p-1.5 rounded bg-neon-red/10 border border-neon-red/20">
                          <span className="text-[11px] text-neon-red break-all">{serviceStatus.scraper.progress.error}</span>
                        </div>
                      )}
                    </div>
                  )}

                  <Separator className="bg-border/30" />
                  {/* Service info */}
                  <div className="space-y-1 text-xs text-muted-foreground">
                    <div className="flex justify-between"><span>Endpoint</span><span className="font-mono text-[10px] truncate ml-2">{serviceStatus?.scraperUrl || "—"}</span></div>
                  </div>

                  {/* Trigger controls (admin only) */}
                  {isAdmin && <div className="space-y-2">
                    {serviceStatus?.scraper?.scraperStatus === "running" ? (
                      <Button variant="outline" onClick={handleStopScraper} disabled={stopLoading}
                        className="w-full gap-2 border-neon-red/30 text-neon-red hover:bg-neon-red/10">
                        {stopLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <ZapOff className="w-4 h-4" />}
                        Stop Scraper
                      </Button>
                    ) : (
                      <div className="flex gap-2">
                        <Select value={scraperDay} onValueChange={(v) => setScraperDay(v as "Today" | "Tomorrow")}>
                          <SelectTrigger className="h-9 text-xs bg-background border-border/50 w-full">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="Today">Today</SelectItem>
                            <SelectItem value="Tomorrow">Tomorrow</SelectItem>
                          </SelectContent>
                        </Select>
                        <Button variant="outline" onClick={handleTriggerScraper} disabled={scraperLoading}
                          className="shrink-0 gap-2 border-neon-green/30 text-neon-green hover:bg-neon-green/10">
                          {scraperLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Play className="w-4 h-4" />}
                          Run
                        </Button>
                      </div>
                    )}
                  </div>}
                  <div className={`grid ${isAdmin ? 'grid-cols-2' : 'grid-cols-1'} gap-2`}>
                    {isAdmin && <Button variant="outline" onClick={() => { setSelectedService("scraper"); }} className="gap-2 border-neon-cyan/30 text-neon-cyan hover:bg-neon-cyan/10 text-xs">
                      <Settings className="w-4 h-4" />Configure
                    </Button>}
                    <Button variant="outline" onClick={fetchServiceStatus} disabled={loadingStatus} className="gap-2 border-border/50 text-muted-foreground hover:text-foreground text-xs">
                      <RefreshCw className={`w-4 h-4 ${loadingStatus ? "animate-spin" : ""}`} />Refresh
                    </Button>
                  </div>
                </CardContent>
              </Card>

              {/* Engine card */}
              <Card className="bg-card/60 border-border/40">
                <CardHeader className="pb-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <div className={`w-2.5 h-2.5 rounded-full ${serviceStatus?.engine?.status === "online" ? "bg-neon-green" : serviceStatus?.engine?.status === "error" ? "bg-neon-red" : serviceStatus?.engine?.status === "degraded" ? "bg-neon-yellow" : "bg-muted-foreground"} animate-pulse`} />
                      <CardTitle className="text-base">ScoreWise Engine</CardTitle>
                    </div>
                    <Badge variant="outline" className={
                      serviceStatus?.engine?.status === "online" ? "border-neon-green/40 text-neon-green"
                        : serviceStatus?.engine?.status === "error" ? "border-neon-red/40 text-neon-red"
                        : serviceStatus?.engine?.status === "degraded" ? "border-neon-yellow/40 text-neon-yellow"
                        : "border-muted-foreground/30 text-muted-foreground"
                    }>
                      {serviceStatus?.engine?.status?.toUpperCase() || "UNKNOWN"}
                    </Badge>
                  </div>
                </CardHeader>
                <CardContent className="space-y-4">
                  {/* Stat blocks row */}
                  <div className="grid grid-cols-3 gap-2">
                    <div className="rounded-lg bg-background/50 border border-border/30 p-2.5 text-center">
                      <div className="text-[10px] text-muted-foreground mb-0.5">HTTP</div>
                      <div className={`text-lg font-bold font-mono ${serviceStatus?.engine?.statusCode === 200 ? "text-neon-green" : serviceStatus?.engine?.statusCode === 401 ? "text-neon-yellow" : "text-foreground"}`}>
                        {serviceStatus?.engine?.statusCode ?? "—"}
                      </div>
                    </div>
                    <div className="rounded-lg bg-background/50 border border-border/30 p-2.5 text-center">
                      <div className="text-[10px] text-muted-foreground mb-0.5">PREDICTIONS</div>
                      <div className="text-lg font-bold text-neon-green">{allPredictionsData?.total ?? "—"}</div>
                    </div>
                    <div className="rounded-lg bg-background/50 border border-border/30 p-2.5 text-center">
                      <div className="text-[10px] text-muted-foreground mb-0.5">SUCCESS</div>
                      <div className="text-lg font-bold font-mono">
                        {allPredictionsData && allPredictionsData.total > 0
                          ? `${Math.round((allPredictionsData.succeeded / allPredictionsData.total) * 100)}%`
                          : "—"}
                      </div>
                    </div>
                  </div>

                  {/* Prediction health breakdown */}
                  {allPredictionsData && allPredictionsData.total > 0 && (
                    <div className="rounded-lg border border-neon-green/20 bg-neon-green/5 p-3">
                      <div className="flex items-center gap-1.5 mb-2">
                        <CheckCircle2 className="w-3.5 h-3.5 text-neon-green" />
                        <span className="text-xs font-semibold">Prediction Health</span>
                      </div>
                      <div className="grid grid-cols-3 gap-2 text-xs text-center">
                        <div>
                          <div className="text-neon-green font-bold text-sm">{allPredictionsData.succeeded}</div>
                          <div className="text-muted-foreground text-[10px]">Succeeded</div>
                        </div>
                        <div>
                          <div className="text-neon-red font-bold text-sm">{allPredictionsData.failed}</div>
                          <div className="text-muted-foreground text-[10px]">Failed</div>
                        </div>
                        <div>
                          <div className="font-bold text-sm">{allPredictionsData.total}</div>
                          <div className="text-muted-foreground text-[10px]">Total</div>
                        </div>
                      </div>
                      {/* Mini progress bar showing success rate */}
                      <div className="mt-2 h-1.5 rounded-full bg-muted overflow-hidden">
                        <div
                          className="h-full rounded-full bg-neon-green transition-all"
                          style={{ width: `${Math.round((allPredictionsData.succeeded / allPredictionsData.total) * 100)}%` }}
                        />
                      </div>
                    </div>
                  )}

                  {/* Last updated info */}
                  <div className="space-y-1 text-xs text-muted-foreground">
                    <div className="flex justify-between"><span>Last Updated</span><span className="font-mono">{formatTime(allPredictionsData?.updated_at)}</span></div>
                    <div className="flex justify-between"><span>Source</span><span className="font-mono text-[10px] truncate ml-2">{allPredictionsData?.source || "N/A"}</span></div>
                    <div className="flex justify-between"><span>Endpoint</span><span className="font-mono text-[10px] truncate ml-2">{serviceStatus?.engineUrl || "—"}</span></div>
                  </div>

                  <Separator className="bg-border/30" />
                  <div className={`grid ${isAdmin ? 'grid-cols-3' : 'grid-cols-2'} gap-2`}>
                    <Button variant="outline" onClick={fetchAllPredictions} disabled={loadingPred} className="gap-2 border-border/50 text-muted-foreground hover:text-foreground text-xs">
                      <RefreshCw className={`w-4 h-4 ${loadingPred ? "animate-spin" : ""}`} />Reload
                    </Button>
                    <Button variant="outline" onClick={handleDownloadPredictions} disabled={!allPredictionsData} className="gap-2 border-border/50 text-muted-foreground hover:text-foreground text-xs">
                      <Download className="w-4 h-4" />Export
                    </Button>
                    {isAdmin && <Button variant="outline" onClick={() => { setSelectedService("engine"); }} className="gap-2 border-neon-cyan/30 text-neon-cyan hover:bg-neon-cyan/10 text-xs">
                      <Settings className="w-4 h-4" />Config
                    </Button>}
                  </div>
                </CardContent>
              </Card>
            </div>

            {/* Pipeline flow */}
            <Card className="bg-card/60 border-border/40">
              <CardHeader className="pb-3"><CardTitle className="text-sm font-semibold">Data Pipeline</CardTitle></CardHeader>
              <CardContent>
                <div className="flex items-center justify-center gap-2 sm:gap-4 py-4 overflow-x-auto">
                  <div className="flex flex-col items-center gap-1 min-w-[100px]">
                    <div className="w-12 h-12 rounded-xl bg-neon-cyan/10 flex items-center justify-center"><Search className="w-6 h-6 text-neon-cyan" /></div>
                    <span className="text-xs font-semibold">Scraper</span><StatusDot status={serviceStatus?.scraper?.status || "offline"} />
                  </div>
                  <ChevronRight className="w-5 h-5 text-muted-foreground/40 shrink-0" />
                  <div className="flex flex-col items-center gap-1 min-w-[100px]">
                    <div className="w-12 h-12 rounded-xl bg-neon-green/10 flex items-center justify-center"><Database className="w-6 h-6 text-neon-green" /></div>
                    <span className="text-xs font-semibold">Engine</span><StatusDot status={serviceStatus?.engine?.status || "offline"} />
                  </div>
                  <ChevronRight className="w-5 h-5 text-muted-foreground/40 shrink-0" />
                  <div className="flex flex-col items-center gap-1 min-w-[100px]">
                    <div className="w-12 h-12 rounded-xl bg-neon-yellow/10 flex items-center justify-center"><Eye className="w-6 h-6 text-neon-yellow" /></div>
                    <span className="text-xs font-semibold">Website</span><StatusDot status="online" />
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Manual match entry (admin only) — Phase 6 */}
            {isAdmin && (
              <Card className="bg-card/60 border-border/40">
                <CardHeader className="pb-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <div className="w-8 h-8 rounded-lg bg-neon-purple/10 flex items-center justify-center">
                        <TestTube className="w-4 h-4 text-neon-purple" />
                      </div>
                      <div>
                        <CardTitle className="text-sm font-semibold">Manual Match Entry</CardTitle>
                        <CardDescription className="text-xs">Bypass the scraper — submit a single match directly to the engine</CardDescription>
                      </div>
                    </div>
                    <Button variant="outline" size="sm" onClick={() => setShowManualEntry(!showManualEntry)} className="gap-1.5 text-xs">
                      {showManualEntry ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                      {showManualEntry ? "Hide" : "Show"}
                    </Button>
                  </div>
                </CardHeader>
                {showManualEntry && (
                  <CardContent className="space-y-4">
                    <div className="rounded-lg border border-neon-cyan/20 bg-neon-cyan/5 p-2.5 text-[11px] text-muted-foreground">
                      <Info className="w-3 h-3 inline mr-1 text-neon-cyan" />
                      The match is sent to <code className="text-neon-cyan">POST /api/ingest</code> with <code className="text-neon-cyan">source="manual_entry"</code>.
                      It runs the full prediction pipeline, merges into the store, and triggers the website webhook (cache invalidation + activity log).
                    </div>

                    {/* Required fields */}
                    <div className="grid sm:grid-cols-3 gap-3">
                      <div className="space-y-1.5">
                        <Label className="text-xs">Match ID <span className="text-neon-red">*</span></Label>
                        <Input
                          value={manualMatch.match_id}
                          onChange={(e) => setManualMatch({ ...manualMatch, match_id: e.target.value })}
                          placeholder="e.g. manual-2026-001"
                          className="h-9 text-xs bg-background/50"
                        />
                      </div>
                      <div className="space-y-1.5">
                        <Label className="text-xs">Home Team <span className="text-neon-red">*</span></Label>
                        <Input
                          value={manualMatch.home_team}
                          onChange={(e) => setManualMatch({ ...manualMatch, home_team: e.target.value })}
                          placeholder="e.g. Lakers"
                          className="h-9 text-xs bg-background/50"
                        />
                      </div>
                      <div className="space-y-1.5">
                        <Label className="text-xs">Away Team <span className="text-neon-red">*</span></Label>
                        <Input
                          value={manualMatch.away_team}
                          onChange={(e) => setManualMatch({ ...manualMatch, away_team: e.target.value })}
                          placeholder="e.g. Celtics"
                          className="h-9 text-xs bg-background/50"
                        />
                      </div>
                    </div>

                    {/* Odds fields */}
                    <div>
                      <Label className="text-xs mb-1.5 block">Odds</Label>
                      <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
                        <div className="space-y-1">
                          <Label className="text-[10px] text-muted-foreground">Match Total <span className="text-neon-red">*</span></Label>
                          <Input
                            type="number" step="0.5" min="0"
                            value={manualMatch.match_total}
                            onChange={(e) => setManualMatch({ ...manualMatch, match_total: e.target.value })}
                            placeholder="174.5"
                            className="h-9 text-xs bg-background/50"
                          />
                        </div>
                        <div className="space-y-1">
                          <Label className="text-[10px] text-muted-foreground">Over Odds</Label>
                          <Input
                            type="number" step="0.01" min="0"
                            value={manualMatch.over_odds}
                            onChange={(e) => setManualMatch({ ...manualMatch, over_odds: e.target.value })}
                            placeholder="1.90"
                            className="h-9 text-xs bg-background/50"
                          />
                        </div>
                        <div className="space-y-1">
                          <Label className="text-[10px] text-muted-foreground">Under Odds</Label>
                          <Input
                            type="number" step="0.01" min="0"
                            value={manualMatch.under_odds}
                            onChange={(e) => setManualMatch({ ...manualMatch, under_odds: e.target.value })}
                            placeholder="1.90"
                            className="h-9 text-xs bg-background/50"
                          />
                        </div>
                        <div className="space-y-1">
                          <Label className="text-[10px] text-muted-foreground">Home Odds</Label>
                          <Input
                            type="number" step="0.01" min="0"
                            value={manualMatch.home_odds}
                            onChange={(e) => setManualMatch({ ...manualMatch, home_odds: e.target.value })}
                            placeholder="1.85"
                            className="h-9 text-xs bg-background/50"
                          />
                        </div>
                        <div className="space-y-1">
                          <Label className="text-[10px] text-muted-foreground">Away Odds</Label>
                          <Input
                            type="number" step="0.01" min="0"
                            value={manualMatch.away_odds}
                            onChange={(e) => setManualMatch({ ...manualMatch, away_odds: e.target.value })}
                            placeholder="1.95"
                            className="h-9 text-xs bg-background/50"
                          />
                        </div>
                      </div>
                      <p className="text-[10px] text-muted-foreground mt-1">
                        Match total must end in <code className="text-neon-cyan">.5</code> — bookmaker lines cannot push.
                      </p>
                    </div>

                    {/* H2H JSON (optional, power-user) */}
                    <div className="space-y-1.5">
                      <Label className="text-xs">
                        H2H Matches <span className="text-muted-foreground">(optional — JSON array)</span>
                      </Label>
                      <Textarea
                        value={manualH2H}
                        onChange={(e) => setManualH2H(e.target.value)}
                        placeholder={`[
  {
    "home_team": "Lakers",
    "away_team": "Celtics",
    "home_score": 112,
    "away_score": 108,
    "date": "2025-12-10"
  }
]`}
                        className="font-mono text-[11px] bg-background/50 min-h-[100px]"
                      />
                      <p className="text-[10px] text-muted-foreground">
                        Dates must be <code className="text-neon-cyan">YYYY-MM-DD</code>. Scores must be integers in [0, 300].
                      </p>
                    </div>

                    {/* Actions */}
                    <div className="flex justify-end gap-2 pt-2">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => {
                          setManualMatch({
                            match_id: "", home_team: "", away_team: "",
                            match_total: "", over_odds: "", under_odds: "", home_odds: "", away_odds: "",
                          });
                          setManualH2H("");
                        }}
                        className="text-xs"
                      >
                        <RotateCcw className="w-3.5 h-3.5 mr-1" />Clear
                      </Button>
                      <Button
                        size="sm"
                        onClick={handleManualSubmit}
                        disabled={manualLoading}
                        className="gap-2 bg-neon-green/15 border border-neon-green/40 text-neon-green hover:bg-neon-green/25"
                      >
                        {manualLoading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Play className="w-3.5 h-3.5" />}
                        Submit to Engine
                      </Button>
                    </div>
                  </CardContent>
                )}
              </Card>
            )}
          </TabsContent>

          {/* ============ CONFIGURATION TAB (ADMIN ONLY) ============ */}
          {isAdmin && <TabsContent value="configuration" className="space-y-6">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-lg font-bold">Service Configuration</h2>
                <p className="text-sm text-muted-foreground">Manage URLs, API keys, and environment variables for each service</p>
              </div>
              <div className="flex gap-2">
                <Button variant="outline" size="sm" onClick={fetchConfigs} disabled={loadingConfigs} className="gap-1.5 border-border/50 text-muted-foreground hover:text-foreground">
                  <RefreshCw className={`w-3.5 h-3.5 ${loadingConfigs ? "animate-spin" : ""}`} />Reload
                </Button>
              </div>
            </div>

            {/* Service selector */}
            <div className="flex gap-2">
              {(["scraper", "engine", "website"] as ServiceName[]).map(svc => {
                const meta = SERVICE_META[svc];
                return (
                  <Button key={svc} variant={selectedService === svc ? "default" : "outline"}
                    onClick={() => setSelectedService(svc)}
                    className={`gap-2 ${selectedService === svc
                      ? "bg-neon-green text-background hover:bg-neon-green/90 font-bold"
                      : "border-border/50 text-muted-foreground hover:text-foreground"
                    }`}>
                    {meta.icon}{meta.label.split(" ").pop()}
                  </Button>
                );
              })}
            </div>

            {/* Service info banner */}
            <Card className="bg-card/60 border-border/40">
              <CardContent className="p-4">
                <div className="flex items-start gap-3">
                  <div className={`mt-0.5 ${SERVICE_META[selectedService].color}`}>{SERVICE_META[selectedService].icon}</div>
                  <div>
                    <h3 className="font-bold text-sm">{SERVICE_META[selectedService].label}</h3>
                    <p className="text-xs text-muted-foreground mt-0.5">{SERVICE_META[selectedService].description}</p>
                  </div>
                  <div className="ml-auto flex gap-2">
                    {(selectedService === "engine" || selectedService === "scraper") && (
                      <>
                        <Button variant="outline" size="sm" onClick={() => handleFetchRemoteConfig(selectedService)}
                          className="gap-1.5 border-neon-cyan/30 text-neon-cyan hover:bg-neon-cyan/10">
                          <RefreshCw className="w-3.5 h-3.5" />Fetch Live
                        </Button>
                        <Button variant="outline" size="sm" onClick={() => handlePushConfig(selectedService)}
                          disabled={pushingService === selectedService}
                          className="gap-1.5 border-neon-green/30 text-neon-green hover:bg-neon-green/10">
                          {pushingService === selectedService ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Upload className="w-3.5 h-3.5" />}
                          Push All to {SERVICE_META[selectedService].label.split(" ").pop()}
                        </Button>
                      </>
                    )}
                    <Button variant="outline" size="sm" onClick={() => handleTestConnection(selectedService)} disabled={testingService}
                      className={`gap-1.5 ${selectedService === "website" ? "hidden" : ""} border-neon-cyan/30 text-neon-cyan hover:bg-neon-cyan/10`}>
                      {testingService ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <TestTube className="w-3.5 h-3.5" />}Test Connection
                    </Button>
                  </div>
                </div>
                {testResult && testResult.service === selectedService && (
                  <div className={`mt-3 p-3 rounded-lg text-xs flex items-start gap-2 ${
                    testResult.success ? "bg-neon-green/10 border border-neon-green/20" : "bg-neon-red/10 border border-neon-red/20"
                  }`}>
                    {testResult.success ? <CheckCircle2 className="w-4 h-4 text-neon-green shrink-0 mt-0.5" /> : <XCircle className="w-4 h-4 text-neon-red shrink-0 mt-0.5" />}
                    <div>
                      <p className={`font-semibold ${testResult.success ? "text-neon-green" : "text-neon-red"}`}>
                        {testResult.success ? "Connection Successful" : "Connection Failed"}
                      </p>
                      <p className="text-muted-foreground mt-0.5">{testResult.message}</p>
                    </div>
                  </div>
                )}
                {pushResult && pushResult.service === selectedService && (
                  <div className={`mt-3 p-3 rounded-lg text-xs flex items-start gap-2 ${
                    pushResult.failed.length === 0 && pushResult.pushed.length > 0
                      ? "bg-neon-green/10 border border-neon-green/20"
                      : pushResult.pushed.length > 0
                      ? "bg-neon-yellow/10 border border-neon-yellow/20"
                      : "bg-neon-red/10 border border-neon-red/20"
                  }`}>
                    {pushResult.failed.length === 0 && pushResult.pushed.length > 0
                      ? <CheckCircle2 className="w-4 h-4 text-neon-green shrink-0 mt-0.5" />
                      : <AlertTriangle className="w-4 h-4 text-neon-yellow shrink-0 mt-0.5" />}
                    <div className="flex-1">
                      <p className={`font-semibold ${
                        pushResult.failed.length === 0 && pushResult.pushed.length > 0 ? "text-neon-green" : "text-neon-yellow"
                      }`}>
                        Pushed {pushResult.pushed.length} key{pushResult.pushed.length === 1 ? "" : "s"}
                        {pushResult.failed.length > 0 && `, ${pushResult.failed.length} failed`}
                      </p>
                      {pushResult.pushed.length > 0 && (
                        <p className="text-muted-foreground mt-0.5">OK: {pushResult.pushed.join(", ")}</p>
                      )}
                      {pushResult.failed.length > 0 && (
                        <p className="text-muted-foreground mt-0.5">
                          Failed: {pushResult.failed.map(f => `${f.key} (${f.error})`).join("; ")}
                        </p>
                      )}
                      {pushResult.message && (
                        <p className="text-muted-foreground mt-0.5 italic">{pushResult.message}</p>
                      )}
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Config variables table */}
            <Card className="bg-card/60 border-border/40">
              <CardHeader className="pb-2">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-sm font-semibold flex items-center gap-2">
                    <Key className="w-4 h-4 text-neon-cyan" />Variables for {SERVICE_META[selectedService].label}
                  </CardTitle>
                  <Button variant="outline" size="sm" onClick={() => setAddConfigOpen(true)} className="gap-1.5 border-neon-green/30 text-neon-green hover:bg-neon-green/10">
                    <Plus className="w-3.5 h-3.5" />Add Variable
                  </Button>
                </div>
              </CardHeader>
              <CardContent className="p-0">
                {loadingConfigs ? (
                  <div className="p-8 text-center"><Loader2 className="w-6 h-6 animate-spin text-muted-foreground mx-auto" /></div>
                ) : serviceConfigs.length === 0 ? (
                  <div className="p-8 text-center">
                    <Settings className="w-8 h-8 text-muted-foreground/30 mx-auto mb-2" />
                    <p className="text-sm text-muted-foreground">No configuration variables yet</p>
                  </div>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow className="border-border/40 hover:bg-transparent">
                        <TableHead className="text-xs w-[180px]">Key</TableHead>
                        <TableHead className="text-xs">Value (local DB)</TableHead>
                        {(selectedService === "engine" || selectedService === "scraper") && remoteConfigs[selectedService] && (
                          <TableHead className="text-xs">Live on {SERVICE_META[selectedService].label.split(" ").pop()}</TableHead>
                        )}
                        <TableHead className="text-xs w-[80px]">Secret</TableHead>
                        <TableHead className="text-xs w-[160px] text-right">Actions</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {serviceConfigs.map(cfg => {
                        // Look up the live value on the remote service (if fetched)
                        const remoteEntry = remoteConfigs[selectedService]?.find(r => {
                          // Map back from remote key to website key — for display only
                          if (selectedService === "engine") {
                            const engineToWebsite: Record<string, string> = {
                              "SCRAPER_URL": "scraper_url",
                              "SCRAPER_API_KEY": "scraper_api_key",
                              "WEBSITE_WEBHOOK_URL": "website_webhook_url",
                              "WEBSITE_WEBHOOK_SECRET": "website_webhook_secret",
                              "CORS_ALLOWED_ORIGINS": "cors_allowed_origins",
                            };
                            return engineToWebsite[r.key] === cfg.key;
                          }
                          if (selectedService === "scraper") {
                            const scraperToWebsite: Record<string, string> = {
                              "SCOREWISE_WEBHOOK_URL": "webhook_url",
                              "SCOREWISE_API_KEY": "api_key",
                              "SCRAPER_CRON_SCHEDULE": "cron_schedule",
                              "SCRAPER_LOG_LEVEL": "log_level",
                            };
                            return scraperToWebsite[r.key] === cfg.key;
                          }
                          return false;
                        });
                        return (
                        <TableRow key={cfg.id} className="border-border/20 hover:bg-card/80">
                          <TableCell>
                            <div className="flex items-center gap-2">
                              {cfg.secret ? <Lock className="w-3 h-3 text-neon-yellow" /> : <Key className="w-3 h-3 text-neon-cyan/60" />}
                              <span className="font-mono text-xs font-semibold">{cfg.key}</span>
                            </div>
                          </TableCell>
                          <TableCell>
                            {editingConfig === cfg.id ? (
                              <div className="flex items-center gap-2">
                                <Input
                                  type={cfg.secret && !revealedSecrets.has(cfg.id) ? "password" : "text"}
                                  value={editValue}
                                  onChange={(e) => setEditValue(e.target.value)}
                                  className="bg-background border-border/50 text-xs font-mono h-8"
                                  placeholder="Enter value..."
                                />
                                <Button size="icon" variant="ghost" className="h-8 w-8 text-neon-green hover:bg-neon-green/10 shrink-0"
                                  onClick={() => handleSaveConfig(cfg.id, cfg.service, cfg.key, editValue, cfg.secret)}
                                  disabled={savingConfig}>
                                  {savingConfig ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                                </Button>
                                <Button size="icon" variant="ghost" className="h-8 w-8 text-muted-foreground hover:bg-card shrink-0"
                                  onClick={() => { setEditingConfig(null); setEditValue(""); }}>
                                  <X className="w-4 h-4" />
                                </Button>
                              </div>
                            ) : (
                              <div className="flex items-center gap-2">
                                <span className="font-mono text-xs text-muted-foreground">
                                  {cfg.secret && !revealedSecrets.has(cfg.id) ? maskDisplay(cfg.value, cfg._hasValue) : cfg.value || "(empty)"}
                                </span>
                                {cfg.secret && (
                                  <Button size="icon" variant="ghost" className="h-6 w-6 text-muted-foreground hover:text-foreground shrink-0"
                                    onClick={() => toggleReveal(cfg.id)}>
                                    {revealedSecrets.has(cfg.id) ? <EyeOff className="w-3 h-3" /> : <Eye className="w-3 h-3" />}
                                  </Button>
                                )}
                              </div>
                            )}
                          </TableCell>
                          {(selectedService === "engine" || selectedService === "scraper") && remoteConfigs[selectedService] && (
                            <TableCell>
                              {remoteEntry ? (
                                <div className="flex items-center gap-2">
                                  <span className={`font-mono text-xs ${remoteEntry.has_override ? "text-neon-cyan" : "text-muted-foreground/70"}`}>
                                    {remoteEntry.is_secret ? maskDisplay(remoteEntry.value, remoteEntry.value.length > 0) : (remoteEntry.value || "(empty)")}
                                  </span>
                                  {remoteEntry.has_override && (
                                    <Badge variant="outline" className="text-[9px] border-neon-cyan/40 text-neon-cyan">override</Badge>
                                  )}
                                  {!remoteEntry.has_override && remoteEntry.value && (
                                    <Badge variant="outline" className="text-[9px] border-border text-muted-foreground/70">env</Badge>
                                  )}
                                </div>
                              ) : (
                                <span className="text-xs text-muted-foreground/40 italic">—</span>
                              )}
                            </TableCell>
                          )}
                          <TableCell>
                            {cfg.secret ? (
                              <Badge variant="outline" className="text-[10px] border-neon-yellow/40 text-neon-yellow">Secret</Badge>
                            ) : (
                              <Badge variant="outline" className="text-[10px] border-border text-muted-foreground">Plain</Badge>
                            )}
                          </TableCell>
                          <TableCell className="text-right">
                            <div className="flex items-center justify-end gap-1">
                              {(selectedService === "engine" || selectedService === "scraper") && editingConfig !== cfg.id && (
                                <TooltipProvider>
                                  <Tooltip>
                                    <TooltipTrigger asChild>
                                      <Button size="icon" variant="ghost" className="h-7 w-7 text-muted-foreground hover:text-neon-green"
                                        onClick={() => handlePushConfig(selectedService, [`${cfg.service}:${cfg.key}`])}
                                        disabled={pushingService === selectedService}>
                                        {pushingService === selectedService ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Upload className="w-3.5 h-3.5" />}
                                      </Button>
                                    </TooltipTrigger>
                                    <TooltipContent>Push this value to {SERVICE_META[selectedService].label.split(" ").pop()}</TooltipContent>
                                  </Tooltip>
                                </TooltipProvider>
                              )}
                              {editingConfig !== cfg.id && (
                                <TooltipProvider>
                                  <Tooltip>
                                    <TooltipTrigger asChild>
                                      <Button size="icon" variant="ghost" className="h-7 w-7 text-muted-foreground hover:text-neon-cyan"
                                        onClick={() => { setEditingConfig(cfg.id); setEditValue(""); }}>
                                        <Settings className="w-3.5 h-3.5" />
                                      </Button>
                                    </TooltipTrigger>
                                    <TooltipContent>Edit value</TooltipContent>
                                  </Tooltip>
                                </TooltipProvider>
                              )}
                              <TooltipProvider>
                                <Tooltip>
                                  <TooltipTrigger asChild>
                                    <Button size="icon" variant="ghost" className="h-7 w-7 text-muted-foreground hover:text-neon-red"
                                      onClick={() => handleDeleteConfig(cfg.service, cfg.key)}>
                                      <Trash2 className="w-3.5 h-3.5" />
                                    </Button>
                                  </TooltipTrigger>
                                  <TooltipContent>Delete variable</TooltipContent>
                                </Tooltip>
                              </TooltipProvider>
                            </div>
                          </TableCell>
                        </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
                )}
              </CardContent>
            </Card>

            {/* Add variable dialog */}
            <Dialog open={addConfigOpen} onOpenChange={setAddConfigOpen}>
              <DialogContent className="bg-card border-border/50">
                <DialogHeader>
                  <DialogTitle className="flex items-center gap-2">
                    <Plus className="w-5 h-5 text-neon-green" />Add Variable to {SERVICE_META[selectedService].label}
                  </DialogTitle>
                </DialogHeader>
                <div className="space-y-4 py-4">
                  <div className="space-y-2">
                    <Label>Key Name</Label>
                    <Input placeholder="e.g. api_key, cron_schedule, max_retries" value={newConfigKey} onChange={(e) => setNewConfigKey(e.target.value.replace(/\s/g, "_").toLowerCase())} className="bg-background border-border/50 font-mono" />
                    <p className="text-[11px] text-muted-foreground">Use lowercase with underscores. This becomes the variable identifier.</p>
                  </div>
                  <div className="space-y-2">
                    <Label>Value</Label>
                    <Textarea placeholder="Enter the value..." value={newConfigValue} onChange={(e) => setNewConfigValue(e.target.value)} className="bg-background border-border/50 font-mono min-h-[80px]" />
                  </div>
                  <div className="flex items-center gap-3">
                    <Switch checked={newConfigSecret} onCheckedChange={setNewConfigSecret} />
                    <div>
                      <Label>Secret value</Label>
                      <p className="text-[11px] text-muted-foreground">Mask this value in the UI (for API keys, passwords, etc.)</p>
                    </div>
                  </div>
                </div>
                <DialogFooter>
                  <DialogClose asChild><Button variant="ghost">Cancel</Button></DialogClose>
                  <Button onClick={handleAddConfig} disabled={savingConfig || !newConfigKey} className="bg-neon-green text-background hover:bg-neon-green/90">
                    {savingConfig && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}Add Variable
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>

            {/* Config documentation */}
            <Card className="bg-card/60 border-border/40">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-semibold flex items-center gap-2">
                  <Info className="w-4 h-4 text-neon-cyan" />Configuration Guide
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-3 text-xs text-muted-foreground">
                  <div className="grid md:grid-cols-3 gap-4">
                    <div className="bg-background/50 rounded-lg p-3 space-y-2">
                      <div className="flex items-center gap-2 text-neon-cyan font-semibold">
                        <Search className="w-4 h-4" />Scraper
                      </div>
                      <ul className="space-y-1 ml-6 list-disc">
                        <li><code className="text-neon-green">url</code> — Scraper service URL</li>
                        <li><code className="text-neon-green">api_key</code> — API key for scraper auth (X-API-Key)</li>
                        <li><code className="text-neon-green">webhook_url</code> — Engine ingestion endpoint</li>
                        <li><code className="text-neon-green">cron_schedule</code> — Cron expression for auto-runs</li>
                        <li><code className="text-neon-green">type</code> — Service type (api_server/cron)</li>
                      </ul>
                    </div>
                    <div className="bg-background/50 rounded-lg p-3 space-y-2">
                      <div className="flex items-center gap-2 text-neon-green font-semibold">
                        <Cpu className="w-4 h-4" />Engine
                      </div>
                      <ul className="space-y-1 ml-6 list-disc">
                        <li><code className="text-neon-green">url</code> — Engine service URL</li>
                        <li><code className="text-neon-green">api_key</code> — X-API-Key header value</li>
                      </ul>
                    </div>
                    <div className="bg-background/50 rounded-lg p-3 space-y-2">
                      <div className="flex items-center gap-2 text-neon-yellow font-semibold">
                        <Globe className="w-4 h-4" />Website
                      </div>
                      <ul className="space-y-1 ml-6 list-disc">
                        <li><code className="text-neon-green">auto_refresh_seconds</code> — User page refresh interval</li>
                        <li><code className="text-neon-green">max_predictions_display</code> — Max predictions shown</li>
                      </ul>
                    </div>
                  </div>
                  <Separator className="bg-border/30" />
                  <p className="flex items-center gap-1.5">
                    <Lock className="w-3 h-3 text-neon-yellow" />Secret values are masked in the UI and activity logs. Click the eye icon to reveal them.
                  </p>
                  <p className="flex items-center gap-1.5">
                    <AlertTriangle className="w-3 h-3 text-neon-yellow" />Critical keys (service URLs, API keys) cannot be deleted — only updated. All changes are logged in the Activity Log.
                  </p>
                </div>
              </CardContent>
            </Card>
          </TabsContent>}

          {/* ============ ACTIVITY LOG TAB (ADMIN ONLY) ============ */}
          {isAdmin && <TabsContent value="logs" className="space-y-6">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-lg font-bold">Activity Log</h2>
                <p className="text-sm text-muted-foreground">Audit trail of all admin actions and configuration changes</p>
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
                <Button variant="outline" size="sm" onClick={fetchLogs} disabled={loadingLogs} className="gap-1.5 border-border/50 text-muted-foreground hover:text-foreground">
                  <RefreshCw className={`w-3.5 h-3.5 ${loadingLogs ? "animate-spin" : ""}`} />Refresh
                </Button>
              </div>
            </div>

            {/* Log stats */}
            <div className="grid grid-cols-3 gap-3">
              <div className="bg-card/60 border border-border/40 rounded-lg px-3 py-2 text-center">
                <p className="text-xl font-black">{logsTotal}</p><p className="text-[10px] text-muted-foreground">Total Events</p>
              </div>
              <div className="bg-card/60 border border-neon-cyan/20 rounded-lg px-3 py-2 text-center">
                <p className="text-xl font-black text-neon-cyan">{logs.filter(l => l.action.startsWith("CONFIG_")).length}</p><p className="text-[10px] text-muted-foreground">Config Changes</p>
              </div>
              <div className="bg-card/60 border border-neon-yellow/20 rounded-lg px-3 py-2 text-center">
                <p className="text-xl font-black text-neon-yellow">{logs.filter(l => l.action.startsWith("USER_")).length}</p><p className="text-[10px] text-muted-foreground">User Actions</p>
              </div>
            </div>

            {/* Log entries */}
            <Card className="bg-card/60 border-border/40">
              <CardContent className="p-0">
                {loadingLogs ? (
                  <div className="p-8 text-center"><Loader2 className="w-6 h-6 animate-spin text-muted-foreground mx-auto" /></div>
                ) : logs.length === 0 ? (
                  <div className="p-8 text-center">
                    <FileText className="w-8 h-8 text-muted-foreground/30 mx-auto mb-2" />
                    <p className="text-sm text-muted-foreground">No activity recorded yet</p>
                  </div>
                ) : (
                  <ScrollArea className="max-h-[600px]">
                    <Table>
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
                        {logs.map(log => {
                          let details: Record<string, unknown> = {};
                          try { details = JSON.parse(log.details || "{}"); } catch {}

                          return (
                            <TableRow key={log.id} className="border-border/20 hover:bg-card/80">
                              <TableCell>{actionIcon(log.action)}</TableCell>
                              <TableCell>
                                <Badge variant="outline" className={`text-[10px] ${actionBadgeColor(log.action)}`}>
                                  {log.action}
                                </Badge>
                              </TableCell>
                              <TableCell>
                                {log.service ? (
                                  <Badge variant="outline" className="text-[10px] border-border text-muted-foreground capitalize">
                                    {log.service}
                                  </Badge>
                                ) : "—"}
                              </TableCell>
                              <TableCell className="text-xs text-muted-foreground font-mono max-w-[300px] truncate">
                                {renderLogDetails(log.action, details)}
                              </TableCell>
                              <TableCell className="text-xs">
                                <span className="text-muted-foreground">{log.user?.name || log.user?.email || "—"}</span>
                              </TableCell>
                              <TableCell className="text-xs text-muted-foreground font-mono">
                                {formatTime(log.createdAt)}
                              </TableCell>
                            </TableRow>
                          );
                        })}
                      </TableBody>
                    </Table>
                  </ScrollArea>
                )}
              </CardContent>
            </Card>
          </TabsContent>}

          {/* ============ USERS TAB ============ */}
          <TabsContent value="users" className="space-y-6">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-lg font-bold">User Management</h2>
                <p className="text-sm text-muted-foreground">{isAdmin ? "Manage admin, operator, and user accounts" : "View user accounts and activity"}</p>
              </div>
              <div className="flex gap-2">
                {isAdmin && <Dialog open={addUserOpen} onOpenChange={setAddUserOpen}>
                  <DialogTrigger asChild>
                    <Button size="sm" className="gap-1.5 bg-neon-green text-background hover:bg-neon-green/90 font-bold"><UserPlus className="w-3.5 h-3.5" /> Add User</Button>
                  </DialogTrigger>
                  <DialogContent className="bg-card border-border/50">
                    <DialogHeader><DialogTitle>Create New User</DialogTitle></DialogHeader>
                    <div className="space-y-4 py-4">
                      <div className="space-y-2"><Label>Email</Label><Input placeholder="user@example.com" value={newUserEmail} onChange={(e) => setNewUserEmail(e.target.value)} className="bg-background border-border/50" /></div>
                      <div className="space-y-2"><Label>Name (optional)</Label><Input placeholder="John Doe" value={newUserName} onChange={(e) => setNewUserName(e.target.value)} className="bg-background border-border/50" /></div>
                      <div className="space-y-2"><Label>Password</Label><Input type="password" placeholder="••••••••" value={newUserPassword} onChange={(e) => setNewUserPassword(e.target.value)} className="bg-background border-border/50" /></div>
                      <div className="space-y-2">
                        <Label>Role</Label>
                        <Select value={newUserRole} onValueChange={(v) => setNewUserRole(v as UserRole)}>
                          <SelectTrigger className="bg-background border-border/50"><SelectValue /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value="USER">User — View predictions only</SelectItem>
                            <SelectItem value="OPERATOR">Operator — Manage users & monitor services</SelectItem>
                            <SelectItem value="ADMIN">Admin — Full control</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                    </div>
                    <DialogFooter>
                      <DialogClose asChild><Button variant="ghost">Cancel</Button></DialogClose>
                      <Button onClick={handleCreateUser} disabled={creatingUser} className="bg-neon-green text-background hover:bg-neon-green/90">
                        {creatingUser && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}Create User
                      </Button>
                    </DialogFooter>
                  </DialogContent>
                </Dialog>}
                <Button variant="outline" size="sm" onClick={fetchUsers} disabled={loadingUsers} className="gap-1.5 border-border/50 text-muted-foreground hover:text-foreground">
                  <RefreshCw className={`w-3.5 h-3.5 ${loadingUsers ? "animate-spin" : ""}`} /> Refresh
                </Button>
              </div>
            </div>

            <div className="grid grid-cols-4 gap-3">
              <div className="bg-card/60 border border-border/40 rounded-lg px-3 py-2 text-center">
                <p className="text-xl font-black">{users.length}</p><p className="text-[10px] text-muted-foreground">Total</p>
              </div>
              <div className="bg-card/60 border border-neon-green/20 rounded-lg px-3 py-2 text-center">
                <p className="text-xl font-black text-neon-green">{users.filter(u => u.role === "ADMIN").length}</p><p className="text-[10px] text-muted-foreground">Admins</p>
              </div>
              <div className="bg-card/60 border border-neon-yellow/20 rounded-lg px-3 py-2 text-center">
                <p className="text-xl font-black text-neon-yellow">{users.filter(u => u.role === "OPERATOR").length}</p><p className="text-[10px] text-muted-foreground">Operators</p>
              </div>
              <div className="bg-card/60 border border-neon-cyan/20 rounded-lg px-3 py-2 text-center">
                <p className="text-xl font-black text-neon-cyan">{users.filter(u => u.role === "USER").length}</p><p className="text-[10px] text-muted-foreground">Users</p>
              </div>
            </div>

            <Card className="bg-card/60 border-border/40">
              <CardContent className="p-0">
                <Table>
                  <TableHeader>
                    <TableRow className="border-border/40 hover:bg-transparent">
                      <TableHead className="text-xs">Email</TableHead><TableHead className="text-xs">Name</TableHead><TableHead className="text-xs">Role</TableHead><TableHead className="text-xs">Created</TableHead>{isAdmin && <TableHead className="text-xs text-right">Actions</TableHead>}
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {loadingUsers ? (
                      <TableRow><TableCell colSpan={isAdmin ? 5 : 4} className="text-center py-8 text-muted-foreground"><Loader2 className="w-5 h-5 animate-spin mx-auto mb-2" />Loading...</TableCell></TableRow>
                    ) : users.length === 0 ? (
                      <TableRow><TableCell colSpan={isAdmin ? 5 : 4} className="text-center py-8 text-muted-foreground">No users found</TableCell></TableRow>
                    ) : (
                      users.map((u) => (
                        <TableRow key={u.id} className="border-border/20 hover:bg-card/80">
                          <TableCell className="text-sm font-medium">{u.email}</TableCell>
                          <TableCell className="text-sm text-muted-foreground">{u.name || "—"}</TableCell>
                          <TableCell>
                            <Badge className={u.role === "ADMIN" ? "bg-neon-green/15 text-neon-green border-neon-green/30" : u.role === "OPERATOR" ? "bg-neon-yellow/15 text-neon-yellow border-neon-yellow/30" : "bg-neon-cyan/15 text-neon-cyan border-neon-cyan/30"} variant="outline">
                              {u.role === "ADMIN" ? <Shield className="w-3 h-3 mr-1" /> : u.role === "OPERATOR" ? <Eye className="w-3 h-3 mr-1" /> : <Users className="w-3 h-3 mr-1" />}{u.role}
                            </Badge>
                          </TableCell>
                          <TableCell className="text-xs text-muted-foreground">{formatTime(u.createdAt)}</TableCell>
                          <TableCell className="text-right">
                            <div className="flex items-center justify-end gap-1">
                              {isAdmin && u.role !== "ADMIN" && (
                                <Tooltip><TooltipTrigger asChild>
                                  <Button variant="ghost" size="icon" onClick={() => handleChangeRole(u.id, u.role === "OPERATOR" ? "ADMIN" : "OPERATOR")} disabled={changingRole === u.id} className="text-neon-yellow hover:text-neon-green h-8 w-8">
                                    {changingRole === u.id ? <Loader2 className="w-4 h-4 animate-spin" /> : <ArrowUpRight className="w-4 h-4" />}
                                  </Button>
                                </TooltipTrigger><TooltipContent>Promote to {u.role === "OPERATOR" ? "Admin" : "Operator"}</TooltipContent></Tooltip>
                              )}
                              {isAdmin && u.role !== "USER" && (
                                <Tooltip><TooltipTrigger asChild>
                                  <Button variant="ghost" size="icon" onClick={() => handleChangeRole(u.id, u.role === "ADMIN" ? "OPERATOR" : "USER")} disabled={changingRole === u.id} className="text-muted-foreground hover:text-neon-red h-8 w-8">
                                    {changingRole === u.id ? <Loader2 className="w-4 h-4 animate-spin" /> : <ArrowDownRight className="w-4 h-4" />}
                                  </Button>
                                </TooltipTrigger><TooltipContent>Demote to {u.role === "ADMIN" ? "Operator" : "User"}</TooltipContent></Tooltip>
                              )}
                              {isAdmin && <Button variant="ghost" size="icon" onClick={() => handleDeleteUser(u.id, u.email)} className="text-muted-foreground hover:text-neon-red h-8 w-8"><Trash2 className="w-4 h-4" /></Button>}
                            </div>
                          </TableCell>
                        </TableRow>
                      ))
                    )}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>

            {isAdmin && <Card className="bg-card/60 border-border/40">
              <CardHeader className="pb-3"><CardTitle className="text-sm font-semibold">Role Permissions</CardTitle></CardHeader>
              <CardContent>
                <div className="grid md:grid-cols-3 gap-4">
                  <div className="bg-background/50 rounded-lg p-4 space-y-2">
                    <div className="flex items-center gap-2"><Shield className="w-5 h-5 text-neon-green" /><span className="font-bold text-neon-green">Admin</span></div>
                    <ul className="text-sm text-muted-foreground space-y-1 ml-7">
                      <li>Full dashboard with overview & analytics</li><li>All predictions (including failed)</li><li>Charts and data visualizations</li>
                      <li>Service monitoring and controls</li><li>User management (create/delete)</li>
                      <li>Promote/demote user roles</li><li>Export predictions data</li>
                      <li className="text-neon-cyan">Service configuration (URLs, API keys)</li>
                      <li className="text-neon-cyan">Activity log and audit trail</li>
                    </ul>
                  </div>
                  <div className="bg-background/50 rounded-lg p-4 space-y-2">
                    <div className="flex items-center gap-2"><Eye className="w-5 h-5 text-neon-yellow" /><span className="font-bold text-neon-yellow">Operator</span></div>
                    <ul className="text-sm text-muted-foreground space-y-1 ml-7">
                      <li>Dashboard overview & analytics</li><li>Successful predictions</li>
                      <li>Service monitoring (view only)</li>
                      <li>View user accounts</li>
                      <li>Track user activity</li>
                    </ul>
                  </div>
                  <div className="bg-background/50 rounded-lg p-4 space-y-2">
                    <div className="flex items-center gap-2"><Users className="w-5 h-5 text-neon-cyan" /><span className="font-bold text-neon-cyan">User</span></div>
                    <ul className="text-sm text-muted-foreground space-y-1 ml-7">
                      <li>Successful predictions only</li><li>Search and filter predictions</li><li>Confidence and recommendation filters</li><li>Auto-refresh every 60 seconds</li>
                    </ul>
                  </div>
                </div>
              </CardContent>
            </Card>}
          </TabsContent>
        </Tabs>
      </main>

      <footer className="border-t border-border/30 bg-card/30 mt-auto">
        <div className="max-w-7xl mx-auto px-4 py-4 text-center text-xs text-muted-foreground/60">ScoreWise {isAdmin ? "Admin" : "Dashboard"} — Data-driven basketball predictions</div>
      </footer>
    </div>
  );
}

// ===================== HELPER FUNCTIONS =====================

function maskDisplay(masked: string, hasValue: boolean): string {
  if (!hasValue) return "(not set)";
  return masked || "••••••••";
}

function renderLogDetails(action: string, details: Record<string, unknown>): string {
  if (action.startsWith("CONFIG_")) {
    const key = details.key as string;
    if (action === "CONFIG_CREATE") return `Created "${key}"`;
    if (action === "CONFIG_UPDATE") return `Updated "${key}"`;
    if (action === "CONFIG_DELETE") return `Deleted "${key}"`;
  }
  if (action === "USER_CREATE") return `Created user ${details.createdEmail || ""} (${details.createdRole || ""})`;
  if (action === "USER_DELETE") return `Deleted user ${details.deletedEmail || ""} (${details.deletedRole || ""})`;
  if (action === "USER_ROLE_CHANGE") return `Changed ${details.targetEmail || ""}: ${details.oldRole || ""} → ${details.newRole || ""}`;
  if (action === "SERVICE_CHECK") return `Checked ${details.url || "service"}`;
  if (action === "SERVICE_TRIGGER") return `Triggered: ${details.operation || "unknown"}`;
  return JSON.stringify(details);
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
