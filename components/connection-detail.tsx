"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import Link from "next/link";
import WorkspaceShell from "./workspace-shell";
import PlatformIcon from "./platform-icon";
import ConnectionDialog from "./connection-dialog";
import SelectField from "./select-field";
import { APIError, canManage, getAudit, removeAccount, testHandoff, setConnectionAgent, updateConnectionCredential, type AuditEvent } from "@/lib/client";
import { useWorkspace } from "@/lib/use-workspace";
import { AGENT_NAMES, platformHost, type AgentName } from "@/lib/platforms";
import styles from "./connection-ui.module.css";

type DialogState = { kind: "credential" } | { kind: "delete" } | { kind: "agent"; agent: AgentName; allow: boolean };
const marks: Record<AgentName, string> = { Claude: "✳", Codex: "⌘", Cursor: "↖" };
function date(value: string, time = false) {
  if (!value || !Number.isFinite(Date.parse(value))) return "Not recorded";
  return new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: time ? undefined : "numeric", ...(time ? { hour: "numeric", minute: "2-digit" } as const : {}) }).format(new Date(value));
}
function eventLabel(action: string) {
  const labels: Record<string, string> = { "account.created": "Connection added", "account.connected": "Connection added", "account.agents_updated": "Agent permissions updated", "credential.updated": "Demo password updated", "handoff.simulated": "Demo sign-in completed", "account.revoked": "Connection deleted" };
  return labels[action] ?? action.replace(/[._]/g, " ").replace(/^./, character => character.toUpperCase());
}

