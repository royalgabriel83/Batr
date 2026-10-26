import { MessageCircle } from "lucide-react";

/** "2 new messages" on a row (specs/milestone-5.md, N2); nothing at zero. */
export function UnreadCount({ count }: { count: number }) {
  if (count <= 0) return null;
  return (
    <span className="inline-flex items-center gap-1 text-caption font-semibold text-accent-primary">
      <MessageCircle aria-hidden="true" className="size-3.5" />
      {count} new {count === 1 ? "message" : "messages"}
    </span>
  );
}
