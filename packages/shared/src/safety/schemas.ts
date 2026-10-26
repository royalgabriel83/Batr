import { z } from "zod";
import { MODERATION_ACTIONS, PROBLEM_REASON_IDS, REPORT_REASON_IDS, REPORT_SUBJECTS, SAFETY_LIMITS } from "./constants.ts";

// Safety requests (specs/milestone-6.md). The database repeats every
// rule and also checks who may act and what they can see.

const { detailsMax, otherDetailsMin, noteMin, noteMax } = SAFETY_LIMITS;

export const SAFETY_MESSAGES = {
  subject: "Choose what this is about.",
  reason: "Choose a reason.",
  detailsLong: `Keep the details to ${String(detailsMax)} characters or fewer.`,
  detailsNeeded: `Tell us what's wrong in at least ${String(otherDetailsMin)} characters.`,
  note: `Write a note of ${String(noteMin)} to ${String(noteMax)} characters.`,
} as const;

const uuid = z.uuid();

/** `POST /blocks`: the owner of an offer, or the other member of a proposal. */
export const BlockInputSchema = z
  .strictObject({ offer_id: uuid.optional(), proposal_id: uuid.optional() })
  .refine((v) => (v.offer_id === undefined) !== (v.proposal_id === undefined), { message: SAFETY_MESSAGES.subject, path: ["subject"] });
export type BlockInput = z.infer<typeof BlockInputSchema>;

/** `POST /reports`. A member is named through an offer or a proposal, never by id. */
export const ReportInputSchema = z
  .strictObject({
    subject_type: z.enum(REPORT_SUBJECTS),
    offer_id: uuid.optional(),
    proposal_id: uuid.optional(),
    message_id: z.int().min(1).optional(),
    reason: z.enum(REPORT_REASON_IDS as [string, ...string[]], { message: SAFETY_MESSAGES.reason }),
    details: z.string().trim().max(detailsMax, SAFETY_MESSAGES.detailsLong).default(""),
  })
  .superRefine((v, ctx) => {
    const given = { offer: v.offer_id !== undefined, proposal: v.proposal_id !== undefined, message: v.message_id !== undefined };
    const ok =
      v.subject_type === "offer"
        ? given.offer && !given.proposal && !given.message
        : v.subject_type === "member"
          ? given.offer !== given.proposal && !given.message
          : given.message && !given.offer && !given.proposal;
    if (!ok) ctx.addIssue({ code: "custom", message: SAFETY_MESSAGES.subject, path: ["subject"] });
    if (v.reason === "other" && v.details.length < otherDetailsMin) {
      ctx.addIssue({ code: "custom", message: SAFETY_MESSAGES.detailsNeeded, path: ["details"] });
    }
  });
export type ReportInput = z.infer<typeof ReportInputSchema>;

const note = z.string().trim().min(noteMin, SAFETY_MESSAGES.note).max(noteMax, SAFETY_MESSAGES.note);

/** `POST /moderation/reports/:id/actions`. */
export const ModerationActionInputSchema = z.strictObject({
  action: z.enum(MODERATION_ACTIONS),
  note,
  /** Milestone 8, D3: on an exchange problem, warn, suspend or record against the member who reported it. */
  target: z.enum(["reported", "reporter"]).default("reported"),
});
export type ModerationActionInput = z.infer<typeof ModerationActionInputSchema>;

/** `POST /moderation/suspensions/:id/lift`. */
export const LiftSuspensionInputSchema = z.strictObject({ note });
export type LiftSuspensionInput = z.infer<typeof LiftSuspensionInputSchema>;

/** Milestone 8, D1: `POST /agreements/:id/problem`. */
export const ProblemReportInputSchema = z.strictObject({
  reason: z.enum(PROBLEM_REASON_IDS as [string, ...string[]], { message: SAFETY_MESSAGES.reason }),
  details: z
    .string()
    .trim()
    .min(SAFETY_LIMITS.problemDetailsMin, `Tell BATR what happened in at least ${String(SAFETY_LIMITS.problemDetailsMin)} characters.`)
    .max(SAFETY_LIMITS.detailsMax, `Keep it to ${String(SAFETY_LIMITS.detailsMax)} characters.`),
});
export type ProblemReportInput = z.infer<typeof ProblemReportInputSchema>;

/** D2: `POST /agreements/:id/problem/reply`. */
export const ProblemReplyInputSchema = z.strictObject({
  reply: z
    .string()
    .trim()
    .min(1, "Write your side first.")
    .max(SAFETY_LIMITS.problemReplyMax, `Keep it to ${String(SAFETY_LIMITS.problemReplyMax)} characters.`),
});
export type ProblemReplyInput = z.infer<typeof ProblemReplyInputSchema>;

/** W9: `POST /moderation/suspensions/:id/appeal`. */
export const SuspensionAppealInputSchema = z.strictObject({ outcome: z.enum(["upheld", "lifted"]), note });
export type SuspensionAppealInput = z.infer<typeof SuspensionAppealInputSchema>;
