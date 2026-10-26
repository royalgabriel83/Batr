import { CircleCheck, CirclePause, Lock, PencilLine } from "lucide-react";
import { offerStatusLabel, type OfferStatus } from "@batr/shared";
import { Badge } from "@/components/ui";

const ICONS = {
  draft: <PencilLine />,
  active: <CircleCheck />,
  paused: <CirclePause />,
  closed: <Lock />,
} as const satisfies Record<OfferStatus, React.ReactNode>;

/**
 * The offer's status badge; label and tone come from the shared
 * status-label function. A closed offer BATR removed says so
 * (milestone-6.md, S5).
 */
export function OfferStatusBadge({ status, removed = false }: { status: OfferStatus; removed?: boolean }) {
  const { label, tone } = offerStatusLabel(status);
  return (
    <Badge tone={tone} icon={ICONS[status]}>
      {removed && status === "closed" ? "Removed by BATR" : label}
    </Badge>
  );
}
