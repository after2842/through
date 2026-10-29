# through

A minimal frontend for account access that lets AI agents get back to work in the same browser. Built for US and English-speaking users and businesses.

Next.js 16 App Router, React 19, TypeScript, and CSS Modules. Instrument Serif and DM Sans, sky blue and warm ivory. The site exports to `out/`.

## Run

```sh
npm install
npm run dev
```

## Check and build

```sh
npm run typecheck
npm run build
```

## Demo scope

The frontend includes a landing page, an email and authenticator-style sign-in flow, and an account access workspace. Use `0000` for the demo verification code. Connections and access controls are simulated with browser session storage; no external account, agent, password manager, or authentication backend is connected. Do not enter real credentials.

The core source is in `app/`, with shared components in `components/`. Static export means a client-side route check is only demo navigation, not a security boundary.

## Project guidance

- [Repository instructions](AGENTS.md)
- [Reusable through UX skill](.agents/skills/through-ux/SKILL.md)
- [Product and implementation plan](docs/product-plan.md)
- [Platform research and sources](docs/research/agent-login-platforms.md)

Keep product copy and documentation in English. Apply the UX skill to every interface change: subtract first, then restore only what the user needs.
