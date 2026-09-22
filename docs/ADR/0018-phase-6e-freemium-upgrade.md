# ADR 0018: freemium upgrade mechanics

- Status: accepted
- Date: 2026-09-22

## Decision

Notinn gains user-facing plan upgrade display and operator-initiated plan
management. A `/upgrade` command shows the current plan, Pro plan benefits,
and instructions to contact an operator. The `alpha-admin` script gains a
`set-plan` subcommand for operator plan changes.

Plan metadata (price, features, display order) is stored in the `plans` table
as database-owned configuration. A `plan_changes` audit log records every
transition with the actor and reason. Plan changes go through a single
`change_user_plan` RPC that validates the target plan exists and is active.

No payment provider is integrated at this stage. Upgrades are
operator-initiated and will be augmented with automated billing when a
payment provider is selected.

## Why

The closed alpha validated that the quota and plan system works. Before
opening to a wider audience, users need visibility into what Pro offers and
operators need a clean way to assign plans without direct database access.
The audit log provides accountability for plan transitions and is a
prerequisite for any future billing reconciliation.

## Consequences

- The `/upgrade` command is informational only — it tells users to contact
  an operator rather than initiating a payment flow.
- `set-plan` is gated behind the same production guard and confirmation
  prompt as other `alpha-admin` subcommands.
- The `plan_changes` table follows the same RLS posture as every other
  table: RLS enabled, zero policies, service-role-only access.
- Plan metadata changes (price, features) require only a database update,
  not a code deployment.
- The `NavigationAction` type gains `"upgrade"`, extending the v2 callback
  codec. Existing callbacks are unaffected.
