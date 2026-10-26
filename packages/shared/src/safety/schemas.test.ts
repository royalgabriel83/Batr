import { describe, expect, it } from "vitest";
import { REPORT_REASON_LABELS } from "./constants.ts";
import {
  BlockInputSchema,
  LiftSuspensionInputSchema,
  ModerationActionInputSchema,
  ProblemReplyInputSchema,
  ProblemReportInputSchema,
  ReportInputSchema,
  SAFETY_MESSAGES,
  SuspensionAppealInputSchema,
} from "./schemas.ts";

const id = "6f1c2a4e-8b1d-4c3e-9f2a-1b2c3d4e5f60";
const issues = (result: { error?: { issues: { message: string; path: PropertyKey[] }[] } }) =>
  result.error?.issues.map((i) => [i.path.join("."), i.message]);

describe("BlockInputSchema", () => {
  it("takes exactly one of an offer or a proposal", () => {
    expect(BlockInputSchema.parse({ offer_id: id })).toEqual({ offer_id: id });
    expect(BlockInputSchema.parse({ proposal_id: id })).toEqual({ proposal_id: id });
    expect(issues(BlockInputSchema.safeParse({}))).toEqual([["subject", SAFETY_MESSAGES.subject]]);
    expect(BlockInputSchema.safeParse({ offer_id: id, proposal_id: id }).success).toBe(false);
    expect(BlockInputSchema.safeParse({ member_id: id }).success).toBe(false);
  });
});

describe("ReportInputSchema", () => {
  it("accepts an offer, a member through an offer or proposal, or a message", () => {
    expect(ReportInputSchema.parse({ subject_type: "offer", offer_id: id, reason: "scam" })).toEqual({
      subject_type: "offer", offer_id: id, reason: "scam", details: "",
    });
    expect(ReportInputSchema.safeParse({ subject_type: "member", proposal_id: id, reason: "harassment" }).success).toBe(true);
    expect(ReportInputSchema.safeParse({ subject_type: "member", offer_id: id, reason: "spam" }).success).toBe(true);
    expect(ReportInputSchema.safeParse({ subject_type: "message", message_id: 4, reason: "spam", details: "  x  " }).data?.details).toBe("x");
  });

  it("refuses a subject that doesn't match its type", () => {
    for (const body of [
      { subject_type: "offer", proposal_id: id },
      { subject_type: "member", offer_id: id, proposal_id: id },
      { subject_type: "member", message_id: 3 },
      { subject_type: "message", offer_id: id },
    ]) {
      expect(issues(ReportInputSchema.safeParse({ ...body, reason: "spam" }))).toEqual([["subject", SAFETY_MESSAGES.subject]]);
    }
  });

  it("needs a reason, and details for Something else", () => {
    expect(issues(ReportInputSchema.safeParse({ subject_type: "offer", offer_id: id, reason: "rude" }))).toEqual([["reason", SAFETY_MESSAGES.reason]]);
    expect(issues(ReportInputSchema.safeParse({ subject_type: "offer", offer_id: id, reason: "other", details: "bad" }))).toEqual([
      ["details", SAFETY_MESSAGES.detailsNeeded],
    ]);
    expect(issues(ReportInputSchema.safeParse({ subject_type: "offer", offer_id: id, reason: "spam", details: "x".repeat(1001) }))).toEqual([
      ["details", SAFETY_MESSAGES.detailsLong],
    ]);
    expect(REPORT_REASON_LABELS.other).toBe("Something else");
  });
});

describe("moderation inputs", () => {
  it("need an action and a note of 10 to 1000 characters", () => {
    expect(ModerationActionInputSchema.parse({ action: "dismiss", note: "  Not against the rules.  " })).toEqual({
      action: "dismiss", note: "Not against the rules.", target: "reported",
    });
    // Milestone 8, D3: an exchange outcome can name the member who reported it.
    expect(ModerationActionInputSchema.parse({ action: "warn", note: "Didn't turn up twice.", target: "reporter" }).target).toBe("reporter");
    expect(ModerationActionInputSchema.safeParse({ action: "warn", note: "x".repeat(20), target: "someone" }).success).toBe(false);
    expect(issues(ModerationActionInputSchema.safeParse({ action: "suspend", note: "short" }))).toEqual([["note", SAFETY_MESSAGES.note]]);
    expect(ModerationActionInputSchema.safeParse({ action: "ban", note: "x".repeat(20) }).success).toBe(false);
    expect(LiftSuspensionInputSchema.safeParse({ note: "x".repeat(1001) }).success).toBe(false);
  });

  it("record an appeal as upheld or lifted, with a note (W9)", () => {
    expect(SuspensionAppealInputSchema.safeParse({ outcome: "lifted", note: "Reviewed the email appeal." }).success).toBe(true);
    expect(SuspensionAppealInputSchema.safeParse({ outcome: "maybe", note: "Reviewed the email appeal." }).success).toBe(false);
  });
});

describe("exchange problem inputs (milestone 8, D1 and D2)", () => {
  it("need a listed reason and 20 or more characters of details", () => {
    expect(ProblemReportInputSchema.safeParse({ reason: "no_show", details: "They didn't come to Ikeja at 4pm." }).success).toBe(true);
    expect(ProblemReportInputSchema.safeParse({ reason: "no_show", details: "Didn't come" }).error?.issues.map((issue) => issue.path[0])).toEqual(["details"]);
    expect(ProblemReportInputSchema.safeParse({ reason: "spam", details: "x".repeat(30) }).success).toBe(false);
  });

  it("take one reply of up to 1000 characters", () => {
    expect(ProblemReplyInputSchema.safeParse({ reply: "I waited an hour." }).success).toBe(true);
    expect(ProblemReplyInputSchema.safeParse({ reply: "   " }).success).toBe(false);
    expect(ProblemReplyInputSchema.safeParse({ reply: "x".repeat(1001) }).success).toBe(false);
  });
});
