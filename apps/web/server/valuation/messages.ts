import { EVIDENCE_LIMITS, EVIDENCE_MESSAGES, VALUATION_LIMITS } from "@batr/shared";

// Messages for the reasons the valuation database functions report
// (supabase/migrations/20261017000400_valuation.sql), by field.

const BY_REASON: Record<string, string> = {
  required: "Answer this before sending.",
  invalid: "This value isn't valid.",
  too_long: "This is too long.",
  too_short: `Describe it in at least ${String(VALUATION_LIMITS.descriptionMinToSubmit)} characters.`,
  not_applicable: "This question doesn't apply.",
  too_many: "There are too many.",
  duplicate: "Each item can appear only once.",
  file_missing: "The upload didn't finish. Try again.",
};

const BY_FIELD: Record<string, Record<string, string>> = {
  declaration: { required: "Confirm that the information is accurate." },
  components: {
    required: "Add at least one item, service or skill.",
    not_allowed: "A cash-only exchange has no goods, services or skills to value.",
    invalid: "Give a value for every item.",
  },
  cash_component_kobo: {
    required: "Enter the cash amount.",
    not_allowed: "A pure barter has no cash. Choose barter plus cash instead.",
  },
  photos: { too_few: `Add at least ${String(EVIDENCE_LIMITS.minPhotosPerGoods)} photos of the actual item from different angles.` },
  file: { too_large: EVIDENCE_MESSAGES.tooLarge, too_many: `A valuation can have at most ${String(EVIDENCE_LIMITS.maxPerSubmission)} files.` },
  reason: { invalid: "Explain why in at least 20 characters." },
  note: { repeat_reason_required: "Tell BATR what's new since the earlier valuation, in at least 20 characters." },
  rationale: { required: "Explain the decision in at least 20 characters." },
  message: { required: "Tell the member what you need, in at least 10 characters." },
  findings: { required: "Record the findings in at least 20 characters." },
  exclusion_reason: { required: "Give a reason of at least 5 characters." },
  scheduled_for: { required: "Choose a date and time." },
};

/** `{field: reason}` from the database to `{field: message}`. Item fields are `{itemId}.{field}`. */
export function valuationFieldMessages(fields: unknown): Record<string, string> {
  if (!fields || typeof fields !== "object") return {};
  return Object.fromEntries(
    Object.entries(fields as Record<string, string>).map(([key, reason]) => {
      const field = key.includes(".") ? key.slice(key.indexOf(".") + 1) : key;
      return [key, BY_FIELD[field]?.[reason] ?? BY_REASON[reason] ?? "This value isn't valid."];
    }),
  );
}

export const VALUATION_CONFLICTS: Record<string, string> = {
  stale_revision: "This valuation was changed in another window or device. Refresh to see the latest version.",
  status_changed: "This valuation has moved on. Refresh to see where it is now.",
  valuation_open: "This offer already has a valuation in progress.",
  evidence_kept: "Evidence can't be removed once BATR has seen it.",
  nothing_to_appeal: "A cash-only exchange has no assessment to appeal.",
  repeat_without_change:
    "BATR has already decided a valuation of this item. To send a new one, add new evidence or change the details, and tell BATR what's new.",
  appeal_limit_reached: "This valuation has used both appeals and the last decision is final. To add new evidence, withdraw it and start a new valuation.",
  inspection_pending: "Complete the inspection before approving a value.",
  inspection_required_by_policy: "This value needs a completed physical inspection under the current policy.",
  quote_not_current: "This fee quote has been replaced.",
};

export const VALUATION_FORBIDDEN: Record<string, string> = {
  own_submission: "You can't review your own valuation.",
  appealed_reviewer: "A decision of yours on this valuation was appealed, so other reviewers handle it now.",
  not_assigned: "Take the appeal before deciding it.",
};
