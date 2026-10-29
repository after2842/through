"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import SiteHeader from "./site-header";
import SelectField from "./select-field";
import EnvironmentNote from "./environment-note";
import { APIError, errorMessage, getSession, updateProfile, signOut, signOutOtherSessions, type WorkspaceSession } from "@/lib/client";
import { useThemePreference, type ThemePreference } from "@/lib/theme";
import styles from "./user-settings.module.css";

export default function UserSettings() {
  const router = useRouter();
  const { preference, setPreference } = useThemePreference();
  const [session, setSession] = useState<WorkspaceSession | null>(null);
  const [name, setName] = useState("");
  const [loading, setLoading] = useState(true);
  const [revision, setRevision] = useState(0);
  const [loadError, setLoadError] = useState("");
  const [profileError, setProfileError] = useState("");
  const [profileStatus, setProfileStatus] = useState("");
  const [securityError, setSecurityError] = useState("");
  const [securityStatus, setSecurityStatus] = useState("");
  const [busy, setBusy] = useState<"profile" | "others" | "logout" | null>(null);
  const alive = useRef(false);
  const pending = useRef(false);

  useEffect(() => {
    let cancelled = false;
    alive.current = true;
    setLoading(true); setLoadError("");
    void getSession().then(current => {
      if (cancelled) return;
      if (!current) { router.replace("/login/"); return; }
      setSession(current); setName(current.user.displayName);
    }).catch(error => { if (!cancelled) setLoadError(errorMessage(error)); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; alive.current = false; };
  }, [revision, router]);

  function begin(action: "profile" | "others" | "logout") {
    if (pending.current) return false;
    pending.current = true; setBusy(action); return true;
  }
  function finish() { pending.current = false; if (alive.current) setBusy(null); }
  function fail(error: unknown, setError: (message: string) => void) {
    if (!alive.current) return;
    if (error instanceof APIError && error.status === 401) { router.replace("/login/"); return; }
    setError(errorMessage(error));
  }
  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!begin("profile")) return;
    setProfileError(""); setProfileStatus("");
    try {
      const next = await updateProfile(name);
      if (!alive.current) return;
      setSession(next); setName(next.user.displayName); setProfileStatus("Name saved.");
    } catch (error) { fail(error, setProfileError); }
    finally { finish(); }
  }
  async function endOtherSessions() {
    if (!begin("others")) return;
    setSecurityError(""); setSecurityStatus("");
    try {
      const result = await signOutOtherSessions();
      if (alive.current) setSecurityStatus(result.revokedSessions ? `${result.revokedSessions} other ${result.revokedSessions === 1 ? "session signed" : "sessions signed"} out. This session stays active.` : "No other active sessions. You’re still signed in here.");
    } catch (error) { fail(error, setSecurityError); }
    finally { finish(); }
  }
  async function leave() {
    if (!begin("logout")) return;
    setSecurityError(""); setSecurityStatus("");
    try { await signOut(); if (alive.current) router.replace("/"); }
    catch (error) { fail(error, setSecurityError); }
    finally { finish(); }
  }

  return <div className="page app-page">
    <SiteHeader action={<><Link href="/accounts/" className="quiet-link">Accounts</Link><Link href="/pricing/" className="quiet-link">Pricing</Link></>} />
    <main id="main" className={`app-main ${styles.main}`}>
      <div className={styles.heading}><h1>Your settings.</h1></div>
      {loading || loadError || !session ? <div className={styles.loading} role={loadError ? "alert" : "status"}>
        <p>{loadError || "Loading your settings…"}</p>
        {loadError && <button className="quiet-link" onClick={() => setRevision(value => value + 1)}>Try again <span aria-hidden="true">↗</span></button>}
      </div> : <>
        <section className={styles.section} aria-labelledby="profile-heading">
          <h2 id="profile-heading">Profile</h2>
          <div className={styles.content}>
            <div className={styles.identity}><span>Email</span><p>{session.email}</p></div>
            <form onSubmit={save}>
              <label className={styles.label} htmlFor="display-name">Name <span>Optional</span></label>
              <div className={styles.nameRow}>
                <input id="display-name" name="displayName" autoComplete="name" value={name} disabled={busy !== null} placeholder="Your name" aria-invalid={!!profileError} aria-describedby={profileError ? "profile-error" : undefined} onChange={event => { setName(event.target.value); setProfileError(""); setProfileStatus(""); }} />
                <button className={styles.save} disabled={busy !== null || name.trim() === session.user.displayName}>{busy === "profile" ? "Saving…" : "Save"}</button>
              </div>
              {profileError && <p id="profile-error" className={styles.error} role="alert">{profileError}</p>}
              <p className={styles.status} role="status">{profileStatus}</p>
            </form>
          </div>
        </section>
        <section className={styles.section} aria-labelledby="appearance-heading">
          <h2 id="appearance-heading">Appearance</h2>
          <div className={styles.content}><SelectField id="appearance" label="Theme" value={preference} options={["System", "Light", "Dark"]} placeholder="Choose a theme" onChange={value => setPreference(value as ThemePreference)} /><p className={styles.hint}>Saved on this browser.</p></div>
        </section>
        <section className={styles.section} aria-labelledby="plan-heading">
          <h2 id="plan-heading">Plan</h2>
          <div className={`${styles.content} ${styles.inline}`}><div><p className={styles.value}>Free preview</p><p className={styles.hint}>No subscription or payment method.</p></div><Link href="/pricing/" className="quiet-link">View plans <span aria-hidden="true">↗</span></Link></div>
        </section>
        <section className={styles.section} aria-labelledby="security-heading">
          <h2 id="security-heading">Sign-in</h2>
          <div className={styles.content}>
            <p className={styles.value}>Demo verification</p><p className={styles.hint}>An authenticator is not connected yet.</p>
            <div className={styles.sessions}>
              {session.backend ? <><button className={styles.textButton} disabled={busy !== null} onClick={endOtherSessions}>{busy === "others" ? "Ending sessions…" : "Sign out other sessions"}<span aria-hidden="true">↗</span></button><p className={styles.hint}>Keep this session. End your other through sessions.</p></> : <p className={styles.hint}>This demo session is local to this tab.</p>}
              <p className={styles.status} role="status">{securityStatus}</p>
            </div>
            <button className={styles.textButton} disabled={busy !== null} onClick={leave}>{busy === "logout" ? "Signing out…" : "Sign out"}<span aria-hidden="true">↗</span></button>
            {securityError && <p className={styles.error} role="alert">{securityError}</p>}
          </div>
        </section>
      </>}
    </main>
    <footer className="app-footer"><EnvironmentNote /></footer>
  </div>;
}
