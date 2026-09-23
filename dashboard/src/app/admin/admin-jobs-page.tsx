import { useEffect, useState, useCallback } from "react";
import {
  Layers,
  RotateCcw,
  Ban,
  RefreshCw,
  Copy,
  Check,
  AlertCircle,
  Clock,
} from "lucide-react";
import {
  Table,
  TableHeader,
  TableRow,
  TableHead,
  TableBody,
  TableCell,
} from "@/components/ui/table";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import {
  AlertDialog,
  AlertDialogTrigger,
  AlertDialogPopup,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogClose,
} from "@/components/ui/alert-dialog";
import { toastManager } from "@/components/ui/toast";
import { useAdmin } from "@/hooks/use-admin";
import type { AdminJob } from "@/types/admin";
import { formatDate, formatRelativeTime } from "@/lib/utils";

export function AdminJobsPage() {
  const { listJobs, requeueJob, cancelJob } = useAdmin();
  const [jobs, setJobs] = useState<AdminJob[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<"all" | "problematic" | "active">("all");
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [actingJobId, setActingJobId] = useState<string | null>(null);

  const fetchJobs = useCallback(async (isRefresh = false) => {
    if (isRefresh) setRefreshing(true);
    else setLoading(true);
    setError(null);

    try {
      const data = await listJobs(100);
      setJobs(data);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Failed to load jobs";
      setError(message);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [listJobs]);

  useEffect(() => {
    fetchJobs();
  }, [fetchJobs]);

  const handleCopy = (id: string) => {
    navigator.clipboard.writeText(id);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  const handleRequeue = async (jobId: string) => {
    setActingJobId(jobId);
    try {
      const outcome = await requeueJob(jobId);
      toastManager.add({
        title: "Job Requeued",
        description: `Outcome: ${outcome}`,
        type: outcome === "requeued" ? "success" : "warning",
      });
      fetchJobs(true);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Failed to requeue job";
      toastManager.add({
        title: "Requeue Failed",
        description: message,
        type: "error",
      });
    } finally {
      setActingJobId(null);
    }
  };

  const handleCancel = async (jobId: string) => {
    setActingJobId(jobId);
    try {
      const outcome = await cancelJob(jobId);
      toastManager.add({
        title: "Job Cancelled",
        description: `Outcome: ${outcome}`,
        type: outcome === "cancelled" ? "success" : "warning",
      });
      fetchJobs(true);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Failed to cancel job";
      toastManager.add({
        title: "Cancel Failed",
        description: message,
        type: "error",
      });
    } finally {
      setActingJobId(null);
    }
  };

  const filteredJobs = jobs.filter((job) => {
    if (filter === "problematic") {
      const isFailed = job.state === "FAILED" || job.state === "RETRYABLE_FAILED";
      const isStale =
        Date.now() - new Date(job.created_at).getTime() > 10 * 60 * 1000 &&
        ["QUEUED", "ACQUIRING", "EXTRACTING", "GENERATING", "DELIVERING"].includes(job.state);
      return isFailed || isStale;
    }
    if (filter === "active") {
      return ["QUEUED", "ACQUIRING", "EXTRACTING", "GENERATING", "DELIVERING"].includes(job.state);
    }
    return true;
  });

  const getJobBadge = (job: AdminJob) => {
    const isStale =
      Date.now() - new Date(job.created_at).getTime() > 10 * 60 * 1000 &&
      ["QUEUED", "ACQUIRING", "EXTRACTING", "GENERATING", "DELIVERING"].includes(job.state);

    if (job.state === "FAILED" || job.state === "RETRYABLE_FAILED") {
      return <Badge variant="destructive" className="font-mono text-[10px]">{job.state}</Badge>;
    }
    if (isStale) {
      return (
        <Badge variant="outline" className="border-amber-500 text-amber-500 font-mono text-[10px] gap-1">
          <Clock className="size-3" />
          <span>STALE ({job.state})</span>
        </Badge>
      );
    }
    return (
      <Badge variant="secondary" className="font-mono text-[10px] text-blue-500 bg-blue-500/10 border-blue-500/20">
        {job.state}
      </Badge>
    );
  };

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      {/* Title & Actions Topbar */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-foreground">
            Job Queue & Recovery
          </h1>
          <p className="text-xs text-muted-foreground mt-1">
            Monitor in-flight capture jobs, diagnose failures, and trigger safe queue recovery.
          </p>
        </div>

        <div className="flex items-center gap-2">
          {/* Filter Pills */}
          <div className="flex items-center bg-muted/50 p-1 rounded-xl border border-border text-xs">
            <button
              onClick={() => setFilter("all")}
              className={`px-3 py-1 rounded-lg font-medium transition-colors cursor-pointer ${
                filter === "all" ? "bg-card text-foreground shadow-2xs font-semibold" : "text-muted-foreground hover:text-foreground"
              }`}
            >
              All ({jobs.length})
            </button>
            <button
              onClick={() => setFilter("problematic")}
              className={`px-3 py-1 rounded-lg font-medium transition-colors cursor-pointer ${
                filter === "problematic" ? "bg-card text-foreground shadow-2xs font-semibold" : "text-muted-foreground hover:text-foreground"
              }`}
            >
              Problematic
            </button>
            <button
              onClick={() => setFilter("active")}
              className={`px-3 py-1 rounded-lg font-medium transition-colors cursor-pointer ${
                filter === "active" ? "bg-card text-foreground shadow-2xs font-semibold" : "text-muted-foreground hover:text-foreground"
              }`}
            >
              Active
            </button>
          </div>

          <Button
            variant="outline"
            size="sm"
            onClick={() => fetchJobs(true)}
            disabled={refreshing}
            className="gap-1.5 text-xs font-medium cursor-pointer"
          >
            <RefreshCw className={`size-3.5 ${refreshing ? "animate-spin" : ""}`} />
            <span className="hidden sm:inline">Refresh</span>
          </Button>
        </div>
      </div>

      {error && (
        <div className="p-4 rounded-xl bg-destructive/10 border border-destructive/20 text-destructive text-xs flex items-center gap-2">
          <AlertCircle className="size-4 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {/* Jobs Table Card */}
      <Card className="rounded-2xl border-border bg-card overflow-hidden">
        {loading && !refreshing ? (
          <div className="flex flex-col items-center justify-center py-20 space-y-3">
            <Spinner className="size-6 text-foreground" />
            <p className="text-xs text-muted-foreground font-medium">Loading jobs queue…</p>
          </div>
        ) : filteredJobs.length === 0 ? (
          <div className="text-center py-16 px-4 space-y-2">
            <div className="flex size-10 mx-auto items-center justify-center rounded-xl bg-muted text-muted-foreground">
              <Layers className="size-5" />
            </div>
            <h3 className="text-sm font-semibold text-foreground">No jobs in queue</h3>
            <p className="text-xs text-muted-foreground max-w-sm mx-auto">
              There are currently no {filter !== "all" ? `${filter} ` : ""}processing jobs matching your criteria.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-[180px]">Job ID</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-center">Attempts</TableHead>
                  <TableHead>Error Code</TableHead>
                  <TableHead>Age</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredJobs.map((job) => (
                  <TableRow key={job.job_id} className="hover:bg-muted/40 transition-colors">
                    <TableCell className="font-mono text-xs text-foreground">
                      <div className="flex items-center gap-1.5">
                        <span title={job.job_id}>{job.job_id.slice(0, 8)}…</span>
                        <button
                          onClick={() => handleCopy(job.job_id)}
                          className="p-1 rounded hover:bg-muted text-muted-foreground hover:text-foreground transition-colors cursor-pointer"
                          aria-label="Copy Job ID"
                        >
                          {copiedId === job.job_id ? (
                            <Check className="size-3 text-emerald-500" />
                          ) : (
                            <Copy className="size-3" />
                          )}
                        </button>
                      </div>
                    </TableCell>

                    <TableCell>{getJobBadge(job)}</TableCell>

                    <TableCell className="text-center font-mono text-xs">
                      {job.attempt_count}
                    </TableCell>

                    <TableCell className="font-mono text-xs text-muted-foreground">
                      {job.last_error_code || "—"}
                    </TableCell>

                    <TableCell className="text-xs text-muted-foreground">
                      <div className="flex flex-col">
                        <span>{formatRelativeTime(job.created_at)}</span>
                        <span className="text-[10px] text-muted-foreground/70">{formatDate(job.created_at)}</span>
                      </div>
                    </TableCell>

                    <TableCell className="text-right">
                      <div className="flex items-center justify-end gap-1.5">
                        {/* Requeue Confirmation Dialog */}
                        <AlertDialog>
                          <AlertDialogTrigger
                            render={
                              <Button
                                variant="outline"
                                size="sm"
                                disabled={actingJobId === job.job_id}
                                className="size-7 p-0 cursor-pointer"
                                title="Requeue Job"
                              >
                                <RotateCcw className="size-3.5" />
                              </Button>
                            }
                          />
                          <AlertDialogPopup>
                            <AlertDialogHeader>
                              <AlertDialogTitle>Requeue Processing Job?</AlertDialogTitle>
                              <AlertDialogDescription>
                                This will reset the attempt counter and transition job{" "}
                                <code className="font-mono text-xs">{job.job_id.slice(0, 8)}…</code>{" "}
                                back to <code className="font-mono text-xs">QUEUED</code> state so the worker picks it up again.
                              </AlertDialogDescription>
                            </AlertDialogHeader>
                            <AlertDialogFooter>
                              <AlertDialogClose
                                render={
                                  <Button variant="outline" size="sm">
                                    Cancel
                                  </Button>
                                }
                              />
                              <AlertDialogClose
                                render={
                                  <Button
                                    variant="default"
                                    size="sm"
                                    onClick={() => handleRequeue(job.job_id)}
                                  >
                                    Confirm Requeue
                                  </Button>
                                }
                              />
                            </AlertDialogFooter>
                          </AlertDialogPopup>
                        </AlertDialog>

                        {/* Cancel Confirmation Dialog */}
                        <AlertDialog>
                          <AlertDialogTrigger
                            render={
                              <Button
                                variant="outline"
                                size="sm"
                                disabled={actingJobId === job.job_id}
                                className="size-7 p-0 text-destructive hover:text-destructive cursor-pointer"
                                title="Cancel Job"
                              >
                                <Ban className="size-3.5" />
                              </Button>
                            }
                          />
                          <AlertDialogPopup>
                            <AlertDialogHeader>
                              <AlertDialogTitle>Cancel Job?</AlertDialogTitle>
                              <AlertDialogDescription>
                                This will immediately mark job{" "}
                                <code className="font-mono text-xs">{job.job_id.slice(0, 8)}…</code> as{" "}
                                <code className="font-mono text-xs">CANCELLED</code>. No further worker attempts will execute.
                              </AlertDialogDescription>
                            </AlertDialogHeader>
                            <AlertDialogFooter>
                              <AlertDialogClose
                                render={
                                  <Button variant="outline" size="sm">
                                    Keep Job
                                  </Button>
                                }
                              />
                              <AlertDialogClose
                                render={
                                  <Button
                                    variant="destructive"
                                    size="sm"
                                    onClick={() => handleCancel(job.job_id)}
                                  >
                                    Confirm Cancel
                                  </Button>
                                }
                              />
                            </AlertDialogFooter>
                          </AlertDialogPopup>
                        </AlertDialog>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </Card>
    </div>
  );
}
