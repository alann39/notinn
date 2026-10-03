# Notinn Privacy Policy

Last reviewed: 2026-10-02.

This Privacy Policy explains how Notinn ("we", "our", or "the service") collects, handles, stores, and protects personal information, Telegram messages, audio recordings, documents, and generated notes across our Telegram bot and web dashboard.

## 1. Core Privacy Commitments

- **User Notes Are Strictly Private**: Your notes, thoughts, and documents belong to you. We do not inspect, monetize, or disclose your personal notes.
- **Zero AI Model Training on User Notes**: We do **not** use your notes, audio files, documents, or transcripts to train foundational artificial intelligence or machine learning models. User data is never fed into training corpuses.
- **In-Memory Media Processing**: Raw voice notes, audio files, screenshots, and documents are processed in memory and zero-filled immediately after note generation. We do not retain raw audio or document files on persistent storage.
- **Privacy-by-Design Logging**: Our server logger enforces an allowlist schema that drops message bodies, transcripts, filenames, URLs, tokens, and Telegram handles by construction.

## 2. Information Notinn Collects and Receives

To operate the Telegram bot and web dashboard, Notinn receives:

- **Telegram Identity**: User ID, username/handle, display name, and private chat identifier needed to authenticate your account and route your notes.
- **Submitted Content**: Text messages, forwarded items, audio files, voice notes, screenshots, photos, and documents (PDF, DOCX, TXT, Markdown) that you explicitly send to the bot or upload through the web dashboard.
- **Operational Metrics**: Content-free system telemetry, including operation counts, current subscription plan (Free vs Pro), and quota usage buckets. These counters contain no user text, transcripts, or personal data.

## 3. Plan Quotas and Upload Limits

Notinn manages ingestion volume through clear plan boundaries:

- **Free Starter Plan**: Standard generation quotas, voice note processing up to 30 minutes per recording, and full Markdown/PDF export capabilities.
- **Pro Plan**: High-volume capture (1,000 notes/month, 300 regenerations and semantic search queries), extended audio processing up to 2 hours per file, priority processing queues, and permanent dashboard access.
- **Universal Audio Upload Cap (45 MB)**: All web audio uploads across all plans are subject to an absolute maximum limit of **45 MB** due to platform storage architecture. Files exceeding 45 MB cannot be accepted. Document uploads (PDF, DOCX, TXT) and images are capped at 14 MB.

## 4. Data Retention Schedule

| Data Category | Retention Period | Handling and Storage |
| --- | --- | --- |
| Raw audio, image, and document bytes | Transient in-memory only | Processed in memory during transcription; zero-filled and released immediately after processing attempt. Never saved to persistent storage. |
| Direct input text and Telegram file handles | Ephemeral (processing duration) | Scrubbed from processing job records once note generation completes or the job terminates. |
| Generated notes, summaries, and action items | Until deleted by user | Encrypted at rest in PostgreSQL 17; accessible exclusively by the authenticated user. |
| Vector embeddings (`note_embeddings`) | Until note or account deletion | 768-dimensional mathematical representations used for semantic search; purged immediately when the parent note is deleted. |
| Content-free usage events | Retained for billing and security | Numerical counters linked only to an internal UUID; contains zero note text, titles, or transcripts. |
| Application and error logs | Retained temporarily for operations | Strict allowlist logger strips all note text, transcripts, credentials, tokens, filenames, and Telegram usernames. |

## 5. Public Website Video and Static Assets

The public landing page may request a self-hosted decorative video from the Notinn website when playback starts. This media request transmits no user credentials, Telegram identifiers, or note content. When JavaScript is disabled, reduced motion is requested, or playback is unsupported, the page displays a static background. The browser does not contact external third-party video hosts.

## 6. Telegram Infrastructure Separation

Notinn operates as an authorized bot within Telegram's ecosystem. Telegram independently stores cloud-chat history under its own terms and privacy policy (<https://telegram.org/privacy>).

Deleting a note or account in Notinn removes it from Notinn's databases, but does **not** erase the message from your personal Telegram chat history. You can delete copies within your Telegram app at any time using Telegram's native deletion features.

## 7. AI Providers and Sub-processors

To generate structured notes, transcribe audio, and power semantic search, Notinn interfaces with trusted infrastructure providers:

- **Google Gemini API**: Used for audio transcription, vision/OCR, document extraction, and structured note synthesis. Notinn operates exclusively through commercial/paid enterprise API tiers. Under Google's enterprise terms, API inputs and outputs are **not used to train Google models** and are not subject to human review.
- **OpenRouter**: Serves as a transient fallback route during upstream provider downtime. OpenRouter does not train models on customer inputs or outputs.
- **Supabase**: Provides managed PostgreSQL 17 database storage, Row-Level Security (RLS), and authentication under SOC-2 compliant data protection standards.

Deleting your Notinn account prevents future provider calls; data previously processed through third-party APIs was ephemeral and governed by non-training enterprise terms.

Official provider policy references:
- Google Gemini API Terms: <https://ai.google.dev/gemini-api/terms>
- OpenRouter Privacy Policy: <https://openrouter.ai/privacy>
- Telegram Privacy Policy: <https://telegram.org/privacy>

## 8. Account Deletion and Permanent Data Purge

You maintain complete control over your data and can trigger permanent deletion at any time:

1. **In Telegram**: Send `/delete_account`, review the confirmation prompt, and send `/delete_account confirm`.
2. **In Web Dashboard**: Navigate to Settings to review account lifecycle status and follow the instructions to trigger `/delete_account` via Telegram.

Upon confirmation:
- New message processing is immediately blocked and any pending jobs are cancelled.
- A **seven-day cancellation window** begins. You may restore your account at any time during these seven days by sending `/cancel_deletion`.
- After seven days, an automated database worker permanently purges all notes, summaries, transcripts, vector embeddings, custom templates, and credentials.
- Telegram identity handles are unlinked from the retained content-free audit UUID. Once finalized, deletion is permanent and cannot be undone.

## 9. Your Rights and Data Export

Under applicable data protection laws (including GDPR and CCPA), you have the right to:
- **Access and Portability**: View all saved notes in your web dashboard and export them individually or in bulk in clean Markdown or PDF format.
- **Rectification**: Edit, regenerate, or retitle your notes at any time.
- **Erasure**: Permanently delete individual notes or your entire account with all associated embeddings.
- **Opt-out of Model Training**: Model training is disabled by default for all users and cannot be opted into.

## 10. Policy Updates and Contact

We may periodically revise this Privacy Policy to reflect feature additions or regulatory requirements. Any material changes will be accompanied by an updated "Last reviewed" date and prominent notification in the Telegram bot or web dashboard.

For privacy-related questions, data subject requests, or security inquiries, please contact us via Telegram at [@NotinnBot](https://t.me/NotinnBot) or through your dashboard account settings.
