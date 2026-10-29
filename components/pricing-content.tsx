"use client";

import { useEffect, useState } from "react";
import { getSession } from "@/lib/client";
import Link from "next/link";
import EnvironmentNote from "@/components/environment-note";
import SiteHeader from "@/components/site-header";
import styles from "./pricing-content.module.css";

const proposedPlans = [
  { name: "Personal", price: "$19", interval: "/ month", audience: "For your own agent workflows." },
  { name: "Team", price: "$39", interval: "/ member / month", audience: "For teams sharing account access." },
  { name: "Enterprise", price: "Custom", interval: "", audience: "For organization-wide requirements." },
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
            <p className={styles.description}>Proposed plans.<br />The demo is free.</p>
            <Link className={styles.primaryAction} href={signedIn ? "/" : "/login/"}>{signedIn ? "Back to workspace" : "Try the demo"} <span aria-hidden="true">↗</span></Link>
          </div>
          <section className={styles.plans} aria-label="Proposed plans" aria-describedby="pricing-note">
            <ul className={styles.planList}>
              {proposedPlans.map((plan) => (
                <li className={styles.plan} key={plan.name}>
                  <div className={styles.planIdentity}>
                    <h2 className={styles.planName}>{plan.name}</h2>
                    <p className={styles.audience}>{plan.audience}</p>
                  </div>
                  <p className={styles.price}>
                    <span className={styles.amount}>{plan.price}</span>
                    {plan.interval && <span className={styles.interval}>{plan.interval}</span>}
                  </p>
                </li>
              ))}
            </ul>
            <p className={styles.note} id="pricing-note">Draft prices in USD · Billing is not connected.</p>
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
