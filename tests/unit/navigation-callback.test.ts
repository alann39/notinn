import { assert, assertEquals, assertThrows } from "@std/assert";
import { AppError } from "../../supabase/functions/_shared/errors/app-error.ts";
import {
  decodeNavigationCallback,
  encodeNavigationCallback,
  isNavigationCallback,
  NAVIGATION_ACTIONS,
} from "../../supabase/functions/_shared/schemas/navigation-callback.ts";

Deno.test("every valueless navigation action round-trips", () => {
  const valued = new Set([
    "recent",
    "set_language",
    "set_privacy",
    "set_text",
    "set_voice",
    "set_document",
  ]);
  for (const action of NAVIGATION_ACTIONS) {
    if (valued.has(action)) continue;
    const encoded = encodeNavigationCallback({ action, value: null });
    assertEquals(decodeNavigationCallback(encoded), { action, value: null });
    assert(isNavigationCallback(encoded));
    assert(new TextEncoder().encode(encoded).length <= 64);
  }
});

Deno.test("navigation values are closed and validated", () => {
  const cases = [
    { action: "recent" as const, value: "1" },
    { action: "set_language" as const, value: "id" },
    { action: "set_privacy" as const, value: "minimal" },
    { action: "set_text" as const, value: "clean_note" },
    { action: "set_voice" as const, value: "default" },
    { action: "set_document" as const, value: "ct_0123456789ab" },
  ];
  for (const item of cases) {
    assertEquals(decodeNavigationCallback(encodeNavigationCallback(item)), item);
  }
  assertThrows(
    () => encodeNavigationCallback({ action: "set_language", value: "fr" }),
    AppError,
  );
  assertThrows(() => decodeNavigationCallback("v2:main:unexpected"), AppError);
  assertThrows(() => decodeNavigationCallback("v2:unknown:-"), AppError);
});
