# Architecture

This document explains the load-bearing decisions. It is deliberately short;
the code is the detail.

## 1. One governed codebase (PRD §15.4)

There are no per-customer forks. Domain logic, the Prisma schema, authorization
rules, and release artifacts all come from this repository. Environment-specific
behavior (cloud vs. local/offline later) is intended to sit behind adapters
(storage, messaging, identity, licensing) rather than divergent forks. Sensitive
logic — authorization, fee calculation, grading, sync control, licence
enforcement — stays server-side; the browser holds presentation only.

## 2. Tenancy & isolation (TEN-001/002)

- Every customer-owned table carries a non-null `tenantId`. Campus-scoped tables
  also carry `campusId`.
- Tenant context is derived from the **authenticated session**, never from a
  client-supplied tenant id.
- All scoped reads/writes funnel through `src/lib/scope.ts::tenantCampusWhere`,
  which returns a Prisma `where` fragment combining tenant id **and** the campus
  set the user's permission allows. This makes isolation uniform and auditable
  instead of ad hoc per query.
- Record detail pages re-check campus scope and return **404** (not 403) for
  out-of-scope records, so existence is not revealed.

## 3. Authorization model (IAM)

Three concepts compose:

1. **Permissions** — atomic, documented keys in `src/lib/permissions.ts`
   (e.g. `student.read`, `attendance.write`). `*` is a wildcard for owner /
   platform roles.
2. **Roles** — named bundles of permission keys (`Role.permissions: string[]`).
   Roles may be system-wide (`tenantId = null`) or tenant-defined.
3. **RoleAssignment** — grants a role to a user at a **scope**: `PLATFORM`,
   `ORG` (tenant-wide), or `CAMPUS` (a specific campus). A user may hold several
   assignments, so they can be, say, a teacher on Campus A and an admin on
   Campus B (IAM-005).

`src/lib/rbac.ts::resolveAuthz` collapses a user's assignments into an
`AuthzContext` (org-wide permission set + per-campus permission sets). Helpers:

- `can(ctx, perm)` — held org-wide?
- `canForCampus(ctx, perm, campusId)` — held for that campus (org-wide counts)?
- `campusScopeFor(ctx, perm)` — the campus id list, or `null` meaning all
  campuses in the tenant.

Guards `requireUser`, `requirePermission`, and `assertPermission` protect pages
and server actions. **Deny by default**: a page requires an explicit permission;
mutations re-check on the server (IAM-002) — the UI never gates security.

## 4. Data model conventions (PRD §14)

- **Immutable ids**: `cuid()` primary keys.
- **Shared identity**: `Person` is the one identity record; `Student`,
  `Guardian`, `Staff` are contextual profiles that reference it, avoiding
  duplicate people across roles/campuses.
- **Effective dating**: `Enrollment` (and future assignments) carry
  `startDate`/`endDate` and status, so historical reports use the assignment
  valid at the reporting date.
- **Append-only finance/results** (planned for FEE/EXM): corrections happen via
  reversals and new versions, never destructive edits.
- **Soft delete**: `deletedAt` where retention/audit require it.
- **Audit**: `AuditEvent` is append-only and records actor, action, tenant,
  scope, target, outcome, correlation id, and metadata.

## 5. Attendance flow (ATT)

Registers are **day-keyed**: `AttendanceSession` is unique on
`(sectionId, date, period)` with `date` normalized to midnight (`lib/dates.ts`)
and `period = "DAY"` for daily attendance. This makes submission **idempotent** —
re-submitting upserts the same session and records rather than duplicating.

State machine: `DRAFT → SUBMITTED → LOCKED`. `attendance.write` can edit draft/
submitted; a `LOCKED` register needs `attendance.amend` (ATT-004).

On **submit**, the action resolves guardians of students marked with a
`notifyGuardian` code and calls the central notification service (§6) once per
student with an event-scoped `dedupeKey`, so resubmitting the same mark never
re-alerts a guardian (ATT-003).

## 6. Notification service (NTF)

Every domain event that reaches a person outside the actor — a guardian alert,
a fee invoice notice, an admissions welcome, a published report card — goes
through one function: `lib/notify.ts::notify()`. No route or action writes to
`Message` directly. This uniformity is what makes dedup, preferences, quiet
hours and delivery logging apply everywhere instead of being reimplemented per
feature.

**Dispatch order** for a single `notify()` call:

1. **Dedup** — if a `dedupeKey` is given and a `Message` with that key already
   exists for the recipient, return immediately. No duplicate is created even
   if the caller runs twice (e.g. an idempotent resubmit).
2. **In-app delivery is mandatory** — a `Message` row (the inbox entry) is
   always created regardless of channel preferences or quiet hours.
