"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { readDemoSession, startDemoSession } from "@/lib/demo-session";
import styles from "./login-form.module.css";

export default function LoginForm() {
  const router = useRouter();
  const [step, setStep] = useState<"email" | "code">("email");
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const emailRef = useRef<HTMLInputElement>(null);
  const codeRef = useRef<HTMLInputElement>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const changedStep = useRef(false);

  useEffect(() => {
    if (readDemoSession()) router.replace("/");
    return () => {
      if (timerRef.current !== null) clearTimeout(timerRef.current);
    };
  }, [router]);

  useEffect(() => {
    if (step === "code") {
      codeRef.current?.focus();
      changedStep.current = true;
    } else if (changedStep.current) {
      emailRef.current?.focus();
    }
  }, [step]);

  function continueToCode(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setEmail(email.trim());
    setError("");
    setStep("code");
  }

  function verifyCode(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    setError("");
    setBusy(true);

    timerRef.current = setTimeout(() => {
      timerRef.current = null;
      if (code !== "0000") {
        setBusy(false);
        setError("Use 0000 to try this demo.");
        codeRef.current?.focus();
        codeRef.current?.select();
        return;
      }

      try {
        startDemoSession(email);
        router.replace("/");
      } catch {
        setBusy(false);
        setError("Allow session storage in your browser, then try again.");
        codeRef.current?.focus();
      }
    }, 600);
  }

  function changeEmail() {
    setError("");
    setCode("");
    setStep("email");
  }

  return (
    <div className={styles.formBlock}>
      <h1 className={styles.title}>{step === "email" ? "Welcome through." : "One quick check."}</h1>
      {step === "code" && (
        <p className={styles.intro}>Enter the code from your authenticator app.</p>
      )}

      {step === "email" ? (
        <form className={styles.form} onSubmit={continueToCode}>
          <label className={styles.label} htmlFor="email">Email</label>
          <input
            className={styles.input}
            ref={emailRef}
            id="email"
            name="email"
            type="email"
            autoComplete="email"
            maxLength={254}
            autoCapitalize="none"
            spellCheck={false}
            placeholder="you@company.com"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            required
            aria-describedby="email-hint"
          />
          <p className={styles.hint} id="email-hint">Use any email to explore. No email is sent.</p>
          <button className={styles.submit} type="submit">
            Continue <Arrow />
          </button>
        </form>
      ) : (
        <form className={styles.form} onSubmit={verifyCode} aria-busy={busy}>
          <div className={styles.identity}>
            <span title={email}>{email}</span>
            <button type="button" onClick={changeEmail} disabled={busy}>Change email</button>
          </div>
          <label className={styles.label} htmlFor="authentication-code">Authentication code</label>
          <input
            className={`${styles.input} ${styles.codeInput}`}
            ref={codeRef}
            id="authentication-code"
            name="authentication-code"
            type="text"
            inputMode="numeric"
            autoComplete="one-time-code"
            maxLength={4}
            placeholder="0000"
            value={code}
            onChange={(event) => {
              setCode(event.target.value.replace(/\D/g, "").slice(0, 4));
              if (error) setError("");
            }}
            readOnly={busy}
            required
            aria-invalid={Boolean(error)}
            aria-describedby={`code-hint${error ? " code-error" : ""}`}
          />
          <p className={styles.hint} id="code-hint">Demo code: <strong>0000</strong>. No app setup needed.</p>
          {error && <p className={styles.error} id="code-error" role="alert">{error}</p>}
          <button className={styles.submit} type="submit" disabled={busy}>
            <span aria-live="polite">{busy ? "Checking…" : "Sign in"}</span>
            <Arrow />
          </button>
        </form>
      )}
    </div>
  );
}

function Arrow() {
  return (
    <svg width="17" height="17" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M5 12h14m-6-6 6 6-6 6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
