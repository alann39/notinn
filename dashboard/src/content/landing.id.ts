export const TELEGRAM_URL = "https://t.me/NotinnBot";

export interface LandingNavItem {
  readonly label: string;
  readonly href: string;
}

export const LANDING_NAV: readonly LandingNavItem[] = [
  { label: "Features", href: "#features" },
  { label: "How it works", href: "#how-it-works" },
  { label: "Pricing", href: "#pricing" },
];

export const LANDING_CONTENT = {
  heroTitle: "Turn scattered input into usable notes.",
  heroBody:
    "Forward text, voice notes, screenshots, or documents to Notinn on Telegram. Get a clear, structured note back.",
  primaryCta: "Open Notinn in Telegram",
  secondaryCta: "How it works",
  dashboardLink: "Open dashboard",
  inputHeading: "Send from formats you already use",
  inputFootnote: "Size, duration, and page limits apply during the Closed Alpha.",
  proofEyebrow: "One send, ready-to-use results",
  proofHeading: "From scattered messages to a clear plan",
  beforeLabel: "Incoming message",
  beforeText:
    "meeting vendor tomorrow at 10 to discuss the new proposal then ask about the price revision and implementation timeline maybe bring the legal team too",
  afterLabel: "Note from Notinn",
  afterTitle: "Vendor meeting prep",
  afterScheduleLabel: "Schedule",
  afterSchedule: "Tomorrow, 10:00",
  afterTopicsLabel: "Discussion topics",
  proofDisclosure: "Synthetic example. Output structure follows the source content and the selected format.",
  howHeading: "Stay in Telegram. Three steps only.",
  formatsEyebrow: "Formats that follow your needs",
  formatsHeading: "Not one summary for everything",
  formatsBody: "Use the default result, then change format without resending the same material.",
  formatsMore: "See all formats",
  useCasesHeading: "For information that arrives before you can tidy it",
  featuresHeading: "Three things Notinn does for you",
  libraryHeading: "Notes keep working after creation",
  libraryBody:
    "Save important notes, open recent notes, search by keyword, or use the dashboard to read and export with more room.",
  privacyEyebrow: "Privacy explained, not implied",
  privacyHeading: "Notinn minimises raw files. Third-party limits still apply.",
  privacyLink: "Read the full privacy notice",
  availabilityHeading: "Currently in Closed Alpha",
  availabilityBody:
    "Access is available to invited users. Features, usage limits, providers, and availability may change during this stage.",
  finalHeading: "Let Telegram be the entrance. Not where information disappears.",
  finalBody:
    "Send one item you actually want tidied, then see whether the result fits how you work.",
  finalNote: "Closed Alpha. Access requires an active invitation.",
  footerTagline: "Knowledge inbox on Telegram.",
  footerStatus: "Closed Alpha",
} as const;

export const MARQUEE_ITEMS = [
  "Text",
  "Voice notes",
  "Screenshots",
  "Documents",
  "Forwarded messages",
  "Clean notes",
] as const;

export const SUPPORTED_INPUTS = [
  "Text",
  "Forwarded messages",
  "Voice notes and audio",
  "Screenshots and photos",
  "PDF and DOCX",
  "TXT and Markdown",
] as const;

export const AFTER_TOPICS = [
  "New proposal",
  "Price revision",
  "Implementation timeline",
  "Whether the legal team should join",
] as const;

export const HOW_IT_WORKS = [
  {
    step: "01",
    title: "Send",
    body: "Forward a message or send text, voice notes, screenshots, photos, or documents to your private Notinn chat.",
  },
  {
    step: "02",
    title: "Notinn organises",
    body: "Notinn reads what it needs, picks the default structure, then produces the note.",
  },
  {
    step: "03",
    title: "Save or change",
    body: "Save the result, make it shorter or more detailed, change format, search again, or delete.",
  },
] as const;

export const FEATURED_FORMATS = [
  "Clean note",
  "Short summary",
  "Action items",
  "Meeting notes",
  "Study notes",
  "Research note",
] as const;
export const ADDITIONAL_FORMATS = [
  "Detailed summary",
  "Key points",
  "Decision log",
  "SOP/procedure",
  "Extract & summarise",
] as const;

export interface FormatPreview {
  readonly title: string;
  readonly badge: string;
  readonly description: string;
  readonly items: readonly string[];
}

