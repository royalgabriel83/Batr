import { OFFER_ITEM_CATEGORIES } from "../offers/constants.ts";

// Reference lists for structured valuation (owner, 2026-10-17). They
// mirror the private reference tables in
// supabase/migrations/20261017000400_valuation.sql (parity test).

export const COMPONENT_KINDS = {
  goods: "Physical goods",
  service: "Service",
  skill: "Skill",
} as const;
export type ComponentKind = keyof typeof COMPONENT_KINDS;
export const COMPONENT_KIND_IDS = Object.keys(COMPONENT_KINDS) as [ComponentKind, ...ComponentKind[]];

/** Goods use the offer categories; services and skills share one list. */
export const GOODS_CATEGORIES = OFFER_ITEM_CATEGORIES;
export const SERVICE_CATEGORIES = {
  home_repair: "Home repair and maintenance",
  beauty_wellness: "Beauty and wellness",
  tutoring: "Tutoring and lessons",
  design_creative: "Design and creative",
  tech_digital: "Tech and digital",
  events: "Events and catering",
  transport: "Transport and moving",
  professional: "Professional services",
  other: "Other",
} as const;
export type ServiceCategory = keyof typeof SERVICE_CATEGORIES;

export function categoriesFor(kind: ComponentKind): Record<string, string> {
  return kind === "goods" ? GOODS_CATEGORIES : SERVICE_CATEGORIES;
}

/** Consistent condition grades. A grade is the member's declaration, never proof that an item works. */
export const VALUATION_CONDITIONS = {
  new_unused: "New or unused",
  excellent: "Excellent: minimal signs of use",
  good: "Good: normal signs of use",
  fair: "Fair: visible wear or limitations",
  poor: "Poor: significant wear, defects or repair needed",
  for_parts: "For parts or repair: not fully working",
  unknown: "Unknown or not assessed",
} as const;
export type ValuationCondition = keyof typeof VALUATION_CONDITIONS;

export const GOODS_STATUSES = { new: "New", used: "Used", refurbished: "Refurbished", repaired: "Repaired" } as const;
export const FUNCTIONAL_STATUSES = {
  working: "Fully working",
  partly_working: "Partly working",
  not_working: "Not working",
  untested: "Not tested",
} as const;
export const COMPLEXITY_LEVELS = { basic: "Basic", standard: "Standard", complex: "Complex" } as const;
export const RECURRENCES = { one_off: "One-off", weekly: "Weekly", fortnightly: "Every two weeks", monthly: "Monthly" } as const;

export const EVIDENCE_KINDS = {
  photo: "Photo of the item",
  receipt: "Receipt",
  invoice: "Invoice",
  warranty: "Warranty",
  repair_record: "Repair record",
  portfolio: "Portfolio sample",
  supporting_document: "Supporting document",
} as const;
export type EvidenceKind = keyof typeof EVIDENCE_KINDS;
/** Kept private to the member and BATR reviewers even when photos are later shared with the other party. */
export const SENSITIVE_EVIDENCE_KINDS: readonly EvidenceKind[] = ["receipt", "invoice", "warranty", "repair_record", "supporting_document"];

export const EVIDENCE_LIMITS = {
  maxBytes: 10 * 1024 * 1024,
  maxPerSubmission: 30,
  mimeTypes: ["image/jpeg", "image/png", "image/webp", "application/pdf"],
  /** Goods need the actual item from more than one angle. */
  minPhotosPerGoods: 2,
} as const;

export const SUBMISSION_STATUSES = {
  draft: "Draft",
  submitted: "Waiting for review",
  evidence_requested: "More information requested",
  inspection_required: "Inspection required",
  assessed: "Assessed",
  appealed: "Appeal in progress",
  not_approved: "Not approved",
  withdrawn: "Withdrawn",
} as const;
export type SubmissionStatus = keyof typeof SUBMISSION_STATUSES;

