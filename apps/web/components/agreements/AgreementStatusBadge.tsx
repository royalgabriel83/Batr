import {
  CircleCheck,
  CircleDot,
  CircleSlash,
  FilePen,
  TriangleAlert,
} from "lucide-react";
import { AGREEMENT_STATUS_LABELS, type AgreementStatus } from "@batr/shared";
import { Badge, type BadgeTone } from "@/components/ui/Badge";

const look: Record<
  AgreementStatus,
  { tone: BadgeTone; Icon: typeof CircleDot }
> = {
  active: { tone: "info", Icon: CircleDot },
  amendment_pending: { tone: "warning", Icon: FilePen },
  cancellation_requested: { tone: "warning", Icon: TriangleAlert },
  completed: { tone: "success", Icon: CircleCheck },
  cancelled: { tone: "neutral", Icon: CircleSlash },
};

export function AgreementStatusBadge({ status }: { status: AgreementStatus }) {
  const { tone, Icon } = look[status];
  return (
    <Badge tone={tone} icon={<Icon aria-hidden="true" className="size-3.5" />}>
      {AGREEMENT_STATUS_LABELS[status]}
    </Badge>
  );
}
