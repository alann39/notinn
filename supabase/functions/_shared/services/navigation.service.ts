import type { InputType } from "../config/constants.ts";
import type { NotesRepository } from "../repositories/notes.repository.ts";
import type { QuotaRepository, UsageSummary } from "../repositories/quota.repository.ts";
import type { PlanCatalogueEntry, PlanRepository } from "../repositories/plan.repository.ts";
import type { TemplatesRepository } from "../repositories/templates.repository.ts";
import type {
  PreferenceSetting,
  UserPreferences,
  UserPreferencesRepository,
} from "../repositories/user-preferences.repository.ts";
import { encodeCallbackPayload } from "../schemas/callback.ts";
import {
  encodeNavigationCallback,
  type NavigationAction,
  type NavigationCallbackPayload,
} from "../schemas/navigation-callback.ts";
import type {
  InlineKeyboardButton,
  InlineKeyboardMarkup,
  TelegramGateway,
} from "../telegram/client.ts";
import type { CallbackActionRequest, CommandMessage } from "../telegram/parse-update.ts";

const RECENT_PAGE_SIZE = 5;
const RECENT_FETCH_LIMIT = 10;

interface NavigationDataDependencies {
  readonly notes: Pick<NotesRepository, "listRecentSavedNotes">;
  readonly preferences?: Pick<UserPreferencesRepository, "get" | "update">;
  readonly templates?:
    & Pick<TemplatesRepository, "listLabels">
    & Partial<Pick<TemplatesRepository, "listAvailable">>;
  readonly quota?: Pick<QuotaRepository, "getSummary">;
  readonly plans?: Pick<PlanRepository, "getCatalogue">;
  readonly userPlanKey?: string;
}

export type NavigationCommandDependencies = NavigationDataDependencies & {
  readonly telegram: Pick<TelegramGateway, "sendMessage">;
};

export type NavigationCallbackDependencies = NavigationDataDependencies & {
  readonly telegram: Pick<TelegramGateway, "editMessageText">;
};

interface NavigationView {
  readonly text: string;
  readonly keyboard: InlineKeyboardMarkup;
}

function navButton(
  text: string,
  action: NavigationAction,
  value: string | null = null,
  style?: InlineKeyboardButton["style"],
): InlineKeyboardButton {
  return {
    text,
    ...(style === undefined ? {} : { style }),
    callback_data: encodeNavigationCallback({ action, value }),
  };
}

function keyboard(rows: readonly (readonly InlineKeyboardButton[])[]): InlineKeyboardMarkup {
  return { inline_keyboard: rows };
}

function mainMenuView(): NavigationView {
  return {
    text: [
      "🏠 Notinn",
      "",
      "Capture, organise, and revisit your notes without leaving Telegram.",
      "",
      "Choose what you would like to do:",
    ].join("\n"),
    keyboard: keyboard([
      [navButton("📝 New note", "new"), navButton("📚 My notes", "recent")],
      [navButton("🔎 Search", "search"), navButton("💬 Ask notes", "ask")],
      [navButton("🎨 Templates", "templates"), navButton("⚙️ Settings", "settings")],
      [navButton("📊 Usage", "usage"), navButton("❓ Help", "help", null, "primary")],
    ]),
  };
}

function startView(): NavigationView {
  const menu = mainMenuView();
  return {
    text: [
      "👋 Welcome to Notinn",
      "",
      "Turn messages, voice notes, images, and documents into clear, structured notes.",
      "",
      "1. Send or forward your content",
      "2. Notinn organises it",
      "3. Save, search, ask, or export it",
      "",
      "Send something whenever you are ready.",
    ].join("\n"),
    keyboard: menu.keyboard,
  };
}

function helpView(): NavigationView {
  return {
    text: [
      "❓ Help centre",
      "",
      "Choose a topic below. You can return to the main menu at any time.",
    ].join("\n"),
    keyboard: keyboard([
      [navButton("📝 Create notes", "help_create"), navButton("📚 Find notes", "help_find")],
      [
        navButton("🎨 Templates", "help_templates"),
        navButton("⚙️ Settings", "help_settings"),
      ],
      [navButton("🔐 Privacy", "help_privacy")],
      [navButton("🏠 Main menu", "main", null, "primary")],
    ]),
  };
}

