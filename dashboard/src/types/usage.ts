export interface RawUsageRow {
  plan_key: string;
  plan_display_name: string;
  period_start: string;
  period_end: string;
  metric: string;
  display_name: string;
  used: number;
  monthly_limit: number;
  reserved: number;
}

export interface UsageSummary {
  plan_key: string;
  plan_display_name: string;
  period_start: string;
  period_end: string;
  metrics: UsageMetric[];
}

export interface UsageMetric {
  metric: string;
  display_name: string;
  used: number;
  monthly_limit: number;
  reserved: number;
}
