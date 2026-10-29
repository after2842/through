import AgentDemo from "@/components/agent-demo";

export default function Home() {
  return (
    <div className="page">
      <a className="skip-link" href="#main">Skip to content</a>
      <header className="masthead">
        <a href="#" className="wordmark" aria-label="through home">through<span aria-hidden="true">.</span></a>
        <span className="category">ACCOUNT ACCESS FOR AI AGENTS</span>
      </header>
      <main id="main">
        <section className="introduction" aria-labelledby="headline">
          <h1 id="headline">Past the login.<br /><span>Back to work.</span></h1>
          <p>Your agent signs in with your connected accounts,<br className="desktop-break" /> then gets back to work in the same browser.</p>
        </section>
        <section className="experience" aria-label="Try the sign-in handoff"><AgentDemo /></section>
      </main>
      <footer>Interactive demo<span aria-hidden="true">·</span>No real accounts are connected.</footer>
    </div>
  );
}
