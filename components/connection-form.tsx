"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import Link from "next/link";
import WorkspaceShell from "./workspace-shell";
import SelectField from "./select-field";
import PlatformIcon from "./platform-icon";
import { canManage, createConnection } from "@/lib/client";
import { useWorkspace } from "@/lib/use-workspace";
import { AGENT_NAMES, PLATFORMS, findPlatform, normalizePlatformOrigin, platformHost } from "@/lib/platforms";
import type { AgentName } from "@/lib/demo-session";
import styles from "./connection-ui.module.css";

const stepNames = ["Platform", "Credentials", "Access", "Review"];
const agentDescriptions: Record<AgentName, string> = { Claude: "Claude Code & Desktop", Codex: "OpenAI Codex", Cursor: "Cursor agent" };
const agentMarks: Record<AgentName, string> = { Claude: "✳", Codex: "⌘", Cursor: "↖" };
const otherPlatform = "Other website";

export default function ConnectionForm() {
  const { session, setSession, loading, loadError, refresh, alive, message } = useWorkspace();
  const [step, setStep] = useState(0);
  const [platform, setPlatform] = useState("");
  const [customName, setCustomName] = useState("");
  const [domain, setDomain] = useState("");
  const [origin, setOrigin] = useState("");
  const [username, setUsername] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [credentialEntered, setCredentialEntered] = useState(false);
  const [agents, setAgents] = useState<AgentName[]>([]);
  const [consent, setConsent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [createdId, setCreatedId] = useState("");
  const [error, setError] = useState("");
  const pending = useRef(false);
  const password = useRef<HTMLInputElement>(null);
  const stageHeading = useRef<HTMLHeadingElement>(null);
  const platformTrigger = useRef<HTMLButtonElement>(null);
  const name = platform === otherPlatform ? customName.trim() : platform;

  useEffect(() => { if (!loading && !busy) stageHeading.current?.focus(); }, [step, loading, busy, createdId]);

  function back() { if (pending.current) return; setError(""); setConsent(false); setStep(value => Math.max(0, value - 1)); }
  function selectAgent(agent: AgentName) { setAgents(current => current.includes(agent) ? current.filter(item => item !== agent) : [...current, agent]); setError(""); setConsent(false); }
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending.current || !session || !canManage(session)) return;
    setError("");
    if (step === 0) {
      if (!platform) { setError("Choose a platform to continue."); platformTrigger.current?.focus(); return; }
      try {
        const nextOrigin = normalizePlatformOrigin(platform === otherPlatform ? domain : findPlatform(platform)?.origin ?? "");
        if (!name || [...name].length > 80 || /[\u0000-\u001f\u007f-\u009f]/.test(name)) throw new Error("Enter a platform name of 80 characters or fewer.");
        const known = findPlatform(name);
        if (known && known.origin !== nextOrigin) throw new Error(`Use ${platformHost(known.origin)} for ${known.name}, or choose a different platform name.`);
        setOrigin(nextOrigin); setStep(1);
      } catch (failure) { setError(failure instanceof Error ? failure.message : "Enter a valid website domain."); }
      return;
    }
    if (step === 1) {
      if (!username.trim() || username.trim().length > 254 || /[\u0000-\u001f\u007f-\u009f]/.test(username)) { setError("Enter an email or username of 254 characters or fewer."); return; }
      if (!password.current?.value) { setError("Enter a made-up password to preview this step."); password.current?.focus(); return; }
      // The password is deliberately discarded here. Only connection metadata reaches the client API.
      password.current.value = "";
      setCredentialEntered(true); setShowPassword(false); setStep(2); return;
    }
    if (step === 2) {
      if (!agents.length) { setError("Choose at least one agent. You can remove access later."); return; }
      setStep(3); return;
    }
    if (!credentialEntered || !consent) { setError("Confirm the connection and its permitted agents."); return; }
    pending.current = true; setBusy(true);
    try {
      const [next] = await Promise.all([
        createConnection({ service: name, origin, username: username.trim(), agents }),
        new Promise(resolve => window.setTimeout(resolve, 900)),
      ]);
      if (!alive.current) return;
      const account = next.accounts.find(item => item.origin === origin && item.username === username.trim());
      if (!account) throw new Error("The connection was saved but could not be displayed. Open Connections to check it.");
      setSession(next); setCreatedId(account.id); setCredentialEntered(false);
    } catch (failure) { if (alive.current) setError(message(failure)); }
    finally { pending.current = false; if (alive.current) setBusy(false); }
  }

  function renderPlatform(option: string) {
    const item = findPlatform(option);
    return <span className={styles.platformOption}>{item ? <PlatformIcon origin={item.origin} name={item.name} size={22} /> : <span aria-hidden="true" className={styles.agentMark}>↗</span>}<span>{option}{item && <small>{platformHost(item.origin)}</small>}</span></span>;
  }

  return <WorkspaceShell active="connections" email={session?.email} canViewActivity={session ? canManage(session) : false}>
    <main id="main" className={styles.main}>
      <Link href="/accounts/" className={styles.back}><span aria-hidden="true">←</span> Connections</Link>
      {loading || loadError || !session ? <div className={styles.loading} role={loadError ? "alert" : "status"}><p>{loadError || "Opening your workspace…"}</p>{loadError && <button className={styles.textButton} onClick={() => void refresh()}>Try again</button>}</div> : !canManage(session) ? <div className={styles.loading}>Your workspace admin can add connections.</div> : <div className={styles.stepLayout}>
        <aside className={styles.stepIntro}>
          <p className={styles.eyebrow}>NEW CONNECTION</p>
          <h1>Connect an<br />account.</h1>
          <p className={styles.description}>One website. Only the agents you choose.</p>
          <ol className={styles.steps} aria-label="Connection steps">{stepNames.map((label, index) => <li key={label} aria-current={!createdId && step === index ? "step" : undefined} className={index < step || createdId ? styles.stepDone : ""}><span className={styles.stepNumber} aria-hidden="true">{index < step || createdId ? "✓" : index + 1}</span>{label}</li>)}</ol>
        </aside>
        <div className={styles.formStage}>
          {busy ? <div className={styles.submitStage} role="status" aria-live="polite">
            <div className={styles.transfer} aria-hidden="true"><span className={styles.transferIcon}>•••</span><span className={styles.transferArrow}>↑</span><span className={styles.transferIcon}><PlatformIcon origin={origin} name={name} size={32} /></span></div>
            <h2>Adding your connection.</h2><p className={styles.description}>Saving the website and agent permissions.</p><p className={styles.note}>Demo password discarded. No password is uploaded.</p>
          </div> : createdId ? <div className={styles.submitStage}>
            <div className={styles.checkmark} aria-hidden="true"><svg width="34" height="34" viewBox="0 0 34 34" fill="none"><path d="m7 17 7 7L27 10" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" /></svg></div>
            <h2 ref={stageHeading} tabIndex={-1}>Connection added.</h2><p className={styles.description}>{agents.join(", ")} {agents.length === 1 ? "has" : "have"} demo access to {name}.</p>
            <p className={styles.note}>{platformHost(origin)} · {username.trim()}</p>
            <div className={styles.actions}><Link className={styles.primary} href={`/accounts/connection/?id=${encodeURIComponent(createdId)}`}>View connection <span aria-hidden="true">↗</span></Link></div>
            {session.accessPaused && <p className={styles.notice}>Workspace access is paused. Resume it from Connections when you’re ready.</p>}
          </div> : <form onSubmit={submit} noValidate aria-describedby={error ? "wizard-error" : undefined}>
            {step === 0 && <>
              <h2 ref={stageHeading} tabIndex={-1}>Where should your agent sign in?</h2>
              <p className={styles.description}>Choose a platform or add its exact website.</p>
              <SelectField ref={platformTrigger} id="connection-platform" label="Platform" value={platform} options={[...PLATFORMS.map(item => item.name), otherPlatform]} placeholder="Choose a platform" onChange={value => { setPlatform(value); setError(""); setConsent(false); }} renderOption={renderPlatform} required invalid={!!error} />
              {platform === otherPlatform && <div style={{ marginTop: 24 }}>
                <div className={styles.field}><label htmlFor="platform-name">Platform name</label><input id="platform-name" value={customName} maxLength={80} placeholder="Acme" autoComplete="off" onChange={event => { setCustomName(event.target.value); setError(""); }} /></div>
                <div className={styles.field}><label htmlFor="platform-domain">Website domain</label><input id="platform-domain" value={domain} inputMode="url" autoCapitalize="none" autoCorrect="off" spellCheck={false} autoComplete="off" placeholder="app.acme.com" onChange={event => { setDomain(event.target.value); setError(""); }} /><p className={styles.hint}>Exact domain only. Access won’t extend to other subdomains.</p></div>
              </div>}
              <p className={styles.note}>Platform icons load from Google’s favicon service. A listing is not a verified integration.</p>
            </>}
            {step === 1 && <>
              <h2 ref={stageHeading} tabIndex={-1}>Add your sign-in details.</h2>
              <div className={styles.domainPreview}><PlatformIcon origin={origin} name={name} size={30} /><div><strong>{name}</strong><p>{platformHost(origin)}</p></div></div>
              <p className={styles.notice}><strong>Use a made-up password.</strong> This preview discards it; a password vault is not connected.</p>
              <div className={styles.field}><label htmlFor="connection-username">Email or username</label><input id="connection-username" name="demo-username" value={username} maxLength={254} placeholder="alex@example.com" autoCapitalize="none" autoCorrect="off" autoComplete="off" spellCheck={false} onChange={event => { setUsername(event.target.value); setError(""); }} /></div>
              <div className={styles.field}><label htmlFor="connection-password">Demo password</label><div className={styles.password}><input ref={password} id="connection-password" name="demo-password" type={showPassword ? "text" : "password"} autoComplete="off" data-1p-ignore="true" data-lpignore="true" maxLength={256} placeholder="Use a made-up password" onChange={() => setError("")} /><button type="button" aria-label={showPassword ? "Hide demo password" : "Show demo password"} aria-pressed={showPassword} onClick={() => setShowPassword(value => !value)}>{showPassword ? "Hide" : "Show"}</button></div></div>
            </>}
            {step === 2 && <>
              <h2 ref={stageHeading} tabIndex={-1}>Who gets access?</h2>
              <p className={styles.description}>Only selected agents can use this connection. Remove their access whenever you need.</p>
              <div className={styles.agentChoices}>{AGENT_NAMES.map(agent => <label key={agent} className={styles.agentChoice}><span className={styles.agentMark} aria-hidden="true">{agentMarks[agent]}</span><span>{agent}<small>{agentDescriptions[agent]}</small></span><input type="checkbox" checked={agents.includes(agent)} onChange={() => selectAgent(agent)} aria-label={`Allow ${agent}`} /></label>)}</div>
              <p className={styles.note}>Preview permissions only. Selecting an agent does not install or connect it.</p>
            </>}
            {step === 3 && <>
              <h2 ref={stageHeading} tabIndex={-1}>Your account. Your call.</h2>
              <p className={styles.description}>Check the website and access before adding the connection.</p>
              <dl className={styles.review}>
                <div><dt>Platform</dt><dd><span className={styles.platformOption}><PlatformIcon origin={origin} name={name} size={23} />{name}</span></dd></div>
                <div><dt>Allowed website</dt><dd>{origin}<small>This exact origin only</small></dd></div>
                <div><dt>Account</dt><dd>{username.trim()}</dd></div>
                <div><dt>Password</dt><dd>Demo entry completed<small>Password discarded; vault not connected</small></dd></div>
                <div><dt>Allowed agents</dt><dd>{agents.join(", ")}</dd></div>
              </dl>
              <label className={styles.consent}><input type="checkbox" checked={consent} onChange={event => { setConsent(event.target.checked); setError(""); }} /><span>Allow these agents to use this demo connection.</span></label>
            </>}
            {error && <p id="wizard-error" className={styles.error} role="alert">{error}</p>}
            <div className={styles.actions}><button className={styles.primary} type="submit" disabled={step === 3 && !consent}>{step === 3 ? "Confirm connection" : "Continue"}<span aria-hidden="true">→</span></button>{step > 0 ? <button type="button" className={styles.textButton} onClick={back}>Back</button> : <Link href="/accounts/" className={styles.textButton}>Cancel</Link>}</div>
          </form>}
        </div>
      </div>}
    </main>
  </WorkspaceShell>;
}
