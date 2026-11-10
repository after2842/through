"use client";

import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties } from "react";
import { AGENT_NAMES, type AgentName } from "@/lib/platforms";
import styles from "./agent-demo.module.css";

const EMAIL = "alex@example.com";
const PASSWORD_LENGTH = 12;
const SITE = "northstar.example";

type Step = { short: string; title: string; ms: number; active: (agent: AgentName) => string; done: (agent: AgentName) => string };

// One step per row of the agent's log. `ms` is how long the step plays.
const STEPS: readonly Step[] = [
  { short: "Login", title: "Open Northstar", ms: 1900,
    active: () => `Loading ${SITE}/projects…`,
    done: () => "Redirected to sign-in. The task is paused." },
  { short: "Permission", title: "Ask through for access", ms: 2000,
    active: agent => `Checking ${agent}’s permission for ${SITE}…`,
    done: agent => `${agent} is allowed on ${SITE}. Single-use grant issued.` },
  { short: "Credentials", title: "Enter the credentials", ms: 3600,
    active: () => "Typing into the sign-in form…",
    done: agent => `Email and password entered. The password stays hidden from ${agent}.` },
  { short: "Sign in", title: "Sign in", ms: 1900,
    active: () => "Submitting the form…",
    done: () => "Signed in, in the same tab." },
  { short: "Resume", title: "Continue the task", ms: 2800,
    active: () => "Reading this week’s project updates…",
    done: () => "Read 3 project updates." },
  { short: "Done", title: "Deliver the brief", ms: 0,
    active: () => "Brief delivered. Sign-in recorded in Activity.",
    done: () => "Brief delivered. Sign-in recorded in Activity." },
];
const LAST = STEPS.length - 1;
const UPDATES = [
  ["Onboarding", "New welcome flow shipped.", "Done"],
  ["Search", "Faster results, ready for review.", "In review"],
  ["Billing export", "Moved to next week.", "Delayed"],
] as const;

type Target = "email" | "password" | "submit" | "row0" | "row1" | "row2" | null;
const AIM: Record<Exclude<Target, null>, [number, number]> = {
  email: [0.66, 0.6], password: [0.5, 0.6], submit: [0.5, 0.55], row0: [0.86, 0.5], row1: [0.86, 0.5], row2: [0.86, 0.5],
};

const clamp = (value: number) => Math.min(1, Math.max(0, value));
// Progress through the sub-range [from, to] of a step's own progress.
const span = (progress: number, from: number, to: number) => clamp((progress - from) / (to - from));

