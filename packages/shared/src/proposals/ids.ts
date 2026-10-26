import { z } from "zod";

export const ProposalIdSchema = z.uuid().brand<"ProposalId">();
export type ProposalId = z.infer<typeof ProposalIdSchema>;

export const RevisionIdSchema = z.uuid().brand<"RevisionId">();
export type RevisionId = z.infer<typeof RevisionIdSchema>;

export const AgreementIdSchema = z.uuid().brand<"AgreementId">();
export type AgreementId = z.infer<typeof AgreementIdSchema>;
