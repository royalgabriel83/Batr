import { VALUATION_EVENT_LABELS } from "@batr/shared";
import type { HistoryView } from "@/lib/valuation/types";

const timeFormat = new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", timeZone: "Africa/Lagos" });

/** The valuation's history, oldest first. Members see who acted as "You" or "BATR". */
export function HistoryList({ history }: { history: HistoryView[] }) {
  if (history.length === 0) return null;
  return (
    <ol className="flex flex-col gap-3 border-l border-border-default pl-4">
      {history.map((event, index) => (
        <li key={`${event.created_at}-${String(index)}`} className="relative text-body-sm">
          <span aria-hidden="true" className="absolute top-1.5 -left-[1.3rem] size-2 rounded-full bg-accent-primary" />
          <p className="font-medium">
            {VALUATION_EVENT_LABELS[event.action] ?? event.action}
            {event.internal ? <span className="ml-2 text-caption font-normal text-text-muted">(staff only)</span> : null}
          </p>
          <p className="text-caption text-text-muted">
            {event.actor_name ?? (event.by === "you" ? "You" : "BATR")} · <time dateTime={event.created_at}>{timeFormat.format(new Date(event.created_at))}</time>
          </p>
        </li>
      ))}
    </ol>
  );
}
