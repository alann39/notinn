/**
 * Log severity levels.
 *
 * This lives in its own module rather than inside the logger because the error
 * taxonomy needs it, and the logger needs the error taxonomy. Keeping the shared
 * primitive separate avoids an import cycle between the two.
 */
export const LOG_LEVELS = ["debug", "info", "warn", "error"] as const;

export type LogLevel = (typeof LOG_LEVELS)[number];

/** Numeric ranking, used to decide whether a level clears the configured floor. */
export const LOG_LEVEL_RANK: Readonly<Record<LogLevel, number>> = {
  debug: 10,
  info: 20,
  warn: 30,
  error: 40,
};
