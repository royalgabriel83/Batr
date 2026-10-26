import { z } from "zod";

export const VersionIdSchema = z.uuid().brand<"AgreementVersionId">();
export type VersionId = z.infer<typeof VersionIdSchema>;

export const CancellationRequestIdSchema = z.uuid().brand<"CancellationRequestId">();
export type CancellationRequestId = z.infer<typeof CancellationRequestIdSchema>;
