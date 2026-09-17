import { encodeCallbackPayload } from "../schemas/callback.ts";
import type { IngestionRepository } from "../repositories/ingestion.repository.ts";
import type { NotesRepository } from "../repositories/notes.repository.ts";
import type { TelegramGateway } from "../telegram/client.ts";
import type { CommandMessage } from "../telegram/parse-update.ts";

const RECENT_LIMIT = 10;

export interface CommandDependencies {
  readonly users: Pick<IngestionRepository, "ensureUser">;
  readonly notes: Pick<NotesRepository, "listRecentSavedNotes">;
  readonly telegram: Pick<TelegramGateway, "sendMessage">;
}

export async function handleCommand(
  command: CommandMessage,
  deps: CommandDependencies,
): Promise<void> {
  if (command.command !== "recent") {
    await deps.telegram.sendMessage(
      command.telegramChatId,
      "For now, send me text to turn into a note, or use /recent to open saved notes.",
    );
    return;
  }

  const userId = await deps.users.ensureUser(command);
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
