#!/usr/bin/env node
// Generates the manifests and README of plugin/through for a deployed origin.
// The skill and icons in plugin/through are edited by hand; everything this
// script writes is regenerated, so edit it here.
//
//   node scripts/build-plugin.mjs https://through-123.us-central1.run.app
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const origin = (process.argv[2] ?? "").replace(/\/+$/, "");
if (!/^https:\/\/[a-z0-9.-]+$/.test(origin)) {
  console.error("Usage: node scripts/build-plugin.mjs https://your-through-host");
  process.exit(1);
}

const root = join(dirname(fileURLToPath(import.meta.url)), "..", "plugin", "through");
const version = "0.1.0";
const repository = "https://github.com/after2842/through";
const support = `${repository}/issues`;
const description = "Lets AI agents check and request sign-in to websites with accounts you connected to through, without ever asking for your password.";
const author = { name: "Samuel Choi", url: repository };
const keywords = ["sign-in", "login", "browser", "agents", "permissions"];

const interfaceFields = {
  displayName: "through",
  shortDescription: "Sign-in for AI agents",
  longDescription:
    "When an agent's browser reaches a login page, through checks whether that agent may use one of your connected accounts for the site and records a single-use, 60-second sign-in grant. You choose the accounts, the sites, and which agents may use each one, and you can pause access or disconnect an app at any time. through never asks for or returns passwords. This is a preview: sign-in grants are simulated and no credentials are entered, so the agent asks you to finish signing in yourself.",
  developerName: "Samuel Choi",
  category: "Productivity",
  capabilities: ["Read", "Write"],
  websiteURL: origin,
  supportURL: support,
  privacyPolicyURL: `${origin}/privacy/`,
  termsOfServiceURL: `${origin}/terms/`,
  defaultPrompt: [
    "Check whether you can sign in to GitHub with through.",
    "Which of my accounts in through can you use?",
    "Show my recent sign-in activity in through.",
  ],
  brandColor: "#3E7695",
  composerIcon: "./assets/icon.svg",
  logo: "./assets/logo.svg",
};

const files = {
  // Claude (Claude Code, Cowork, claude.ai plugins)
  ".claude-plugin/plugin.json": { name: "through", version, description, author, homepage: origin, repository, license: "Proprietary", keywords, privacyPolicyUrl: `${origin}/privacy/` },
  ".mcp.json": { mcpServers: { through: { type: "http", url: `${origin}/mcp` } } },
  // Portable Agent Plugins manifest with OpenAI (ChatGPT, Codex) settings
  "plugin.json": {
    $schema: "https://agent-plugins.org/schemas/1.0.0/plugin.schema.json",
    name: "through", version, description, author, homepage: origin, repository, license: "Proprietary", keywords,
    extensions: { "com.openai": { interface: interfaceFields } },
  },
  "mcp.json": {
    $schema: "https://agent-plugins.org/schemas/1.0.0/mcp.schema.json",
    mcpServers: { through: { type: "streamable-http", url: `${origin}/mcp`, extensions: { "com.openai": { auth: { type: "oauth", client: { mode: "dcr" } } } } } },
  },
  // Codex compatibility manifest, read only when plugin.json has no OpenAI extension
  ".codex-plugin/plugin.json": { name: "through", version, description, author, homepage: origin, repository, license: "Proprietary", keywords, skills: "./skills/", mcpServers: "./.mcp.json", interface: interfaceFields },
};

for (const [path, data] of Object.entries(files)) {
  const target = join(root, path);
  mkdirSync(dirname(target), { recursive: true });
  writeFileSync(target, JSON.stringify(data, null, 2) + "\n");
}

writeFileSync(join(root, "README.md"), `# through

through lets an AI agent continue a browser task when it reaches a login page. You connect the website accounts you want agents to use, choose which agents may use each one, and the agent asks through before signing in. through never asks for, stores, or returns passwords through this plugin.

> **Preview.** Sign-in grants are simulated: through records a single-use, 60-second grant but does not enter credentials into the website. The agent asks you to finish signing in yourself, then continues.

## What it includes

- **MCP server** \`${origin}/mcp\` (remote, Streamable HTTP, OAuth sign-in). Tools:
  - \`list_sign_in_accounts\` (read-only): your connected accounts and whether this agent may use each one.
  - \`check_sign_in_access\` (read-only): whether this agent may sign in to a given website.
  - \`request_sign_in\`: records a single-use sign-in grant for a website, for owner and admin connections.
  - \`list_recent_sign_in_activity\` (read-only): recent activity, for owner and admin connections.
- **Skill** \`sign-in-with-through\`: tells the agent when to use these tools and never to ask for passwords in the conversation.

There are no hooks, local servers, or scripts.

## Setup

1. Install the plugin. In Claude Code: \`/plugin install through --marketplace after2842/through\`. Or add \`${origin}/mcp\` as a custom connector in Claude or ChatGPT.
2. When prompted, sign in to through and choose which agent this connection signs in as (Claude, Codex, or Cursor).
3. In through, connect an account and allow that agent to use it.

Try: "Check whether you can sign in to GitHub with through."

## Data and privacy

The plugin sends tool inputs to the through server at ${origin}: a website address, and optionally a browser tab identifier, browser session identifier, account ID, and request key. through returns account labels, sign-in domains, permission status, grant receipts, and, for owners and admins, recent activity. It does not receive your conversation. Signing in uses OAuth; through stores access tokens only as hashes.

Privacy policy: ${origin}/privacy/ · Terms: ${origin}/terms/

You can disconnect the app in through's Settings at any time; its access ends immediately.

## Support

Open an issue at ${support}.

## License

Proprietary. All rights reserved.
`);

console.log(`Wrote plugin/through for ${origin}`);
