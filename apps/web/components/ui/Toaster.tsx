"use client";

import Link from "next/link";
import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { CircleCheck, X } from "lucide-react";
import { cx } from "./cx";

export interface ToastInput {
  text: string;
  /** One follow-up link, such as "View saved". */
  action?: { label: string; href: string };
}

interface Toast extends ToastInput {
  id: number;
}

const SHOW_MS = 4000;
let toasts: Toast[] = [];
let nextId = 1;
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((listener) => listener());

/** Shows a short confirmation at the bottom of the screen. The newest replaces any other. */
export function toast(input: ToastInput): void {
  toasts = [{ ...input, id: nextId++ }];
  emit();
}

function dismiss(id: number) {
  toasts = toasts.filter((item) => item.id !== id);
  emit();
}

const subscribe = (listener: () => void) => {
  listeners.add(listener);
  return () => listeners.delete(listener);
};
const snapshot = () => toasts;
const empty: Toast[] = [];

/**
 * Confirmations that something worked (ui-context.md, Motion and
 * States): one at a time, above the phone tab bar, read out politely,
 * gone after four seconds unless hovered or focused. Errors stay next
 * to the control that failed, not here.
 */
export function Toaster() {
  const current = useSyncExternalStore(subscribe, snapshot, () => empty);
  return (
    <div
      role="status"
      aria-live="polite"
      className="pointer-events-none fixed inset-x-0 bottom-[calc(4.75rem+env(safe-area-inset-bottom))] z-50 flex justify-center px-4 md:bottom-6"
    >
      {current.map((item) => (
        <ToastCard key={item.id} toast={item} />
      ))}
    </div>
  );
}

function ToastCard({ toast: item }: { toast: Toast }) {
  const [held, setHeld] = useState(false);
  const remaining = useRef(SHOW_MS);
  useEffect(() => {
    if (held) return;
    const started = Date.now();
    const timer = setTimeout(() => dismiss(item.id), remaining.current);
    return () => {
      clearTimeout(timer);
      remaining.current -= Date.now() - started;
    };
  }, [held, item.id]);

  return (
    <div
      onPointerEnter={() => setHeld(true)}
      onPointerLeave={() => setHeld(false)}
      onFocus={() => setHeld(true)}
      onBlur={() => setHeld(false)}
      className={cx(
        "pointer-events-auto flex max-w-md min-w-0 animate-toast-in items-center gap-3 rounded-full bg-bg-inverse py-1.5 pr-1.5 pl-4 text-body-sm text-text-on-inverse shadow-lg",
      )}
    >
      <CircleCheck aria-hidden="true" className="size-4 shrink-0 text-accent-on-inverse" />
      <span className="min-w-0 truncate">{item.text}</span>
      {item.action ? (
        <Link href={item.action.href} className="inline-flex h-9 shrink-0 items-center rounded-full px-3 font-semibold text-accent-on-inverse hover:bg-text-on-inverse/10">
          {item.action.label}
        </Link>
      ) : null}
      <button
        type="button"
        onClick={() => dismiss(item.id)}
        aria-label="Dismiss"
        className="relative flex size-9 shrink-0 items-center justify-center rounded-full text-text-on-inverse-muted before:absolute before:-inset-1 hover:bg-text-on-inverse/10 hover:text-text-on-inverse"
      >
        <X aria-hidden="true" className="size-4" />
      </button>
    </div>
  );
}
