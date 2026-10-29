# Product and implementation plan

Updated October 28, 2026, America/Los_Angeles.

## Product intent

When an existing AI agent reaches a login screen, through should let it use an account the user has already connected and resume its task in the same browser tab. Users should be able to see and stop that access. The target audience is US and English-speaking users and businesses.

This is the intended product, not the current integration capability. A marketplace listing or MCP connection alone does not grant privileged access to a host's browser. Platform adapters, a safe secret-entry mechanism, and provider-specific authentication support remain dependencies. See the [research snapshot](research/agent-login-platforms.md).

The [through UX skill](../.agents/skills/through-ux/SKILL.md) defines the continuing design direction. The product should require little explanation because each page makes its next action clear.

## Frontend delivery scope

The current iteration implements the following simulated flow. It does not implement production identity or third-party account access.

| Route or capability | Behavior | Boundary |
|---|---|---|
| `/`, signed out | Core product message, handoff demo, sign-in entry, and one illustrative use case: a weekly Linear brief continuing through a login wall | Example only; no claim of a working Linear integration |
| `/`, signed in | Personal workspace with connected accounts, ready/paused state, and the next setup or management action | Reads the same local demo state as `/accounts` |
| `/login` | Enter an email, then an authenticator-style code; `0000` passes the demo challenge | No email is sent; no real authenticator, OAuth, or MFA verification occurs |
| `/accounts` | Show connected demo services, add a service and choose an agent, remove a connection, pause or resume all demo access | Local state only; no plugin installation or provider permissions change |
| Session navigation | Sign-in returns to the member home; signed-out account routes go to login; sign-out clears the demo session and returns to the public home | Browser state is not authorization; direct access to static assets remains possible |

Account and agent choices use custom comboboxes with keyboard navigation, type-ahead, focus management, and inline validation. The first-account action opens the connection form directly.

Every route supports light and dark themes. The initial theme follows the system, and an explicit choice persists in local storage under `through.theme`. Dark mode uses graphite, muted ice blue, and warm chalk; authentication and account data remain in session storage only.

Only non-secret demo data belongs in session storage. Never store real passwords, provider tokens, authenticator seeds, or recovery codes. The demo does not transmit entered account details to an authentication backend. Storage is scoped to the browser session and is not a durable account.

Keep the login flow small: one visible field per step, a clear primary action, an editable email, useful invalid-code feedback, and an explicit demo code hint. Calling the second step an authenticator demo is more accurate than presenting it as a working Google Authenticator integration.

## Validation for this iteration

Before considering the frontend complete:

- Build the static export and pass TypeScript checks.
- Inspect desktop and mobile views, keyboard focus, text contrast, and narrow-screen overflow.
- Exercise invalid email, invalid code, successful code, back/edit-email, refresh, sign-out, and a signed-out visit to `/accounts`.
- Exercise add, remove, and global pause/resume without losing the current state unexpectedly.
- Confirm all UI, accessible names, error messages, and metadata are English.
- Verify that every action is functional within the stated demo scope and that no screen claims real integration.

Verification completed for the October 28 frontend iteration:

- Next.js production build, TypeScript check, and static export passed for all three routes.
- Browser checks covered invalid email, email editing with retained input and focus, invalid code and retry, `0000` sign-in, account connection, duplicate rejection, cancellation during connection, removal, pause/resume, persistence after refresh, sign-out, and signed-out route redirection.
- Inspected desktop (1280 px), mobile (390 px), and narrow mobile (320 px) layouts. No horizontal page overflow was observed. Product screens and error messages were English; browser error logs were empty.
- The repository UX skill passed the skill validator, and its local documentation links resolved.

The home-and-theme revision also passed the production build and browser review:

- Public home and signed-in home switch correctly after login, logout, navigation, and refresh. Ready, paused, and empty connection states were exercised, including removing the last paused connection.
- Custom dropdowns passed required-choice and duplicate feedback, pointer selection, Arrow keys, Home/End, type-ahead, Enter/Space selection, Escape/Tab dismissal, and outside-click dismissal.
- Theme choice survived refresh and navigation. Inspected both themes on desktop and dark layouts at 320 px, including the complete popup and the single use-case section; no horizontal overflow or browser errors was observed.
- Color calculations verified at least 4.5:1 for active text and 3:1 for diagram arrows against their actual theme backgrounds. The revised dark palette uses graphite, muted ice blue, and warm chalk.
- The updated repository UX skill passed validation.

These checks cover the frontend simulation. They do not validate real authentication, provider connections, or agent access.

## Next: prove one integration

1. Start with a local Cursor proof of concept using harmless test strings and a test login page. Verify whether the documented input-replacement hook applies to its actual browser tool in the existing tab.
2. Inspect every surface that could expose the substituted value: tool arguments and responses, transcript, logs, DOM snapshots, screenshots, and concurrent observers. Being able to fill a field is not proof of safe secret handling.
3. If the native-browser path cannot meet the requirements, test Claude Code with the user's existing Chrome tab as a separately described integration. Do not silently substitute a new browser for the original task.
4. Test successful login, expired session, additional verification, cancellation, and returning to the original agent task on a small supported-site set.
5. Confirm the chosen platform's distribution and credential-handling rules before promising public availability.

These are planned experiments. Neither the adapters nor protected credential entry are implemented in this repository.

## Production work after feasibility

| Area | Required outcome before shipping |
|---|---|
| through identity | Server-verified sessions, a real authenticator or identity-provider flow, enrollment and recovery, expiration, and revocation |
| Account connection | Explicit user consent, account selection, a supported authorization or vault integration, and clear permission scope |
| Secret handling | Credentials kept outside model context and ordinary tool logs, with a supported protected entry path and observation controls |
| Agent access | Agent identity, bounded grants, revocation, and enforcement in the runtime rather than only in the UI |
| Browser adapter | Permission to target the intended browser/session/tab and reliable continuation of the original task |
| Provider behavior | Honest handling of challenges, device checks, CAPTCHA, passkeys, social sign-in, and expired sessions; user help when required |
| Operations | A useful access history, failure recovery, and policies that match what the system actually does |

Choose the real authentication and vault architecture after the first adapter's constraints are known. The frontend's `0000` gate and session storage must be replaced, not extended into a security mechanism.

Measure login completion, recovery success, agent task resumption, and user interventions per task. Do not promise that all websites can be accessed without interruption.

## Intentionally deferred

Pricing, customer testimonials, integration logos, enterprise administration, a large dashboard, and extra marketing pages add no necessary value to the current proof of concept. Introduce them only when the product has a verified capability or a user task that needs them.
