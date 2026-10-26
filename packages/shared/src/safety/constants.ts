// Blocking, reports and moderation (specs/milestone-6.md, S1–S10). The
// database repeats these (private.safety_limits, private.report_reasons
// and the checks on reports and moderation_actions; parity.db.test.ts).

export const SAFETY_LIMITS = {
  /** S10: reports a member may make in a day. */
  reportsPerDay: 10,
  /** S3: characters of report details. */
  detailsMax: 1000,
  /** S3: details needed when the reason is "Something else". */
  otherDetailsMin: 10,
  /** S5: a moderator's note. */
  noteMin: 10,
  noteMax: 1000,
  /** S6: messages shown either side of a reported message. */
  contextMessages: 10,
  /** Milestone 8, D1: details needed to report an exchange problem. */
  problemDetailsMin: 20,
  /** D2: the other member's side. */
  problemReplyMax: 1000,
  /** D5: problems a member may report in 30 days. */
  problemsPer30Days: 3,
  /** D1: days after completion a problem can still be reported. */
  problemDaysAfterCompletion: 14,
  /** W2: reports about a member in 30 days that make a case high risk. */
  repeatReports30Days: 3,
} as const;

/** S3, in the order members see them. */
export const REPORT_REASONS = [
  { id: "prohibited_item", label: "Prohibited item" },
  { id: "scam", label: "Scam or fraud" },
  { id: "harassment", label: "Harassment or abuse" },
  { id: "misleading", label: "Misleading or fake" },
  { id: "spam", label: "Spam" },
  { id: "other", label: "Something else" },
] as const;
export type ReportReason = (typeof REPORT_REASONS)[number]["id"];
export const REPORT_REASON_IDS = REPORT_REASONS.map((r) => r.id) as ReportReason[];
export const REPORT_REASON_LABELS = Object.fromEntries(REPORT_REASONS.map((r) => [r.id, r.label])) as Record<ReportReason, string>;

/** Milestone 8, D1: why a member reports a problem with an exchange, in the order they see them. */
export const PROBLEM_REASONS = [
  { id: "not_as_described", label: "Item not as described" },
  { id: "no_show", label: "The other member didn't show up" },
  { id: "not_received", label: "Not received after I handed over" },
  { id: "safety", label: "Safety concern" },
  { id: "problem_other", label: "Something else" },
] as const;
export type ProblemReason = (typeof PROBLEM_REASONS)[number]["id"];
export const PROBLEM_REASON_IDS = PROBLEM_REASONS.map((r) => r.id) as ProblemReason[];
export const PROBLEM_REASON_LABELS = Object.fromEntries(PROBLEM_REASONS.map((r) => [r.id, r.label])) as Record<ProblemReason, string>;

/** D3: said wherever an exchange problem is shown. BATR never moves money. */
export const PROBLEM_MONEY_NOTE = "BATR records the agreed amount only. It can't return money or items.";

/** What moderators see: the member reasons, problems, and BATR's automatic ones (milestone-7-contact-details.md, C7). */
export const MODERATION_REASON_LABELS = {
  ...REPORT_REASON_LABELS,
  ...PROBLEM_REASON_LABELS,
  contact_details: "Contact details (automatic check)",
} as const;
export type ModerationReason = keyof typeof MODERATION_REASON_LABELS;

export const REPORT_SUBJECTS = ["offer", "member", "message"] as const;
export type ReportSubject = (typeof REPORT_SUBJECTS)[number];
/** Milestone 8: a case can also be an exchange problem, reported from the agreement. */
export const CASE_SUBJECTS = [...REPORT_SUBJECTS, "agreement"] as const;
export type CaseSubject = (typeof CASE_SUBJECTS)[number];

/** S5 and Milestone 8 (W6, D3): what a moderator can do with an open case. */
export const MODERATION_ACTIONS = ["dismiss", "remove_offer", "suspend", "warn", "resume", "cancel_agreement", "record_breach"] as const;

/** W2 and W1: how a case is ranked and where it is. */
export const CASE_RISKS = ["high", "medium", "low"] as const;
export type CaseRisk = (typeof CASE_RISKS)[number];
export const CASE_STATUS_LABELS = { open: "Open", in_review: "In review", closed: "Closed" } as const;
export type CaseStatus = keyof typeof CASE_STATUS_LABELS;
/** "Case 0152". */
export const caseLabel = (n: number): string => `Case ${String(n).padStart(4, "0")}`;

/** W7: the banner a warned member sees once. */
export const WARNING_MESSAGE = "BATR reviewed a report about you. Please follow the rules.";
export type ModerationAction = (typeof MODERATION_ACTIONS)[number];

/** S7: what the reporter sees. */
export const REPORT_STATUS_LABELS = { received: "Received", reviewed: "Reviewed" } as const;

/** What a member is told when a block (S1) or suspension (S8) stops an action. */
export const SAFETY_FORBIDDEN_MESSAGES = {
  suspended: "Your account is limited. You can't publish, propose or message for now.",
  member_unavailable: "This member isn't available.",
} as const;

/**
 * PLACEHOLDER (milestone-6.md, S8): the address a suspended member can
 * write to with questions, on the web and in the app. The owner
 * supplies it; until then the banner says the address is still to come.
 */
export const SAFETY_CONTACT_EMAIL: string | null = null;

/**
 * Milestone 7 (milestone-7-contact-details.md, C5 and C4): what a member
 * is told when text holds contact details. The database decides; these
 * are only the words.
 */
export const CONTACT_DETAILS_MESSAGES = {
  message: "Not sent: phone numbers, emails and chat links can't be shared in BATR. Agree where and when to meet here instead.",
  field: "Phone numbers, emails and chat links can't be shared in BATR. Remove them to continue.",
  display_name: "A name can't include a phone number, email or link.",
  warning: "If that's a phone number, handle or website, please keep your exchange in BATR. Sharing contact details is how most scams start.",
} as const;