export default function AgentDemo({ startNow = false }: { startNow?: boolean }) {
  const [agent, setAgent] = useState<AgentName>(AGENT_NAMES[0]);
  const [position, setPosition] = useState({ step: 0, progress: 0 });
  const [playing, setPlaying] = useState(startNow);
  const [started, setStarted] = useState(startNow);
  const [reducedMotion, setReducedMotion] = useState(false);
  const viewRef = useRef<HTMLDivElement>(null);
  const cursorRef = useRef<SVGSVGElement>(null);
  const targets = useRef<Partial<Record<Exclude<Target, null>, HTMLElement | null>>>({});

  const step = position.step;
  const finished = step === LAST;
  // Without motion, each step is shown in its completed state.
  const progress = finished || (reducedMotion && started) ? 1 : position.progress;
  const running = playing && !finished && !reducedMotion;
  const at = (index: number) => step > index ? 1 : step < index ? 0 : progress;

  useEffect(() => {
    const media = window.matchMedia("(prefers-reduced-motion: reduce)");
    const update = () => setReducedMotion(media.matches);
    update();
    media.addEventListener("change", update);
    return () => media.removeEventListener("change", update);
  }, []);

  useEffect(() => {
    if (!running) return;
    let last = window.performance.now();
    let frame = window.requestAnimationFrame(function tick(now) {
      const elapsed = Math.min(now - last, 100);
      last = now;
      setPosition(current => {
        if (current.step === LAST) return current;
        const next = current.progress + elapsed / STEPS[current.step].ms;
        return next >= 1 ? { step: current.step + 1, progress: 0 } : { step: current.step, progress: next };
      });
      frame = window.requestAnimationFrame(tick);
    });
    return () => window.cancelAnimationFrame(frame);
  }, [running]);

  // Play once when the browser pane scrolls into view.
  useEffect(() => {
    const element = viewRef.current;
    if (!element || started || reducedMotion || !("IntersectionObserver" in window)) return;
    const observer = new IntersectionObserver(entries => {
      if (!entries.some(entry => entry.isIntersecting)) return;
      observer.disconnect();
      setStarted(true);
      setPlaying(true);
    }, { threshold: 0.35 });
    observer.observe(element);
    return () => observer.disconnect();
  }, [started, reducedMotion]);

  const fill = at(2);
  const reading = at(4);
  const opening = started && step === 0 && progress < 0.55;
  const signedIn = at(3) >= 0.72;
  const typedEmail = Math.round(span(fill, 0.1, 0.5) * EMAIL.length);
  const typedPassword = Math.round(span(fill, 0.62, 0.94) * PASSWORD_LENGTH);
  const emailFocus = step === 2 && progress >= 0.08 && progress < 0.54;
  const passwordFocus = step === 2 && progress >= 0.6 && progress < 1;
  const pressed = step === 3 && progress >= 0.26;
  const readingRow = Math.min(2, Math.floor(reading * 3));
  const loading = step === 0 ? span(progress, 0, 0.55) : step === 3 ? span(progress, 0.3, 0.72) : 0;
  const target: Target = reducedMotion ? null
    : step === 2 ? (progress < 0.56 ? "email" : "password")
    : step === 3 && !signedIn ? "submit"
    : step === 4 && reading < 1 ? (`row${readingRow}` as Target)
    : null;

  // The pointer is placed from the live layout, so it stays on its target at any width.
  useLayoutEffect(() => {
    const view = viewRef.current;
    const cursor = cursorRef.current;
    if (!view || !cursor) return;
    const place = () => {
      const element = target ? targets.current[target] : null;
      if (!element || !target) return;
      const frame = view.getBoundingClientRect();
      const box = element.getBoundingClientRect();
      const [x, y] = AIM[target];
      cursor.style.transform = `translate(${(box.left - frame.left + box.width * x).toFixed(1)}px, ${(box.top - frame.top + box.height * y).toFixed(1)}px)`;
    };
    place();
    window.addEventListener("resize", place);
    return () => window.removeEventListener("resize", place);
  }, [target]);

  function start() {
    setStarted(true);
    setPlaying(true);
  }
  function goTo(index: number) {
    setPosition({ step: index, progress: 0 });
    start();
  }
  function advance() {
    if (finished) return goTo(0);
    if (reducedMotion) {
      if (started) setPosition({ step: step + 1, progress: 0 });
      setStarted(true);
      return;
    }
    if (started && playing) setPlaying(false);
    else start();
  }

  const rowState = (index: number) => index < step || (index === step && (progress >= 1 || index === LAST)) ? "done" : index === step && started ? "active" : "pending";
  const summary = `${STEPS[step].title}. ${progress >= 1 ? STEPS[step].done(agent) : STEPS[step].active(agent)}`;
  const buttonText = finished ? "↻ Replay" : reducedMotion ? "Next step →" : running ? "Ⅱ Pause" : started ? "▶ Resume" : "▶ Play demo";
  const grantText = step === 1 && progress < 0.6 ? `Checking ${agent}’s access to this site…`
    : signedIn ? `✓ Signed in by ${agent} · recorded in Activity`
    : `✓ ${agent} may sign in here as ${EMAIL}`;
  const grantMeta = step === 1 && progress < 0.6 ? SITE : signedIn ? "grant used" : "single use · 60s";

  return (
    <div className={styles.demo}>
      <div className={styles.bar}>
        <p>An agent meets a sign-in page in its built-in browser.</p>
        <div className={styles.segment} role="group" aria-label="Agent shown in the demo">
          {AGENT_NAMES.map(name => <button key={name} type="button" aria-pressed={name === agent} onClick={() => setAgent(name)}>{name}</button>)}
        </div>
      </div>

      <div className={styles.window}>
        <div className={styles.agent}>
          <div className={styles.who}><i aria-hidden="true">✳</i><strong>{agent}</strong><span>Agent</span></div>
          <div className={styles.ask}><small>You asked</small><p>Summarize this week’s project updates in Northstar.</p></div>
          <ol className={styles.log}>
            {STEPS.map((item, index) => {
              const state = rowState(index);
              return <li key={item.title} data-state={state}><i aria-hidden="true">✓</i><strong>{item.title}</strong><span>{state === "done" ? item.done(agent) : item.active(agent)}</span></li>;
            })}
          </ol>
          <div className={styles.result} data-on={finished}><small>Brief</small><p>Onboarding shipped. Search is in review. Billing export moved to next week. No blockers.</p></div>
          <p className={styles.visuallyHidden} aria-live="polite">{started ? `Step ${step + 1} of ${STEPS.length}. ${STEPS[step].title}.` : ""}</p>
        </div>

        <div className={styles.browser} id="agent-demo-screen" role="img" aria-label={`Illustrative in-app browser showing ${signedIn ? "the Northstar workspace after sign-in" : "the Northstar sign-in page"}. ${typedPassword ? "A fictional password is shown as masked dots. " : ""}${summary}`}>
          <div className={styles.chrome} aria-hidden="true">
            <span className={styles.navigation}>‹›</span>
            <span className={styles.address}><i>⌑</i><span>{SITE}{signedIn || opening ? "/projects" : "/login"}</span></span>
            <span className={styles.kind}>In-app browser · same tab</span>
          </div>
          <div className={styles.load} aria-hidden="true"><i style={{ width: loading > 0 && loading < 1 ? `${Math.round(loading * 100)}%` : 0 }} /></div>
          <div className={styles.grant} data-on={step >= 1} aria-hidden="true"><b>through</b><span>{grantText}</span><em>{grantMeta}</em></div>

          <div className={styles.view} ref={viewRef} aria-hidden="true">
            <div className={styles.page} data-on={!signedIn && !opening}>
              <div className={styles.login}>
                <div className={styles.site}><i>N</i><div><strong>Sign in to Northstar</strong><span>Use your workspace account</span></div></div>
                <div className={styles.field} data-focus={emailFocus}>
                  <span>Email</span>
                  <div ref={element => { targets.current.email = element; }}><output>{EMAIL.slice(0, typedEmail)}</output><u /></div>
                </div>
                <div className={`${styles.field} ${styles.password}`} data-focus={passwordFocus}>
                  <span>Password</span>
                  <div ref={element => { targets.current.password = element; }}><output>{"•".repeat(typedPassword)}</output><u /><em data-on={fill >= 0.62}>through ✓</em></div>
                </div>
                <div className={styles.submit} data-press={pressed && progress < 0.4} ref={element => { targets.current.submit = element; }}>{pressed ? "Signing in…" : "Sign in"}</div>
                <p className={styles.loginState}>{step < 2 && !opening ? "Sign-in required to continue" : ""}</p>
              </div>
            </div>

            <div className={styles.page} data-on={signedIn}>
              <div className={styles.work}>
                <div className={styles.workTop}><div className={styles.site}><i>N</i><div><strong>Northstar</strong><span>{EMAIL}</span></div></div><span>✓ Signed in</span></div>
                <div className={styles.workHeading}><span>This week</span><span>3 updates</span></div>
                {UPDATES.map(([name, detail, tag], index) => (
                  <div key={name} className={styles.row} ref={element => { targets.current[`row${index}` as "row0"] = element; }}
                    data-read={step === 4 && progress < 1 && readingRow === index ? "now" : step > 4 || reading > (index + 1) / 3 - 0.001 ? "yes" : "no"}>
                    <div><strong>{name}</strong><span>{detail}</span></div><em>{tag}</em>
                  </div>
                ))}
              </div>
            </div>

            <svg className={styles.cursor} ref={cursorRef} data-on={target !== null} viewBox="0 0 18 18"><path d="M2 1.5 15 8.2 9.3 9.6 7 15.5Z" /></svg>
          </div>
        </div>
      </div>

      <div className={styles.transport}>
        <button type="button" className={styles.play} onClick={advance} aria-controls="agent-demo-screen">{buttonText}</button>
        <div className={styles.scrub} role="group" aria-label="Demo steps">
          {STEPS.map((item, index) => (
            <button key={item.title} type="button" onClick={() => goTo(index)} aria-current={index === step ? "step" : undefined}
              aria-label={`Step ${index + 1} of ${STEPS.length}: ${item.title}`}
              style={{ "--p": index === LAST ? (finished ? 1 : 0) : at(index).toFixed(3) } as CSSProperties}>
              <span>{index + 1} · {item.short}</span>
            </button>
          ))}
        </div>
      </div>
      <p className={styles.note}>Illustrative demo with a fictional account. No external sign-in takes place.</p>
    </div>
  );
}
