"use client";

import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { APIError, errorMessage, getSession, requestSignIn, safeReturnPath, verifySignIn, type SignInChallenge } from "@/lib/client";
import styles from "./login-form.module.css";

export default function LoginForm() {
  const router = useRouter();
  const [challenge, setChallenge] = useState<SignInChallenge | null>(null);
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [checking, setChecking] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [error, setError] = useState("");
  const [restartRequired, setRestartRequired] = useState(false);
  const emailRef = useRef<HTMLInputElement>(null);
  const codeRef = useRef<HTMLInputElement>(null);
  const mounted = useRef(false);
  const busyRef = useRef(false);
  const loadSequence = useRef(0);
  const changedStep = useRef(false);
  const [returnPath, setReturnPath] = useState<string | null>(null);
  const returnRef = useRef<string | null>(null);

  // After sign-in, an app connection continues to its consent step.
  const finish = useCallback(() => {
    if (returnRef.current) window.location.assign(returnRef.current);
    else router.replace("/");
  }, [router]);

  const checkSession = useCallback(async () => {
    const sequence = ++loadSequence.current;
    setChecking(true);
    setLoadError("");
    try {
      const session = await getSession();
      if (!mounted.current || sequence !== loadSequence.current) return;
      if (session) { finish(); return; }
      setChecking(false);
    } catch (failure) {
      if (!mounted.current || sequence !== loadSequence.current) return;
      setLoadError(errorMessage(failure));
      setChecking(false);
    }
  }, [finish]);

  useEffect(() => {
    mounted.current = true;
    returnRef.current = safeReturnPath(new URLSearchParams(window.location.search).get("next"));
    setReturnPath(returnRef.current);
    void checkSession();
    return () => { mounted.current = false; loadSequence.current += 1; };
  }, [checkSession]);

  useEffect(() => {
    if (challenge) {
      codeRef.current?.focus();
      changedStep.current = true;
    } else if (changedStep.current) {
      emailRef.current?.focus();
    }
  }, [challenge]);

  async function continueToCode(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busyRef.current) return;
    busyRef.current = true;
    setBusy(true);
    setError("");
    setRestartRequired(false);
    try {
      const next = await requestSignIn(email);
      if (!mounted.current) return;
      setEmail(next.email);
      setChallenge(next);
    } catch (failure) {
      if (!mounted.current) return;
      setError(errorMessage(failure));
      emailRef.current?.focus();
    } finally {
      busyRef.current = false;
      if (mounted.current) setBusy(false);
    }
  }

  async function verifyCode(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busyRef.current || !challenge || restartRequired) return;
    busyRef.current = true;
    setError("");
    setBusy(true);
    try {
      await verifySignIn(challenge, code);
      if (mounted.current) finish();
    } catch (failure) {
      if (!mounted.current) return;
      setError(errorMessage(failure));
      setRestartRequired(failure instanceof APIError && ["challenge_expired", "challenge_exhausted"].includes(failure.code));
      codeRef.current?.focus();
      codeRef.current?.select();
    } finally {
      busyRef.current = false;
      if (mounted.current) setBusy(false);
    }
  }

  function changeEmail() {
    if (busyRef.current) return;
    setError("");
    setCode("");
    setRestartRequired(false);
    setChallenge(null);
  }

  if (checking || loadError) {
    return (
      <div className={styles.formBlock}>
        <h1 className={styles.title}>Welcome through.</h1>
        <p className={loadError ? styles.error : styles.intro} role={loadError ? "alert" : "status"}>{loadError || "Opening sign-in…"}</p>
        {loadError && <button type="button" className={styles.submit} onClick={() => void checkSession()}>Try again <Arrow /></button>}
      </div>
    );
  }

  return (
    <div className={styles.formBlock}>
      <h1 className={styles.title}>{challenge ? "One quick check." : "Welcome through."}</h1>
      {challenge && <p className={styles.intro}>Enter the demo code to continue.</p>}
      {!challenge && returnPath && <p className={styles.intro}>Sign in to connect an app to through.</p>}
      {!challenge ? (
        <form className={styles.form} onSubmit={continueToCode} aria-busy={busy}>
          <label className={styles.label} htmlFor="email">Email</label>
          <input
            className={styles.input} ref={emailRef} id="email" name="email" type="email" autoComplete="email"
            maxLength={254} autoCapitalize="none" spellCheck={false} placeholder="you@company.com" value={email}
            onChange={(event) => { setEmail(event.target.value); if (error) setError(""); }} readOnly={busy} required
            aria-invalid={Boolean(error)} aria-describedby={`email-hint${error ? " email-error" : ""}`}
          />
          <p className={styles.hint} id="email-hint">Use a dummy email to explore. No email is sent.</p>
          {error && <p className={styles.error} id="email-error" role="alert">{error}</p>}
          <button className={styles.submit} type="submit" disabled={busy}>
            <span aria-live="polite">{busy ? "Continuing…" : "Continue"}</span><Arrow />
          </button>
        </form>
      ) : (
        <form className={styles.form} onSubmit={verifyCode} aria-busy={busy}>
          <div className={styles.identity}>
            <span title={challenge.email}>{challenge.email}</span>
            <button type="button" onClick={changeEmail} disabled={busy}>{restartRequired ? "Start again" : "Change email"}</button>
          </div>
          <label className={styles.label} htmlFor="authentication-code">Demo code</label>
          <input
            className={`${styles.input} ${styles.codeInput}`} ref={codeRef} id="authentication-code" name="authentication-code"
            type="text" inputMode="numeric" autoComplete="one-time-code" maxLength={4} placeholder="0000" value={code}
            onChange={(event) => { setCode(event.target.value.replace(/\D/g, "").slice(0, 4)); if (error && !restartRequired) setError(""); }}
            readOnly={busy || restartRequired} required aria-invalid={Boolean(error)} aria-describedby={`code-hint${error ? " code-error" : ""}`}
          />
          <p className={styles.hint} id="code-hint">Use <strong>0000</strong>. An authenticator is not connected yet.</p>
          {error && <p className={styles.error} id="code-error" role="alert">{error}</p>}
          <button className={styles.submit} type="submit" disabled={busy || restartRequired}>
            <span aria-live="polite">{busy ? "Checking…" : "Sign in"}</span><Arrow />
          </button>
        </form>
      )}
    </div>
  );
}

function Arrow() {
  return <svg width="17" height="17" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M5 12h14m-6-6 6 6-6 6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" /></svg>;
}
