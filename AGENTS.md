# Working on through

Manage source in the private GitHub repository `after2842/through`; `origin` is its primary remote and `main` is the default branch. Push completed changes to GitHub and check the resulting CI run. Preserve commit history and repository privacy. GitHub pushes do not publish the Sites demo; preserve `.openai/hosting.json` and use the existing Sites publishing workflow when a deployment is requested.

For any frontend, UX, visual, navigation, form, or product-copy change, read and apply [the through UX skill](.agents/skills/through-ux/SKILL.md). This is the project's continuing design direction, not a one-time landing-page treatment.

The product serves US and English-speaking users and businesses. Keep product UI, validation, accessibility labels, metadata, and repository documentation in English. The founder may discuss the work in Korean.

Read [the product plan](docs/product-plan.md) for scope and runtime modes, and [enterprise readiness](docs/enterprise-readiness.md) with [acceptance criteria](docs/acceptance-criteria.md) before changing authorization, credentials, or release claims. Read the [platform research](docs/research/agent-login-platforms.md) before integration decisions. It is a dated documentation review, not evidence of tested integrations or platform approval.

This repository has two explicit builds. `npm run build:demo` is a browser-only simulation for static Sites hosting; `npm run build:service` uses the same-origin Go API and PostgreSQL. Both replace `out/`. Service mode must never fall back to demo state after a failed request. Client navigation and hidden controls are not authorization; tenant, role, session, CSRF, and grant decisions belong in the API.

External identity, authenticator, vault, and browser adapters remain placeholders. The development code `0000` is not real MFA or verified identity. Preserve the server's fail-closed production configuration; do not remove it to make a deployment appear ready. Keep real credentials, provider tokens, authenticator seeds, and recovery codes out of this environment, fixtures, storage, logs, and model-visible outputs. Do not claim production readiness or certification.

For backend work, read [its API and operational documentation](backend/README.md). Preserve transactionally recorded audit events, tenant scoping, current permission checks, bounded grants, and safe idempotent retry behavior. Add versioned migrations rather than modifying applied migrations. Run database tests against a dedicated development/test database; never use a customer database.

After a change, run appropriate checks, inspect affected desktop/mobile flows, and update scope and evidence documents. CI checks both frontend builds, production npm dependencies, and Go race tests/vet/vulnerability analysis with PostgreSQL. A local unit pass with database tests skipped is not integration evidence. Preserve the existing Next.js project and Sites identity; Sites serves only the static demo, and the Go service needs separate runtime hosting.
