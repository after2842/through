"use client";

import { useEffect, useState } from "react";
import styles from "./use-case.module.css";

type Phase = "ready" | "filling" | "reading" | "done";

function Arrow({ replay = false }: { replay?: boolean }) {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      {replay ? <path d="M5 8a8 8 0 1 1-1 7M5 3v5h5" /> : <path d="M5 12h14m-6-6 6 6-6 6" />}
    </svg>
  );
}

export default function UseCase() {
  const [phase, setPhase] = useState<Phase>("ready");
  const busy = phase === "filling" || phase === "reading";
  const signedIn = phase === "reading" || phase === "done";

  useEffect(() => {
    if (phase !== "filling" && phase !== "reading") return;
    const timer = window.setTimeout(() => {
      setPhase(phase === "filling" ? "reading" : "done");
    }, 1200);
    return () => window.clearTimeout(timer);
  }, [phase]);

  const status = {
    ready: "A login is the only thing in the way.",
    filling: "Saved password entered. Signing in…",
    reading: "Signed in. Your agent is reading the updates…",
    done: "Weekly brief finished. Same browser, same task.",
  }[phase];

  return (
    <section id="use-case" className={styles.section} aria-labelledby="use-case-title">
      <div className={styles.introduction}>
        <p className={styles.eyebrow}>ONE LESS INTERRUPTION</p>
        <h2 id="use-case-title">Let your agent enter your password and sign in.</h2>
        <p className={styles.description}>With your permission, through signs your agent in so it can finish the work.</p>
        <div className={styles.action}>
          <button type="button" className={styles.play} onClick={() => setPhase("filling")} disabled={busy}>
            <span>{phase === "ready" ? "Watch the handoff" : phase === "filling" ? "Signing in…" : phase === "reading" ? "Finishing the brief…" : "Replay"}</span>
            <Arrow replay={phase === "done"} />
          </button>
          <p className={styles.status} aria-live="polite" aria-atomic="true">{status}</p>
        </div>
      </div>

      <figure className={styles.figure}>
        <div className={styles.request}>
          <span className={styles.requestLabel}>YOUR REQUEST</span>
          <p>“Catch me up on this week in Linear.”</p>
        </div>

        <div className={styles.browser} role="img" aria-label={signedIn ? "Illustrative signed-in Northstar workspace with two project updates. No real account is connected." : phase === "filling" ? "Illustrative login screen with the example email alex@example.com and a masked example password entered by through." : "Illustrative login screen blocking an agent from viewing project updates."}>
          <div className={styles.chrome} aria-hidden="true">
            <div className={styles.windowDots}><i /><i /><i /></div>
            <div className={styles.address}>
              <svg width="11" height="12" viewBox="0 0 12 14" fill="none"><path d="M3.5 6V4a2.5 2.5 0 0 1 5 0v2M2 6h8v6H2z" stroke="currentColor" strokeWidth="1.1" strokeLinejoin="round" /></svg>
              <span>linear.app{signedIn ? "/northstar" : "/login"}</span>
            </div>
            <span className={styles.tabCount}>1 tab</span>
          </div>

          <div className={styles.screen} aria-hidden="true">
            {!signedIn ? (
              <div className={styles.login}>
                <span className={styles.workspaceMark}>N</span>
                <h3>Sign in to Northstar</h3>
                <p className={styles.workspaceHint}>Your team’s workspace</p>
                <div className={styles.fields}>
                  <div className={styles.field}><span>Email</span><div className={styles.input}>alex@example.com</div></div>
                  <div className={styles.field}>
                    <span>Password</span>
                    <div className={`${styles.input} ${phase === "filling" ? styles.filled : ""}`}>
                      <span className={styles.password}>{phase === "filling" ? "••••••••••••" : ""}</span>
                      {phase === "filling" && <span className={styles.fillSource}>through <span>✓</span></span>}
                    </div>
                  </div>
                  <div className={`${styles.mockButton} ${phase === "filling" ? styles.mockBusy : ""}`}>{phase === "filling" ? "Signing in…" : "Continue"}<span>{phase === "filling" ? "· · ·" : "→"}</span></div>
                </div>
              </div>
            ) : (
              <div className={styles.workspace}>
                <div className={styles.sidebar}>
                  <div className={styles.workspaceName}><span>N</span>Northstar</div>
                  <div className={styles.sidebarItem}><span>⌘</span>Workspace</div>
                  <div className={`${styles.sidebarItem} ${styles.selected}`}><span>▤</span>Projects</div>
                  <div className={styles.sidebarItem}><span>◷</span>Updates</div>
                  <div className={styles.sidebarFooter}><span>A</span>Alex</div>
                </div>
                <div className={styles.projectContent}>
                  <div className={styles.breadcrumb}>Northstar <span>/</span> Projects</div>
                  <div className={styles.projectHeading}><span className={styles.projectIcon}>▤</span><h3>This week</h3></div>
                  <p className={styles.projectSubheading}>2 project updates</p>
                  <div className={styles.projectRow}><span className={styles.doneIcon}>✓</span><div><strong>Onboarding</strong><span>New welcome flow shipped.</span></div></div>
                  <div className={styles.projectRow}><span className={styles.reviewIcon}>◐</span><div><strong>Search</strong><span>Faster results, ready for review.</span></div></div>
                  <div className={`${styles.briefStatus} ${phase === "done" ? styles.briefDone : ""}`}><span>{phase === "done" ? "✓" : "· · ·"}</span>{phase === "done" ? "Weekly brief ready" : "Your agent is preparing the brief"}</div>
                </div>
              </div>
            )}
          </div>
        </div>
        <figcaption>Illustrative demo · External sign-in is not connected.</figcaption>
      </figure>
    </section>
  );
}
