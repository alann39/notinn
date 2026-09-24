import { useEffect, useState, useCallback, useMemo } from "react";
import {
  Users,
  Search,
  RefreshCw,
  Shield,
  CreditCard,
  UserCheck,
  AlertCircle,
  Check,
  Copy,
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
import { DataTablePagination } from "@/components/admin/data-table-pagination";
import { toastManager } from "@/components/ui/toast";
import { useAdmin } from "@/hooks/use-admin";
import type { AdminUser } from "@/types/admin";
import { formatDate } from "@/lib/utils";

export function AdminUsersPage() {
  const { listUsers, setUserPlan, setUserStatus } = useAdmin();
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  // Selected state for active dialog
  const [activeDialog, setActiveDialog] = useState<
    | { type: "plan"; user: AdminUser }
    | { type: "status"; user: AdminUser }
    | null
  >(null);
  const [newPlan, setNewPlan] = useState<string>("free");
  const [newStatus, setNewStatus] = useState<string>("active");
  const [isUpdating, setIsUpdating] = useState(false);

  const PAGE_SIZE = 10;
  const [currentPage, setCurrentPage] = useState(1);

  // Reset page when search term changes
  useEffect(() => {
    setCurrentPage(1);
  }, [searchTerm]);

  const totalPages = Math.max(1, Math.ceil(users.length / PAGE_SIZE));
  const paginatedUsers = useMemo(() => {
    const start = (currentPage - 1) * PAGE_SIZE;
    return users.slice(start, start + PAGE_SIZE);
  }, [users, currentPage]);

  const fetchUsers = useCallback(async (search = "", isRefresh = false) => {
    if (isRefresh) setRefreshing(true);
    else setLoading(true);
    setError(null);

    try {
      const data = await listUsers(search, 100);
      setUsers(data);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Failed to load users";
      setError(message);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [listUsers]);

  useEffect(() => {
    fetchUsers(searchTerm);
  }, [fetchUsers, searchTerm]);

  const handleCopy = (id: string) => {
    navigator.clipboard.writeText(id);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  const handleSavePlan = async () => {
    if (!activeDialog || activeDialog.type !== "plan") return;
    const targetUser = activeDialog.user;
    setIsUpdating(true);
    try {
      const outcome = await setUserPlan(targetUser.id, newPlan);
      toastManager.add({
        title: "Plan Updated",
        description: `User plan set to "${newPlan}" (${outcome})`,
        type: "success",
      });
      fetchUsers(searchTerm, true);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "An error occurred";
      toastManager.add({
        title: "Failed to Update Plan",
        description: message,
        type: "error",
      });
    } finally {
      setIsUpdating(false);
      setActiveDialog(null);
    }
  };

  const handleSaveStatus = async () => {
    if (!activeDialog || activeDialog.type !== "status") return;
    const targetUser = activeDialog.user;
    setIsUpdating(true);
    try {
      const outcome = await setUserStatus(targetUser.id, newStatus);
      toastManager.add({
        title: "Status Updated",
        description: `User status set to "${newStatus}" (${outcome})`,
        type: "success",
      });
      fetchUsers(searchTerm, true);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "An error occurred";
      toastManager.add({
        title: "Failed to Update Status",
        description: message,
        type: "error",
      });
    } finally {
      setIsUpdating(false);
      setActiveDialog(null);
    }
  };

  const getStatusBadge = (status: string, alphaStatus: string | null) => {
    const effectiveStatus = alphaStatus || status;
    if (effectiveStatus === "active") {
      return (
        <Badge variant="secondary" className="bg-emerald-500/10 text-emerald-500 font-mono text-[10px]">
          active
        </Badge>
      );
    }
    if (effectiveStatus === "suspended") {
      return <Badge variant="destructive" className="font-mono text-[10px]">suspended</Badge>;
    }
    return (
      <Badge variant="outline" className="text-amber-500 border-amber-500 font-mono text-[10px]">
        {effectiveStatus}
      </Badge>
    );
  };

  const getPlanBadge = (plan: string) => {
    if (plan === "pro") {
      return <Badge className="bg-indigo-500/20 text-indigo-400 font-mono text-[10px]">PRO</Badge>;
    }
    if (plan === "alpha") {
      return <Badge className="bg-purple-500/20 text-purple-400 font-mono text-[10px]">ALPHA</Badge>;
    }
    return <Badge variant="secondary" className="font-mono text-[10px]">FREE</Badge>;
  };

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      {/* Header & Search */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-foreground">
            User Directory & Entitlements
          </h1>
          <p className="text-xs text-muted-foreground mt-1">
            Lookup accounts, modify plan tiers, and manage alpha access lifecycle.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <div className="relative w-full sm:w-64">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-3.5 text-muted-foreground" />
            <Input
              placeholder="Search Telegram ID or UUID…"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-8 text-xs h-9"
            />
          </div>

          <Button
            variant="outline"
            size="sm"
            onClick={() => fetchUsers(searchTerm, true)}
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

      {/* Users Table Card */}
      <Card className="rounded-2xl border-border bg-card overflow-hidden">
        {loading && !refreshing ? (
          <div className="flex flex-col items-center justify-center py-20 space-y-3">
            <Spinner className="size-6 text-foreground" />
            <p className="text-xs text-muted-foreground font-medium">Loading user accounts…</p>
          </div>
        ) : users.length === 0 ? (
          <div className="text-center py-16 px-4 space-y-2">
            <div className="flex size-10 mx-auto items-center justify-center rounded-xl bg-muted text-muted-foreground">
              <Users className="size-5" />
            </div>
            <h3 className="text-sm font-semibold text-foreground">No users found</h3>
            <p className="text-xs text-muted-foreground max-w-sm mx-auto">
              No account records matched your search query.
            </p>
          </div>
        ) : (
          <>
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Telegram ID</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Plan</TableHead>
                    <TableHead className="text-center">Notes</TableHead>
                    <TableHead className="text-center">In-Flight / Failed</TableHead>
                    <TableHead>Joined</TableHead>
                    <TableHead className="text-right">Manage</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {paginatedUsers.map((u) => (
                    <TableRow key={u.id} className="hover:bg-muted/40 transition-colors">
                      <TableCell className="font-mono text-xs">
                        <div className="flex items-center gap-2">
                          <span className="font-semibold text-foreground">{u.telegram_user_id}</span>
                          {u.is_admin && (
                            <Badge variant="secondary" className="gap-1 text-[9px] py-0 px-1.5 font-normal">
                              <Shield className="size-2.5 text-blue-500" />
                              <span>Admin</span>
                            </Badge>
                          )}
                          <button
                            onClick={() => handleCopy(u.id)}
                            className="p-1 rounded hover:bg-muted text-muted-foreground hover:text-foreground transition-colors cursor-pointer"
                            title={`Copy Internal UUID: ${u.id}`}
                          >
                            {copiedId === u.id ? (
                              <Check className="size-3 text-emerald-500" />
                            ) : (
                              <Copy className="size-3" />
                            )}
                          </button>
                        </div>
                      </TableCell>

                      <TableCell>{getStatusBadge(u.status, u.alpha_access_status)}</TableCell>

                      <TableCell>{getPlanBadge(u.plan_key)}</TableCell>

                      <TableCell className="text-center font-mono text-xs">
                        {u.notes_count}
                      </TableCell>

                      <TableCell className="text-center font-mono text-xs">
                        <span className={u.active_jobs > 0 ? "text-blue-500 font-semibold" : "text-muted-foreground"}>
                          {u.active_jobs}
                        </span>
                        {" / "}
                        <span className={u.failed_jobs > 0 ? "text-destructive font-semibold" : "text-muted-foreground"}>
                          {u.failed_jobs}
                        </span>
                      </TableCell>

                      <TableCell className="text-xs text-muted-foreground">
                        {formatDate(u.created_at)}
                      </TableCell>

                      <TableCell className="text-right">
                        <div className="flex items-center justify-end gap-1.5">
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => {
                              setActiveDialog({ type: "plan", user: u });
                              setNewPlan(u.plan_key);
                            }}
                            className="gap-1 text-[11px] h-7 px-2 cursor-pointer"
                          >
                            <CreditCard className="size-3" />
                            <span>Plan</span>
                          </Button>

                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => {
                              setActiveDialog({ type: "status", user: u });
                              setNewStatus(u.alpha_access_status || u.status || "active");
                            }}
                            className="gap-1 text-[11px] h-7 px-2 cursor-pointer"
                          >
                            <UserCheck className="size-3" />
                            <span>Status</span>
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>

            <DataTablePagination
              currentPage={currentPage}
              totalPages={totalPages}
              totalItems={users.length}
              pageSize={PAGE_SIZE}
              onPageChange={setCurrentPage}
              itemName="pengguna"
              loading={loading}
            />
          </>
        )}
      </Card>

      {/* Plan Dialog */}
      <Dialog
        open={activeDialog?.type === "plan"}
        onOpenChange={(open) => {
          if (!open) setActiveDialog(null);
        }}
      >
        <DialogPopup>
          <DialogHeader>
            <DialogTitle>Change User Plan</DialogTitle>
            <DialogDescription>
              Update plan entitlements for Telegram user{" "}
              <code className="font-mono text-xs">
                {activeDialog?.type === "plan" ? activeDialog.user.telegram_user_id : ""}
              </code>.
            </DialogDescription>
          </DialogHeader>

          <div className="p-6 space-y-4">
            <label className="text-xs font-medium text-foreground block">
              Select Plan Tier
            </label>
            <div className="grid grid-cols-3 gap-2">
              {["free", "pro", "alpha"].map((plan) => (
                <button
                  key={plan}
                  type="button"
                  onClick={() => setNewPlan(plan)}
                  className={`p-3 rounded-xl border text-center transition-all cursor-pointer ${
                    newPlan === plan
                      ? "border-foreground bg-muted font-bold text-foreground"
                      : "border-border text-muted-foreground hover:border-foreground/40"
                  }`}
                >
                  <span className="uppercase text-xs font-mono">{plan}</span>
                </button>
              ))}
            </div>
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
              disabled={
                isUpdating ||
                (activeDialog?.type === "plan" && newPlan === activeDialog.user.plan_key)
              }
              onClick={handleSavePlan}
              className="cursor-pointer"
            >
              {isUpdating ? <Spinner className="size-3.5" /> : "Save Plan"}
            </Button>
          </DialogFooter>
        </DialogPopup>
      </Dialog>

      {/* Status Dialog */}
      <Dialog
        open={activeDialog?.type === "status"}
        onOpenChange={(open) => {
          if (!open) setActiveDialog(null);
        }}
      >
        <DialogPopup>
          <DialogHeader>
            <DialogTitle>Update Access Status</DialogTitle>
            <DialogDescription>
              Modify alpha access status for Telegram user{" "}
              <code className="font-mono text-xs">
                {activeDialog?.type === "status" ? activeDialog.user.telegram_user_id : ""}
              </code>.
            </DialogDescription>
          </DialogHeader>

          <div className="p-6 space-y-4">
            <label className="text-xs font-medium text-foreground block">
              Account Lifecycle Status
            </label>
            <div className="grid grid-cols-3 gap-2">
              {[
                { key: "active", label: "Active" },
                { key: "suspended", label: "Suspended" },
                { key: "pending", label: "Pending" },
              ].map((st) => (
                <button
                  key={st.key}
                  type="button"
                  onClick={() => setNewStatus(st.key)}
                  className={`p-3 rounded-xl border text-center transition-all cursor-pointer ${
                    newStatus === st.key
                      ? "border-foreground bg-muted font-bold text-foreground"
                      : "border-border text-muted-foreground hover:border-foreground/40"
                  }`}
                >
                  <span className="text-xs font-medium">{st.label}</span>
                </button>
              ))}
            </div>
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
              disabled={isUpdating}
              onClick={handleSaveStatus}
              className="cursor-pointer"
            >
              {isUpdating ? <Spinner className="size-3.5" /> : "Save Status"}
            </Button>
          </DialogFooter>
        </DialogPopup>
      </Dialog>
    </div>
  );
}
