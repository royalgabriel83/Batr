import { z } from "zod";

// Branded ids so an offer id cannot be passed where a member id is
// expected (context/code-standards.md, TypeScript).
export const OfferIdSchema = z.uuid().brand<"OfferId">();
export type OfferId = z.infer<typeof OfferIdSchema>;

export const MemberIdSchema = z.uuid().brand<"MemberId">();
export type MemberId = z.infer<typeof MemberIdSchema>;

export const PhotoIdSchema = z.uuid().brand<"PhotoId">();
export type PhotoId = z.infer<typeof PhotoIdSchema>;
