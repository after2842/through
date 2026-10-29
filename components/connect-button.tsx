"use client";

import { type ReactNode, useEffect, useId, useRef, useState } from "react";
import { createPortal } from "react-dom";
import styles from "./connect-button.module.css";

type Platform = "Cursor" | "Claude Code" | "Codex";

const platforms: Platform[] = ["Cursor", "Claude Code", "Codex"];
const configurations: Record<Platform, { label: string; snippet: string; instruction: string }> = {
  Cursor: {
    label: ".cursor/mcp.json",
    snippet: '{\n  "mcpServers": {\n    "through": {\n      "url": "https://mcp.through.example/mcp"\n    }\n  }\n}',
    instruction: "프로젝트의 MCP 설정에 아래 구성 예시를 추가하세요.",
  },
  "Claude Code": {
    label: "Terminal",
    snippet: "claude mcp add --transport http through \\\n  https://mcp.through.example/mcp",
    instruction: "터미널에서 사용할 수 있는 연결 명령 예시예요.",
  },
  Codex: {
    label: "Terminal",
    snippet: "codex mcp add through \\\n  --url https://mcp.through.example/mcp",
    instruction: "터미널에서 사용할 수 있는 연결 명령 예시예요.",
  },
};

async function copyText(value: string) {
  if (navigator.clipboard && window.isSecureContext) {
    await navigator.clipboard.writeText(value);
    return;
  }
  const input = document.createElement("textarea");
  input.value = value;
  input.setAttribute("readonly", "");
  input.style.position = "fixed";
  input.style.opacity = "0";
  document.body.appendChild(input);
  input.select();
  const copied = document.execCommand("copy");
  input.remove();
  if (!copied) throw new Error("Copy failed");
}

