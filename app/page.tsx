import AgentDemo from "@/components/agent-demo";
import { ConnectButton } from "@/components/connect-button";

function Arrow({ diagonal = false }: { diagonal?: boolean }) {
  return <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d={diagonal ? "M6 18 18 6M6 6h12v12" : "M4 12h15m-6-6 6 6-6 6"} stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" /></svg>;
}

function ThroughMark({ small = false }: { small?: boolean }) {
  return <svg className={small ? "brand-mark small" : "brand-mark"} viewBox="0 0 38 38" fill="none" aria-hidden="true"><path d="M9 29V15a10 10 0 0 1 20 0v14" stroke="currentColor" strokeWidth="3" /><path d="M4 23h27m-5-5 5 5-5 5" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" /></svg>;
}

function StepArt({ type }: { type: number }) {
  return <svg viewBox="0 0 300 132" fill="none" aria-hidden="true" className="step-art">
    {type === 1 ? <>
      <rect x="62" y="23" width="72" height="82" rx="7" fill="#f7f5eb" stroke="#65756a" />
      <path d="M76 42h43M76 51h27" stroke="#99a498" strokeWidth="2" strokeLinecap="round" />
      <rect x="84" y="65" width="29" height="24" rx="4" fill="#c5e4d5" stroke="#506e5b" />
      <path d="M91 65v-5a7 7 0 0 1 14 0v5" stroke="#506e5b" strokeWidth="2" />
      <path d="M135 68h48" stroke="#6e8d77" strokeDasharray="3 4" />
      <circle cx="210" cy="67" r="28" fill="#b7decc" stroke="#65756a" />
      <path d="m198 68 8 8 15-18" stroke="#284a37" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx="252" cy="28" r="4" fill="#c5cebd" /><path d="M35 82h10m-5-5v10" stroke="#93a18e" />
    </> : type === 2 ? <>
      <path d="M37 65h72m82 0h72" stroke="#7d8c7c" strokeDasharray="4 4" />
      <rect x="110" y="23" width="80" height="85" rx="8" fill="#b7decc" stroke="#65756a" />
      <path d="M137 81V55a13 13 0 0 1 26 0v26M127 69h45m-8-8 8 8-8 8" stroke="#385541" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx="38" cy="65" r="5" fill="#f7f5eb" stroke="#7d8c7c" /><circle cx="262" cy="65" r="5" fill="#b7decc" stroke="#7d8c7c" />
      <path d="M89 26h7m-3.5-3.5v7M217 97h7m-3.5-3.5v7" stroke="#93a18e" />
    </> : <>
      <rect x="57" y="30" width="187" height="74" rx="7" fill="#f7f5eb" stroke="#65756a" />
      <path d="M57 49h187" stroke="#65756a" /><circle cx="69" cy="40" r="2" fill="#9ca495" /><circle cx="77" cy="40" r="2" fill="#9ca495" /><circle cx="85" cy="40" r="2" fill="#9ca495" />
      <rect x="72" y="64" width="25" height="24" rx="4" fill="#b7decc" /><path d="m79 76 4 4 7-9" stroke="#385541" strokeWidth="1.8" strokeLinecap="round" />
      <path d="M110 68h62m-62 12h97" stroke="#a1ad9a" strokeWidth="3" strokeLinecap="round" />
      <path d="m217 14 4 8 9 1-6 6 2 9-9-5-8 5 1-9-6-6 9-1 3-8Z" fill="#b7decc" stroke="#65756a" />
    </>}
  </svg>;
}

