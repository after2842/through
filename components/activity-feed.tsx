"use client";

import { Suspense, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import WorkspaceShell from "./workspace-shell";
import { APIError, canManage, errorMessage, getAudit, getSession, type AuditEvent, type WorkspaceSession } from "@/lib/client";
import { platformHost } from "@/lib/platforms";
import styles from "./activity-feed.module.css";

const labels: Record<string, string> = {
  "session.created": "Signed in to through", "session.revoked": "Signed out of through", "auth.login": "Signed in to through", "auth.logout": "Signed out of through",
  "profile.updated": "Profile updated", "session.others_signed_out": "Other sessions signed out",
  "session.signed_in": "Signed in to through", "session.signed_out": "Signed out of through",
  "account.created": "Connection added", "account.connected": "Connection added", "account.revoked": "Connection deleted",
  "account.agents_updated": "Agent permissions updated", "account.credential_updated": "Demo password updated", "credential.updated": "Demo password updated",
  "workspace.paused": "All agent access paused", "workspace.resumed": "Agent access resumed",
  "access.paused": "All agent access paused", "access.resumed": "Agent access resumed",
  "handoff.simulated": "Demo agent sign-in completed", "handoff.denied": "Agent sign-in denied",
};
function actionLabel(action: string) { return labels[action] ?? action.split(/[._]/).join(" ").replace(/^./, letter => letter.toUpperCase()); }
type Filter = "all" | "signins" | "changes";
const filters: { value: Filter; label: string }[] = [{ value: "all", label: "All events" }, { value: "signins", label: "Sign-ins" }, { value: "changes", label: "Changes" }];
const isSignInEvent = (action: string) => /^(?:handoff|session|auth)\./.test(action);
function csvCell(value: string): string {
  const safe = /^[\s]*[=+@\-\t\r]/.test(value) ? `'${value}` : value;
  return `"${safe.replace(/"/g, '""')}"`;
}

export default function ActivityFeed() {
  return <Suspense fallback={<WorkspaceShell active="activity"><main id="main" className={`app-main ${styles.main}`}><p className={styles.notice} role="status">Loading activity…</p></main></WorkspaceShell>}><ActivityFeedContent /></Suspense>;
}

function ActivityFeedContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const accountId = searchParams.get("accountId") || undefined;
  const [session, setSession] = useState<WorkspaceSession | null>(null);
  const [events, setEvents] = useState<AuditEvent[]>([]);
  const [nextCursor, setNextCursor] = useState<string | undefined>();
  const [busy, setBusy] = useState(true);
  const [error, setError] = useState("");
  const [revision, setRevision] = useState(0);
  const [filter, setFilter] = useState<Filter>("all");
  const [search, setSearch] = useState("");
  const alive = useRef(false);
  const pending = useRef(false);
  const generation = useRef(0);
  const connection = session?.accounts.find(account => account.id === accountId);

  useEffect(() => {
    alive.current = true;
    const sequence = ++generation.current;
    let cancelled = false;
    setBusy(true);
    setError("");
    setEvents([]);
    setNextCursor(undefined);
    async function load() {
      try {
        const current = await getSession();
        if (cancelled) return;
        if (!current) { router.replace("/login/"); return; }
        setSession(current);
        if (!canManage(current)) { setEvents([]); setNextCursor(undefined); return; }
        const page = await getAudit(undefined, accountId);
        if (cancelled || sequence !== generation.current) return;
        setEvents(page.events);
        setNextCursor(page.nextCursor || undefined);
      } catch (reason) {
        if (cancelled) return;
        if (reason instanceof APIError && reason.status === 401) { router.replace("/login/"); return; }
        setError(errorMessage(reason));
      } finally { if (!cancelled && sequence === generation.current) setBusy(false); }
    }
    void load();
    return () => { cancelled = true; alive.current = false; };
  }, [revision, router, accountId]);

  async function loadMore() {
    if (!nextCursor || pending.current || busy) return;
    pending.current = true;
    const sequence = generation.current;
    setBusy(true); setError("");
    try {
      const page = await getAudit(nextCursor, accountId);
      if (!alive.current || sequence !== generation.current) return;
      setEvents(existing => [...existing, ...page.events.filter(event => !existing.some(item => item.id === event.id))]);
      setNextCursor(page.nextCursor || undefined);
    } catch (reason) {
      if (!alive.current || sequence !== generation.current) return;
      if (reason instanceof APIError && reason.status === 401) { router.replace("/login/"); return; }
      setError(errorMessage(reason));
    }
    finally { pending.current = false; if (alive.current && sequence === generation.current) setBusy(false); }
  }

  const visibleEvents = useMemo(() => {
    const query = search.trim().toLowerCase();
    return events.filter(event => (filter === "all" || (filter === "signins" ? isSignInEvent(event.action) : !isSignInEvent(event.action)))
      && (!query || [actionLabel(event.action), event.target ?? "", event.actorEmail].join(" ").toLowerCase().includes(query)));
  }, [events, filter, search]);

  function exportCSV() {
    if (!visibleEvents.length) return;
    const rows = [["Time (UTC)", "Event", "Connection", "Connection ID", "Actor", "Event ID"], ...visibleEvents.map(event => [event.occurredAt, actionLabel(event.action), event.target ?? "", event.accountId ?? "", event.actorEmail, String(event.id)])];
    const data = "\uFEFF" + rows.map(row => row.map(csvCell).join(",")).join("\r\n");
    const url = URL.createObjectURL(new Blob([data], { type: "text/csv;charset=utf-8;" }));
    const link = document.createElement("a");
    link.href = url;
    link.download = `through-activity-${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  return <WorkspaceShell active="activity" email={session?.email} canViewActivity={session ? canManage(session) : true}>
    <main id="main" className={`app-main ${styles.main}`}>
      {accountId && <Link className={`quiet-link ${styles.back}`} href={connection ? `/accounts/connection/?id=${encodeURIComponent(accountId)}` : "/accounts/"}>← {connection ? connection.service : "Connections"}</Link>}
      <div className={styles.heading}>
        <div><span className={styles.eyebrow}>{accountId ? "Connection history" : "Workspace history"}</span><h1>Activity.</h1><p>{connection ? `${connection.service} · ${platformHost(connection.origin)}` : accountId ? "Events for this connection." : "Who changed access. What happened next."}</p></div>
        {session && canManage(session) && <div className={styles.actions}>
          <button type="button" className="quiet-link" disabled={busy} onClick={() => setRevision(value => value + 1)} aria-label="Refresh activity">Refresh <span aria-hidden="true">↻</span></button>
          <button type="button" className={styles.export} disabled={busy || !visibleEvents.length} onClick={exportCSV}>Export CSV <span aria-hidden="true">↓</span></button>
        </div>}
      </div>
      {session && !canManage(session) ? <p className={styles.notice}>Your workspace admin can view access activity.</p> : <>
        {session && <div className={styles.toolbar}>
          <div className={styles.filters} role="group" aria-label="Filter activity by type">{filters.map(item => <button key={item.value} type="button" aria-pressed={filter === item.value} onClick={() => setFilter(item.value)}>{item.label}</button>)}</div>
          <label className={styles.search}><span className={styles.srOnly}>Search activity</span><svg viewBox="0 0 20 20" width="16" height="16" aria-hidden="true"><circle cx="8" cy="8" r="5"/><path d="m12 12 5 5"/></svg><input type="search" value={search} onChange={event => setSearch(event.target.value)} placeholder="Search activity" /></label>
        </div>}
        {busy && events.length === 0 && <div className={styles.empty} role="status"><span className={styles.loadingDot} aria-hidden="true" /><p>Loading activity…</p></div>}
        {!busy && !error && events.length === 0 && <div className={styles.empty}><span aria-hidden="true" className={styles.emptyGlyph}>↳</span><h2>Your history starts here.</h2><p>Connection changes and demo sign-ins will appear in order.</p>{!accountId && <Link className="quiet-link" href="/accounts/new/">Add a connection <span aria-hidden="true">↗</span></Link>}</div>}
        {events.length > 0 && <>
          <div className={styles.results}><p aria-live="polite">{visibleEvents.length} {visibleEvents.length === 1 ? "event" : "events"}{nextCursor || filter !== "all" || search ? ` shown · ${events.length} loaded` : ""}</p>{nextCursor && <span>Search and export cover loaded events.</span>}</div>
          {visibleEvents.length === 0 ? <div className={styles.empty}><h2>No matching activity.</h2><p>Try another search or filter{nextCursor ? ", or load earlier events" : ""}.</p><button type="button" className="quiet-link" onClick={() => { setFilter("all"); setSearch(""); }}>Clear filters <span aria-hidden="true">↻</span></button></div> : <ol className={styles.events} aria-label="Access activity">{visibleEvents.map(event => <li key={event.id}>
            <span className={`${styles.marker} ${event.action === "handoff.simulated" ? styles.signInMarker : ""}`} aria-hidden="true">{event.action === "handoff.simulated" ? "↗" : event.action === "account.revoked" ? "−" : "·"}</span>
            <div className={styles.detail}><strong>{actionLabel(event.action)}</strong>{event.target && <span className={styles.target}>{event.target}</span>}<span className={styles.actor}>{event.actorEmail}</span></div>
            <div className={styles.time}><time dateTime={event.occurredAt} title={new Date(event.occurredAt).toLocaleString("en-US")}>{new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric" }).format(new Date(event.occurredAt))}<span>{new Intl.DateTimeFormat("en-US", { hour: "numeric", minute: "2-digit" }).format(new Date(event.occurredAt))}</span></time><span className={styles.eventId}>#{event.id}</span></div>
          </li>)}</ol>}
        </>}
        {nextCursor && <button type="button" className={styles.more} disabled={busy} onClick={loadMore}>{busy ? "Loading…" : "Load earlier events"}<span aria-hidden="true">↓</span></button>}
      </>}
      {error && <div className={styles.error} role="alert"><p>{error}</p><button type="button" className="quiet-link" disabled={busy} onClick={() => setRevision(value => value + 1)}>Try again</button></div>}
      {session && canManage(session) && <p className={styles.auditNote}>Recorded changes and simulated sign-ins. External platform activity isn’t connected.</p>}
    </main>
    </WorkspaceShell>;
}
