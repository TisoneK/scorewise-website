/**
 * ConfigurationTab — service configuration management.
 *
 * Extracted from src/app/page.tsx during Phase C modularization.
 *
 * Shows a per-service table of config variables (URLs, API keys, env vars)
 * with edit/push/delete actions. Admins can add new variables, push
 * individual or all variables to the remote service, fetch live values,
 * and test the connection.
 */

"use client";

import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { Separator } from "@/components/ui/separator";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogClose,
} from "@/components/ui/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  RefreshCw,
  Loader2,
  Upload,
  TestTube,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  Key,
  Plus,
  Settings,
  Lock,
  Save,
  X,
  EyeOff,
  Eye,
  Trash2,
  Info,
  Search,
  Cpu,
  Globe,
} from "lucide-react";
import type {
  ServiceConfigEntry,
  ServiceName,
} from "@/lib/types";
import { SERVICE_META } from "@/lib/admin/service-meta";
import { maskDisplay } from "@/lib/admin/formatters";

export interface ConfigurationTabProps {
  // Config data
  serviceConfigs: ServiceConfigEntry[];
  loadingConfigs: boolean;
  fetchConfigs: () => void;
  // Service selector
  selectedService: ServiceName;
  setSelectedService: (v: ServiceName) => void;
  // Edit state
  editingConfig: string | null;
  setEditingConfig: (v: string | null) => void;
  editValue: string;
  setEditValue: (v: string) => void;
  savingConfig: boolean;
  handleSaveConfig: (
    id: string,
    service: string,
    key: string,
    value: string,
    secret: boolean,
  ) => void;
  handleDeleteConfig: (service: string, key: string) => void;
  // Secret reveal
  revealedSecrets: Set<string>;
  toggleReveal: (id: string) => void;
  // Add variable dialog
  addConfigOpen: boolean;
  setAddConfigOpen: (v: boolean) => void;
  newConfigKey: string;
  setNewConfigKey: (v: string) => void;
  newConfigValue: string;
  setNewConfigValue: (v: string) => void;
  newConfigSecret: boolean;
  setNewConfigSecret: (v: boolean) => void;
  handleAddConfig: () => void;
  // Push to remote
  pushingService: string | null;
  pushResult: {
    service: string;
    pushed: string[];
    failed: { key: string; error: string }[];
    message?: string;
  } | null;
  handlePushConfig: (service: "engine" | "scraper", keys?: string[]) => void | Promise<void>;
  // Fetch live + test connection
  remoteConfigs: Record<
    string,
    { key: string; value: string; has_override: boolean; is_secret: boolean }[]
  >;
  handleFetchRemoteConfig: (service: "engine" | "scraper") => void | Promise<void>;
  handleTestConnection: (service: ServiceName) => void;
  testingService: boolean;
  testResult: {
    service: string;
    success: boolean;
    message: string;
    status?: string;
  } | null;
}

