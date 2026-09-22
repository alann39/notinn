import { TELEGRAM_MAX_CALLBACK_DATA_BYTES, TEMPLATE_KEY_PATTERN } from "../config/constants.ts";
import { AppError } from "../errors/app-error.ts";

const VERSION = "v2";
const EMPTY_VALUE = "-";

export const NAVIGATION_ACTIONS = [
  "main",
  "new",
  "recent",
  "search",
  "ask",
  "usage",
  "templates",
  "template_create",
  "template_manage",
  "settings",
  "help",
  "help_create",
  "help_find",
  "help_templates",
  "help_settings",
  "help_privacy",
  "settings_language",
  "settings_privacy",
  "settings_text",
  "settings_voice",
  "settings_document",
  "set_language",
  "set_privacy",
  "set_text",
  "set_voice",
  "set_document",
  "upgrade",
] as const;

export type NavigationAction = (typeof NAVIGATION_ACTIONS)[number];

export interface NavigationCallbackPayload {
  readonly action: NavigationAction;
  readonly value: string | null;
}

function validateValue(action: NavigationAction, value: string | null): void {
  if (action === "recent") {
    if (value !== null && !/^\d{1,2}$/.test(value)) {
      throw AppError.validation("navigation page is not a small non-negative integer");
    }
    return;
  }
  if (action === "set_language") {
    if (value === null || !["mirror", "id", "en"].includes(value)) {
      throw AppError.validation("navigation language is invalid");
    }
    return;
  }
  if (action === "set_privacy") {
    if (value === null || !["balanced", "minimal"].includes(value)) {
      throw AppError.validation("navigation privacy mode is invalid");
    }
    return;
  }
  if (["set_text", "set_voice", "set_document"].includes(action)) {
    if (value === null || (value !== "default" && !TEMPLATE_KEY_PATTERN.test(value))) {
      throw AppError.validation("navigation template key is invalid");
    }
    return;
  }
  if (value !== null) {
    throw AppError.validation("navigation action does not accept a value");
  }
}

/** Encode resource-independent UI navigation separately from note-scoped v1 callbacks. */
export function encodeNavigationCallback(payload: NavigationCallbackPayload): string {
  validateValue(payload.action, payload.value);
  const encoded = [VERSION, payload.action, payload.value ?? EMPTY_VALUE].join(":");
  if (new TextEncoder().encode(encoded).length > TELEGRAM_MAX_CALLBACK_DATA_BYTES) {
    throw AppError.internal("navigation callback exceeds Telegram's byte limit");
  }
  return encoded;
}

export function decodeNavigationCallback(value: string): NavigationCallbackPayload {
  const segments = value.split(":");
  if (segments.length !== 3 || segments[0] !== VERSION) {
    throw AppError.validation("navigation callback shape is invalid");
  }
  const actionToken = segments[1] ?? "";
  if (!(NAVIGATION_ACTIONS as readonly string[]).includes(actionToken)) {
    throw AppError.validation("navigation callback action is invalid");
  }
  const valueToken = segments[2] ?? "";
  const payload: NavigationCallbackPayload = {
    action: actionToken as NavigationAction,
    value: valueToken === EMPTY_VALUE ? null : valueToken,
  };
  validateValue(payload.action, payload.value);
  return payload;
}

export function isNavigationCallback(value: string): boolean {
  return value.startsWith(`${VERSION}:`);
}
