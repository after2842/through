"use client";

import { useEffect, useRef, useState } from "react";
import styles from "./theme-toggle.module.css";

type Theme = "light" | "dark";
const preferenceKey = "through.theme";

export function ThemeToggle() {
  const [theme, setTheme] = useState<Theme | null>(null);
  const preference = useRef<Theme | null>(null);

  useEffect(() => {
    const system = window.matchMedia("(prefers-color-scheme: dark)");

    try {
      const saved = window.localStorage.getItem(preferenceKey);
      if (saved === "light" || saved === "dark") preference.current = saved;
    } catch {
      // A theme choice still works when browser storage is unavailable.
    }

    const applySystem = () => {
      const next = preference.current ?? (system.matches ? "dark" : "light");
      document.documentElement.dataset.theme = next;
      setTheme(next);
    };

    const initial = document.documentElement.dataset.theme;
    if (initial === "light" || initial === "dark") {
      setTheme(initial);
    } else {
      applySystem();
    }
    system.addEventListener("change", applySystem);
    return () => system.removeEventListener("change", applySystem);
  }, []);

  function toggleTheme() {
    const next: Theme = theme === "dark" ? "light" : "dark";
    preference.current = next;
    document.documentElement.dataset.theme = next;
    setTheme(next);
    try {
      window.localStorage.setItem(preferenceKey, next);
    } catch {
      // Keep the selected theme for this page when persistence is blocked.
    }
  }

  const label = theme ? `Switch to ${theme === "dark" ? "light" : "dark"} mode` : "Change color theme";

  return (
    <button
      type="button"
      className={styles.toggle}
      onClick={toggleTheme}
      aria-label={label}
      title={label}
    >
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        {theme === "dark" ? (
          <>
            <circle cx="12" cy="12" r="4" />
            <path d="M12 2v2m0 16v2M2 12h2m16 0h2M4.93 4.93l1.42 1.42m11.3 11.3 1.42 1.42M4.93 19.07l1.42-1.42m11.3-11.3 1.42-1.42" />
          </>
        ) : theme === "light" ? (
          <path d="M20.4 13.2A8.5 8.5 0 0 1 10.8 3.6a8.5 8.5 0 1 0 9.6 9.6Z" />
        ) : (
          <>
            <circle cx="12" cy="12" r="8" />
            <path d="M12 4v16" />
          </>
        )}
      </svg>
    </button>
  );
}

export default ThemeToggle;