export default function Home() {
  return <>
    <a href="#main" className="skip-link">본문으로 건너뛰기</a>
    <header className="site-header shell">
      <a className="wordmark" href="#" aria-label="through 홈"><ThroughMark />through<span className="preview-tag">preview</span></a>
      <nav className="desktop-nav" aria-label="주요 메뉴"><a href="#how-it-works">작동 방식</a><a href="#principles">우리의 원칙</a><a href="#developers">개발자</a></nav>
      <ConnectButton className="header-cta">시작하기 <Arrow diagonal /></ConnectButton>
    </header>

    <main id="main">
      <section className="hero shell" aria-labelledby="hero-heading">
        <div className="hero-copy">
          <div className="eyebrow"><span className="status-dot" /> A LITTLE LESS FRICTION.</div>
          <h1 id="hero-heading">Let your agents<br /><em>keep going.</em></h1>
          <p className="hero-description">좋은 흐름이 로그인에서 멈추지 않도록.<br />당신의 계정과 AI 에이전트 사이,<br className="mobile-break" /> 자연스러운 연결을 만듭니다.</p>
          <div className="hero-actions"><ConnectButton className="button button-dark">에이전트 연결하기 <Arrow /></ConnectButton><a className="text-link" href="#how-it-works">어떻게 동작하나요 <span>↓</span></a></div>
          <p className="hero-footnote"><span className="mini-key" aria-hidden="true">↳</span> 당신은 한 번 연결하고, 에이전트는 하던 일을 이어가고.</p>
        </div>
        <div className="hero-visual"><div className="visual-orbit" aria-hidden="true" /><AgentDemo /><span className="visual-note">a small connection. a continuous flow.</span></div>
      </section>

      <section className="platform-strip shell" aria-label="에이전트 연결 대상">
        <p>새로운 워크플로 대신,<br /><strong>이미 익숙한 에이전트에서.</strong></p>
        <div className="platform-names"><span className="platform cursor"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="m12 2 9 5v10l-9 5-9-5V7l9-5Zm0 3L6 8l6 3 6-3-6-3Zm-7 5v6l6 3v-6l-6-3Z" fill="currentColor" /></svg>Cursor</span><span className="platform claude"><span aria-hidden="true" className="claude-star">✳</span>Claude Code</span><span className="platform codex"><span aria-hidden="true" className="code-symbol">⌘</span>Codex</span></div>
        <span className="strip-note">연결 경험을 설계 중인 플랫폼</span>
      </section>

      <section id="how-it-works" className="how-section shell" aria-labelledby="how-title">
        <div className="section-topline"><span className="eyebrow">01 / THE WAY THROUGH</span><span className="tiny-note">LESS STOPPING. MORE DOING.</span></div>
        <div className="section-heading"><h2 id="how-title">작은 연결 하나로,<br /><span className="serif-italic">흐름은 계속됩니다.</span></h2><p>창을 바꾸고, 로그인하고, 다시 설명하는 일.<br />through는 그 사이의 번거로움을 줄이기 위해<br />만들어지고 있습니다.</p></div>
        <div className="steps">
          <article className="step"><div className="step-number">01<span>CONNECT</span></div><StepArt type={1} /><h3>필요한 계정을 연결하세요.</h3><p>에이전트가 사용할 계정을 고르고,<br />허용할 접근을 직접 정하세요.</p></article>
          <article className="step"><div className="step-number">02<span>HAND OFF</span></div><StepArt type={2} /><h3>로그인이 필요할 때, through.</h3><p>에이전트가 로그인 화면을 만나면,<br />연결된 계정으로 인증을 요청합니다.</p></article>
          <article className="step"><div className="step-number">03<span>KEEP GOING</span></div><StepArt type={3} /><h3>바로 그 자리에서 이어서.</h3><p>로그인을 마친 같은 브라우저에서,<br />에이전트가 하던 작업을 계속합니다.</p></article>
        </div>
      </section>

      <section id="principles" className="principles-wrap" aria-labelledby="principles-title">
        <div className="principles shell">
          <div className="principles-intro"><span className="eyebrow">02 / THOUGHTFULLY CONNECTED</span><h2 id="principles-title">A little access.<br /><em>A lot of trust.</em></h2><p>계정을 연결하는 일은, 신뢰를 건네는 일이니까.<br />처음부터 당신의 통제권을 중심에 둡니다.</p><div className="trust-illustration" aria-hidden="true"><div className="trust-door"><ThroughMark /></div><span className="trust-orbit one" /><span className="trust-orbit two" /><span className="trust-spark">✳</span><span className="trust-caption">YOURS TO OPEN.<br />YOURS TO CLOSE.</span></div></div>
          <div className="principle-list">
            <article><span className="principle-icon">↗</span><div><h3>허용한 계정만, 필요한 순간에.</h3><p>어떤 계정을 어떤 에이전트에게 맡길지.<br />접근의 시작과 끝을 당신이 정하는 경험.</p></div><span className="list-number">01</span></article>
            <article><svg className="principle-icon" viewBox="0 0 28 28" fill="none" aria-hidden="true"><path d="m14 3 9 4v7c0 6-9 10-9 10S5 20 5 14V7l9-4Z" stroke="currentColor" strokeWidth="1.3" /><path d="m9 14 3 3 6-6" stroke="currentColor" strokeWidth="1.3" /></svg><div><h3>비밀정보는, 조용히 뒤에서.</h3><p>모델에는 계정의 참조를 전달하고,<br />인증 정보는 별도의 실행부에서 다루는 설계.</p></div><span className="list-number">02</span></article>
            <article><span className="principle-icon">⤴</span><div><h3>사람이 필요할 땐, 분명하게.</h3><p>추가 인증이 필요한 순간만 알려드려요.<br />무엇을 승인하는지 알 수 있게, 간결하게.</p></div><span className="list-number">03</span></article>
          </div>
        </div>
      </section>

      <section id="developers" className="developer-section shell" aria-labelledby="developer-title">
        <div className="developer-copy"><span className="eyebrow">03 / FOR THE BUILDERS</span><h2 id="developer-title">One tool.<br /><em>Back to the task.</em></h2><p>새로운 브라우저를 만드는 대신,<br />에이전트가 이미 일하는 곳에 연결하세요.</p><ConnectButton className="text-link">연결 설정 살펴보기 <Arrow diagonal /></ConnectButton><span className="developer-caption">MCP · LOCAL ADAPTERS · YOUR WORKFLOW</span></div>
        <div className="code-window"><div className="code-header"><span><i /><i /><i /></span><span>the moment of connection</span><span className="code-label">예시</span></div><div className="code-content"><span className="code-comment">// A login wall. A way through.</span><div><span className="code-purple">await</span> through.<span className="code-green">ensureAccess</span>({'{'}</div><div className="indent">site: <span className="code-string">&quot;workspace.example&quot;</span>,</div><div className="indent">account: <span className="code-string">&quot;my-work-account&quot;</span>,</div><div className="indent">tab: currentTab</div><div>{'}'});</div><br /><span className="code-comment">// Right where you left off.</span><div><span className="code-purple">await</span> agent.<span className="code-green">continue</span>();</div></div><div className="code-footer"><span className="status-dot" /> Designed for a continuous workflow.<span>↵</span></div></div>
      </section>

      <section className="closing-section shell" aria-labelledby="closing-title"><div className="closing-content"><ThroughMark /><span className="eyebrow">LET GOOD WORK FLOW.</span><h2 id="closing-title">A way in.<br /><em>A way forward.</em></h2><p>로그인 다음의 일에, 더 집중할 수 있도록.</p><ConnectButton className="button button-dark">through 체험하기 <Arrow /></ConnectButton></div><div className="closing-lines" aria-hidden="true"><span /><span /><span /><span /></div><span className="closing-corner" aria-hidden="true">↗</span></section>
    </main>

    <footer className="footer shell"><a className="wordmark" href="#" aria-label="through 맨 위로"><ThroughMark small />through</a><p>Small connections. Good things ahead.</p><span>© {new Date().getFullYear()} through · Concept preview</span><a href="#developers">Built for what’s next <Arrow diagonal /></a></footer>
  </>;
}
