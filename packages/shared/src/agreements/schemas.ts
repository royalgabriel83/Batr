import { z } from "zod";
import { checkTermsItems, termsShape } from "../proposals/schemas.ts";
import { AGREEMENT_LIMITS } from "./constants.ts";
import { CancellationRequestIdSchema, VersionIdSchema } from "./ids.ts";

// Agreement requests (specs/milestone-4.md, Rules and validation and
// API). Terms follow the proposal rules; the database repeats every
// rule and also checks who may act and which offers may appear.

const { cancelReasonMin, cancelReasonMax } = AGREEMENT_LIMITS;

export const CANCEL_REASON_MESSAGES = {
  tooShort: `Give a reason of at least ${String(cancelReasonMin)} characters.`,
  tooLong: `Keep the reason to ${String(cancelReasonMax)} characters or fewer.`,
} as const;

/** `POST /agreements/:id/handover`: the binding version the member saw. */
export const HandoverInputSchema = z.strictObject({ version_id: VersionIdSchema });
export type HandoverInput = z.infer<typeof HandoverInputSchema>;

/** `POST /agreements/:id/changes`: new terms against the binding version the member saw. */
export const ProposeChangeInputSchema = z
  .strictObject({ expected_version: z.int().min(1), ...termsShape })
  .superRefine(checkTermsItems);
export type ProposeChangeInput = z.infer<typeof ProposeChangeInputSchema>;

/** `POST /agreements/:id/cancellation`. */
export const CancellationInputSchema = z.strictObject({
  reason: z.string().trim().min(cancelReasonMin, CANCEL_REASON_MESSAGES.tooShort).max(cancelReasonMax, CANCEL_REASON_MESSAGES.tooLong),
});
export type CancellationInput = z.infer<typeof CancellationInputSchema>;

/** `POST /agreements/:id/cancellation/accept`, `/reject` and `/withdraw`: the exact request. */
export const CancellationActionInputSchema = z.strictObject({ request_id: CancellationRequestIdSchema });
export type CancellationActionInput = z.infer<typeof CancellationActionInputSchema>;