function helpTopicView(action: NavigationAction): NavigationView {
  const copy: Readonly<Record<string, readonly string[]>> = {
    help_create: [
      "📝 Help › Create notes",
      "",
      "Send text, a forwarded message, voice/audio, an image, PDF, DOCX, TXT, or Markdown file.",
      "Notinn will detect the input and choose an appropriate format automatically.",
    ],
    help_find: [
      "📚 Help › Find notes",
      "",
      "Use /recent to open saved notes, /search followed by keywords, or /ask followed by a question.",
      "Only notes you explicitly saved are included in your library.",
    ],
    help_templates: [
      "🎨 Help › Templates",
      "",
      "Templates control how future notes are organised. Choose defaults in Settings or manage custom templates from Templates.",
    ],
    help_settings: [
      "⚙️ Help › Settings",
      "",
      "Settings affect future notes only. Existing note versions are never silently overwritten.",
    ],
    help_privacy: [
      "🔐 Help › Privacy",
      "",
      "Balanced mode retains source content so a note can be reformatted later.",
      "Minimal mode removes retained source content after processing, so later reformatting is unavailable.",
    ],
  };
  return {
    text: (copy[action] ?? copy.help_create ?? []).join("\n"),
    keyboard: keyboard([
      [navButton("⬅️ Back to help", "help")],
      [navButton("🏠 Main menu", "main", null, "primary")],
    ]),
  };
}

function newNoteView(): NavigationView {
  return {
    text: [
      "📝 New note",
      "",
      "Send or forward any supported content directly in this chat:",
      "",
      "• Text or forwarded messages",
      "• Voice notes or audio",
      "• Images and documents",
      "",
      "No command is required.",
    ].join("\n"),
    keyboard: keyboard([
      [navButton("🎨 Choose defaults", "settings")],
      [navButton("🏠 Main menu", "main", null, "primary")],
    ]),
  };
}

function commandPromptView(kind: "search" | "ask"): NavigationView {
  const isSearch = kind === "search";
  return {
    text: isSearch
      ? [
        "🔎 Search notes",
        "",
        "Send /search followed by 2–200 characters.",
        "",
        "Example: /search quarterly risk",
      ].join("\n")
      : [
        "💬 Ask your notes",
        "",
        "Send /ask followed by a 2–500 character question.",
        "",
        "Example: /ask What were the agreed next actions?",
      ].join("\n"),
    keyboard: keyboard([
      [navButton("📚 Recent notes", "recent")],
      [navButton("🏠 Main menu", "main", null, "primary")],
    ]),
  };
}

function languageLabel(value: UserPreferences["outputLanguage"]): string {
  return value === "mirror" ? "Mirror input" : value === "id" ? "Indonesian" : "English";
}

function privacyLabel(value: UserPreferences["privacyMode"]): string {
  return value === "balanced" ? "Balanced" : "Minimal";
}

function templateLabel(key: string | null, labels: ReadonlyMap<string, string>): string {
  return key === null ? "Automatic" : labels.get(key) ?? key;
}

