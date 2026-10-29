# Working on through

For any frontend, UX, visual, navigation, form, or product-copy change, read and apply [the through UX skill](.agents/skills/through-ux/SKILL.md). This is the project's continuing design direction, not a one-time landing-page treatment.

The product serves US and English-speaking users and businesses. Keep all product UI, validation, accessibility labels, metadata, and repository documentation in English. The founder may discuss the work in Korean.

Read [the product plan](docs/product-plan.md) for scope and implementation boundaries. Read [the platform research](docs/research/agent-login-platforms.md) before changing integration claims or choosing a real authentication integration. That research is a dated documentation review, not evidence of tested integrations or platform approval.

This repository currently demonstrates frontend flows. Do not turn a simulated session, account connection, or authenticator challenge into a claim of real authentication. Keep real credentials, tokens, authenticator seeds, and recovery codes out of demo storage and logs.

After a change, run the checks appropriate to it, inspect the affected desktop and mobile flows, and update documentation when behavior or scope changes. Preserve the existing Next.js project and its configured deployment identity.
