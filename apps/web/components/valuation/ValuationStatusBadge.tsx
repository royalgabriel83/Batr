import { CircleAlert, CircleCheck, CircleDashed, CircleX, Clock, FileSearch, PencilLine, Scale } from "lucide-react";
import { valuationStatusLabel, type SubmissionStatus } from "@batr/shared";
import { Badge } from "@/components/ui";

const ICONS = {
  draft: <PencilLine />,
  submitted: <Clock />,
  evidence_requested: <CircleAlert />,
  inspection_required: <FileSearch />,
  assessed: <CircleCheck />,
  appealed: <Scale />,
  not_approved: <CircleX />,
  withdrawn: <CircleDashed />,
} as const satisfies Record<SubmissionStatus, React.ReactNode>;

export function ValuationStatusBadge({ status }: { status: SubmissionStatus }) {
  const { label, tone } = valuationStatusLabel(status);
  return (
    <Badge tone={tone} icon={ICONS[status]}>
      {label}
    </Badge>
  );
}
