# Product and implementation plan

Updated October 29, 2026, America/Los_Angeles.

## Product intent

When an existing AI agent reaches a login screen, through should let it use an account the user has connected and resume its task in the same browser tab. Users should understand, inspect, and stop that permission. The audience is US and English-speaking users and businesses.

This is the intended product, not proof of a commercial integration. A marketplace listing or MCP connection alone does not provide privileged access to a host's browser. A protected credential-entry mechanism, host permission, and provider-specific authentication support remain dependencies. See the [platform research](research/agent-login-platforms.md).

The [through UX skill](../.agents/skills/through-ux/SKILL.md) defines the continuing design direction. The [enterprise readiness record](enterprise-readiness.md) defines staged release requirements; [acceptance criteria](acceptance-criteria.md) distinguish implemented controls, verified evidence, and unresolved work.

## Current delivery

The repository implements a frontend and a Go/PostgreSQL development sandbox. External identity, authenticator, vault, and browser operations remain placeholders. `0000` verifies a fictional development challenge; it does not verify email ownership or a second factor.

| Route or capability | User task | Boundary |
|---|---|---|
| `/`, signed out | Understand the product and watch one illustrative handoff in an agent's built-in browser (play, pause, jump between six steps, switch the named agent); read How it works and Controls | Screens contain fictional data and masked dots, with an explicit illustrative-demo label; Controls end with a Preview line; no tested external integration or certification claim |
| `/`, signed in | See actual workspace connection state and the next useful action | Service mode reads the authenticated workspace from Go; static mode reads local demo state |
| `/login` | Enter a dummy email, then `0000`; correct a code or start again | No email, authenticator enrollment, Google sign-in, or real identity verification |
| `/accounts` | Search and filter connections; inspect permitted agents; pause/resume workspace access | Changes are server-enforced in service mode; no real provider permission or browser session changes |
| `/accounts/new` | Choose a listed platform or custom HTTPS domain, enter fictional sign-in details, select agents, review, and confirm | The demo password is discarded before submission; only platform, origin, username, and permission metadata is saved |
| `/accounts/connection/?id=…` | Inspect the website/account, allow or remove individual agents, update demo credential metadata, run a simulated sign-in, inspect recent activity, or delete the connection | Atomic single-agent API changes preserve other current permissions; credential updates do not reset a provider password or store a password |
| `/activity` | Inspect workspace or connection events; filter/search loaded events and export their CSV | Server history and cursors are scoped to the workspace and optional account; export contains loaded events only; static history is illustrative browser state |
| `/pricing` | See Personal, Team, and Enterprise at $0 during preview | All plans expose the same preview features; no checkout, subscription, automatic charge, or billing integration |
| `/settings` | Edit a display name, choose browser appearance, inspect the preview plan, and end sessions | Go persists the user profile and revokes other server sessions; static demo keeps a tab-local profile; MFA remains unconnected |
| Role-aware navigation | Members/viewers inspect their allowed workspace state; owners/admins receive management actions | API authorization is authoritative; hiding a control is a UX decision, not a security boundary |
| Sign-out and recovery | End a session, recover from a failed request, and sign in again after expiry | Service logout revokes the server session; static logout clears local demonstration state |

The first account action opens the connection form directly. Its four steps are Platform, Credentials, Access, and Review, followed by a pending state and confirmation. The credential step explicitly requests a made-up value and discards it before the later steps; the animation represents saving connection metadata, not uploading a password. Custom dropdowns retain keyboard navigation, type-ahead, selection, and dismissal. Mutations show pending state, prevent conflicting actions, and confirm the server result before showing success. Cancellation applies before a request begins; an in-flight server mutation is not presented as safely cancellable. Network uncertainty during a handoff preserves its idempotency key for a retry of the same attempt.

Keep the login flow to one field per step, a primary action, editable email, and useful feedback. Session-loading errors offer retry. Service errors never silently switch to a frontend simulation. Owners can reach Activity through a quiet link; member pages do not repeat marketing.

## Two explicit runtime modes

`npm run build:demo` produces the static browser-only demonstration. It uses session storage for fictional identity, account choices, and illustrative activity; `npm run build` selects this mode. The existing Sites deployment hosts only this static build and does not run Go or PostgreSQL.

`npm run build:service` produces the frontend for the same-origin Go API. Serve that export through Go or an explicitly configured equivalent ingress; both `/api/v1` and the frontend must resolve correctly on the application origin. Workspace and account state is durable in PostgreSQL. The frontend uses an opaque HttpOnly session cookie and server-issued CSRF token, rather than using local demo state as authorization. Build mode is selected at compilation, and both builds write to `out/`.

Service mode is still a development sandbox. It requires an explicit demo-auth opt-in, and the server's production default refuses startup while external adapters are placeholders. First-time dummy identities receive separate workspaces; matching company domains do not imply membership. Real identity and customer onboarding must replace this development behavior before a pilot.

Both modes support light and dark themes. A theme choice persists locally under `through.theme`; it is not account authorization. No real password, provider token, authenticator seed, or recovery code belongs in this product environment, request body, browser storage, or logs.

See [backend documentation](../backend/README.md) for the API, configuration, migrations, transaction boundaries, and run instructions.

## Connection management scope

