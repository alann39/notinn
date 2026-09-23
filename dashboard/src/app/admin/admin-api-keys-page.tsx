import { useState, useEffect, useCallback } from "react";
import {
  ShieldCheck,
  RefreshCw,
  Sparkles,
  Server,
  Activity,
  Check,
  Copy,
  AlertCircle,
  Eye,
  EyeOff,
  KeyRound,
  Cpu,
} from "lucide-react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import {
  Dialog,
  DialogPopup,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
  DialogClose,
} from "@/components/ui/dialog";
import { toastManager } from "@/components/ui/toast";
import { useAdmin } from "@/hooks/use-admin";
import type { AdminProviderKey, AdminKeyTestResult } from "@/types/admin";
import { formatRelativeTime } from "@/lib/utils";

interface ProviderMeta {
  id: "gemini" | "openrouter";
  name: string;
  role: string;
  defaultModel: string;
  icon: typeof Sparkles;
  docsUrl: string;
  presets: { label: string; value: string; desc?: string }[];
}

const PROVIDERS: ProviderMeta[] = [
  {
    id: "gemini",
    name: "Google Gemini",
    role: "Primary Note Extraction & Semantic Embeddings",
    defaultModel: "gemini-2.5-flash",
    icon: Sparkles,
    docsUrl: "https://aistudio.google.com/app/apikey",
    presets: [
      { label: "gemini-2.5-flash", value: "gemini-2.5-flash", desc: "Default, recommended multimodal note generation" },
      { label: "gemini-2.5-flash-lite", value: "gemini-2.5-flash-lite", desc: "Lightweight, lowest latency" },
      { label: "gemini-2.0-flash", value: "gemini-2.0-flash", desc: "High throughput stable" },
      { label: "gemini-1.5-pro", value: "gemini-1.5-pro", desc: "Deep multi-step reasoning" },
    ],
  },
  {
    id: "openrouter",
    name: "OpenRouter",
    role: "Controlled Cross-Provider Fallback",
    defaultModel: "openrouter/auto",
    icon: Server,
    docsUrl: "https://openrouter.ai/keys",
    presets: [
      { label: "openrouter/auto", value: "openrouter/auto", desc: "Auto-routes to best available free/cheap provider" },
      { label: "meta-llama/llama-3.3-70b-instruct:free", value: "meta-llama/llama-3.3-70b-instruct:free", desc: "Open weights instruction model" },
      { label: "deepseek/deepseek-chat", value: "deepseek/deepseek-chat", desc: "High reasoning performance" },
      { label: "google/gemini-2.5-flash", value: "google/gemini-2.5-flash", desc: "Gemini via OpenRouter gateway" },
      { label: "anthropic/claude-3.5-sonnet", value: "anthropic/claude-3.5-sonnet", desc: "Advanced fallback quality" },
    ],
  },
];

