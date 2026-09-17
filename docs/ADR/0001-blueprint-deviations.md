# ADR 0001 — Deviations from the blueprint

**Status:** Accepted, Phase 0 — all five decisions closed 2026-09-17
**Date:** 2026-09-16
**Decisions:** 2026-09-17
**Applies to:** Phase 0 and later

## Context

The blueprint is the product specification and the authority for what Notinn does.
It is not an implementation specification, and in five places it either does not
decide an implementation question or states a rule that Phase 0 cannot honour.

The brief's instruction is explicit: _"If the blueprint and an implementation
detail conflict, stop and explain the exact conflict before choosing a behavior.
Do not silently reinterpret a product rule."_ This ADR is that explanation,
recorded once, in one place, so the deviations are reviewable rather than buried
in code comments.

Each entry states what the blueprint says, what Notinn does, and what would have
to be true for the deviation to be wrong.

All five were answered on 2026-09-17. Two needed a product decision (§3, §4). The
other three are settled by the blueprint's own text — and §4, on inspection, was
never a deviation at all.

| # | Deviation                    | Decision                                                                              |
| - | ---------------------------- | ------------------------------------------------------------------------------------- |
| 1 | The blueprint's filename     | No action — cosmetic.                                                                 |
| 2 | An eleventh system template  | **Keep it.** §6.3 requires it; §26.2 requires deterministic image routing.            |
| 3 | Silent ignore in groups      | **Silent in Phase 0, a fixed reply once per chat from Phase 1.** §16.4 stands.        |
| 4 | The "meeting-like" heuristic | **Not a deviation.** §25 schedules Meeting Notes for Phase 2. It judges a transcript. |
| 5 | TXT/Markdown → Clean Note    | **Keep it.** §26.2 requires deterministic routing; the closest row is pasted text.    |

---

## 1. The blueprint's filename

**Blueprint:** not stated.
**Notinn:** the file remains `docs/Master_Blueprint.md`.

The brief refers to "the product blueprint" without naming a file. Renaming it
would invalidate every path reference across the repository for no benefit, so it
keeps the name it has. Nothing depends on the name.

**Answer (2026-09-17):** no action. Cosmetic only.

---

## 2. An eleventh system template

**Blueprint:** §6.1 lists ten templates. §6.3's routing table sends a
screenshot or photograph to **Extract & Summarize**.
**Notinn:** eleven templates. `extract_and_summarize` is added to the catalogue in
migration 3.

The blueprint's catalogue omits a template that its own routing table requires. The
two errors are not equivalent in cost. Adding the eleventh template makes §6.3
satisfiable; omitting it means every photograph fails the foreign key from
`processing_jobs.template_key` and the user gets nothing. Since no other template
means "extract the content and summarise it" — `detailed_summary` describes a
document, not an extraction — inventing the key was the only way to honour §6.3.

**Answer (2026-09-17): keep the eleventh template.** §26.2 requires that "Text,
voice, image, PDF, DOCX, TXT, and Markdown inputs have deterministic routing", and
§6.3 routes a photograph to Extract & Summarize. The other arm is not a different
product decision — it is a foreign-key violation on the user's first photograph.
`detailed_summary` describes a document; it does not extract one.

Reversible in one migration and one line if that judgement is ever revisited.

---

## 3. Silent ignore instead of a fixed rejection reply

**Blueprint:** §16.4 — _"Reject groups/channels with a fixed response."_
**Notinn:** a non-private chat is ignored silently. No row, no reply.

This is the one deviation that is a genuine behavioural difference, and it is the
one most worth arguing about.

Three reasons, in order of weight:

1. **A rejection reply requires outbound messaging, which Phase 0 does not have.**
   Sending anything requires `sendMessage`, a bot API call, retry handling for its
   failures, and a rate limiter — none of which exist. Implementing all of that to
   deliver a message that is, by the blueprint's own wording, a refusal, is a
   large amount of Phase 1 machinery spent on a Phase 0 nicety.

2. **A reply to a group message is itself a group message.** Telegram delivers a
   bot's message into the group. The blueprint's intent — that Notinn is not a
   group tool and should not behave like one in a group — is served at least as
   well by silence as by posting text into a chat Notinn wants nothing to do with.
   The "fixed response" makes Notinn's presence in the group more visible, not less.

3. **The exit criterion permits it.** Phase 0's criterion 4 is _"non-private chats
   rejected or safely ignored per documented contract"_. Silent ignore is the
   second arm, and this ADR is the documentation.

