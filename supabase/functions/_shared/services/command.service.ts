import { encodeCallbackPayload } from "../schemas/callback.ts";
import type { IngestionRepository } from "../repositories/ingestion.repository.ts";
import type { NotesRepository } from "../repositories/notes.repository.ts";
import type { TelegramGateway } from "../telegram/client.ts";
import type { CommandMessage } from "../telegram/parse-update.ts";

const RECENT_LIMIT = 10;
const SEARCH_LIMIT = 10;
const SEARCH_QUERY_MAX_CHARS = 200;

export interface CommandDependencies {
  readonly users: Pick<IngestionRepository, "ensureUser">;
  readonly notes: Pick<NotesRepository, "listRecentSavedNotes" | "searchSavedNotes">;
  readonly telegram: Pick<TelegramGateway, "sendMessage">;
}

export async function handleCommand(
  command: CommandMessage,
  deps: CommandDependencies,
): Promise<void> {
  if (command.command !== "recent" && command.command !== "search") {
    await deps.telegram.sendMessage(
      command.telegramChatId,
      "Send me content to create a note, use /recent for saved notes, or /search followed by keywords.",
    );
    return;
  }

  const userId = await deps.users.ensureUser(command);
  if (command.command === "search") {
    const query = command.argumentsText;
    if (query === null || query.length < 2 || query.length > SEARCH_QUERY_MAX_CHARS) {
      await deps.telegram.sendMessage(
        command.telegramChatId,
        "Use /search followed by 2–200 characters, for example: /search quarterly risk.",
      );
      return;
    }

    const matches = await deps.notes.searchSavedNotes(userId, query, SEARCH_LIMIT);
    if (matches.length === 0) {
      await deps.telegram.sendMessage(
        command.telegramChatId,
        "I could not find that in your saved notes. Try fewer or different keywords.",
      );
      return;
    }

    const lines = matches.map((note, index) => {
      const date = note.updatedAt.slice(0, 10);
      const tags = note.tags.slice(0, 3).map((tag) => `#${tag}`).join(" ");
      return `${index + 1}. ${note.title} — ${date}${tags === "" ? "" : `\n   ${tags}`}`;
    });
    await deps.telegram.sendMessage(
      command.telegramChatId,
      ["Search results:", "", ...lines].join("\n"),
      {
        inlineKeyboard: {
          inline_keyboard: matches.map((note, index) => [{
            text: `Open ${index + 1}`,
            callback_data: encodeCallbackPayload({
              action: { kind: "show" },
              resourceId: note.noteId,
              revision: 0,
            }),
          }]),
        },
      },
    );
    return;
  }

  const notes = await deps.notes.listRecentSavedNotes(userId, RECENT_LIMIT);

  if (notes.length === 0) {
    await deps.telegram.sendMessage(
      command.telegramChatId,
      "You do not have any saved notes yet. Tap Save below a generated note first.",
    );
    return;
  }

  const lines = notes.map((note, index) => `${index + 1}. ${note.title}`);
  await deps.telegram.sendMessage(
    command.telegramChatId,
    ["Your recent saved notes:", "", ...lines].join("\n"),
    {
      inlineKeyboard: {
        inline_keyboard: notes.map((note, index) => [{
          text: `Open ${index + 1}`,
          callback_data: encodeCallbackPayload({
            action: { kind: "show" },
            resourceId: note.noteId,
            revision: 0,
          }),
        }]),
      },
    },
  );
}