async function settingsView(
  userId: string,
  deps: NavigationDataDependencies,
  notice?: { readonly icon: "✅" | "⚠️"; readonly text: string },
): Promise<NavigationView> {
  if (deps.preferences === undefined || deps.templates === undefined) {
    return unavailableView("⚙️ Settings", "Settings are not enabled yet.");
  }
  const [preferences, labels] = await Promise.all([
    deps.preferences.get(userId),
    deps.templates.listLabels(userId),
  ]);
  return {
    text: [
      "⚙️ Settings",
      ...(notice === undefined ? [] : ["", `${notice.icon} ${notice.text}`]),
      "",
      `🌐 Output language: ${languageLabel(preferences.outputLanguage)}`,
      `🔐 Privacy mode: ${privacyLabel(preferences.privacyMode)}`,
      `📝 Text format: ${templateLabel(preferences.defaultTextTemplate, labels)}`,
      `🎙 Voice format: ${templateLabel(preferences.defaultVoiceTemplate, labels)}`,
      `📄 Document format: ${templateLabel(preferences.defaultDocumentTemplate, labels)}`,
      "",
      "Changes apply to future notes only.",
    ].join("\n"),
    keyboard: keyboard([
      [
        navButton("🌐 Language", "settings_language"),
        navButton("🔐 Privacy", "settings_privacy"),
      ],
      [navButton("📝 Text format", "settings_text"), navButton("🎙 Voice format", "settings_voice")],
      [navButton("📄 Document format", "settings_document")],
      [navButton("🏠 Main menu", "main", null, "primary")],
    ]),
  };
}

function selectedButton(
  label: string,
  selected: boolean,
  action: NavigationAction,
  value: string,
): InlineKeyboardButton {
  return navButton(
    `${selected ? "✓ " : ""}${label}`,
    action,
    value,
    selected ? "success" : undefined,
  );
}

async function settingPickerView(
  userId: string,
  action: NavigationAction,
  deps: NavigationDataDependencies,
): Promise<NavigationView> {
  if (deps.preferences === undefined || deps.templates === undefined) {
    return unavailableView("⚙️ Settings", "Settings are not enabled yet.");
  }
  const preferences = await deps.preferences.get(userId);
  if (action === "settings_language") {
    return {
      text: "⚙️ Settings › Output language\n\nChoose the language used for future generated notes.",
      keyboard: keyboard([
        [
          selectedButton(
            "Mirror input",
            preferences.outputLanguage === "mirror",
            "set_language",
            "mirror",
          ),
        ],
        [
          selectedButton("Indonesian", preferences.outputLanguage === "id", "set_language", "id"),
          selectedButton("English", preferences.outputLanguage === "en", "set_language", "en"),
        ],
        [navButton("⬅️ Back to settings", "settings")],
      ]),
    };
  }
  if (action === "settings_privacy") {
    return {
      text: [
        "⚙️ Settings › Privacy",
        "",
        "Balanced keeps source content for later reformatting.",
        "Minimal removes retained source content after processing.",
      ].join("\n"),
      keyboard: keyboard([
        [
          selectedButton(
            "Balanced",
            preferences.privacyMode === "balanced",
            "set_privacy",
            "balanced",
          ),
          selectedButton(
            "Minimal",
            preferences.privacyMode === "minimal",
            "set_privacy",
            "minimal",
          ),
        ],
        [navButton("⬅️ Back to settings", "settings")],
      ]),
    };
  }

  const config: Readonly<
    Record<string, {
      title: string;
      inputType: InputType;
      current: string | null;
      setter: NavigationAction;
    }>
  > = {
    settings_text: {
      title: "Text format",
      inputType: "text",
      current: preferences.defaultTextTemplate,
      setter: "set_text",
    },
    settings_voice: {
      title: "Voice format",
      inputType: "voice",
      current: preferences.defaultVoiceTemplate,
      setter: "set_voice",
    },
    settings_document: {
      title: "Document format",
      inputType: "pdf",
      current: preferences.defaultDocumentTemplate,
      setter: "set_document",
    },
  };
  const selected = config[action] ?? config.settings_text;
  if (selected === undefined) return settingsView(userId, deps);
  const labels = await deps.templates.listLabels(userId, selected.inputType);
  const buttons = [
    selectedButton("✨ Automatic", selected.current === null, selected.setter, "default"),
    ...[...labels].map(([key, label]) =>
      selectedButton(label, selected.current === key, selected.setter, key)
    ),
  ];
  const rows: InlineKeyboardButton[][] = [];
  for (let index = 0; index < buttons.length; index += 2) {
    rows.push(buttons.slice(index, index + 2));
  }
  rows.push([navButton("⬅️ Back to settings", "settings")]);
  return {
    text: `⚙️ Settings › ${selected.title}\n\nChoose the default for future notes.`,
    keyboard: keyboard(rows),
  };
}

