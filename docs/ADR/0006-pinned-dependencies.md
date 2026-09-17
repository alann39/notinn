# ADR 0006 — Pinned dependencies and the local toolchain

**Status:** Accepted, Phase 0
**Date:** 2026-09-16

## Context

This machine has no Docker and no WSL, so `supabase start` cannot run: the local
Supabase stack is a set of containers. The Supabase CLI and Deno also were not
installed globally, and installing them would have changed machine-wide state for
a project that may be one of several.

Meanwhile the project needs a Deno runtime for the Edge Function and the tests, a
Supabase CLI for migrations and deployment, and a guarantee that the code that
runs in production is the code that was tested.

## Decision

### 1. Deno and the Supabase CLI are local npm devDependencies

```json
"devDependencies": {
  "deno": "…",
  "supabase": "…"
}
```

Both are invoked through `npx` — `npx deno test …`, `npx supabase migration list`.
Nothing is installed globally, nothing is added to `PATH`, and removing the
dependency removes the tool. The npm packages are the official binaries, so the
version in `package.json` is the version in use.

This also pins the toolchain per-project. A global Deno would upgrade underneath
the project whenever the machine's global state changed.

### 2. Runtime dependencies are pinned exactly, not by range

```json
"imports": {
  "@std/assert": "jsr:@std/assert@^1.0.0",
  "zod": "npm:zod@4.6.5",
  "@supabase/supabase-js": "npm:@supabase/supabase-js@2.116.0"
}
```

Zero is an exact version; no caret, no tilde. The two libraries that handle
validation, transport and credentials are pinned to a build that has been
executed against the test suite, and an upgrade is a deliberate commit that
re-runs it. `@std/assert` is a test-only dependency and takes a caret, because a
test assertion library cannot affect production behaviour.

An Edge Function is deployed as source and resolved at boot. A floating range
means the code running in production can change without a commit, a review or a
test run — which is the failure this pinning exists to prevent.

### 3. `deno.lock` is git-ignored

The lockfile is generated, platform-specific and large. It corresponds exactly to
the pins above, so it adds no information the manifest does not already carry.
This would be the wrong call for a floating range; with exact pins it is not a
trade-off.

### 4. No Docker means no local stack, and that shapes the test suite

The consequence is architectural rather than administrative. It is the reason the
suite is layered the way it is:

- **Unit, contract and security suites need no database.** They run anywhere,
  including on this machine, and cover almost all of Phase 0 —
  `deno task test`.
- **The integration suite needs a real database.** It is _ignored_, not failed,
  when no target is configured, and it is the only suite that proves the
  guarantees the database owns: `update_id` deduplication, the state machine,
  row level security.
- **The e2e suite needs a deployment.** It is ignored unless explicitly pointed
  at one.

A developer without Docker can run everything except the database-backed layer and
see it pass, which is the correct behaviour. What must not happen is the
database-backed layer becoming _unrunnable_, and the staging-project target in
[ADR 0005](0005-access-model.md)'s sibling — `scripts/lib/test-target.ts` — is what
prevents that.

### 5. Local configuration is committed; deployed configuration is not

`supabase/config.toml` holds only settings that differ from the CLI defaults or
that carry a decision worth recording, and it is committed because
`verify_jwt = false` is a security-relevant decision that belongs in review.

The deployed project takes its configuration from the dashboard, so the two can
drift. `deno task verify-env` and the deployment checklist in
[IMPLEMENTATION_STATUS.md](../IMPLEMENTATION_STATUS.md) exist to catch the settings
that matter — principally that `verify_jwt` is still off and that the webhook
secret is registered.

## Consequences

- `npm install` is a prerequisite for running anything, which is a real cost, and
  it is stated in the README as the first step.
- Nothing about the toolchain is machine-global, so the project is reproducible on
  a clean checkout and does not conflict with another project's Deno version.
- Version upgrades are visible in review as a change to `package.json` or
  `deno.json` rather than as a silent environmental difference.
- A future contributor with Docker available can run `supabase start` and get a
  local stack with no change to this repository — `config.toml` is already written
  for it. The Docker limitation constrained _this_ setup, not the project.

## Alternatives considered

**Install Deno and the Supabase CLI globally.** Rejected: it changes machine state
for one project's benefit, and a global version cannot be pinned per-project.

**Use a floating range for `zod` and `supabase-js`.** Rejected: an Edge Function
resolves its imports at boot, so a range lets production change without a commit.

**Commit `deno.lock` and use ranges.** Rejected: with exact pins the lockfile
carries no additional information, and a committed lockfile for a JSR+npm mix is a
large, churny file to review.

**Skip the integration layer, since it cannot run here.** Rejected: deduplication,
the state machine and RLS are database guarantees, and a Phase 0 that cannot
demonstrate them has not demonstrated Phase 0. The staging-project target makes
them runnable without Docker.
