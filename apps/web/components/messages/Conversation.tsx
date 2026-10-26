"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useId, useMemo, useRef, useState, type FormEvent } from "react";
import { RotateCw, Send, ShieldAlert } from "lucide-react";
import { MESSAGE_LIMITS, THREAD_POLL_MS, systemLineText, type SentMessageView, type SystemEvent } from "@batr/shared";
import { Button, FormAlert, Textarea } from "@/components/ui";
import { apiRequest } from "@/lib/offers/api-client";
import { formatWhen } from "@/lib/proposals/terms";
import { ReportDialog } from "@/components/safety/ReportDialog";
import type { MessageView, ThreadView } from "@/server/api/messages";

export interface ConversationProps {
  proposalId: string;
  otherName: string;
  initial: ThreadView;
}

/** A message the member sent from this page that the server hasn't confirmed yet. */
interface Outgoing {
  key: string;
  body: string;
  state: "sending" | "failed";
  error?: string;
}

/**
 * The thread between the two members of a proposal, carried on into
 * their agreement (specs/milestone-5.md, user journey 1–3 and 5). An
 * open page checks for new messages every few seconds while visible,
 * and at once when it regains focus (N1). Links stay plain text (N3).
 * A failed send keeps its idempotency key, so Retry can't duplicate it.
 */
