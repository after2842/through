"use client";

import { useState } from "react";
import Link from "next/link";
import AgentDemo from "@/components/agent-demo";
import styles from "./landing.module.css";

export default function LandingHero() {
  // Each press of "Watch it sign in" remounts the demo so that it plays from the first step.
  const [run, setRun] = useState(0);

  function watch() {
    setRun(value => value + 1);
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    document.getElementById("demo")?.scrollIntoView({ behavior: reduce ? "auto" : "smooth", block: "center" });
  }

  return (
    <section className={styles.hero} aria-labelledby="headline">
      <div className={styles.heroCopy}>
        <div>
          <p className={styles.label}>Sign-in for AI agents <b>· Preview</b></p>
          <h1 id="headline">Your agent signs in. The work continues.</h1>
        </div>
        <div>
          <p className={styles.lead}>When <strong>Claude, Codex or Cursor</strong> reaches a login page in its built-in browser, through enters the credentials you approved and hands the tab back.</p>
          <div className={styles.actions}>
            <Link className={`${styles.button} ${styles.primary}`} href="/login/">Set up a connection</Link>
            <button type="button" className={`${styles.button} ${styles.secondary}`} onClick={watch}>Watch it sign in <span aria-hidden="true">↓</span></button>
          </div>
        </div>
      </div>
      <div className={styles.demo} id="demo"><AgentDemo key={run} startNow={run > 0} /></div>
    </section>
  );
}
