# through API

A Go service for the through frontend, with PostgreSQL-backed sessions, workspaces, account permissions, access history, and simulated browser handoffs. This replaces browser storage as the authority when the frontend runs with the API. It is a tested foundation for further enterprise engineering, **not a production identity or password-management service**.

All external identity, authenticator, vault, and agent/browser integrations are placeholders. The explicit development identity accepts `0000`. It does not verify ownership of an email address, enroll Google Authenticator, send email, retrieve a password, or operate an external browser. Use fictional accounts. The server refuses to start in production mode and refuses implicit demo authentication.

## Run locally

Requirements: Go 1.27.3+, PostgreSQL 14+ (validated with PostgreSQL 14.20), and the existing frontend export at `../out` if serving UI. The Go API is a separate runtime; static Sites hosting does not run it.

From the repository root, run `npm run build:service` to produce the export that uses this API. The default/static demo build does not contact the backend. Then enter `backend/`, create a dedicated development database, and set configuration in your shell:

```sh
export THROUGH_ENV=development
export THROUGH_DEMO_AUTH=true
export THROUGH_DATABASE_URL='postgres://through:through-local-only@127.0.0.1:5432/through?sslmode=disable'
export THROUGH_ALLOWED_ORIGINS='http://127.0.0.1:8080'
export THROUGH_STATIC_DIR=../out
export THROUGH_ADDR=127.0.0.1:8080
go run ./cmd/through
```

Restart Go after rebuilding `out/` so it opens the replacement export directory. Open `http://127.0.0.1:8080`. Keep the frontend and API on the same origin. Local frontend development may allow an additional exact loopback origin, such as `http://127.0.0.1:3000`; CORS is explicit, credentialed, and never wildcard. The frontend must then be configured to call that backend. Cookies are `HttpOnly; SameSite=Strict; Path=/` and become `Secure` when all allowed origins use HTTPS. Mixing HTTP and HTTPS origins is rejected so an HTTPS deployment can never silently receive insecure cookies.

Alternatively, run `npm run build:service` at the repository root, then run `docker compose up --build` from this directory. Compose binds only host loopback, does not publish PostgreSQL, drops capabilities, and uses a read-only application container. The included database password is deliberately a local sample, not a deployable secret. Docker was unavailable in the implementation environment; the container recipe is provided but has not been executed there. Pin reviewed image digests before release.

## Configuration

| Variable | Required / default | Purpose |
|---|---|---|
| `THROUGH_ENV` | Defaults to `production`, which fails closed | Only `development` or `test` is available while external adapters are placeholders |
| `THROUGH_DEMO_AUTH` | Must be exactly `true` | Explicit opt-in to fictional `0000` identity verification |
| `THROUGH_DATABASE_URL` | Required | PostgreSQL URL; use TLS and a restricted role outside local development |
| `THROUGH_ALLOWED_ORIGINS` | Required | Comma-separated exact HTTP(S) origins, no paths or wildcards; HTTP must be loopback |
| `THROUGH_ADDR` | `127.0.0.1:8080` | Listener; containers explicitly use `0.0.0.0:8080` |
| `THROUGH_STATIC_DIR` | Unset | Optional Next.js export directory; unset serves only API/health/metrics |
| `THROUGH_METRICS_TOKEN` | Unset, endpoint disabled | At least 32 random characters; send `Authorization: Bearer …` |
| `THROUGH_TEST_DATABASE_URL` | Tests only | Dedicated database in which tests create/drop isolated schemas |

Never put database credentials or metrics tokens in a committed file. `.env.example` is illustrative; the service reads environment variables, not dotenv files.

## API contract

All unsafe API requests require an exact allowed `Origin`. Authenticated mutations also require the session's `X-CSRF-Token`. All JSON bodies use `Content-Type: application/json`, a 16 KiB limit, one JSON object, and no unknown fields. Identifiers and enums are server-validated. The API never accepts a `password`, provider token, authenticator seed, recovery code, tenant ID, or caller-chosen role.

