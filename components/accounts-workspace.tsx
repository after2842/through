"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import SiteHeader from "@/components/site-header";
import {
  clearDemoSession,
  readDemoSession,
  saveDemoSession,
  type AgentName,
  type DemoSession,
  type ServiceName,
} from "@/lib/demo-session";
import styles from "./accounts-workspace.module.css";

const services: ServiceName[] = ["GitHub", "Linear", "Notion"];
const agents: AgentName[] = ["Claude", "Codex", "Cursor"];

export default function AccountsWorkspace() {
  const router = useRouter();
  const [session, setSession] = useState<DemoSession | null>(null);
  const [loadFailed, setLoadFailed] = useState(false);
  const [formOpen, setFormOpen] = useState(false);
  const [service, setService] = useState<ServiceName | "">("");
  const [agent, setAgent] = useState<AgentName | "">("");
  const [connecting, setConnecting] = useState(false);
  const [formError, setFormError] = useState("");
  const [error, setError] = useState("");
  const [status, setStatus] = useState("");
  const addButton = useRef<HTMLButtonElement>(null);
  const serviceSelect = useRef<HTMLSelectElement>(null);
  const removeButtons = useRef(new Map<string, HTMLButtonElement>());
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const focusFrame = useRef<number | null>(null);

  useEffect(() => {
    try {
      const saved = readDemoSession();
      if (!saved) {
        router.replace("/login/");
        return;
      }
      setSession(saved);
    } catch {
      setLoadFailed(true);
    }
    return () => {
      if (timer.current) clearTimeout(timer.current);
      if (focusFrame.current !== null) cancelAnimationFrame(focusFrame.current);
    };
  }, [router]);

  useEffect(() => {
    if (formOpen) serviceSelect.current?.focus();
  }, [formOpen]);

  function focusAfterUpdate(target: "add" | string = "add") {
    if (focusFrame.current !== null) cancelAnimationFrame(focusFrame.current);
    focusFrame.current = requestAnimationFrame(() => {
      if (target === "add") (addButton.current ?? serviceSelect.current)?.focus();
      else removeButtons.current.get(target)?.focus();
    });
  }

  function persist(next: DemoSession, message: string) {
    try {
      saveDemoSession(next);
      setSession(next);
      setError("");
      setStatus(message);
      return true;
    } catch {
      setStatus("");
      setError("Your changes couldn’t be saved. Allow browser storage, then try again.");
      return false;
    }
  }

  function cancelConnection() {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
    setConnecting(false);
    setFormOpen(false);
    setFormError("");
    setStatus("");
    focusAfterUpdate();
  }

  function connectAccount(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!session || connecting || !service || !agent) return;
    const chosenService = service;
    const chosenAgent = agent;
    if (session.accounts.some((account) => account.service === chosenService && account.agent === chosenAgent)) {
      setFormError(`${chosenService} is already connected for ${chosenAgent}. Choose another account or agent.`);
      serviceSelect.current?.focus();
      return;
    }
    setFormError("");
    setError("");
    setStatus(`Connecting ${chosenService} for ${chosenAgent}…`);
    setConnecting(true);
    timer.current = setTimeout(() => {
      const next: DemoSession = {
        ...session,
        accounts: [...session.accounts, { id: crypto.randomUUID(), service: chosenService, agent: chosenAgent }],
      };
      if (persist(next, `${chosenService} connected for ${chosenAgent}.${session.accessPaused ? " Access is still paused." : ""}`)) {
        setFormOpen(false);
        focusAfterUpdate();
      }
      setConnecting(false);
      timer.current = null;
    }, 650);
  }

  function removeAccount(id: string) {
    if (!session) return;
    const index = session.accounts.findIndex((account) => account.id === id);
    const account = session.accounts[index];
    if (!account) return;
    const remaining = session.accounts.filter((item) => item.id !== id);
    if (persist({ ...session, accounts: remaining }, `${account.service} removed for ${account.agent}.`)) {
      focusAfterUpdate(remaining[Math.min(index, remaining.length - 1)]?.id ?? "add");
    }
  }

  function toggleAccess() {
    if (!session) return;
    const accessPaused = !session.accessPaused;
    persist({ ...session, accessPaused }, accessPaused ? "Access paused for all accounts." : "Access resumed for all accounts.");
  }

  function signOut() {
    try {
      clearDemoSession();
      if (timer.current) clearTimeout(timer.current);
      router.replace("/login/");
    } catch {
      setError("Couldn’t sign out. Please allow browser storage and try again.");
    }
  }

  return (
    <div className="page app-page">
      <SiteHeader action={session ? <button type="button" className={styles.textButton} onClick={signOut}>Sign out</button> : undefined} />
      <main id="main" className={`app-main ${styles.main}`}>
        {!session ? (
          <div className={styles.loading} role="status">
            {loadFailed ? <><p>Your workspace couldn’t be opened. Allow browser storage to continue.</p><a href="/login/" className={styles.textButton}>Back to sign in <span aria-hidden="true">↗</span></a></> : "Opening your workspace…"}
          </div>
        ) : (
          <>
            <div className={styles.heading}>
              <div>
                <h1 className={styles.title}>Connected accounts.</h1>
                <p className={styles.identity}>{session.email}</p>
              </div>
              {session.accounts.length > 0 && (
                <button type="button" className={styles.textButton} onClick={toggleAccess} disabled={connecting}>
                  {session.accessPaused ? "Resume access" : "Pause access"}
                </button>
              )}
            </div>

            {session.accounts.length === 0 ? (
              <p className={styles.empty}>Connect an account. Choose which agent can use it.</p>
            ) : (
              <ul className={styles.accounts} aria-label="Connected accounts">
                {session.accounts.map((account) => (
                  <li key={account.id} className={styles.account}>
                    <div className={styles.accountName}><strong>{account.service}</strong><span>For {account.agent}</span></div>
                    <span className={`${styles.accountStatus} ${session.accessPaused ? styles.paused : ""}`}><i aria-hidden="true" />{session.accessPaused ? "Paused" : "Ready"}</span>
                    <button
                      type="button"
                      className={`${styles.textButton} ${styles.removeButton}`}
                      disabled={connecting}
                      aria-label={`Remove ${account.service} for ${account.agent}`}
                      ref={(element) => { if (element) removeButtons.current.set(account.id, element); else removeButtons.current.delete(account.id); }}
                      onClick={() => removeAccount(account.id)}
                    >Remove</button>
                  </li>
                ))}
              </ul>
            )}

            {formOpen ? (
              <form className={styles.connectForm} onSubmit={connectAccount} aria-labelledby="connect-title" aria-busy={connecting}>
                <h2 id="connect-title" className={styles.formTitle}>Connect a demo account.</h2>
                <div className={styles.fields}>
                  <label htmlFor="account-service">Account<select id="account-service" ref={serviceSelect} value={service} disabled={connecting} required aria-describedby={formError ? "connection-error" : undefined} aria-invalid={!!formError} onChange={(event) => { setService(event.target.value as ServiceName | ""); setFormError(""); }}><option value="" disabled>Choose an account</option>{services.map((item) => <option key={item}>{item}</option>)}</select></label>
                  <label htmlFor="account-agent">Allow access for<select id="account-agent" value={agent} disabled={connecting} required onChange={(event) => { setAgent(event.target.value as AgentName | ""); setFormError(""); }}><option value="" disabled>Choose an agent</option>{agents.map((item) => <option key={item}>{item}</option>)}</select></label>
                </div>
                {formError && <p id="connection-error" className={styles.error} role="alert">{formError}</p>}
                <div className={styles.formActions}>
                  <button type="submit" className={styles.primaryButton} disabled={connecting}>{connecting ? "Connecting…" : "Connect demo account"}<span aria-hidden="true">{connecting ? "·" : "↗"}</span></button>
                  <button type="button" className={styles.textButton} onClick={cancelConnection}>Cancel</button>
                </div>
              </form>
            ) : (
              <div className={styles.addAction}><button ref={addButton} type="button" className={styles.primaryButton} onClick={() => { setStatus(""); setError(""); setFormError(""); setService(""); setAgent(""); setFormOpen(true); }}>Add account <span aria-hidden="true">+</span></button></div>
            )}
            {error && <p className={styles.error} role="alert">{error}</p>}
            <p className={styles.status} role="status" aria-live="polite" aria-atomic="true">{status}</p>
          </>
        )}
      </main>
      <footer className="app-footer">Demo workspace · No real accounts are connected.</footer>
    </div>
  );
}
