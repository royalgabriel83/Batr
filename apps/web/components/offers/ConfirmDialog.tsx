"use client";

import { useEffect, useId, useRef, type ReactNode } from "react";
import { Button, type ButtonVariant } from "@/components/ui";

export interface ConfirmDialogProps {
  open: boolean;
  title: string;
  children: ReactNode;
  confirmLabel: string;
  cancelLabel?: string;
  confirmVariant?: ButtonVariant;
  busy?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

/**
 * A confirmation built on the native <dialog> element: showModal() traps
 * focus, Escape cancels, and focus returns to the opening button when it
 * closes. No dialog library is needed yet (ui-context.md, Component
 * Library).
 */
export function ConfirmDialog({ open, title, children, confirmLabel, cancelLabel = "Cancel", confirmVariant = "primary", busy, onConfirm, onCancel }: ConfirmDialogProps) {
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);

  return (
    <dialog
      ref={ref}
      aria-labelledby={titleId}
      onCancel={(event) => {
        event.preventDefault();
        if (!busy) onCancel();
      }}
      className="m-auto w-[min(28rem,calc(100vw-2rem))] rounded-xl bg-bg-surface p-6 text-text-primary shadow-lg backdrop:bg-bg-inverse/60"
    >
      <div className="flex flex-col gap-4">
        <h2 id={titleId} className="text-h3">
          {title}
        </h2>
        <div className="text-body text-text-secondary">{children}</div>
        <div className="flex flex-wrap justify-end gap-2">
          <Button variant="secondary" onClick={onCancel} disabled={busy}>
            {cancelLabel}
          </Button>
          <Button variant={confirmVariant} onClick={onConfirm} loading={busy}>
            {confirmLabel}
          </Button>
        </div>
      </div>
    </dialog>
  );
}
