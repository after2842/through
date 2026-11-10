import EnvironmentNote from "@/components/environment-note";
import SiteHeader from "@/components/site-header";
import Link from "next/link";
import HomeRouter from "@/components/home-router";
import LandingHero from "@/components/landing-hero";
import styles from "@/components/landing.module.css";

const STEPS = [
  ["Connect an account", "Pick the site and the account to use there. Access is tied to that exact HTTPS domain."],
  ["Allow an agent", "Grant each agent on its own. Claude can have access to an account while Codex does not."],
  ["It signs in. You review.", "The agent continues in the same tab, and every sign-in appears in your activity log."],
] as const;

const CONTROLS = [
  ["Per-agent, per-site permission", "An agent can use only the accounts you allowed, on the exact origin you approved."],
  ["Single-use grants", "Each sign-in is bound to one agent, one account and one tab, and expires in seconds."],
  ["Passwords stay out of the model", "The agent carries a reference to the account. The secret is entered outside what the model can read."],
  ["Pause and revoke", "Pause a workspace or disconnect a single account. Outstanding grants stop with it."],
  ["Audit trail", "Actor, action, target, time and outcome for every change and sign-in. Export as CSV."],
  ["Roles enforced by the API", "Tenant and role checks run on the server. Members see only the accounts they are allowed."],
] as const;

export default function Home() {
  const action = (
    <span className={styles.header}>
      <span className={styles.anchors}>
        <a className="quiet-link" href="#how">How it works</a>
        <a className="quiet-link" href="#controls">Controls</a>
      </span>
      <Link className="quiet-link" href="/pricing/">Pricing</Link>
      <Link className="quiet-link" href="/login/">Sign in</Link>
      <Link className={`${styles.button} ${styles.primary} ${styles.small}`} href="/login/">Get started</Link>
    </span>
  );
  const publicHome = (
    <div className="page">
      <SiteHeader action={action} />
      <main id="main" className={styles.main}>
        <LandingHero />

        <section className={styles.section} id="how" aria-labelledby="how-title">
          <div className={styles.sectionHead}>
            <div>
              <p className={styles.label}>How it works</p>
              <h2 id="how-title">Three decisions, all of them yours.</h2>
            </div>
            <p>You choose the account, the site and the agent. through does the typing when the agent gets there.</p>
          </div>
          <ol className={styles.steps}>
            {STEPS.map(([title, detail], index) => <li key={title}><span aria-hidden="true">{index + 1}</span><h3>{title}</h3><p>{detail}</p></li>)}
          </ol>
        </section>

        <section className={styles.section} id="controls" aria-labelledby="controls-title">
          <div className={styles.sectionHead}>
            <div>
              <p className={styles.label}>Controls</p>
              <h2 id="controls-title">Built for the questions a security review asks.</h2>
            </div>
            <p>Authorize an agent, see what it can reach, and stop it reliably.</p>
          </div>
          <dl className={styles.controls}>
            {CONTROLS.map(([title, detail]) => <div key={title}><i aria-hidden="true">✓</i><dt>{title}</dt><dd>{detail}</dd></div>)}
          </dl>
          <p className={styles.status}><b>Preview</b><span>through is in preview. Live sign-in adapters for agent browsers are not connected yet, SSO and SCIM are planned, and we hold no compliance certifications today.</span></p>
        </section>

        <section className={styles.section} aria-labelledby="close-title">
          <div className={styles.close}>
            <h2 id="close-title">Give your agents a way through.</h2>
            <div className={styles.actions}>
              <Link className={`${styles.button} ${styles.primary}`} href="/login/">Set up a connection</Link>
              <Link className={`${styles.button} ${styles.secondary}`} href="/pricing/">See pricing</Link>
            </div>
          </div>
        </section>
      </main>
      <footer className="app-footer"><EnvironmentNote /></footer>
    </div>
  );
  return <HomeRouter publicHome={publicHome} />;
}
