import { useState, useEffect, useCallback } from "react";
import { Link } from "react-router-dom";
import {
  Bell,
  AlertCircle,
  AlertTriangle,
  CheckCircle2,
  Activity,
  ArrowRight,
  RefreshCw,
  Clock,
  CreditCard,
} from "lucide-react";
import {
  Drawer,
  DrawerTrigger,
  DrawerPopup,
  DrawerHeader,
  DrawerTitle,
  DrawerDescription,
  DrawerPanel,
  DrawerFooter,
} from "@/components/ui/drawer";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Spinner } from "@/components/ui/spinner";
import { useAdmin } from "@/hooks/use-admin";
import type { AdminHealth, AdminJob, AdminPaymentOrder, AdminTransactionStats } from "@/types/admin";
import { formatRelativeTime } from "@/lib/utils";

export function AdminNotificationsDrawer() {
  const { getHealth, listJobs, getTransactionStats, listPaymentOrders } = useAdmin();
  const [open, setOpen] = useState(false);
  const [health, setHealth] = useState<AdminHealth | null>(null);
  const [problematicJobs, setProblematicJobs] = useState<AdminJob[]>([]);
  const [transactionStats, setTransactionStats] = useState<AdminTransactionStats | null>(null);
  const [problematicOrders, setProblematicOrders] = useState<AdminPaymentOrder[]>([]);
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  const fetchData = useCallback(async (isRefresh = false) => {
    if (isRefresh) setRefreshing(true);
    else setLoading(true);

    try {
      const [h, jobs, tStats, pOrders] = await Promise.all([
        getHealth(),
        listJobs(25),
        getTransactionStats(),
        listPaymentOrders("problematic", null, 5),
      ]);
      setHealth(h);
      // Filter for jobs that need attention: failed, stale, or retry attempts > 1
      const issues = jobs.filter(
        (j) => j.state === "failed" || j.state === "stale" || j.attempt_count > 1,
      );
      setProblematicJobs(issues);
      setTransactionStats(tStats);
      setProblematicOrders(pOrders);
    } catch {
      // Graceful fallback; keep existing state if already loaded
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [getHealth, listJobs, getTransactionStats, listPaymentOrders]);

  // Initial fetch on mount for badge notification dot
  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // Re-fetch when drawer is opened
  const handleOpenChange = (isOpen: boolean) => {
    setOpen(isOpen);
    if (isOpen) {
      fetchData(true);
    }
  };

  const failedCount = health?.failed_jobs ?? 0;
  const staleCount = health?.stale_jobs ?? 0;
  const queueDepth = health?.queue_depth ?? 0;
  const problemTxCount = transactionStats?.problem_count ?? 0;
  const hasAlerts = failedCount > 0 || staleCount > 0 || queueDepth > 10 || problemTxCount > 0;

  // Determine overall status
  const clusterStatus = failedCount > 5
    ? "critical"
    : failedCount > 0 || staleCount > 0 || queueDepth > 10 || problemTxCount > 0
    ? "degraded"
    : "healthy";

  return (
    <Drawer open={open} onOpenChange={handleOpenChange} position="bottom">
      <DrawerTrigger
        render={
          <Button
            variant="ghost"
            size="icon"
            className="relative text-muted-foreground hover:text-foreground cursor-pointer"
            aria-label="System Alerts and Notifications"
          >
            <Bell className="size-4" />
            {hasAlerts && (
              <span className="absolute top-2 right-2 flex size-2">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-destructive opacity-75" />
                <span className="relative inline-flex rounded-full size-2 bg-destructive" />
              </span>
            )}
          </Button>
        }
      />

      <DrawerPopup
        position="bottom"
        showCloseButton={false}
        showBar={true}
        className="max-h-[75vh] sm:max-h-[80vh] rounded-t-2xl sm:max-w-2xl sm:mx-auto w-full"
      >
        <DrawerHeader>
          <div className="flex items-center gap-2">
            <DrawerTitle>System Alerts</DrawerTitle>
            <Badge
              variant="secondary"
              className={
                clusterStatus === "healthy"
                  ? "bg-emerald-500/10 text-emerald-500 text-[10px]"
                  : clusterStatus === "degraded"
                  ? "bg-amber-500/10 text-amber-500 text-[10px]"
                  : "bg-destructive/10 text-destructive text-[10px]"
              }
            >
              {clusterStatus === "healthy"
                ? "Operational"
                : clusterStatus === "degraded"
                ? "Degraded"
                : "Incident"}
            </Badge>
          </div>
          <DrawerDescription>
            Live cluster operational status & queue health
          </DrawerDescription>
        </DrawerHeader>

        <DrawerPanel className="space-y-4 px-6">
          {/* Cluster Status Box */}
          <div
            className={`p-3.5 rounded-xl border text-xs flex items-start gap-2.5 ${
              clusterStatus === "healthy"
                ? "bg-emerald-500/5 border-emerald-500/20 text-emerald-600 dark:text-emerald-400"
                : clusterStatus === "degraded"
                ? "bg-amber-500/5 border-amber-500/20 text-amber-600 dark:text-amber-400"
                : "bg-destructive/5 border-destructive/20 text-destructive"
            }`}
          >
            {clusterStatus === "healthy" ? (
              <CheckCircle2 className="size-4 shrink-0 mt-0.5" />
            ) : clusterStatus === "degraded" ? (
              <AlertTriangle className="size-4 shrink-0 mt-0.5" />
            ) : (
              <AlertCircle className="size-4 shrink-0 mt-0.5" />
            )}
            <div className="space-y-0.5">
              <span className="font-semibold block">
                {clusterStatus === "healthy"
                  ? "Ingestion Spine Running Smoothly"
                  : clusterStatus === "degraded"
                  ? "Potential Queue Backlog or Stalls"
                  : "Critical Job Ingestion Failures"}
              </span>
              <p className="text-[11px] opacity-90 leading-relaxed">
                {clusterStatus === "healthy"
                  ? "All webhooks, deduplication, and note workers are operating without backlogs."
                  : clusterStatus === "degraded"
                  ? "Some jobs are stalling or queues are accumulating. Review worker metrics."
                  : "Multiple jobs have exhausted retry limits. Operator intervention advised."}
              </p>
            </div>
          </div>

          {/* Quick Metrics Grid */}
          <div className="grid grid-cols-3 gap-2">
            <div className="p-2.5 rounded-xl border border-border bg-card text-center">
              <span className="text-[10px] text-muted-foreground uppercase font-mono block">
                Queue
              </span>
              <span className="text-base font-bold font-mono text-foreground">
                {health?.queue_depth ?? 0}
              </span>
            </div>
            <div className="p-2.5 rounded-xl border border-border bg-card text-center">
              <span className="text-[10px] text-muted-foreground uppercase font-mono block">
                Stale
              </span>
              <span
                className={`text-base font-bold font-mono ${
                  staleCount > 0 ? "text-amber-500" : "text-foreground"
                }`}
              >
                {staleCount}
              </span>
            </div>
            <div className="p-2.5 rounded-xl border border-border bg-card text-center">
              <span className="text-[10px] text-muted-foreground uppercase font-mono block">
                Failed
              </span>
              <span
                className={`text-base font-bold font-mono ${
                  failedCount > 0 ? "text-destructive" : "text-foreground"
                }`}
              >
                {failedCount}
              </span>
            </div>
          </div>

          {/* Problematic Jobs or Clear State */}
          <div className="space-y-2 pt-2">
            <div className="flex items-center justify-between text-xs">
              <span className="font-semibold text-foreground">
                Problematic Jobs ({problematicJobs.length})
              </span>
              <Link
                to="/admin/jobs"
                onClick={() => setOpen(false)}
                className="text-muted-foreground hover:text-foreground flex items-center gap-1 text-[11px] transition-colors"
              >
                <span>View all</span>
                <ArrowRight className="size-3" />
              </Link>
            </div>

            {loading && !refreshing ? (
              <div className="py-8 flex flex-col items-center justify-center space-y-2">
                <Spinner className="size-5" />
                <span className="text-[11px] text-muted-foreground">Checking job queues…</span>
              </div>
            ) : problematicJobs.length === 0 ? (
              <div className="rounded-xl border border-dashed border-border p-5 text-center space-y-1.5">
                <CheckCircle2 className="size-5 text-emerald-500 mx-auto" />
                <p className="text-xs font-medium text-foreground">All queues clear</p>
                <p className="text-[11px] text-muted-foreground">
                  No failed or stalled processing jobs detected in the ingestion spine.
                </p>
              </div>
            ) : (
              <div className="space-y-2 max-h-60 overflow-y-auto pr-1">
                {problematicJobs.slice(0, 5).map((job) => (
                  <div
                    key={job.job_id}
                    className="p-3 rounded-xl border border-border bg-card hover:bg-muted/40 transition-colors text-xs space-y-1.5"
                  >
                    <div className="flex items-center justify-between">
                      <span className="font-mono text-[11px] font-semibold text-foreground">
                        {job.job_id.slice(0, 8)}…{job.job_id.slice(-4)}
                      </span>
                      <Badge
                        variant="secondary"
                        className={`text-[9px] uppercase font-mono py-0 px-1.5 ${
                          job.state === "failed"
                            ? "bg-destructive/10 text-destructive"
                            : "bg-amber-500/10 text-amber-500"
                        }`}
                      >
                        {job.state}
                      </Badge>
                    </div>

                    {job.last_error_code && (
                      <p className="font-mono text-[10px] text-destructive truncate">
                        Err: {job.last_error_code}
                      </p>
                    )}

                    <div className="flex items-center justify-between text-[10px] text-muted-foreground">
                      <span>Attempts: {job.attempt_count}</span>
                      <span className="flex items-center gap-1">
                        <Clock className="size-3" />
                        {formatRelativeTime(job.created_at)}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Problematic Payment Transactions */}
          <div className="space-y-2 pt-2 border-t border-border">
            <div className="flex items-center justify-between text-xs">
              <span className="font-semibold text-foreground flex items-center gap-1.5">
                <CreditCard className="size-3.5 text-muted-foreground" />
                <span>Transaction Alerts ({problematicOrders.length})</span>
              </span>
              <Link
                to="/admin/transactions"
                onClick={() => setOpen(false)}
                className="text-muted-foreground hover:text-foreground flex items-center gap-1 text-[11px] transition-colors"
              >
                <span>View all</span>
                <ArrowRight className="size-3" />
              </Link>
            </div>

            {problematicOrders.length === 0 ? (
              <div className="rounded-xl border border-dashed border-border p-3.5 text-center space-y-1">
                <CheckCircle2 className="size-4 text-emerald-500 mx-auto" />
                <p className="text-[11px] text-muted-foreground">
                  No payment discrepancies or underpaid orders detected.
                </p>
              </div>
            ) : (
              <div className="space-y-2 max-h-48 overflow-y-auto pr-1">
                {problematicOrders.map((order) => (
                  <div
                    key={order.id}
                    className="p-3 rounded-xl border border-border bg-card hover:bg-muted/40 transition-colors text-xs space-y-1"
                  >
                    <div className="flex items-center justify-between">
                      <span className="font-mono text-[11px] font-semibold text-foreground">
                        {order.order_code}
                      </span>
                      <Badge
                        variant="secondary"
                        className="text-[9px] uppercase font-mono py-0 px-1.5 bg-amber-500/10 text-amber-500"
                      >
                        {order.status === "invalid" ? "Underpaid" : order.status}
                      </Badge>
                    </div>

                    <div className="flex items-center justify-between text-[10px] text-muted-foreground">
                      <span>User: {order.display_name || order.telegram_user_id || "N/A"}</span>
                      <span>Rp {order.amount_idr.toLocaleString("id-ID")}</span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Quick Action Links */}
          <div className="pt-2 grid grid-cols-2 gap-2">
            <Link
              to="/admin/transactions"
              onClick={() => setOpen(false)}
              className="flex items-center justify-between p-2.5 rounded-xl border border-border bg-muted/30 hover:bg-muted/70 text-xs font-medium transition-colors"
            >
              <div className="flex items-center gap-2">
                <CreditCard className="size-3.5 text-foreground" />
                <span>Transactions</span>
              </div>
              <ArrowRight className="size-3 text-muted-foreground" />
            </Link>

            <Link
              to="/admin/jobs"
              onClick={() => setOpen(false)}
              className="flex items-center justify-between p-2.5 rounded-xl border border-border bg-muted/30 hover:bg-muted/70 text-xs font-medium transition-colors"
            >
              <div className="flex items-center gap-2">
                <Activity className="size-3.5 text-foreground" />
                <span>Job Queue</span>
              </div>
              <ArrowRight className="size-3 text-muted-foreground" />
            </Link>
          </div>
        </DrawerPanel>

        <DrawerFooter className="flex items-center justify-start border-t border-border px-6 py-2">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => fetchData(true)}
            disabled={refreshing}
            className="gap-1.5 text-xs text-muted-foreground hover:text-foreground cursor-pointer h-7 px-2.5"
          >
            <RefreshCw className={`size-3.5 ${refreshing ? "animate-spin" : ""}`} />
            <span>Refresh</span>
          </Button>
        </DrawerFooter>
      </DrawerPopup>
    </Drawer>
  );
}
