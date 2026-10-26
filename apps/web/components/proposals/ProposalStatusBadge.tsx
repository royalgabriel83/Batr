import {
  CircleCheck,
  CircleDot,
  CircleSlash,
  Clock,
  Undo2,
} from "lucide-react";
import { PROPOSAL_STATUS_LABELS, type ProposalStatus } from "@batr/shared";
import { Badge, type BadgeTone } from "@/components/ui/Badge";

const look: Record<
  ProposalStatus,
  { tone: BadgeTone; Icon: typeof CircleDot }
> = {
  open: { tone: "info", Icon: CircleDot },
  accepted: { tone: "success", Icon: CircleCheck },
  declined: { tone: "danger", Icon: CircleSlash },
  withdrawn: { tone: "neutral", Icon: Undo2 },
  expired: { tone: "warning", Icon: Clock },
};

export function ProposalStatusBadge({ status }: { status: ProposalStatus }) {
  const { tone, Icon } = look[status];
  return (
    <Badge tone={tone} icon={<Icon aria-hidden="true" className="size-3.5" />}>
      {PROPOSAL_STATUS_LABELS[status]}
    </Badge>
  );
}
