"use client";

import EnvironmentNote from "@/components/environment-note";
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import SiteHeader from "@/components/site-header";
import { APIError, canManage, errorMessage, signOut, type WorkspaceSession } from "@/lib/client";
import styles from "./member-home.module.css";

export default function MemberHome({ session }: { session: WorkspaceSession }) {
  const router = useRouter();
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const mounted = useRef(false);
  const pending = useRef(false);
  const count = session.accounts.length;
  const hasAccounts = count > 0;
  const isPaused = session.accessPaused;
  const manager = canManage(session);

  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);

  async function handleSignOut() {
    if (pending.current) return;
    pending.current = true;
    setBusy(true);
    setError("");
    try {
      await signOut();
      if (mounted.current) router.replace("/");
    } catch (failure) {
      if (!mounted.current) return;
      if (failure instanceof APIError && failure.status === 401) { router.replace("/login/"); return; }
      setError(errorMessage(failure));
    } finally {
      pending.current = false;
      if (mounted.current) setBusy(false);
    }
  }

  return (
    <div className="page app-page">
      <SiteHeader action={<>
        {manager && <Link className="quiet-link" href="/activity/">Activity</Link>}
        <button type="button" className={`quiet-link ${styles.signOut}`} onClick={handleSignOut} disabled={busy}>{busy ? "Signing out…" : "Sign out"}</button>
      </>} />
      <main id="main" className={`app-main ${styles.main}`}>
        <div className={styles.workspace}>
          <div className={styles.introduction}>
            <p className={styles.identity}>{session.email}</p>
            <h1 className={styles.title}>
              {isPaused ? <>Access is<br />paused.</> : hasAccounts ? <>Ready for your<br />next task.</> : manager ? <>Give your agent<br />a way in.</> : <>Your workspace,<br />at a glance.</>}
            </h1>
            <p className={styles.description}>
              {!manager
                ? "Your workspace admin manages access."
                : isPaused
                  ? "You decide when your agent can use your accounts again."
                  : hasAccounts
                    ? "Your connected accounts, ready when your agent needs them."
                    : "Connect an account so your agent can pick up where it left off."}
            </p>
            <Link className={styles.primaryAction} href={hasAccounts || !manager ? "/accounts/" : "/accounts/?connect=1"}>
              {!manager ? "View accounts" : hasAccounts ? "Manage accounts" : "Connect an account"}<span aria-hidden="true">↗</span>
            </Link>
            {error && <p className={styles.error} role="alert">{error}</p>}
          </div>
          <div className={styles.accessOverview}>
            <div className={styles.summary}>
              <p className={styles.count}>{hasAccounts ? `${count} connected ${count === 1 ? "account" : "accounts"}` : "No accounts connected"}</p>
              <p className={`${styles.accessState} ${isPaused || !hasAccounts ? styles.inactive : ""}`}>
                <span aria-hidden="true" />{isPaused ? "Access paused" : hasAccounts ? "Access ready" : "No access granted"}
              </p>
            </div>
            {hasAccounts && <ul className={styles.accounts} aria-label="Connected accounts and agents">
              {session.accounts.map((account) => <li className={styles.account} key={account.id}>
                <span className={styles.service}>{account.service}</span><span className={styles.agent}>{account.agent}</span>
              </li>)}
            </ul>}
          </div>
        </div>
      </main>
      <footer className="app-footer"><EnvironmentNote /></footer>
    </div>
  );
}
