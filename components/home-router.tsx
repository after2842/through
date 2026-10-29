"use client";

import { useCallback, useEffect, useState, type ReactNode } from "react";
import SiteHeader from "@/components/site-header";
import MemberHome from "@/components/member-home";
import { readDemoSession, type DemoSession } from "@/lib/demo-session";
import styles from "./member-home.module.css";

export default function HomeRouter({ publicHome }: { publicHome: ReactNode }) {
  const [session, setSession] = useState<DemoSession | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState(false);

  const refreshSession = useCallback(() => {
    try {
      setSession(readDemoSession());
      setError(false);
    } catch {
      setError(true);
    }
    setLoaded(true);
  }, []);

  useEffect(() => {
    refreshSession();
    window.addEventListener("through:session-change", refreshSession);
    window.addEventListener("pageshow", refreshSession);
    return () => {
      window.removeEventListener("through:session-change", refreshSession);
      window.removeEventListener("pageshow", refreshSession);
    };
  }, [refreshSession]);

  useEffect(() => {
    if (loaded && !error && window.location.pathname === "/") {
      document.title = session ? "Your workspace — through" : "through — Past the login. Back to work.";
    }
  }, [loaded, error, session]);

  if (!loaded || error) {
    return (
      <div className="page app-page">
        <SiteHeader />
        <main id="main" className={`app-main ${styles.main}`}>
          <div className={styles.loading} role={error ? "alert" : "status"}>
            <p>{error ? "Your workspace couldn’t be opened. Try again." : "Opening through…"}</p>
            {error && <button type="button" className={styles.textButton} onClick={refreshSession}>Try again <span aria-hidden="true">↗</span></button>}
          </div>
        </main>
      </div>
    );
  }

  return session ? <MemberHome session={session} /> : publicHome;
}
