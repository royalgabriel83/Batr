import { describe, expect, it } from "vitest";
import { MESSAGE_BODY_MESSAGES, MarkReadInputSchema, SendMessageInputSchema } from "./schemas.ts";

describe("SendMessageInputSchema", () => {
  it("trims the body", () => {
    expect(SendMessageInputSchema.parse({ body: "  Hello  " })).toEqual({ body: "Hello" });
  });

  it("refuses an empty or overlong body, and other fields", () => {
    const empty = SendMessageInputSchema.safeParse({ body: "   " });
    expect(empty.error?.issues[0]?.message).toBe(MESSAGE_BODY_MESSAGES.empty);
    const long = SendMessageInputSchema.safeParse({ body: "x".repeat(2001) });
    expect(long.error?.issues[0]?.message).toBe(MESSAGE_BODY_MESSAGES.tooLong);
    expect(SendMessageInputSchema.safeParse({ body: "Hi", photo: "x" }).success).toBe(false);
    expect(SendMessageInputSchema.safeParse({ body: "x".repeat(2000) }).success).toBe(true);
  });
});

describe("MarkReadInputSchema", () => {
  it("takes the id of the last message seen", () => {
    expect(MarkReadInputSchema.parse({ up_to: 12 })).toEqual({ up_to: 12 });
    expect(MarkReadInputSchema.safeParse({ up_to: -1 }).success).toBe(false);
    expect(MarkReadInputSchema.safeParse({}).success).toBe(false);
  });
});
