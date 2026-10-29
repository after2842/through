"use client";

import { useEffect, useState } from "react";
import { getSession } from "@/lib/client";
import Link from "next/link";
import EnvironmentNote from "@/components/environment-note";
import SiteHeader from "@/components/site-header";
import styles from "./pricing-content.module.css";

const previewPlans = [
  { name: "Personal", previousPrice: "$19", interval: "/ month", audience: "Your accounts. Your agents." },
  { name: "Team", previousPrice: "$39", interval: "/ member / month", audience: "For workflows across your team." },
  { name: "Enterprise", previousPrice: null, interval: "during preview", audience: "Explore the workflow with your organization." },
];

export default function PricingContent() {
  const [signedIn, setSignedIn] = useState(false);
  useEffect(() => {
    let cancelled = false;
    void getSession().then(session => { if (!cancelled) setSignedIn(!!session); }).catch(() => { /* Pricing stays readable if the session API is unavailable. */ });
    return () => { cancelled = true; };
  }, []);
  return (
    <div className="page app-page">
      <SiteHeader action={<Link className="quiet-link" href={signedIn ? "/settings/" : "/login/"}>{signedIn ? "Settings" : "Sign in"}<span aria-hidden="true">↗</span></Link>} />
      <main id="main" className={`app-main ${styles.main}`}>
        <div className={styles.layout}>
          <div className={styles.introduction}>
            <h1 className={styles.title}>Pricing.</h1>
            <p className={styles.description}>A little less friction.<br />No cost to get started.</p>
            <Link className={styles.primaryAction} href={signedIn ? "/accounts/" : "/login/"}>{signedIn ? "Manage connections" : "Start for free"} <span aria-hidden="true">↗</span></Link>
            <p className={styles.actionNote}>No credit card. All plans are $0 in preview.</p>
          </div>
          <section className={styles.plans} aria-label="Free preview plans" aria-describedby="pricing-note">
            <p className={styles.previewLabel}><span />FREE DURING PREVIEW</p>
            <ul className={styles.planList}>
              {previewPlans.map((plan) => (
                <li className={styles.plan} key={plan.name}>
                  <div className={styles.planIdentity}>
                    <h2 className={styles.planName}>{plan.name}</h2>
                    <p className={styles.audience}>{plan.audience}</p>
                  </div>
                  <p className={styles.price}>
                    <span className={styles.priceNumbers}>{plan.previousPrice && <s className={styles.previousPrice} aria-label={`Previously proposed ${plan.previousPrice}`}>{plan.previousPrice}</s>}<span className={styles.amount}>$0</span></span>
                    <span className={styles.interval}>{plan.interval}</span>
                  </p>
                </li>
              ))}
            </ul>
            <div className={styles.included}>
              <p>Every preview includes</p>
              <ul><li>Connection setup</li><li>Agent permissions</li><li>Activity logs</li></ul>
            </div>
            <p className={styles.note} id="pricing-note">USD · The same preview features are available on every plan. No automatic charges. External sign-in is not connected.</p>
          </section>
        </div>
      </main>
      <footer className={`app-footer ${styles.footer}`}>
        <Link className={styles.homeLink} href="/">Back home</Link>
        <span className={styles.environment}><EnvironmentNote /></span>
      </footer>
    </div>
  );
}