export function ConnectButton({ className, children = "에이전트 연결하기" }: { className?: string; children?: ReactNode }) {
  const [open, setOpen] = useState(false);
  const [platform, setPlatform] = useState<Platform>("Cursor");
  const [complete, setComplete] = useState(false);
  const [copyState, setCopyState] = useState<"idle" | "copied" | "error">("idle");
  const trigger = useRef<HTMLButtonElement>(null);
  const dialog = useRef<HTMLDivElement>(null);
  const initialFocus = useRef<HTMLButtonElement>(null);
  const successTitle = useRef<HTMLHeadingElement>(null);
  const titleId = useId();
  const descriptionId = useId();
  const configuration = configurations[platform];

  useEffect(() => {
    if (!open) return;
    const previouslyFocused = document.activeElement;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    initialFocus.current?.focus();

    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        event.preventDefault();
        setOpen(false);
      }
      if (event.key !== "Tab" || !dialog.current) return;
      const focusable = Array.from(dialog.current.querySelectorAll<HTMLElement>(
        'button:not([disabled]), a[href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex="0"]',
      ));
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && (document.activeElement === first || !dialog.current.contains(document.activeElement))) {
        event.preventDefault();
        last?.focus();
      } else if (!event.shiftKey && (document.activeElement === last || !dialog.current.contains(document.activeElement))) {
        event.preventDefault();
        first?.focus();
      }
    }

    function onFocusIn(event: FocusEvent) {
      if (event.target instanceof Node && !dialog.current?.contains(event.target)) {
        initialFocus.current?.focus();
      }
    }

    document.addEventListener("keydown", onKeyDown);
    document.addEventListener("focusin", onFocusIn);
    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener("keydown", onKeyDown);
      document.removeEventListener("focusin", onFocusIn);
      if (previouslyFocused instanceof HTMLElement && previouslyFocused.isConnected) {
        previouslyFocused.focus();
      } else {
        trigger.current?.focus();
      }
    };
  }, [open]);

  useEffect(() => {
    if (open && complete) successTitle.current?.focus();
  }, [open, complete]);

  function showDialog() {
    setComplete(false);
    setCopyState("idle");
    setOpen(true);
  }

  async function copyConfiguration() {
    try {
      await copyText(configuration.snippet);
      setCopyState("copied");
    } catch {
      setCopyState("error");
    }
  }

  return (
    <>
      <button aria-haspopup="dialog" className={className} onClick={showDialog} ref={trigger} type="button">
        {children}
      </button>
      {open && createPortal(
        <div className={styles.backdrop} onClick={(event) => {
          if (event.target === event.currentTarget) setOpen(false);
        }}>
          <div aria-describedby={descriptionId} aria-labelledby={titleId} aria-modal="true" className={styles.dialog} ref={dialog} role="dialog">
            <button aria-label="연결 창 닫기" className={styles.close} onClick={() => setOpen(false)} ref={initialFocus} type="button">
              <svg aria-hidden="true" width="20" height="20" viewBox="0 0 20 20" fill="none"><path d="m5 5 10 10M15 5 5 15" stroke="currentColor" strokeWidth="1.5" /></svg>
            </button>
            {complete ? (
              <div className={styles.success}>
                <span aria-hidden="true" className={styles.successIcon}><svg width="32" height="32" viewBox="0 0 32 32" fill="none"><path d="m8 16 5.5 5.5L24 11" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" /></svg></span>
                <span className={styles.eyebrow}>DEMO COMPLETE</span>
                <h2 id={titleId} ref={successTitle} tabIndex={-1}>준비됐어요.</h2>
                <p className={styles.successText} id={descriptionId}>연결 흐름을 살펴봤어요.<br />실제 계정이나 에이전트는 연결되지 않았습니다.</p>
                <button className={styles.primary} onClick={() => setOpen(false)} type="button">돌아가기 <span aria-hidden="true">↗</span></button>
              </div>
            ) : (
              <>
                <span className={styles.eyebrow}><span className={styles.demoDot} /> CONNECTION DEMO</span>
                <h2 id={titleId}>에이전트와 연결하기</h2>
                <p className={styles.intro} id={descriptionId}>사용하는 에이전트를 선택하고,<br className={styles.desktopBreak} /> through의 연결 흐름을 확인해 보세요.</p>
                <div aria-label="에이전트 선택" className={styles.platforms} role="group">
                  {platforms.map((item) => (
                    <button aria-pressed={platform === item} className={platform === item ? styles.platformActive : styles.platform} key={item} onClick={() => {
                      setPlatform(item);
                      setCopyState("idle");
                    }} type="button">{item}</button>
                  ))}
                </div>
                <p className={styles.instruction}>{configuration.instruction}</p>
                <div className={styles.codePanel}>
                  <div className={styles.codeHeader}><span>{configuration.label}</span><button className={styles.copy} onClick={copyConfiguration} type="button"><svg aria-hidden="true" width="14" height="14" viewBox="0 0 16 16" fill="none"><rect x="5.5" y="5.5" width="8" height="8" rx="1" stroke="currentColor" /><path d="M10.5 5V2.5h-8v8H5" stroke="currentColor" /></svg>{copyState === "copied" ? "복사했어요" : "복사"}</button></div>
                  <pre className={styles.code}><code>{configuration.snippet}</code></pre>
                </div>
                <p aria-live="polite" className={styles.copyFeedback}>{copyState === "error" ? "복사하지 못했어요. 위 예시를 직접 선택해 복사해 주세요." : copyState === "copied" ? "구성 예시를 클립보드에 복사했어요." : "예시 주소는 실제 서버에 연결되지 않습니다."}</p>
                <div className={styles.note}><span aria-hidden="true">ⓘ</span><p>구성 예시이며 실제 인증 서비스에 연결되지 않습니다. 계정 정보나 비밀번호를 입력할 필요가 없어요.</p></div>
                <button className={styles.primary} onClick={() => setComplete(true)} type="button">설정 데모 완료 <span aria-hidden="true">↗</span></button>
              </>
            )}
          </div>
        </div>,
        document.body,
      )}
    </>
  );
}
