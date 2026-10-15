import { z } from "zod";
import type { ServiceClient } from "../db/client.ts";
import { AppError } from "../errors/app-error.ts";
import { classifyPostgresError, toDatabaseError } from "./postgres-errors.ts";

const UuidSchema = z.string().uuid();

export const AudioSessionStatusSchema = z.enum([
  "recording",
  "processing",
  "completed",
  "failed",
]);

export type AudioSessionStatus = z.infer<typeof AudioSessionStatusSchema>;

export const AudioPartStatusSchema = z.enum([
  "pending",
  "transcribing",
  "completed",
  "failed",
]);

export type AudioPartStatus = z.infer<typeof AudioPartStatusSchema>;

export const AudioSessionRowSchema = z.object({
  id: UuidSchema,
  user_id: UuidSchema,
  template_key: z.string(),
  output_language: z.string(),
  total_parts: z.number().int(),
  total_duration_seconds: z.number().int(),
  total_size_bytes: z.union([z.number(), z.string()]).transform((val) => Number(val)),
  status: AudioSessionStatusSchema,
  final_note_id: UuidSchema.nullable(),
  error_message: z.string().nullable(),
  created_at: z.string(),
  updated_at: z.string(),
});

export type AudioSessionRow = z.infer<typeof AudioSessionRowSchema>;

export const AudioSessionPartRowSchema = z.object({
  id: UuidSchema,
  session_id: UuidSchema,
  part_number: z.number().int(),
  storage_path: z.string(),
  mime_type: z.string(),
  size_bytes: z.union([z.number(), z.string()]).transform((val) => Number(val)),
  duration_seconds: z.number().int(),
  transcript: z.string().nullable(),
  status: AudioPartStatusSchema,
  error_message: z.string().nullable(),
  created_at: z.string(),
  updated_at: z.string(),
});

export type AudioSessionPartRow = z.infer<typeof AudioSessionPartRowSchema>;

export class AudioSessionsRepository {
  constructor(private readonly client: ServiceClient) {}

  /**
   * Retrieves an audio recording session by ID.
   */
  async getSession(sessionId: string): Promise<AudioSessionRow | null> {
    try {
      const { data, error } = await this.client
        .from("audio_recording_sessions")
        .select("*")
        .eq("id", sessionId)
        .maybeSingle();

      if (error !== null) throw classifyPostgresError(error);
      if (data === null || data === undefined) return null;

      const parsed = AudioSessionRowSchema.safeParse(data);
      if (!parsed.success) {
        throw AppError.internal(
          `Corrupt audio_recording_sessions row for ${sessionId}: ${parsed.error.message}`,
        );
      }

      return parsed.data;
    } catch (thrown) {
      throw toDatabaseError(thrown);
    }
  }

  /**
   * Retrieves all audio parts for a given session, ordered by part_number ascending.
   */
  async getParts(sessionId: string): Promise<AudioSessionPartRow[]> {
    try {
      const { data, error } = await this.client
        .from("audio_session_parts")
        .select("*")
        .eq("session_id", sessionId)
        .order("part_number", { ascending: true });

      if (error !== null) throw classifyPostgresError(error);
      if (data === null || data === undefined || !Array.isArray(data) || data.length === 0) {
        return [];
      }

      const parsed = z.array(AudioSessionPartRowSchema).safeParse(data);
      if (!parsed.success) {
        throw AppError.internal(
          `Corrupt audio_session_parts rows for session ${sessionId}: ${parsed.error.message}`,
        );
      }

      return parsed.data;
    } catch (thrown) {
      throw toDatabaseError(thrown);
    }
  }

  /**
   * Updates an individual part's transcript and status.
   */
  async updatePartTranscript(
    partId: string,
    transcript: string | null,
    status: AudioPartStatus,
    errorMessage: string | null = null,
  ): Promise<void> {
    try {
      const { error } = await this.client
        .from("audio_session_parts")
        .update({
          transcript,
          status,
          error_message: errorMessage,
          updated_at: new Date().toISOString(),
        })
        .eq("id", partId);

      if (error !== null) throw classifyPostgresError(error);
    } catch (thrown) {
      throw toDatabaseError(thrown);
    }
  }

  /**
   * Updates the session status, optionally recording the resulting final note ID.
   */
  async updateSessionStatus(
    sessionId: string,
    status: AudioSessionStatus,
    finalNoteId: string | null = null,
    errorMessage: string | null = null,
  ): Promise<void> {
    try {
      const updatePayload: Record<string, unknown> = {
        status,
        error_message: errorMessage,
        updated_at: new Date().toISOString(),
      };

      if (finalNoteId !== null) {
        updatePayload.final_note_id = finalNoteId;
      }

      const { error } = await this.client
        .from("audio_recording_sessions")
        .update(updatePayload)
        .eq("id", sessionId);

      if (error !== null) throw classifyPostgresError(error);
    } catch (thrown) {
      throw toDatabaseError(thrown);
    }
  }

  /**
   * Checks whether all parts for a session have completed transcription.
   */
  async isSessionReadyForSynthesis(sessionId: string): Promise<{
    ready: boolean;
    totalParts: number;
    completedParts: number;
    transcripts: string[];
  }> {
    const parts = await this.getParts(sessionId);
    if (parts.length === 0) {
      return { ready: false, totalParts: 0, completedParts: 0, transcripts: [] };
    }

    const completed = parts.filter((p) => p.status === "completed" && typeof p.transcript === "string");
    const ready = completed.length === parts.length;
    const transcripts = completed.map((p) => p.transcript as string);

    return {
      ready,
      totalParts: parts.length,
      completedParts: completed.length,
      transcripts,
    };
  }
}
