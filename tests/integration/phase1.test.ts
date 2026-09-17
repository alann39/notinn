import { assert, assertEquals } from "@std/assert";
import { IngestionRepository } from "../../supabase/functions/_shared/repositories/ingestion.repository.ts";
import { NotesRepository } from "../../supabase/functions/_shared/repositories/notes.repository.ts";
import { ProcessingJobsRepository } from "../../supabase/functions/_shared/repositories/processing-jobs.repository.ts";
import { RejectedChatsRepository } from "../../supabase/functions/_shared/repositories/rejected-chats.repository.ts";
import { structuredNoteFixture } from "../fixtures/notes/builders.ts";
import { textUpdate } from "../fixtures/telegram/builders.ts";
import { acceptedMessage, ENABLED, nextId, serviceClient, syntheticDigest } from "./harness.ts";

/** Phase 1's owner-scoped database functions against a real development target. */

Deno.test({
  name: "the Phase 1 note lifecycle is owner-scoped and append-only",
  ignore: !ENABLED,
  fn: async () => {
    const client = serviceClient();
    const ingestion = new IngestionRepository(client);
    const jobs = new ProcessingJobsRepository(client);
    const notes = new NotesRepository(client);

    const updateId = nextId();
    const senderId = nextId();
    const message = acceptedMessage(textUpdate({ updateId, userId: senderId }));
    const userId = await ingestion.ensureUser(message);
    const accepted = await ingestion.acceptUpdate(
      userId,
      message,
      await syntheticDigest(`phase1-${updateId}`),
    );
    assert(accepted.jobId !== null);

    for (
      const [from, to] of [
        ["QUEUED", "ACQUIRING"],
        ["ACQUIRING", "EXTRACTING"],
        ["EXTRACTING", "GENERATING"],
        ["GENERATING", "DELIVERING"],
      ] as const
    ) {
      assertEquals((await jobs.advance(userId, accepted.jobId, from, to)).outcome, "advanced");
    }

    const content = structuredNoteFixture();
    const persisted = await notes.persistNote({
      userId,
      jobId: accepted.jobId,
      title: content.title,
      language: content.language,
      sourceType: "text",
      normalizedSourceText: message.sourceText,
      sourceTextSha256: await syntheticDigest(message.sourceText ?? ""),
      templateKey: "clean_note",
      schemaVersion: 1,
      contentJson: content,
      renderedText: "<b>Synthetic weekly sync</b>",
      provider: "gemini",
      model: "gemini-synthetic-flash",
      generationReason: "initial",
    });
    assertEquals(persisted.outcome, "created");
    assert(persisted.noteId !== null);
    assert(persisted.outputId !== null);

    const regenerated = await notes.regenerateNoteOutput({
      userId,
      noteId: persisted.noteId,
      templateKey: "short_summary",
      schemaVersion: 1,
      contentJson: { ...content, template_key: "short_summary" },
      renderedText: "<b>Synthetic short summary</b>",
      provider: "gemini",
      model: "gemini-synthetic-flash",
      generationReason: "shorter",
    });
    assertEquals(regenerated.outcome, "created");
    assert(regenerated.outputId !== null);

    const beforeMove = await notes.findNoteForDisplay(userId, persisted.noteId);
    assertEquals(beforeMove?.templateKey, "clean_note");
    assertEquals(
      (await notes.setCurrentOutput(userId, persisted.noteId, regenerated.outputId)).outcome,
      "updated",
    );
    assertEquals(
      (await notes.findNoteForDisplay(userId, persisted.noteId))?.templateKey,
      "short_summary",
    );

    const otherMessage = acceptedMessage(textUpdate({ updateId: nextId(), userId: nextId() }));
    const otherUserId = await ingestion.ensureUser(otherMessage);
    assertEquals(await notes.findNoteForDisplay(otherUserId, persisted.noteId), null);
    assertEquals(
      (await notes.setNoteSaved(otherUserId, persisted.noteId, true)).outcome,
      "not_found",
    );
  },
});

Deno.test({
  name: "a non-private chat can claim the fixed reply only once",
  ignore: !ENABLED,
  fn: async () => {
    const repository = new RejectedChatsRepository(serviceClient());
    const chatId = nextId();

    assertEquals(await repository.claimReply(chatId), true);
    assertEquals(await repository.claimReply(chatId), false);
  },
});
