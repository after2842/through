"use client";

import { forwardRef, useEffect, useRef, useState, type KeyboardEvent, type ReactNode } from "react";
import styles from "./select-field.module.css";

type SelectFieldProps = {
  id: string;
  label: string;
  value: string;
  options: readonly string[];
  placeholder: string;
  onChange: (value: string) => void;
  disabled?: boolean;
  required?: boolean;
  invalid?: boolean;
  describedBy?: string;
  renderOption?: (option: string) => ReactNode;
};

const SelectField = forwardRef<HTMLButtonElement, SelectFieldProps>(function SelectField(
  { id, label, value, options, placeholder, onChange, disabled = false, required = false, invalid = false, describedBy, renderOption },
  forwardedRef,
) {
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);
  const root = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const listbox = useRef<HTMLUListElement>(null);
  const search = useRef({ text: "", time: 0 });
  const listboxId = `${id}-options`;
  const selectedIndex = options.indexOf(value);

  useEffect(() => {
    if (!open) return;
    function closeOutside(event: PointerEvent) {
      if (event.target instanceof Node && !root.current?.contains(event.target)) setOpen(false);
    }
    document.addEventListener("pointerdown", closeOutside);
    return () => document.removeEventListener("pointerdown", closeOutside);
  }, [open]);

  useEffect(() => {
    if (disabled) setOpen(false);
  }, [disabled]);

  useEffect(() => {
    if (open) listbox.current?.children[activeIndex]?.scrollIntoView({ block: "nearest" });
  }, [activeIndex, open]);

  function openList(fromEnd = false) {
    search.current = { text: "", time: 0 };
    setActiveIndex(selectedIndex >= 0 ? selectedIndex : fromEnd ? options.length - 1 : 0);
    setOpen(true);
  }

  function select(index: number) {
    if (options[index] === undefined) return;
    onChange(options[index]);
    setOpen(false);
    trigger.current?.focus();
  }

  function handleKeyDown(event: KeyboardEvent<HTMLButtonElement>) {
    if (disabled || !options.length) return;
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      const direction = event.key === "ArrowDown" ? 1 : -1;
      if (!open) openList(direction < 0);
      else setActiveIndex((index) => (index + direction + options.length) % options.length);
      search.current = { text: "", time: 0 };
      return;
    }
    if (event.key === "Home" || event.key === "End") {
      event.preventDefault();
      setActiveIndex(event.key === "Home" ? 0 : options.length - 1);
      setOpen(true);
      return;
    }
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      if (open) select(activeIndex);
      else openList();
      return;
    }
    if (event.key === "Escape" && open) {
      event.preventDefault();
      setOpen(false);
      trigger.current?.focus();
      return;
    }
    if (event.key === "Tab") {
      setOpen(false);
      return;
    }
    if (event.key.length === 1 && !event.altKey && !event.ctrlKey && !event.metaKey) {
      event.preventDefault();
      const now = Date.now();
      const previous = now - search.current.time < 650 ? search.current.text : "";
      const query = `${previous}${event.key.toLocaleLowerCase("en-US")}`;
      const repeating = [...query].every((character) => character === query[0]);
      const prefix = repeating ? query[0] : query;
      const start = repeating ? (open ? activeIndex : selectedIndex) + 1 : 0;
      const match = options.findIndex((_, offset) => options[(start + offset + options.length) % options.length].toLocaleLowerCase("en-US").startsWith(prefix));
      search.current = { text: query, time: now };
      if (match >= 0) setActiveIndex((start + match + options.length) % options.length);
      else if (!open) setActiveIndex(Math.max(selectedIndex, 0));
      setOpen(true);
    }
  }

  return (
    <div ref={root} className={styles.field} onBlur={(event) => {
      if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setOpen(false);
    }}>
      <label id={`${id}-label`} htmlFor={id} className={styles.label}>{label}</label>
      <button
        ref={(element) => {
          trigger.current = element;
          if (typeof forwardedRef === "function") forwardedRef(element);
          else if (forwardedRef) forwardedRef.current = element;
        }}
        id={id}
        type="button"
        role="combobox"
        className={`${styles.trigger} ${!value ? styles.placeholder : ""}`}
        aria-labelledby={`${id}-label ${id}-value`}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={open ? listboxId : undefined}
        aria-activedescendant={open ? `${id}-option-${activeIndex}` : undefined}
        aria-required={required}
        aria-invalid={invalid || undefined}
        aria-describedby={describedBy}
        disabled={disabled}
        onClick={() => { if (open) setOpen(false); else openList(); }}
        onKeyDown={handleKeyDown}
      >
        <span id={`${id}-value`}>{value ? (renderOption?.(value) ?? value) : placeholder}</span>
        <svg className={styles.chevron} width="16" height="16" viewBox="0 0 16 16" aria-hidden="true"><path d="m4 6 4 4 4-4" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" /></svg>
      </button>
      {open && (
        <ul ref={listbox} id={listboxId} role="listbox" aria-labelledby={`${id}-label`} className={styles.listbox}>
          {options.map((option, index) => (
            <li
              key={option}
              id={`${id}-option-${index}`}
              role="option"
              aria-selected={value === option}
              className={`${styles.option} ${activeIndex === index ? styles.active : ""}`}
              onPointerMove={() => setActiveIndex(index)}
              onPointerDown={(event) => event.preventDefault()}
              onClick={() => select(index)}
            >
              <span>{renderOption?.(option) ?? option}</span>
              {value === option && <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true"><path d="m3 8 3 3 7-7" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" /></svg>}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
});

export default SelectField;
