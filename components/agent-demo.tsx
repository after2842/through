"use client";

import { useEffect, useState } from "react";
import styles from "./agent-demo.module.css";

type Phase = "blocked" | "checking" | "filling" | "signing" | "working" | "done";
const phases: Phase[] = ["blocked", "checking", "filling", "signing", "working", "done"];
const messages: Record<Phase, { title: string; detail: string }> = {
  blocked: { title: "A login is in the way.", detail: "Your agent found the workspace. Now it needs to sign in." },
  checking: { title: "Checking your permission.", detail: "Northstar · Cursor · northstar.example" },
  filling: { title: "Entering your saved password.", detail: "The account and agent match the permission you set." },
  signing: { title: "Signing in to Northstar.", detail: "The agent continues in the same browser tab." },
  working: { title: "Back to the original task.", detail: "Your agent is reading this week’s project updates." },
  done: { title: "Your weekly brief is ready.", detail: "Onboarding shipped. Search is ready for review. No blockers." },
};

function Arrow({ replay = false }: { replay?: boolean }) {
  return <svg width="15" height="15" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d={replay ? "M5 8a8 8 0 1 1-1 7M5 3v5h5" : "M5 12h14m-6-6 6 6-6 6"} stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" /></svg>;
}

export default function AgentDemo() {
  const [phase, setPhase] = useState<Phase>("blocked");
  const [playing, setPlaying] = useState(false);
  const [characters, setCharacters] = useState(0);
  const [reducedMotion, setReducedMotion] = useState(false);
  const signedIn = phase === "working" || phase === "done";
  const started = phase !== "blocked";
  const finished = phase === "done";
  const message = messages[phase];

  useEffect(() => {
    const media = window.matchMedia("(prefers-reduced-motion: reduce)");
    const update = () => { setReducedMotion(media.matches); if (media.matches) setPlaying(false); };
    update();
    media.addEventListener("change", update);
    return () => media.removeEventListener("change", update);
  }, []);

  useEffect(() => {
    if (!playing || reducedMotion || phase === "blocked" || phase === "done") return;
    const delay = phase === "filling" ? 1500 : phase === "working" ? 1600 : 1100;
    const timer = window.setTimeout(() => {
      const next = phases[phases.indexOf(phase) + 1];
      setPhase(next);
      if (next === "done") setPlaying(false);
    }, delay);
    return () => window.clearTimeout(timer);
  }, [phase, playing, reducedMotion]);

  useEffect(() => {
    if (phase !== "filling" || !playing || reducedMotion) return;
    const timer = window.setInterval(() => setCharacters(value => Math.min(value + 1, 12)), 85);
    return () => window.clearInterval(timer);
  }, [phase, playing, reducedMotion]);

  function advance() {
    if (!started || finished) {
      setCharacters(0);
      setPhase("checking");
      setPlaying(!reducedMotion);
      return;
    }
    if (reducedMotion) {
      setPhase(phases[phases.indexOf(phase) + 1]);
      return;
    }
    setPlaying(value => !value);
  }

  const buttonText = finished ? "Replay demo" : !started ? "Try the demo" : reducedMotion ? "Next step" : playing ? "Pause demo" : "Resume demo";
  const passwordLength = phase === "filling" ? reducedMotion ? 12 : characters : phase === "signing" ? 12 : 0;

  return (
    <div className={styles.demo}>
      <div className={styles.scene}>
        <div className={styles.conversation}>
          <div>
            <p className={styles.label}>YOU ASKED YOUR AGENT</p>
            <p className={styles.request}>“Give me a brief of this week’s project updates.”</p>
          </div>
          <div className={`${styles.agentReply} ${finished ? styles.complete : ""}`}>
            <span className={styles.agentMark} aria-hidden="true">{finished ? "✓" : "✳"}</span>
            <div aria-live="polite" aria-atomic="true">
              <p className={styles.replyTitle}>{message.title}</p>
              <p className={styles.replyDetail}>{message.detail}</p>
            </div>
          </div>
          <div className={styles.controls}>
            <button type="button" className={styles.button} onClick={advance} aria-controls="agent-demo-screen">
              {buttonText}{playing && !reducedMotion ? <span className={styles.pauseIcon} aria-hidden="true">Ⅱ</span> : <Arrow replay={finished} />}
            </button>
            <span className={styles.step}>{String(phases.indexOf(phase) + 1).padStart(2, "0")} / 06</span>
          </div>
        </div>

        <div className={styles.browser} id="agent-demo-screen" role="img" aria-label={signedIn ? `Illustrative Northstar workspace. ${message.title} ${message.detail}` : `Illustrative Northstar login screen. ${message.title} ${passwordLength ? "A fictional password is shown as masked dots." : "The password field is empty."}`}>
          <div className={styles.chrome} aria-hidden="true">
            <span className={styles.windowDots}><i /><i /><i /></span>
            <span className={styles.address}><span aria-hidden="true">⌑</span> northstar.example{signedIn ? "/projects" : "/login"}</span>
            <span className={styles.tabLabel}>Same tab</span>
          </div>
          <div className={styles.screen} aria-hidden="true">
            {!signedIn ? (
              <div className={styles.login}>
                <div className={styles.loginHeading}><span className={styles.workspaceMark}>N</span><div><strong>Welcome to Northstar</strong><span>Sign in to your workspace</span></div></div>
                <div className={styles.field}><span>Email</span><div className={styles.input}>alex@example.com</div></div>
                <div className={styles.field}><span>Password</span><div className={`${styles.input} ${phase === "filling" ? styles.filling : ""}`}><span className={styles.password}>{"•".repeat(passwordLength)}</span>{(phase === "filling" || phase === "signing") && <span className={styles.fillSource}>through <span>✓</span></span>}</div></div>
                <div className={`${styles.signIn} ${phase === "signing" ? styles.signing : ""}`}>{phase === "signing" ? "Signing in…" : "Sign in"}<span>{phase === "signing" ? "···" : "→"}</span></div>
                <p className={`${styles.permission} ${started ? styles.permissionFound : ""}`}>{phase === "blocked" ? "Agent paused · Sign-in required" : phase === "checking" ? "Checking Cursor’s access to this domain…" : "✓ Cursor has permission to use this account"}</p>
              </div>
            ) : (
              <div className={styles.workspace}>
                <div className={styles.workspaceHeading}><span className={styles.workspaceMark}>N</span><strong>Northstar</strong><span className={styles.signedIn}>✓ Signed in</span></div>
                <div className={styles.projectHeading}><h3>This week</h3><span>2 updates</span></div>
                <div className={styles.projectRow}><span className={styles.doneIcon}>✓</span><div><strong>Onboarding</strong><span>New welcome flow shipped.</span></div><span className={styles.projectTag}>Done</span></div>
                <div className={styles.projectRow}><span className={styles.reviewIcon}>◐</span><div><strong>Search</strong><span>Faster results, ready for review.</span></div><span className={styles.projectTag}>In review</span></div>
                <div className={`${styles.result} ${finished ? styles.resultReady : ""}`}><span>{finished ? "✓" : "↳"}</span><span>{finished ? "Brief complete. Back to you." : "Reading updates for your brief…"}</span></div>
              </div>
            )}
          </div>
        </div>
      </div>
      <p className={styles.caption}>Illustrative demo · Fictional account. No external sign-in.</p>
    </div>
  );
}