export function ConfigurationTab({
  serviceConfigs,
  loadingConfigs,
  fetchConfigs,
  selectedService,
  setSelectedService,
  editingConfig,
  setEditingConfig,
  editValue,
  setEditValue,
  savingConfig,
  handleSaveConfig,
  handleDeleteConfig,
  revealedSecrets,
  toggleReveal,
  addConfigOpen,
  setAddConfigOpen,
  newConfigKey,
  setNewConfigKey,
  newConfigValue,
  setNewConfigValue,
  newConfigSecret,
  setNewConfigSecret,
  handleAddConfig,
  pushingService,
  pushResult,
  handlePushConfig,
  remoteConfigs,
  handleFetchRemoteConfig,
  handleTestConnection,
  testingService,
  testResult,
}: ConfigurationTabProps) {
  return (
    <>
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-bold">Service Configuration</h2>
          <p className="text-sm text-muted-foreground">
            Manage URLs, API keys, and environment variables for each service
          </p>
        </div>
        <div className="flex gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={fetchConfigs}
            disabled={loadingConfigs}
            className="gap-1.5 border-border/50 text-muted-foreground hover:text-foreground"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loadingConfigs ? "animate-spin" : ""}`} />
            Reload
          </Button>
        </div>
      </div>

      {/* Service selector */}
      <div className="flex gap-2">
        {(["scraper", "engine", "website"] as ServiceName[]).map((svc) => {
          const meta = SERVICE_META[svc];
          return (
            <Button
              key={svc}
              variant={selectedService === svc ? "default" : "outline"}
              onClick={() => setSelectedService(svc)}
              className={`gap-2 ${
                selectedService === svc
                  ? "bg-neon-green text-background hover:bg-neon-green/90 font-bold"
                  : "border-border/50 text-muted-foreground hover:text-foreground"
              }`}
            >
              {meta.icon}
              {meta.label.split(" ").pop()}
            </Button>
          );
        })}
      </div>

      {/* Service info banner */}
      <Card className="bg-card/60 border-border/40">
        <CardContent className="p-4">
          <div className="flex items-start gap-3">
            <div className={`mt-0.5 ${SERVICE_META[selectedService].color}`}>
              {SERVICE_META[selectedService].icon}
            </div>
            <div>
              <h3 className="font-bold text-sm">
                {SERVICE_META[selectedService].label}
              </h3>
              <p className="text-xs text-muted-foreground mt-0.5">
                {SERVICE_META[selectedService].description}
              </p>
            </div>
            <div className="ml-auto flex gap-2">
              {(selectedService === "engine" || selectedService === "scraper") && (
                <>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => handleFetchRemoteConfig(selectedService as "engine" | "scraper")}
                    className="gap-1.5 border-neon-cyan/30 text-neon-cyan hover:bg-neon-cyan/10"
                  >
                    <RefreshCw className="w-3.5 h-3.5" />
                    Fetch Live
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => handlePushConfig(selectedService as "engine" | "scraper")}
                    disabled={pushingService === selectedService}
                    className="gap-1.5 border-neon-green/30 text-neon-green hover:bg-neon-green/10"
                  >
                    {pushingService === selectedService ? (
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    ) : (
                      <Upload className="w-3.5 h-3.5" />
                    )}
                    Push All to {SERVICE_META[selectedService].label.split(" ").pop()}
                  </Button>
                </>
              )}
              <Button
                variant="outline"
                size="sm"
                onClick={() => handleTestConnection(selectedService)}
                disabled={testingService}
                className={`gap-1.5 ${selectedService === "website" ? "hidden" : ""} border-neon-cyan/30 text-neon-cyan hover:bg-neon-cyan/10`}
              >
                {testingService ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <TestTube className="w-3.5 h-3.5" />
                )}
                Test Connection
              </Button>
            </div>
          </div>
          {testResult && testResult.service === selectedService && (
            <div
              className={`mt-3 p-3 rounded-lg text-xs flex items-start gap-2 ${
                testResult.success
                  ? "bg-neon-green/10 border border-neon-green/20"
                  : "bg-neon-red/10 border border-neon-red/20"
              }`}
            >
              {testResult.success ? (
                <CheckCircle2 className="w-4 h-4 text-neon-green shrink-0 mt-0.5" />
              ) : (
                <XCircle className="w-4 h-4 text-neon-red shrink-0 mt-0.5" />
              )}
              <div>
                <p
                  className={`font-semibold ${testResult.success ? "text-neon-green" : "text-neon-red"}`}
                >
                  {testResult.success ? "Connection Successful" : "Connection Failed"}
                </p>
                <p className="text-muted-foreground mt-0.5">{testResult.message}</p>
              </div>
            </div>
          )}
          {pushResult && pushResult.service === selectedService && (
            <div
              className={`mt-3 p-3 rounded-lg text-xs flex items-start gap-2 ${
                pushResult.failed.length === 0 && pushResult.pushed.length > 0
                  ? "bg-neon-green/10 border border-neon-green/20"
                  : pushResult.pushed.length > 0
                    ? "bg-neon-yellow/10 border border-neon-yellow/20"
                    : "bg-neon-red/10 border border-neon-red/20"
              }`}
            >
              {pushResult.failed.length === 0 && pushResult.pushed.length > 0 ? (
                <CheckCircle2 className="w-4 h-4 text-neon-green shrink-0 mt-0.5" />
              ) : (
                <AlertTriangle className="w-4 h-4 text-neon-yellow shrink-0 mt-0.5" />
              )}
              <div className="flex-1">
                <p
                  className={`font-semibold ${
                    pushResult.failed.length === 0 && pushResult.pushed.length > 0
                      ? "text-neon-green"
                      : "text-neon-yellow"
                  }`}
                >
                  Pushed {pushResult.pushed.length} key
                  {pushResult.pushed.length === 1 ? "" : "s"}
                  {pushResult.failed.length > 0 && `, ${pushResult.failed.length} failed`}
                </p>
                {pushResult.pushed.length > 0 && (
                  <p className="text-muted-foreground mt-0.5">
                    OK: {pushResult.pushed.join(", ")}
                  </p>
                )}
                {pushResult.failed.length > 0 && (
                  <p className="text-muted-foreground mt-0.5">
                    Failed:{" "}
                    {pushResult.failed.map((f) => `${f.key} (${f.error})`).join("; ")}
                  </p>
                )}
                {pushResult.message && (
                  <p className="text-muted-foreground mt-0.5 italic">
                    {pushResult.message}
                  </p>
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
              <Key className="w-4 h-4 text-neon-cyan" />
              Variables for {SERVICE_META[selectedService].label}
            </CardTitle>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setAddConfigOpen(true)}
              className="gap-1.5 border-neon-green/30 text-neon-green hover:bg-neon-green/10"
            >
              <Plus className="w-3.5 h-3.5" />
              Add Variable
            </Button>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          {loadingConfigs ? (
            <div className="p-8 text-center">
              <Loader2 className="w-6 h-6 animate-spin text-muted-foreground mx-auto" />
            </div>
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
                  {(selectedService === "engine" || selectedService === "scraper") &&
                    remoteConfigs[selectedService] && (
                      <TableHead className="text-xs">
                        Live on {SERVICE_META[selectedService].label.split(" ").pop()}
                      </TableHead>
                    )}
                  <TableHead className="text-xs w-[80px]">Secret</TableHead>
                  <TableHead className="text-xs w-[160px] text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {serviceConfigs.map((cfg) => {
                  // Look up the live value on the remote service (if fetched)
                  const remoteEntry = remoteConfigs[selectedService]?.find((r) => {
                    if (selectedService === "engine") {
                      const engineToWebsite: Record<string, string> = {
                        SCRAPER_URL: "scraper_url",
                        SCRAPER_API_KEY: "scraper_api_key",
                        WEBSITE_WEBHOOK_URL: "website_webhook_url",
                        WEBSITE_WEBHOOK_SECRET: "website_webhook_secret",
                        CORS_ALLOWED_ORIGINS: "cors_allowed_origins",
                      };
                      return engineToWebsite[r.key] === cfg.key;
                    }
                    if (selectedService === "scraper") {
                      const scraperToWebsite: Record<string, string> = {
                        SCOREWISE_WEBHOOK_URL: "webhook_url",
                        SCOREWISE_API_KEY: "api_key",
                        SCRAPER_CRON_SCHEDULE: "cron_schedule",
                        SCRAPER_LOG_LEVEL: "log_level",
                      };
                      return scraperToWebsite[r.key] === cfg.key;
                    }
                    return false;
                  });
                  return (
                    <TableRow key={cfg.id} className="border-border/20 hover:bg-card/80">
                      <TableCell>
                        <div className="flex items-center gap-2">
                          {cfg.secret ? (
                            <Lock className="w-3 h-3 text-neon-yellow" />
                          ) : (
                            <Key className="w-3 h-3 text-neon-cyan/60" />
                          )}
                          <span className="font-mono text-xs font-semibold">{cfg.key}</span>
                        </div>
                      </TableCell>
                      <TableCell>
                        {editingConfig === cfg.id ? (
                          <div className="flex items-center gap-2">
                            <Input
                              type={
                                cfg.secret && !revealedSecrets.has(cfg.id)
                                  ? "password"
                                  : "text"
                              }
                              value={editValue}
                              onChange={(e) => setEditValue(e.target.value)}
                              className="bg-background border-border/50 text-xs font-mono h-8"
                              placeholder="Enter value..."
                            />
                            <Button
                              size="icon"
                              variant="ghost"
                              className="h-8 w-8 text-neon-green hover:bg-neon-green/10 shrink-0"
                              onClick={() =>
                                handleSaveConfig(
                                  cfg.id,
                                  cfg.service,
                                  cfg.key,
                                  editValue,
                                  cfg.secret,
                                )
                              }
                              disabled={savingConfig}
                            >
                              {savingConfig ? (
                                <Loader2 className="w-4 h-4 animate-spin" />
                              ) : (
                                <Save className="w-4 h-4" />
                              )}
                            </Button>
                            <Button
                              size="icon"
                              variant="ghost"
                              className="h-8 w-8 text-muted-foreground hover:bg-card shrink-0"
                              onClick={() => {
                                setEditingConfig(null);
                                setEditValue("");
                              }}
                            >
                              <X className="w-4 h-4" />
                            </Button>
                          </div>
                        ) : (
                          <div className="flex items-center gap-2">
                            <span className="font-mono text-xs text-muted-foreground">
                              {cfg.secret && !revealedSecrets.has(cfg.id)
                                ? maskDisplay(cfg.value, cfg._hasValue)
                                : cfg.value || "(empty)"}
                            </span>
                            {cfg.secret && (
                              <Button
                                size="icon"
                                variant="ghost"
                                className="h-6 w-6 text-muted-foreground hover:text-foreground shrink-0"
                                onClick={() => toggleReveal(cfg.id)}
                              >
                                {revealedSecrets.has(cfg.id) ? (
                                  <EyeOff className="w-3 h-3" />
                                ) : (
                                  <Eye className="w-3 h-3" />
                                )}
                              </Button>
                            )}
                          </div>
                        )}
                      </TableCell>
                      {(selectedService === "engine" || selectedService === "scraper") &&
                        remoteConfigs[selectedService] && (
                          <TableCell>
                            {remoteEntry ? (
                              <div className="flex items-center gap-2">
                                <span
                                  className={`font-mono text-xs ${remoteEntry.has_override ? "text-neon-cyan" : "text-muted-foreground/70"}`}
                                >
                                  {remoteEntry.is_secret
                                    ? maskDisplay(
                                        remoteEntry.value,
                                        remoteEntry.value.length > 0,
                                      )
                                    : remoteEntry.value || "(empty)"}
                                </span>
                                {remoteEntry.has_override && (
                                  <Badge
                                    variant="outline"
                                    className="text-[9px] border-neon-cyan/40 text-neon-cyan"
                                  >
                                    override
                                  </Badge>
                                )}
                                {!remoteEntry.has_override && remoteEntry.value && (
                                  <Badge
                                    variant="outline"
                                    className="text-[9px] border-border text-muted-foreground/70"
                                  >
                                    env
                                  </Badge>
                                )}
                              </div>
                            ) : (
                              <span className="text-xs text-muted-foreground/40 italic">—</span>
                            )}
                          </TableCell>
                        )}
                      <TableCell>
                        {cfg.secret ? (
                          <Badge
                            variant="outline"
                            className="text-[10px] bg-neon-yellow/10 border-neon-yellow/40 text-neon-yellow font-semibold"
                          >
                            <Lock className="w-2.5 h-2.5 mr-1" />Secret
                          </Badge>
                        ) : (
                          <Badge
                            variant="outline"
                            className="text-[10px] border-border text-muted-foreground"
                          >
                            Plain
                          </Badge>
                        )}
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex items-center justify-end gap-1">
                          {(selectedService === "engine" || selectedService === "scraper") &&
                            editingConfig !== cfg.id && (
                              <TooltipProvider>
                                <Tooltip>
                                  <TooltipTrigger asChild>
                                    <Button
                                      size="icon"
                                      variant="ghost"
                                      className="h-7 w-7 text-muted-foreground hover:text-neon-green"
                                      onClick={() =>
                                        handlePushConfig(selectedService as "engine" | "scraper", [
                                          `${cfg.service}:${cfg.key}`,
                                        ])
                                      }
                                      disabled={pushingService === selectedService}
                                    >
                                      {pushingService === selectedService ? (
                                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                                      ) : (
                                        <Upload className="w-3.5 h-3.5" />
                                      )}
                                    </Button>
                                  </TooltipTrigger>
                                  <TooltipContent>
                                    Push this value to{" "}
                                    {SERVICE_META[selectedService].label.split(" ").pop()}
                                  </TooltipContent>
                                </Tooltip>
                              </TooltipProvider>
                            )}
                          {editingConfig !== cfg.id && (
                            <TooltipProvider>
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <Button
                                    size="icon"
                                    variant="ghost"
                                    className="h-7 w-7 text-muted-foreground hover:text-neon-cyan"
                                    onClick={() => {
                                      setEditingConfig(cfg.id);
                                      setEditValue("");
                                    }}
                                  >
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
                                <Button
                                  size="icon"
                                  variant="ghost"
                                  className="h-7 w-7 text-muted-foreground hover:text-neon-red"
                                  onClick={() => handleDeleteConfig(cfg.service, cfg.key)}
                                >
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
              <Plus className="w-5 h-5 text-neon-green" />
              Add Variable to {SERVICE_META[selectedService].label}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label>Key Name</Label>
              <Input
                placeholder="e.g. api_key, cron_schedule, max_retries"
                value={newConfigKey}
                onChange={(e) =>
                  setNewConfigKey(e.target.value.replace(/\s/g, "_").toLowerCase())
                }
                className="bg-background border-border/50 font-mono"
              />
              <p className="text-[11px] text-muted-foreground">
                Use lowercase with underscores. This becomes the variable identifier.
              </p>
            </div>
            <div className="space-y-2">
              <Label>Value</Label>
              <Textarea
                placeholder="Enter the value..."
                value={newConfigValue}
                onChange={(e) => setNewConfigValue(e.target.value)}
                className="bg-background border-border/50 font-mono min-h-[80px]"
              />
            </div>
            <div className="flex items-center gap-3">
              <Switch checked={newConfigSecret} onCheckedChange={setNewConfigSecret} />
              <div>
                <Label>Secret value</Label>
                <p className="text-[11px] text-muted-foreground">
                  Mask this value in the UI (for API keys, passwords, etc.)
                </p>
              </div>
            </div>
          </div>
          <DialogFooter>
            <DialogClose asChild>
              <Button variant="ghost">Cancel</Button>
            </DialogClose>
            <Button
              onClick={handleAddConfig}
              disabled={savingConfig || !newConfigKey}
              className="bg-neon-green text-background hover:bg-neon-green/90"
            >
              {savingConfig && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              Add Variable
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Config documentation */}
      <Card className="bg-card/60 border-border/40">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-semibold flex items-center gap-2">
            <Info className="w-4 h-4 text-neon-cyan" />
            Configuration Guide
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-3 text-xs text-muted-foreground">
            <div className="grid md:grid-cols-3 gap-4">
              <div className="bg-background/50 rounded-lg p-3 space-y-2">
                <div className="flex items-center gap-2 text-neon-cyan font-semibold">
                  <Search className="w-4 h-4" />
                  Scraper
                </div>
                <ul className="space-y-1 ml-6 list-disc">
                  <li>
                    <code className="text-neon-green">url</code> — Scraper service URL
                  </li>
                  <li>
                    <code className="text-neon-green">api_key</code> — API key for
                    scraper auth (X-API-Key)
                  </li>
                  <li>
                    <code className="text-neon-green">webhook_url</code> — Engine
                    ingestion endpoint
                  </li>
                  <li>
                    <code className="text-neon-green">cron_schedule</code> — Cron
                    expression for auto-runs
                  </li>
                  <li>
                    <code className="text-neon-green">type</code> — Service type
                    (api_server/cron)
                  </li>
                </ul>
              </div>
              <div className="bg-background/50 rounded-lg p-3 space-y-2">
                <div className="flex items-center gap-2 text-neon-green font-semibold">
                  <Cpu className="w-4 h-4" />
                  Engine
                </div>
                <ul className="space-y-1 ml-6 list-disc">
                  <li>
                    <code className="text-neon-green">url</code> — Engine service URL
                  </li>
                  <li>
                    <code className="text-neon-green">api_key</code> — X-API-Key header
                    value
                  </li>
                </ul>
              </div>
              <div className="bg-background/50 rounded-lg p-3 space-y-2">
                <div className="flex items-center gap-2 text-neon-yellow font-semibold">
                  <Globe className="w-4 h-4" />
                  Website
                </div>
                <ul className="space-y-1 ml-6 list-disc">
                  <li>
                    <code className="text-neon-green">auto_refresh_seconds</code> — User
                    page refresh interval
                  </li>
                  <li>
                    <code className="text-neon-green">max_predictions_display</code> — Max
                    predictions shown
                  </li>
                </ul>
              </div>
            </div>
            <Separator className="bg-border/30" />
            <p className="flex items-center gap-1.5">
              <Lock className="w-3 h-3 text-neon-yellow" />
              Secret values are masked in the UI and activity logs. Click the eye icon
              to reveal them.
            </p>
            <p className="flex items-center gap-1.5">
              <AlertTriangle className="w-3 h-3 text-neon-yellow" />
              Critical keys (service URLs, API keys) cannot be deleted — only updated.
              All changes are logged in the Activity Log.
            </p>
          </div>
        </CardContent>
      </Card>
    </>
  );
}
