import AgentDemo from "@/components/agent-demo";
import SiteHeader from "@/components/site-header";
import Link from "next/link";

export default function Home() {
  return (
    <div className="page landing-page">
      <SiteHeader action={<Link className="quiet-link" href="/login/">Sign in <span aria-hidden="true">↗</span></Link>} />
      <main id="main" className="landing-main">
        <section className="hero-stage" aria-labelledby="headline">
          <div className="introduction">
            <h1 id="headline">Past the login.<br /><span>Back to work.</span></h1>
            <p>Your agent signs in with your connected accounts,<br className="desktop-break" /> then gets back to work in the same browser.</p>
          </div>
          <div className="experience"><AgentDemo /></div>
          <a className="section-cue" href="#how-it-works">A little more <span aria-hidden="true">↓</span></a>
        </section>
        <section id="how-it-works" className="explanation" aria-labelledby="explanation-title">
          <p className="section-label">HOW IT WORKS</p>
          <div className="explanation-body">
            <h2 id="explanation-title">Your accounts.<br />On your terms.</h2>
            <p>Connect an account. Choose which agent can use it.<br className="desktop-break" /> Pause or remove access anytime.</p>
            <Link className="text-action" href="/login/">Explore your workspace <span aria-hidden="true">↗</span></Link>
          </div>
        </section>
      </main>
      <footer className="app-footer">Interactive demo<span aria-hidden="true">·</span>No real accounts are connected.</footer>
    </div>
  );
}
