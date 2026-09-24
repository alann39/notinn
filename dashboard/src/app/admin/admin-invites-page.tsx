import { useEffect, useState, useCallback, useMemo } from "react";
import {
  Ticket,
  Plus,
  RefreshCw,
  Copy,
  Check,
  AlertCircle,
  Ban,
  Sparkles,
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
  DialogTrigger,
  DialogPopup,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
  DialogClose,
} from "@/components/ui/dialog";
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
import { DataTablePagination } from "@/components/admin/data-table-pagination";
import { toastManager } from "@/components/ui/toast";
import { useAdmin, generateInviteCode } from "@/hooks/use-admin";
import type { AdminInvite } from "@/types/admin";
import { formatDate, formatRelativeTime } from "@/lib/utils";

export function AdminInvitesPage() {
  const { listInvites, createInvite, revokeInvite } = useAdmin();
  const [invites, setInvites] = useState<AdminInvite[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Create invite dialog state
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [generatedCode, setGeneratedCode] = useState("");
  const [maxRedemptions, setMaxRedemptions] = useState(1);
  const [validDays, setValidDays] = useState(30);
  const [isCreating, setIsCreating] = useState(false);
  const [copiedCode, setCopiedCode] = useState(false);
  const [newlyCreatedCode, setNewlyCreatedCode] = useState<string | null>(null);

  const PAGE_SIZE = 10;
  const [currentPage, setCurrentPage] = useState(1);
  const totalPages = Math.max(1, Math.ceil(invites.length / PAGE_SIZE));
  const paginatedInvites = useMemo(() => {
    const start = (currentPage - 1) * PAGE_SIZE;
    return invites.slice(start, start + PAGE_SIZE);
  }, [invites, currentPage]);

  const fetchInvites = useCallback(async (isRefresh = false) => {
    if (isRefresh) setRefreshing(true);
    else setLoading(true);
    setError(null);

    try {
      const data = await listInvites();
      setInvites(data);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Failed to load invites";
      setError(message);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [listInvites]);

  useEffect(() => {
    fetchInvites();
  }, [fetchInvites]);

  const handleOpenCreate = () => {
    setGeneratedCode(generateInviteCode());
    setMaxRedemptions(1);
    setValidDays(30);
    setNewlyCreatedCode(null);
    setCreateDialogOpen(true);
  };

  const handleCreateInvite = async () => {
    if (!generatedCode) return;
    setIsCreating(true);
    try {
      await createInvite(generatedCode, maxRedemptions, validDays);
      setNewlyCreatedCode(generatedCode);
      toastManager.add({
        title: "Invite Created",
        description: `Code: ${generatedCode}`,
        type: "success",
      });
      fetchInvites(true);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Failed to create invite";
      toastManager.add({
        title: "Creation Failed",
        description: message,
        type: "error",
      });
    } finally {
      setIsCreating(false);
    }
  };

  const handleRevoke = async (inviteId: string) => {
    try {
      await revokeInvite(inviteId);
      toastManager.add({
        title: "Invite Revoked",
        description: "The invite code has been permanently invalidated.",
        type: "success",
      });
      fetchInvites(true);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Failed to revoke invite";
      toastManager.add({
        title: "Revocation Failed",
        description: message,
        type: "error",
      });
    }
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    setCopiedCode(true);
    setTimeout(() => setCopiedCode(false), 2000);
  };

  const getInviteStatusBadge = (invite: AdminInvite) => {
    if (invite.revoked_at) {
      return <Badge variant="destructive" className="font-mono text-[10px]">REVOKED</Badge>;
    }
    const isExpired = new Date(invite.expires_at).getTime() <= Date.now();
    if (isExpired) {
      return <Badge variant="outline" className="text-muted-foreground font-mono text-[10px]">EXPIRED</Badge>;
    }
    if (invite.redemption_count >= invite.max_redemptions) {
      return <Badge variant="outline" className="text-amber-500 border-amber-500 font-mono text-[10px]">EXHAUSTED</Badge>;
    }
    return <Badge variant="secondary" className="bg-emerald-500/10 text-emerald-500 font-mono text-[10px]">ACTIVE</Badge>;
  };

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      {/* Title & Topbar Actions */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-foreground">
            Closed Alpha Invites
          </h1>
          <p className="text-xs text-muted-foreground mt-1">
            Generate cryptographically hashed invite codes and govern closed-alpha access.
          </p>
        </div>

        <div className="flex items-center gap-2.5">
          <Button
            variant="outline"
            size="sm"
            onClick={() => fetchInvites(true)}
            disabled={refreshing}
            className="gap-1.5 text-xs font-medium cursor-pointer"
          >
            <RefreshCw className={`size-3.5 ${refreshing ? "animate-spin" : ""}`} />
            <span className="hidden sm:inline">Refresh</span>
          </Button>

          {/* Create Invite Dialog */}
          <Dialog open={createDialogOpen} onOpenChange={setCreateDialogOpen}>
            <DialogTrigger
              render={
                <Button
                  size="sm"
                  onClick={handleOpenCreate}
                  className="gap-1.5 text-xs font-medium cursor-pointer"
                >
                  <Plus className="size-3.5" />
                  <span>Generate Invite</span>
                </Button>
              }
            />
            <DialogPopup className="max-w-md">
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2">
                  <Sparkles className="size-4 text-indigo-400" />
                  <span>Create Closed Alpha Invite</span>
                </DialogTitle>
                <DialogDescription>
                  Generates an invite code. Postgres stores only its SHA-256 hash.
                </DialogDescription>
              </DialogHeader>

              {newlyCreatedCode ? (
                <div className="p-6 space-y-4">
                  <div className="p-4 rounded-xl bg-muted/60 border border-border text-center space-y-3">
                    <span className="text-[11px] text-muted-foreground font-medium block">
                      Save this code now. It cannot be recovered:
                    </span>
                    <div className="font-mono text-base font-bold text-foreground select-all bg-card py-2 px-3 rounded-lg border border-border">
                      {newlyCreatedCode}
                    </div>
                    <div className="pt-1">
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => copyToClipboard(`/start ${newlyCreatedCode}`)}
                        className="gap-1.5 text-xs w-full"
                      >
                        {copiedCode ? <Check className="size-3.5 text-emerald-500" /> : <Copy className="size-3.5" />}
                        <span>{copiedCode ? "Copied Command!" : "Copy Telegram /start Command"}</span>
                      </Button>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="p-6 space-y-4 text-xs">
                  <div className="space-y-1.5">
                    <label className="font-medium text-foreground block">Code (Auto-Generated)</label>
                    <div className="font-mono text-xs bg-muted/40 p-2.5 rounded-lg border border-border flex items-center justify-between">
                      <span>{generatedCode}</span>
                      <button
                        type="button"
                        onClick={() => setGeneratedCode(generateInviteCode())}
                        className="text-[10px] text-muted-foreground hover:text-foreground underline cursor-pointer"
                      >
                        Regenerate
                      </button>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1.5">
                      <label className="font-medium text-foreground block">Max Redemptions</label>
                      <Input
                        type="number"
                        min={1}
                        max={1000}
                        value={maxRedemptions}
                        onChange={(e) => setMaxRedemptions(Math.max(1, Number(e.target.value)))}
                        className="h-9 text-xs font-mono"
                      />
                    </div>
                    <div className="space-y-1.5">
                      <label className="font-medium text-foreground block">Validity (Days)</label>
                      <Input
                        type="number"
                        min={1}
                        max={365}
                        value={validDays}
                        onChange={(e) => setValidDays(Math.max(1, Number(e.target.value)))}
                        className="h-9 text-xs font-mono"
                      />
                    </div>
                  </div>
                </div>
              )}

              <DialogFooter>
                {newlyCreatedCode ? (
                  <DialogClose
                    render={
                      <Button size="sm" className="w-full">
                        Done
                      </Button>
                    }
                  />
                ) : (
                  <>
                    <DialogClose
                      render={
                        <Button variant="outline" size="sm">
                          Cancel
                        </Button>
                      }
                    />
                    <Button
                      size="sm"
                      disabled={isCreating}
                      onClick={handleCreateInvite}
                      className="cursor-pointer"
                    >
                      {isCreating ? <Spinner className="size-3.5" /> : "Confirm & Create"}
                    </Button>
                  </>
                )}
              </DialogFooter>
            </DialogPopup>
          </Dialog>
        </div>
      </div>

      {error && (
        <div className="p-4 rounded-xl bg-destructive/10 border border-destructive/20 text-destructive text-xs flex items-center gap-2">
          <AlertCircle className="size-4 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {/* Invites Table Card */}
      <Card className="rounded-2xl border-border bg-card overflow-hidden">
        {loading && !refreshing ? (
          <div className="flex flex-col items-center justify-center py-20 space-y-3">
            <Spinner className="size-6 text-foreground" />
            <p className="text-xs text-muted-foreground font-medium">Loading closed alpha invites…</p>
          </div>
        ) : invites.length === 0 ? (
          <div className="text-center py-16 px-4 space-y-2">
            <div className="flex size-10 mx-auto items-center justify-center rounded-xl bg-muted text-muted-foreground">
              <Ticket className="size-5" />
            </div>
            <h3 className="text-sm font-semibold text-foreground">No active invites</h3>
            <p className="text-xs text-muted-foreground max-w-sm mx-auto">
              You haven't generated any closed-alpha invite codes yet. Click "Generate Invite" above to create one.
            </p>
          </div>
        ) : (
          <>
            <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>SHA-256 Digest</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-center">Redemptions</TableHead>
                  <TableHead>Expires</TableHead>
                  <TableHead>Created</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {paginatedInvites.map((inv) => (
                  <TableRow key={inv.id} className="hover:bg-muted/40 transition-colors">
                    <TableCell className="font-mono text-xs">
                      <span title={inv.code_sha256}>
                        {inv.code_sha256.slice(0, 10)}…{inv.code_sha256.slice(-6)}
                      </span>
                    </TableCell>

                    <TableCell>{getInviteStatusBadge(inv)}</TableCell>

                    <TableCell className="text-center font-mono text-xs">
                      <span className="font-semibold text-foreground">{inv.redemption_count}</span>
                      <span className="text-muted-foreground"> / {inv.max_redemptions}</span>
                    </TableCell>

                    <TableCell className="text-xs text-muted-foreground">
                      <div className="flex flex-col">
                        <span>{formatDate(inv.expires_at)}</span>
                        <span className="text-[10px] text-muted-foreground/70">{formatRelativeTime(inv.expires_at)}</span>
                      </div>
                    </TableCell>

                    <TableCell className="text-xs text-muted-foreground">
                      {formatDate(inv.created_at)}
                    </TableCell>

                    <TableCell className="text-right">
                      {!inv.revoked_at && new Date(inv.expires_at).getTime() > Date.now() && (
                        <AlertDialog>
                          <AlertDialogTrigger
                            render={
                              <Button
                                variant="outline"
                                size="sm"
                                className="size-7 p-0 text-destructive hover:text-destructive cursor-pointer"
                                title="Revoke Invite"
                              >
                                <Ban className="size-3.5" />
                              </Button>
                            }
                          />
                          <AlertDialogPopup>
                            <AlertDialogHeader>
                              <AlertDialogTitle>Revoke Closed Alpha Invite?</AlertDialogTitle>
                              <AlertDialogDescription>
                                This will permanently invalidate this invite code. Anyone attempting to redeem it in Telegram will be refused.
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
                                    variant="destructive"
                                    size="sm"
                                    onClick={() => handleRevoke(inv.id)}
                                  >
                                    Confirm Revoke
                                  </Button>
                                }
                              />
                            </AlertDialogFooter>
                          </AlertDialogPopup>
                        </AlertDialog>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>

          <DataTablePagination
            currentPage={currentPage}
            totalPages={totalPages}
            totalItems={invites.length}
            pageSize={PAGE_SIZE}
            onPageChange={setCurrentPage}
            itemName="invite"
            loading={loading}
          />
        </>
      )}
    </Card>
    </div>
  );
}
