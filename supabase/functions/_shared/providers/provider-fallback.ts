import { AppError } from "../errors/app-error.ts";

/** Cross-provider failover is limited to failures that can plausibly recover elsewhere. */
export function isTransientProviderFailure(thrown: unknown): boolean {
  if (!(thrown instanceof AppError)) return false;
  if (thrown.code === "provider_rate_limited" || thrown.code === "provider_timeout") {
    return true;
  }
  return thrown.code === "provider_error" && /returned 5\d\d/.test(thrown.internalDetail ?? "");
}
