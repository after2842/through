import {
  clearDemoSession, readDemoSession, saveDemoSession, startDemoSession,
  DEMO_SESSION_EVENT, type AgentName, type DemoAccount, type DemoSession, type ServiceName,
} from "./demo-session";

export type Role = "owner" | "admin" | "member" | "viewer";
export type WorkspaceSession = DemoSession & {
  user: { id: string; email: string; role: Role };
  workspace: { id: string; name: string };
  backend: boolean;
};
export type SignInChallenge = { challengeId: string; email: string; expiresAt: string };
export type AuditEvent = { id: number; action: string; actorEmail: string; occurredAt: string; target?: string };
export type AuditPage = { events: AuditEvent[]; nextCursor?: string };
export type Handoff = { id: string; accountId: string; agent: AgentName; targetOrigin: string; status: string; simulated: boolean; createdAt: string };
type WireSession = {
  user: WorkspaceSession["user"];
  workspace: WorkspaceSession["workspace"] & { accessPaused: boolean };
  accounts: DemoAccount[];
  csrfToken: string;
  mode: string;
};

export const serviceMode = process.env.NEXT_PUBLIC_API_MODE === "service";
export { DEMO_SESSION_EVENT };
let csrfToken = "";
const auditKey = "through.demo.activity.v1";
const browserKey = "through.demo.browser.v1";

export class APIError extends Error {
  constructor(message: string, public status: number, public code: string) {
    super(message);
    this.name = "APIError";
  }
}
export function errorMessage(error: unknown): string {
  return error instanceof APIError ? error.message : "Something went wrong. Please try again.";
}
export function canManage(session: WorkspaceSession): boolean {
  return session.user.role === "owner" || session.user.role === "admin";
}
function notifySession() { window.dispatchEvent(new Event(DEMO_SESSION_EVENT)); }
function localSession(session: DemoSession): WorkspaceSession {
  return { ...session, user: { id: "local-demo", email: session.email, role: "owner" }, workspace: { id: "local-demo", name: "Your workspace" }, backend: false };
}
function acceptSession(session: WireSession): WorkspaceSession {
  csrfToken = session.csrfToken;
  return { email: session.user.email, user: session.user, workspace: session.workspace, accounts: session.accounts, accessPaused: session.workspace.accessPaused, backend: true };
}
async function request<T>(path: string, options: { method?: string; body?: unknown; authenticated?: boolean; idempotencyKey?: string } = {}): Promise<T> {
  const method = options.method ?? "GET";
  if (options.authenticated && !csrfToken) {
    const session = await getSession();
    if (!session) throw new APIError("Your session ended. Please sign in again.", 401, "unauthenticated");
  }
  const headers: Record<string, string> = { Accept: "application/json" };
  if (options.body !== undefined) headers["Content-Type"] = "application/json";
  if (options.authenticated && method !== "GET") headers["X-CSRF-Token"] = csrfToken;
  if (options.idempotencyKey) headers["Idempotency-Key"] = options.idempotencyKey;
  let response: Response;
  try {
    response = await fetch(`/api/v1${path}`, { method, headers, credentials: "same-origin", cache: "no-store", body: options.body === undefined ? undefined : JSON.stringify(options.body), signal: AbortSignal.timeout(12000) });
  } catch {
    throw new APIError("We couldn’t reach through. Check your connection and try again.", 0, "network_error");
  }
  if (!response.ok) {
    const problem = await response.json().catch(() => null);
    if (response.status === 401) csrfToken = "";
    throw new APIError(problem?.error?.message ?? "This request couldn’t be completed. Please try again.", response.status, problem?.error?.code ?? "request_failed");
  }
  if (response.status === 204) return undefined as T;
  return response.json() as Promise<T>;
}

