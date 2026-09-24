import { useAuth } from "./use-auth";

export interface TrialStatus {
  /** True if the user is on the Pro plan and exempt from trial expiration. */
  isPro: boolean;
  /** True if the account is on Free plan and has exceeded 14 days since creation. */
  isTrialExpired: boolean;
  /** Number of days remaining in the 14-day trial (0 if expired or not on Free plan). */
  daysRemaining: number;
  /** Calculated expiration date of the 14-day trial. */
  expiryDate: Date | null;
  /** Formatted expiration date string in Indonesian locale. */
  formattedExpiryDate: string;
}

const TRIAL_DURATION_DAYS = 14;
const TRIAL_DURATION_MS = TRIAL_DURATION_DAYS * 24 * 60 * 60 * 1000;

export function useTrial(): TrialStatus {
  const { profile } = useAuth();

  if (!profile) {
    return {
      isPro: false,
      isTrialExpired: false,
      daysRemaining: TRIAL_DURATION_DAYS,
      expiryDate: null,
      formattedExpiryDate: "",
    };
  }

  const isPro = profile.plan_key === "pro";
  if (isPro) {
    return {
      isPro: true,
      isTrialExpired: false,
      daysRemaining: 0,
      expiryDate: null,
      formattedExpiryDate: "",
    };
  }

  const createdAt = profile.created_at ? new Date(profile.created_at) : new Date();
  const expiryDate = new Date(createdAt.getTime() + TRIAL_DURATION_MS);
  const now = new Date();
  const diffMs = expiryDate.getTime() - now.getTime();
  const daysRemaining = Math.max(0, Math.ceil(diffMs / (24 * 60 * 60 * 1000)));
  const isTrialExpired = diffMs <= 0;

  const formattedExpiryDate = new Intl.DateTimeFormat("id-ID", {
    day: "numeric",
    month: "long",
    year: "numeric",
  }).format(expiryDate);

  return {
    isPro: false,
    isTrialExpired,
    daysRemaining,
    expiryDate,
    formattedExpiryDate,
  };
}
