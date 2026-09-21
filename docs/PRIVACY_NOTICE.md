# Notinn privacy notice

Last reviewed: 2026-09-21. This notice describes the Closed Alpha. It is a
product disclosure, not a promise that third-party policies will never change.

## Data Notinn receives

Notinn receives the Telegram identity and private-chat content needed to operate
the bot: user/chat identifiers, profile labels, message metadata, text, and any
voice, image, or document submitted for processing. Do not submit secrets or
content you do not have the right to process.

## Notinn retention

| Data                                                                    | Retention                                                                                              |
| ----------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------ |
| Raw audio, image, and document bytes                                    | Processed in memory, not stored as Notinn files, and zero-filled after the attempt                     |
| Direct text and Telegram file handles                                   | Scrubbed from the processing job after output is staged or the job terminates                          |
| Source-derived text                                                     | Kept with the note in `balanced`; omitted in `minimal`                                                 |
| Notes, generated outputs, embeddings, preferences, and custom templates | Until the user deletes the note or account                                                             |
| Content-free usage events                                               | Retained after account deletion for security, billing, and operations, linked only to an internal UUID |
| Content-free lifecycle audit                                            | Retained after deletion: internal UUID, event type, and timestamps only                                |
| Application logs                                                        | Must contain no note content, transcript, file, Telegram profile label, or credential                  |

## Telegram retention is separate

Notinn account deletion does not delete the original Telegram message or files
from the user's Telegram chat. Telegram stores ordinary cloud-chat content under
its own policy and provides its own message/account deletion controls. Users must
delete Telegram copies in Telegram.

## AI-provider processing is separate

Notinn sends only the content needed to generate a note to Google Gemini.
OpenRouter receives that content only when the configured transient fallback is
used after a retryable Gemini failure. Notinn does not add Telegram user IDs,
usernames, or chat IDs to AI-provider requests.

Provider treatment depends on the active account, billing tier, routed model,
and provider terms:

- Google states that unpaid Gemini API content and responses may be used to
  improve products and may be reviewed by humans. Google states that paid
  Gemini API prompts and responses are not used to improve its products, while
  limited safety/security logging still applies.
- OpenRouter states that it does not use inputs or outputs to train its own
  models. It routes inputs to a model provider, whose retention and training
  terms may differ, and may retain information for legal, security, billing, or
  compliance needs.

Deleting a Notinn account cannot recall data already processed under a
provider's policy. Before every release, the operator must verify the configured
Gemini billing tier and the OpenRouter route/provider data policy. The Closed
Alpha must not invite users to submit sensitive or confidential information
while Gemini is operating as an unpaid service.

Current policy references:

- <https://ai.google.dev/gemini-api/terms>
- <https://openrouter.ai/privacy>
- <https://telegram.org/privacy>

## Account deletion

Send `/delete_account`, read the warning, then send exactly
`/delete_account confirm`.

The request immediately blocks new processing and cancels active jobs. It is
reversible for seven days with `/cancel_deletion`. Once due, an hourly database
job deletes notes, outputs, embeddings, deliveries, drafts, preferences, custom
templates, jobs, Telegram update metadata, quota state, and invite redemption;
then it removes Telegram identity and profile labels from the retained account
anchor. Finalized deletion cannot be undone.

## Changes and contact

Material handling changes require an updated notice and a new review date before
deployment. Closed-Alpha support and privacy requests use the operator contact
provided with the invitation.