export function Conversation({ proposalId, otherName, initial }: ConversationProps) {
  const id = useId();
  const router = useRouter();
  const base = `/api/v1/proposals/${proposalId}/messages`;
  // Messages from the server render (refreshed after an action on the
  // page, such as an accept) plus those this page fetched or sent since.
  const [received, setReceived] = useState<MessageView[]>([]);
  const messages = useMemo(() => {
    const byId = new Map([...initial.items, ...received].map((m) => [m.id, m]));
    return [...byId.values()].sort((x, y) => x.id - y.id);
  }, [initial.items, received]);
  const [more, setMore] = useState(initial.more);
  const [closedSeen, setClosedSeen] = useState(false);
  const closed = initial.closed || closedSeen;
  const [outgoing, setOutgoing] = useState<Outgoing[]>([]);
  const [draft, setDraft] = useState("");
  const [draftError, setDraftError] = useState<string | null>(null);
  const [warning, setWarning] = useState<string | null>(null);
  const [refusal, setRefusal] = useState<string | null>(null);
  const [loadingEarlier, setLoadingEarlier] = useState(false);
  // The other member's message being reported (milestone-6.md, S3).
  const [reporting, setReporting] = useState<MessageView | null>(null);
  const lastId = useRef(initial.items.at(-1)?.id ?? 0);
  const readUpTo = useRef(0);
  const list = useRef<HTMLOListElement>(null);

  const add = useCallback((items: MessageView[]) => {
    if (items.length === 0) return;
    setReceived((current) => [...current, ...items]);
    lastId.current = Math.max(lastId.current, ...items.map((m) => m.id));
  }, []);

  // Marks what is on screen as read, once per new message.
  const markRead = useCallback(() => {
    if (document.visibilityState !== "visible" || lastId.current <= readUpTo.current) return;
    readUpTo.current = lastId.current;
    void apiRequest<{ unread: number }>(`${base}/read`, { method: "POST", json: { up_to: lastId.current } }).then((result) => {
      // The header's counts come from the server.
      if (result.ok) router.refresh();
    });
  }, [base, router]);

  useEffect(() => {
    lastId.current = Math.max(lastId.current, initial.items.at(-1)?.id ?? 0);
    markRead();
  }, [initial, markRead]);

  useEffect(() => {
    let cancelled = false;
    async function check() {
      if (document.visibilityState !== "visible") return;
      const result = await apiRequest<ThreadView>(`${base}?after=${String(lastId.current)}`);
      if (cancelled || !result.ok) return;
      add(result.data.items);
      if (result.data.closed) setClosedSeen(true);
      markRead();
    }
    const timer = setInterval(() => void check(), THREAD_POLL_MS);
    const onVisible = () => void check();
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("focus", onVisible);
    return () => {
      cancelled = true;
      clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("focus", onVisible);
    };
  }, [base, add, markRead]);

  // Keeps the newest message in view as the thread grows.
  const count = messages.length + outgoing.length;
  useEffect(() => {
    const element = list.current;
    if (element) element.scrollTop = element.scrollHeight;
  }, [count]);

  async function deliver(message: Outgoing) {
    setOutgoing((current) => current.map((m) => (m.key === message.key ? { ...m, state: "sending", error: undefined } : m)));
    const result = await apiRequest<SentMessageView>(base, { method: "POST", json: { body: message.body }, idempotencyKey: message.key });
    if (result.ok) {
      setOutgoing((current) => current.filter((m) => m.key !== message.key));
      const { warning: sentWarning, ...sent } = result.data;
      add([sent]);
      setWarning(sentWarning ?? null);
      return;
    }
    if (result.error.code === "CONTACT_DETAILS") {
      // Not sent (milestone-7-contact-details.md, C5): the text goes back
      // in the box to edit, with the reason.
      setOutgoing((current) => current.filter((m) => m.key !== message.key));
      setDraft((current) => (current.trim() ? current : message.body));
      setDraftError(result.error.message);
      setRefusal(result.error.message);
      return;
    }
    if (result.error.code === "CONFLICT") setClosedSeen(true);
    setOutgoing((current) =>
      current.map((m) => (m.key === message.key ? { ...m, state: "failed", error: result.error.message } : m)),
    );
  }

  function submit(event: FormEvent) {
    event.preventDefault();
    const body = draft.trim();
    if (body.length === 0) {
      setDraftError("Write a message first.");
      return;
    }
    const message: Outgoing = { key: crypto.randomUUID(), body, state: "sending" };
    setOutgoing((current) => [...current, message]);
    setDraft("");
    setDraftError(null);
    setWarning(null);
    setRefusal(null);
    void deliver(message);
  }

  async function loadEarlier() {
    const first = messages[0];
    if (!first) return;
    setLoadingEarlier(true);
    const result = await apiRequest<ThreadView>(`${base}?before=${String(first.id)}`);
    setLoadingEarlier(false);
    if (!result.ok) return;
    setReceived((current) => [...result.data.items, ...current]);
    setMore(result.data.more);
  }

  const talked = messages.some((m) => m.kind === "text") || outgoing.length > 0;

  return (
    <section aria-labelledby={`${id}-heading`} id="messages" className="flex scroll-mt-24 flex-col gap-3">
      <h2 id={`${id}-heading`} className="text-h3">
        Messages
      </h2>
      <div className="flex flex-col overflow-hidden rounded-xl bg-bg-surface shadow-card ring-1 ring-border-default/70">
        <ol
          ref={list}
          aria-label={`Messages with ${otherName}`}
          className="flex max-h-[28rem] min-h-32 flex-col gap-3 overflow-y-auto p-4"
        >
          {more ? (
            <li className="flex justify-center">
              <Button variant="secondary" size="sm" onClick={() => void loadEarlier()} loading={loadingEarlier}>
                Show earlier messages
              </Button>
            </li>
          ) : null}
          {messages.map((message) =>
            message.kind === "system" ? (
              <li key={message.id} className="text-center text-caption text-text-muted">
                {systemLineText(message.event as SystemEvent, message.actor, otherName)}{" "}
                <time dateTime={message.created_at}>{formatWhen(message.created_at)}</time>
              </li>
            ) : (
              <Bubble key={message.id} mine={message.from === "you"} who={message.from === "you" ? "You" : otherName} body={message.body ?? ""}>
                <time dateTime={message.created_at}>{formatWhen(message.created_at)}</time>
                {message.from === "you" ? null : (
                  <>
                    {" · "}
                    <button
                      type="button"
                      onClick={() => setReporting(message)}
                      className="relative font-medium underline-offset-2 before:absolute before:-inset-x-2 before:-inset-y-3.5 before:content-[''] hover:text-text-primary hover:underline"
                    >
                      Report<span className="sr-only"> this message</span>
                    </button>
                  </>
                )}
              </Bubble>
            ),
          )}
          {outgoing.map((message) => (
            <Bubble key={message.key} mine who="You" body={message.body} pending={message.state === "sending"}>
              {message.state === "sending" ? (
                "Sending…"
              ) : (
                <span className="flex flex-wrap items-center justify-end gap-2 text-state-danger">
                  <span>{message.error ?? "Not sent."}</span>
                  {closed ? null : (
                    <button
                      type="button"
                      onClick={() => void deliver(message)}
                      className="inline-flex min-h-11 items-center gap-1 font-semibold underline underline-offset-2"
                    >
                      <RotateCw aria-hidden="true" className="size-3.5" />
                      Retry
                    </button>
                  )}
                </span>
              )}
            </Bubble>
          ))}
        </ol>
        {!talked && !closed ? (
          <p className="px-4 pb-2 text-center text-body-sm text-text-secondary">Say hello to {otherName}.</p>
        ) : null}
        <div className="border-t border-border-default p-4">
          {closed ? (
            <p className="text-body-sm text-text-secondary">This conversation is closed.</p>
          ) : (
            <form onSubmit={submit} className="flex flex-col gap-3">
              <p className="flex items-start gap-2 text-caption text-text-secondary">
                <ShieldAlert aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-text-muted" />
                Keep payments to the agreed terms. BATR never asks for your bank details in a message.
              </p>
              <Textarea
                id={`${id}-draft`}
                label={`Message ${otherName}`}
                rows={2}
                maxLength={MESSAGE_LIMITS.bodyMax}
                value={draft}
                error={draftError ?? undefined}
                onChange={(event) => setDraft(event.target.value)}
              />
              <p aria-live="polite" className="text-body-sm text-text-secondary empty:hidden">
                {warning}
              </p>
              {/* The field shows the reason; this announces it. */}
              <p aria-live="assertive" className="sr-only">
                {refusal}
              </p>
              <div className="flex justify-end">
                <Button type="submit" icon={<Send aria-hidden="true" className="size-4" />}>
                  Send
                </Button>
              </div>
            </form>
          )}
        </div>
      </div>
      {reporting ? (
        <ReportDialog
          open
          target={{ subject_type: "message", message_id: reporting.id }}
          about={`From ${otherName}: “${(reporting.body ?? "").slice(0, 80)}${(reporting.body ?? "").length > 80 ? "…" : ""}”`}
          onClose={() => setReporting(null)}
        />
      ) : null}
      {closed && outgoing.some((m) => m.state === "failed") ? (
        <FormAlert tone="info">Messages that weren&apos;t sent stay on this page only.</FormAlert>
      ) : null}
    </section>
  );
}

function Bubble({
  mine,
  who,
  body,
  pending = false,
  children,
}: {
  mine: boolean;
  who: string;
  body: string;
  pending?: boolean;
  children: React.ReactNode;
}) {
  return (
    <li className={mine ? "flex flex-col items-end" : "flex flex-col items-start"}>
      <span className="sr-only">{who}:</span>
      <p
        className={
          (mine
            ? "rounded-xl rounded-br-sm bg-accent-soft text-text-primary"
            : "rounded-xl rounded-bl-sm bg-bg-subtle text-text-primary ring-1 ring-border-default/70") +
          " max-w-[85%] px-3.5 py-2 text-body-sm break-words whitespace-pre-wrap" +
          (pending ? " opacity-70" : "")
        }
      >
        {body}
      </p>
      <span className="mt-1 text-caption text-text-muted">{children}</span>
    </li>
  );
}