export async function getSession(): Promise<WorkspaceSession | null> {
  if (!serviceMode) {
    const session = readDemoSession();
    return session ? localSession(session) : null;
  }
  try { return acceptSession(await request<WireSession>("/session")); }
  catch (error) {
    if (error instanceof APIError && error.status === 401) return null;
    throw error;
  }
}
export async function requestSignIn(email: string): Promise<SignInChallenge> {
  const normalized = email.trim().toLowerCase();
  if (serviceMode) {
    const challenge = await request<{ challengeId: string; expiresAt: string }>("/auth/challenges", { method: "POST", body: { email: normalized } });
    return { ...challenge, email: normalized };
  }
  return { challengeId: crypto.randomUUID(), email: normalized, expiresAt: new Date(Date.now() + 5 * 60_000).toISOString() };
}
export async function verifySignIn(challenge: SignInChallenge, code: string): Promise<WorkspaceSession> {
  if (serviceMode) {
    const session = acceptSession(await request<WireSession>("/auth/verify", { method: "POST", body: { challengeId: challenge.challengeId, code } }));
    notifySession();
    return session;
  }
  if (new Date(challenge.expiresAt).getTime() < Date.now()) throw new APIError("This code has expired. Change your email to start again.", 401, "challenge_expired");
  if (code !== "0000") throw new APIError("Use 0000 to try this demo.", 401, "invalid_code");
  const session = localSession(startDemoSession(challenge.email));
  window.sessionStorage.removeItem(auditKey);
  recordDemoEvent(session, "session.created");
  return session;
}
export async function signOut(): Promise<void> {
  if (serviceMode) {
    await request<void>("/auth/logout", { method: "POST", authenticated: true });
    csrfToken = "";
    notifySession();
  } else {
    clearDemoSession();
    window.sessionStorage.removeItem(auditKey);
  }
}
function requireLocalSession(): WorkspaceSession {
  const session = readDemoSession();
  if (!session) throw new APIError("Your session ended. Please sign in again.", 401, "unauthenticated");
  return localSession(session);
}
function readDemoEvents(): AuditEvent[] {
  try {
    const data: unknown = JSON.parse(window.sessionStorage.getItem(auditKey) || "[]");
    if (!Array.isArray(data)) return [];
    return data.filter((event): event is AuditEvent => event && Number.isSafeInteger(event.id) && typeof event.action === "string" && typeof event.actorEmail === "string" && typeof event.occurredAt === "string" && Number.isFinite(Date.parse(event.occurredAt)) && (event.target === undefined || typeof event.target === "string"));
  } catch { return []; }
}
function recordDemoEvent(session: WorkspaceSession, action: string, target?: string) {
  const events = readDemoEvents();
  const event = { id: Math.max(Date.now(), ...events.map(item => item.id + 1)), action, actorEmail: session.email, occurredAt: new Date().toISOString(), target };
  window.sessionStorage.setItem(auditKey, JSON.stringify([event, ...events].slice(0, 100)));
}
export async function createAccount(service: ServiceName, agent: AgentName): Promise<WorkspaceSession> {
  if (serviceMode) {
    const session = acceptSession(await request<WireSession>("/accounts", { method: "POST", body: { service, agent }, authenticated: true }));
    notifySession(); return session;
  }
  const session = requireLocalSession();
  if (session.accounts.some(account => account.service === service && account.agent === agent)) throw new APIError(`${service} is already connected for ${agent}.`, 409, "duplicate_account");
  const next = { ...session, accounts: [...session.accounts, { id: crypto.randomUUID(), service, agent }] };
  saveDemoSession(next); recordDemoEvent(next, "account.connected", `${service} / ${agent}`); return next;
}
export async function removeAccount(id: string): Promise<WorkspaceSession> {
  if (serviceMode) {
    const session = acceptSession(await request<WireSession>(`/accounts/${encodeURIComponent(id)}`, { method: "DELETE", authenticated: true }));
    notifySession(); return session;
  }
  const session = requireLocalSession();
  const account = session.accounts.find(item => item.id === id);
  const next = { ...session, accounts: session.accounts.filter(item => item.id !== id) };
  saveDemoSession(next); recordDemoEvent(next, "account.revoked", account ? `${account.service} / ${account.agent}` : undefined); return next;
}
export async function setAccessPaused(paused: boolean): Promise<WorkspaceSession> {
  if (serviceMode) {
    const session = acceptSession(await request<WireSession>("/workspace/access", { method: "PATCH", body: { paused }, authenticated: true }));
    notifySession(); return session;
  }
  const session = requireLocalSession();
  const next = { ...session, accessPaused: paused };
  saveDemoSession(next); recordDemoEvent(next, paused ? "workspace.paused" : "workspace.resumed"); return next;
}
export async function getAudit(cursor?: string): Promise<AuditPage> {
  if (serviceMode) return request<AuditPage>(`/audit?limit=25${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ""}`);
  requireLocalSession();
  return { events: readDemoEvents() };
}
export async function testHandoff(account: DemoAccount, idempotencyKey: string): Promise<Handoff> {
  const origins = { GitHub: "https://github.com", Linear: "https://linear.app", Notion: "https://www.notion.so" };
  let browserSessionId = window.sessionStorage.getItem(browserKey);
  if (!browserSessionId) { browserSessionId = crypto.randomUUID(); window.sessionStorage.setItem(browserKey, browserSessionId); }
  const body = { accountId: account.id, agent: account.agent, targetOrigin: origins[account.service], browserSessionId, tabId: "demo-tab" };
  if (serviceMode) return request<Handoff>("/handoffs", { method: "POST", body, authenticated: true, idempotencyKey });
  const session = requireLocalSession();
  if (session.accessPaused || !session.accounts.some(item => item.id === account.id)) throw new APIError("Access is paused or this connection was removed.", 403, "access_denied");
  const result = { id: crypto.randomUUID(), ...body, status: "simulated", simulated: true, createdAt: new Date().toISOString() };
  recordDemoEvent(session, "handoff.simulated", `${account.service} / ${account.agent}`);
  return result;
}
