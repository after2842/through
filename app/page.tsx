import EnvironmentNote from "@/components/environment-note";
import AgentDemo from "@/components/agent-demo";
import SiteHeader from "@/components/site-header";
import Link from "next/link";
import HomeRouter from "@/components/home-router";
import UseCase from "@/components/use-case";

export default function Home() {
  const publicHome = (
    <div className="page landing-page">
      <SiteHeader action={<><Link className="quiet-link" href="/pricing/">Pricing</Link><Link className="quiet-link" href="/login/">Sign in <span aria-hidden="true">↗</span></Link></>} />
      <main id="main" className="landing-main">
        <section className="hero-stage" aria-labelledby="headline">
          <div className="introduction">
            <h1 id="headline">Past the login.<br /><span>Back to work.</span></h1>
            <p>Your agent signs in with your connected accounts,<br className="desktop-break" /> then gets back to work in the same browser.</p>
          </div>
          <div className="experience"><AgentDemo /></div>
          <a className="section-cue" href="#use-case">Your account. Your permission. <span aria-hidden="true">↓</span></a>
        </section>
        <UseCase />
      </main>
      <footer className="app-footer"><EnvironmentNote /></footer>
    </div>
  );
  return <HomeRouter publicHome={publicHome} />;
}
