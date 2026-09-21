import { z } from "zod";
import type { GenerationReason } from "../config/constants.ts";
import type { ServiceClient } from "../db/client.ts";
import { AppError } from "../errors/app-error.ts";
import { toDatabaseError } from "./postgres-errors.ts";

const UuidSchema = z.uuid();
const IdSchema = z.number().int().positive();

const DeliveryRowSchema = z.object({
  delivery_id: UuidSchema,
  note_id: UuidSchema,
  chat_id: IdSchema,
  message_ids: z.array(IdSchema).min(1).max(100),
});

const RegisterDeliveryRowSchema = z.object({
  outcome: z.enum(["created", "not_found"]),
  delivery_id: UuidSchema.nullable(),
  note_id: UuidSchema.nullable(),
});

const ReplaceDeliveryRowSchema = z.object({
  outcome: z.enum(["updated", "not_found"]),
  delivery_id: UuidSchema.nullable(),
  note_id: UuidSchema.nullable(),
});

const BeginDraftRowSchema = z.object({
  outcome: z.enum(["created", "busy", "not_found", "source_unavailable"]),
  draft_id: UuidSchema.nullable(),
  note_id: UuidSchema.nullable(),
  base_output_id: UuidSchema.nullable(),
});

const CompleteDraftRowSchema = z.object({
  outcome: z.enum(["ready", "not_found"]),
  draft_id: UuidSchema.nullable(),
  note_id: UuidSchema.nullable(),
});

const DraftViewRowSchema = z.object({
  draft_id: UuidSchema,
  note_id: UuidSchema,
  base_output_id: UuidSchema,
  draft_output_id: UuidSchema,
  base_content_json: z.unknown(),
  draft_content_json: z.unknown(),
  is_saved: z.boolean(),
});

const ApplyDraftRowSchema = z.object({
  outcome: z.enum(["applied", "not_found"]),
  note_id: UuidSchema.nullable(),
  output_id: UuidSchema.nullable(),
  is_saved: z.boolean().nullable(),
});

const DiscardDraftRowSchema = z.object({
  outcome: z.enum(["discarded", "not_found"]),
  note_id: UuidSchema.nullable(),
  is_saved: z.boolean().nullable(),
});

function single<T>(
  data: unknown,
  error: unknown,
  schema: z.ZodType<T>,
  operation: string,
): T {
  if (error !== null) throw error;
  const rows = z.array(schema).safeParse(data);
  if (!rows.success || rows.data.length !== 1) {
    throw AppError.internal(`${operation} returned an unexpected row set`);
  }
  return rows.data[0] as T;
}

export interface NoteDelivery {
  readonly deliveryId: string;
  readonly noteId: string;
  readonly chatId: number;
  readonly messageIds: readonly number[];
}

export interface NoteDraftView {
  readonly draftId: string;
  readonly noteId: string;
  readonly baseOutputId: string;
  readonly draftOutputId: string;
  readonly baseContentJson: unknown;
  readonly draftContentJson: unknown;
  readonly isSaved: boolean;
}

/** Owner-scoped persistence for Telegram delivery surfaces and staged note edits. */
export class NoteWorkflowRepository {
  readonly #client: ServiceClient;

  constructor(client: ServiceClient) {
    this.#client = client;
  }

