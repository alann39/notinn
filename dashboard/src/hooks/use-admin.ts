import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/lib/supabase";
import { useAuth } from "./use-auth";
import type {
  AdminHealth,
  AdminJob,
  AdminUser,
  AdminInvite,
  AdminProviderKey,
  AdminKeyTestResult,
} from "@/types/admin";

export async function sha256Hex(text: string): Promise<string> {
  const msgUint8 = new TextEncoder().encode(text);
  const hashBuffer = await crypto.subtle.digest("SHA-256", msgUint8);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");
}

export function generateInviteCode(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(12));
  return `NTN_${Array.from(bytes).map((b) => b.toString(16).padStart(2, "0")).join("").toUpperCase()}`;
}

export function useAdmin() {
  const { session, loading: authLoading } = useAuth();
  const [isAdmin, setIsAdmin] = useState<boolean | null>(null);
  const [loading, setLoading] = useState(true);

  const checkAccess = useCallback(async () => {
    if (!session) {
      setIsAdmin(false);
      setLoading(false);
      return false;
    }

    try {
      const { data, error } = await supabase.rpc("admin_check_access");
      if (error) {
        setIsAdmin(false);
        return false;
      }
      const admin = Boolean(data);
      setIsAdmin(admin);
      return admin;
    } catch {
      setIsAdmin(false);
      return false;
    } finally {
      setLoading(false);
    }
  }, [session]);

  useEffect(() => {
    if (!authLoading) {
      checkAccess();
    }
  }, [authLoading, checkAccess]);

  const getHealth = useCallback(async (): Promise<AdminHealth> => {
    const { data, error } = await supabase.rpc("admin_get_health");
    if (error) throw error;
    const row = Array.isArray(data) ? data[0] : data;
    return {
      queue_depth: Number(row?.queue_depth ?? 0),
      stale_jobs: Number(row?.stale_jobs ?? 0),
      failed_jobs: Number(row?.failed_jobs ?? 0),
      deletion_backlog: Number(row?.deletion_backlog ?? 0),
      active_users: Number(row?.active_users ?? 0),
      total_notes: Number(row?.total_notes ?? 0),
    };
  }, []);

  const listJobs = useCallback(async (limit: number = 50): Promise<AdminJob[]> => {
    const { data, error } = await supabase.rpc("admin_list_jobs", { p_limit: limit });
    if (error) throw error;
    return (data || []).map((row: Record<string, unknown>) => ({
      job_id: String(row.job_id),
      user_id: String(row.user_id),
      state: String(row.state),
      attempt_count: Number(row.attempt_count),
      created_at: String(row.created_at),
      last_error_code: row.last_error_code ? String(row.last_error_code) : null,
    }));
  }, []);

  const requeueJob = useCallback(async (jobId: string): Promise<string> => {
    const { data, error } = await supabase.rpc("admin_requeue_job", { p_job_id: jobId });
    if (error) throw error;
    return data;
  }, []);

  const cancelJob = useCallback(async (jobId: string): Promise<string> => {
    const { data, error } = await supabase.rpc("admin_cancel_job", { p_job_id: jobId });
    if (error) throw error;
    return data;
  }, []);

  const listUsers = useCallback(async (
    search: string = "",
    limit: number = 50,
    offset: number = 0,
  ): Promise<AdminUser[]> => {
    const { data, error } = await supabase.rpc("admin_list_users", {
      p_search: search.trim() || null,
      p_limit: limit,
      p_offset: offset,
    });
    if (error) throw error;
    return (data || []).map((row: Record<string, unknown>) => ({
      id: String(row.id),
      telegram_user_id: Number(row.telegram_user_id),
      status: String(row.status),
      alpha_access_status: row.alpha_access_status ? String(row.alpha_access_status) : null,
      plan_key: String(row.plan_key),
      created_at: String(row.created_at),
      notes_count: Number(row.notes_count),
      active_jobs: Number(row.active_jobs),
      failed_jobs: Number(row.failed_jobs),
      is_admin: Boolean(row.is_admin),
    }));
  }, []);

  const setUserPlan = useCallback(async (userId: string, planKey: string): Promise<string> => {
    const { data, error } = await supabase.rpc("admin_set_user_plan", {
      p_user_id: userId,
      p_plan_key: planKey,
    });
    if (error) throw error;
    return data;
  }, []);

  const setUserStatus = useCallback(async (userId: string, status: string): Promise<string> => {
    const { data, error } = await supabase.rpc("admin_set_user_status", {
      p_user_id: userId,
      p_status: status,
    });
    if (error) throw error;
    return data;
  }, []);

  const listInvites = useCallback(async (): Promise<AdminInvite[]> => {
    const { data, error } = await supabase.rpc("admin_list_invites");
    if (error) throw error;
    return (data || []).map((row: Record<string, unknown>) => ({
      id: String(row.id),
      code_sha256: String(row.code_sha256),
      max_redemptions: Number(row.max_redemptions),
      redemption_count: Number(row.redemption_count),
      expires_at: String(row.expires_at),
      revoked_at: row.revoked_at ? String(row.revoked_at) : null,
      created_at: String(row.created_at),
    }));
  }, []);

  const createInvite = useCallback(async (
    code: string,
    maxRedemptions: number,
    validDays: number,
  ): Promise<string> => {
    const sha256 = await sha256Hex(code);
    const expiresAt = new Date(Date.now() + validDays * 86_400_000).toISOString();
    const { data, error } = await supabase.rpc("admin_create_invite", {
      p_code_sha256: sha256,
      p_max_redemptions: maxRedemptions,
      p_expires_at: expiresAt,
    });
    if (error) throw error;
    return data;
  }, []);

  const revokeInvite = useCallback(async (inviteId: string): Promise<boolean> => {
    const { data, error } = await supabase.rpc("admin_revoke_invite", {
      p_invite_id: inviteId,
    });
    if (error) throw error;
    return Boolean(data);
  }, []);

  const listProviderKeys = useCallback(async (): Promise<AdminProviderKey[]> => {
    const { data, error } = await supabase.rpc("admin_list_provider_keys");
    if (error) throw error;
    return (data || []).map((row: Record<string, unknown>) => ({
      provider: String(row.provider) as "gemini" | "openrouter",
      key_hint: String(row.key_hint),
      is_active: Boolean(row.is_active),
      selected_model: row.selected_model ? String(row.selected_model) : undefined,
      last_tested_at: row.last_tested_at ? String(row.last_tested_at) : null,
      last_test_status: (row.last_test_status as "healthy" | "unhealthy" | "untested") || "untested",
      last_test_latency_ms: row.last_test_latency_ms ? Number(row.last_test_latency_ms) : null,
      last_test_error: row.last_test_error ? String(row.last_test_error) : null,
      updated_at: String(row.updated_at),
    }));
  }, []);

  const setProviderModel = useCallback(async (
    provider: string,
    model: string,
  ): Promise<string> => {
    const { data, error } = await supabase.rpc("admin_set_provider_model", {
      p_provider: provider,
      p_model: model,
    });
    if (error) throw error;
    return data;
  }, []);

  const testVaultedProviderKey = useCallback(async (
    provider: "gemini" | "openrouter",
  ): Promise<AdminKeyTestResult> => {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session?.access_token) {
      throw new Error("You must be logged in as an administrator to run tests.");
    }

    const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
    const fnUrl = `${supabaseUrl}/functions/v1/admin-test-provider`;

    const res = await fetch(fnUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${session.access_token}`,
      },
      body: JSON.stringify({ provider }),
    });

    const body = await res.json().catch(() => ({}));
    if (!res.ok) {
      throw new Error(body?.error || `Server returned HTTP ${res.status}`);
    }

    return {
      status: body.status === "healthy" ? "healthy" : "unhealthy",
      latency_ms: Number(body.latency_ms) || 0,
      error_message: body.error_message || null,
    };
  }, []);

  const setProviderKey = useCallback(async (
    provider: string,
    apiKey: string,
    testStatus: string = "untested",
    latencyMs?: number,
    testError?: string,
  ): Promise<string> => {
    const { data, error } = await supabase.rpc("admin_set_provider_key", {
      p_provider: provider,
      p_api_key: apiKey,
      p_test_status: testStatus,
      p_latency_ms: latencyMs ?? null,
      p_test_error: testError ?? null,
    });
    if (error) throw error;
    return data;
  }, []);

  const recordProviderTest = useCallback(async (
    provider: string,
    status: string,
    latencyMs: number,
    testError?: string,
  ): Promise<string> => {
    const { data, error } = await supabase.rpc("admin_record_provider_test", {
      p_provider: provider,
      p_status: status,
      p_latency_ms: latencyMs,
      p_error: testError ?? null,
    });
    if (error) throw error;
    return data;
  }, []);

  const testProviderKeyDirect = useCallback(async (
    provider: "gemini" | "openrouter",
    apiKey: string,
  ): Promise<AdminKeyTestResult> => {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session?.access_token) throw new Error("Admin session required");
    const res = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/admin-test-provider`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${session.access_token}`,
      },
      body: JSON.stringify({ provider, api_key: apiKey }),
    });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(body.error || "Provider test failed");
    return {
      status: body.status === "healthy" ? "healthy" : "unhealthy",
      latency_ms: Number(body.latency_ms) || 0,
      error_message: body.error_message || null,
    };
  }, []);

  return {
    isAdmin,
    loading: authLoading || loading,
    checkAccess,
    getHealth,
    listJobs,
    requeueJob,
    cancelJob,
    listUsers,
    setUserPlan,
    setUserStatus,
    listInvites,
    createInvite,
    revokeInvite,
    listProviderKeys,
    setProviderKey,
    setProviderModel,
    recordProviderTest,
    testProviderKeyDirect,
    testVaultedProviderKey,
  };
}
