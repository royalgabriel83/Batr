import type {
  AppealOutcome,
  ComponentKind,
  ConfidenceLevel,
  Details,
  EvidenceKind,
  ExchangeType,
  OfferStatus,
  SubmissionStatus,
} from "@batr/shared";

// What the valuation API returns (supabase/migrations/20261017000400_valuation.sql:
// private.valuation_member_json and private.valuation_review_json).

export interface ValuationComponentView {
  id: string;
  kind: ComponentKind;
  category: string | null;
  subcategory: string;
  description: string;
  quantity: number;
  unit: string;
  proposed_value_kobo: number | null;
  details: Details;
}

export interface EvidenceView {
  id: string;
  kind: EvidenceKind;
  component_id: string | null;
  mime: string;
  size_bytes: number;
  sensitive: boolean;
  created_at: string;
}

export interface RequestView {
  id: string;
  message: string;
  created_at: string;
  responded_at: string | null;
  response_note: string | null;
}

export interface InspectionView {
  id: string;
  status: "requested" | "scheduled" | "completed" | "cancelled";
  reason: string;
  scheduled_for: string | null;
  arrangements: string;
  findings: string;
  condition_confirmed: string | null;
  completed_at: string | null;
  cancelled_reason: string | null;
  created_at: string;
  inspector_name?: string | null;
}

export interface ComparisonView {
  id: string;
  component_id: string | null;
  source: string;
  url: string;
  observed_on: string;
  price_kind: string;
  price_kobo: number;
  adjustments: { factor: string; percent_bp: number; note: string }[];
  adjusted_kobo: number;
  condition: string;
  characteristics: string;
  excluded?: boolean;
  exclusion_reason?: string | null;
  reviewer_name?: string;
}

export interface AssessmentView {
  id: string;
  version: number;
  outcome: "approved" | "not_approved";
  components: { component_id: string; value_kobo: number }[];
  total_noncash_kobo: number;
  rationale: string;
  confidence: ConfidenceLevel;
  limitations: string;
  message: string;
  appeal_id: string | null;
  inspected?: boolean;
  inspection_id?: string | null;
  policy_version: string;
  created_at: string;
  reviewer_name?: string;
}

export interface AppealView {
  id: string;
  /** 1 or 2: `number` in the member view, `appeal_number` in the staff view. */
  number?: number;
  appeal_number?: number;
  assessment_id: string;
  reason: string;
  status: "open" | "assigned" | "decided" | "withdrawn";
  outcome: AppealOutcome | null;
  decision_rationale: string | null;
  decided_at: string | null;
  created_at: string;
  excluded_reviewer_id?: string;
  assigned_reviewer_id?: string | null;
  assigned_reviewer_name?: string | null;
}

/** The earlier valuation BATR decided that this one repeats. */
export interface RepeatView {
  id: string;
  status: SubmissionStatus;
  same_offer: boolean;
  outcome: "approved" | "not_approved" | null;
  appeals_used: number;
  /** Both appeals were used and decided. */
  final: boolean;
}

export interface FeeQuoteView {
  id: string;
  exchange_type: ExchangeType;
  assessed_noncash_kobo: number;
  cash_kobo: number;
  fee_basis_kobo: number;
  fee_bp: number;
  total_fee_kobo: number;
  party_a_share_kobo: number;
  party_b_share_kobo: number;
  currency: string;
  policy_version: string;
  requires_reconfirmation: boolean;
  created_at: string;
  status?: "current" | "superseded" | "void";
}

export interface HistoryView {
  action: string;
  from_status: string | null;
  to_status: string | null;
  created_at: string;
  by?: "you" | "batr";
  actor_role?: string;
  actor_name?: string;
  internal?: boolean;
  detail?: Record<string, unknown>;
}

export interface MemberValuation {
  id: string;
  offer_id: string;
  offer: { title: string; status: OfferStatus };
  exchange_type: ExchangeType;
  cash_component_kobo: number;
  status: SubmissionStatus;
  revision: number;
  declaration_accepted_at: string | null;
  submitted_at: string | null;
  policy_version: string;
  created_at: string;
  updated_at: string;
  components: ValuationComponentView[];
  evidence: EvidenceView[];
  requests: RequestView[];
  inspections: InspectionView[];
  comparisons: ComparisonView[];
  assessments: AssessmentView[];
  appeals: AppealView[];
  /** Appeals allowed per valuation under the current policy (two at launch). */
  appeal_limit: number;
  appeals_remaining: number;
  /** Set when this valuation repeats an earlier decided one (computed live for a draft). */
  repeat_of: RepeatView | null;
  repeat_reason: string | null;
  fee_quote: FeeQuoteView | null;
  history: HistoryView[];
}

export interface ReviewValuation extends Omit<MemberValuation, "offer"> {
  offer: {
    title: string;
    status: OfferStatus;
    description: string;
    offering_text: string;
    wants_text: string;
    category: string | null;
    condition: string | null;
  };
  submitter: { id: string; display_name: string };
  notes: { id: string; body: string; author_name: string; created_at: string }[];
  fee_quotes: FeeQuoteView[];
  inspection_threshold_kobo: number | null;
  viewer: { id: string; reviewer: boolean; inspector: boolean; excluded: boolean };
}

export interface QueueRow {
  id: string;
  status: SubmissionStatus;
  exchange_type: ExchangeType;
  submitted_at: string | null;
  updated_at: string;
  offer_title: string;
  submitter_name: string;
  components: number;
  proposed_total_kobo: number;
  open_appeal: boolean;
  appeal_assigned_to_me: boolean;
  open_inspection: boolean;
}