| Method / route | Body or query | Response |
|---|---|---|
| `GET /api/v1/runtime` | — | `{mode:"demo", backend:true, externalIntegrations:"placeholder"}` |
| `POST /api/v1/auth/challenges` | `{email}` | 201 `{challengeId, expiresAt, mode:"demo"}` |
| `POST /api/v1/auth/verify` | `{challengeId, code}` | Session DTO plus session cookie |
| `GET /api/v1/session` | — | Session DTO or 401 |
| `POST /api/v1/auth/logout` | No body | 204; revokes session and clears cookie |
| `POST /api/v1/auth/logout-others` | No body | `{revokedSessions:number}`; retains this session |
| `PATCH /api/v1/me` | `{displayName:string}` | Fresh Session DTO |
| `POST /api/v1/accounts` | `{service, origin, username, agents}`; legacy `{service, agent}` also accepted | Fresh Session DTO |
| `DELETE /api/v1/accounts/{id}` | No body | Fresh Session DTO |
| `PATCH /api/v1/accounts/{id}/agents` | `{agents:string[]}`; empty list revokes all agents | Fresh Session DTO |
| `PUT /api/v1/accounts/{id}/agents/{agent}` | No body; atomically allow this agent only | Fresh Session DTO |
| `DELETE /api/v1/accounts/{id}/agents/{agent}` | No body; atomically revoke this agent only | Fresh Session DTO |
| `POST /api/v1/accounts/{id}/credential` | No body; simulated credential metadata only | Fresh Session DTO |
| `PATCH /api/v1/workspace/access` | `{paused:boolean}` | Fresh Session DTO |
| `GET /api/v1/audit` | `limit=1..100`, optional `cursor`, optional `accountId` | `{events:[], nextCursor?}` |
| `POST /api/v1/handoffs` | `{accountId, agent, targetOrigin, browserSessionId, tabId}` plus `Idempotency-Key` | 201 new receipt or 200 exact replay |
| `GET /api/v1/handoffs/{id}` | — | Workspace-scoped receipt |

A Session DTO contains `{user:{id,email,displayName,role}, workspace:{id,name,accessPaused}, accounts:Account[], csrfToken, mode:"demo", expiresAt}`. Each account contains `{id,service,agent,agents,origin,username,createdAt,credentialUpdatedAt,credentialVersion,simulated:true}`. `agent` is a compatibility value containing the first permitted agent or an empty string; `agents` is always an array. Dates are RFC 3339 strings. Responses are `Cache-Control: no-store`. Sessions expire after 8 hours and are not silently extended.

Profile updates apply only to the authenticated user. Every workspace role may update its own optional display name: whitespace is trimmed, the limit is 80 Unicode code points, and control characters are rejected. Empty strings clear the name; missing/null fields and caller-selected user IDs, emails, or roles are rejected. Names persist across sessions and workspaces. A changed value records `profile.updated` in the active workspace without recording the old or new name; unchanged values do not create an audit event. Display names are presentation data, not verified identity.

Signing out other sessions deletes all other stored sessions belonging to the authenticated user, including sessions in other workspaces, while preserving the calling session and other users' sessions. The response counts deleted rows, including expired sessions still awaiting cleanup. A nonzero deletion records `session.others_signed_out` in the active workspace with no target identifiers. Current session/membership authority is revalidated transactionally; a per-user lock serializes concurrent cross-workspace requests. A new sign-in after the deletion can create a session normally. These controls apply to through sessions, not external provider sessions or browser-demo tabs.

The illustrative catalog includes GitHub, Linear, Notion, Figma, Slack, Google Workspace, Microsoft 365, Atlassian, Airtable, Asana, Vercel, Dropbox, HubSpot, and Salesforce. These choices are not installed or approved integrations. Their exact origins are defined in `internal/core/accounts.go`; a known platform label must use its listed origin. A custom platform may use another validated HTTPS origin and its own name. The name is trimmed, limited to 80 Unicode code points, and rejects control characters. Usernames are trimmed, limited to 254 Unicode code points, reject control characters, and preserve case. They are account labels, not evidence of verified identity.

Custom origins must contain a public-looking DNS hostname and use HTTPS. Hostnames are lowercased and a trailing slash is removed. User information, explicit ports (including 443), paths, query strings, fragments, IP literals, single-label names, and private/special-use suffixes such as `.localhost`, `.local`, `.internal`, `.test`, `.invalid`, `.home`, `.lan`, `.intranet`, and `.corp` are rejected. Validation never resolves DNS or fetches the URL; DNS syntax does not prove that an origin is safe, reachable, or owned by the user. The service never fetches icons. The UI may request icons directly from Google and gstatic, which are narrowly allowed by its image CSP.

