"use client";

import Link from "next/link";
import WorkspaceShell from "./workspace-shell";
import PlatformIcon from "./platform-icon";
import { canManage, type WorkspaceSession } from "@/lib/client";
import styles from "./member-home.module.css";

export default function MemberHome({ session }: { session: WorkspaceSession }) {
  const count = session.accounts.length;
  const hasAccounts = count > 0;
  const isPaused = session.accessPaused;
  const manager = canManage(session);
  const permitted = session.accounts.some(account => account.agents.length > 0);

  return (
    <WorkspaceShell active="overview" email={session.email} canViewActivity={manager}>
      <main id="main" className={`app-main ${styles.main}`}>
        <div className={styles.workspace}>
          <div className={styles.introduction}>
            <p className={styles.identity}>{session.user.displayName || session.email}</p>
            <h1 className={styles.title}>
              {isPaused ? <>Access is<br />paused.</> : permitted ? <>Your next task.<br />Less friction.</> : hasAccounts ? <>Your accounts.<br />Your permission.</> : manager ? <>Give your agent<br />a way in.</> : <>Your workspace,<br />at a glance.</>}
            </h1>
            <p className={styles.description}>
              {!manager
                ? "Your workspace admin manages access."
                : isPaused
                  ? "You decide when your agent can use your accounts again."
                  : hasAccounts
                    ? permitted ? "Review your connections and preview how your agents use them." : "Your connections are saved. Choose an agent to give it access."
                    : "Add a website, try the credential flow, and choose who gets access."}
            </p>
            <Link className={styles.primaryAction} href={hasAccounts || !manager ? "/accounts/" : "/accounts/new/"}>
              {!manager ? "View connections" : hasAccounts ? "Manage connections" : "Connect an account"}<span aria-hidden="true">↗</span>
            </Link>
          </div>
          <div className={styles.accessOverview}>
            <div className={styles.summary}>
              <p className={styles.count}>{hasAccounts ? `${count} connected ${count === 1 ? "account" : "accounts"}` : "No accounts connected"}</p>
              <p className={`${styles.accessState} ${isPaused || !permitted ? styles.inactive : ""}`}>
                <span aria-hidden="true" />{isPaused ? "Access paused" : permitted ? "Demo access configured" : "No access granted"}
              </p>
            </div>
            {hasAccounts && <ul className={styles.accounts} aria-label="Connected accounts and agents">
              {session.accounts.slice(0, 5).map((account) => <li key={account.id}><Link className={styles.account} href={`/accounts/connection/?id=${encodeURIComponent(account.id)}`}>
                <span className={styles.service}><PlatformIcon origin={account.origin} name={account.service} size={28}/>{account.service}</span><span className={styles.agent}>{account.agents.join(", ") || "No access"} <span aria-hidden="true">↗</span></span></Link>
              </li>)}
            </ul>}
            {count > 5 && <Link className={styles.textButton} href="/accounts/">View all {count} connections →</Link>}
          </div>
        </div>
      </main>
    </WorkspaceShell>
  );
}
