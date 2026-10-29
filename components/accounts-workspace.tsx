"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import WorkspaceShell from "./workspace-shell";
import PlatformIcon from "./platform-icon";
import SelectField from "./select-field";
import { canManage, setAccessPaused } from "@/lib/client";
import { useWorkspace } from "@/lib/use-workspace";
import { platformHost } from "@/lib/platforms";
import styles from "./accounts-workspace.module.css";
import ui from "./connection-ui.module.css";

export default function AccountsWorkspace() {
  const { session, setSession, loading, loadError, refresh, alive, message, router } = useWorkspace();
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState("All connections");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [status, setStatus] = useState("");
  const pending = useRef(false);
  const manager = session ? canManage(session) : false;
  useEffect(() => { if (session && manager && new URLSearchParams(window.location.search).get("connect") === "1") router.replace("/accounts/new/"); }, [session, manager, router]);
  useEffect(() => { if (new URLSearchParams(window.location.search).get("removed") === "1") setStatus("Connection deleted. Its agent permissions have been removed."); }, []);
  const accounts = useMemo(() => (session?.accounts ?? []).filter(account => {
    const matches = `${account.service} ${account.origin} ${account.username} ${account.agents.join(" ")}`.toLowerCase().includes(query.toLowerCase().trim());
    return matches && (filter === "All connections" || (filter === "With access" && account.agents.length > 0 && !session?.accessPaused) || (filter === "No agents" && account.agents.length === 0) || (filter === "Paused" && session?.accessPaused));
  }), [session, query, filter]);
  async function toggleAccess() {
    if (pending.current || !session || !manager) return;
    pending.current = true; setBusy(true); setError(""); setStatus("");
    try { const next = await setAccessPaused(!session.accessPaused); if (alive.current) { setSession(next); setStatus(next.accessPaused ? "All connection access paused." : "Access resumed for permitted agents."); } }
    catch (failure) { if (alive.current) setError(message(failure)); }
    finally { pending.current = false; if (alive.current) setBusy(false); }
  }
  return <WorkspaceShell active="connections" email={session?.email} canViewActivity={manager}>
    <main id="main" className={ui.main}>
      <div className={ui.heading}><div><p className={ui.eyebrow}>YOUR WORKSPACE</p><h1>Connections<span className={styles.count}>{session?.accounts.length ?? ""}</span></h1><p className={ui.description}>Your accounts. Only the access you allow.</p></div>{manager && <Link className={ui.primary} href="/accounts/new/">Add connection <span aria-hidden="true">+</span></Link>}</div>
      {loading || loadError || !session ? <div className={ui.loading} role={loadError ? "alert" : "status"}><p>{loadError || "Loading connections…"}</p>{loadError && <button className={ui.textButton} onClick={() => void refresh()}>Try again</button>}</div> : <>
        {session.accessPaused && <div className={styles.pausedNotice}><span><strong>All access is paused.</strong> Your connections and permissions are still saved.</span>{manager && <button className={ui.textButton} disabled={busy} onClick={toggleAccess}>{busy ? "Updating…" : "Resume access"} <span aria-hidden="true">→</span></button>}</div>}
        {session.accounts.length === 0 ? <div className={styles.empty}>
          <div className={styles.emptyMark} aria-hidden="true"><svg width="34" height="40" viewBox="0 0 34 40" fill="none"><path d="M8 35V5h18v30M3 35h28m-15-15h12m-5-5 5 5-5 5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" /></svg></div>
          <h2>Your first connection.</h2><p>{manager ? "Choose a website, add demo sign-in details, and decide which agents get access." : "Your workspace admin can connect an account."}</p>
          {manager && <Link className={ui.textButton} href="/accounts/new/">Connect an account <span aria-hidden="true">→</span></Link>}
        </div> : <>
          <div className={styles.toolbar}><div className={styles.search}><svg width="16" height="16" viewBox="0 0 20 20" fill="none" aria-hidden="true"><circle cx="8.5" cy="8.5" r="5.5" stroke="currentColor" strokeWidth="1.3"/><path d="m13 13 4 4" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"/></svg><input aria-label="Search connections" placeholder="Search connections" value={query} onChange={event => setQuery(event.target.value)} type="search" /></div><SelectField id="connection-filter" label="Show" value={filter} options={["All connections", "With access", "No agents", "Paused"]} placeholder="Filter connections" onChange={setFilter} /></div>
          <div className={styles.columnLabels} aria-hidden="true"><span>CONNECTION</span><span>PERMITTED AGENTS</span><span>ACCESS</span><span /></div>
          <ul className={styles.accounts} aria-label="Connections">{accounts.map(account => <li key={account.id}><Link className={styles.account} href={`/accounts/connection/?id=${encodeURIComponent(account.id)}`}>
            <div className={styles.accountIdentity}><PlatformIcon origin={account.origin} name={account.service} size={38}/><div><strong>{account.service}</strong><span>{account.username || platformHost(account.origin)}</span></div></div>
            <span className={styles.agentNames}>{account.agents.length ? account.agents.join(", ") : "No agents allowed"}</span>
            <span className={`${ui.badge} ${session.accessPaused || !account.agents.length ? ui.badgeMuted : ""}`}>{session.accessPaused ? "Paused" : account.agents.length ? "Demo ready" : "No access"}</span><span className={styles.rowArrow} aria-hidden="true">↗</span>
          </Link></li>)}</ul>
          {accounts.length === 0 && <div className={styles.noResults}><p>No connections match this view.</p><button className={ui.textButton} onClick={() => { setQuery(""); setFilter("All connections"); }}>Clear filters</button></div>}
          <div className={styles.listFooter}><span>{accounts.length} of {session.accounts.length} connections</span>{manager && !session.accessPaused && <button className={ui.textButton} disabled={busy} onClick={toggleAccess}>{busy ? "Pausing…" : "Pause all access"}</button>}</div>
        </>}
        {!manager && session.accounts.length > 0 && <p className={ui.note}>Your workspace admin manages connections and agent permissions.</p>}
        {error && <p className={ui.error} role="alert">{error}</p>}{status && <p className={ui.status} role="status">{status}</p>}
      </>}
    </main>
  </WorkspaceShell>;
}
