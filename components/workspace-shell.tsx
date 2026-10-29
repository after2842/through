"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import SiteHeader from "./site-header";
import EnvironmentNote from "./environment-note";
import styles from "./workspace-shell.module.css";

export default function WorkspaceShell({ active, email, children, canViewActivity = true }: {
  active: "overview" | "connections" | "activity" | "settings";
  email?: string;
  children: ReactNode;
  canViewActivity?: boolean;
}) {
  const links = [
    { id: "overview", href: "/", label: "Overview" },
    { id: "connections", href: "/accounts/", label: "Connections" },
    ...(canViewActivity ? [{ id: "activity", href: "/activity/", label: "Activity" }] : []),
    { id: "settings", href: "/settings/", label: "Settings" },
  ];
  return <div className={`page app-page ${styles.page}`}>
    <SiteHeader action={<Link href="/pricing/" className={styles.plan}>Free preview <span>$0</span></Link>} />
    <div className={styles.navigation}>
      <nav aria-label="Workspace" className={styles.links}>{links.map(link => <Link key={link.id} href={link.href} aria-current={active === link.id ? "page" : undefined}>{link.label}</Link>)}</nav>
      {email && <span className={styles.email}>{email}</span>}
    </div>
    {children}
    <footer className="app-footer"><EnvironmentNote /></footer>
  </div>;
}