async function recentView(
  userId: string,
  page: number,
  deps: NavigationDataDependencies,
): Promise<NavigationView> {
  const notes = await deps.notes.listRecentSavedNotes(userId, RECENT_FETCH_LIMIT);
  if (notes.length === 0) {
    return {
      text: "📚 My notes\n\nYou do not have any saved notes yet.",
      keyboard: keyboard([
        [navButton("✨ Create a note", "new")],
        [navButton("🏠 Main menu", "main", null, "primary")],
      ]),
    };
  }
  const pageCount = Math.ceil(notes.length / RECENT_PAGE_SIZE);
  const safePage = Math.min(Math.max(page, 0), pageCount - 1);
  const visible = notes.slice(safePage * RECENT_PAGE_SIZE, (safePage + 1) * RECENT_PAGE_SIZE);
  const rows: InlineKeyboardButton[][] = visible.map((note, index) => [{
    text: `${safePage * RECENT_PAGE_SIZE + index + 1} · ${note.title.slice(0, 44)}`,
    callback_data: encodeCallbackPayload({
      action: { kind: "show" },
      resourceId: note.noteId,
      revision: 0,
    }),
  }]);
  const navigation: InlineKeyboardButton[] = [];
  if (safePage > 0) navigation.push(navButton("⬅️ Previous", "recent", String(safePage - 1)));
  if (safePage < pageCount - 1) {
    navigation.push(navButton("Next ➡️", "recent", String(safePage + 1)));
  }
  if (navigation.length > 0) rows.push(navigation);
  rows.push([navButton("🔎 Search", "search"), navButton("🏠 Main menu", "main")]);
  return {
    text: `📚 My notes\n\nChoose a saved note to open.\nPage ${safePage + 1} of ${pageCount}`,
    keyboard: keyboard(rows),
  };
}

async function templatesView(
  userId: string,
  deps: NavigationDataDependencies,
): Promise<NavigationView> {
  if (deps.templates?.listAvailable === undefined) {
    return unavailableView("🎨 Templates", "Custom templates are not enabled yet.");
  }
  const templates = await deps.templates.listAvailable(userId);
  const builtIn = templates.filter((item) => !item.isCustom);
  const custom = templates.filter((item) => item.isCustom);
  return {
    text: [
      "🎨 Templates",
      "",
      `Built-in: ${builtIn.length}`,
      `Custom: ${custom.length}/5`,
      "",
      ...(custom.length === 0
        ? ["No custom templates yet."]
        : custom.map((item) => `• ${item.name} (${item.key})`)),
      "",
      "Choose defaults in Settings or open the custom-template guide.",
    ].join("\n"),
    keyboard: keyboard([
      [navButton("⚙️ Choose defaults", "settings")],
      [
        navButton("➕ Create custom", "template_create"),
        navButton("🗄 Manage custom", "template_manage"),
      ],
      [navButton("🏠 Main menu", "main", null, "primary")],
    ]),
  };
}

function templateGuideView(manage: boolean): NavigationView {
  return {
    text: manage
      ? [
        "🎨 Templates › Manage custom",
        "",
        "Archive a custom template with:",
        "/template archive <template_key>",
        "",
        "A template used by a pending note cannot be archived until processing finishes.",
      ].join("\n")
      : [
        "🎨 Templates › Create custom",
        "",
        "Use:",
        "/template create Name | text,voice,document | Instructions",
        "",
        "Example:",
        "/template create Client Brief | text,document | Focus on decisions and next actions.",
      ].join("\n"),
    keyboard: keyboard([
      [navButton("⬅️ Back to templates", "templates")],
      [navButton("🏠 Main menu", "main", null, "primary")],
    ]),
  };
}

function unavailableView(title: string, message: string): NavigationView {
  return {
    text: `${title}\n\n${message}`,
    keyboard: keyboard([[navButton("🏠 Main menu", "main", null, "primary")]]),
  };
}

