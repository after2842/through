# Enterprise readiness

Original review October 28, 2026; connection-management update October 29, 2026, America/Los_Angeles.

This is the release decision record for through, not a compliance certification. The useful enterprise outcome is that a customer can authorize an agent, understand its access, and stop it reliably. More dashboard widgets do not establish that outcome.

The current delivery targets a **credential-free development environment** with a real Go service and durable persistence. External identity, vault, browser, and enterprise provisioning integrations remain explicit placeholders. Real customer credentials must not enter this environment. A published static preview is a separate, browser-only demonstration; it is not the deployed Go service.

See [acceptance criteria](acceptance-criteria.md) for executable release gates and the [platform research](research/agent-login-platforms.md) for the unproven same-tab integration boundary.

## Release stages

| Stage | Permitted use | Exit evidence |
|---|---|---|
| Development sandbox | Dummy identities, synthetic accounts, simulated login handoff | Build and race checks; real-database isolation, revocation, CSRF, audit, and retry tests; honest UI and placeholder errors |
| Limited customer pilot | Named customer, one verified browser adapter, explicitly approved accounts and sites | Real identity and MFA; safe credential entry; tenant administration; verified revocation; restored backup; monitored service with a named responder |
| General availability | Supported customers within a published capability matrix | Pilot outcomes meet agreed service targets; incident and recovery exercises; completed security review; support, deletion, and release processes operating |

Passing the first stage does not imply the later stages. Do not describe placeholder SSO, a simulated authenticator, or an untested browser adapter as an enterprise integration.

## Product requirements by priority

| Priority | Requirement | Decision and release boundary |
|---|---|---|
| P0 | Trustworthy identity | `0000` belongs only to an explicitly enabled development flow. A production configuration must reject demo identity and refuse startup until real identity, vault, and browser adapters are configured. Use immutable provider subject identifiers when replacing the adapter; email text alone is not identity or tenant membership. |
| P0 | Tenant and role enforcement | Derive tenant, actor, and role from server-side membership. Scope every account, grant, activity, and mutation to that tenant. Owner/admin permissions and personal-account ownership must be enforced by the API, including direct calls. A role selector in a client request is never authorization. |
| P0 | Revocable sessions | Use an opaque, expiring, server-revocable cookie. Persist only its hash. In an HTTPS deployment, enforce Secure, HttpOnly, and an appropriate SameSite policy. Rotate at authentication; invalidate on logout and offboarding. Reject forged or expired sessions without returning workspace data. |
| P0 | Deliberate changes | Require same-origin requests and session-bound CSRF protection for cookie-authenticated mutations. Cover login and logout as well as account and access changes. Never silently fall back to browser demo state when the real API fails. |
| P0 | Bounded login permission | Bind each short-lived, single-use grant to tenant, account, agent, exact HTTPS origin, browser session, and tab. Re-check account existence and current access at execution. Deny changed origin, replay, expiry, wrong actor, or revoked scope. Pause and disconnect must stop outstanding work. |
| P0 | Secret boundary | Real passwords must stay outside the application/model observation boundary; APIs and normal logs receive references and outcome codes. Preview password inputs accept fictional values only and discard them without transmission or persistence. A future protected enrollment/browser adapter must verify the destination and prove observation suppression. A request field claiming a tab or origin is insufficient proof. |
| P0 | Durable evidence | Account, permission, and session changes must have an audit record in the same database transaction. A failed audit write fails the change. Record actor, action, target, time, outcome, and request ID; exclude tokens, credentials, codes, full request bodies, and arbitrary provider responses. |
| P0 | Safe retry and bounded work | Use idempotency for grant issuance or other operations whose retry could create additional authorization. Reject reuse with a different payload. Limit request size, attempts, concurrent work, and time. Once an external fill may have occurred, an unknown result must not trigger a blind credential-entry retry. |
| P1 | Usable recovery | Retain correctable form input; distinguish session expiration, unavailable service, denied access, and additional verification. Permit retry only where safe. A site requiring human verification is an honest terminal or action-required state. |
| P1 | Customer control | Owners can pause access and inspect a concise activity history. Members see only allowed accounts. Offboarding revokes sessions and grants. Invitation acceptance, member removal, and owner transfer need verified identity; do not fake these controls. |
| P1 | Operations | Define dependency health, migration ownership, backup/restore, alerts, incident response, retention, and support escalation before a customer pilot. A healthy HTTP listener alone does not prove that a dependency is usable. |

