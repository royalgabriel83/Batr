"use client";

import { useState } from "react";
import { Check, Share2 } from "lucide-react";
import { Button, type ButtonVariant } from "@/components/ui";

export interface ShareButtonProps {
  /** Path of the offer page, for example /offers/abc. */
  path: string;
  title: string;
  variant?: ButtonVariant;
}

type Outcome = "idle" | "copied" | "manual";

/**
 * Shares the offer page's link: the device's share sheet where the
 * browser has one, otherwise the link is copied. If copying is not
 * allowed either, the link is shown to copy by hand.
 */
export function ShareButton({ path, title, variant = "secondary" }: ShareButtonProps) {
  const [outcome, setOutcome] = useState<Outcome>("idle");
  const [link, setLink] = useState("");

  async function share() {
    const url = new URL(path, window.location.origin).toString();
    setLink(url);
    if (typeof navigator.share === "function") {
      try {
        await navigator.share({ title, url });
        return;
      } catch (error) {
        // The member closed the share sheet: nothing else to do.
        if (error instanceof DOMException && error.name === "AbortError") return;
      }
    }
    try {
      await navigator.clipboard.writeText(url);
      setOutcome("copied");
    } catch {
      setOutcome("manual");
    }
  }

  return (
    <div className="flex flex-col gap-2">
      {/* 44px tall, to line up with the page's link buttons. */}
      <Button variant={variant} className="h-11!" icon={outcome === "copied" ? <Check /> : <Share2 />} onClick={() => void share()}>
        Share
      </Button>
      <p aria-live="polite" className="text-body-sm text-text-secondary empty:hidden">
        {outcome === "copied" ? "Link copied" : ""}
      </p>
      {outcome === "manual" ? (
        <label className="flex flex-col gap-1 text-body-sm text-text-secondary">
          Copy this link
          <input
            readOnly
            value={link}
            onFocus={(event) => event.currentTarget.select()}
            className="h-11 rounded-lg border border-border-strong bg-bg-surface px-3 text-body-sm text-text-primary"
          />
        </label>
      ) : null}
    </div>
  );
}
