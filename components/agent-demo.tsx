"use client";

import { useEffect, useState } from "react";
import styles from "./agent-demo.module.css";

type Phase = "paused" | "connecting" | "working" | "done";

function Arrow({ className }: { className?: string }) {
  return <svg className={className} width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M5 12h14m-6-6 6 6-6 6" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" /></svg>;
}

function Check({ className }: { className?: string }) {
  return <svg className={className} width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="m5.5 12 4.3 4.3 8.7-8.6" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" /></svg>;
}

function ThroughMark({ className }: { className?: string }) {
  return <svg className={className} width="25" height="25" viewBox="0 0 38 38" fill="none" aria-hidden="true"><path d="M9 29V15a10 10 0 0 1 20 0v14M4 23h27m-5-5 5 5-5 5" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" /></svg>;
}

export default function AgentDemo() {
  const [phase, setPhase] = useState<Phase>("paused");
  const busy = phase === "connecting" || phase === "working";
  const done = phase === "done";

  useEffect(() => {
    if (!busy) return;
    const timer = window.setTimeout(() => {
      setPhase(phase === "connecting" ? "working" : "done");
    }, phase === "connecting" ? 1250 : 1450);
    return () => window.clearTimeout(timer);
  }, [phase, busy]);

  const status = {
    paused: "로그인 앞에서 잠시 멈췄어요.",
    connecting: "연결된 계정을 확인하고 있어요.",
    working: "로그인 완료. 에이전트가 이어서 작업해요.",
    done: "로그인부터 작업 완료까지, 자연스럽게.",
  }[phase];

  return (
    <div className={styles.demo}>
      <div className={styles.demoLabel}><span className={styles.liveDot} /> A LITTLE DEMONSTRATION <span className={styles.demoTag}>프론트엔드 데모</span></div>
      <div className={styles.scene}>
        <div className={styles.browser}>
          <div className={styles.browserBar}>
            <div className={styles.trafficLights} aria-hidden="true"><i /><i /><i /></div>
            <div className={styles.address}><svg width="10" height="12" viewBox="0 0 12 14" fill="none" aria-hidden="true"><rect x="2" y="6" width="8" height="6" rx="1.4" stroke="currentColor" /><path d="M4 6V4a2 2 0 0 1 4 0v2" stroke="currentColor" /></svg> workspace.example</div>
            <span className={styles.browserMenu} aria-hidden="true">···</span>
          </div>
          <div className={styles.workspaceBar}><span className={styles.workspaceLogo}>w<span>·</span></span><span>Workspace</span><span className={styles.workspaceLocation}>{done ? "Release notes" : "Your workspace"}</span></div>
          <div className={`${styles.browserBody} ${done ? styles.browserDone : ""}`}>
            {done ? (
              <div className={styles.releaseContent}>
                <div className={styles.releaseEyebrow}>GITHUB / RELEASES</div>
                <h3>작은 업데이트.<br />더 큰 가능성.</h3>
                <div className={styles.releaseItem}><span className={styles.releaseVersion}>v2.8.0</span><span className={styles.releaseNew}>Latest</span></div>
                <p>최신 릴리스 노트를 가져왔어요.</p>
                <div className={styles.releaseLines} aria-hidden="true"><i /><i /><i /></div>
              </div>
            ) : (
              <div className={styles.loginContent}>
                <span className={styles.loginIcon} aria-hidden="true"><svg width="23" height="23" viewBox="0 0 24 24" fill="none"><rect x="5" y="10" width="14" height="11" rx="3" stroke="currentColor" strokeWidth="1.3" /><path d="M8 10V7a4 4 0 0 1 8 0v3M12 14v3" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" /></svg></span>
                <h3>반가워요, 다시.</h3>
                <p>계속하려면 로그인이 필요해요.</p>
                <div className={styles.mockLoginButton}><span className={styles.miniAccount}>S</span> 계정으로 계속하기 <Arrow /></div>
                <div className={styles.mockDivider}><span />또는<span /></div>
                <div className={styles.mockField}>이메일로 로그인</div>
              </div>
            )}
          </div>
        </div>

        <div className={`${styles.agentTask} ${done ? styles.agentTaskDone : ""}`}>
          <span className={styles.agentAvatar} aria-hidden="true"><svg width="17" height="17" viewBox="0 0 24 24" fill="none"><path d="M12 3v18M3 12h18M5.6 5.6l12.8 12.8M5.6 18.4 18.4 5.6" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" /></svg></span>
          <span><strong>GitHub 릴리스 노트 가져오기</strong><small>{done ? "작업 완료" : phase === "working" ? "작업을 이어가는 중" : phase === "connecting" ? "through에 연결 중" : "로그인 대기 중"}</small></span>
          <span className={`${styles.taskIndicator} ${busy ? styles.taskIndicatorBusy : ""}`}>{done ? <Check /> : busy ? <span className={styles.spinner} /> : <span className={styles.pauseIcon} aria-hidden="true">Ⅱ</span>}</span>
        </div>

        <div className={`${styles.handoff} ${done ? styles.handoffDone : ""}`}>
          <div className={styles.handoffTop}><div className={styles.throughBrand}><ThroughMark /><span>through</span></div><span className={styles.secureBadge}><svg width="11" height="13" viewBox="0 0 12 14" fill="none" aria-hidden="true"><path d="m6 1 4.5 1.7v3.4c0 2.8-1.6 4.8-4.5 6.4C3.1 10.9 1.5 8.9 1.5 6.1V2.7L6 1Z" stroke="currentColor" strokeWidth="1.1" /><path d="m3.8 6.7 1.4 1.4 3-3" stroke="currentColor" strokeWidth="1.1" strokeLinecap="round" strokeLinejoin="round" /></svg> Secure connection</span></div>
          <div className={styles.handoffStatus} aria-live="polite" aria-atomic="true"><h4>{status}</h4><p>{done ? "최신 릴리스 노트가 준비됐어요." : phase === "working" ? "인증 정보는 에이전트에게 전달되지 않아요." : phase === "connecting" ? "이 브라우저에서 안전하게 연결하는 중이에요." : "연결된 계정으로, 하던 일은 그대로."}</p></div>
          <div className={styles.connectionRow}><span className={styles.accountAvatar}>S</span><div><strong>Sam의 Workspace</strong><span>연결된 데모 계정</span></div><span className={styles.accountCheck}><Check /></span></div>
          <button className={styles.connectButton} type="button" disabled={busy} onClick={() => setPhase(done ? "paused" : "connecting")}>
            <span>{done ? "다시 보기" : phase === "connecting" ? "로그인 연결 중" : phase === "working" ? "작업을 이어가는 중" : "로그인 연결"}</span>{busy ? <span className={styles.spinner} /> : done ? <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M5 8a8 8 0 1 1-1 7M5 3v5h5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" /></svg> : <Arrow />}
          </button>
          <span className={styles.demoDisclaimer}>체험용 화면이에요. 실제 계정에는 연결되지 않아요.</span>
        </div>
        <span className={styles.connectionPath} aria-hidden="true"><svg viewBox="0 0 90 120" fill="none"><path d="M2 2h39a12 12 0 0 1 12 12v65a12 12 0 0 0 12 12h20" stroke="currentColor" strokeWidth="1.4" strokeDasharray="3 5" /><circle cx="85" cy="91" r="3" fill="currentColor" /></svg></span>
      </div>
    </div>
  );
}
