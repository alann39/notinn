import { useEffect, useState, useCallback, useMemo } from "react";
import {
  CreditCard,
  CheckCircle2,
  AlertTriangle,
  Clock,
  XCircle,
  Ban,
  RefreshCw,
  Copy,
  Check,
  Search,
  Filter,
  DollarSign,
  Users,
  CheckCheck,
  Calendar,
  User,
  Hash,
} from "lucide-react";
import {
  Table,
  TableHeader,
  TableRow,
  TableHead,
  TableBody,
  TableCell,
} from "@/components/ui/table";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectPopup,
  SelectItem,
} from "@/components/ui/select";
import {
  Alert,
  AlertTitle,
  AlertDescription,
  AlertAction,
} from "@/components/ui/alert";
import {
  Sheet,
  SheetPopup,
  SheetHeader,
  SheetTitle,
  SheetDescription,
  SheetPanel,
} from "@/components/ui/sheet";
import {
  Drawer,
  DrawerPopup,
  DrawerHeader,
  DrawerTitle,
  DrawerDescription,
  DrawerPanel,
} from "@/components/ui/drawer";
import {
  AlertDialog,
  AlertDialogPopup,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogClose,
} from "@/components/ui/alert-dialog";
import { DataTablePagination } from "@/components/admin/data-table-pagination";
import { toastManager } from "@/components/ui/toast";
import { useAdmin } from "@/hooks/use-admin";
import { useIsMobile } from "@/hooks/use-media-query";
import type { AdminPaymentOrder, AdminTransactionStats } from "@/types/admin";
import { formatDate, formatRelativeTime } from "@/lib/utils";

type FilterStatus = "all" | "completed" | "problematic" | "pending" | "invalid" | "expired" | "cancelled";

const STATUS_LABELS: Record<FilterStatus, string> = {
  all: "Semua Status",
  completed: "Completed (Berhasil)",
  problematic: "Needs Attention (Bermasalah)",
  pending: "Pending",
  invalid: "Underpaid / Invalid",
  expired: "Expired (Kadaluarsa)",
  cancelled: "Cancelled (Dibatalkan)",
};

const PAGE_SIZE = 10;

