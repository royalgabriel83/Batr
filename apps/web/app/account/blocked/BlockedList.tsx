"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button, FormAlert, MemberInitial, toast } from "@/components/ui";
import { apiRequest } from "@/lib/offers/api-client";
import { formatWhen } from "@/lib/proposals/terms";
import type { BlockedMemberView } from "@/server/api/safety";

/** S2: unblocking restores proposing, messaging and Explore; declined proposals stay declined. */
export function BlockedList({ blocks }: { blocks: BlockedMemberView[] }) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function unblock(block: BlockedMemberView) {
    setBusy(block.id);
    setError(null);
    const result = await apiRequest<{ unblocked: true }>(`/api/v1/blocks/${block.id}`, { method: "DELETE" });
    setBusy(null);
    if (!result.ok) {
      setError(result.error.message);
      return;
    }
    toast({ text: `You unblocked ${block.display_name}.` });
    router.refresh();
  }

  return (
    <div className="flex flex-col gap-3">
      {error ? <FormAlert tone="danger">{error}</FormAlert> : null}
      <ul className="flex flex-col divide-y divide-border-default rounded-xl border border-border-default bg-bg-surface shadow-card">
        {blocks.map((block) => (
          <li key={block.id} className="flex items-center gap-3 px-5 py-4 md:px-6">
            <MemberInitial name={block.display_name} size="lg" />
            <span className="flex min-w-0 flex-1 flex-col">
              <span className="truncate text-body font-semibold">{block.display_name}</span>
              <span className="text-caption text-text-muted">Blocked {formatWhen(block.created_at)}</span>
            </span>
            <Button variant="secondary" size="sm" loading={busy === block.id} onClick={() => void unblock(block)}>
              Unblock<span className="sr-only"> {block.display_name}</span>
            </Button>
          </li>
        ))}
      </ul>
    </div>
  );
}
