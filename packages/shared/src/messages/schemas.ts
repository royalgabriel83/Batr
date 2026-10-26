import { z } from "zod";
import { MESSAGE_LIMITS } from "./constants.ts";

// Message requests (specs/milestone-5.md, API). The database repeats
// every rule and also checks who may send and whether the thread is
// open.

export const MESSAGE_BODY_MESSAGES = {
  empty: "Write a message first.",
  tooLong: `Keep messages to ${String(MESSAGE_LIMITS.bodyMax)} characters or fewer.`,
} as const;

/** `POST /proposals/:id/messages`. */
export const SendMessageInputSchema = z.strictObject({
  body: z.string().trim().min(1, MESSAGE_BODY_MESSAGES.empty).max(MESSAGE_LIMITS.bodyMax, MESSAGE_BODY_MESSAGES.tooLong),
});
export type SendMessageInput = z.infer<typeof SendMessageInputSchema>;

/** `POST /proposals/:id/messages/read`: the last message the member has seen. */
export const MarkReadInputSchema = z.strictObject({ up_to: z.int().min(0) });
export type MarkReadInput = z.infer<typeof MarkReadInputSchema>;
