"use client";

import { useEffect, useState } from "react";
import styles from "./agent-demo.module.css";

type Phase = "paused" | "connecting" | "working" | "done";

export default function AgentDemo() {
  const [phase, setPhase] = useState<Phase>("paused");
  const busy = phase === "connecting" || phase === "working";
  const connected = phase === "working" || phase === "done";

  useEffect(() => {
    if (!busy) return;
    const timer = window.setTimeout(() => {
      setPhase(phase === "connecting" ? "working" : "done");
    }, phase === "connecting" ? 1300 : 1100);
    return () => window.clearTimeout(timer);
  }, [phase, busy]);

  const status = {
    paused: "Sign-in required",
    connecting: "Connecting account",
    working: "Connected",
    done: "Connected",
  }[phase];

  return (
    <div className={`${styles.demo} ${connected ? styles.connected : ""} ${busy ? styles.busy : ""}`}>
      <div className={styles.workflow}>
        <svg className={styles.flowLine} viewBox="0 0 1000 2" preserveAspectRatio="none" fill="none" aria-hidden="true">
          <path className={styles.basePath} d="M0 1H1000" />
          <path className={styles.activePath} d="M0 1H1000" />
        </svg>

        <div className={styles.station}>
          <span className={styles.agentSymbol} aria-hidden="true">
            <svg width="34" height="34" viewBox="0 0 34 34" fill="none"><path d="M17 3v28M3 17h28M7.1 7.1l19.8 19.8M7.1 26.9 26.9 7.1" stroke="currentColor" strokeWidth="1.35" strokeLinecap="round" /></svg>
          </span>
          <div className={styles.stationText}><strong>Your agent</strong><span>{connected ? "Signed in" : phase === "paused" ? "Waiting to sign in" : "Connecting"}</span></div>
        </div>

        <div className={styles.threshold}>
          <span className={styles.brand}>through</span>
          <svg className={styles.doorway} width="64" height="94" viewBox="0 0 64 94" fill="none" aria-hidden="true">
            <path className={styles.doorFill} d="M10 86V9h44v77H10Z" />
            <path className={styles.doorOutline} d="M10 86V9h44v77M2 87h60" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
            <path className={styles.doorArrow} d="M23 48h18m-6-6 6 6-6 6" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          <span className={styles.connectionStatus} aria-live="polite" aria-atomic="true"><i className={busy ? styles.loadingDot : ""} />{status}</span>
        </div>

        <div className={`${styles.station} ${styles.destination}`}>
          <span className={styles.destinationSymbol} aria-hidden="true">
            <svg width="34" height="34" viewBox="0 0 34 34" fill="none"><circle cx="17" cy="17" r="14" stroke="currentColor" strokeWidth="1.25" /><path d="m10.5 17 4.3 4.3 8.7-8.6" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" /></svg>
          </span>
          <div className={styles.stationText}><strong>Same browser</strong><span>{connected ? "Work resumed" : "Ready to resume"}</span></div>
        </div>
      </div>

      <div className={styles.action}>
        <button type="button" className={styles.button} disabled={busy} onClick={() => setPhase("connecting")}>
          <span>{phase === "done" ? "Replay" : phase === "connecting" ? "Connecting…" : phase === "working" ? "Resuming work…" : "Try the demo"}</span>
          {phase === "done" ? <svg width="15" height="15" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M5 8a8 8 0 1 1-1 7M5 3v5h5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" /></svg> : <svg width="15" height="15" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M5 12h14m-6-6 6 6-6 6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" /></svg>}
        </button>
      </div>
    </div>
  );
}