export function AdminApiKeysPage() {
  const {
    listProviderKeys,
    setProviderKey,
    setProviderModel,
    testVaultedProviderKey,
    testProviderKeyDirect,
  } = useAdmin();

  const [keys, setKeys] = useState<AdminProviderKey[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  // Per-card active test running state
  const [testingActiveId, setTestingActiveId] = useState<string | null>(null);

  // Model selection state
  const [isCustomModel, setIsCustomModel] = useState<Record<string, boolean>>({});
  const [customModelText, setCustomModelText] = useState<Record<string, string>>({});
  const [savingModelProvider, setSavingModelProvider] = useState<string | null>(null);

  // Rotate Key Dialog state
  const [dialogProvider, setDialogProvider] = useState<ProviderMeta | null>(null);
  const [newKeyInput, setNewKeyInput] = useState("");
  const [showKeyText, setShowKeyText] = useState(false);
  const [dialogTesting, setDialogTesting] = useState(false);
  const [dialogTestResult, setDialogTestResult] = useState<AdminKeyTestResult | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  const fetchKeys = useCallback(async (isRefresh = false) => {
    if (isRefresh) setRefreshing(true);
    else setLoading(true);

    try {
      const data = await listProviderKeys();
      setKeys(data);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Failed to load provider keys";
      toastManager.add({
        title: "Error Loading Keys",
        description: message,
        type: "error",
      });
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [listProviderKeys]);

  useEffect(() => {
    fetchKeys();
  }, [fetchKeys]);

  const handleCopy = (id: string, text: string) => {
    navigator.clipboard.writeText(text);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  // --- Dedicated Action 1: Server-side Test of Vaulted Key ---
  const handleTestActiveKey = async (providerId: "gemini" | "openrouter") => {
    setTestingActiveId(providerId);
    try {
      const res = await testVaultedProviderKey(providerId);

      // Optimistically update key card state
      setKeys((prev) =>
        prev.map((k) =>
          k.provider === providerId
            ? {
                ...k,
                last_test_status: res.status,
                last_test_latency_ms: res.latency_ms,
                last_test_error: res.error_message,
                last_tested_at: new Date().toISOString(),
              }
            : k,
        ),
      );

      if (res.status === "healthy") {
        toastManager.add({
          title: "Connection Healthy",
          description: `Server verified upstream API in ${res.latency_ms}ms.`,
          type: "success",
        });
      } else {
        toastManager.add({
          title: "Connection Failed",
          description: res.error_message || "Upstream provider rejected credential.",
          type: "error",
        });
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Test request failed";
      toastManager.add({
        title: "Test Execution Error",
        description: msg,
        type: "error",
      });
    } finally {
      setTestingActiveId(null);
    }
  };

  // --- Dedicated Action 2: Rotate Key in Vault ---
  const handleOpenRotateDialog = (p: ProviderMeta) => {
    setDialogProvider(p);
    setNewKeyInput("");
    setShowKeyText(false);
    setDialogTestResult(null);
  };

  const handleTestInDialog = async () => {
    if (!dialogProvider || !newKeyInput.trim()) return;
    setDialogTesting(true);
    setDialogTestResult(null);
    try {
      const res = await testProviderKeyDirect(dialogProvider.id, newKeyInput);
      setDialogTestResult(res);
      if (res.status === "healthy") {
        toastManager.add({
          title: "Connection Successful",
          description: `Latency: ${res.latency_ms}ms`,
          type: "success",
        });
      } else {
        toastManager.add({
          title: "Connection Failed",
          description: res.error_message || "Invalid API key",
          type: "error",
        });
      }
    } finally {
      setDialogTesting(false);
    }
  };

  const handleSaveKey = async () => {
    if (!dialogProvider || !newKeyInput.trim()) return;
    setIsSaving(true);
    try {
      const status = dialogTestResult?.status || "untested";
      const latency = dialogTestResult?.latency_ms;
      const errorMsg = dialogTestResult?.error_message ?? undefined;

      await setProviderKey(dialogProvider.id, newKeyInput, status, latency, errorMsg);
      toastManager.add({
        title: "API Key Rotated",
        description: `${dialogProvider.name} key has been vaulted securely.`,
        type: "success",
      });
      setDialogProvider(null);
      fetchKeys(true);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Failed to save key";
      toastManager.add({
        title: "Save Failed",
        description: message,
        type: "error",
      });
    } finally {
      setIsSaving(false);
    }
  };

  // --- Model Selection Handler ---
  const handleModelChange = async (providerId: string, modelName: string) => {
    if (modelName === "custom") {
      setIsCustomModel((prev) => ({ ...prev, [providerId]: true }));
      return;
    }

    setIsCustomModel((prev) => ({ ...prev, [providerId]: false }));
    setSavingModelProvider(providerId);

    try {
      await setProviderModel(providerId, modelName);
      setKeys((prev) =>
        prev.map((k) => (k.provider === providerId ? { ...k, selected_model: modelName } : k)),
      );
      toastManager.add({
        title: "AI Model Updated",
        description: `Active model switched to ${modelName}.`,
        type: "success",
      });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Failed to update model";
      toastManager.add({
        title: "Model Update Failed",
        description: msg,
        type: "error",
      });
    } finally {
      setSavingModelProvider(null);
    }
  };

  const handleSaveCustomModel = async (providerId: string) => {
    const customValue = customModelText[providerId]?.trim();
    if (!customValue || customValue.length < 2) {
      toastManager.add({
        title: "Invalid Model ID",
        description: "Please enter a valid model identifier (e.g. gemini-2.5-flash).",
        type: "error",
      });
      return;
    }

    setSavingModelProvider(providerId);
    try {
      await setProviderModel(providerId, customValue);
      setKeys((prev) =>
        prev.map((k) => (k.provider === providerId ? { ...k, selected_model: customValue } : k)),
      );
      toastManager.add({
        title: "Custom Model Saved",
        description: `Active model set to ${customValue}.`,
        type: "success",
      });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Failed to save custom model";
      toastManager.add({
        title: "Save Failed",
        description: msg,
        type: "error",
      });
    } finally {
      setSavingModelProvider(null);
    }
  };

  return (
    <div className="space-y-6 max-w-5xl mx-auto">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-foreground">
              AI Provider Keys
            </h1>
            <Badge variant="outline" className="font-mono text-[10px]">
              Vaulted
            </Badge>
          </div>
          <p className="text-xs sm:text-sm text-muted-foreground mt-0.5">
            Configure upstream LLM credentials and active models for note processing, OCR, and fallback routines.
          </p>
        </div>

        <Button
          variant="outline"
          size="sm"
          onClick={() => fetchKeys(true)}
          disabled={refreshing}
          className="gap-1.5 text-xs font-medium cursor-pointer self-start sm:self-auto"
        >
          <RefreshCw className={`size-3.5 ${refreshing ? "animate-spin" : ""}`} />
          <span>Refresh</span>
        </Button>
      </div>

      {/* Security Guarantee Notice */}
      <div className="p-4 rounded-2xl border border-emerald-500/20 bg-emerald-500/5 text-emerald-600 dark:text-emerald-400 text-xs flex items-start gap-3">
        <ShieldCheck className="size-4.5 shrink-0 mt-0.5" />
        <div className="space-y-1">
          <span className="font-semibold block">Zero Plaintext Exposure Guarantee</span>
          <p className="text-[11px] opacity-90 leading-relaxed">
            API keys are vaulted in PostgreSQL with strict Row Level Security (<code className="font-mono text-[10px]">REVOKE ALL</code>). 
            Client interfaces only receive masked hints (e.g. <code className="font-mono text-[10px]">AIzaSy…9x12</code>) and latency metrics. 
            All live connection tests run on the server through secure Edge Functions.
          </p>
        </div>
      </div>

      {/* Provider Cards Grid */}
      {loading && !refreshing ? (
        <div className="flex flex-col items-center justify-center py-20 space-y-3">
          <Spinner className="size-6 text-foreground" />
          <p className="text-xs text-muted-foreground font-medium">Loading vaulted provider keys…</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {PROVIDERS.map((p) => {
            const keyRecord = keys.find((k) => k.provider === p.id);
            const isHealthy = keyRecord?.last_test_status === "healthy";
            const isUnhealthy = keyRecord?.last_test_status === "unhealthy";
            const activeModel = keyRecord?.selected_model || p.defaultModel;
            const isTestingThis = testingActiveId === p.id;
            const isSavingModelThis = savingModelProvider === p.id;
            const isCustom = isCustomModel[p.id] || !p.presets.some((m) => m.value === activeModel);

            return (
              <Card
                key={p.id}
                className="rounded-2xl border-border bg-card p-5 space-y-4 hover:border-foreground/20 transition-all flex flex-col justify-between"
              >
                <div className="space-y-3.5">
                  {/* Top Bar: Icon + Provider Name + Health Badge */}
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-center gap-2.5">
                      <div className="flex size-9 items-center justify-center rounded-xl bg-muted text-foreground">
                        <p.icon className="size-4.5" />
                      </div>
                      <div>
                        <h3 className="text-sm font-semibold text-foreground flex items-center gap-1.5">
                          {p.name}
                        </h3>
                        <p className="text-[11px] text-muted-foreground line-clamp-1">
                          {p.role}
                        </p>
                      </div>
                    </div>

                    <div className="flex flex-col items-end gap-1">
                      <Badge
                        variant="secondary"
                        className={`text-[10px] font-medium ${
                          isHealthy
                            ? "bg-emerald-500/10 text-emerald-500"
                            : isUnhealthy
                            ? "bg-destructive/10 text-destructive"
                            : "bg-muted text-muted-foreground"
                        }`}
                      >
                        {isHealthy ? "Healthy" : isUnhealthy ? "Failed" : "Untested"}
                      </Badge>
                      {keyRecord?.last_test_latency_ms !== null && keyRecord?.last_test_latency_ms !== undefined && (
                        <span className="text-[10px] font-mono text-muted-foreground">
                          {keyRecord.last_test_latency_ms}ms
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Active Model Selector */}
                  <div className="space-y-1.5 p-3 rounded-xl border border-border/80 bg-muted/20">
                    <div className="flex items-center justify-between text-xs">
                      <span className="font-medium text-foreground flex items-center gap-1.5">
                        <Cpu className="size-3.5 text-indigo-500" />
                        <span>Active Model</span>
                      </span>
                      {isSavingModelThis && (
                        <span className="text-[10px] text-muted-foreground flex items-center gap-1">
                          <Spinner className="size-2.5" />
                          <span>Saving…</span>
                        </span>
                      )}
                    </div>

                    <div className="space-y-2">
                      <select
                        aria-label={`Select active model for ${p.name}`}
                        value={isCustom ? "custom" : activeModel}
                        onChange={(e) => handleModelChange(p.id, e.target.value)}
                        disabled={isSavingModelThis}
                        className="w-full text-xs font-mono bg-background border border-border rounded-lg px-2.5 py-1.5 text-foreground focus:outline-none focus:ring-1 focus:ring-ring cursor-pointer"
                      >
                        {p.presets.map((preset) => (
                          <option key={preset.value} value={preset.value}>
                            {preset.label}
                          </option>
                        ))}
                        <option value="custom">Custom Model…</option>
                      </select>

                      {isCustom && (
                        <div className="flex items-center gap-1.5 pt-1">
                          <Input
                            placeholder="Enter custom model identifier"
                            value={customModelText[p.id] ?? activeModel}
                            onChange={(e) =>
                              setCustomModelText((prev) => ({
                                ...prev,
                                [p.id]: e.target.value,
                              }))
                            }
                            className="h-8 text-xs font-mono"
                          />
                          <Button
                            size="sm"
                            variant="secondary"
                            onClick={() => handleSaveCustomModel(p.id)}
                            disabled={isSavingModelThis}
                            className="h-8 text-xs cursor-pointer px-3 shrink-0"
                          >
                            Save
                          </Button>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Vaulted Masked Key Box */}
                  <div className="space-y-1.5">
                    <span className="text-[11px] font-medium text-muted-foreground block">
                      Active Key Hint
                    </span>
                    <div className="flex items-center justify-between p-2.5 rounded-xl border border-border bg-muted/20">
                      <span className="font-mono text-xs text-foreground tracking-wide">
                        {keyRecord?.key_hint || "No key configured"}
                      </span>
                      {keyRecord?.key_hint && (
                        <button
                          type="button"
                          onClick={() => handleCopy(p.id, keyRecord.key_hint)}
                          className="p-1 rounded text-muted-foreground hover:text-foreground transition-colors cursor-pointer"
                          title="Copy Key Hint"
                        >
                          {copiedId === p.id ? (
                            <Check className="size-3.5 text-emerald-500" />
                          ) : (
                            <Copy className="size-3.5" />
                          )}
                        </button>
                      )}
                    </div>
                  </div>

                  {/* Last Tested & Error Details */}
                  <div className="text-[11px] text-muted-foreground space-y-1 pt-0.5">
                    <div className="flex items-center justify-between">
                      <span>Last Checked:</span>
                      <span className="font-medium text-foreground">
                        {keyRecord?.last_tested_at ? formatRelativeTime(keyRecord.last_tested_at) : "Never"}
                      </span>
                    </div>

                    {keyRecord?.last_test_error && (
                      <p className="font-mono text-[10px] text-destructive truncate">
                        Err: {keyRecord.last_test_error}
                      </p>
                    )}
                  </div>
                </div>

                {/* Card Actions: Separated Test Connection & Rotate Key */}
                <div className="pt-3 border-t border-border flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-2">
                  <a
                    href={p.docsUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="text-[11px] text-muted-foreground hover:text-foreground hover:underline self-center sm:self-auto"
                  >
                    Get API Key ↗
                  </a>

                  <div className="flex items-center gap-2">
                    {/* Action 1: Test Connection (Server-Side) */}
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => handleTestActiveKey(p.id)}
                      disabled={isTestingThis}
                      className="text-xs h-8 cursor-pointer gap-1.5 flex-1 sm:flex-initial"
                    >
                      {isTestingThis ? (
                        <Spinner className="size-3" />
                      ) : (
                        <Activity className="size-3.5 text-blue-500" />
                      )}
                      <span>{isTestingThis ? "Testing…" : "Test Connection"}</span>
                    </Button>

                    {/* Action 2: Rotate Key (Opens Dialog) */}
                    <Button
                      variant="default"
                      size="sm"
                      onClick={() => handleOpenRotateDialog(p)}
                      className="text-xs h-8 cursor-pointer gap-1.5 flex-1 sm:flex-initial"
                    >
                      <KeyRound className="size-3.5" />
                      <span>Rotate Key</span>
                    </Button>
                  </div>
                </div>
              </Card>
            );
          })}
        </div>
      )}

      {/* Rotate Key Modal Dialog */}
      <Dialog
        open={Boolean(dialogProvider)}
        onOpenChange={(open) => {
          if (!open) setDialogProvider(null);
        }}
      >
        <DialogPopup className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Rotate {dialogProvider?.name} Key</DialogTitle>
            <DialogDescription>
              Enter a new API key to replace the active key in the server vault.
            </DialogDescription>
          </DialogHeader>

          <div className="p-6 space-y-4">
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-foreground block">
                New API Key
              </label>
              <div className="relative">
                <Input
                  type={showKeyText ? "text" : "password"}
                  placeholder={dialogProvider?.id === "gemini" ? "AIzaSy..." : "sk-or-v1-..."}
                  value={newKeyInput}
                  onChange={(e) => {
                    setNewKeyInput(e.target.value);
                    setDialogTestResult(null);
                  }}
                  className="pr-10 text-xs font-mono h-9"
                />
                <button
                  type="button"
                  onClick={() => setShowKeyText(!showKeyText)}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 p-1 text-muted-foreground hover:text-foreground"
                >
                  {showKeyText ? <EyeOff className="size-3.5" /> : <Eye className="size-3.5" />}
                </button>
              </div>
            </div>

            {/* Test Connection Inside Dialog Before Saving */}
            <div className="flex items-center justify-between pt-1">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={handleTestInDialog}
                disabled={dialogTesting || !newKeyInput.trim()}
                className="gap-1.5 text-xs h-8 cursor-pointer"
              >
                {dialogTesting ? <Spinner className="size-3" /> : <Activity className="size-3.5 text-blue-500" />}
                <span>Test Before Saving</span>
              </Button>

              {dialogTestResult && (
                <Badge
                  variant="secondary"
                  className={`text-[10px] ${
                    dialogTestResult.status === "healthy"
                      ? "bg-emerald-500/10 text-emerald-500"
                      : "bg-destructive/10 text-destructive"
                  }`}
                >
                  {dialogTestResult.status === "healthy"
                    ? `Verified (${dialogTestResult.latency_ms}ms)`
                    : "Failed"}
                </Badge>
              )}
            </div>

            {dialogTestResult?.error_message && (
              <div className="p-3 rounded-xl bg-destructive/10 border border-destructive/20 text-destructive text-[11px] flex items-start gap-2">
                <AlertCircle className="size-4 shrink-0 mt-0.5" />
                <span className="leading-snug">{dialogTestResult.error_message}</span>
              </div>
            )}
          </div>

          <DialogFooter>
            <DialogClose
              render={
                <Button variant="outline" size="sm">
                  Cancel
                </Button>
              }
            />
            <Button
              size="sm"
              disabled={isSaving || !newKeyInput.trim() || newKeyInput.trim().length < 8}
              onClick={handleSaveKey}
              className="cursor-pointer"
            >
              {isSaving ? <Spinner className="size-3.5" /> : "Save to Vault"}
            </Button>
          </DialogFooter>
        </DialogPopup>
      </Dialog>
    </div>
  );
}
