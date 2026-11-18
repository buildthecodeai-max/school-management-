# Architecture

This document explains the load-bearing decisions. It is deliberately short;
the code is the detail. Last reviewed 2026-11-18. For what is built, what is
missing and what cannot yet be reached from a screen, the source of truth is
[REQUIREMENTS_TRACEABILITY.md](REQUIREMENTS_TRACEABILITY.md), not this file.

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

**Default roles.** A school's roles (Organization Owner, Campus Administrator,
Admissions Officer, Finance Officer, Teacher, Parent / Guardian) are created per
tenant by a platform operator (`ensureSchoolRoles`); the demo seed also adds a
Safeguarding Officer. The owner holds `*`. Health and safeguarding permissions
are deliberately absent from every role except the Safeguarding Officer (and the
owner's wildcard). Users and role assignments are managed by platform operators
on the tenant page; there is no school-owner-facing user or role editor yet.
Some permissions are organization-wide only by design (`integrations.manage`,
`student.merge`) and are checked with `can()`, not `canForCampus()`.

## 4. Data model conventions (PRD §14)

- **Immutable ids**: `cuid()` primary keys.
- **Shared identity**: `Person` is the one identity record; `Student`,
  `Guardian`, `Staff` are contextual profiles that reference it, avoiding
  duplicate people across roles/campuses.
- **Effective dating**: `Enrollment` (and future assignments) carry
  `startDate`/`endDate` and status, so historical reports use the assignment
  valid at the reporting date.
- **Append-only finance/results**: corrections happen via credit notes, refunds
  and new result versions (`ResultVersion`, `TimetableVersion`), never destructive
  edits.
- **Soft delete**: `deletedAt` where retention/audit require it (for example the
  person row of a merged-away student).
- **Money** is stored as integer minor units (cents) everywhere; formatting lives
  in `lib/money.ts`. Fee and payment numbering is sequential per tenant with a
  configurable prefix (`lib/settings.ts`).
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
   - **Throttle** — for non-mandatory, non-urgent notices, a recipient who has
     already had `notifications.throttleMax` successful deliveries on that
     channel within `notifications.throttleWindowMinutes` (organization
     settings; default 10 per 60 minutes, 0 disables) is skipped with a logged
     reason. In-app delivery is unaffected.
   - **Address resolution** — no email/phone on file skips the channel.
   - **Provider send** — the resolved `NotificationProvider` attempts
     delivery. Today every provider is a console-log stand-in; real SES/Twilio/FCM
     implementations are a drop-in replacement. A `SENSITIVE` message never puts
     its body on an external channel: only a generic "please log in" prompt is
     sent, and the full text stays in the in-app inbox (NTF-007).
4. Every attempt — sent, failed, or skipped, with its reason — is written as a
   `DeliveryAttempt` row: provider, recipient, channel, status, correlation id,
   timestamp (NTF-003). Nothing is overwritten; a **retry** appends a new
   attempt rather than mutating the failed one, so the full history survives.

**Providers** (`lib/notification-providers.ts`) implement one interface —
`{ channel, name, send(input) }` — so swapping the console stand-ins for real
SES/Twilio/FCM SDKs touches only that file, not the dispatch logic or any
call site.

**Templates and digest.** `notifyFromTemplate(code, variables, …)` renders a
`MessageTemplate` (`{{variable}}` placeholders) and then calls `notify()`.
Templates exist once per language (unique on tenant + code + locale); the
recipient's language is tried first, then the organization's, then English
(`lib/locales.ts::pickByLocale`). A daily digest of unread messages is produced by
the cron endpoint `/api/internal/cron/digest-notifications` (§8).

**Operational surfaces**: `/portal/notifications` (permission
`notifications.operate`) is the delivery log — filterable by status, with a
retry action for failed attempts — and `/portal/notifications/templates` manages
templates. `/portal/preferences` is self-service: any signed-in user manages their
own channel opt-outs, quiet-hours window and language.

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

**Inbound payment-gateway webhook** (`/api/webhooks/payments/[tenantSlug]`,
`lib/gateway-webhooks.ts`) is the inbound counterpart. It has no session or API
key; it is authenticated only by an HMAC of `"<timestamp>.<raw body>"` with the
school's own secret, sent as `X-Scholarum-Signature: t=<unix>,v1=<hex>` (5-minute
tolerance, constant-time compare; note this differs from the outbound header).
An unknown school, an inactive configuration and a bad signature all return the
same `401`. Each event is recorded once per `(tenant, provider, eventId)`
(`GatewayWebhookEvent`) and a payment is additionally de-duplicated on its
gateway reference, so provider retries never double-post. `payment.succeeded`
posts a `GATEWAY` receipt and allocates it (the named invoice first, then oldest
due); `payment.refunded` and `payment.disputed` are logged for human review and
never reversed automatically, because refunds need approval (IAM-003). The event
shape is provider-neutral; a real provider needs a small adapter.

