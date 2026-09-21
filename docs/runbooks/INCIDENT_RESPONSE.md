# Privacy and security incident response

## Trigger

Open an incident for suspected content/credential logging, unauthorized data
access, incorrect provider routing, overdue deletion, exposed secret, or data
sent beyond the documented processor boundary.

## First hour

1. Assign an incident lead and start a UTC timeline.
2. Contain without destroying evidence: disable the affected function, route,
   credential, or invite surface; rotate a credential if exposure is plausible.
3. Preserve content-free evidence: deployment IDs, request IDs, internal UUIDs,
   timestamps, error codes, affected row counts, and provider request IDs.
4. Do not copy note content, Telegram file URLs, tokens, raw payloads, or database
   dumps into chat, tickets, or general logs.
5. Determine whether processing must be paused for all users.

## Assessment

Record what happened, time range, systems/providers involved, categories and
approximate count of affected people/data, whether data was merely exposed or
actually accessed, and whether deletion or retention commitments were missed.
Consult applicable legal/privacy counsel for notification duties and deadlines;
this runbook does not invent a universal notification window.

## Recovery

1. Fix the cause and add a regression test or invariant.
2. Validate the fix in development with synthetic data.
3. Reconcile affected deletion requests and provider requests.
4. Deploy through the normal approval gate and monitor content-free signals.
5. Notify affected users and authorities when required, using confirmed facts
   and naming third-party boundaries accurately.

## Closure

Complete a blameless review with root cause, control failure, impact, timeline,
corrective actions, owners, deadlines, and evidence of completion. Update the
privacy notice, terms, threat model, and deletion runbook when the incident
reveals an inaccurate promise or missing control.