The suggested catalog has 14 platforms: GitHub, Linear, Notion, Figma, Slack, Google Workspace, Microsoft 365, Atlassian, Airtable, Asana, Vercel, Dropbox, HubSpot, and Salesforce. A listing describes an illustrative destination, not an installed connector or verified sign-in integration. Custom entries accept a platform label and public-looking HTTPS domain. Validation rejects local/IP addresses, credentials in URLs, explicit ports, page paths, query strings, and fragments. Access is bound to the stored exact origin, with no permission implied for other subdomains. The API never resolves or fetches the submitted domain.

Icons are requested by the browser from Google's favicon service, with a no-referrer policy and initials as a fallback. This discloses the selected domain to the icon provider; the form names that provider. Passwords and usernames are not included in icon requests. Domain validation does not establish ownership, public reachability, or safe future browser access.

Connections permit Claude, Codex, and Cursor independently. An owner/admin can remove every agent while retaining the connection, and can later allow an individual agent. Each UI control maps to an atomic single-agent API operation so another page's stale permission list cannot restore a revoked agent. Disconnect removes all current permissions; retained activity is still readable by workspace owners/admins. The stored username identifies the intended account but is not verified by an external provider.

Migration 004 adds exact origins, usernames, ordered agent permissions, credential version/timestamps, and account IDs on new audit entries. It preserves earlier connection IDs and separate legacy per-agent rows; old immutable audit entries remain in workspace activity without an account filter. New connections are unique per workspace, normalized origin, and exact username. Deploy migration 004 with the matching Go service, because earlier service versions cannot insert the new required account columns.

The public demo now depicts the complete fictional task: blocked at sign-in, permission check, masked password entry, sign-in, resumed project reading, and a completed brief. Pause/replay and a step-by-step reduced-motion mode are implemented. This is illustrative playback, not evidence of a real browser adapter. Source review, backend integration tests, and browser QA for both modes are recorded in the acceptance criteria. Publication is a separate operation.

## Validation and evidence

The prior frontend iterations were reviewed on desktop and narrow mobile, in both themes, for login, navigation, keyboard dropdown behavior, connection changes, and overflow. Those historical checks establish only the earlier frontend simulation.

The Go-connected iteration adds these release checks:

- Build both explicit frontend modes and pass TypeScript checks.
- Exercise login errors, expiry/restart, sign-out, session refresh, unavailable API, and retry without demo fallback.
- Exercise account connection, duplicate rejection, removal, pause/resume, role restrictions, and exact destination display.
- Verify handoff idempotency, tenant isolation, expiry, and revocation with real PostgreSQL integration tests and Go's race detector.
- Inspect Activity scope, empty/error/loading states, and pagination where applicable.
- Review desktop/mobile layouts, keyboard focus, theme contrast, English copy, and honest placeholder labeling.

Record outcomes in [acceptance criteria](acceptance-criteria.md); a checklist or source change is not evidence that a test passed. The provided Docker recipe requires execution validation in a Docker-capable environment. CI is configured for frontend builds and real-database Go checks; no remote CI result is implied by committing its workflow.

## Next: prove one integration

1. Start with a local Cursor proof of concept using harmless test strings and a test login page. Verify whether the documented input-replacement hook applies to its browser tool in the existing tab.
2. Inspect tool arguments/results, transcripts, logs, DOM snapshots, screenshots, and concurrent observers. Filling a field alone does not demonstrate protected secret entry.
3. If that path cannot meet the requirements, evaluate Claude Code with the user's existing Chrome tab as a separately described integration. Preserve the original task's browser context.
4. Replace placeholder identity and vault operations with verified adapters and deliberate user consent. Test successful login, expiry, additional verification, cancellation, revocation, and task continuation on a bounded site set.
5. Verify distribution and credential-handling rules before promising platform support or public availability.

A real browser adapter also needs a durable, single-use execution protocol with safe recovery from unknown external outcomes. A PostgreSQL transaction cannot make a remote credential-entry effect atomic. The placeholder's immediate simulated outcome must not be copied into a production network integration.

## Pilot and general-availability gates

The [enterprise readiness record](enterprise-readiness.md) owns the complete release requirements. Before a pilot, prove real identity/MFA and recovery, tenant administration, bounded agent identity and grants, protected credential entry, reliable revocation, restoration from backup, monitored operations, and a named incident responder. General availability additionally requires evidence from supported integrations, security review, operational exercises, and customer support/deletion processes.

Do not claim universal login support, enterprise certification, uptime guarantees, or production readiness from this development delivery. Measure real login completion, return to the original task, user interventions, revocation latency, and recovery success; simulations do not count as successful customer logins.

Pricing now shows **$0 during preview for Personal, Team, and Enterprise**, with no credit card or automatic charges. The earlier $19/month Personal and $39/member/month Team proposals remain struck through as previously proposed prices; Enterprise previously showed custom pricing. These are product-copy decisions, not a launched subscription or enterprise service commitment. User settings is reachable from signed-in navigation; sign-out is centralized there. Theme choices System/Light/Dark synchronize with the header toggle and persist on the browser. Changing a name is not identity verification. Testimonials, logo walls, unused administration controls, and additional marketing sections remain deferred. Add a page or control only when a verified capability or concrete user task needs it.