These are project requirements informed by OWASP's guidance on [authorization](https://cheatsheetseries.owasp.org/cheatsheets/Authorization_Cheat_Sheet.html), [sessions](https://cheatsheetseries.owasp.org/cheatsheets/Session_Management_Cheat_Sheet.html), and [CSRF](https://cheatsheetseries.owasp.org/cheatsheets/Cross-Site_Request_Forgery_Prevention_Cheat_Sheet.html). The secret and audit boundaries follow the concerns described in [secrets management](https://cheatsheetseries.owasp.org/cheatsheets/Secrets_Management_Cheat_Sheet.html) and [logging](https://cheatsheetseries.owasp.org/cheatsheets/Logging_Cheat_Sheet.html). A transaction must commit all related state or none, as described in [Go's transaction documentation](https://go.dev/doc/database/execute-transactions).

## Minimal customer workflow

1. **Connect:** choose an account and the permitted agent. State the approved site beside the permission, not in a separate policy essay. A failed connection retains the user's choice and gives one recovery action.
2. **Use:** show whether access is ready, paused, expired, or needs attention. A grant represents permission for a bounded login attempt; it is not proof that the destination accepted the login.
3. **Inspect:** keep an Activity view with time, account, action, and outcome. Show errors in plain English. Do not expose internal traces or confidential request data.
4. **Stop:** keep Pause access near account management, with disconnect at the individual account. Confirm the server result before showing success. Explain only the consequence that changes the user's decision.

For the public landing page, lead with one interactive, screenshot-like demo of a login screen and resumed work, followed by a short How it works section, a Controls section, and a closing action. The explicit proposition is that the agent signs in with credentials the user approved and continues in the same tab. Accompany it with permission-aware copy and a small **“Illustrative demo”** label. The Controls section describes what through is built to do and ends with one Preview line stating that live sign-in adapters are not connected, SSO and SCIM are planned, and no compliance certification is held. The image must contain fictional data and masked dots, not an embedded or photographed password. It must not look like proof of an existing commercial integration. Keep that claim separate from evidence that a protected entry adapter has actually been implemented.

## External adapter contracts

| Adapter | Placeholder behavior now | Production evidence required |
|---|---|---|
| Identity / authenticator | Development challenge with a documented dummy code; no email, Google, or MFA claim | Provider response verification; MFA/enrollment/recovery; subject binding; session rotation; failure and outage tests |
| Enterprise SSO / provisioning | Explicit unavailable capability; no successful mock enterprise enrollment | Verified OIDC/SAML integration, workspace domain ownership, invitation/membership policy, SCIM or equivalent offboarding, last-owner recovery |
| Vault | No secret material; opaque sample account reference only | Customer consent, scoped credential reference, least-privilege access, rotation/revocation and deletion behavior, approved storage boundary |
| Browser / MCP host | Simulated result clearly marked as such; no remote browser call | Authenticated device/agent, actual same-tab and origin verification, supported host contract, protected fill, post-login verification, interruption recovery |
| Notifications / telemetry / audit export | No external delivery and no delivery-success claim | Destination authentication, bounded retries, redaction, delivery evidence, customer controls, and outage handling |

An explicitly selected demo adapter may return a result marked `simulated`. An unavailable real adapter must return a typed unavailable/action-required result, never a fabricated real success. A real mode must not reuse demo implementations after initialization fails.

## Operational decisions before a pilot

- **Deployment:** terminate TLS on a controlled ingress; restrict database access; separate migration privileges from the runtime role; ensure only trusted proxies influence client identity. Publish the supported origin, environment, and adapter versions.
- **Monitoring:** collect request count, latency, failure rate, rejected authentication, denied grants, dependency readiness, and database capacity. Use bounded labels; no email, account identifier, token, or raw URL in metric labels. An on-call owner must receive a tested alert for sustained inability to sign in or revoke access.
- **Recovery:** encrypt backups with separated access, restore into an isolated environment, verify tenant records and revocations, and demonstrate a complete recovery. Proposed pilot targets are an RPO of 24 hours and RTO of 4 hours; these are planning targets, not an SLA or verified capability. Do not restore stale authorization into active use without a revocation/reconciliation plan.
- **Retention:** decide retention and deletion with the customer before storing real identities. Proposed starting points: 30 days for redacted operational logs and 90 days for audit events, subject to contract and actual purge implementation. Document backup expiry and what remains after account/workspace deletion. These values are not implemented merely by appearing here.
- **Incidents:** assign a responder and escalation contact, rehearse pause-all and global session revocation, preserve relevant audit evidence, rotate affected credentials through the provider, and communicate scope using confirmed facts.
- **Release:** run migration compatibility and rollback checks against a restored database; pin dependencies; review vulnerability results; keep the previous artifact and configuration. Never rely on destructive reset as a rollback strategy for customer data.

## Measurement and launch decision

Measure completed logins per authorized attempt, successful return to the original task, user interventions per task, revocation latency, and recovery success. Report only real adapter attempts as login metrics; sandbox animations are not product success data.

The launch owner records a decision against the evidence in [acceptance criteria](acceptance-criteria.md). Any unresolved tenant isolation, unauthorized grant, secret exposure, or ineffective revocation issue blocks a pilot. A missing external provider is a named dependency, not a feature that can be waived by changing marketing copy.

## Implementation review

An independent source review covered `backend/internal/config`, `backend/internal/httpapi`, `backend/internal/postgres`, `backend/internal/core`, `lib/client.ts`, and the login, workspace, activity, and use-case components. The root agent also reported a successful service-mode frontend build, a working Go/PostgreSQL browser flow, a deliberate service-outage check, and an isolated restore of synthetic data. The companion [acceptance criteria](acceptance-criteria.md) distinguish that limited runtime evidence from unperformed provider and operational validation.

| Source-covered capability | What the implementation establishes | Remaining boundary |
|---|---|---|
| Go and PostgreSQL service | Embedded transactional migrations with serialization; parameterized, tenant-scoped queries; persisted accounts, sessions, and events; local startup/restart, database outage, audit rollback and isolated restore exercised | Docker/Compose and hosted CI are unexecuted; encrypted backup and measured operational recovery remain pilot gates |
| Identity and sessions | Explicit development/test opt-in, production refusal, one-use challenge with a five-minute deadline and attempt cap, random session cookie with a stored hash, expiry and logout revocation | Identity is still a dummy code. Real enrollment, MFA, membership administration, recovery, and offboarding are absent |
| Request protection | Exact allowed Origin on API writes, JSON-only inputs with unknown-field/body-size rejection, session-bound CSRF on authenticated writes, deadlines and bounded rate-limit state; Go race and real-database tests passed | Edge/TLS policy and distributed abuse controls are not deployed; sign-in uses Origin and JSON checks before a session exists |
| Authorization | Membership-derived roles and a workspace lock; sensitive mutations re-read current session/role within the transaction | Owner/admin can manage workspace accounts; member/viewer are read-only. No invitation/member-management UI or per-member account grants exist |
| Handoff | Exact configured site and selected agent checked against the account; input bounds; a synchronous simulated adapter result and a persisted idempotency record | The browser/session/tab strings are supplied by the client. There is no independently authenticated adapter, real tab observation, future grant execution, or remote secret entry |
| Audit and operations | Transactional records for successful sign-in/sign-out, account changes, pause/resume, and simulated handoffs; database triggers reject ordinary event edits; paginated activity; health/readiness and protected counters | Failed/denied requests are not a durable security audit. Correlation/outcome fields, log export, retention enforcement, an on-call system, and operational exercises remain incomplete |
| Frontend | Compile-time service/demo selection; same-origin API requests; no network-error fallback to local success; role-aware controls, retry states, stable handoff key on uncertain retry; login/accounts/activity/outage/expiry and narrow layouts exercised | Full accessibility audit is unperformed. The static preview does not deploy the API or database |

The current handoff runs and consumes the placeholder within one database transaction. Its `expiresAt`, browser-session, and tab fields do **not** constitute an implemented asynchronous, expiring execution grant. There is no outstanding real operation for Pause or logout to cancel. When a real adapter is introduced, use a durable worker/outbox with atomic authorization at consumption, explicit outcome reconciliation, and revocation semantics; do not simply put a network call inside the current transaction.

Source review identified actor/session scoping of idempotency, mixed HTTP/HTTPS cookie configuration, and challenge-restart feedback. The revised code binds the request fingerprint to actor and session, rejects mixed HTTP/HTTPS origins, and returns typed expired/exhausted challenge errors. Activity now includes account/agent context and handles session expiry. Their runtime regression checks are recorded separately in the acceptance evidence.

The root/backend agents reported passing Go vet, race-enabled tests against real PostgreSQL, a static Go build, and service-mode frontend builds. Dependency scans passed after updating the Go runtime and affected packages. These results approve the recorded local sandbox scope; they do not imply that containers were run, CI executed remotely, a penetration test occurred, or external authentication works.

An isolated development dump/restore recovered one synthetic account, one simulated handoff, and five audit events; restored sessions/challenges were then invalidated. This exercises basic recovery mechanics only. Encrypted backups, a clean environment recovery rehearsal, point-in-time recovery, measured RPO/RTO, and the operational owner remain pilot work. Security audit of denied requests, per-member permissions, and secure external adapter/device enrollment are also still open.

## October 29: connection management review

The implementation now models a connection as one exact website origin and username with independently permitted agents. The new setup and detail pages expose review/confirmation, individual agent changes, demo credential updates, connection deletion, and scoped history. Search, filters, and CSV export operate on loaded activity; a client-side CSV download is not an external audit-delivery integration. All three plan labels show $0 during preview with the same available features and no billing integration.

The password form is a **fictional credential-entry demonstration**. Its input value is cleared before a metadata API call, excluded from the client metadata allowlist and browser storage, and rejected by the API if submitted as an unknown field. The credential-update endpoint accepts no request body and changes only a version counter and timestamp. It does not store or upload a password, reset a platform password, or call a vault. Identity, MFA, vault, agent enrollment, and browser entry remain placeholders, and production startup still fails closed.

Owner/admin authorization and current sessions are revalidated inside the existing workspace lock for permission changes, credential metadata updates, and disconnection. Handoffs check the stored origin and current agent membership before returning either a new simulated receipt or an idempotent replay. Removing the last agent prevents handoffs while retaining the connection. Deleted connections retain historical audit records, and account-filtered reads validate both the workspace and account.

Integration review found and fixed a stale-page authorization bug: replacing the whole permission list from an individual Remove button could restore a different agent revoked from another session. The UI now uses atomic single-agent PUT/DELETE operations; the API reads the current list under its policy lock and changes only that agent. Concurrent removal of two different agents leaves both revoked. Already-applied allow/revoke requests do not create duplicate audit events. Explicit full-list PATCH remains for compatibility and is not used by these individual controls.

Custom-domain support validates HTTPS syntax, bounded DNS labels, and restricted origins without DNS resolution or server requests. It is not ownership validation or proof that a future browser can safely sign in. Built-in platform names are bound to their suggested origins. The browser's optional favicon display requests only the validated hostname from Google, uses no referrer, and has a narrow Google/gstatic image CSP. This introduces an external icon-provider request; it is not a credential or agent integration.

Migration 004 preserves earlier connection IDs, separate legacy per-agent rows, and immutable audit history. New records are unique by workspace/origin/exact username. Existing audit entries are not retroactively assigned account IDs, so scoped history covers new-format events while earlier events remain in workspace history. The updated service must accompany this schema; the older insert shape is incompatible with the required origin column.

Backend evidence for this update is direct local execution: the full race-enabled suite ran against dedicated PostgreSQL, Go vet passed, and a static Go binary built. Tests cover domain boundaries, DTO and metadata persistence, duplicate identity, tenant/role denial, revoked-agent replay rejection, waiting-handoff revocation, concurrent individual permission changes, migration preservation, scoped pagination, and audit-failure rollback. The detailed commands are recorded in [acceptance criteria](acceptance-criteria.md). The acceptance record separately documents browser QA of the revised screens in static and Go-backed modes, including outage recovery. Publication remains a separate operation.

The earlier pilot blockers remain. Denied attempts are not a durable security audit; retention and deletion of retained history are not implemented policies. A manually repeated uncertain demo credential update may increment metadata again, which is acceptable only for this non-secret simulation; a real credential operation needs an explicit idempotent provider protocol and reconciliation. No production-readiness, enterprise certification, SSO, SLA, or universal login support follows from these UI and sandbox changes.
