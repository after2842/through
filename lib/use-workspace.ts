"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { APIError, errorMessage, getSession, type WorkspaceSession } from "./client";

export function useWorkspace() {
  const router = useRouter();
  const [session, setSession] = useState<WorkspaceSession | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const alive = useRef(false);
  const sequence = useRef(0);
  const refresh = useCallback(async () => {
    const current = ++sequence.current;
    setLoading(true); setLoadError("");
    try {
      const next = await getSession();
      if (!alive.current || current !== sequence.current) return;
      if (!next) { router.replace("/login/"); return; }
      setSession(next);
    } catch (error) {
      if (alive.current && current === sequence.current) setLoadError(errorMessage(error));
    } finally { if (alive.current && current === sequence.current) setLoading(false); }
  }, [router]);
  useEffect(() => {
    alive.current = true;
    void refresh();
    return () => { alive.current = false; sequence.current += 1; };
  }, [refresh]);
  function message(error: unknown) {
    if (error instanceof APIError && error.status === 401) router.replace("/login/");
    return errorMessage(error);
  }
  return { session, setSession, loading, loadError, refresh, alive, message, router };
}
