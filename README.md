# through

Account access for AI agents, with a restrained English interface for US users and businesses. The product intent is to let an authorized agent get past a login and continue in the same browser tab.

The canonical source is the private [after2842/through](https://github.com/after2842/through) repository. `origin` points to GitHub, with `main` as the default branch. GitHub Actions checks pushes and pull requests. Sites remains the static demo hosting target; publishing there is a separate step and retains the project identity in `.openai/hosting.json`.

The repository now includes a Next.js frontend and a Go service backed by PostgreSQL. This is a **development sandbox**, not a production password manager: external identity, authenticator, vault, and agent/browser adapters are explicit placeholders. Use fictional emails and accounts, and the demo code `0000`. Never enter real passwords, provider tokens, or recovery codes.

## Choose a mode

| Mode | Build | State and hosting |
|---|---|---|
| Static demo | `npm run build:demo` | Browser session storage; no API required. The existing Sites deployment hosts this mode. |
| Go-connected sandbox | `npm run build:service` | Same-origin Go API, server sessions, and durable PostgreSQL workspace/account/activity data. Requires a separate Go or container runtime. |

Both builds export to `out/`, so the most recent build replaces the previous mode. Restart Go after rebuilding the export; its static root is bound to the directory opened at startup. `npm run build` explicitly selects the static demo. `NEXT_PUBLIC_API_MODE` is a build-time setting, not a runtime switch. Service mode never falls back to browser-only state when the API is unavailable. Static assets and client redirects are not authorization controls; the Go API enforces access to its data.

## Run the frontend demo

Requires Node.js 22+ and npm.

```sh
npm ci
npm run dev
```

Open `http://127.0.0.1:3000`. The public landing leads with an interactive, illustrative demo of an agent signing in from its built-in browser, followed by short How it works and Controls sections; signing in opens the workspace, account access controls, Settings, and Activity. Pricing shows every plan at $0 during preview; billing is not connected. Connections support 14 suggested platforms or an exact custom domain, a fictional-password entry flow, independent agent permissions, credential-update receipts, and searchable activity with CSV export. Settings includes name editing, System/Light/Dark appearance, and session controls. Dropdowns support keyboard navigation. Light/dark preference persists independently of the session.

## Run the Go-connected sandbox

Build the service frontend first, then start the backend and database:

```sh
npm ci
npm run build:service
docker compose -f backend/compose.yaml up --build
```

Open **`http://127.0.0.1:8080`**. Go serves both the exported frontend and `/api/v1` from the same origin. The development Compose file binds the app to loopback, leaves PostgreSQL unpublished, and persists its database in a named volume. Stop it with `docker compose -f backend/compose.yaml down`; data remains in that volume. Docker was unavailable during implementation, so the provided container recipe still needs execution validation.

To run without Docker, use Go 1.27.3+ and follow the [backend setup and configuration](backend/README.md). Go and PostgreSQL were validated directly. Explicit `THROUGH_ENV=development` and `THROUGH_DEMO_AUTH=true` are required. The default production configuration deliberately refuses startup until real external adapters exist. No frontend setting overrides that guard.

## Deploy and connect agents

`infra/gcp` holds minimal Terraform for Google Cloud (Cloud Run and Cloud SQL) and a `deploy.sh` that builds the root `Dockerfile` with Cloud Build. It deploys the same development sandbox, over HTTPS. See [the infrastructure guide](infra/gcp/README.md).

The Go service is also a remote MCP server at `/mcp`, with OAuth sign-in for MCP clients such as Claude and ChatGPT. On the consent screen the user chooses which agent (Claude, Codex, or Cursor) the connection signs in as, and Settings lists and disconnects connections. `plugin/through` is the plugin package for Claude and OpenAI, generated with `npm run plugin -- <origin>`. Sign-in grants stay simulated. [Directory submission readiness](docs/submission.md) lists what is in place and what still blocks a listing.

## Check

```sh
npm run typecheck
npm run build:demo
npm run build:service
# Set a dedicated test database; tests create and drop their own schemas.
export THROUGH_TEST_DATABASE_URL='postgres://through:through-local-only@127.0.0.1:5432/through_test?sslmode=disable'
make check-backend
```

GitHub Actions builds both frontend modes, audits production npm dependencies, and runs Go race tests, vet, and `govulncheck` with a PostgreSQL service. An unset test database skips PostgreSQL coverage when invoking Go directly; `make check-backend` rejects that omission. See the [acceptance record](docs/acceptance-criteria.md) for actual evidence and remaining gates. A passing pipeline does not verify external login or production readiness.

## Source and decisions

- `app/`, `components/`, `lib/`: Next.js 16 App Router, React 19, TypeScript, and CSS Modules; `lib/client.ts` selects the build mode.
- `backend/`: Go API, versioned migrations, PostgreSQL persistence, integration tests, and local container recipe.
- [Product plan](docs/product-plan.md), [enterprise readiness](docs/enterprise-readiness.md), and [acceptance criteria](docs/acceptance-criteria.md): scope, release stages, and evidence.
- [Platform research](docs/research/agent-login-platforms.md): dated documentation review, not proof of integrations or marketplace approval.
- [Directory submission readiness](docs/submission.md): MCP, OAuth, plugin package, and the blockers to a directory listing.
- [Repository instructions](AGENTS.md) and [through UX skill](.agents/skills/through-ux/SKILL.md): continuing product and design rules.

Keep product copy and documentation in English. Subtract first, then restore only what a user needs to understand and complete the task.
