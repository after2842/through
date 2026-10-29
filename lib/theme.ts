"use client";

import { useEffect, useState } from "react";

export type ThemePreference = "System" | "Light" | "Dark";
type Theme = "light" | "dark";
const key = "through.theme";
const changed = "through:theme-change";
let memoryPreference: ThemePreference | null = null;

function readPreference(): ThemePreference {
  if (memoryPreference) return memoryPreference;
  try {
    const saved = window.localStorage.getItem(key);
    return saved === "dark" ? "Dark" : saved === "light" ? "Light" : "System";
  } catch { return "System"; }
}
function resolved(preference: ThemePreference): Theme {
  return preference === "Dark" || (preference === "System" && window.matchMedia("(prefers-color-scheme: dark)").matches) ? "dark" : "light";
}
export function useThemePreference() {
  const [preference, setPreferenceState] = useState<ThemePreference>("System");
  const [theme, setTheme] = useState<Theme | null>(null);
  useEffect(() => {
    const media = window.matchMedia("(prefers-color-scheme: dark)");
    const sync = () => {
      const next = readPreference();
      const appearance = resolved(next);
      document.documentElement.dataset.theme = appearance;
      setPreferenceState(next);
      setTheme(appearance);
    };
    const storage = (event: StorageEvent) => { if (event.key === key || event.key === null) { memoryPreference = null; sync(); } };
    sync();
    window.addEventListener(changed, sync);
    window.addEventListener("storage", storage);
    media.addEventListener("change", sync);
    return () => { window.removeEventListener(changed, sync); window.removeEventListener("storage", storage); media.removeEventListener("change", sync); };
  }, []);
  function setPreference(next: ThemePreference) {
    memoryPreference = next;
    try {
      if (next === "System") window.localStorage.removeItem(key);
      else window.localStorage.setItem(key, next.toLowerCase());
    } catch { /* The current page still reflects the choice without storage. */ }
    document.documentElement.dataset.theme = resolved(next);
    window.dispatchEvent(new Event(changed));
  }
  return { preference, theme, setPreference };
}
