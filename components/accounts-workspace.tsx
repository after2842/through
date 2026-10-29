"use client";

import EnvironmentNote from "@/components/environment-note";
import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import SiteHeader from "@/components/site-header";
import SelectField from "@/components/select-field";
import { APIError, canManage, createAccount, errorMessage, getSession, removeAccount, setAccessPaused, signOut, testHandoff, type WorkspaceSession } from "@/lib/client";
import { type AgentName, type DemoAccount, type ServiceName } from "@/lib/demo-session";
import styles from "./accounts-workspace.module.css";

const services: ServiceName[] = ["GitHub", "Linear", "Notion"];
const agents: AgentName[] = ["Claude", "Codex", "Cursor"];
const destinations: Record<ServiceName, string> = { GitHub: "github.com", Linear: "linear.app", Notion: "www.notion.so" };

export default function AccountsWorkspace() {
  const router = useRouter();
  const [session, setSession] = useState<WorkspaceSession | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [formOpen, setFormOpen] = useState(false);
  const [service, setService] = useState<ServiceName | "">("");
  const [agent, setAgent] = useState<AgentName | "">("");
  const [mutation, setMutation] = useState<string | null>(null);
  const [formError, setFormError] = useState("");
  const [invalidField, setInvalidField] = useState<"service" | "agent" | null>(null);
  const [error, setError] = useState("");
  const [status, setStatus] = useState("");
  const mounted = useRef(false);
  const pending = useRef(false);
  const loadSequence = useRef(0);
  const openedFromURL = useRef(false);
  const handoffKeys = useRef(new Map<string, string>());
  const addButton = useRef<HTMLButtonElement>(null);
  const serviceSelect = useRef<HTMLButtonElement>(null);
  const agentSelect = useRef<HTMLButtonElement>(null);
  const removeButtons = useRef(new Map<string, HTMLButtonElement>());
  const focusFrame = useRef<number | null>(null);
  const busy = mutation !== null;
  const manager = session ? canManage(session) : false;

  const refreshSession = useCallback(async () => {
    if (pending.current) return;
    const sequence = ++loadSequence.current;
    setLoading(true);
    setLoadError("");
    try {
      const next = await getSession();
      if (!mounted.current || sequence !== loadSequence.current) return;
      if (!next) { router.replace("/login/"); return; }
      setSession(next);
      if (!openedFromURL.current) {
        const shouldOpen = new URLSearchParams(window.location.search).get("connect") === "1";
        setFormOpen(canManage(next) && shouldOpen);
        openedFromURL.current = true;
        if (shouldOpen) router.replace("/accounts/", { scroll: false });
      } else if (!canManage(next)) setFormOpen(false);
      setLoading(false);
    } catch (failure) {
      if (!mounted.current || sequence !== loadSequence.current) return;
      setLoadError(errorMessage(failure));
      setLoading(false);
    }
  }, [router]);

  useEffect(() => {
    mounted.current = true;
    void refreshSession();
    const refresh = () => { void refreshSession(); };
    window.addEventListener("pageshow", refresh);
    return () => {
      mounted.current = false;
      loadSequence.current += 1;
      if (focusFrame.current !== null) cancelAnimationFrame(focusFrame.current);
      window.removeEventListener("pageshow", refresh);
    };
  }, [refreshSession]);

  useEffect(() => { if (formOpen && !loading) serviceSelect.current?.focus(); }, [formOpen, loading]);

  function focusAfterUpdate(target: "add" | string = "add") {
    if (focusFrame.current !== null) cancelAnimationFrame(focusFrame.current);
    focusFrame.current = requestAnimationFrame(() => {
      if (!mounted.current) return;
      if (target === "add") (addButton.current ?? serviceSelect.current)?.focus();
      else removeButtons.current.get(target)?.focus();
    });
  }

  function beginMutation(kind: string) {
    if (pending.current || !session || (kind !== "signout" && !canManage(session))) return false;
    pending.current = true;
    loadSequence.current += 1;
    setMutation(kind);
    setError("");
    setStatus("");
    setFormError("");
    setInvalidField(null);
    return true;
  }

  function finishMutation() {
    pending.current = false;
    if (mounted.current) setMutation(null);
  }

  async function showFailure(failure: unknown, inForm = false) {
    if (!mounted.current) return;
    if (failure instanceof APIError && failure.status === 401) { router.replace("/login/"); return; }
    if (inForm) setFormError(errorMessage(failure));
    else setError(errorMessage(failure));
    if (failure instanceof APIError && failure.status === 403) {
      try {
        const next = await getSession();
        if (!mounted.current) return;
        if (!next) { router.replace("/login/"); return; }
        setSession(next);
        if (!canManage(next)) {
          setFormOpen(false);
          setFormError("");
          setError("Your workspace admin manages access.");
        }
      } catch { /* Keep the original, actionable failure visible. */ }
    }
  }

  function cancelConnection() {
    if (pending.current) return;
    setFormOpen(false);
    setFormError("");
    setInvalidField(null);
    setStatus("");
    focusAfterUpdate();
  }

  async function connectAccount(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!session || pending.current || !manager) return;
    if (!service) {
      setFormError("Choose an account to connect.");
      setInvalidField("service");
      serviceSelect.current?.focus();
      return;
    }
    if (!agent) {
      setFormError("Choose which agent can use this account.");
      setInvalidField("agent");
      agentSelect.current?.focus();
      return;
    }
    if (session.accounts.some((account) => account.service === service && account.agent === agent)) {
      setFormError(`${service} is already connected for ${agent}. Choose another account or agent.`);
      setInvalidField("service");
      serviceSelect.current?.focus();
      return;
    }
    if (!beginMutation("connect")) return;
    setInvalidField(null);
    try {
      const next = await createAccount(service, agent);
      if (!mounted.current) return;
      setSession(next);
      setStatus(`${service} connected for ${agent}.${next.accessPaused ? " Access is still paused." : ""}`);
      setFormOpen(false);
      focusAfterUpdate();
    } catch (failure) {
      await showFailure(failure, true);
    } finally { finishMutation(); }
  }

  async function disconnectAccount(account: DemoAccount) {
    if (!session || !beginMutation(`remove:${account.id}`)) return;
    const index = session.accounts.findIndex((item) => item.id === account.id);
    try {
      const next = await removeAccount(account.id);
      if (!mounted.current) return;
      handoffKeys.current.delete(account.id);
      setSession(next);
      setStatus(`${account.service} removed for ${account.agent}.`);
      focusAfterUpdate(next.accounts[Math.min(index, next.accounts.length - 1)]?.id ?? "add");
    } catch (failure) { await showFailure(failure); }
    finally { finishMutation(); }
  }

  async function toggleAccess() {
    if (!session || !beginMutation("access")) return;
    try {
      const next = await setAccessPaused(!session.accessPaused);
      if (!mounted.current) return;
      setSession(next);
      setStatus(next.accessPaused ? "Access paused for all accounts." : "Access resumed for all accounts.");
    } catch (failure) { await showFailure(failure); }
    finally { finishMutation(); }
  }

  async function handleSignOut() {
    if (!beginMutation("signout")) return;
    try {
      await signOut();
      if (mounted.current) router.replace("/");
    } catch (failure) { await showFailure(failure); }
    finally { finishMutation(); }
  }

  async function handleHandoff(account: DemoAccount) {
    if (!session || session.accessPaused || !beginMutation(`handoff:${account.id}`)) return;
    const key = handoffKeys.current.get(account.id) ?? crypto.randomUUID();
    handoffKeys.current.set(account.id, key);
    try {
      const result = await testHandoff(account, key);
      if (!mounted.current) return;
      if (!result.simulated || result.status !== "simulated") throw new APIError("The demo handoff could not be confirmed.", 502, "unexpected_handoff");
      handoffKeys.current.delete(account.id);
      setStatus("Demo handoff complete. External sign-in uses a placeholder.");
    } catch (failure) {
      const uncertain = !(failure instanceof APIError) || failure.status === 0 || failure.status >= 500;
      if (!uncertain) handoffKeys.current.delete(account.id);
      await showFailure(failure);
      if (mounted.current && uncertain) setError(`${errorMessage(failure)} Retry checks the same demo attempt.`);
    } finally { finishMutation(); }
  }

  return (
    <div className="page app-page">
      <SiteHeader action={session && !loading && !loadError ? <>
        {manager && <Link href="/activity/" className={styles.textButton}>Activity</Link>}
        <button type="button" className={styles.textButton} onClick={handleSignOut} disabled={busy}>{mutation === "signout" ? "Signing out…" : "Sign out"}</button>
      </> : undefined} />
      <main id="main" className={`app-main ${styles.main}`}>
        {loading || loadError || !session ? (
          <div className={styles.loading} role={loadError ? "alert" : "status"}>
            <p>{loadError || "Opening your workspace…"}</p>
            {loadError && <button type="button" className={styles.textButton} onClick={() => void refreshSession()}>Try again <span aria-hidden="true">↗</span></button>}
          </div>
        ) : (
          <>
            <div className={styles.heading}>
              <div><h1 className={styles.title}>Connected accounts.</h1><p className={styles.identity}>{session.email}</p></div>
              {manager && session.accounts.length > 0 && <button type="button" className={styles.textButton} onClick={toggleAccess} disabled={busy}>
                {mutation === "access" ? "Updating…" : session.accessPaused ? "Resume access" : "Pause access"}
              </button>}
            </div>
            {!manager && <p className={styles.empty}>Your workspace admin manages access.</p>}
            {session.accounts.length === 0 ? (
              <p className={styles.empty}>{manager ? "Connect an account. Choose which agent can use it." : "No accounts are connected yet."}</p>
            ) : (
              <ul className={styles.accounts} aria-label="Connected accounts">
                {session.accounts.map((account) => <li key={account.id} className={styles.account}>
                  <div className={styles.accountName}><strong>{account.service}</strong><span>For {account.agent} · {destinations[account.service]}</span></div>
                  <span className={`${styles.accountStatus} ${session.accessPaused ? styles.paused : ""}`}><i aria-hidden="true" />{session.accessPaused ? "Paused" : "Ready"}</span>
                  {manager && <div className={styles.accountActions}>
                    <button type="button" className={styles.textButton} disabled={busy || session.accessPaused} aria-label={`Test sign-in to ${account.service} for ${account.agent}`} onClick={() => void handleHandoff(account)}>
                      {mutation === `handoff:${account.id}` ? "Testing…" : handoffKeys.current.has(account.id) ? "Retry test" : "Test sign-in"}
                    </button>
                    <button type="button" className={`${styles.textButton} ${styles.removeButton}`} disabled={busy} aria-label={`Remove ${account.service} for ${account.agent}`}
                      ref={(element) => { if (element) removeButtons.current.set(account.id, element); else removeButtons.current.delete(account.id); }} onClick={() => void disconnectAccount(account)}>
                      {mutation === `remove:${account.id}` ? "Removing…" : "Remove"}
                    </button>
                  </div>}
                </li>)}
              </ul>
            )}
            {manager && (formOpen ? (
              <form className={styles.connectForm} onSubmit={connectAccount} aria-labelledby="connect-title" aria-busy={mutation === "connect"}>
                <h2 id="connect-title" className={styles.formTitle}>Connect a demo account.</h2>
                <div className={styles.fields}>
                  <SelectField id="account-service" ref={serviceSelect} label="Account" value={service} options={services} placeholder="Choose an account" disabled={busy} required invalid={invalidField === "service"} describedBy={invalidField === "service" ? "connection-error" : undefined} onChange={(value) => { setService(value as ServiceName); setFormError(""); setInvalidField(null); }} />
                  <SelectField id="account-agent" ref={agentSelect} label="Allow access for" value={agent} options={agents} placeholder="Choose an agent" disabled={busy} required invalid={invalidField === "agent"} describedBy={invalidField === "agent" ? "connection-error" : undefined} onChange={(value) => { setAgent(value as AgentName); setFormError(""); setInvalidField(null); }} />
                </div>
                {service && <p className={styles.scope}>Access is limited to {destinations[service]}.</p>}
                {formError && <p id="connection-error" className={styles.error} role="alert">{formError}</p>}
                <div className={styles.formActions}>
                  <button type="submit" className={styles.primaryButton} disabled={busy}>{mutation === "connect" ? "Connecting…" : "Connect demo account"}<span aria-hidden="true">{mutation === "connect" ? "·" : "↗"}</span></button>
                  <button type="button" className={styles.textButton} onClick={cancelConnection} disabled={busy}>Cancel</button>
                </div>
              </form>
            ) : (
              <div className={styles.addAction}><button ref={addButton} type="button" className={styles.primaryButton} disabled={busy} onClick={() => { setStatus(""); setError(""); setFormError(""); setInvalidField(null); setService(""); setAgent(""); setFormOpen(true); }}>Add account <span aria-hidden="true">+</span></button></div>
            ))}
            {error && <p className={styles.error} role="alert">{error}</p>}
            <p className={styles.status} role="status" aria-live="polite" aria-atomic="true">{status}</p>
          </>
        )}
      </main>
      <footer className="app-footer"><EnvironmentNote /></footer>
    </div>
  );
}
