"use client";

import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import SiteHeader from "@/components/site-header";
import MemberHome from "@/components/member-home";
import { DEMO_SESSION_EVENT, errorMessage, getSession, type WorkspaceSession } from "@/lib/client";
import styles from "./member-home.module.css";

export default function HomeRouter({ publicHome }: { publicHome: ReactNode }) {
  const [session, setSession] = useState<WorkspaceSession | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState("");
  const mounted = useRef(false);
  const sequence = useRef(0);

  const refreshSession = useCallback(async () => {
    const request = ++sequence.current;
    setError("");
    try {
      const next = await getSession();
      if (!mounted.current || sequence.current !== request) return;
      setSession(next);
      setLoaded(true);
    } catch (failure) {
      if (!mounted.current || sequence.current !== request) return;
      setError(errorMessage(failure));
      setLoaded(true);
    }
  }, []);

  useEffect(() => {
    mounted.current = true;
    void refreshSession();
    const refresh = () => { void refreshSession(); };
    window.addEventListener(DEMO_SESSION_EVENT, refresh);
    window.addEventListener("pageshow", refresh);
    return () => {
      mounted.current = false;
      sequence.current += 1;
      window.removeEventListener(DEMO_SESSION_EVENT, refresh);
      window.removeEventListener("pageshow", refresh);
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
            <p>{error || "Opening through…"}</p>
            {error && <button type="button" className={styles.textButton} onClick={() => { setLoaded(false); void refreshSession(); }}>Try again <span aria-hidden="true">↗</span></button>}
          </div>
        </main>
      </div>
    );
  }

  return session ? <MemberHome session={session} /> : publicHome;
}
