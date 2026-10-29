import Link from "next/link";
import type { ReactNode } from "react";
import ThemeToggle from "@/components/theme-toggle";

export default function SiteHeader({ action }: { action?: ReactNode }) {
  return <>
    <a className="skip-link" href="#main">Skip to content</a>
    <header className="masthead">
      <Link href="/" className="wordmark" aria-label="through home">through<span aria-hidden="true">.</span></Link>
      <div className="header-tools">
        {action && <nav className="header-action" aria-label="Account">{action}</nav>}
        <ThemeToggle />
      </div>
    </header>
  </>;
}
