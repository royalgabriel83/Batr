import { CircleCheck, Clock, UserCheck } from "lucide-react";
import type { CaseRisk, CaseStatus, StatusTone } from "@batr/shared";
import type { LoggedAction } from "@/server/api/safety";

/** What a case points to, as a short label (milestone-6.md, S3; milestone 8, W1). */
export const SUBJECT_LABELS = { offer: "Offer", member: "Member", message: "Message", agreement: "Exchange problem" } as const;

/** Moderator actions as the case log shows them (S5, W4, W6, D3, W9). */
export const ACTION_LABELS: Record<LoggedAction, string> = {
  dismiss: "Dismissed the report",
  remove_offer: "Removed the offer",
  suspend: "Suspended the member",
  unsuspend: "Lifted the suspension",
  assign: "Took the case",
  warn: "Warned the member",
  resume: "Resumed the agreement",
  cancel_agreement: "Cancelled the agreement",
  record_breach: "Recorded that a member didn't keep to the agreement",
  appeal_upheld: "Appeal decided: suspension kept",
  appeal_lifted: "Appeal decided: suspension lifted",
};

/** W2: risk orders the queue; it never acts on its own. */
export const RISK_LABELS: Record<CaseRisk, { label: string; tone: StatusTone }> = {
  high: { label: "High risk", tone: "warning" },
  medium: { label: "Medium risk", tone: "info" },
  low: { label: "Low risk", tone: "neutral" },
};

export const STATUS_ICONS = { open: Clock, in_review: UserCheck, closed: CircleCheck } as const;

export const STATUS_TONES: Record<CaseStatus, StatusTone> = { open: "info", in_review: "warning", closed: "success" };
