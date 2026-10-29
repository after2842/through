import Link from "next/link";
import styles from "./use-case.module.css";

export default function UseCase() {
  return (
    <section id="use-case" className={styles.section} aria-labelledby="use-case-title">
      <div className={styles.introduction}>
        <p className={styles.eyebrow}>YOUR ACCOUNT. YOUR PERMISSION.</p>
        <h2 id="use-case-title">Let your agent enter your password and sign in.</h2>
        <p className={styles.description}>Choose the account. Allow the agents you trust. Review activity, and remove access when the work is done.</p>
        <Link className={styles.action} href="/login/">Set up your first connection <span aria-hidden="true">↗</span></Link>
      </div>
      <figure className={styles.figure}>
        <div className={styles.accountPreview} role="img" aria-label="Illustrative connection details for Northstar at northstar.example. Cursor has permission, Claude Code does not. The latest demo sign-in was completed by Cursor.">
          <div aria-hidden="true">
            <div className={styles.chrome}><span className={styles.wordmark}>through</span><span>Connections / Northstar</span></div>
            <div className={styles.account}>
              <div className={styles.identity}><span className={styles.accountIcon}>N</span><div><h3>Northstar</h3><p>northstar.example</p></div><span className={styles.status}>Active</span></div>
              <div className={styles.credential}><span>Account</span><strong>alex@example.com</strong><span>Password</span><strong className={styles.password}>••••••••••••</strong></div>
              <div className={styles.permissions}>
                <p className={styles.label}>AGENT ACCESS</p>
                <div className={styles.agent}><span className={styles.agentIcon}>↗</span><strong>Cursor</strong><span className={styles.allowed}>✓ Allowed</span></div>
                <div className={styles.agent}><span className={styles.agentIcon}>✳</span><strong>Claude Code</strong><span className={styles.unapproved}>No access</span></div>
              </div>
              <div className={styles.activity}><span className={styles.activityIcon}>↳</span><div><strong>Cursor signed in</strong><span>Simulated activity · Just now</span></div><span className={styles.activityResult}>Completed</span></div>
            </div>
          </div>
        </div>
        <figcaption>Illustrative preview · Agent integrations are not connected.</figcaption>
      </figure>
    </section>
  );
}
