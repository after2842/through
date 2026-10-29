export const AGENT_NAMES = ["Claude", "Codex", "Cursor"] as const;
export type AgentName = typeof AGENT_NAMES[number];
export type Platform = { name: string; origin: string };

// These are suggested destinations, not verified login integrations.
export const PLATFORMS: readonly Platform[] = [
  { name: "GitHub", origin: "https://github.com" },
  { name: "Linear", origin: "https://linear.app" },
  { name: "Notion", origin: "https://www.notion.so" },
  { name: "Figma", origin: "https://www.figma.com" },
  { name: "Slack", origin: "https://app.slack.com" },
  { name: "Google Workspace", origin: "https://accounts.google.com" },
  { name: "Microsoft 365", origin: "https://login.microsoftonline.com" },
  { name: "Atlassian", origin: "https://id.atlassian.com" },
  { name: "Airtable", origin: "https://airtable.com" },
  { name: "Asana", origin: "https://app.asana.com" },
  { name: "Vercel", origin: "https://vercel.com" },
  { name: "Dropbox", origin: "https://www.dropbox.com" },
  { name: "HubSpot", origin: "https://app.hubspot.com" },
  { name: "Salesforce", origin: "https://login.salesforce.com" },
];

export function findPlatform(name: string): Platform | undefined {
  return PLATFORMS.find(platform => platform.name === name);
}

export function normalizePlatformOrigin(input: string): string {
  const value = input.trim();
  if (!value || value.length > 2048 || /[\s\\\u0000-\u001f\u007f-\u009f]/.test(value)) {
    throw new Error("Enter a public website domain, such as app.example.com.");
  }
  const address = /^[a-z][a-z0-9+.-]*:\/\//i.test(value) ? value : `https://${value}`;
  let url: URL;
  try { url = new URL(address); }
  catch { throw new Error("Enter a valid website domain."); }
  // Check the input authority as well: URL removes an explicit default port.
  const authority = address.slice(address.indexOf("://") + 3).split(/[/?#]/)[0];
  if (!authority || url.protocol !== "https:" || url.username || url.password || authority.includes(":") || authority.includes("@")) {
    throw new Error("Use an HTTPS website without a port or sign-in details.");
  }
  if (url.pathname !== "/" || address.includes("?") || address.includes("#")) {
    throw new Error("Use just the website domain, without a page path, query, or fragment.");
  }
  const hostname = url.hostname;
  const labels = hostname.split(".");
  if (hostname.length > 253 || labels.length < 2 || labels.some(label => !/^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/.test(label))
    || !/^(?:[a-z]{2,63}|xn--[a-z0-9-]{2,59})$/.test(labels[labels.length - 1])
    || /(?:^|\.)(?:localhost|local|internal|test|invalid|home|lan|intranet|corp)$/.test(hostname)) {
    throw new Error("Use a public website domain. Local addresses and IP addresses aren’t supported.");
  }
  return url.origin;
}

export function platformHost(origin: string): string {
  try { return new URL(normalizePlatformOrigin(origin)).hostname; }
  catch { return ""; }
}