**Scheduled jobs** (`/api/internal/cron/*`) are `GET` handlers guarded by
`Authorization: Bearer $CRON_SECRET` (`lib/cron-auth.ts`), which fails closed
(`503`) when `CRON_SECRET` is unset. Nothing in the application schedules them;
an external scheduler must call them.

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

## 9. Authentication and sessions

Sessions are rows in `Session`. The browser holds only a random token in an
`httpOnly`, `SameSite=Lax` cookie (`Secure` in production) that expires after
seven days (`lib/auth.ts`); there is no signing key to manage. Passwords are
hashed with bcrypt. TOTP two-factor authentication can be enrolled at
`/portal/settings/security`, but **the sign-in flow does not yet ask for the code**
(`loginAction` creates the session straight after the password check), so it gives
no protection today; this is tracked as P0-8 in `FEATURE_GAP_AUDIT.md`.

- **Login throttling** (`lib/login-rate-limit.ts`): 10 attempts per 15 minutes per
  identifier, in memory.
- **Breached passwords** (`lib/hibp.ts`): at sign-in the password is checked
  against Have I Been Pwned with k-anonymity (only the first five characters of
  the SHA-1 leave the server). The check fails open on timeout or error and sets a
  cookie that makes the portal show a change-password banner.
- **Password reset** (`login/forgot-password`, `login/reset-password`): a random
  single-use token with a one-hour life is stored on the user row. The response is
  identical whether or not the email is registered, and every session of that user
  is deleted when the password changes.
- **Impersonation**: a platform operator's session is swapped for the target's
  while the operator's own is kept in a second cookie; a banner is always shown and
  start and end are audited against the real actor.
- **Suspension** is enforced centrally in `lib/rbac.ts` (`blockedBySuspension`),
  which `can`, `canForCampus` and the guards all consult; platform staff are exempt
  and data is never deleted.

## 10. Audit trail

`AuditEvent` rows are append-only and hash-chained, one chain per tenant plus a
shared `__platform__` chain. Each row carries `chainKey`, a per-chain `seq`,
`prevHash` and `entryHash = sha256(canonicalPayload || prevHash)`. `audit()` appends
inside a Serializable transaction and retries on conflict, so concurrent writers
cannot fork a chain. `verifyAuditChain()` recomputes a chain and detects edits,
reordering and deletion; `npm run audit:verify` checks every chain and
`npm run audit:backfill` chains older rows. This makes tampering evident but does
not prevent it: the application never updates or deletes audit rows, yet there is
no database-level trigger or grant that enforces that.

## 11. Localization

Languages are listed in `lib/locales.ts`. UI text is keyed by its English source
string and translated by `translator(locale)` (`lib/i18n.ts`, dictionaries in
`i18n-pages.ts` and `i18n-dashboards.ts`); a missing key or locale returns the
English text, so screens are translated one at a time, and `{placeholders}` are
substituted in either case. The locale is the user's own choice (`User.locale`),
else the organization's (`Tenant.locale`), else English. Arabic switches the layout
to right-to-left. Translations are machine-drafted and need native review.

## 12. Destructive operations

Anything that deletes or rewrites rows follows one pattern (see
`lib/student-merge.ts`): a dry-run preview of what will move and what blocks; an
organization-wide-only permission; blockers for cases that cannot be resolved
automatically (health data is never discarded); unique-key clashes resolved in
favour of the surviving row; a check inside the transaction that nothing is still
attached before a cascading delete; a soft delete of the identity row; and an audit
entry that carries the reason and the counts. Tenant deletion (TEN-006) follows the
same spirit: the tenant must be closed, a data export recorded as evidence, the slug
typed to confirm, and the deletion audited before it runs.

## 13. Deployment posture

Local dev uses Docker Postgres (`docker-compose.yml`, host port 5433). In
development the schema is applied with `prisma db push`. The checked-in
`prisma/migrations` stop at 11 September 2026 and no longer match
`schema.prisma`, so **a fresh baseline migration is required before a production
deployment**. The variables the code reads are `DATABASE_URL`, `CRON_SECRET`,
`NEXT_PUBLIC_BASE_URL` and `NODE_ENV`.

State that is per process today: the API and login rate limiters. Outbound calls
the application makes by itself: webhook deliveries and the breached-password
check. External schedulers are needed for the two cron endpoints, and real
notification providers must replace the console stand-ins.

The later local/offline editions (DEP/SYN/LIC) are additive: signed containers,
licence verification, an outbox + sync layer, and conflict queues — none of which
require changing the domain model.

## 14. Known structural gaps

As of 2026-11-18, several workflows exist as server logic with no screen that
calls them, a few links point at pages that were never built, and many kinds of
setup data (academic years, grades, sections, subjects, positions, routes,
inventory items and more) can only be created by the seed. A school provisioned
through the platform console is therefore an empty shell. The full list is the
"Reachability gaps" section of [REQUIREMENTS_TRACEABILITY.md](REQUIREMENTS_TRACEABILITY.md).
The working rule going forward: a feature is not done until a screen calls its
action.
