import { useState, useEffect, useCallback, useRef } from "react";
import {
  Sparkles,
  Copy,
  Check,
  RefreshCw,
  CheckCircle2,
  AlertTriangle,
  Clock,
  ArrowUpRight,
  Zap,
} from "lucide-react";
import { supabase } from "@/lib/supabase";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Spinner } from "@/components/ui/spinner";
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
import { toastManager } from "@/components/ui/toast";
import { useIsMobile } from "@/hooks/use-media-query";

interface UpgradeOrderData {
  order_code: string;
  amount_idr: number;
  is_early_bird: boolean;
  early_bird_remaining: number;
  expires_at: string;
}

interface UpgradeDrawerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onUpgraded?: () => void;
}

export function UpgradeDrawer({
  open,
  onOpenChange,
  onUpgraded,
}: UpgradeDrawerProps) {
  const isMobile = useIsMobile();
  const [order, setOrder] = useState<UpgradeOrderData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [copiedKey, setCopiedKey] = useState<string | null>(null);
  const [isChecking, setIsChecking] = useState(false);
  const [isCompleted, setIsCompleted] = useState(false);
  const [isExpired, setIsExpired] = useState(false);

  const pollingRef = useRef<number | null>(null);

  const copyToClipboard = (text: string, key: string) => {
    navigator.clipboard.writeText(text);
    setCopiedKey(key);
    toastManager.add({
      title: "Copied",
      description: `"${text}" copied to clipboard.`,
      type: "success",
    });
    setTimeout(() => setCopiedKey(null), 2000);
  };

  // Create or fetch active upgrade order
  const initOrder = useCallback(async () => {
    setLoading(true);
    setError(null);
    setIsCompleted(false);
    setIsExpired(false);

    try {
      const { data, error: rpcErr } = await supabase.rpc("web_create_upgrade_order");
      if (rpcErr) throw rpcErr;

      if (Array.isArray(data) && data.length > 0) {
        const row = data[0] as UpgradeOrderData;
        setOrder(row);

        // Check if already completed / active
        const { data: statusData } = await supabase.rpc("web_get_upgrade_order_status", {
          p_order_code: row.order_code,
        });

        if (Array.isArray(statusData) && statusData.length > 0) {
          const s = statusData[0];
          if (s.status === "completed" || s.user_current_plan === "pro") {
            setIsCompleted(true);
            onUpgraded?.();
          } else if (s.is_past_expiry) {
            setIsExpired(true);
          }
        }
      } else {
        throw new Error("Could not prepare order");
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Something went wrong while loading the transaction data";
      setError(msg);
    } finally {
      setLoading(false);
    }
  }, [onUpgraded]);

  // Check order status manually or via polling
  const checkStatus = useCallback(
    async (silent = false) => {
      if (!order) return;
      if (!silent) setIsChecking(true);

      try {
        const { data, error: statusErr } = await supabase.rpc("web_get_upgrade_order_status", {
          p_order_code: order.order_code,
        });

        if (statusErr) throw statusErr;

        if (Array.isArray(data) && data.length > 0) {
          const s = data[0];
          if (s.status === "completed" || s.user_current_plan === "pro") {
            setIsCompleted(true);
            onUpgraded?.();
            toastManager.add({
              title: "Payment confirmed",
              description: "Your account is now active as Notinn Pro.",
              type: "success",
            });
            if (pollingRef.current) {
              clearInterval(pollingRef.current);
              pollingRef.current = null;
            }
          } else if (s.is_past_expiry) {
            setIsExpired(true);
          } else if (!silent) {
            toastManager.add({
              title: "Status: Waiting for payment",
              description: "No payment detected yet. Transfer in TipTap and enter the order code.",
              type: "default",
            });
          }
        }
      } catch (err: unknown) {
        if (!silent) {
          const msg = err instanceof Error ? err.message : "Could not check status";
          toastManager.add({
            title: "Could not check status",
            description: msg,
            type: "error",
          });
        }
      } finally {
        if (!silent) setIsChecking(false);
      }
    },
    [order, onUpgraded],
  );

  // Initialize order when opened
  useEffect(() => {
    if (open) {
      initOrder();
    } else {
      setOrder(null);
      setIsCompleted(false);
      setIsExpired(false);
      if (pollingRef.current) {
        clearInterval(pollingRef.current);
        pollingRef.current = null;
      }
    }
  }, [open, initOrder]);

  // Auto-polling every 5 seconds while open, pending, and not completed
  useEffect(() => {
    if (open && order && !isCompleted && !isExpired) {
      pollingRef.current = window.setInterval(() => {
        checkStatus(true);
      }, 5000);

      return () => {
        if (pollingRef.current) {
          clearInterval(pollingRef.current);
          pollingRef.current = null;
        }
      };
    }
  }, [open, order, isCompleted, isExpired, checkStatus]);

  const formatIDR = (val: number) => {
    return new Intl.NumberFormat("id-ID", {
      style: "currency",
      currency: "IDR",
      maximumFractionDigits: 0,
    }).format(val);
  };

  const renderContent = () => {
    if (loading) {
      return (
        <div className="flex flex-col items-center justify-center py-24 space-y-3">
          <Spinner className="size-6 text-foreground" />
          <p className="text-xs text-muted-foreground font-medium">Preparing the transaction code…</p>
        </div>
      );
    }

    if (error || !order) {
      return (
        <div className="py-12 space-y-4 text-center px-4">
          <div className="size-10 rounded-full bg-destructive/10 text-destructive mx-auto flex items-center justify-center">
            <AlertTriangle className="size-5" />
          </div>
          <div className="space-y-1">
            <h4 className="font-semibold text-sm text-foreground">Could not prepare order</h4>
            <p className="text-xs text-muted-foreground">{error || "Something went wrong while loading the transaction data"}</p>
          </div>
          <Button size="sm" variant="outline" onClick={initOrder} className="gap-1.5 text-xs">
            <RefreshCw className="size-3.5" />
            <span>Try again</span>
          </Button>
        </div>
      );
    }

    // Success Screen
    if (isCompleted) {
      return (
        <div className="py-8 space-y-5 text-center px-2">
          <div className="size-16 rounded-2xl bg-success/15 border border-success/30 text-success mx-auto flex items-center justify-center animate-in zoom-in-95 duration-200">
            <CheckCircle2 className="size-8" />
          </div>
          <div className="space-y-1.5">
            <Badge variant="outline" className="border-success/30 text-success bg-success/10 text-xs font-semibold px-2.5 py-0.5">
              Pro active for 30 days
            </Badge>
            <h3 className="text-xl font-bold text-foreground tracking-tight">
              Payment confirmed.
            </h3>
            <p className="text-xs text-muted-foreground leading-relaxed max-w-sm mx-auto">
              Your account has been upgraded to <span className="font-semibold text-foreground">Notinn Pro</span>. 1,000 notes per month and full web dashboard access are active now.
            </p>
          </div>

          <div className="p-4 rounded-xl border border-border bg-card/60 text-xs space-y-2 text-left">
            <div className="flex justify-between items-center text-muted-foreground">
              <span>Transaction code:</span>
              <span className="font-mono font-semibold text-foreground">{order.order_code}</span>
            </div>
            <div className="flex justify-between items-center text-muted-foreground">
              <span>Plan:</span>
              <span className="font-semibold text-foreground">Notinn Pro (30 days)</span>
            </div>
            <div className="flex justify-between items-center text-muted-foreground">
              <span>Payment amount:</span>
              <span className="font-semibold text-foreground">{formatIDR(order.amount_idr)}</span>
            </div>
          </div>

          <Button
            variant="default"
            className="w-full text-xs font-medium cursor-pointer"
            onClick={() => onOpenChange(false)}
          >
            Done
          </Button>
        </div>
      );
    }

    // Expired Screen
    if (isExpired) {
      return (
        <div className="py-12 space-y-4 text-center px-4">
          <div className="size-10 rounded-full bg-warning/10 text-warning mx-auto flex items-center justify-center">
            <Clock className="size-5" />
          </div>
          <div className="space-y-1">
            <h4 className="font-semibold text-sm text-foreground">Order code expired</h4>
            <p className="text-xs text-muted-foreground">
              The 24-hour validity for this transaction code has passed. Create a new transaction code.
            </p>
          </div>
          <Button size="sm" variant="default" onClick={initOrder} className="gap-1.5 text-xs">
            <RefreshCw className="size-3.5" />
            <span>Create a new order</span>
          </Button>
        </div>
      );
    }

    // Standard Payment Guide View
    return (
      <div className="space-y-5 text-xs">
        {/* Transaction Summary Card */}
        <div className="rounded-xl border border-border bg-card p-4 space-y-3.5 shadow-xs">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-1.5">
              <Sparkles className="size-4 text-primary" />
              <span className="font-bold text-foreground text-sm">Notinn Pro (30 days)</span>
            </div>
            {order.is_early_bird && (
              <Badge variant="outline" size="sm" className="bg-primary/10 text-primary border-primary/25 font-semibold text-[10px]">
                Promo Early Bird
              </Badge>
            )}
          </div>

          {/* Amount Box */}
          <div className="p-3 rounded-lg bg-muted/40 border border-border/80 flex items-center justify-between">
            <div className="space-y-0.5">
              <span className="text-[11px] text-muted-foreground block font-medium">Payment amount</span>
              <span className="font-bold text-lg text-foreground font-mono">
                {formatIDR(order.amount_idr)}
              </span>
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={() => copyToClipboard(String(order.amount_idr), "amount")}
              className="h-8 gap-1.5 text-xs cursor-pointer"
            >
              {copiedKey === "amount" ? (
                <Check className="size-3.5 text-success" />
              ) : (
                <Copy className="size-3.5" />
              )}
              <span>{copiedKey === "amount" ? "Copied" : "Copy amount"}</span>
            </Button>
          </div>

          {/* Order Code Box */}
          <div className="p-3 rounded-lg bg-primary/5 border border-primary/20 flex items-center justify-between">
            <div className="space-y-0.5">
              <span className="text-[11px] text-primary font-medium flex items-center gap-1">
                <Zap className="size-3" /> Transaction note code (required)
              </span>
              <span className="font-bold text-base text-foreground font-mono tracking-wider">
                {order.order_code}
              </span>
            </div>
            <Button
              variant="default"
              size="sm"
              onClick={() => copyToClipboard(order.order_code, "code")}
              className="h-8 gap-1.5 text-xs cursor-pointer"
            >
              {copiedKey === "code" ? (
                <Check className="size-3.5" />
              ) : (
                <Copy className="size-3.5" />
              )}
              <span>{copiedKey === "code" ? "Copied" : "Copy code"}</span>
            </Button>
          </div>

          <div className="flex items-center justify-between text-[11px] text-muted-foreground pt-0.5">
            <span className="flex items-center gap-1">
              <Clock className="size-3" /> Valid for 24 hours
            </span>
            {order.is_early_bird && (
              <span className="text-primary font-medium">
                {order.early_bird_remaining} promo quota left
              </span>
            )}
          </div>
        </div>

        {/* Step-by-Step Payment Instructions */}
        <div className="space-y-2.5">
          <span className="font-semibold text-foreground text-xs block">
            How to pay with TipTap:
          </span>
          <div className="space-y-2 rounded-xl border border-border bg-card/40 p-3.5 text-[11px] leading-relaxed">
            <div className="flex items-start gap-2.5">
              <span className="size-4.5 rounded-full bg-muted border border-border text-foreground font-bold flex items-center justify-center shrink-0 text-[10px]">
                1
              </span>
              <p className="text-muted-foreground pt-0.5">
                Select <span className="font-semibold text-foreground">Pay now in TipTap</span> below to open the TipTap checkout page.
              </p>
            </div>

            <div className="flex items-start gap-2.5">
              <span className="size-4.5 rounded-full bg-muted border border-border text-foreground font-bold flex items-center justify-center shrink-0 text-[10px]">
                2
              </span>
              <p className="text-muted-foreground pt-0.5">
                Enter the exact amount <span className="font-semibold text-foreground font-mono">{formatIDR(order.amount_idr)}</span>.
              </p>
            </div>

            <div className="flex items-start gap-2.5">
              <span className="size-4.5 rounded-full bg-primary/10 border border-primary/30 text-primary font-bold flex items-center justify-center shrink-0 text-[10px]">
                3
              </span>
              <p className="text-muted-foreground pt-0.5">
                <span className="font-semibold text-foreground text-primary">Very important:</span> in the <span className="font-semibold text-foreground">Message / Note</span> field, paste the code <code className="font-mono font-bold bg-muted px-1 py-0.2 rounded border border-border text-foreground">{order.order_code}</code> so the payment verifies automatically.
              </p>
            </div>

            <div className="flex items-start gap-2.5">
              <span className="size-4.5 rounded-full bg-muted border border-border text-foreground font-bold flex items-center justify-center shrink-0 text-[10px]">
                4
              </span>
              <p className="text-muted-foreground pt-0.5">
                Choose a payment method (QRIS, GoPay, OVO, Dana, VA) and complete the transaction in TipTap.
              </p>
            </div>

            <div className="flex items-start gap-2.5">
              <span className="size-4.5 rounded-full bg-muted border border-border text-foreground font-bold flex items-center justify-center shrink-0 text-[10px]">
                5
              </span>
              <p className="text-muted-foreground pt-0.5">
                After TipTap payment succeeds, this page detects it and activates your Pro account automatically.
              </p>
            </div>
          </div>
        </div>

        {/* Live Auto-Check Indicator */}
        <div className="rounded-lg bg-muted/40 border border-border p-2.5 flex items-center justify-between text-[11px]">
          <div className="flex items-center gap-2">
            <span className="relative flex size-2">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-primary opacity-75"></span>
              <span className="relative inline-flex rounded-full size-2 bg-primary"></span>
            </span>
            <span className="text-muted-foreground">Auto-check is on (every 5 seconds)</span>
          </div>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => checkStatus(false)}
            disabled={isChecking}
            className="h-6 text-[11px] gap-1 px-2 cursor-pointer"
          >
            <RefreshCw className={`size-3 ${isChecking ? "animate-spin" : ""}`} />
            <span>Check manually</span>
          </Button>
        </div>

        {/* Action Buttons */}
        <div className="pt-2 space-y-2">
          <Button
            variant="default"
            className="w-full gap-2 text-xs font-medium h-10 cursor-pointer shadow-xs"
            onClick={() => window.open("https://tiptap.gg/notinn", "_blank")}
          >
            <span>Pay now in TipTap</span>
            <ArrowUpRight className="size-4" />
          </Button>

          <Button
            variant="outline"
            className="w-full gap-1.5 text-xs font-medium h-9 cursor-pointer"
            onClick={() => checkStatus(false)}
            disabled={isChecking}
          >
            <RefreshCw className={`size-3.5 ${isChecking ? "animate-spin" : ""}`} />
            <span>{isChecking ? "Checking payment…" : "Check payment status"}</span>
          </Button>
        </div>
      </div>
    );
  };

  if (!isMobile) {
    return (
      <Sheet open={open} onOpenChange={onOpenChange}>
        <SheetPopup side="right" className="sm:max-w-md w-full">
          <SheetHeader className="px-6 pt-5 pb-3 border-b border-border">
            <SheetTitle className="flex items-center gap-2 text-base">
              <Sparkles className="size-4 text-primary" />
              <span>Upgrade to Notinn Pro</span>
            </SheetTitle>
            <SheetDescription className="text-xs">
              Get 1,000 notes per month and full web dashboard access.
            </SheetDescription>
          </SheetHeader>
          <SheetPanel className="p-6 overflow-y-auto">
            {renderContent()}
          </SheetPanel>
        </SheetPopup>
      </Sheet>
    );
  }

  return (
    <Drawer open={open} onOpenChange={onOpenChange}>
      <DrawerPopup position="bottom" className="max-h-[90vh]">
        <DrawerHeader className="px-5 pt-4 pb-3 border-b border-border">
          <DrawerTitle className="flex items-center gap-2 text-base">
            <Sparkles className="size-4 text-primary" />
            <span>Upgrade to Notinn Pro</span>
          </DrawerTitle>
          <DrawerDescription className="text-xs">
            Get 1,000 notes per month and full web dashboard access.
          </DrawerDescription>
        </DrawerHeader>
        <DrawerPanel className="p-5 overflow-y-auto">
          {renderContent()}
        </DrawerPanel>
      </DrawerPopup>
    </Drawer>
  );
}