export const FORMAT_PREVIEWS: Record<string, FormatPreview> = {
  "Clean note": {
    title: "Vendor meeting prep",
    badge: "Clean note",
    description: "Structured default format for quick reading and work archives.",
    items: [
      "Schedule: Vendor meeting tomorrow at 10:00",
      "Main agenda: Discussing the new proposal",
      "Clarification: Requesting price revision details and timeline milestones",
      "Coordination: Confirming legal team attendance",
    ],
  },
  "Short summary": {
    title: "Summary: Vendor meeting",
    badge: "Brief (1 minute)",
    description: "Dense gist without excess detail, ideal for glancing on mobile.",
    items: [
      "Vendor meeting scheduled tomorrow at 10am.",
      "Focus: new proposal, price adjustment, and timeline certainty.",
      "Legal should join if new contract commitments arise.",
    ],
  },
  "Action items": {
    title: "Task list and follow-ups",
    badge: "Action checklist",
    description: "Tasks you can execute immediately, with clear owners and deadlines.",
    items: [
      "[ ] Prepare the price comparison before 09:30",
      "[ ] Ask legal to join the 10:00 session",
      "[ ] Get draft timeline confirmation from the vendor when the meeting ends",
    ],
  },
  "Meeting notes": {
    title: "Vendor prep meeting notes",
    badge: "Meeting format",
    description: "Formal structure covering context, discussion, decisions, and next agenda.",
    items: [
      "Attendees: Internal lead + vendor representative",
      "Topic: Technical proposal review and commercial budget revision",
      "Decision: Implementation timeline must be agreed before the week ends",
      "Next step: Finalise the written agreement with legal",
    ],
  },
  "Study notes": {
    title: "Study notes: Vendor contract negotiation",
    badge: "Concepts and insight",
    description: "Focused on principles, key concepts, and reflection.",
    items: [
      "Key concept: Check the cost-to-timeline ratio before agreeing an SLA",
      "Review question: Does the contract clause cover price deviation limits?",
      "Practical takeaway: Never fix the final schedule before legal reviews the risk",
    ],
  },
  "Research note": {
    title: "Research note: Vendor fit and timeline analysis",
    badge: "Structured research",
    description: "Collecting objective findings, sources, comparison data, and hypotheses.",
    items: [
      "Background: Need to accelerate next quarter's project rollout",
      "Critical variable: Price flexibility against faster delivery",
      "Recommendation: Verify vendor technical readiness through a thorough legal review",
    ],
  },
};

export const USE_CASES = [
  {
    title: "Meetings",
    body: "Record notes after a meeting. Get the context, decisions, and action items that were actually mentioned.",
  },
  {
    title: "Learning",
    body: "Send materials or screenshots. Arrange concepts, explanations, examples, and review questions.",
  },
  {
    title: "Research",
    body: "Condense documents into findings, evidence, limitations, and follow-ups.",
  },
  {
    title: "Daily notes",
    body: "Speak ideas on the move or forward long chats. Tidy them later without starting from a blank page.",
  },
] as const;

export const FEATURES = [
  {
    title: "Messy input becomes a clear note",
    body: "Forward text, voice notes, screenshots, or documents to Notinn. Notinn picks the default structure and returns a note that is ready to use.",
  },
  {
    title: "One send, many formats",
    body: "Use the default result, then change format without resending the same material.",
  },
  {
    title: "Notes stay usable",
    body: "Save important notes, search by keyword, or open the dashboard to read and export with more room.",
  },
] as const;

export const PRIVACY_POINTS = [
  "Raw audio, image, and document bytes are processed in memory and never stored as Notinn files.",
  "Derived text and notes follow the privacy mode and persist until you delete the note or account.",
  "Original messages or files in Telegram are not deleted when the Notinn account is deleted.",
  "Required content is sent to Google Gemini. OpenRouter receives content only when transient fallback is used.",
  "While Gemini uses an unpaid API tier, do not send sensitive or confidential information.",
] as const;

export const AI_LIMITATION =
  "Generated notes may be incomplete or incorrect. Review results before using them for important decisions.";

export interface FaqItem {
  readonly key: string;
  readonly question: string;
  readonly answer: string;
}

export const FAQ_ITEMS: readonly FaqItem[] = [
  {
    key: "supported-inputs",
    question: "What can I send?",
    answer:
      "Notinn supports text, forwarded messages, voice notes, audio, screenshots, photos, PDF, DOCX, TXT, and Markdown. Size, duration, page, and codec limits apply during the Closed Alpha.",
  },
  {
    key: "raw-files",
    question: "Does Notinn keep my original files?",
    answer:
      "Raw audio, image, and document bytes are processed in memory and never stored as Notinn files. The original copy in Telegram follows Telegram's own retention and deletion controls.",
  },
  {
    key: "accuracy",
    question: "Are results always accurate?",
    answer:
      "No. AI results can be incomplete, incorrect, or miss context. Notinn shows uncertainty when detected, but you still need to review results before using them.",
  },
  {
    key: "languages",
    question: "Which languages are supported?",
    answer:
      "Indonesian and English input are supported. By default, output follows the source language. Output preference can be changed in settings.",
  },
  {
    key: "account",
    question: "Do I need a new account?",
    answer:
      "For Telegram use, no separate email or password is needed. Account identity comes from your private Telegram chat. The dashboard uses a secure, single-use link requested from the bot.",
  },
  {
    key: "deletion",
    question: "How do I delete my data?",
    answer:
      "Delete a note directly from its actions. For accounts, send /delete_account then follow the confirmation. There is a seven-day cancellation window before final deletion.",
  },
  {
    key: "groups",
    question: "Is Notinn available in Telegram groups?",
    answer: "Not yet. The current version only accepts private chats.",
  },
];