function usageLabel(item: UsageSummary): string {
  return item.metric === "note_generation"
    ? "📝 New notes"
    : item.metric === "regeneration"
    ? "🔄 Regenerations"
    : "💬 Ask Notes";
}

async function usageView(
  userId: string,
  deps: NavigationDataDependencies,
): Promise<NavigationView> {
  if (deps.quota === undefined) {
    return unavailableView("📊 Plan & usage", "Usage information is not enabled yet.");
  }
  const rows = await deps.quota.getSummary(userId);
  const first = rows[0];
  if (first === undefined) {
    return unavailableView("📊 Plan & usage", "Your plan is not configured yet.");
  }
  const planLabel = deps.userPlanKey !== undefined
    ? `\nPlan: ${first.planName} (${deps.userPlanKey})`
    : `\nPlan: ${first.planName}`;
  const lines = rows.map((item) => {
    const pending = item.reservedUnits === 0 ? "" : ` (+${item.reservedUnits} processing)`;
    const dailyPending = item.dailyReservedUnits === 0
      ? ""
      : ` (+${item.dailyReservedUnits} processing)`;
    return [
      usageLabel(item),
      `  Today: ${item.dailyUsedUnits}${dailyPending} / ${item.dailyLimit}`,
      `  This month: ${item.usedUnits}${pending} / ${item.monthlyLimit}`,
    ].join("\n");
  });
  return {
    text: [
      "📊 Plan & usage",
      planLabel,
      `Period: ${first.periodStart} to ${first.periodEnd} (UTC)`,
      `Today: ${first.usageDate} (UTC)`,
      "",
      ...lines,
      "",
      "Daily usage resets at 00:00 UTC; monthly usage resets on the first day of the month.",
    ].join("\n"),
    keyboard: keyboard([
      [navButton("⬆️ Upgrade", "upgrade"), navButton("🔄 Refresh", "usage")],
      [navButton("🏠 Main menu", "main", null, "primary")],
    ]),
  };
}

async function upgradeView(
  userId: string,
  deps: NavigationDataDependencies,
): Promise<NavigationView> {
  if (deps.plans === undefined) {
    return unavailableView("⬆️ Upgrade", "Plan information is not available yet.");
  }

  let currentPlan = deps.userPlanKey;
  if (currentPlan === undefined && deps.quota !== undefined) {
    try {
      currentPlan = (await deps.quota.getSummary(userId))[0]?.planKey;
    } catch {
      // The catalogue can still provide useful upgrade information below.
    }
  }
  currentPlan ??= "free";

  let catalogue: readonly PlanCatalogueEntry[];
  try {
    catalogue = await deps.plans.getCatalogue();
  } catch {
    return unavailableView("⬆️ Upgrade", "Could not load plan information.");
  }
  if (catalogue.length === 0) {
    return unavailableView("⬆️ Upgrade", "No active plans are available right now.");
  }

  const current = catalogue.find((p) => p.planKey === currentPlan);
  const pro = catalogue.find((p) => p.planKey === "pro");

  const lines = ["⬆️ Upgrade to Pro", ""];

  if (current !== undefined) {
    lines.push(`Current plan: ${current.displayName}`);
    if (current.features.length > 0) {
      lines.push("");
      lines.push(`📋 ${current.displayName} plan:`);
      for (const feature of current.features) {
        lines.push(`• ${feature}`);
      }
    }
  } else {
    lines.push(`Current plan: ${currentPlan}`);
  }

  if (pro !== undefined && pro.planKey !== currentPlan) {
    lines.push("");
    lines.push(`🚀 Pro plan:`);
    for (const feature of pro.features) {
      lines.push(`• ${feature}`);
    }
    if (pro.priceMonthlyUsd !== null) {
      lines.push("");
      lines.push(`Price: $${pro.priceMonthlyUsd}/month`);
    }
    lines.push("");
    lines.push("To upgrade, contact our operator.");
  } else if (pro !== undefined && pro.planKey === currentPlan) {
    lines.push("");
    lines.push("✅ You are already on the Pro plan!");
  } else {
    lines.push("");
    lines.push("Pro plan information is not available right now.");
  }

  return {
    text: lines.join("\n"),
    keyboard: keyboard([
      [navButton("📊 My usage", "usage")],
      [navButton("🏠 Main menu", "main", null, "primary")],
    ]),
  };
}