What is preserved from §16.4 regardless: the update is never processed, no job is
created, no user row is created, and the decision is logged with a fixed-vocabulary
reason so the refusal is observable to an operator even though it is invisible to
the sender.

**Answer (2026-09-17): the intent was that a user should be told. §16.4 stands, and
this deviation becomes a schedule rather than a reinterpretation.**

Phase 0 keeps silent ignore, because it has no outbound messaging — that is a
capability limit, not a product choice. Phase 1 introduces replies, and sends the
fixed response **once per chat**: the first time a given non-private chat is seen,
not once per message. §16.4's intent is served in full, and the group is never
spammed by a bot that has nothing to do with it. That was reason 2 above, and it is
the reason the once-per-chat guard is the decision rather than a nicety.

The message already exists and has never been sent: `ERROR_CODES.NON_PRIVATE_CHAT`
carries "I only work in private chats for now." Phase 1 supplies the `sendMessage`
call, the once-per-chat guard, and the retry handling any outbound message needs.

Scoped deliberately: **only** a non-private chat gets a reply. A malformed body, a
message from a bot, and an unsupported content kind all stay silent, because §16.4
asks for a response to groups and channels and nothing else — and a bot cannot be
told anything useful anyway.

---

## 4. The "meeting-like" heuristic is deferred

**Blueprint:** §6.3 — _"Voice note/audio: Meeting Notes if meeting-like, otherwise
Clean Note."_
**Notinn:** Phase 0 routes all voice and audio to `clean_note`.

The blueprint's own row supplies a fallback — "otherwise Clean Note" — and Phase 0
takes exactly that fallback. The reason is not convenience: **the heuristic cannot
be evaluated.** In Phase 0 nothing has been transcribed, so there is no transcript
to judge, and the only remaining signals are the audio's duration and the sender's
own framing. Judging "meeting-like" from a duration threshold would be inventing a
product rule, which is precisely what the brief forbids.

The consequence is bounded and visible: a user who records a meeting gets a clean
note instead of meeting minutes, and can press **[Meeting notes]** to regenerate.
The regenerate path is blueprint §6.3's own escape hatch, so the wrong default
costs one tap.

**Answer (2026-09-17): this was never a deviation.**

§25 schedules "Meeting Notes" as a **Phase 2** deliverable, in the same block as
"Gemini audio processing" and "Transcript review" — and voice ingestion is itself
Phase 2. Phase 0 taking §6.3's own stated fallback is therefore the blueprint's
phase order, not a departure from it. This entry was recorded as a deviation and
should have been recorded as a schedule.

When the heuristic arrives it judges **the transcript**, not metadata. §6.3 places
the judgement after transcription, and a transcript is the only real evidence of
what a recording is. A duration threshold would invent a product rule the blueprint
does not state, and would file a long voice memo as a meeting.

---

## 5. TXT and Markdown route to Clean Note

**Blueprint:** §5 lists TXT and Markdown among supported inputs. §6.3's routing
table has no row for either.
**Notinn:** both route to `clean_note`.

A narrowing rather than a conflict: the supported-input list and the routing table
disagree, and one of them is incomplete. The table's closest row is _"Pasted text →
Clean Note"_, and a `.txt` or `.md` file is text. Routing them to
`detailed_summary` — the PDF/DOCX row — would apply a large-document template to
what is usually a snippet.

**Answer (2026-09-17): keep `clean_note`.** §26.2 requires deterministic routing
for TXT and Markdown, which this provides. The default is a judgement about the
common case, and a `.txt` or `.md` sent to a note-taking bot is usually a snippet
rather than a document. `detailed_summary` stays one button away, and §6.3
guarantees alternative-format buttons on every result.

---

## Consequences

- All five are decided as of 2026-09-17. Two (#2, #5) resolved in favour of the
  existing implementation with no code change; one (#1) is cosmetic; one (#4) was
  never a deviation, because §25 schedules Meeting Notes for Phase 2; one (#3)
  becomes a schedule, and produces the only Phase 1 work item in this ADR — a
  once-per-chat fixed reply to a non-private chat.
- Deviations #2, #4 and #5 are transcribed into
  `supabase/functions/_shared/services/input-routing.ts` with a comment pointing
  here, so a reader of the routing table cannot miss them.
- Deviation #3 is recorded in the ingestion contract,
  [ADR 0003](0003-ingestion-contract.md), and asserted in
  `tests/security/webhook-auth.test.ts`.
- If a later decision reverses any of these, the change is small in every case.
  That is the test of whether a deviation was scoped correctly, and it is why none
  of them were allowed to harden into the schema. The one exception is #3, and even
  that is one call in the Phase 1 reply path rather than a schema change.
