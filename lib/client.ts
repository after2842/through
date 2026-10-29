import {
  clearDemoSession, readDemoSession, saveDemoSession, startDemoSession,
  DEMO_SESSION_EVENT, type AgentName, type DemoAccount, type DemoSession, type ServiceName,
} from "./demo-session";
import { AGENT_NAMES, findPlatform, normalizePlatformOrigin } from "./platforms";

export type Role = "owner" | "admin" | "member" | "viewer";
export type WorkspaceSession = DemoSession & {
  user: { id: string; email: string; role: Role; displayName: string };
  workspace: { id: string; name: string };
  backend: boolean;
};
export type SignInChallenge = { challengeId: string; email: string; expiresAt: string };
export type AuditEvent = { id: number; action: string; actorEmail: string; occurredAt: string; target?: string; accountId?: string };
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
const demoHandoffs = new Map<string, { fingerprint: string; result: Handoff }>();
export type ConnectionInput = { service: string; origin: string; username: string; agents: AgentName[] };

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
  return { ...session, user: { id: "local-demo", email: session.email, role: "owner", displayName: session.displayName ?? "" }, workspace: { id: "local-demo", name: "Your workspace" }, backend: false };
}
function acceptSession(session: WireSession): WorkspaceSession {
  csrfToken = session.csrfToken;
  return { email: session.user.email, displayName: session.user.displayName ?? "", user: { ...session.user, displayName: session.user.displayName ?? "" }, workspace: session.workspace, accounts: session.accounts, accessPaused: session.workspace.accessPaused, backend: true };
}

export async function updateProfile(displayName: string): Promise<WorkspaceSession> {
  const name = displayName.trim();
  if ([...name].length > 80 || /[\u0000-\u001f\u007f-\u009f]/.test(name)) throw new APIError("Use a name of 80 characters or fewer, without control characters.", 400, "invalid_request");
  if (serviceMode) {
    const session = acceptSession(await request<WireSession>("/me", { method: "PATCH", body: { displayName: name }, authenticated: true }));
    notifySession(); return session;
  }
  const session = requireLocalSession();
  const next = { ...session, displayName: name, user: { ...session.user, displayName: name } };
  saveDemoSession(next); recordDemoEvent(next, "profile.updated"); return next;
}