export const COMPARISON_PRICE_KINDS = {
  asking: "Asking price",
  sold: "Verified sale price",
  quoted_rate: "Quoted service rate",
  other: "Other",
} as const;
export const ADJUSTMENT_FACTORS = {
  age: "Age",
  condition: "Condition",
  defects: "Defects",
  quantity: "Quantity",
  completeness: "Completeness",
  scope: "Service scope",
  other: "Other",
} as const;
export type AdjustmentFactor = keyof typeof ADJUSTMENT_FACTORS;

export const ASSESSMENT_OUTCOMES = {
  approved: "Value approved",
  evidence_required: "More evidence required",
  inspection_required: "Physical inspection required",
  not_approved: "Not approved under the policy",
} as const;
export type AssessmentOutcome = keyof typeof ASSESSMENT_OUTCOMES;

export const APPEAL_OUTCOMES = {
  upheld: "Valuation upheld",
  revised: "Valuation revised",
  evidence_required: "More evidence required",
  inspection_required: "Physical inspection required",
  not_approved: "Assessment withdrawn: not approved under the policy",
} as const;
export type AppealOutcome = keyof typeof APPEAL_OUTCOMES;

export const CONFIDENCE_LEVELS = { low: "Low", medium: "Medium", high: "High" } as const;
export type ConfidenceLevel = keyof typeof CONFIDENCE_LEVELS;

export const VALUATION_POLICY = {
  version: "valuation-2026-10-18b",
  /**
   * Above this proposed or assessed value, approval needs a completed
   * physical inspection. Not set: the owner has not decided a launch
   * threshold, so no value requires inspection automatically and
   * reviewers decide case by case.
   */
  inspectionThresholdKobo: null as number | null,
  /**
   * Appeals per valuation (owner, 2026-10-18). Each goes to a reviewer
   * who made none of the appealed decisions; the last one is final.
   */
  appealsMax: 2,
  /**
   * PDF documents are refused until malware scanning is integrated and
   * tested (owner, 2026-10-18). Images stay available.
   */
  pdfUploadsEnabled: false,
} as const;

export const VALUATION_LIMITS = {
  /** ₦1 trillion: well inside exact integer range in JavaScript and Postgres bigint. */
  koboMax: 100_000_000_000_000,
  componentsMax: 10,
  descriptionMinToSubmit: 10,
  /** Signed links to evidence expire after this many seconds. */
  evidenceLinkSeconds: 120,
} as const;

const STATUS_TONES = {
  draft: "neutral",
  submitted: "info",
  evidence_requested: "warning",
  inspection_required: "warning",
  assessed: "success",
  appealed: "info",
  not_approved: "danger",
  withdrawn: "neutral",
} as const;

/** The badge label and tone for a valuation status. */
export function valuationStatusLabel(status: SubmissionStatus): { label: string; tone: (typeof STATUS_TONES)[SubmissionStatus] } {
  return { label: SUBMISSION_STATUSES[status], tone: STATUS_TONES[status] };
}

/** What each recorded event means, for the history list. */
export const VALUATION_EVENT_LABELS: Record<string, string> = {
  created: "Valuation started",
  edited: "Details changed",
  evidence_added: "Evidence added",
  submitted: "Sent for review",
  resubmitted: "Sent back with more information",
  decided: "BATR made a decision",
  inspection_schedule: "Inspection scheduled",
  inspection_complete: "Inspection completed",
  inspection_cancel: "Inspection cancelled",
  appealed: "Appeal sent",
  appeal_assigned: "Appeal taken by a reviewer",
  appeal_decided: "Appeal decided",
  withdrawn: "Withdrawn",
  comparison_added: "Comparison recorded",
  comparison_excluded: "Comparison excluded",
  comparison_included: "Comparison included again",
};

/** BATR's latest approved value of an offer, as the offer page shows it. */
export interface ValuationSummaryView {
  total_noncash_kobo: number;
  confidence: ConfidenceLevel;
  inspected: boolean;
  assessed_at: string;
}

/**
 * `GET /api/v1/offers/:id/assessment`: signed-in members get the
 * summary; signed-out visitors learn only whether BATR assessed the
 * offer (owner, 2026-10-18).
 */
export interface OfferAssessmentView {
  assessed: boolean;
  summary: ValuationSummaryView | null;
}
