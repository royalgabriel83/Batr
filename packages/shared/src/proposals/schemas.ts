import { z } from "zod";
import { OfferIdSchema } from "../offers/ids.ts";
import { CASH_PAYERS, PROPOSAL_LIMITS } from "./constants.ts";
import { RevisionIdSchema } from "./ids.ts";

// Terms as a member sends them (specs/milestone-3.md, Rules and
// validation; state-model.md §3). An offer item names the offer only:
// the database adds its content version and snapshot. The database
// repeats every rule and also checks who owns each offer and its status.

const { itemsPerSideMax, textItemMin, textItemMax, noteMax, cashNairaMin, cashNairaMax } = PROPOSAL_LIMITS;

export const ITEM_MESSAGES = {
  textTooShort: `Describe the item in at least ${String(textItemMin)} characters.`,
  textTooLong: `Keep the description to ${String(textItemMax)} characters or fewer.`,
  sideEmpty: "Add at least one item.",
  sideFull: `Add up to ${String(itemsPerSideMax)} items.`,
  duplicate: "Each offer can appear only once.",
  getsOneOffer: "You can ask for this offer only, plus described items.",
  noteTooLong: `Keep the note to ${String(noteMax)} characters or fewer.`,
  cashWhole: "Enter a whole number of naira.",
  cashMin: `Enter at least ₦${cashNairaMin.toLocaleString("en-NG")}.`,
  cashMax: `Enter at most ₦${cashNairaMax.toLocaleString("en-NG")}.`,
  cashPayer: "Choose who pays.",
} as const;

export const OfferItemInputSchema = z.strictObject({ kind: z.literal("offer"), offer_id: OfferIdSchema });
export const TextItemInputSchema = z.strictObject({
  kind: z.literal("text"),
  description: z.string().trim().min(textItemMin, ITEM_MESSAGES.textTooShort).max(textItemMax, ITEM_MESSAGES.textTooLong),
});
export const TermsItemInputSchema = z.discriminatedUnion("kind", [OfferItemInputSchema, TextItemInputSchema]);
export type TermsItemInput = z.infer<typeof TermsItemInputSchema>;

const side = z.array(TermsItemInputSchema).min(1, ITEM_MESSAGES.sideEmpty).max(itemsPerSideMax, ITEM_MESSAGES.sideFull);

export const CashSchema = z.strictObject({
  amount_naira: z.int(ITEM_MESSAGES.cashWhole).min(cashNairaMin, ITEM_MESSAGES.cashMin).max(cashNairaMax, ITEM_MESSAGES.cashMax),
  payer: z.enum(CASH_PAYERS, { error: ITEM_MESSAGES.cashPayer }),
});
export type Cash = z.infer<typeof CashSchema>;

/** The fields of a set of terms; also used by agreement changes. */
export const termsShape = {
  gives: side,
  gets: side,
  cash: CashSchema.nullable().default(null),
  note: z.string().trim().max(noteMax, ITEM_MESSAGES.noteTooLong).default(""),
};

type TermsLike = { gives: TermsItemInput[]; gets: TermsItemInput[] };

/** One offer can appear only once across both sides, and "you get" holds at most one offer (P1). */
export function checkTermsItems(terms: TermsLike, context: z.RefinementCtx) {
  const seen = new Set<string>();
  for (const name of ["gives", "gets"] as const) {
    for (const item of terms[name]) {
      if (item.kind !== "offer") continue;
      if (seen.has(item.offer_id)) context.addIssue({ code: "custom", path: [name], message: ITEM_MESSAGES.duplicate });
      seen.add(item.offer_id);
    }
  }
  if (terms.gets.filter((item) => item.kind === "offer").length > 1) {
    context.addIssue({ code: "custom", path: ["gets"], message: ITEM_MESSAGES.getsOneOffer });
  }
}

export const TermsInputSchema = z.strictObject(termsShape).superRefine(checkTermsItems);
export type TermsInput = z.infer<typeof TermsInputSchema>;

/** `POST /proposals`: the offer and revision 1. */
export const CreateProposalInputSchema = z.strictObject({ offer_id: OfferIdSchema, ...termsShape }).superRefine(checkTermsItems);
export type CreateProposalInput = z.infer<typeof CreateProposalInputSchema>;

/** `POST /proposals/:id/counter`: new terms against the revision the member last saw. */
export const CounterProposalInputSchema = z
  .strictObject({ expected_revision: z.int().min(1), ...termsShape })
  .superRefine(checkTermsItems);
export type CounterProposalInput = z.infer<typeof CounterProposalInputSchema>;

/** `POST /proposals/:id/accept`: the exact revision being accepted. */
export const AcceptProposalInputSchema = z.strictObject({ revision_id: RevisionIdSchema });
export type AcceptProposalInput = z.infer<typeof AcceptProposalInputSchema>;

/** `POST /proposals/:id/decline` and `/withdraw`. */
export const ProposalActionInputSchema = z.strictObject({ expected_revision: z.int().min(1) });
export type ProposalActionInput = z.infer<typeof ProposalActionInputSchema>;

/** Naira as members read it: ₦20,000. */
export function formatNaira(amount: number): string {
  return `₦${amount.toLocaleString("en-NG")}`;
}
