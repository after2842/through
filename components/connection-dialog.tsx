"use client";

import { useEffect, useRef, type ReactNode } from "react";
import styles from "./connection-ui.module.css";

export default function ConnectionDialog({ title, description, busy = false, onClose, children }: {
  title: string; description?: string; busy?: boolean; onClose: () => void; children: ReactNode;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const closeHandler = useRef(onClose);
  closeHandler.current = onClose;
  useEffect(() => {
    const element = dialog.current;
    const previouslyFocused = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    element?.showModal();
    return () => { element?.close(); if (previouslyFocused?.isConnected) previouslyFocused.focus(); };
  }, []);
  return <dialog ref={dialog} className={styles.dialog} aria-labelledby="dialog-title" aria-describedby={description ? "dialog-description" : undefined}
    onCancel={event => { event.preventDefault(); if (!busy) closeHandler.current(); }}
    onClick={event => { if (event.target === event.currentTarget && !busy) closeHandler.current(); }}>
    <div className={styles.dialogContent}>
      <button type="button" className={styles.close} disabled={busy} aria-label="Close dialog" onClick={onClose}>×</button>
      <h2 id="dialog-title">{title}</h2>
      {description && <p className={styles.description} id="dialog-description">{description}</p>}
      {children}
    </div>
  </dialog>;
}
