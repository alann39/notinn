export interface AdminHealth {
  queue_depth: number;
  stale_jobs: number;
  failed_jobs: number;
  deletion_backlog: number;
  active_users: number;
  total_notes: number;
}

export interface AdminJob {
  job_id: string;
  user_id: string | null;
  state: string;
  attempt_count: number;
  created_at: string;
  last_error_code: string | null;
}

export interface AdminUser {
  id: string;
  telegram_user_id: number;
  status: string;
  alpha_access_status: string | null;
  plan_key: string;
  created_at: string;
  notes_count: number;
  active_jobs: number;
  failed_jobs: number;
  is_admin: boolean;
}

export interface AdminInvite {
  id: string;
  code_sha256: string;
  max_redemptions: number;
  redemption_count: number;
  expires_at: string;
  revoked_at: string | null;
  created_at: string;
}

export interface AdminProviderKey {
  provider: "gemini" | "openrouter";
  key_hint: string;
  is_active: boolean;
  selected_model?: string;
  last_tested_at: string | null;
  last_test_status: "healthy" | "unhealthy" | "untested";
  last_test_latency_ms: number | null;
  last_test_error: string | null;
  updated_at: string;
}

export interface AdminKeyTestResult {
  status: "healthy" | "unhealthy";
  latency_ms: number;
  error_message: string | null;
}
