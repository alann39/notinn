import { useEffect, useState, useCallback } from "react";
import { Link } from "react-router-dom";
import {
  Layers,
  AlertTriangle,
  Users,
  FileText,
  Trash2,
  RefreshCw,
  CheckCircle2,
  AlertCircle,
  XCircle,
  ArrowRight,
} from "lucide-react";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Spinner } from "@/components/ui/spinner";
import { useAdmin } from "@/hooks/use-admin";
import type { AdminHealth } from "@/types/admin";
import { formatRelativeTime } from "@/lib/utils";

export function AdminOverviewPage() {
  const { getHealth } = useAdmin();
  const [health, setHealth] = useState<AdminHealth | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [lastUpdated, setLastUpdated] = useState<Date>(new Date());
  const [error, setError] = useState<string | null>(null);

  const fetchHealth = useCallback(async (isRefresh = false) => {
    if (isRefresh) setRefreshing(true);
    else setLoading(true);
    setError(null);

    try {
      const data = await getHealth();
      setHealth(data);
      setLastUpdated(new Date());
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Failed to load system health metrics";
      setError(message);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [getHealth]);

  useEffect(() => {
    fetchHealth();
  }, [fetchHealth]);

  const getSystemStatus = () => {
    if (!health) return { label: "UNKNOWN", variant: "secondary" as const, icon: AlertCircle };
    if (health.stale_jobs > 0 || health.deletion_backlog > 0) {
      return { label: "CRITICAL", variant: "destructive" as const, icon: XCircle };
    }
    if (health.failed_jobs > 0) {
      return { label: "WARNING", variant: "default" as const, icon: AlertTriangle };
    }
    return { label: "OPERATIONAL", variant: "secondary" as const, icon: CheckCircle2 };
  };

  const status = getSystemStatus();

  if (loading && !health) {
    return (
      <div className="flex flex-col items-center justify-center py-24 space-y-3">
        <Spinner className="size-6 text-foreground" />
        <p className="text-xs text-muted-foreground font-medium">Gathering cluster metrics…</p>
      </div>
    );
  }

  return (
    <div className="max-w-6xl mx-auto space-y-8">
      {/* Title & Refresh Control */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-foreground">
            System Overview & Health
          </h1>
          <p className="text-xs text-muted-foreground mt-1">
            Real-time pipeline metrics, queue depth, and operational health.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <span className="text-[11px] text-muted-foreground font-mono">
            Updated {formatRelativeTime(lastUpdated)}
          </span>
          <Button
            variant="outline"
            size="sm"
            onClick={() => fetchHealth(true)}
            disabled={refreshing}
            className="gap-1.5 text-xs font-medium cursor-pointer"
          >
            <RefreshCw className={`size-3.5 ${refreshing ? "animate-spin" : ""}`} />
            <span>Refresh</span>
          </Button>
        </div>
      </div>

      {error && (
        <div className="p-4 rounded-xl bg-destructive/10 border border-destructive/20 text-destructive text-xs flex items-center gap-2">
          <AlertCircle className="size-4 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {/* Cluster Status Banner */}
      <Card className="rounded-2xl border-border bg-card/60 backdrop-blur-xs p-6">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div className="flex items-center gap-3">
            <div
              className={`flex size-10 items-center justify-center rounded-xl ${
                status.label === "CRITICAL"
                  ? "bg-destructive text-destructive-foreground"
                  : status.label === "WARNING"
                    ? "bg-amber-500/20 text-amber-500"
                    : "bg-emerald-500/20 text-emerald-500"
              }`}
            >
              <status.icon className="size-5" />
            </div>
            <div>
              <div className="text-xs text-muted-foreground font-medium">Cluster Health Status</div>
              <div className="text-lg font-bold tracking-tight text-foreground flex items-center gap-2">
                <span>{status.label}</span>
                <Badge
                  variant={status.variant}
                  className="text-[10px] uppercase font-mono tracking-wider"
                >
                  Postgres 17 Engine
                </Badge>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              render={
                <Link to="/admin/jobs" className="gap-1 text-xs">
                  <span>Inspect Jobs</span>
                  <ArrowRight className="size-3" />
                </Link>
              }
            />
            <Button
              variant="outline"
              size="sm"
              render={
                <Link to="/admin/users" className="gap-1 text-xs">
                  <span>Manage Users</span>
                  <ArrowRight className="size-3" />
                </Link>
              }
            />
          </div>
        </div>
      </Card>

      {/* Health Metrics Grid (6 rounded-2xl Cards) */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {/* Queue Depth */}
        <Card className="rounded-2xl border-border bg-card hover:border-border/80 transition-colors">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-xs font-medium text-muted-foreground">Queue Depth</CardTitle>
            <div className="flex size-7 items-center justify-center rounded-lg bg-blue-500/10 text-blue-500">
              <Layers className="size-4" />
            </div>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold tracking-tight text-foreground font-mono">
              {health?.queue_depth ?? 0}
            </div>
            <p className="text-[11px] text-muted-foreground mt-1">In-flight active capture jobs</p>
          </CardContent>
        </Card>

        {/* Stale Jobs (>10m) */}
        <Card className="rounded-2xl border-border bg-card hover:border-border/80 transition-colors">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-xs font-medium text-muted-foreground">Stale Jobs (&gt;10m)</CardTitle>
            <div
              className={`flex size-7 items-center justify-center rounded-lg ${
                (health?.stale_jobs ?? 0) > 0
                  ? "bg-destructive/10 text-destructive"
                  : "bg-muted text-muted-foreground"
              }`}
            >
              <AlertTriangle className="size-4" />
            </div>
          </CardHeader>
          <CardContent>
            <div
              className={`text-3xl font-bold tracking-tight font-mono ${
                (health?.stale_jobs ?? 0) > 0 ? "text-destructive" : "text-foreground"
              }`}
            >
              {health?.stale_jobs ?? 0}
            </div>
            <p className="text-[11px] text-muted-foreground mt-1">
              Uncompleted jobs exceeding SLA limit
            </p>
          </CardContent>
        </Card>

        {/* Failed Jobs */}
        <Card className="rounded-2xl border-border bg-card hover:border-border/80 transition-colors">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-xs font-medium text-muted-foreground">Failed Jobs</CardTitle>
            <div
              className={`flex size-7 items-center justify-center rounded-lg ${
                (health?.failed_jobs ?? 0) > 0
                  ? "bg-amber-500/10 text-amber-500"
                  : "bg-muted text-muted-foreground"
              }`}
            >
              <AlertCircle className="size-4" />
            </div>
          </CardHeader>
          <CardContent>
            <div
              className={`text-3xl font-bold tracking-tight font-mono ${
                (health?.failed_jobs ?? 0) > 0 ? "text-amber-500" : "text-foreground"
              }`}
            >
              {health?.failed_jobs ?? 0}
            </div>
            <p className="text-[11px] text-muted-foreground mt-1">Terminal or retryable errors</p>
          </CardContent>
        </Card>

        {/* Deletion Backlog */}
        <Card className="rounded-2xl border-border bg-card hover:border-border/80 transition-colors">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-xs font-medium text-muted-foreground">Deletion Backlog</CardTitle>
            <div className="flex size-7 items-center justify-center rounded-lg bg-muted text-muted-foreground">
              <Trash2 className="size-4" />
            </div>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold tracking-tight text-foreground font-mono">
              {health?.deletion_backlog ?? 0}
            </div>
            <p className="text-[11px] text-muted-foreground mt-1">Scheduled account scrub backlog</p>
          </CardContent>
        </Card>

        {/* Active Users */}
        <Card className="rounded-2xl border-border bg-card hover:border-border/80 transition-colors">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-xs font-medium text-muted-foreground">Active Users</CardTitle>
            <div className="flex size-7 items-center justify-center rounded-lg bg-emerald-500/10 text-emerald-500">
              <Users className="size-4" />
            </div>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold tracking-tight text-foreground font-mono">
              {health?.active_users ?? 0}
            </div>
            <p className="text-[11px] text-muted-foreground mt-1">Users currently active in system</p>
          </CardContent>
        </Card>

        {/* Total Notes */}
        <Card className="rounded-2xl border-border bg-card hover:border-border/80 transition-colors">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-xs font-medium text-muted-foreground">Total Notes</CardTitle>
            <div className="flex size-7 items-center justify-center rounded-lg bg-indigo-500/10 text-indigo-500">
              <FileText className="size-4" />
            </div>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold tracking-tight text-foreground font-mono">
              {health?.total_notes ?? 0}
            </div>
            <p className="text-[11px] text-muted-foreground mt-1">Captured notes across all users</p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