  async registerDelivery(
    userId: string,
    noteId: string,
    chatId: number,
    messageIds: readonly number[],
  ): Promise<{ outcome: "created" | "not_found"; deliveryId: string | null }> {
    try {
      const { data, error } = await this.#client.rpc("register_note_delivery", {
        p_user_id: userId,
        p_note_id: noteId,
        p_chat_id: chatId,
        p_message_ids: [...messageIds],
      });
      const row = single(data, error, RegisterDeliveryRowSchema, "register_note_delivery");
      return { outcome: row.outcome, deliveryId: row.delivery_id };
    } catch (thrown) {
      throw toDatabaseError(thrown);
    }
  }

  async findDelivery(
    userId: string,
    noteId: string,
    chatId: number,
    messageId: number,
  ): Promise<NoteDelivery | null> {
    try {
      const { data, error } = await this.#client.rpc("find_note_delivery", {
        p_user_id: userId,
        p_note_id: noteId,
        p_chat_id: chatId,
        p_message_id: messageId,
      });
      if (error !== null) throw error;
      const rows = z.array(DeliveryRowSchema).safeParse(data);
      if (!rows.success || rows.data.length > 1) {
        throw AppError.internal("find_note_delivery returned an unexpected row set");
      }
      const row = rows.data[0];
      return row === undefined ? null : {
        deliveryId: row.delivery_id,
        noteId: row.note_id,
        chatId: row.chat_id,
        messageIds: row.message_ids,
      };
    } catch (thrown) {
      throw toDatabaseError(thrown);
    }
  }

  async listDeliveries(userId: string, noteId: string): Promise<readonly NoteDelivery[]> {
    try {
      const { data, error } = await this.#client.rpc("list_note_deliveries", {
        p_user_id: userId,
        p_note_id: noteId,
      });
      if (error !== null) throw error;
      const rows = z.array(DeliveryRowSchema.omit({ note_id: true })).safeParse(data);
      if (!rows.success) {
        throw AppError.internal("list_note_deliveries returned an unexpected row set");
      }
      return rows.data.map((row) => ({
        deliveryId: row.delivery_id,
        noteId,
        chatId: row.chat_id,
        messageIds: row.message_ids,
      }));
    } catch (thrown) {
      throw toDatabaseError(thrown);
    }
  }

  async replaceDeliveryMessages(
    userId: string,
    deliveryId: string,
    messageIds: readonly number[],
  ): Promise<"updated" | "not_found"> {
    try {
      const { data, error } = await this.#client.rpc("replace_note_delivery_messages", {
        p_user_id: userId,
        p_delivery_id: deliveryId,
        p_message_ids: [...messageIds],
      });
      const row = single(
        data,
        error,
        ReplaceDeliveryRowSchema,
        "replace_note_delivery_messages",
      );
      return row.outcome;
    } catch (thrown) {
      throw toDatabaseError(thrown);
    }
  }

  async beginDraft(input: {
    userId: string;
    noteId: string;
    updateId: number;
    templateKey: string;
    reason: GenerationReason;
  }): Promise<{
    outcome: "created" | "busy" | "not_found" | "source_unavailable";
    draftId: string | null;
  }> {
    try {
      const { data, error } = await this.#client.rpc("begin_note_edit_draft", {
        p_user_id: input.userId,
        p_note_id: input.noteId,
        p_request_update_id: input.updateId,
        p_target_template_key: input.templateKey,
        p_generation_reason: input.reason,
      });
      const row = single(data, error, BeginDraftRowSchema, "begin_note_edit_draft");
      return { outcome: row.outcome, draftId: row.draft_id };
    } catch (thrown) {
      throw toDatabaseError(thrown);
    }
  }

  async completeDraft(
    userId: string,
    draftId: string,
    outputId: string,
  ): Promise<"ready" | "not_found"> {
    try {
      const { data, error } = await this.#client.rpc("complete_note_edit_draft", {
        p_user_id: userId,
        p_draft_id: draftId,
        p_output_id: outputId,
      });
      const row = single(data, error, CompleteDraftRowSchema, "complete_note_edit_draft");
      return row.outcome;
    } catch (thrown) {
      throw toDatabaseError(thrown);
    }
  }

  async getDraft(userId: string, draftId: string): Promise<NoteDraftView | null> {
    try {
      const { data, error } = await this.#client.rpc("get_note_edit_draft", {
        p_user_id: userId,
        p_draft_id: draftId,
      });
      if (error !== null) throw error;
      const rows = z.array(DraftViewRowSchema).safeParse(data);
      if (!rows.success || rows.data.length > 1) {
        throw AppError.internal("get_note_edit_draft returned an unexpected row set");
      }
      const row = rows.data[0];
      return row === undefined ? null : {
        draftId: row.draft_id,
        noteId: row.note_id,
        baseOutputId: row.base_output_id,
        draftOutputId: row.draft_output_id,
        baseContentJson: row.base_content_json,
        draftContentJson: row.draft_content_json,
        isSaved: row.is_saved,
      };
    } catch (thrown) {
      throw toDatabaseError(thrown);
    }
  }

  async applyDraft(userId: string, draftId: string): Promise<{
    outcome: "applied" | "not_found";
    noteId: string | null;
    outputId: string | null;
    isSaved: boolean | null;
  }> {
    try {
      const { data, error } = await this.#client.rpc("apply_note_edit_draft", {
        p_user_id: userId,
        p_draft_id: draftId,
      });
      const row = single(data, error, ApplyDraftRowSchema, "apply_note_edit_draft");
      return {
        outcome: row.outcome,
        noteId: row.note_id,
        outputId: row.output_id,
        isSaved: row.is_saved,
      };
    } catch (thrown) {
      throw toDatabaseError(thrown);
    }
  }

  async discardDraft(userId: string, draftId: string): Promise<{
    outcome: "discarded" | "not_found";
    noteId: string | null;
    isSaved: boolean | null;
  }> {
    try {
      const { data, error } = await this.#client.rpc("discard_note_edit_draft", {
        p_user_id: userId,
        p_draft_id: draftId,
      });
      const row = single(data, error, DiscardDraftRowSchema, "discard_note_edit_draft");
      return { outcome: row.outcome, noteId: row.note_id, isSaved: row.is_saved };
    } catch (thrown) {
      throw toDatabaseError(thrown);
    }
  }

  async failDraft(userId: string, draftId: string): Promise<void> {
    try {
      const { error } = await this.#client.rpc("fail_note_edit_draft", {
        p_user_id: userId,
        p_draft_id: draftId,
      });
      if (error !== null) throw error;
    } catch (thrown) {
      throw toDatabaseError(thrown);
    }
  }
}
