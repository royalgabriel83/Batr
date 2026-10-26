"use client";

import { usePathname, useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { Bookmark, Heart } from "lucide-react";
import { toast } from "@/components/ui/Toaster";
import { cx } from "@/components/ui/cx";

export interface OfferMarksProps {
  offerId: string;
  title: string;
  /** The viewer's like and save. Both absent: signed out (`guest`) or the viewer's own offer (nothing shown). */
  liked?: boolean;
  saved?: boolean;
  /** Signed out: both controls lead to sign-in and come back here (buttons, so a card stays one link). */
  guest?: boolean;
  /** `card` over a card photo; `detail` over the offer page's main photo. */
  size?: "card" | "detail";
  className?: string;
}

type Kind = "like" | "save";

const MESSAGES = {
  unavailable: "This offer isn't available any more.",
  failed: "That didn't save. Check your connection and try again.",
} as const;

/**
 * The heart and bookmark over an offer photo (owner, 2026-10-17, from
 * the approved reference). Both are private to the member: no counts,
 * nobody is told. A tap changes the icon at once; the request follows,
 * and a failure puts the icon back with a short message. Taps made
 * while a request is on its way are queued, so the last tap wins.
 */
export function OfferMarks({ offerId, title, liked, saved, guest, size = "card", className }: OfferMarksProps) {
  const pathname = usePathname();
  const router = useRouter();
  const [state, setState] = useState({
    like: Boolean(liked),
    save: Boolean(saved),
  });
  const [message, setMessage] = useState("");
  /** What the server last confirmed, and whether a request is on its way, per kind. */
  const confirmed = useRef({ like: Boolean(liked), save: Boolean(saved) });
  const wanted = useRef({ like: Boolean(liked), save: Boolean(saved) });
  const busy = useRef({ like: false, save: false });

  useEffect(() => {
    if (!message) return;
    const timer = setTimeout(() => setMessage(""), 5000);
    return () => clearTimeout(timer);
  }, [message]);

  if (!guest && liked === undefined && saved === undefined) return null;

  const button = cx(
    "relative flex items-center justify-center rounded-full bg-bg-surface text-text-primary shadow-sm transition",
    "before:absolute before:-inset-1 hover:scale-105 active:scale-95",
    size === "detail" ? "size-10" : "size-9",
  );
  const icon = size === "detail" ? "size-5" : "size-[18px]";

  if (guest) {
    const signIn = () => router.push(`/sign-in?next=${encodeURIComponent(pathname || `/offers/${offerId}`)}`);
    return (
      <div className={cx("flex gap-2", className)}>
        <button type="button" className={button} aria-label={`Sign in to like ${title}`} onClick={signIn}>
          <Heart aria-hidden="true" className={icon} />
        </button>
        <button type="button" className={button} aria-label={`Sign in to save ${title}`} onClick={signIn}>
          <Bookmark aria-hidden="true" className={icon} />
        </button>
      </div>
    );
  }

  async function send(kind: Kind) {
    busy.current[kind] = true;
    const before = confirmed.current[kind];
    while (wanted.current[kind] !== confirmed.current[kind]) {
      const on = wanted.current[kind];
      try {
        const response = await fetch(`/api/v1/offers/${offerId}/${kind}`, {
          method: on ? "PUT" : "DELETE",
          cache: "no-store",
        });
        if (response.status === 401) {
          router.push(`/sign-in?next=${encodeURIComponent(pathname)}`);
          return;
        }
        if (!response.ok) {
          const body = (await response.json().catch(() => null)) as {
            error?: { message?: string };
          } | null;
          throw new Error(response.status === 404 ? MESSAGES.unavailable : (body?.error?.message ?? MESSAGES.failed));
        }
        confirmed.current[kind] = on;
      } catch (error) {
        // Put back what the server has, and stop: the member can tap again.
        wanted.current[kind] = confirmed.current[kind];
        setState((current) => ({
          ...current,
          [kind]: confirmed.current[kind],
        }));
        // A TypeError means no response arrived.
        setMessage(error instanceof Error && !(error instanceof TypeError) ? error.message : MESSAGES.failed);
      }
    }
    busy.current[kind] = false;
    // A save the server confirmed gets a toast with the way to the list; likes stay quiet.
    if (kind === "save" && confirmed.current.save !== before) {
      toast(confirmed.current.save ? { text: "Saved", action: { label: "View saved", href: "/saved" } } : { text: "Removed from saved" });
    }
  }

  function toggle(kind: Kind) {
    const on = !wanted.current[kind];
    wanted.current[kind] = on;
    setState((current) => ({ ...current, [kind]: on }));
    setMessage("");
    if (!busy.current[kind]) void send(kind);
  }

  return (
    <div className={cx("flex gap-2", className ?? "relative")}>
      <button
        type="button"
        className={button}
        aria-pressed={state.like}
        aria-label={`Like ${title}`}
        onClick={() => toggle("like")}
      >
        <Heart aria-hidden="true" className={cx(icon, state.like && "fill-state-danger text-state-danger")} />
      </button>
      <button
        type="button"
        className={button}
        aria-pressed={state.save}
        aria-label={`Save ${title}`}
        onClick={() => toggle("save")}
      >
        <Bookmark aria-hidden="true" className={cx(icon, state.save && "fill-accent-primary text-accent-primary")} />
      </button>
      <p
        role="status"
        className={cx(
          "absolute top-full right-0 mt-2 w-56 rounded-md bg-bg-inverse px-3 py-2 text-caption text-text-on-inverse shadow-lg",
          !message && "sr-only",
        )}
      >
        {message}
      </p>
    </div>
  );
}
