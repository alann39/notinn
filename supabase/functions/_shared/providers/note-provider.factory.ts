import type { AiConfig } from "../config/env.ts";
import { FallbackNoteProvider } from "./fallback-note.provider.ts";
import { GeminiNoteProvider } from "./gemini-note.provider.ts";
import type { LibraryAnswerProvider } from "./library-ai.provider.ts";
import type { NoteAIProvider } from "./note-ai.provider.ts";
import { OpenRouterNoteProvider } from "./openrouter-note.provider.ts";

export type NotinnGenerationProvider = NoteAIProvider & LibraryAnswerProvider;

export function createNoteProvider(config: AiConfig): NotinnGenerationProvider {
  const primary = new GeminiNoteProvider(config);
  if (config.openRouter === null) return primary;
  return new FallbackNoteProvider(primary, new OpenRouterNoteProvider(config.openRouter));
}
