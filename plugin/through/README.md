# through

through lets an AI agent continue a browser task when it reaches a login page. You connect the website accounts you want agents to use, choose which agents may use each one, and the agent asks through before signing in. through never asks for, stores, or returns passwords through this plugin.

> **Preview.** Sign-in grants are simulated: through records a single-use, 60-second grant but does not enter credentials into the website. The agent asks you to finish signing in yourself, then continues.

## What it includes

- **MCP server** `https://through-974039737273.us-central1.run.app/mcp` (remote, Streamable HTTP, OAuth sign-in). Tools:
  - `list_sign_in_accounts` (read-only): your connected accounts and whether this agent may use each one.
  - `check_sign_in_access` (read-only): whether this agent may sign in to a given website.
  - `request_sign_in`: records a single-use sign-in grant for a website, for owner and admin connections.
  - `list_recent_sign_in_activity` (read-only): recent activity, for owner and admin connections.
- **Skill** `sign-in-with-through`: tells the agent when to use these tools and never to ask for passwords in the conversation.

There are no hooks, local servers, or scripts.

## Setup

1. Install the plugin. In Claude Code: `/plugin install through --marketplace after2842/through`. Or add `https://through-974039737273.us-central1.run.app/mcp` as a custom connector in Claude or ChatGPT.
2. When prompted, sign in to through and choose which agent this connection signs in as (Claude, Codex, or Cursor).
3. In through, connect an account and allow that agent to use it.

Try: "Check whether you can sign in to GitHub with through."

## Data and privacy

The plugin sends tool inputs to the through server at https://through-974039737273.us-central1.run.app: a website address, and optionally a browser tab identifier, browser session identifier, account ID, and request key. through returns account labels, sign-in domains, permission status, grant receipts, and, for owners and admins, recent activity. It does not receive your conversation. Signing in uses OAuth; through stores access tokens only as hashes.

Privacy policy: https://through-974039737273.us-central1.run.app/privacy/ · Terms: https://through-974039737273.us-central1.run.app/terms/

You can disconnect the app in through's Settings at any time; its access ends immediately.

## Support

Open an issue at https://github.com/after2842/through/issues.

## License

Proprietary. All rights reserved.
