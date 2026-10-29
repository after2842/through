"use client";

import { useThemePreference } from "@/lib/theme";
import styles from "./theme-toggle.module.css";

export function ThemeToggle() {
  const { theme, setPreference } = useThemePreference();
  function toggleTheme() { setPreference(theme === "dark" ? "Light" : "Dark"); }

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
