# Login handoff in existing AI agent browsers

Research snapshot: October 28, 2026, America/Los_Angeles.

Provenance: English adaptation of the project's earlier `agent-login-platform-research.md`, researched on the same date. That report reviewed official documentation and the installed Codex browser-tool documentation. This repository copy preserves its findings and source links; it is not a new verification pass. No plugins were installed, no real-account sign-ins were tested, and no marketplace review or partnership request was performed. Platform capabilities and submission policies may change; verify them again before implementation or public claims.

The product under consideration completes a login in the **same browser tab an existing agent is already using**, then lets that agent resume its original task. Users may connect their accounts in advance. Moving the task to through's own replacement browser is outside this evaluation.

## Findings and confidence

There are plugin distribution routes. The reviewed public documentation did not establish a universal standard that gives a registered plugin login privileges across every agent's built-in browser. Each host needs its own integration path.

For the exact built-in-browser requirement, **local Cursor is the first proof-of-concept candidate**. Its documented tool-input replacement hook provides a reason to test whether an existing browser call can be connected to a local helper. This is an inference from documentation, not a tested login integration or a guarantee of secret protection. [Cursor Hooks](https://cursor.com/docs/hooks)

If an existing Chrome tab is acceptable, **Claude Code with Chrome is another candidate**. Its browser tools are exposed through MCP and its hooks can update MCP tool arguments. This path must be described separately from an in-app browser. [Claude Code Chrome](https://code.claude.com/docs/en/chrome), [Claude Code Hooks](https://code.claude.com/docs/en/hooks#match-mcp-tools)

The labels below have specific meanings:

- **Documented:** described by the cited platform material at the time of the original review.
- **Hypothesis:** a proposed combination or implementation that has not been exercised.
- **Unconfirmed:** the review did not find a public contract. It does not establish that a private partner API cannot exist.

## Platform comparison

| Platform and environment | Distribution route | Existing-tab finding | Product assessment |
|---|---|---|---|
| Cursor local IDE and built-in browser | Plugins can package MCP, hooks, and skills; marketplace review | General tool-input replacement documented; browser-specific secret-fill or cookie-injection contract unconfirmed | First built-in-browser PoC candidate |
| Claude Code with Chrome | Plugins, local MCP, hooks, and Chrome extension | Chrome tools exposed through MCP; MCP argument replacement documented | Same-Chrome-tab PoC candidate; not an in-app browser |
| Claude Desktop with Chrome | Plugins/local connections and Chrome extension | 1Password has a real direct-fill integration | UX precedent; equivalent third-party access unconfirmed |
| Claude Cowork built-in browser | Plugins and local MCP on the user's computer | Cookie import and login persistence documented; external login-provider API unconfirmed | Separate technical validation or platform discussion needed |
| Codex desktop and built-in browser | Plugins, MCP, local hooks | General input replacement and protected user login exist; third-party vault-provider API unconfirmed | Separate local feasibility from public distribution eligibility |
| GitHub Copilot / VS Code built-in browser | Agent Plugins or VS Code extensions and tool API | Existing-tab sharing and tool invocation documented; protected external credential entry unconfirmed | Extension-based PoC candidate |
| Google Antigravity App/CLI with Chrome | Plugins, MCP, local installation | Chrome DevTools MCP used; helper access to the same connection needs testing | Chrome candidate, distinct from a standalone in-app browser |
| Gemini CLI browser agent | Extensions can package MCP and hooks | Existing Chrome connection available; form-fill confirmation policy applies | Possible integration, but uninterrupted operation cannot be promised |

## Cursor

**Documented.** Plugins package MCP, hooks, skills, and related capabilities. Public marketplace distribution is reviewed. The extension API includes `vscode.cursor.mcp.registerServer` and `vscode.cursor.plugins.registerPath`. These register configuration and plugins; they should not be interpreted as browser-control APIs. [Plugins](https://cursor.com/docs/plugins), [Plugin reference](https://cursor.com/docs/reference/plugins), [Extension API](https://cursor.com/docs/extension-api)

`preToolUse` runs before a tool call and can replace the input object using `updated_input`. This supports a hypothesis in which the model carries only an account reference and a local execution component supplies the needed value. Whether the hook affects actual built-in browser calls, and whether replaced values appear in UI, transcripts, logs, or DOM observations, remain untested. Cloud Agent HTTP MCP has an exception where input replacement is ignored, so the proposed first experiment is local. [Hooks](https://cursor.com/docs/hooks)

The built-in browser retains cookies, local storage, and IndexedDB per workspace. This could help reuse a successful login, but persistence does not itself provide an external identity-provider interface. [Browser](https://cursor.com/docs/agent/tools/browser)

**Proposed experiment.** Use a harmless string on a test login page. Replace it through the hook and inspect the same tab plus every observation/logging surface. Only after that result should the team design vault integration and protected secret entry.

## Claude Code, Desktop, and Cowork

**Claude Code with Chrome.** This path uses existing Chrome tabs and login state; `claude-in-chrome` tools appear in `/mcp`. Official documentation also describes asking the user to handle login and CAPTCHA. `PreToolUse` applies to MCP tools and can replace arguments through `updatedInput`. Combining those capabilities is a PoC hypothesis, not a promise that arbitrary credentials remain protected. [Chrome](https://code.claude.com/docs/en/chrome), [Hooks](https://code.claude.com/docs/en/hooks#pretooluse-decision-control)

**Plugin distribution.** Claude Code plugins bundle skills, hooks, MCP, and other capabilities. Running a local server from a plugin directory is documented. That does not mean an additional Chrome extension is installed automatically. [Plugins](https://code.claude.com/docs/en/plugins), [Plugin reference](https://code.claude.com/docs/en/plugins-reference)

**Desktop and Cowork are separate surfaces.** Cowork running on the user's computer and Claude Code can use local MCP; ordinary Chat has a different capability set. Cowork's built-in browser supports site cookie import and persistent login. The original review did not find a public API for a general developer to install an extension or attach an external vault's protected fill operation to that browser. [Platform support](https://claude.com/docs/plugins/platform-support), [Cowork built-in browser](https://support.claude.com/en/articles/16607400-use-the-built-in-browser-in-claude-cowork)

The 1Password integration below is a concrete precedent for Claude Desktop with Chrome, not proof that every Claude surface exposes the same interface.

## Codex

**Execution capabilities.** Official documentation describes observing, blocking, and replacing arguments to local function and MCP tools through `PreToolUse`. Some specialized paths are exceptions. Applicability to the actual built-in browser call must be tested. A general hook is not equivalent to a protected external-vault login API. [Hooks](https://learn.chatgpt.com/docs/hooks)

**Login path.** The built-in browser has a separate profile from ordinary Chrome. Its protected login form can pass a password to the browser without showing the value to the model. The original review also observed this structure in installed browser-tool documentation, but did not identify a public contract for third-party vault providers. Developer-mode CDP access does not by itself establish such a contract. [Browser](https://learn.chatgpt.com/docs/browser)

**Public distribution constraints found in the review:**

- Desktop-only public submissions that include local MCP were described as available to approved partners. This is distinct from manual installation. [Desktop-only submission](https://developers.openai.com/plugins/deploy/desktop-only)
- Plugins with lifecycle hooks were described as ineligible for public directory submission, with manual desktop installation as the documented route. [Plugin packaging](https://developers.openai.com/plugins/build/plugins)
- General submission guidance restricts collecting, requesting, or processing authentication secrets such as passwords, MFA/OTP, and API keys. A product handling external credentials cannot assume ordinary public submission eligibility; design suitability or a partner route must be established. [Plugin guidelines](https://developers.openai.com/plugins/plugin-guidelines)

Local technical feasibility and official-directory distribution are therefore separate questions. Registering a plugin is not sufficient evidence that this product can launch through the public directory.

## GitHub Copilot / VS Code

Agent Plugins distribute agent configuration; VS Code extensions can also supply executable code and Language Model Tools. These are distinct packaging models. An extension is worth examining for the runtime that targets an existing tab. General tool invocation does not guarantee access to a built-in browser tool or safe credential handling. [Agent Plugins](https://code.visualstudio.com/docs/agent-customization/agent-plugins), [Language Model Tool API](https://code.visualstudio.com/api/extension-guides/ai/tools), [VS Code API](https://code.visualstudio.com/api/references/vscode-api)

Agent-opened pages use isolated temporary sessions, while user-shared tabs retain their existing cookies and login state. Tab permissions also vary by agent session. Any login runtime must preserve the intended tab, session, and permission boundary. [Browser tools](https://code.visualstudio.com/docs/agents/run/browser-tools)

**Proposed experiment.** Enumerate tools available to an extension and test harmless input in an existing tab through the public invocation API. If stable tab identification and access cannot be established, an additional platform interface is needed.

## Google Antigravity and Gemini CLI

Antigravity App/CLI browser work uses actual Chrome through Chrome DevTools MCP, with plugin, GitHub, and local installation routes. This makes an authorized local helper a candidate for same-browser testing. Documentation alone does not establish that a third party can share the exact connection safely. [Browser command](https://antigravity.google/docs/commands/browser), [Plugins](https://antigravity.google/docs/plugins)

Gemini CLI provides existing-Chrome connection and persistent-login modes; Extensions can package MCP and hooks. The reviewed browser documentation specifies user confirmation for `fill` and `fill_form` separately from approval mode. Installing an external login tool does not establish a right to remove the host's confirmation policy. [Subagents](https://geminicli.com/docs/core/subagents/), [Extensions](https://geminicli.com/docs/extensions/)

## Existing comparable product: 1Password

**Claude integration.** 1Password for Claude connects Claude Desktop and its Chrome extension to fill credentials directly into the same page. Its documented design verifies the signed partner application's identity, suspends Claude's page observation during filling, and keeps secrets outside the model. This is a dedicated security integration rather than evidence that an ordinary plugin registration receives equivalent privileges. [Security design](https://support.1password.com/1password-claude-security/), [Claude usage requirements](https://support.claude.com/en/articles/15936181-get-started-with-1password-for-claude)

**Agentic Autofill partner preview.** The reviewed partner documentation describes OAuth authorization followed by a Chromium extension filling user-approved login items in a specified tab. It explicitly describes a pre-general-availability interface that may change. The documented scope at the time was username, password, and OTP; passkeys and social login were excluded. [Partner guide](https://www.1password.dev/agentic-autofill/partners)

The preview FAQ describes reusing an approved login grant for 30 days, including filling while the user is absent. This differs from the existing Claude integration's session-based approval model. A valid grant does not remove additional authentication required by the destination website. [FAQ](https://www.1password.dev/agentic-autofill/partners/faq)

**Product inference.** There is already direct competition in agent-assisted login. Potential differentiation includes multiple agents' built-in browsers, other password managers and enterprise accounts, and reliable session recovery and task resumption. Those are opportunities to investigate, not findings that market size or willingness to pay has been validated.

## Recommended validation sequence

1. Test harmless input replacement in Cursor's local built-in browser. Establish the actual browser-tool call and hook coverage.
2. Repeat with Claude Code and existing Chrome, clearly identifying it as a separate browser path. An installed Chrome extension and local MCP may be needed.
3. Treat field entry and secret protection as separate gates. Inspect arguments, responses, transcripts, logs, DOM snapshots, screenshots, and other agents observing concurrently. Start with traceable test strings, not real passwords.
4. Test a small set of supported sites for success, extra verification, expired sessions, failure recovery, and resuming the original task. Measure interventions, login success, and task-resumption success.
5. Check distribution requirements for each actual target: Cursor review, Claude's differing surfaces, and Codex's local MCP, hook, and credential-handling restrictions. If protected entry or observation suspension is missing, make that specific capability the subject of a platform discussion.

The reviewed public material does not prove that a universal product can keep secrets out of models and logs on every target. It also does not show that all-platform partnerships are a prerequisite to the first harmless experiment. The current recommendation is to test Cursor for the built-in-browser requirement and Claude Code for an existing-Chrome path, then narrow product claims to what is demonstrated.
