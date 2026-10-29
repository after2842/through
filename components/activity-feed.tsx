"use client";

import EnvironmentNote from "@/components/environment-note";
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import SiteHeader from "./site-header";
import { APIError, canManage, errorMessage, getAudit, getSession, type AuditEvent, type WorkspaceSession } from "@/lib/client";
import styles from "./activity-feed.module.css";

const labels: Record<string, string> = {
  "session.created": "Signed in", "session.revoked": "Signed out", "auth.login": "Signed in", "auth.logout": "Signed out",
  "profile.updated": "Profile updated", "session.others_signed_out": "Other sessions signed out",
  "session.signed_in": "Signed in", "session.signed_out": "Signed out",
  "account.created": "Account connected", "account.connected": "Account connected", "account.revoked": "Account access removed",
  "workspace.paused": "All account access paused", "workspace.resumed": "Account access resumed",
  "access.paused": "All account access paused", "access.resumed": "Account access resumed",
  "handoff.simulated": "Demo sign-in completed", "handoff.denied": "Sign-in request denied",
};
function actionLabel(action: string) { return labels[action] ?? action.split(/[._]/).join(" ").replace(/^./, letter => letter.toUpperCase()); }

export default function ActivityFeed() {
  const router = useRouter();
  const [session, setSession] = useState<WorkspaceSession | null>(null);
  const [events, setEvents] = useState<AuditEvent[]>([]);
  const [nextCursor, setNextCursor] = useState<string | undefined>();
  const [busy, setBusy] = useState(true);
  const [error, setError] = useState("");
  const [revision, setRevision] = useState(0);
  const alive = useRef(false);
  const pending = useRef(false);

  useEffect(() => {
    alive.current = true;
    let cancelled = false;
    setBusy(true);
    setError("");
    async function load() {
      try {
        const current = await getSession();
        if (cancelled) return;
        if (!current) { router.replace("/login/"); return; }
        setSession(current);
        if (!canManage(current)) { setBusy(false); return; }
        const page = await getAudit();
        if (cancelled) return;
        setEvents(page.events);
        setNextCursor(page.nextCursor || undefined);
      } catch (reason) {
        if (cancelled) return;
        if (reason instanceof APIError && reason.status === 401) { router.replace("/login/"); return; }
        setError(errorMessage(reason));
      } finally { if (!cancelled) setBusy(false); }
    }
    void load();
    return () => { cancelled = true; alive.current = false; };
  }, [revision, router]);

  async function loadMore() {
    if (!nextCursor || pending.current) return;
    pending.current = true;
    setBusy(true); setError("");
    try {
      const page = await getAudit(nextCursor);
      if (!alive.current) return;
      setEvents(existing => [...existing, ...page.events.filter(event => !existing.some(item => item.id === event.id))]);
      setNextCursor(page.nextCursor || undefined);
    } catch (reason) {
      if (!alive.current) return;
      if (reason instanceof APIError && reason.status === 401) { router.replace("/login/"); return; }
      setError(errorMessage(reason));
    }
    finally { pending.current = false; if (alive.current) setBusy(false); }
  }
  return <div className="page app-page">
    <SiteHeader action={session ? <><Link href="/accounts/" className="quiet-link">Accounts</Link><Link href="/settings/" className="quiet-link">Settings</Link></> : undefined} />
    <main id="main" className={`app-main ${styles.main}`}>
      <div className={styles.heading}><div><h1>Activity.</h1><p>Account access, in order.</p></div>
        {session && canManage(session) && <button className="quiet-link" disabled={busy} onClick={() => setRevision(value => value + 1)}>Refresh <span aria-hidden="true">↻</span></button>}
      </div>
      {session && !canManage(session) ? <p className={styles.notice}>Your workspace admin can view access activity.</p> : <>
        {busy && events.length === 0 && <p className={styles.notice} role="status">Loading activity…</p>}
        {!busy && !error && events.length === 0 && <p className={styles.notice}>Changes to account access will appear here.</p>}
        {events.length > 0 && <ol className={styles.events} aria-label="Access activity">{events.map(event => <li key={event.id}>
          <span className={styles.marker} aria-hidden="true" />
          <div className={styles.detail}><strong>{actionLabel(event.action)}</strong>{event.target && <span className={styles.target}>{event.target}</span>}<span>{event.actorEmail}</span></div>
          <time dateTime={event.occurredAt} title={new Date(event.occurredAt).toLocaleString("en-US")}>{new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }).format(new Date(event.occurredAt))}</time>
        </li>)}</ol>}
        {nextCursor && <button className={styles.more} disabled={busy} onClick={loadMore}>{busy ? "Loading…" : "Earlier activity"}<span aria-hidden="true">↓</span></button>}
      </>}
      {error && <div className={styles.error} role="alert"><p>{error}</p><button className="quiet-link" disabled={busy} onClick={() => setRevision(value => value + 1)}>Try again</button></div>}
    </main>
    <footer className="app-footer"><EnvironmentNote /></footer>
  </div>;
}