export default function ConnectionDetail() {
  const { session, setSession, loading, loadError, refresh, alive, message, router } = useWorkspace();
  const [id, setId] = useState<string | null>(null);
  const [dialog, setDialog] = useState<DialogState | null>(null);
  const [busy, setBusy] = useState(false);
  const [testing, setTesting] = useState(false);
  const [error, setError] = useState("");
  const [dialogError, setDialogError] = useState("");
  const [status, setStatus] = useState("");
  const [events, setEvents] = useState<AuditEvent[]>([]);
  const [logsLoading, setLogsLoading] = useState(true);
  const [logsError, setLogsError] = useState("");
  const [logRevision, setLogRevision] = useState(0);
  const [selectedAgent, setSelectedAgent] = useState<AgentName | "">("");
  const [showPassword, setShowPassword] = useState(false);
  const password = useRef<HTMLInputElement>(null);
  const pending = useRef(false);
  const handoffKeys = useRef(new Map<string, string>());
  const account = session?.accounts.find(item => item.id === id);
  const manager = session ? canManage(session) : false;
  const testAgent = account?.agents.includes(selectedAgent as AgentName) ? selectedAgent as AgentName : account?.agents[0];

  useEffect(() => { setId(new URLSearchParams(window.location.search).get("id") ?? ""); }, []);
  useEffect(() => {
    if (!id || !session || !manager || !account) { setLogsLoading(false); return; }
    let cancelled = false;
    setLogsLoading(true); setLogsError("");
    void getAudit(undefined, id).then(page => { if (!cancelled) setEvents(page.events.slice(0, 4)); }).catch(failure => { if (!cancelled) setLogsError(message(failure)); }).finally(() => { if (!cancelled) setLogsLoading(false); });
    return () => { cancelled = true; };
    // Session updates already trigger the explicit log revision after a mutation.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, manager, !!account, logRevision]);

  function openDialog(next: DialogState) { setDialogError(""); setShowPassword(false); setDialog(next); setStatus(""); }
  function closeDialog() { if (!pending.current) { if (password.current) password.current.value = ""; setDialog(null); setDialogError(""); } }
  async function confirm(event: FormEvent) {
    event.preventDefault();
    if (!account || !session || !manager || !dialog || pending.current) return;
    if (dialog.kind === "credential" && !password.current?.value) { setDialogError("Enter a made-up password for this preview."); password.current?.focus(); return; }
    // A credential never leaves this input. The sandbox only records a version change.
    if (password.current) password.current.value = "";
    pending.current = true; setBusy(true); setDialogError(""); setError(""); setStatus("");
    const action = dialog;
    try {
      const operation = action.kind === "delete" ? removeAccount(account.id)
        : action.kind === "credential" ? updateConnectionCredential(account.id)
        : setConnectionAgent(account.id, action.agent, action.allow);
      const [next] = await Promise.all([operation, new Promise(resolve => window.setTimeout(resolve, 650))]);
      if (!alive.current) return;
      setSession(next); setDialog(null); setLogRevision(value => value + 1);
      if (action.kind === "delete") { router.replace("/accounts/?removed=1"); return; }
      setStatus(action.kind === "credential" ? "Demo password updated. The entered value was discarded." : action.allow ? `${action.agent} now has demo access to this connection.` : `${action.agent} no longer has access to this connection.`);
      if (action.kind === "agent") handoffKeys.current.delete(action.agent);
    } catch (failure) { if (alive.current) setDialogError(message(failure)); }
    finally { pending.current = false; if (alive.current) setBusy(false); }
  }
  async function runTest() {
    if (pending.current || !account || !manager || !testAgent || session?.accessPaused) return;
    pending.current = true; setTesting(true); setError(""); setStatus("");
    const key = handoffKeys.current.get(testAgent) ?? crypto.randomUUID();
    handoffKeys.current.set(testAgent, key);
    try {
      const [result] = await Promise.all([testHandoff(account, key, testAgent), new Promise(resolve => window.setTimeout(resolve, 700))]);
      if (!alive.current) return;
      if (!result.simulated || result.status !== "simulated") throw new APIError("This demo sign-in could not be confirmed.", 502, "unexpected_handoff");
      handoffKeys.current.delete(testAgent);
      setStatus(`Demo sign-in completed for ${testAgent}. No external website was opened.`); setLogRevision(value => value + 1);
    } catch (failure) {
      const uncertain = !(failure instanceof APIError) || failure.status === 0 || failure.status >= 500;
      if (!uncertain) handoffKeys.current.delete(testAgent);
      if (alive.current) setError(`${message(failure)}${uncertain ? " Retry checks the same attempt." : ""}`);
    } finally { pending.current = false; if (alive.current) setTesting(false); }
  }
  return <WorkspaceShell active="connections" email={session?.email} canViewActivity={manager}>
    <main id="main" className={styles.main}>
      <Link className={styles.back} href="/accounts/"><span aria-hidden="true">←</span> Connections</Link>
      {loading || loadError || id === null || !session ? <div className={styles.loading} role={loadError ? "alert" : "status"}><p>{loadError || "Loading connection…"}</p>{loadError && <button className={styles.textButton} onClick={() => void refresh()}>Try again</button>}</div> : !account ? <div className={styles.loading}><h1>Connection unavailable.</h1><p>It may have been deleted, or it belongs to another workspace.</p><Link className={styles.textButton} href="/accounts/">View connections →</Link></div> : <>
        <div className={styles.heading}>
          <div className={styles.connectionTitle}><PlatformIcon origin={account.origin} name={account.service} size={56}/><div><h1>{account.service}</h1><div className={styles.connectionMeta}><span>{account.username || "Legacy demo account"}</span><a href={account.origin} target="_blank" rel="noopener noreferrer" referrerPolicy="no-referrer">{platformHost(account.origin)} ↗</a></div></div></div>
          <span className={`${styles.badge} ${session.accessPaused || !account.agents.length ? styles.badgeMuted : ""}`}>{session.accessPaused ? "Access paused" : account.agents.length ? "Demo connection" : "No agents allowed"}</span>
        </div>
        {session.accessPaused && <p className={styles.notice}>All workspace access is paused. <Link href="/accounts/" className={styles.textButton}>Manage access →</Link></p>}
        <div className={styles.detailLayout}><div>
          <section className={styles.section} aria-labelledby="credential-heading">
            <div className={styles.sectionHead}><div><h2 id="credential-heading">Sign-in details</h2><p>Credential version {account.credentialVersion} · Preview only</p></div></div>
            <div className={styles.credentialRow}><div><strong aria-label="Demo password placeholder">••••••••••••</strong><p>Updated {date(account.credentialUpdatedAt)}</p></div>{manager && <button className={styles.secondary} disabled={busy || testing} onClick={() => openDialog({ kind: "credential" })}>Update password</button>}</div>
            <p className={styles.note}>No password is stored in this preview. Updating here does not reset your password on {account.service}.</p>
          </section>
          <section className={styles.section} aria-labelledby="agents-heading">
            <div className={styles.sectionHead}><div><h2 id="agents-heading">Agent permissions</h2><p>{account.agents.length} of {AGENT_NAMES.length} agents allowed · This website only</p></div></div>
            <ul className={styles.agents}>{AGENT_NAMES.map(agent => {
              const allowed = account.agents.includes(agent);
              return <li key={agent}><span className={styles.agentMark} aria-hidden="true">{marks[agent]}</span><div><strong>{agent}</strong><small>{allowed ? session.accessPaused ? "Allowed · workspace paused" : "Allowed to use this connection" : "No access"}</small></div>{manager && <button className={`${styles.textButton} ${allowed ? styles.muted : ""}`} disabled={busy || testing} aria-label={`${allowed ? "Remove" : "Allow"} ${agent} access`} onClick={() => openDialog({ kind: "agent", agent, allow: !allowed })}>{allowed ? "Remove access" : "Allow access"}</button>}</li>;
            })}</ul>
            {!manager && <p className={styles.note}>Your workspace admin manages agent permissions.</p>}
            {manager && <div className={styles.testRow}><SelectField id="test-agent" label="Preview a sign-in" value={testAgent ?? ""} options={account.agents} placeholder="No permitted agents" onChange={value => setSelectedAgent(value as AgentName)} disabled={busy || testing || !account.agents.length || session.accessPaused}/><button className={styles.secondary} disabled={busy || testing || !testAgent || session.accessPaused} onClick={runTest}>{testing ? "Testing sign-in…" : testAgent && handoffKeys.current.has(testAgent) ? "Retry demo sign-in" : "Run demo sign-in"} <span aria-hidden="true">↗</span></button></div>}
            {error && <p className={styles.error} role="alert">{error}</p>}{status && <p className={styles.status} role="status">{status}</p>}
          </section>
          {manager && <section className={styles.section} aria-labelledby="recent-heading"><div className={styles.sectionHead}><h2 id="recent-heading">Recent activity</h2><Link className={styles.textButton} href={`/activity/?accountId=${encodeURIComponent(account.id)}`}>View all logs <span aria-hidden="true">↗</span></Link></div>
            {logsLoading ? <p className={styles.note} role="status">Loading activity…</p> : logsError ? <div><p className={styles.error} role="alert">{logsError}</p><button className={styles.textButton} onClick={() => setLogRevision(value => value + 1)}>Try again</button></div> : events.length ? <ol className={styles.recent}>{events.map(event => <li key={event.id}><div><span>{eventLabel(event.action)}</span><small>{event.actorEmail}</small></div><time dateTime={event.occurredAt}>{date(event.occurredAt, true)}</time></li>)}</ol> : <p className={styles.note}>Changes and demo sign-ins will appear here. Older workspace events may only be available in all activity.</p>}
          </section>}
          {manager && <section className={styles.dangerSection}><div><h2>Delete connection</h2><p>Remove this connection and every agent’s permission to use it. Activity history remains.</p></div><button className={`${styles.textButton} ${styles.dangerText}`} disabled={busy || testing} onClick={() => openDialog({ kind: "delete" })}>Delete connection</button></section>}
        </div><aside className={styles.sideInfo} aria-label="Connection information"><h2>CONNECTION DETAILS</h2><dl><div><dt>Allowed origin</dt><dd>{account.origin}</dd></div><div><dt>Account</dt><dd>{account.username || "Not recorded"}</dd></div><div><dt>Added</dt><dd>{date(account.createdAt)}</dd></div><div><dt>Authentication</dt><dd>Password · Demo</dd></div><div><dt>Scope</dt><dd>Exact website. Selected agents.</dd></div></dl><p className={styles.note}>External sign-in and a password vault are not connected.</p></aside></div>
        {dialog && <ConnectionDialog title={dialog.kind === "delete" ? `Delete ${account.service}?` : dialog.kind === "credential" ? "Update password." : `${dialog.allow ? "Allow" : "Remove"} ${dialog.agent} access?`} description={dialog.kind === "delete" ? "All agents will lose access to this connection. Activity history stays available. This does not delete your account on the external website." : dialog.kind === "credential" ? `Replace the demo credential for ${account.service}. Your password on ${platformHost(account.origin)} will not change.` : dialog.allow ? `${dialog.agent} will be permitted to use this demo connection at ${platformHost(account.origin)}.` : `${dialog.agent} will no longer be allowed to use this connection. Other agents keep their existing permissions.`} busy={busy} onClose={closeDialog}>
          <form onSubmit={confirm} noValidate>
            {dialog.kind === "credential" && <><p className={styles.notice}><strong>Use a made-up password.</strong> It is discarded. Only the update is recorded.</p><div className={styles.field}><label htmlFor="replacement-password">New demo password</label><div className={styles.password}><input ref={password} id="replacement-password" type={showPassword ? "text" : "password"} autoComplete="off" data-1p-ignore="true" data-lpignore="true" maxLength={256} disabled={busy} placeholder="Enter a made-up password" onChange={() => setDialogError("")} /><button type="button" disabled={busy} aria-label={showPassword ? "Hide new demo password" : "Show new demo password"} aria-pressed={showPassword} onClick={() => setShowPassword(value => !value)}>{showPassword ? "Hide" : "Show"}</button></div></div></>}
            {dialogError && <p className={styles.error} role="alert">{dialogError}</p>}
            <div className={styles.actions}><button className={styles.secondary} type="button" disabled={busy} onClick={closeDialog}>Cancel</button><button type="submit" className={dialog.kind === "delete" ? styles.danger : styles.primary} disabled={busy}>{busy ? dialog.kind === "delete" ? "Deleting…" : "Saving…" : dialog.kind === "delete" ? "Delete connection" : dialog.kind === "credential" ? "Confirm update" : dialog.allow ? "Allow access" : "Remove access"}</button></div>
          </form>
        </ConnectionDialog>}
      </>}
    </main>
  </WorkspaceShell>;
}
