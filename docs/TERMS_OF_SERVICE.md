# Notinn Terms of Service

Last reviewed: 2026-10-02.

## 1. Acceptance and Eligibility

Notinn is a note-capture and knowledge-management service accessible via Telegram and the web dashboard. By creating an account or using Notinn, you agree to these Terms of Service and our [Privacy Policy](PRIVACY_NOTICE.md). You must be at least 18 years of age (or the age of majority in your jurisdiction) to use the service.

## 2. Service Plans and Usage Limits

Notinn provides tiered service plans to accommodate personal and professional capture needs:

- **Free Starter Plan**: Includes core note ingestion from Telegram and the web dashboard, standard generation quotas, audio processing for voice notes up to 30 minutes in duration, and clean Markdown and PDF note export.
- **Pro Plan**: Includes expanded monthly allowances (1,000 notes per month, 300 regenerations and semantic search queries), extended voice note processing up to 2 hours per audio file, priority processing queues, and permanent dashboard access.
- **Universal Audio Limit (45 MB)**: Due to infrastructure and storage platform constraints, all web audio file uploads across both Free and Pro tiers are subject to a strict maximum file size of **45 MB**. Audio files exceeding 45 MB must be compressed or trimmed prior to upload. Document uploads (PDF, DOCX, TXT) and images are subject to a maximum size of 14 MB.

Plan quotas and admission limits reset on a calendar basis and are enforced atomically at the database level to ensure service stability.

## 3. Your Content and Full Ownership

You retain 100% full intellectual property ownership, copyright, and title to all source content, voice recordings, transcripts, files, and structured notes processed by Notinn.

Notinn claims no proprietary interest in your content. You grant Notinn only the narrow, non-exclusive, worldwide, royalty-free licence strictly required to ingest, store, transcribe, extract, and format your notes solely for delivery back to you and your authorized devices.

## 4. Strict Data Privacy and Zero AI Model Training

We treat your notes, transcripts, audio recordings, and documents as confidential personal data:

- **No AI Training on User Notes**: Notinn does **not** use, share, or sell your notes, audio files, documents, or transcripts to train, fine-tune, or evaluate foundational artificial intelligence or machine learning models.
- **Enterprise Provider Terms**: Our underlying AI providers (Google Gemini API and configured fallbacks) operate under enterprise commercial agreements where customer inputs and outputs are not used to improve or train foundational models.
- **In-Memory Processing**: Raw media files are held transiently in memory for processing and are zero-filled immediately after transcript and note generation.

Detailed data practices are set out in our [Privacy Policy](PRIVACY_NOTICE.md).

## 5. Fair Use and Security Rules

You agree to use Notinn responsibly and lawfully. You must not:

- Submit unlawful, defamatory, infringing, or malicious content, including malware, unauthorized credentials, or exploit payloads.
- Bypass, probe, or attempt to circumvent authentication controls, cryptographic signatures, rate limits, or quota reservations.
- Use automated scripts, scrapers, or bots to flood the webhook or abuse API endpoints.
- Interfere with or disrupt the integrity or performance of Notinn infrastructure, databases, or service providers.

We reserve the right to throttle, restrict, or suspend accounts that engage in automated abuse or violate fair use policies.

## 6. AI Output Limitations and Professional Disclaimer

Notinn utilizes generative artificial intelligence to synthesize, summarize, and structure notes. While we strive for high precision:

- AI-generated outputs, transcripts, and action items may contain errors, omissions, or hallucinations. You are responsible for reviewing and verifying all generated content.
- Notinn is a productivity and knowledge organization tool. It does **not** provide legal, medical, financial, or safety-critical advice. Do not rely on Notinn as a substitute for professional counsel.

## 7. Third-Party Services and Sub-processors

Operation of Notinn depends on integrated third-party platforms:
- **Telegram**: Provides the messaging channel and cloud delivery mechanism for Telegram bot interactions.
- **Supabase**: Provides managed PostgreSQL database, authentication, and encrypted storage.
- **Google Gemini API**: Provides multimodal understanding, audio transcription, and structured text generation under enterprise non-training terms.
- **OpenRouter**: Serves as a transient, redundant fallback for model routing during upstream provider incidents.

Each provider processes data under its respective enterprise terms and privacy controls, as described in our [Privacy Policy](PRIVACY_NOTICE.md).

## 8. Account Deletion and Cancellation

You may stop using Notinn and delete your account at any time:
- In Telegram: Send `/delete_account`, review the confirmation warning, and send `/delete_account confirm`.
- In Web Dashboard: Request deletion via the Account Settings panel.

A **seven-day cancellation grace period** applies, during which you may revoke the deletion request with `/cancel_deletion`. Once the grace window expires, an automated database task permanently and irreversibly purges your notes, generated outputs, embeddings, custom templates, and credentials. Telegram copies must be deleted directly within your Telegram client.

## 9. Disclaimer of Warranties

To the maximum extent permitted under applicable law, Notinn is provided on an **"as is"** and **"as available"** basis, without warranties of any kind, whether express, implied, statutory, or otherwise, including implied warranties of merchantability, fitness for a particular purpose, and non-infringement. We do not warrant that service availability will be uninterrupted or error-free.

## 10. Limitation of Liability

To the extent permitted by law, Notinn, its operators, and contributors shall not be liable for any indirect, incidental, special, consequential, or punitive damages, including loss of data, profits, or goodwill, arising out of or in connection with your access to or use of the service.

## 11. Modifications to Terms

We may update these Terms of Service from time time. When changes occur, we will update the "Last reviewed" date at the top of this document. For material changes, reasonable advance notice will be provided via the Telegram bot or web dashboard. Continued use of Notinn after updated terms take effect constitutes acceptance of those terms.

## 12. Contact and Inquiries

If you have questions, concerns, or requests regarding these Terms of Service, please contact the Notinn team via the official Telegram bot ([@NotinnBot](https://t.me/NotinnBot)) or through your registered dashboard support channel.
