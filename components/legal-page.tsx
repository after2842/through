import Link from "next/link";
import type { ReactNode } from "react";
import SiteHeader from "@/components/site-header";
import { LEGAL_UPDATED, SUPPORT_EMAIL, SUPPORT_URL } from "@/lib/site";
import styles from "./legal.module.css";

export function Contact() {
  const issues = <a href={SUPPORT_URL}>{SUPPORT_URL.replace("https://", "")}</a>;
  return SUPPORT_EMAIL ? <>email <a href={`mailto:${SUPPORT_EMAIL}`}>{SUPPORT_EMAIL}</a> or open an issue at {issues}</> : <>open an issue at {issues}</>;
}

export default function LegalPage({ title, lead, children }: { title: string; lead: string; children: ReactNode }) {
  return (
    <div className="page">
      <SiteHeader action={<><Link className="quiet-link" href="/">Home</Link><Link className="quiet-link" href="/login/">Sign in</Link></>} />
      <main id="main" className={styles.main}>
        <h1>{title}</h1>
        <p className={styles.updated}>Last updated {LEGAL_UPDATED}</p>
        <p className={styles.lead}>{lead}</p>
        {children}
      </main>
      <footer className={styles.footer}><Link href="/privacy/">Privacy</Link><Link href="/terms/">Terms</Link></footer>
    </div>
  );
}