export function AdminTransactionsPage() {
  const isMobile = useIsMobile();
  const {
    getTransactionStats,
    listPaymentOrders,
    reconcilePaymentOrder,
    resolvePaymentOrder,
  } = useAdmin();

  const [stats, setStats] = useState<AdminTransactionStats | null>(null);
  const [orders, setOrders] = useState<AdminPaymentOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [filter, setFilter] = useState<FilterStatus>("all");
  const [search, setSearch] = useState("");
  const [currentPage, setCurrentPage] = useState(1);
  const [copiedKey, setCopiedKey] = useState<string | null>(null);

  // Inspector State
  const [inspectOrder, setInspectOrder] = useState<AdminPaymentOrder | null>(null);

  // Reconcile Modal State
  const [reconcileTarget, setReconcileTarget] = useState<AdminPaymentOrder | null>(null);
  const [reconcileNotes, setReconcileNotes] = useState("");
  const [isReconciling, setIsReconciling] = useState(false);

  // Cancel Modal State
  const [cancelTarget, setCancelTarget] = useState<AdminPaymentOrder | null>(null);
  const [cancelNotes, setCancelNotes] = useState("");
  const [cancelNotifyUser, setCancelNotifyUser] = useState(true);
  const [isCancelling, setIsCancelling] = useState(false);

  // Expire Modal State
  const [expireTarget, setExpireTarget] = useState<AdminPaymentOrder | null>(null);
  const [expireNotes, setExpireNotes] = useState("");
  const [expireNotifyUser, setExpireNotifyUser] = useState(true);
  const [isExpiring, setIsExpiring] = useState(false);

  const fetchData = useCallback(
    async (isRefresh = false) => {
      if (isRefresh) setRefreshing(true);
      else setLoading(true);
      setError(null);

      try {
        const [statsData, ordersData] = await Promise.all([
          getTransactionStats(),
          listPaymentOrders(filter, search.trim(), 100),
        ]);
        setStats(statsData);
        setOrders(ordersData);
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : "Failed to load transactions";
        setError(message);
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [getTransactionStats, listPaymentOrders, filter, search],
  );

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // Reset pagination to page 1 on filter or search changes
  useEffect(() => {
    setCurrentPage(1);
  }, [filter, search]);

  const totalPages = Math.max(1, Math.ceil(orders.length / PAGE_SIZE));
  const paginatedOrders = useMemo(() => {
    const startIndex = (currentPage - 1) * PAGE_SIZE;
    return orders.slice(startIndex, startIndex + PAGE_SIZE);
  }, [orders, currentPage]);

  const handleCopy = (text: string, key: string) => {
    navigator.clipboard.writeText(text);
    setCopiedKey(key);
    setTimeout(() => setCopiedKey(null), 2000);
  };

  const handleReconcileSubmit = async () => {
    if (!reconcileTarget) return;
    setIsReconciling(true);

    try {
      await reconcilePaymentOrder(reconcileTarget.id, reconcileNotes.trim() || undefined);
      toastManager.add({
        title: "Order Reconciled",
        description: `Order ${reconcileTarget.order_code} was approved and upgraded to Pro for 30 days.`,
        type: "success",
      });
      setReconcileTarget(null);
      setInspectOrder(null);
      setReconcileNotes("");
      fetchData(true);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Failed to reconcile order";
      toastManager.add({
        title: "Reconciliation Failed",
        description: msg,
        type: "error",
      });
    } finally {
      setIsReconciling(false);
    }
  };

  const handleCancelSubmit = async () => {
    if (!cancelTarget) return;
    setIsCancelling(true);

    try {
      const res = await resolvePaymentOrder(
        cancelTarget.id,
        "cancel",
        cancelNotes.trim() || undefined,
        cancelNotifyUser,
      );
      toastManager.add({
        title: "Order Cancelled",
        description: `Order ${cancelTarget.order_code} was marked cancelled.${
          res.notified ? " User notified via Telegram." : ""
        }`,
        type: "default",
      });
      setCancelTarget(null);
      setInspectOrder(null);
      setCancelNotes("");
      fetchData(true);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Failed to cancel order";
      toastManager.add({
        title: "Action Failed",
        description: msg,
        type: "error",
      });
    } finally {
      setIsCancelling(false);
    }
  };

  const handleExpireSubmit = async () => {
    if (!expireTarget) return;
    setIsExpiring(true);

    try {
      const res = await resolvePaymentOrder(
        expireTarget.id,
        "expire",
        expireNotes.trim() || undefined,
        expireNotifyUser,
      );
      toastManager.add({
        title: "Order Expired",
        description: `Order ${expireTarget.order_code} was marked expired.${
          res.notified ? " User notified via Telegram." : ""
        }`,
        type: "default",
      });
      setExpireTarget(null);
      setInspectOrder(null);
      setExpireNotes("");
      fetchData(true);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Failed to expire order";
      toastManager.add({
        title: "Action Failed",
        description: msg,
        type: "error",
      });
    } finally {
      setIsExpiring(false);
    }
  };

  const formatIDR = (amount: number) => {
    return new Intl.NumberFormat("id-ID", {
      style: "currency",
      currency: "IDR",
      maximumFractionDigits: 0,
    }).format(amount);
  };

  const renderStatusBadge = (order: AdminPaymentOrder) => {
    if (order.status === "completed") {
      return (
        <Badge variant="success" size="sm" className="gap-1 font-medium">
          <CheckCircle2 className="size-3" /> Completed
        </Badge>
      );
    }
    if (order.status === "invalid") {
      return (
        <Badge variant="error" size="sm" className="gap-1 font-medium">
          <AlertTriangle className="size-3" /> Underpaid
        </Badge>
      );
    }
    if (order.status === "cancelled") {
      return (
        <Badge variant="destructive" size="sm" className="gap-1 font-medium">
          <Ban className="size-3" /> Cancelled
        </Badge>
      );
    }
    const isPastExpiry = order.status === "expired" || (order.status === "pending" && new Date(order.expires_at) < new Date());
    if (isPastExpiry) {
      return (
        <Badge variant="secondary" size="sm" className="gap-1 font-medium">
          <XCircle className="size-3" /> Expired
        </Badge>
      );
    }
    return (
      <Badge variant="warning" size="sm" className="gap-1 font-medium">
        <Clock className="size-3" /> Pending
      </Badge>
    );
  };

  // Content for Inspect (desktop Sheet and mobile Drawer)
  const renderDetailContent = (order: AdminPaymentOrder) => {
    const isCompleted = order.status === "completed";
    const isCancelled = order.status === "cancelled";
    const isExpired = order.status === "expired";

    return (
      <div className="space-y-5 py-2 text-xs">
        {/* Key Metadata Card */}
        <div className="rounded-xl border border-border bg-card p-4 space-y-4 shadow-xs">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1">
              <span className="text-muted-foreground flex items-center gap-1.5 text-[11px] font-medium">
                <Hash className="size-3.5 text-primary" /> Order ID
              </span>
              <div className="flex items-center gap-1.5 font-mono text-[11px] text-foreground">
                <span className="truncate" title={order.id}>{order.id.slice(0, 16)}…</span>
                <button
                  type="button"
                  onClick={() => handleCopy(order.id, "order-id")}
                  className="text-muted-foreground hover:text-foreground p-0.5 rounded cursor-pointer"
                  title="Copy ID"
                >
                  {copiedKey === "order-id" ? (
                    <Check className="size-3 text-success" />
                  ) : (
                    <Copy className="size-3" />
                  )}
                </button>
              </div>
            </div>

            <div className="space-y-1">
              <span className="text-muted-foreground flex items-center gap-1.5 text-[11px] font-medium">
                <User className="size-3.5 text-primary" /> Customer
              </span>
              <div className="text-foreground font-semibold truncate">
                {order.display_name || "Telegram User"}
                <span className="text-[10px] text-muted-foreground block font-mono font-normal">
                  {order.telegram_user_id ? `ID: ${order.telegram_user_id}` : `UID: ${order.user_id.slice(0, 8)}`}
                </span>
              </div>
            </div>
          </div>

          <div className="border-t border-border/60 pt-3 grid grid-cols-2 gap-4">
            <div className="space-y-1">
              <span className="text-muted-foreground text-[11px] font-medium">Amount Expected</span>
              <div className="font-bold text-foreground text-sm">
                {formatIDR(order.amount_idr)}
              </div>
              <span className="text-[10px] text-muted-foreground uppercase font-mono">
                {order.target_plan} • 30 days
              </span>
            </div>

            <div className="space-y-1">
              <span className="text-muted-foreground text-[11px] font-medium">Current Status</span>
              <div>{renderStatusBadge(order)}</div>
            </div>
          </div>

          <div className="border-t border-border/60 pt-3 grid grid-cols-2 gap-4">
            <div className="space-y-1">
              <span className="text-muted-foreground flex items-center gap-1.5 text-[11px] font-medium">
                <Calendar className="size-3.5 text-muted-foreground" /> Created At
              </span>
              <span className="text-foreground font-mono text-[11px] block">
                {new Date(order.created_at).toLocaleString("id-ID")}
              </span>
            </div>

            <div className="space-y-1">
              <span className="text-muted-foreground flex items-center gap-1.5 text-[11px] font-medium">
                <Clock className="size-3.5 text-muted-foreground" /> Expires At
              </span>
              <span className="text-foreground font-mono text-[11px] block">
                {new Date(order.expires_at).toLocaleString("id-ID")}
              </span>
            </div>
          </div>
        </div>

        {/* TipTap Reference Box */}
        <div className="space-y-1.5">
          <span className="font-semibold text-foreground text-xs block">
            TipTap Reference ID
          </span>
          <div className="flex items-center justify-between rounded-lg border border-border bg-muted/40 px-3.5 py-2.5 font-mono text-xs">
            <span className="text-foreground truncate">
              {order.tiptap_payment_id || "None recorded"}
            </span>
            {order.tiptap_payment_id && (
              <button
                type="button"
                onClick={() => handleCopy(order.tiptap_payment_id!, "tiptap-id")}
                className="text-muted-foreground hover:text-foreground ml-2 shrink-0 cursor-pointer p-1"
                title="Copy Reference"
              >
                {copiedKey === "tiptap-id" ? (
                  <Check className="size-3.5 text-success" />
                ) : (
                  <Copy className="size-3.5" />
                )}
              </button>
            )}
          </div>
        </div>

        {/* Raw TipTap Webhook Payload Viewer */}
        <div className="space-y-1.5">
          <div className="flex items-center justify-between">
            <span className="font-semibold text-foreground text-xs">
              TipTap Webhook Payload
            </span>
            {order.tiptap_payload && (
              <button
                type="button"
                onClick={() =>
                  handleCopy(JSON.stringify(order.tiptap_payload, null, 2), "payload")
                }
                className="text-[11px] text-muted-foreground hover:text-foreground flex items-center gap-1.5 cursor-pointer font-medium"
              >
                {copiedKey === "payload" ? (
                  <Check className="size-3 text-success" />
                ) : (
                  <Copy className="size-3" />
                )}
                <span>Copy JSON</span>
              </button>
            )}
          </div>
          <div className="max-h-56 overflow-y-auto rounded-xl border border-border/80 bg-zinc-950 p-3.5 font-mono text-[11px] leading-relaxed text-zinc-300 shadow-inner">
            {order.tiptap_payload ? (
              <pre className="whitespace-pre-wrap break-all">
                {JSON.stringify(order.tiptap_payload, null, 2)}
              </pre>
            ) : (
              <span className="italic text-zinc-500">
                No webhook payload captured yet for this order.
              </span>
            )}
          </div>
        </div>

        {/* Action Buttons Section */}
        <div className="space-y-2.5 pt-3 border-t border-border">
          <span className="text-xs font-semibold text-foreground block">
            Resolution & Actions
          </span>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
            {!isCompleted && (
              <Button
                variant="default"
                size="sm"
                className="gap-1.5 cursor-pointer w-full text-xs h-9 justify-center"
                onClick={() => setReconcileTarget(order)}
              >
                <CheckCheck className="size-3.5" />
                <span>Reconcile (Pro)</span>
              </Button>
            )}

            {!isCompleted && !isCancelled && (
              <Button
                variant="outline"
                size="sm"
                className="gap-1.5 cursor-pointer w-full text-xs h-9 justify-center text-destructive border-destructive/30 hover:bg-destructive/10"
                onClick={() => setCancelTarget(order)}
              >
                <Ban className="size-3.5" />
                <span>Cancel / Void</span>
              </Button>
            )}

            {!isCompleted && !isExpired && (
              <Button
                variant="outline"
                size="sm"
                className="gap-1.5 cursor-pointer w-full text-xs h-9 justify-center text-amber-500 border-amber-500/30 hover:bg-amber-500/10"
                onClick={() => setExpireTarget(order)}
              >
                <Clock className="size-3.5" />
                <span>Mark Expired</span>
              </Button>
            )}
          </div>
        </div>
      </div>
    );
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-xl font-bold tracking-tight text-foreground sm:text-2xl">
              Transactions & Payments
            </h1>
            <Badge variant="outline" className="font-mono text-xs">
              TipTap Ops
            </Badge>
          </div>
          <p className="text-xs text-muted-foreground sm:text-sm mt-1">
            Track upgrade payment orders, inspect TipTap webhooks, and resolve payment issues.
          </p>
        </div>

        <Button
          variant="outline"
          size="sm"
          onClick={() => fetchData(true)}
          disabled={loading || refreshing}
          className="gap-2 self-start sm:self-auto cursor-pointer"
        >
          <RefreshCw className={`size-3.5 ${refreshing ? "animate-spin" : ""}`} />
          <span>Refresh</span>
        </Button>
      </div>

      {/* Alert Banner for Problematic Orders */}
      {stats && stats.problem_count > 0 && (
        <Alert variant="warning" className="border-warning/30 bg-warning/10">
          <AlertTriangle className="size-4 text-warning" />
          <AlertTitle className="text-sm font-semibold text-warning-foreground">
            {stats.problem_count} Transaction{stats.problem_count > 1 ? "s" : ""} Need Attention
          </AlertTitle>
          <AlertDescription className="text-xs text-warning-foreground/90">
            There are underpaid, invalid, or expired transactions requiring operator review. Click
            below to filter and inspect.
          </AlertDescription>
          <AlertAction>
            <Button
              variant="outline"
              size="sm"
              className="text-xs border-warning/40 hover:bg-warning/20 cursor-pointer"
              onClick={() => setFilter("problematic")}
            >
              View Issues
            </Button>
          </AlertAction>
        </Alert>
      )}

      {/* 4 Summary Stats Cards */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        {/* Card 1: Total Revenue */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
              Total Revenue
            </CardTitle>
            <DollarSign className="size-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            {loading && !stats ? (
              <Spinner className="size-5" />
            ) : (
              <>
                <div className="text-xl font-bold tracking-tight text-foreground">
                  {formatIDR(stats?.total_revenue_idr ?? 0)}
                </div>
                <p className="text-[11px] text-muted-foreground mt-1">
                  From completed upgrades
                </p>
              </>
            )}
          </CardContent>
        </Card>

        {/* Card 2: Completed Payments */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
              Completed
            </CardTitle>
            <CheckCircle2 className="size-4 text-success" />
          </CardHeader>
          <CardContent>
            {loading && !stats ? (
              <Spinner className="size-5" />
            ) : (
              <>
                <div className="text-xl font-bold tracking-tight text-foreground">
                  {stats?.completed_count ?? 0}
                </div>
                <p className="text-[11px] text-muted-foreground mt-1">
                  Successfully activated
                </p>
              </>
            )}
          </CardContent>
        </Card>

        {/* Card 3: Needs Attention */}
        <Card className={stats && stats.problem_count > 0 ? "border-warning/50 bg-warning/5" : ""}>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
              Needs Attention
            </CardTitle>
            <AlertTriangle
              className={`size-4 ${stats && stats.problem_count > 0 ? "text-warning" : "text-muted-foreground"}`}
            />
          </CardHeader>
          <CardContent>
            {loading && !stats ? (
              <Spinner className="size-5" />
            ) : (
              <>
                <div className="flex items-center gap-2">
                  <div
                    className={`text-xl font-bold tracking-tight ${
                      stats && stats.problem_count > 0 ? "text-warning" : "text-foreground"
                    }`}
                  >
                    {stats?.problem_count ?? 0}
                  </div>
                  {stats && stats.problem_count > 0 && (
                    <Badge variant="warning" size="sm">
                      Action Required
                    </Badge>
                  )}
                </div>
                <p className="text-[11px] text-muted-foreground mt-1">
                  Underpaid / invalid / expired
                </p>
              </>
            )}
          </CardContent>
        </Card>

        {/* Card 4: Active Pro Users */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
              Active Pro Users
            </CardTitle>
            <Users className="size-4 text-primary" />
          </CardHeader>
          <CardContent>
            {loading && !stats ? (
              <Spinner className="size-5" />
            ) : (
              <>
                <div className="text-xl font-bold tracking-tight text-foreground">
                  {stats?.active_pro_subscribers ?? 0}
                </div>
                <p className="text-[11px] text-muted-foreground mt-1">
                  Active subscriptions
                </p>
              </>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Filter and Search Bar */}
      <Card>
        <CardContent className="p-4 space-y-3">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            {/* Mobile View: Select Dropdown Filter (displays Indonesian label) */}
            <div className="block sm:hidden w-full space-y-1.5">
              <span className="text-[11px] font-medium text-muted-foreground flex items-center gap-1">
                <Filter className="size-3" /> Filter Status Transaksi:
              </span>
              <Select
                value={filter}
                onValueChange={(val) => setFilter(val as FilterStatus)}
              >
                <SelectTrigger className="w-full text-xs h-9">
                  <SelectValue>{STATUS_LABELS[filter]}</SelectValue>
                </SelectTrigger>
                <SelectPopup>
                  <SelectItem value="all">Semua Status</SelectItem>
                  <SelectItem value="completed">Completed (Berhasil)</SelectItem>
                  <SelectItem value="problematic">Needs Attention (Bermasalah)</SelectItem>
                  <SelectItem value="pending">Pending</SelectItem>
                  <SelectItem value="invalid">Underpaid / Invalid</SelectItem>
                  <SelectItem value="expired">Expired (Kadaluarsa)</SelectItem>
                  <SelectItem value="cancelled">Cancelled (Dibatalkan)</SelectItem>
                </SelectPopup>
              </Select>
            </div>

            {/* Desktop View: Unified Segmented Filter Toolbar */}
            <div className="hidden sm:flex items-center bg-muted/50 p-1 rounded-xl border border-border text-xs">
              {(
                [
                  { id: "all", label: `All (${orders.length})` },
                  { id: "completed", label: "Completed" },
                  { id: "problematic", label: "Needs Attention", count: stats?.problem_count },
                  { id: "pending", label: "Pending" },
                  { id: "expired", label: "Expired" },
                  { id: "cancelled", label: "Cancelled" },
                ] as { id: FilterStatus; label: string; count?: number }[]
              ).map((tab) => {
                const isActive = filter === tab.id;
                return (
                  <button
                    key={tab.id}
                    type="button"
                    onClick={() => {
                      setFilter(tab.id);
                      setCurrentPage(1);
                    }}
                    className={`px-3 py-1 rounded-lg font-medium transition-colors cursor-pointer flex items-center gap-1.5 ${
                      isActive
                        ? "bg-card text-foreground shadow-2xs font-semibold"
                        : "text-muted-foreground hover:text-foreground"
                    }`}
                  >
                    <span>{tab.label}</span>
                    {tab.count !== undefined && tab.count > 0 && (
                      <span className="rounded-full bg-warning/90 px-1.5 py-0.2 text-[10px] text-white font-bold leading-tight">
                        {tab.count}
                      </span>
                    )}
                  </button>
                );
              })}
            </div>

            {/* Search Input */}
            <div className="relative w-full sm:w-64">
              <Search className="absolute left-2.5 top-2.5 size-3.5 text-muted-foreground" />
              <Input
                placeholder="Search order, user ID, TipTap..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-8 text-xs h-8"
              />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Transactions Container */}
      <Card>
        <CardHeader className="px-6 py-4 border-b border-border">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <CreditCard className="size-4 text-muted-foreground" />
              <CardTitle className="text-sm font-semibold text-foreground">
                Payment Orders ({orders.length})
              </CardTitle>
            </div>
            {refreshing && <Spinner className="size-4" />}
          </div>
        </CardHeader>
        <CardContent className="p-0">
          {error && (
            <div className="p-6 text-center text-xs text-destructive">
              Error: {error}
            </div>
          )}

          {loading ? (
            <div className="flex justify-center items-center py-12">
              <Spinner className="size-6 text-muted-foreground" />
            </div>
          ) : orders.length === 0 ? (
            <div className="py-12 text-center text-xs text-muted-foreground">
              No transactions found matching your criteria.
            </div>
          ) : (
            <>
              {/* MOBILE COMPACT LIST (visible on sm:hidden) */}
              <div className="block sm:hidden divide-y divide-border">
                {paginatedOrders.map((o) => {
                  const isCompleted = o.status === "completed";
                  return (
                    <div
                      key={o.id}
                      onClick={() => setInspectOrder(o)}
                      className="p-3.5 space-y-2 hover:bg-muted/40 transition-colors cursor-pointer active:bg-muted/60"
                    >
                      {/* Top Row: Code & Status */}
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-1.5 font-mono">
                          <span className="font-bold text-foreground text-sm">
                            {o.order_code}
                          </span>
                          {o.is_early_bird && (
                            <Badge variant="outline" size="sm" className="text-[10px] bg-primary/5 text-primary">
                              Promo
                            </Badge>
                          )}
                        </div>
                        <div>{renderStatusBadge(o)}</div>
                      </div>

                      {/* Bottom Row: Customer, Amount & Reconcile Icon */}
                      <div className="flex items-center justify-between text-xs pt-1">
                        <div className="flex flex-col gap-1">
                          <span className="font-medium text-foreground truncate max-w-[170px] leading-snug">
                            {o.display_name || (o.telegram_user_id ? `@${o.telegram_user_id}` : "User")}
                          </span>
                          <span className="text-[11px] text-muted-foreground">
                            {formatRelativeTime(o.created_at)}
                          </span>
                        </div>
                        <div className="flex items-center gap-2.5">
                          <span className="font-bold text-foreground">
                            {formatIDR(o.amount_idr)}
                          </span>
                          {!isCompleted && (
                            <Button
                              variant="outline"
                              size="icon"
                              className="size-7 text-primary border-primary/30 hover:bg-primary/10"
                              title="Reconcile Order"
                              onClick={(e) => {
                                e.stopPropagation();
                                setReconcileTarget(o);
                              }}
                            >
                              <CheckCheck className="size-3.5" />
                            </Button>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* DESKTOP FULL TABLE (visible on hidden sm:block, row click opens inspect) */}
              <div className="hidden sm:block overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-[140px]">Order Code</TableHead>
                      <TableHead>Customer</TableHead>
                      <TableHead>Plan & Amount</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>TipTap Ref</TableHead>
                      <TableHead>Date</TableHead>
                      <TableHead className="text-right w-[60px]">Action</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {paginatedOrders.map((o) => {
                      const isCompleted = o.status === "completed";

                      return (
                        <TableRow
                          key={o.id}
                          onClick={() => setInspectOrder(o)}
                          className="text-xs cursor-pointer hover:bg-muted/50 transition-colors"
                          title="Click to view full transaction details"
                        >
                          {/* Order Code */}
                          <TableCell className="py-3.5 font-mono font-medium">
                            <div className="flex items-center gap-1.5">
                              <span className="font-semibold text-foreground">{o.order_code}</span>
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleCopy(o.order_code, `code-${o.id}`);
                                }}
                                className="text-muted-foreground hover:text-foreground cursor-pointer"
                                title="Copy Order Code"
                              >
                                {copiedKey === `code-${o.id}` ? (
                                  <Check className="size-3 text-success" />
                                ) : (
                                  <Copy className="size-3" />
                                )}
                              </button>
                              {o.is_early_bird && (
                                <Badge variant="outline" size="sm" className="text-[10px] bg-primary/5 text-primary border-primary/20">
                                  Promo
                                </Badge>
                              )}
                            </div>
                          </TableCell>

                          {/* Customer */}
                          <TableCell className="py-3.5">
                            <div className="flex flex-col gap-1">
                              <span className="font-medium text-foreground leading-snug">
                                {o.display_name || (o.telegram_user_id ? `TG: ${o.telegram_user_id}` : "Unknown")}
                              </span>
                              <span className="text-[11px] text-muted-foreground font-mono">
                                {o.telegram_user_id ? `@${o.telegram_user_id}` : o.user_id.slice(0, 8)}
                              </span>
                            </div>
                          </TableCell>

                          {/* Plan & Amount */}
                          <TableCell className="py-3.5">
                            <div className="flex flex-col gap-1">
                              <span className="font-semibold text-foreground leading-snug">
                                {formatIDR(o.amount_idr)}
                              </span>
                              <span className="text-[11px] text-muted-foreground uppercase tracking-wider font-mono">
                                {o.target_plan} (30 days)
                              </span>
                            </div>
                          </TableCell>

                          {/* Status */}
                          <TableCell className="py-3.5">{renderStatusBadge(o)}</TableCell>

                          {/* TipTap Ref */}
                          <TableCell className="py-3.5 font-mono text-muted-foreground text-[11px]">
                            {o.tiptap_payment_id ? (
                              <span title={o.tiptap_payment_id}>
                                {o.tiptap_payment_id.slice(0, 14)}...
                              </span>
                            ) : (
                              <span className="italic text-muted-foreground/60">—</span>
                            )}
                          </TableCell>

                          {/* Date */}
                          <TableCell className="py-3.5">
                            <div className="flex flex-col gap-1" title={formatDate(o.created_at)}>
                              <span className="text-foreground font-medium leading-snug">{formatRelativeTime(o.created_at)}</span>
                              <span className="text-[11px] text-muted-foreground font-mono">
                                {new Date(o.created_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                              </span>
                            </div>
                          </TableCell>

                          {/* Action (Clean Icon Only) */}
                          <TableCell className="py-3.5 text-right">
                            <div className="flex items-center justify-end">
                              {!isCompleted && (
                                <Button
                                  variant="outline"
                                  size="icon"
                                  className="size-7 text-primary border-primary/30 hover:bg-primary/10 cursor-pointer"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    setReconcileTarget(o);
                                  }}
                                  title="Manually Reconcile / Approve"
                                >
                                  <CheckCheck className="size-3.5" />
                                </Button>
                              )}
                            </div>
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </div>

              {/* Standardized DataTablePagination */}
              <DataTablePagination
                currentPage={currentPage}
                totalPages={totalPages}
                totalItems={orders.length}
                pageSize={PAGE_SIZE}
                onPageChange={setCurrentPage}
                itemName="transaksi"
                loading={loading}
              />
            </>
          )}
        </CardContent>
      </Card>

      {/* INSPECT MODAL: Conditionally render Sheet (desktop) or Drawer (mobile) */}
      {!isMobile ? (
        <Sheet
          open={Boolean(inspectOrder)}
          onOpenChange={(open) => !open && setInspectOrder(null)}
        >
          <SheetPopup side="right" showCloseButton={false} className="max-w-xl w-full">
            <SheetHeader className="border-b border-border pb-4 px-6 pt-5">
              <div className="flex items-center gap-2">
                <CreditCard className="size-4 text-primary" />
                <SheetTitle>Transaction Details</SheetTitle>
              </div>
              <SheetDescription>
                Order Code: <span className="font-mono font-semibold text-foreground">{inspectOrder?.order_code}</span>
              </SheetDescription>
            </SheetHeader>

            <SheetPanel className="px-6 pb-6 overflow-y-auto">
              {inspectOrder && renderDetailContent(inspectOrder)}
            </SheetPanel>
          </SheetPopup>
        </Sheet>
      ) : (
        <Drawer
          open={Boolean(inspectOrder)}
          onOpenChange={(open) => !open && setInspectOrder(null)}
          position="bottom"
        >
          <DrawerPopup position="bottom" showBar={true} showCloseButton={false} className="max-h-[85vh] rounded-t-2xl pb-4">
            <DrawerHeader className="border-b border-border pb-3 px-5 pt-3">
              <div className="flex items-center gap-2">
                <CreditCard className="size-4 text-primary" />
                <DrawerTitle>Transaction Details</DrawerTitle>
              </div>
              <DrawerDescription>
                Order Code: <span className="font-mono font-semibold text-foreground">{inspectOrder?.order_code}</span>
              </DrawerDescription>
            </DrawerHeader>

            <DrawerPanel className="px-5 pb-4 overflow-y-auto">
              {inspectOrder && renderDetailContent(inspectOrder)}
            </DrawerPanel>
          </DrawerPopup>
        </Drawer>
      )}

      {/* DIALOG 1: Confirm Manual Reconciliation */}
      <AlertDialog
        open={Boolean(reconcileTarget)}
        onOpenChange={(open) => !open && setReconcileTarget(null)}
      >
        <AlertDialogPopup className="max-w-md">
          <AlertDialogHeader className="p-6 pb-2 text-left">
            <AlertDialogTitle className="flex items-center gap-2 text-foreground">
              <CheckCheck className="size-4 text-primary" />
              <span>Confirm Manual Reconciliation</span>
            </AlertDialogTitle>
            <AlertDialogDescription className="text-xs text-muted-foreground mt-1">
              Approving order <strong className="text-foreground">{reconcileTarget?.order_code}</strong> will immediately upgrade the user to the Pro plan for 30 days.
            </AlertDialogDescription>
          </AlertDialogHeader>

          <div className="px-6 py-2 space-y-4 text-xs">
            <div className="rounded-xl border border-border bg-card p-3.5 space-y-2">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Customer:</span>
                <span className="font-semibold text-foreground">
                  {reconcileTarget?.display_name || reconcileTarget?.telegram_user_id}
                </span>
              </div>
              <div className="flex justify-between border-t border-border/50 pt-2">
                <span className="text-muted-foreground">Amount:</span>
                <span className="font-bold text-foreground">
                  {formatIDR(reconcileTarget?.amount_idr ?? 0)}
                </span>
              </div>
              <div className="flex justify-between border-t border-border/50 pt-2">
                <span className="text-muted-foreground">TipTap Ref:</span>
                <span className="font-mono text-foreground truncate max-w-[200px]">
                  {reconcileTarget?.tiptap_payment_id || "Manual Operator Reconcile"}
                </span>
              </div>
            </div>

            <div className="space-y-1.5">
              <label htmlFor="reconcile-notes-input" className="text-muted-foreground text-[11px] font-medium block">
                Audit Note / Reason (Optional):
              </label>
              <Input
                id="reconcile-notes-input"
                placeholder="e.g. User verified via bank transfer or underpaid tolerance"
                value={reconcileNotes}
                onChange={(e) => setReconcileNotes(e.target.value)}
                className="text-xs h-9"
              />
            </div>
          </div>

          <AlertDialogFooter className="p-6 pt-3 gap-2">
            <AlertDialogClose
              render={
                <Button variant="outline" size="sm" disabled={isReconciling}>
                  Cancel
                </Button>
              }
            />
            <Button
              variant="default"
              size="sm"
              onClick={handleReconcileSubmit}
              disabled={isReconciling}
              className="gap-1.5 cursor-pointer"
            >
              {isReconciling ? <Spinner className="size-3.5" /> : <CheckCheck className="size-3.5" />}
              <span>Confirm & Activate Pro</span>
            </Button>
          </AlertDialogFooter>
        </AlertDialogPopup>
      </AlertDialog>

      {/* DIALOG 2: Confirm Cancel / Void Order */}
      <AlertDialog
        open={Boolean(cancelTarget)}
        onOpenChange={(open) => !open && setCancelTarget(null)}
      >
        <AlertDialogPopup className="max-w-md">
          <AlertDialogHeader className="p-6 pb-2 text-left">
            <AlertDialogTitle className="flex items-center gap-2 text-destructive">
              <Ban className="size-4 text-destructive" />
              <span>Cancel / Void Payment Order</span>
            </AlertDialogTitle>
            <AlertDialogDescription className="text-xs text-muted-foreground mt-1">
              Marking order <strong className="text-foreground">{cancelTarget?.order_code}</strong> as cancelled will close the transaction and remove it from Needs Attention.
            </AlertDialogDescription>
          </AlertDialogHeader>

          <div className="px-6 py-2 space-y-4 text-xs">
            <div className="rounded-xl border border-destructive/20 bg-destructive/5 p-3.5 space-y-2">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Customer:</span>
                <span className="font-semibold text-foreground">
                  {cancelTarget?.display_name || cancelTarget?.telegram_user_id}
                </span>
              </div>
              <div className="flex justify-between border-t border-destructive/10 pt-2">
                <span className="text-muted-foreground">Order Code:</span>
                <span className="font-mono font-bold text-foreground">
                  {cancelTarget?.order_code}
                </span>
              </div>
            </div>

            <div className="space-y-1.5">
              <label htmlFor="cancel-notes-input" className="text-muted-foreground text-[11px] font-medium block">
                Cancellation Reason / Note:
              </label>
              <Input
                id="cancel-notes-input"
                placeholder="e.g. Pembayaran dibatalkan karena batas waktu habis atau kesalahan user"
                value={cancelNotes}
                onChange={(e) => setCancelNotes(e.target.value)}
                className="text-xs h-9"
              />
            </div>

            {/* Checkbox Telegram Notification */}
            <div className="flex items-center gap-2.5 rounded-lg border border-border p-3 bg-muted/20">
              <Checkbox
                id="notify-cancel-user"
                checked={cancelNotifyUser}
                onCheckedChange={(checked) => setCancelNotifyUser(Boolean(checked))}
              />
              <label htmlFor="notify-cancel-user" className="text-xs text-foreground cursor-pointer select-none">
                Kirim notifikasi pembatalan ke Telegram user
              </label>
            </div>
          </div>

          <AlertDialogFooter className="p-6 pt-3 gap-2">
            <AlertDialogClose
              render={
                <Button variant="outline" size="sm" disabled={isCancelling}>
                  Back
                </Button>
              }
            />
            <Button
              variant="destructive"
              size="sm"
              onClick={handleCancelSubmit}
              disabled={isCancelling}
              className="gap-1.5 cursor-pointer"
            >
              {isCancelling ? <Spinner className="size-3.5" /> : <Ban className="size-3.5" />}
              <span>Cancel Order</span>
            </Button>
          </AlertDialogFooter>
        </AlertDialogPopup>
      </AlertDialog>

      {/* DIALOG 3: Confirm Expire Order */}
      <AlertDialog
        open={Boolean(expireTarget)}
        onOpenChange={(open) => !open && setExpireTarget(null)}
      >
        <AlertDialogPopup className="max-w-md">
          <AlertDialogHeader className="p-6 pb-2 text-left">
            <AlertDialogTitle className="flex items-center gap-2 text-amber-500">
              <Clock className="size-4 text-amber-500" />
              <span>Mark Order as Expired</span>
            </AlertDialogTitle>
            <AlertDialogDescription className="text-xs text-muted-foreground mt-1">
              Marking order <strong className="text-foreground">{expireTarget?.order_code}</strong> as expired will close this invoice.
            </AlertDialogDescription>
          </AlertDialogHeader>

          <div className="px-6 py-2 space-y-4 text-xs">
            <div className="rounded-xl border border-amber-500/20 bg-amber-500/5 p-3.5 space-y-2">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Customer:</span>
                <span className="font-semibold text-foreground">
                  {expireTarget?.display_name || expireTarget?.telegram_user_id}
                </span>
              </div>
              <div className="flex justify-between border-t border-amber-500/10 pt-2">
                <span className="text-muted-foreground">Order Code:</span>
                <span className="font-mono font-bold text-foreground">
                  {expireTarget?.order_code}
                </span>
              </div>
            </div>

            <div className="space-y-1.5">
              <label htmlFor="expire-notes-input" className="text-muted-foreground text-[11px] font-medium block">
                Audit Note (Optional):
              </label>
              <Input
                id="expire-notes-input"
                placeholder="e.g. Ditandai kadaluarsa oleh admin karena tidak ada konfirmasi transfer"
                value={expireNotes}
                onChange={(e) => setExpireNotes(e.target.value)}
                className="text-xs h-9"
              />
            </div>

            {/* Checkbox Telegram Notification */}
            <div className="flex items-center gap-2.5 rounded-lg border border-border p-3 bg-muted/20">
              <Checkbox
                id="notify-expire-user"
                checked={expireNotifyUser}
                onCheckedChange={(checked) => setExpireNotifyUser(Boolean(checked))}
              />
              <label htmlFor="notify-expire-user" className="text-xs text-foreground cursor-pointer select-none">
                Kirim notifikasi kadaluarsa ke Telegram user
              </label>
            </div>
          </div>

          <AlertDialogFooter className="p-6 pt-3 gap-2">
            <AlertDialogClose
              render={
                <Button variant="outline" size="sm" disabled={isExpiring}>
                  Back
                </Button>
              }
            />
            <Button
              variant="default"
              size="sm"
              onClick={handleExpireSubmit}
              disabled={isExpiring}
              className="gap-1.5 cursor-pointer bg-amber-600 hover:bg-amber-700 text-white"
            >
              {isExpiring ? <Spinner className="size-3.5" /> : <Clock className="size-3.5" />}
              <span>Mark Expired</span>
            </Button>
          </AlertDialogFooter>
        </AlertDialogPopup>
      </AlertDialog>
    </div>
  );
}