3. **External channels** (`EMAIL`/`SMS`/`PUSH`, category-dependent) are each
   evaluated independently:
   - **Preference check** — a `NotificationPreference` row with
     `enabled: false` skips the channel, *unless* the category is mandatory
     (`SECURITY`, `BILLING` — these "follow lawful policy" per NTF-004 and
     cannot be opted out of). Absence of a row means enabled (opt-out model).
   - **Quiet hours** — a `NotificationSetting` window suppresses external
     delivery unless the caller marks the event `urgent`. In-app delivery is
     unaffected.
   - **Address resolution** — no email/phone on file skips the channel.
   - **Provider send** — the resolved `NotificationProvider` (EMAIL → SES/
     Twilio/etc. in production, a console-log stand-in locally) attempts
     delivery.
4. Every attempt — sent, failed, or skipped, with its reason — is written as a
   `DeliveryAttempt` row: provider, recipient, channel, status, correlation id,
   timestamp (NTF-003). Nothing is overwritten; a **retry** appends a new
   attempt rather than mutating the failed one, so the full history survives.

**Providers** (`lib/notification-providers.ts`) implement one interface —
`{ channel, name, send(input) }` — so swapping the console stand-ins for real
SES/Twilio/FCM SDKs touches only that file, not the dispatch logic or any
call site.

**Operational surfaces**: `/portal/notifications` (permission
`notifications.operate`) is the delivery log — filterable by status, with a
retry action for failed attempts. `/portal/preferences` is self-service: any
signed-in user manages their own channel opt-outs and quiet-hours window.

## 7. Request lifecycle

Server Components read data directly through Prisma (already tenant-scoped).
Mutations use **Server Actions** (`actions.ts` files) that: authenticate →
authorize (server-side) → validate with Zod → write → audit → revalidate.
Everything above assumes a **browser session**. §8 covers the separate
authentication path for **programmatic** access.

## 8. Public API & webhooks (API)

`/api/v1/*` is a parallel, unauthenticated-by-session surface: Next.js Route
Handlers (`route.ts`), not Server Actions, authenticated by API key instead of
a cookie. Every handler follows the same three-line preamble —

```ts
const auth = await authenticate(request, "student.read"); // lib/api-request.ts
if (!auth.ok) return auth.response;
const { client, correlationId } = auth;
```

— which in one call verifies the `Authorization: Bearer <keyId>.<secret>`
credential (`lib/api-auth.ts`), enforces the per-client rate limit
(`lib/api-rate-limit.ts`), and checks the required scope, returning a typed
`client` (with `tenantId`) on success or the exact `NextResponse` to return on
failure. This keeps route handlers thin and the auth/rate-limit/scope
contract identical everywhere, the same way `requirePermission` keeps portal
pages thin.

**Idempotency** (`lib/api-idempotency.ts`) wraps mutating handlers: given an
`Idempotency-Key` header, the first request's response (status + body) is
cached against `(apiClientId, key)`; a replay with the same request hash
returns the cached response verbatim, and a replay with a *different* body
under the same key is rejected (409) rather than silently executing — that
combination almost always means a client bug, not an intentional retry.

**Response shape** is uniform (`lib/api-response.ts`): `{ data, meta }` on
success, `{ error: { code, message, correlationId } }` on failure, and lists
use cursor pagination (`nextCursor` from the last item's id) rather than
offset, so pages stay stable while rows are being written.

**Webhooks** (`lib/webhooks.ts`) are the outbound counterpart: domain actions
call `emitWebhook(tenantId, event, payload)` (currently `student.enrolled` from
admissions conversion and `attendance.session.submitted` from attendance
submit) after their own transaction commits. Every subscribed, active
`WebhookEndpoint` gets a POST signed `HMAC-SHA256(secret, rawBody)` in an
`X-Scholarum-Signature` header — the same verification contract as
Stripe/GitHub webhooks. Every attempt, success or failure, is logged as a
`WebhookDelivery`; a manual **redeliver** appends a new attempt (incrementing
`attempt`) rather than mutating the failed one, mirroring the notification
service's retry design in §6.

**Adding a new endpoint**: write the `route.ts`, call `authenticate()` first,
add the scope to `API_SCOPES` (`lib/api-scopes.ts`) if it's new, and add the
path to the hand-authored spec at `src/app/api/v1/openapi.json/route.ts` — the
three are not auto-synced, so a new endpoint without a spec entry is a review
finding, not a build error.

**Known simplifications**, called out rather than hidden: the rate limiter is
in-memory and per-process (fine for local/dev and for one cloud instance;
needs a shared store like Redis behind the same `checkRateLimit` signature for
a multi-instance deployment), and webhook retry is manual/on-demand rather
than automatic-with-backoff.

## 9. Deployment posture

Local dev uses Docker Postgres (`docker-compose.yml`, host port 5433). The same
schema/migrations target managed cloud Postgres in production. The later
local/offline editions (DEP/SYN/LIC) are additive: signed containers, licence
verification, an outbox + sync layer, and conflict queues — none of which
require changing the domain model.
