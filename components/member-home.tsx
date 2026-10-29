"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import SiteHeader from "@/components/site-header";
import { clearDemoSession, type DemoSession } from "@/lib/demo-session";
import styles from "./member-home.module.css";

export default function MemberHome({ session }: { session: DemoSession }) {
  const router = useRouter();
  const [error, setError] = useState("");
  const count = session.accounts.length;
  const hasAccounts = count > 0;
  const isPaused = hasAccounts && session.accessPaused;

  function signOut() {
    try {
      clearDemoSession();
      router.replace("/");
    } catch {
      setError("Couldn’t sign out. Allow browser storage, then try again.");
    }
  }

  return (
    <div className="page app-page">
      <SiteHeader action={<button type="button" className="quiet-link" onClick={signOut}>Sign out</button>} />
      <main id="main" className={`app-main ${styles.main}`}>
        <div className={styles.workspace}>
          <div className={styles.introduction}>
            <p className={styles.identity}>{session.email}</p>
            <h1 className={styles.title}>
              {isPaused ? <>Access is<br />paused.</> : hasAccounts ? <>Ready for your<br />next task.</> : <>Give your agent<br />a way in.</>}
            </h1>
            <p className={styles.description}>
              {isPaused
                ? "You decide when your agent can use your accounts again."
                : hasAccounts
                  ? "Your connected accounts, ready when your agent needs them."
                  : "Connect an account so your agent can pick up where it left off."}
            </p>
            <Link className={styles.primaryAction} href={hasAccounts ? "/accounts/" : "/accounts/?connect=1"}>
              {hasAccounts ? "Manage accounts" : "Connect an account"}<span aria-hidden="true">↗</span>
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
            {hasAccounts && (
              <ul className={styles.accounts} aria-label="Connected accounts and agents">
                {session.accounts.map((account) => (
                  <li className={styles.account} key={account.id}>
                    <span className={styles.service}>{account.service}</span>
                    <span className={styles.agent}>{account.agent}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      </main>
      <footer className="app-footer">Demo workspace · No real accounts are connected.</footer>
    </div>
  );
}
