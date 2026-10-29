"use client";

import EnvironmentNote from "@/components/environment-note";
import Link from "next/link";
import SiteHeader from "@/components/site-header";
import { canManage, type WorkspaceSession } from "@/lib/client";
import styles from "./member-home.module.css";

export default function MemberHome({ session }: { session: WorkspaceSession }) {
  const count = session.accounts.length;
  const hasAccounts = count > 0;
  const isPaused = session.accessPaused;
  const manager = canManage(session);

  return (
    <div className="page app-page">
      <SiteHeader action={<>
        {manager && <Link className="quiet-link" href="/activity/">Activity</Link>}
        <Link className="quiet-link" href="/settings/">Settings</Link>
      </>} />
      <main id="main" className={`app-main ${styles.main}`}>
        <div className={styles.workspace}>
          <div className={styles.introduction}>
            <p className={styles.identity}>{session.user.displayName || session.email}</p>
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
