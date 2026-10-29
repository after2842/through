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

- Use warm ivory `#faf8f1`, sky blue `#c6e3f4`, dark ink `#242b29`, and blue ink `#417b9b`. Sky blue is the accent; mint is retired. Use dark text on pale blue where contrast requires it.
- Retain Instrument Serif for expressive headings and DM Sans for functional copy. Give typography and space the work usually assigned to cards and decoration.
- Prefer quiet, unboxed compositions, thin rules, and deliberate alignment. Seek a layout that fits the content instead of defaulting to a centered hero followed by interchangeable card grids.
- Novelty must improve hierarchy or comprehension. Keep familiar controls and expected interaction behavior.
- The landing page has its main composition and exactly one lower explanation section. Add further sections only when the user changes that scope.

## Content and interaction

- Explain the result in plain English. Mention MCP, hooks, or vault plumbing only when the user needs that detail to make a decision.
- Keep one primary action per screen or step. Secondary actions should be visibly quieter and appear where they are needed.
- Ask for the minimum information needed now. Prefer a short sequence over a dense form when the next step depends on the first.
- Keep actionable controls honest: implement them, explain their limited demo effect, or remove them. Do not show decorative controls that do nothing.
- Place loading, success, and recoverable errors near the action that caused them. Retain useful input after a correctable error and make retries possible.
- Use visible labels, semantic controls, keyboard access, visible focus, touch targets of about 44 px, and reduced-motion behavior. Check narrow screens without horizontal overflow.
- Disclose demo behavior where it affects expectations. Do not repeat the same disclaimer throughout a page.

## Authentication-specific boundaries

The current experience is a frontend simulation. The authenticator step accepts the demo code `0000`; it is not real MFA, Google sign-in, or a connection to Google Authenticator. Never ask users to paste real passwords, OTP seeds, backup codes, or provider tokens into this demo.

Account connections, agent selection, access pause/resume, and sign-out represent local demo state. Do not imply that selecting an agent installs a plugin or that removing a demo account revokes a real provider session. Keep that distinction clear without placing implementation details in every flow.

Avoid universal login promises, unverified platform support, partner logos presented as endorsements, fabricated customer proof, and absolute security claims. Use the [product plan](../../../docs/product-plan.md) and [dated platform research](../../../docs/research/agent-login-platforms.md) when a change depends on those facts.

## Final review

Read the page aloud once and remove repetition. Check that a new user can tell what the product does, what happens next, and whether they are using a demo. Walk the primary flow and its likely error, back, retry, and exit paths on desktop and mobile. Add back only the information that resolves a concrete gap found in that review.
