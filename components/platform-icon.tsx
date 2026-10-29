"use client";

import { useState } from "react";
import { platformHost } from "@/lib/platforms";
import styles from "./platform-icon.module.css";

export default function PlatformIcon({ origin, name, size = 32, className = "" }: { origin: string; name: string; size?: number; className?: string }) {
  const host = platformHost(origin);
  const [failedHost, setFailedHost] = useState("");
  const initials = name.trim().split(/\s+/).slice(0, 2).map(word => [...word][0] ?? "").join("").toUpperCase();
  return <span className={`${styles.icon} ${className}`} style={{ width: size, height: size }} aria-hidden="true">
    {host && failedHost !== host ? <img src={`https://www.google.com/s2/favicons?domain=${encodeURIComponent(host)}&sz=64`} alt="" width={Math.round(size * .64)} height={Math.round(size * .64)} loading="lazy" referrerPolicy="no-referrer" onError={() => setFailedHost(host)} /> : <span>{initials || "↗"}</span>}
  </span>;
}
