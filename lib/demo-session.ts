import { AGENT_NAMES, findPlatform, normalizePlatformOrigin, type AgentName } from "./platforms";

// Frontend demonstration state only. Never accept or persist a password here.
export type { AgentName } from "./platforms";
export type ServiceName = string;
export type DemoAccount = {
  id: string;
  service: ServiceName;
  agent: AgentName | "";
  agents: AgentName[];
  origin: string;
  username: string;
  createdAt: string;
  credentialUpdatedAt: string;
  credentialVersion: number;
  simulated: true;
};
export type DemoSession = { email: string; displayName?: string; accounts: DemoAccount[]; accessPaused: boolean };
export const DEMO_SESSION_EVENT = "through:session-change";
const STORAGE_KEY = "through.demo.v1";
const controls = /[\u0000-\u001f\u007f-\u009f]/;

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}
function cleanText(value: unknown, max: number, required = false): value is string {
  return typeof value === "string" && (!required || value.trim().length > 0) && [...value].length <= max && !controls.test(value);
}
function validDate(value: unknown): value is string {
  return typeof value === "string" && (value === "" || (value.length <= 40 && Number.isFinite(Date.parse(value))));
}
function readAccount(value: unknown): DemoAccount | null {
  if (!isRecord(value) || !cleanText(value.id, 128, true) || !cleanText(value.service, 80, true)) return null;
  const legacy = value.origin === undefined && value.agents === undefined;
  const selectedAgents = Array.isArray(value.agents) ? value.agents : legacy && AGENT_NAMES.includes(value.agent as AgentName) ? [value.agent] : null;
  if (!selectedAgents || selectedAgents.length > AGENT_NAMES.length || !selectedAgents.every(agent => AGENT_NAMES.includes(agent as AgentName)) || new Set(selectedAgents).size !== selectedAgents.length) return null;
  let origin: string;
  try { origin = normalizePlatformOrigin(typeof value.origin === "string" ? value.origin : findPlatform(value.service)?.origin ?? ""); }
  catch { return null; }
  const username = legacy ? "" : value.username;
  const createdAt = legacy ? "" : value.createdAt;
  const credentialUpdatedAt = legacy ? "" : value.credentialUpdatedAt;
  const credentialVersion = legacy ? 1 : value.credentialVersion;
  if (!cleanText(username, 254) || !validDate(createdAt) || !validDate(credentialUpdatedAt) || !Number.isSafeInteger(credentialVersion) || (credentialVersion as number) < 1) return null;
  const agents = selectedAgents as AgentName[];
  return { id: value.id, service: value.service, agent: agents[0] ?? "", agents: [...agents], origin, username, createdAt, credentialUpdatedAt, credentialVersion: credentialVersion as number, simulated: true };
}

function parseSession(value: unknown): DemoSession | null {
  if (!isRecord(value) || !cleanText(value.email, 254, true) || !/^[^\s@]+@[^\s@]+$/.test(value.email)
    || typeof value.accessPaused !== "boolean" || (value.displayName !== undefined && !cleanText(value.displayName, 80))
    || !Array.isArray(value.accounts) || value.accounts.length > 100) return null;
  const accounts = value.accounts.map(readAccount);
  if (accounts.some(account => !account)) return null;
  const parsedAccounts = accounts as DemoAccount[];
  if (new Set(parsedAccounts.map(account => account.id)).size !== parsedAccounts.length) return null;
  return { email: value.email, displayName: typeof value.displayName === "string" ? value.displayName : "", accounts: parsedAccounts, accessPaused: value.accessPaused };
}

export function readDemoSession(): DemoSession | null {
  if (typeof window === "undefined") return null;
  try {
    const serialized = window.sessionStorage.getItem(STORAGE_KEY);
    const session = parseSession(JSON.parse(serialized || "null"));
    // Migrate v1 accounts and remove unknown fields through a metadata allowlist.
    if (session && JSON.stringify(session) !== serialized) window.sessionStorage.setItem(STORAGE_KEY, JSON.stringify(session));
    return session;
  } catch { return null; }
}

export function saveDemoSession(session: DemoSession): void {
  const safe = parseSession(session);
  if (!safe) throw new Error("Invalid demo session.");
  window.sessionStorage.setItem(STORAGE_KEY, JSON.stringify(safe));
  window.dispatchEvent(new Event(DEMO_SESSION_EVENT));
}
export function startDemoSession(email: string): DemoSession {
  const session: DemoSession = { email: email.trim(), accounts: [], accessPaused: false };
  saveDemoSession(session);
  return session;
}
export function clearDemoSession(): void {
  window.sessionStorage.removeItem(STORAGE_KEY);
  window.dispatchEvent(new Event(DEMO_SESSION_EVENT));
}
