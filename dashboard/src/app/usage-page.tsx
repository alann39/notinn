import { useEffect, useState, useCallback } from "react";
import { supabase } from "@/lib/supabase";
import { Header } from "@/components/layout/header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import {
  Calendar,
  Clock,
  Sparkles,
} from "lucide-react";
import { Spinner } from "@/components/ui/spinner";
import {
  Progress,
  ProgressTrack,
  ProgressIndicator,
} from "@/components/ui/progress";
import {
  Empty,
  EmptyMedia,
  EmptyHeader,
  EmptyTitle,
  EmptyDescription,
} from "@/components/ui/empty";
import { UpgradeDrawer } from "@/components/dashboard/upgrade-drawer";
import type { RawUsageRow, UsageSummary } from "@/types/usage";

export function UsagePage() {
  const [usage, setUsage] = useState<UsageSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [isUpgradeOpen, setIsUpgradeOpen] = useState(false);

  const loadUsage = useCallback(async () => {
    try {
      const { data, error } = await supabase.rpc("web_get_usage_summary");
      if (error) throw error;
      if (Array.isArray(data) && data.length > 0) {
        const rows = data as RawUsageRow[];
        const first = rows[0];
        setUsage({
          plan_key: first.plan_key,
          plan_display_name: first.plan_display_name,
          period_start: first.period_start,
          period_end: first.period_end,
          metrics: rows.map((r) => ({
            metric: r.metric,
            display_name: r.display_name,
            used: Number(r.used),
            monthly_limit: Number(r.monthly_limit),
            reserved: Number(r.reserved),
          })),
        });
      }
    } catch (err) {
      console.error("Failed to load usage:", err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadUsage();
  }, [loadUsage]);

  if (loading) {
    return (
      <>
        <Header title="Usage" />
        <div className="flex flex-col items-center justify-center py-32 px-4 max-w-sm mx-auto space-y-3">
          <Spinner className="size-6 text-foreground" />
          <p className="text-xs font-medium text-muted-foreground">Loading usage metrics…</p>
        </div>
      </>
    );
  }

  return (
    <>
      <Header title="Usage" />
      <div className="p-4 sm:p-6 md:p-8 space-y-6 max-w-3xl mx-auto">
        {usage ? (
          <>
            {/* Plan Card */}
            <Card className="p-6 transition-colors rounded-2xl">
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <span className="text-xs uppercase tracking-wider text-muted-foreground font-semibold">
                      Current Plan
                    </span>
                    <Badge variant="default" className="text-[10px] capitalize font-semibold">
                      {usage.plan_key}
                    </Badge>
                  </div>
                  <h2 className="text-2xl font-bold text-foreground tracking-tight">
                    {usage.plan_display_name}
                  </h2>
                </div>

                <div className="flex items-center gap-2 text-xs text-muted-foreground bg-muted/50 rounded-lg px-3 py-2 border border-border">
                  <Calendar className="size-3.5 text-muted-foreground" />
                  <span>
                    Billing cycle:{" "}
                    <span className="tabular-nums text-foreground font-medium">
                      {new Date(usage.period_start).toLocaleDateString()}
                    </span>{" "}
                    –{" "}
                    <span className="tabular-nums text-foreground font-medium">
                      {new Date(usage.period_end).toLocaleDateString()}
                    </span>
                  </span>
                </div>
              </div>
            </Card>

            {/* Metrics Section */}
            <div className="space-y-4">
              <div className="flex items-center justify-between px-1">
                <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  Resource Limits & Consumption
                </h3>
                <span className="text-xs text-muted-foreground">Resets each cycle</span>
              </div>

              <div className="grid gap-3">
                {usage.metrics.map((metric) => {
                  const totalUsed = metric.used + metric.reserved;
                  const limit = metric.monthly_limit;
                  const percentage = limit > 0
                    ? Math.round((totalUsed / limit) * 100)
                    : 0;

                  return (
                    <Card
                      key={metric.metric}
                      className="p-5 space-y-3 transition-colors rounded-2xl"
                    >
                      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-semibold text-foreground tracking-tight">
                            {metric.display_name}
                          </span>
                          {metric.reserved > 0 && (
                            <span className="inline-flex items-center gap-1 text-[11px] text-muted-foreground bg-muted px-2 py-0.5 rounded border border-border">
                              <Clock className="size-3" />
                              <span className="tabular-nums">{metric.reserved}</span> pending
                            </span>
                          )}
                        </div>

                        <div className="flex items-center gap-2">
                          <span className="text-sm font-medium text-foreground tabular-nums">
                            {metric.used}
                            <span className="text-muted-foreground font-normal"> / {limit}</span>
                          </span>
                          <Badge variant="secondary" className="text-xs font-mono">
                            {percentage}%
                          </Badge>
                        </div>
                      </div>

                      {/* Coss Minimalist Progress Bar */}
                      <Progress value={Math.min(100, Math.max(0, percentage))} className="w-full">
                        <ProgressTrack className="h-2 bg-muted/60 border border-border/40">
                          <ProgressIndicator
                            style={{ width: `${Math.min(100, Math.max(0, percentage))}%` }}
                          />
                        </ProgressTrack>
                      </Progress>
                    </Card>
                  );
                })}
              </div>
            </div>

            {/* Upgrade CTA */}
            {usage.plan_key !== "pro" && (
              <Card className="p-6 border border-primary/20 bg-primary/5 rounded-2xl">
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                  <div className="space-y-1.5">
                    <div className="flex items-center gap-2">
                      <Sparkles className="size-4 text-primary" />
                      <h3 className="text-base font-semibold text-foreground tracking-tight">
                        Upgrade ke Notinn Pro
                      </h3>
                      <span className="text-xs px-2 py-0.5 rounded-full bg-primary/10 text-primary font-medium border border-primary/20">
                        Promo Rp 10.000 / bln
                      </span>
                    </div>
                    <p className="text-sm text-muted-foreground leading-relaxed">
                      Akses Web Dashboard penuh selamanya (Free plan terbatas 14 hari), kuota 1.000 catatan/bulan, dan pemrosesan AI prioritas.
                    </p>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <Button
                      variant="default"
                      size="sm"
                      onClick={() => setIsUpgradeOpen(true)}
                      className="gap-1.5 text-xs font-medium cursor-pointer"
                    >
                      <Sparkles className="size-3.5" />
                      <span>Bayar via TipTap</span>
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => window.open("https://t.me/NotinnBot", "_blank")}
                      className="gap-1.5 text-xs font-medium cursor-pointer"
                    >
                      <span>Buka Bot</span>
                    </Button>
                  </div>
                </div>
              </Card>
            )}
          </>
        ) : (
          <Empty className="border border-dashed border-border rounded-2xl bg-card/40 py-12">
            <EmptyMedia variant="icon">
              <Sparkles className="size-5 text-muted-foreground" />
            </EmptyMedia>
            <EmptyHeader>
              <EmptyTitle>Usage information currently unavailable</EmptyTitle>
              <EmptyDescription>
                Your account usage metrics will update once you capture your first notes.
              </EmptyDescription>
            </EmptyHeader>
          </Empty>
        )}

        <UpgradeDrawer
          open={isUpgradeOpen}
          onOpenChange={setIsUpgradeOpen}
          onUpgraded={loadUsage}
        />
      </div>
    </>
  );
}
