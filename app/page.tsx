import AgentDemo from "@/components/agent-demo";
import SiteHeader from "@/components/site-header";
import Link from "next/link";
import HomeRouter from "@/components/home-router";

export default function Home() {
  const publicHome = (
    <div className="page landing-page">
      <SiteHeader action={<Link className="quiet-link" href="/login/">Sign in <span aria-hidden="true">↗</span></Link>} />
      <main id="main" className="landing-main">
        <section className="hero-stage" aria-labelledby="headline">
          <div className="introduction">
            <h1 id="headline">Past the login.<br /><span>Back to work.</span></h1>
            <p>Your agent signs in with your connected accounts,<br className="desktop-break" /> then gets back to work in the same browser.</p>
          </div>
          <div className="experience"><AgentDemo /></div>
          <a className="section-cue" href="#use-case">One everyday example <span aria-hidden="true">↓</span></a>
        </section>
        <section id="use-case" className="explanation" aria-labelledby="explanation-title">
          <div className="case-margin"><p className="section-label">THE WEEKLY UPDATE</p><span>Illustrative workflow</span></div>
          <div className="explanation-body">
            <h2 id="explanation-title">“Catch me up on<br />this week in Linear.”</h2>
            <ol className="case-flow">
              <li><span className="case-marker" aria-hidden="true">01</span><div><strong>Your agent opens Linear.</strong><span>A login stands in the way.</span></div></li>
              <li className="case-handoff"><span className="case-marker" aria-hidden="true">↳</span><div><strong>through signs in.</strong><span>With the account you already connected.</span></div></li>
              <li><span className="case-marker" aria-hidden="true">02</span><div><strong>Your agent finishes the brief.</strong><span>You keep your train of thought.</span></div></li>
            </ol>
            <Link className="text-action" href="/login/">Try it with a demo account <span aria-hidden="true">↗</span></Link>
          </div>
        </section>
      </main>
      <footer className="app-footer">Interactive demo<span aria-hidden="true">·</span>No real accounts are connected.</footer>
    </div>
  );
  return <HomeRouter publicHome={publicHome} />;
}