Agent enums remain `Claude`, `Codex`, and `Cursor`. New connections require one to three unique agents; permission updates allow zero to three. Owners/admins can manage permissions, update demo credential metadata, and disconnect. These mutations revalidate current session and role under the workspace policy lock, with an audit entry in the same transaction. The individual UI controls use atomic PUT/DELETE operations that change only the selected agent against current server permissions. Two stale pages removing different agents cannot restore each other's revoked permissions. Repeating an already-applied allow/revoke, or the exact permission list, makes no change or audit entry. PATCH remains an explicit full-list replacement for compatibility and should not be used to implement individual agent controls. Removing every agent retains the connection but denies all handoffs; disconnect removes every permission and hides the connection from current session accounts.

New account identity is unique per workspace, normalized origin, and exact username, independently of agent permissions. Migration 004 preserves all older connection IDs, handoffs, and audit entries, including multiple legacy rows on the same platform. Legacy rows retain empty usernames and their original per-agent duplicate rule. Their credential metadata starts at version 1 with the original creation timestamp. Do not infer that a password was ever stored from this metadata.

`POST /accounts/{id}/credential` increments `credentialVersion` and updates `credentialUpdatedAt` for the simulated connection only. Any request body is rejected, including `{}` and password fields. This does not upload a credential, reset a provider password, or call a vault. Actual credential handling remains blocked on protected provider/browser integrations. Deploy the updated service with migration 004; an old service that inserts the pre-004 account shape is not compatible with the new required origin column.

A handoff receipt contains `{id,accountId,agent,targetOrigin,browserSessionId,tabId,status:"simulated",simulated:true,createdAt,expiresAt}`. A grant lasts 60 seconds and the placeholder consumes it immediately, exactly once per idempotency key. Every invocation rechecks the account's stored exact origin and current agent permission before resolving idempotency, including cached replays. Browser/session/tab identifiers are untrusted client bindings, not proof of platform permission. This boundary must become host-attested before real browser control is enabled. Replaying the same key with a different body returns 409; a pause, disconnected account, or removed agent overrides cached success. Receipts are historical evidence, not reusable access tokens. Current owners/admins may read receipts in their workspace; members/viewers cannot.

Audit events contain `{id,action,actorEmail,occurredAt,target?,accountId?}`. The cursor is the last integer event ID. All cursor reads remain workspace-scoped. `accountId` filters on the server and requires an account from the current workspace, including disconnected accounts; foreign or unknown IDs return 404. Members/viewers cannot read either scoped or workspace-wide logs. Events include sign-in/out, simulated account connection/revocation, pause/resume, `account.agents_updated`, `credential.updated`, and simulated handoff. Permission events record previous and new permitted agents in the target label. Targets contain non-secret platform/agent labels, never usernames, submitted URLs, or credentials. Audit actor email is intentional personal data. Events written before migration 004 remain immutable and have no account ID, so they appear only in workspace-wide activity.

Errors are `{error:{code,message},requestId}`. Common statuses are 400 invalid input, 401 missing/invalid/expired session or code, 403 policy/CSRF/origin denial, 404 inaccessible resource, 409 duplicate/replay conflict, 415 unsupported content type, and 429 retry later. Internal database errors and submitted values never reach error responses.

## Enforcement and concurrency

- Random opaque session tokens are stored only as SHA-256 digests. CSRF tokens are bound to their server-side session. Logout revokes that exact session; logout-others preserves the caller while revoking the user's other through sessions. Passwordless challenges are single-use and expire in five minutes.
- Verification attempts increment atomically under a row lock; five wrong attempts exhaust a challenge. Expired or consumed challenges return `challenge_expired`; the fifth failed attempt and subsequent attempts return `challenge_exhausted`, allowing the UI to restart the flow. Email challenge issuance is limited to five per fifteen minutes using PostgreSQL locks, shared across replicas. A bounded process-local IP limiter also applies; it ignores `X-Forwarded-For`. Deploy an explicitly configured trusted ingress limiter before scaling. Process-local limits alone are not a global abuse-control system.
- Each first-time email gets its own workspace. Matching company domains never auto-join tenants. Membership roles come from PostgreSQL. Only owners/admins may connect, revoke, pause, or request handoffs. There is no public role-escalation or membership management API.
- Mutations revalidate current session and role in the transaction. Workspace row locks serialize pause, revocation, and handoffs. Duplicate account constraints and workspace-scoped idempotency uniqueness live in PostgreSQL.
- Handoff policy checks precede cache replay. Browser origin, agent, account, browser session, tab, actor, and authenticated server session are bound to the request fingerprint. A second actor or new server session cannot replay a previous session’s request key. Twelve concurrent identical requests are tested to call the placeholder once. The simulated side effect and audit record commit together.
- All data operations scope by workspace. Composite foreign keys prevent cross-workspace account references. Cross-tenant access returns the same 404 as a missing resource.
- Audit insertion is transactional with the state change. Database triggers reject update, delete, and truncate. A database owner can still bypass protections; audit is not tamper-proof against administrators. Real releases need a separately controlled append-only audit sink and retention policy.
- Static export serving uses `os.Root` for path/symlink confinement, never lists directories, rejects dotfiles, and keeps API misses as JSON. Inline Next scripts receive content hashes in CSP; scripts do not use `unsafe-inline`. Inline styles are allowed for the existing static frontend.