export async function signOutOtherSessions(): Promise<{ revokedSessions: number }> {
  if (serviceMode) return request<{ revokedSessions: number }>("/auth/logout-others", { method: "POST", authenticated: true });
  requireLocalSession();
  return { revokedSessions: 0 };
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
  demoHandoffs.clear();
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
    window.sessionStorage.removeItem(browserKey);
    demoHandoffs.clear();
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
    return data.filter((event): event is AuditEvent => event && Number.isSafeInteger(event.id) && typeof event.action === "string" && event.action.length <= 80 && typeof event.actorEmail === "string" && event.actorEmail.length <= 254 && typeof event.occurredAt === "string" && Number.isFinite(Date.parse(event.occurredAt)) && (event.target === undefined || (typeof event.target === "string" && event.target.length <= 512)) && (event.accountId === undefined || (typeof event.accountId === "string" && event.accountId.length <= 128)))
      .slice(0, 500).map(({ id, action, actorEmail, occurredAt, target, accountId }) => ({ id, action, actorEmail, occurredAt, target, accountId }));
  } catch { return []; }
}
function recordDemoEvent(session: WorkspaceSession, action: string, target?: string, accountId?: string) {
  const events = readDemoEvents();
  const event = { id: Math.max(Date.now(), ...events.map(item => item.id + 1)), action, actorEmail: session.email, occurredAt: new Date().toISOString(), target, accountId };
  window.sessionStorage.setItem(auditKey, JSON.stringify([event, ...events].slice(0, 500)));
}
function normalizeAgents(agents: AgentName[], allowEmpty: boolean): AgentName[] {
  if (!Array.isArray(agents) || agents.length > AGENT_NAMES.length || (!allowEmpty && agents.length === 0) || agents.some(agent => !AGENT_NAMES.includes(agent)) || new Set(agents).size !== agents.length) {
    throw new APIError(allowEmpty ? "Choose a valid set of agents." : "Choose at least one agent.", 400, "invalid_request");
  }
  return AGENT_NAMES.filter(agent => agents.includes(agent));
}
function normalizeConnection(input: ConnectionInput): ConnectionInput {
  const service = input.service.trim();
  const username = input.username.trim();
  if (!service || [...service].length > 80 || /[\u0000-\u001f\u007f-\u009f]/.test(service)) throw new APIError("Use a platform name of 80 characters or fewer.", 400, "invalid_request");
  if (!username || [...username].length > 254 || /[\u0000-\u001f\u007f-\u009f]/.test(username)) throw new APIError("Enter an account email or username of 254 characters or fewer.", 400, "invalid_request");
  let origin: string;
  try { origin = normalizePlatformOrigin(input.origin); }
  catch (error) { throw new APIError(error instanceof Error ? error.message : "Enter a valid website domain.", 400, "invalid_request"); }
  const platform = findPlatform(service);
  if (platform && platform.origin !== origin) throw new APIError(`Use ${new URL(platform.origin).hostname} for ${platform.name}, or give your custom platform a different name.`, 400, "invalid_request");
  return { service, origin, username, agents: normalizeAgents(input.agents, false) };
}
function requireAccount(session: WorkspaceSession, id: string): DemoAccount {
  const account = session.accounts.find(item => item.id === id);
  if (!account) throw new APIError("This connection was removed or is no longer available.", 404, "not_found");
  return account;
}
export async function createConnection(input: ConnectionInput): Promise<WorkspaceSession> {
  const metadata = normalizeConnection(input);
  if (serviceMode) {
    const session = acceptSession(await request<WireSession>("/accounts", { method: "POST", body: metadata, authenticated: true }));
    notifySession(); return session;
  }
  const session = requireLocalSession();
  if (session.accounts.length >= 100) throw new APIError("This demo supports up to 100 connections. Remove one before adding another.", 409, "account_limit");
  if (session.accounts.some(account => account.origin === metadata.origin && account.username === metadata.username)) throw new APIError("This account is already connected. Open its connection to change agent access.", 409, "duplicate_account");
  const now = new Date().toISOString();
  const account: DemoAccount = { ...metadata, id: crypto.randomUUID(), agent: metadata.agents[0], createdAt: now, credentialUpdatedAt: now, credentialVersion: 1, simulated: true };
  const next = { ...session, accounts: [...session.accounts, account] };
  saveDemoSession(next); recordDemoEvent(next, "account.connected", metadata.service, account.id); return next;
}
// Kept for older callers. New connection screens use createConnection.
export async function createAccount(service: ServiceName, agent: AgentName): Promise<WorkspaceSession> {
  if (serviceMode) {
    const session = acceptSession(await request<WireSession>("/accounts", { method: "POST", body: { service, agent }, authenticated: true }));
    notifySession(); return session;
  }
  const platform = findPlatform(service);
  if (!platform) throw new APIError("Choose a known platform.", 400, "invalid_request");
  const session = requireLocalSession();
  normalizeAgents([agent], false);
  if (session.accounts.length >= 100) throw new APIError("This demo supports up to 100 connections.", 409, "account_limit");
  if (session.accounts.some(account => account.service === service && account.agents.includes(agent) && account.username === "")) throw new APIError(`${service} is already connected for ${agent}.`, 409, "duplicate_account");
  const now = new Date().toISOString();
  const account: DemoAccount = { id: crypto.randomUUID(), service, agent, agents: [agent], origin: platform.origin, username: "", createdAt: now, credentialUpdatedAt: now, credentialVersion: 1, simulated: true };
  const next = { ...session, accounts: [...session.accounts, account] };
  saveDemoSession(next); recordDemoEvent(next, "account.connected", service, account.id); return next;
}
export async function updateConnectionAgents(id: string, agents: AgentName[]): Promise<WorkspaceSession> {
  const selected = normalizeAgents(agents, true);
  if (serviceMode) {
    const session = acceptSession(await request<WireSession>(`/accounts/${encodeURIComponent(id)}/agents`, { method: "PATCH", body: { agents: selected }, authenticated: true }));
    notifySession(); return session;
  }
  const session = requireLocalSession();
  const account = requireAccount(session, id);
  const next = { ...session, accounts: session.accounts.map(item => item.id === id ? { ...item, agents: selected, agent: selected[0] ?? "" as const } : item) };
  saveDemoSession(next); recordDemoEvent(next, "account.agents_updated", `${account.service} / ${selected.length ? selected.join(", ") : "No agents"}`, id); return next;
}
export async function setConnectionAgent(id: string, agent: AgentName, allowed: boolean): Promise<WorkspaceSession> {
  normalizeAgents([agent], false);
  if (typeof allowed !== "boolean") throw new APIError("Choose whether this agent is allowed.", 400, "invalid_request");
  if (serviceMode) {
    const session = acceptSession(await request<WireSession>(`/accounts/${encodeURIComponent(id)}/agents/${encodeURIComponent(agent)}`, { method: allowed ? "PUT" : "DELETE", authenticated: true }));
    notifySession(); return session;
  }
  const session = requireLocalSession();
  const account = requireAccount(session, id);
  if (account.agents.includes(agent) === allowed) return session;
  const selected = normalizeAgents(allowed ? [...account.agents, agent] : account.agents.filter(item => item !== agent), true);
  const next = { ...session, accounts: session.accounts.map(item => item.id === id ? { ...item, agents: selected, agent: selected[0] ?? "" as const } : item) };
  saveDemoSession(next);
  recordDemoEvent(next, "account.agents_updated", `${account.service} / ${account.agents.join(", ") || "No agents"} → ${selected.join(", ") || "No agents"}`, id);
  return next;
}
export async function updateConnectionCredential(id: string): Promise<WorkspaceSession> {
  if (serviceMode) {
    const session = acceptSession(await request<WireSession>(`/accounts/${encodeURIComponent(id)}/credential`, { method: "POST", authenticated: true }));
    notifySession(); return session;
  }
  const session = requireLocalSession();
  const account = requireAccount(session, id);
  const now = new Date().toISOString();
  const next = { ...session, accounts: session.accounts.map(item => item.id === id ? { ...item, credentialUpdatedAt: now, credentialVersion: item.credentialVersion + 1 } : item) };
  saveDemoSession(next); recordDemoEvent(next, "credential.updated", account.service, id); return next;
}
export async function removeAccount(id: string): Promise<WorkspaceSession> {
  if (serviceMode) {
    const session = acceptSession(await request<WireSession>(`/accounts/${encodeURIComponent(id)}`, { method: "DELETE", authenticated: true }));
    notifySession(); return session;
  }
  const session = requireLocalSession();
  const account = requireAccount(session, id);
  const next = { ...session, accounts: session.accounts.filter(item => item.id !== id) };
  saveDemoSession(next); recordDemoEvent(next, "account.revoked", account.service, id); return next;
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
export async function getAudit(cursor?: string, accountId?: string): Promise<AuditPage> {
  const query = new URLSearchParams({ limit: "25" });
  if (cursor) query.set("cursor", cursor);
  if (accountId) query.set("accountId", accountId);
  if (serviceMode) return request<AuditPage>(`/audit?${query}`);
  const session = requireLocalSession();
  const history = readDemoEvents();
  if (accountId && !session.accounts.some(account => account.id === accountId) && !history.some(event => event.accountId === accountId)) throw new APIError("This connection’s history is not available.", 404, "not_found");
  if (cursor && !/^\d+$/.test(cursor)) throw new APIError("This activity page is no longer available. Refresh to start again.", 400, "invalid_cursor");
  const events = history.filter(event => (!accountId || event.accountId === accountId) && (!cursor || event.id < Number(cursor)));
  const page = events.slice(0, 25);
  return { events: page, nextCursor: events.length > 25 ? String(page[page.length - 1].id) : undefined };
}
export async function testHandoff(account: DemoAccount, idempotencyKey: string, agent?: AgentName): Promise<Handoff> {
  const selectedAgent = agent ?? account.agents[0];
  if (!selectedAgent) throw new APIError("Give an agent access before trying a sign-in.", 403, "access_denied");
  let browserSessionId = window.sessionStorage.getItem(browserKey);
  if (!browserSessionId) { browserSessionId = crypto.randomUUID(); window.sessionStorage.setItem(browserKey, browserSessionId); }
  const body = { accountId: account.id, agent: selectedAgent, targetOrigin: account.origin, browserSessionId, tabId: "demo-tab" };
  if (serviceMode) return request<Handoff>("/handoffs", { method: "POST", body, authenticated: true, idempotencyKey });
  const session = requireLocalSession();
  const current = session.accounts.find(item => item.id === account.id);
  if (session.accessPaused || !current || current.origin !== account.origin || !current.agents.includes(selectedAgent)) throw new APIError("Access is paused, removed, or unavailable to this agent.", 403, "access_denied");
  const fingerprint = JSON.stringify({ ...body, email: session.email });
  const previous = demoHandoffs.get(idempotencyKey);
  if (previous) {
    if (previous.fingerprint !== fingerprint) throw new APIError("This retry belongs to a different sign-in. Start a new test.", 409, "idempotency_conflict");
    return previous.result;
  }
  const result: Handoff = { id: crypto.randomUUID(), ...body, status: "simulated", simulated: true, createdAt: new Date().toISOString() };
  recordDemoEvent(session, "handoff.simulated", `${current.service} / ${selectedAgent}`, current.id);
  if (demoHandoffs.size >= 100) demoHandoffs.delete(demoHandoffs.keys().next().value!);
  demoHandoffs.set(idempotencyKey, { fingerprint, result });
  return result;
}
