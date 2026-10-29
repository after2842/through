---
name: through-ux
description: Design and edit through's frontend, UX, forms, navigation, and English product copy using the project's restrained visual language and subtraction-first decisions. Apply to interface work in the through repository.
---

# through UX

Make the user's next action obvious with as little interface as possible. The product helps an existing AI agent get past a login and resume work in the same browser. Its audience is US and English-speaking users and businesses; conversations with the founder may be in Korean, but product language is English.

## Subtract, then restore

1. Identify the user's task and the one fact they need to understand before acting.
2. Remove text, cards, sections, options, labels, and decoration until you question whether the task is still understandable.
3. Walk through the result as a first-time user. Restore only what prevents a specific misunderstanding, supports a decision, or makes an action usable.

Do this before polishing the visual treatment. A smaller font or more compact card does not count as removing unnecessary content. Do not remove essential status, error recovery, field labels, focus visibility, or controls for revoking access to meet a visual target.

## Visual direction

- Use warm ivory `#faf8f1`, sky blue `#c6e3f4`, dark ink `#242b29`, and blue ink `#3e7695`. Sky blue is the accent; mint is retired. Use dark text on pale blue where contrast requires it.
- Dark mode uses graphite `#191a20`, slightly lifted surfaces `#23252e`, muted ice blue `#b8c9e5`, and warm chalk `#eae7e2`. Keep it restrained; use shared semantic color tokens across every state and check readable contrast in both themes.
- Retain Instrument Serif for expressive headings and DM Sans for functional copy. Give typography and space the work usually assigned to cards and decoration.
- Prefer quiet, unboxed compositions, thin rules, and deliberate alignment. Seek a layout that fits the content instead of defaulting to a centered hero followed by interchangeable card grids.
- Novelty must improve hierarchy or comprehension. Keep familiar controls and expected interaction behavior.
- The signed-out landing page has its main composition and exactly one lower section illustrating a concrete use case. Use screenshot-like fictional screens to show password entry and resumed work, with masked dots and an illustrative-demo label. Add further sections only when the user changes that scope.

## Content and interaction

- Explain the result in plain English. Mention MCP, hooks, or vault plumbing only when the user needs that detail to make a decision.
- Give signed-out visitors a reason to use the product; give signed-in users their actual connection state and next action. Keep the member home free of repeated marketing.
- Custom dropdowns must retain familiar keyboard navigation, selection, focus, dismissal, and accessible labeling.
- Keep one primary action per screen or step. Secondary actions should be visibly quieter and appear where they are needed.
- Ask for the minimum information needed now. Prefer a short sequence over a dense form when the next step depends on the first.
- Keep actionable controls honest: implement them, explain their limited demo effect, or remove them. Do not show decorative controls that do nothing.
- Place loading, success, and recoverable errors near the action that caused them. Retain useful input after a correctable error and make retries possible.
- Use visible labels, semantic controls, keyboard access, visible focus, touch targets of about 44 px, and reduced-motion behavior. Check narrow screens without horizontal overflow.
- Disclose demo behavior where it affects expectations. Do not repeat the same disclaimer throughout a page.
- Wait for the API before confirming a change. Preserve useful inputs after errors, disable conflicting writes while pending, and keep retries safe. An API failure must never switch the user to local demo state.
- Show only actions the current role can use; retain a concise read-only explanation where it resolves confusion. Keep Activity and revocation discoverable without adding a dashboard of unused controls.

## Authentication-specific boundaries

There are two explicit builds: a static browser-only demo and a Go-connected development sandbox. The Go mode persists workspace changes and enforces permissions on the server, but external identity, authenticator, vault, and browser adapters remain placeholders in both modes. The code `0000` is not real MFA, Google sign-in, or a connection to Google Authenticator. Never request real passwords, OTP seeds, backup codes, or provider tokens in this environment.

Account connections and handoff tests represent sample permission state and simulated external outcomes. Do not imply that choosing an agent installs a plugin, that a handoff completed a real login, or that removing an account revokes a real provider session. Keep exact destination and paused state visible where users decide access. Label successful handoff tests as demos.

The proposition may say “Let your agent enter your password and sign in.” Pair it with permission-aware copy and the illustrative status of the current experience; screenshots must use fictional data and masked dots. Do not turn the proposed capability into a claim of a verified commercial integration.

Avoid universal login promises, unverified support, partner logos presented as endorsements, fabricated customer proof, absolute security claims, and production-readiness claims. Use the [product plan](../../../docs/product-plan.md), [enterprise readiness record](../../../docs/enterprise-readiness.md), and [dated platform research](../../../docs/research/agent-login-platforms.md) when a change depends on those facts.

## Final review

Read the page aloud once and remove repetition. Check that a new user can tell what the product does, what happens next, and whether they are using a demo. Walk the primary flow and its likely error, back, retry, and exit paths on desktop and mobile. Add back only the information that resolves a concrete gap found in that review.
