// Frontend demonstration state only. This is not an authentication boundary.
export type AgentName = "Claude" | "Codex" | "Cursor";
export type ServiceName = "GitHub" | "Linear" | "Notion";
export type DemoAccount = { id: string; service: ServiceName; agent: AgentName };
export type DemoSession = { email: string; accounts: DemoAccount[]; accessPaused: boolean };

const STORAGE_KEY = "through.demo.v1";
const services: ServiceName[] = ["GitHub", "Linear", "Notion"];
const agents: AgentName[] = ["Claude", "Codex", "Cursor"];

function isDemoSession(value: unknown): value is DemoSession {
  if (!value || typeof value !== "object") return false;
  const session = value as Partial<DemoSession>;
  return typeof session.email === "string" && session.email.length <= 254
    && /^[^\s@]+@[^\s@]+$/.test(session.email)
    && typeof session.accessPaused === "boolean"
    && Array.isArray(session.accounts) && session.accounts.length <= 9
    && session.accounts.every((account: unknown) => {
      if (!account || typeof account !== "object") return false;
      const entry = account as Partial<DemoAccount>;
      return typeof entry.id === "string" && entry.id.length > 0 && entry.id.length <= 128
        && services.includes(entry.service as ServiceName) && agents.includes(entry.agent as AgentName);
    })
    && new Set(session.accounts.map(account => account.id)).size === session.accounts.length
    && new Set(session.accounts.map(account => `${account.service}:${account.agent}`)).size === session.accounts.length;
}

export function readDemoSession(): DemoSession | null {
  if (typeof window === "undefined") return null;
  try {
    const value: unknown = JSON.parse(window.sessionStorage.getItem(STORAGE_KEY) || "null");
    return isDemoSession(value) ? value : null;
  } catch { return null; }
}

export function saveDemoSession(session: DemoSession): void {
  if (!isDemoSession(session)) throw new Error("Invalid demo session.");
  window.sessionStorage.setItem(STORAGE_KEY, JSON.stringify({
    email: session.email,
    accounts: session.accounts.map(({ id, service, agent }) => ({ id, service, agent })),
    accessPaused: session.accessPaused,
  }));
}

export function startDemoSession(email: string): DemoSession {
  const session: DemoSession = { email: email.trim(), accounts: [], accessPaused: false };
  saveDemoSession(session);
  return session;
}

export function clearDemoSession(): void {
  window.sessionStorage.removeItem(STORAGE_KEY);
}