async function viewFor(
  action: NavigationAction,
  value: string | null,
  userId: string,
  deps: NavigationDataDependencies,
): Promise<NavigationView> {
  if (action === "main") return mainMenuView();
  if (action === "new") return newNoteView();
  if (action === "help") return helpView();
  if (action.startsWith("help_")) return helpTopicView(action);
  if (action === "search" || action === "ask") return commandPromptView(action);
  if (action === "usage") return await usageView(userId, deps);
  if (action === "upgrade") return await upgradeView(userId, deps);
  if (action === "recent") {
    return await recentView(userId, Number.parseInt(value ?? "0", 10), deps);
  }
  if (action === "templates") return await templatesView(userId, deps);
  if (action === "template_create") return templateGuideView(false);
  if (action === "template_manage") return templateGuideView(true);
  if (action === "settings") return await settingsView(userId, deps);
  if (action.startsWith("settings_")) return await settingPickerView(userId, action, deps);
  return mainMenuView();
}

export async function sendNavigationCommand(
  command: CommandMessage,
  userId: string,
  deps: NavigationCommandDependencies,
): Promise<void> {
  const action: NavigationAction = command.command === "start"
    ? "main"
    : command.command === "menu"
    ? "main"
    : command.command === "new"
    ? "new"
    : command.command === "help"
    ? "help"
    : command.command === "recent"
    ? "recent"
    : command.command === "search"
    ? "search"
    : command.command === "ask"
    ? "ask"
    : command.command === "usage"
    ? "usage"
    : command.command === "upgrade"
    ? "upgrade"
    : command.command === "templates"
    ? "templates"
    : "settings";
  const view = command.command === "start"
    ? startView()
    : await viewFor(action, null, userId, deps);
  await deps.telegram.sendMessage(command.telegramChatId, view.text, {
    inlineKeyboard: view.keyboard,
  });
}

export async function handleNavigationCallback(
  callback: CallbackActionRequest,
  payload: NavigationCallbackPayload,
  userId: string,
  deps: NavigationCallbackDependencies,
): Promise<void> {
  let view: NavigationView;
  if (payload.action.startsWith("set_")) {
    if (deps.preferences === undefined || deps.templates === undefined || payload.value === null) {
      view = unavailableView("⚙️ Settings", "Settings are not enabled yet.");
    } else {
      const settingMap: Readonly<Record<string, PreferenceSetting>> = {
        set_language: "language",
        set_privacy: "privacy",
        set_text: "text_template",
        set_voice: "voice_template",
        set_document: "document_template",
      };
      const setting = settingMap[payload.action];
      if (setting === undefined) {
        view = await settingsView(userId, deps);
      } else {
        if (
          ["set_text", "set_voice", "set_document"].includes(payload.action) &&
          payload.value !== "default"
        ) {
          const inputType: InputType = payload.action === "set_text"
            ? "text"
            : payload.action === "set_voice"
            ? "voice"
            : "pdf";
          const labels = await deps.templates.listLabels(userId, inputType);
          if (!labels.has(payload.value)) {
            view = await settingsView(userId, deps, {
              icon: "⚠️",
              text: "That template is no longer available",
            });
            await deps.telegram.editMessageText(
              callback.telegramChatId,
              callback.messageId,
              view.text,
              {
                inlineKeyboard: view.keyboard,
              },
            );
            return;
          }
        }
        await deps.preferences.update(userId, setting, payload.value);
        view = await settingsView(userId, deps, { icon: "✅", text: "Setting saved" });
      }
    }
  } else {
    view = await viewFor(payload.action, payload.value, userId, deps);
  }
  await deps.telegram.editMessageText(callback.telegramChatId, callback.messageId, view.text, {
    inlineKeyboard: view.keyboard,
  });
}