## Operational behavior

`GET /healthz` is liveness; `GET /readyz` checks PostgreSQL with a two-second deadline. `/metrics` is unavailable unless a token is configured. Metrics expose only aggregate request/failure counters. Structured logs contain server-generated request IDs, methods, status, and duration, with no request body, query string, email, cookie, token, or submitted target. Logs cannot yet supply full tracing, SLOs, or production incident coverage.

The HTTP server has header/read/write/idle limits and a bounded header size. API work has a ten-second context deadline, PostgreSQL statements have timeouts, and the pool caps at twenty connections. SIGINT/SIGTERM drains for ten seconds. Expired sessions and old challenges are removed every fifteen minutes; audit and account history are retained. Cleanup is safe for multiple replicas. Production retention/deletion policy remains a release decision.

Versioned SQL migrations are embedded, serialized by a PostgreSQL advisory lock, and committed per migration. Startup applies pending migrations. This developer convenience requires schema privileges; before production, split migrations into a controlled release job and run the API as a least-privilege role. Do not edit applied migrations; add a new version. Back up first, test restoration, and review migration lock duration before any release. There is no automatic destructive down migration.

## Verification

```sh
make check
# Required for database, authorization, race, and HTTP integration coverage:
export THROUGH_TEST_DATABASE_URL='postgres://through:through-local-only@127.0.0.1:5432/through_test?sslmode=disable'
make integration
make build
```

Integration tests create isolated schemas in the supplied database and delete those schemas after each test. They never clear an existing application schema. Without the test database variable the PostgreSQL tests explicitly skip; a unit-only pass does not validate persistence or authorization transactions.

The validated suite covers production startup denial, origin/CSRF rejection, strict JSON and body limits, static traversal and symlink escape, CSP script hashes, limiter bounds, challenge exhaustion/expiry/concurrent reuse, hashed sessions/logout/expiry, same-domain tenant isolation, roles, audit protection and pagination, duplicate connections, exact origin/agent binding, concurrent handoff idempotency, cross-actor/session replay denial, live role revalidation, cross-tenant reads, and pause/revocation overriding replay, including a policy-lock race. A forced audit-insert failure verifies transaction rollback. Reconstructing the PostgreSQL pool and HTTP service verifies that sessions, accounts, pause state, receipts, and audit events survive application-layer restart. `go test -race` and `go vet` are part of local checks.

## Production release gates

Do not enable production by removing a guard. First implement and independently review real identity enrollment/recovery/MFA, consent and a vault provider, attested agent/browser identity, protected credential entry and observation controls, and provider-specific challenge handling. None is proven by the placeholder flow.

A real browser adapter must use a transactional outbox and a durable one-use-grant consumer. An external network effect cannot be made atomic by holding a PostgreSQL transaction. Add retries with bounded backoff, delivery deduplication, cancellation, revocation races, expiry enforcement at the executor, and failure receipts before enabling that adapter.

Enterprise release also requires tenant administration/invitations/SSO/SCIM as scoped, separation of duties, least-privilege database roles, external key management, global abuse protection, TLS at ingress, distributed observability/alerts, backup-and-restore exercises, dependency/image scanning, secret scanning, audit export/retention, privacy deletion policy, disaster recovery targets, accessibility review, load tests, and a security review. This repository does not claim SOC 2, ISO 27001, uptime guarantees, real MFA, or universal website compatibility.
