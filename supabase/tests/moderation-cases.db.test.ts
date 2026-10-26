import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type pg from "pg";
import { connect, createMember, failure, newKey, offerIn, ok, rpc, type Member, type Offer } from "./support/db.ts";

// Milestone 8: the moderation workspace and exchange problems against
// the real database (specs/milestone-8-moderation-and-disputes.md,
// W1–W10, D1–D6 and Acceptance 1–6).

type Case = {
  id: string;
  case_number: number;
  subject_type: string;
  reason: string;
  status: "open" | "in_review" | "closed";
  risk: "high" | "medium" | "low";
  assignee_name: string | null;
  assigned_to_me: boolean;
  member_counts: { reports_30_days: number; earlier_actions: number; breaches: number };
  history: { action: string; note: string }[];
  actions: Record<string, boolean>;
  subject: { agreement?: { status: string; paused: boolean; reply: string | null; reporter_role: string } };
};
type Agreement = {
  id: string;
  status: string;
  binding_version_id: string;
  paused: boolean;
  problem: { can_report: boolean; paused: boolean; current: null | { status: string; reason: string | null; reported_by_you: boolean; can_reply: boolean; replied: boolean } };
};

let db: pg.Client;
let mod: Member;
let senior: Member;

beforeAll(async () => {
  db = await connect();
  [mod, senior] = await Promise.all([createMember("mod"), createMember("senior")]);
  await db.query("insert into private.staff_roles (member_id, role) values ($1, 'moderator'), ($2, 'senior_moderator')", [mod.id, senior.id]);
});
afterAll(async () => {
  await db.end();
});

const terms = (gives: string, gets: string) => ({ gives: [{ kind: "offer", offer_id: gives }], gets: [{ kind: "offer", offer_id: gets }], cash: null, note: "" });
const report = (member: Member, args: Record<string, unknown>) =>
  rpc<{ id: string }>(member.client, "report_create", { p_details: "", ...args, p_idempotency_key: newKey() });
const queue = async (member: Member, args: Record<string, unknown> = {}) => ok(await rpc<Case[]>(member.client, "moderation_queue", args));
const view = async (member: Member, id: string) => ok(await rpc<Case>(member.client, "moderation_report", { p_report_id: id }));
const act = (member: Member, id: string, action: string, note = "Reviewed the case carefully.", target = "reported") =>
  rpc<Case>(member.client, "moderation_act", { p_report_id: id, p_action: action, p_note: note, p_idempotency_key: newKey(), p_target: target });
const getAgreement = async (member: Member, id: string) => ok(await rpc<Agreement>(member.client, "agreement_get", { p_agreement_id: id }));
const problem = (member: Member, id: string, reason = "not_as_described", details = "The lens has a crack that wasn't in the photos.") =>
  rpc<Agreement>(member.client, "agreement_problem_report", { p_agreement_id: id, p_reason: reason, p_details: details, p_idempotency_key: newKey() });

/** B's offer for A's offer, accepted: an active agreement. */
async function agreed(a: Member, b: Member) {
  const [target, mine] = await Promise.all([offerIn(a, "active"), offerIn(b, "active")]);
  const proposal = ok(await rpc<{ id: string; latest_revision_id: string }>(b.client, "proposal_create", { p_offer_id: target.id, p_terms: terms(mine.id, target.id), p_idempotency_key: newKey() }));
  const accepted = ok(await rpc<{ agreement_id: string }>(a.client, "proposal_accept", { p_proposal_id: proposal.id, p_revision_id: proposal.latest_revision_id, p_idempotency_key: newKey() }));
  return { target, mine, proposal, agreement: await getAgreement(a, accepted.agreement_id) };
}

const handover = (member: Member, ag: Agreement) =>
  rpc<Agreement>(member.client, "agreement_handover", { p_agreement_id: ag.id, p_version_id: ag.binding_version_id, p_idempotency_key: newKey() });

describe("the queue (W1–W4)", () => {
  it("puts high risk first, then oldest, and filters and searches", async () => {
    const [a, b] = await Promise.all([createMember("ada"), createMember("bayo")]);
    const [lamp, desk]: [Offer, Offer] = await Promise.all([offerIn(a, "active"), offerIn(a, "active")]);
    const spam = ok(await report(b, { p_subject_type: "offer", p_offer_id: lamp.id, p_reason: "spam" }));
    const scam = ok(await report(b, { p_subject_type: "offer", p_offer_id: desk.id, p_reason: "scam" }));
    const all = await queue(mod);
    const ids = all.map((c) => c.id);
    expect(ids.indexOf(scam.id)).toBeLessThan(ids.indexOf(spam.id));
    const scamCase = all.find((c) => c.id === scam.id) as Case;
    expect(scamCase).toMatchObject({ risk: "high", status: "open", assignee_name: null });
    expect(all.find((c) => c.id === spam.id)?.risk).toBe("low");

    expect((await queue(mod, { p_risk: "low" })).every((c) => c.risk === "low")).toBe(true);
    expect((await queue(mod, { p_type: "member" })).map((c) => c.id)).not.toContain(scam.id);
    // Other tests' offer titles can contain the same digits, so check this case is found and the other isn't.
    for (const search of [String(scamCase.case_number), `Case ${String(scamCase.case_number).padStart(4, "0")}`]) {
      const found = (await queue(mod, { p_search: search })).map((c) => c.id);
      expect(found).toContain(scam.id);
      expect(found).not.toContain(spam.id);
    }
    // A long run of digits (a pasted id) is searched as text, not a case number.
    expect(await queue(mod, { p_search: "6f1c2a4e-8b1d-4c3e-9f2a-1b2c3d4e5f60 99999999999999999999" })).toEqual([]);
    expect(failure(await rpc(mod.client, "moderation_queue", { p_risk: "urgent" })).code).toBe("VALIDATION_FAILED");
  });

  it("assigns a case, lets another moderator take it over, and logs both", async () => {
    const [a, b] = await Promise.all([createMember("ada"), createMember("bayo")]);
    const made = ok(await report(b, { p_subject_type: "member", p_offer_id: (await offerIn(a, "active")).id, p_reason: "harassment" }));
    const taken = ok(await rpc<Case>(mod.client, "moderation_assign", { p_report_id: made.id }));
    expect(taken).toMatchObject({ status: "in_review", assigned_to_me: true, risk: "medium" });
    expect((await queue(mod, { p_assigned: "me" })).map((c) => c.id)).toContain(made.id);
    expect((await queue(senior, { p_assigned: "unassigned" })).map((c) => c.id)).not.toContain(made.id);
    expect((await queue(senior, { p_status: "in_review" })).map((c) => c.id)).toContain(made.id);
    const over = ok(await rpc<Case>(senior.client, "moderation_assign", { p_report_id: made.id }));
    expect(over.history.map((h) => h.action)).toEqual(["assign", "assign"]);
    expect(over.history[0]?.note).toMatch(/^Took over this case from /);
  });
});

describe("a case (W5–W7)", () => {
  it("shows the member's history as counts only, and warns once", async () => {
    const [a, b, c] = await Promise.all([createMember("ada"), createMember("bayo"), createMember("chika")]);
    const offer = await offerIn(a, "active");
    const first = ok(await report(b, { p_subject_type: "member", p_offer_id: offer.id, p_reason: "harassment", p_details: "Secret first details" }));
    ok(await act(mod, first.id, "warn", "First warning about tone."));
    const second = ok(await report(c, { p_subject_type: "member", p_offer_id: offer.id, p_reason: "spam" }));
    const seen = await view(mod, second.id);
    expect(seen.member_counts).toEqual({ reports_30_days: 2, earlier_actions: 1, breaches: 0 });
    expect(seen.history).toEqual([]);
    expect(JSON.stringify(seen)).not.toContain("Secret first details");
    expect(JSON.stringify(seen)).not.toContain("First warning about tone.");
    expect(seen.actions).toMatchObject({ dismiss: true, warn: true, remove_offer: false, resume: false });

    expect(ok(await rpc<{ warned: boolean }>(a.client, "my_safety_status", {})).warned).toBe(true);
    ok(await rpc(a.client, "warning_seen", {}));
    expect(ok(await rpc<{ warned: boolean }>(a.client, "my_safety_status", {})).warned).toBe(false);
  });

  it("refuses an action that doesn't fit the case", async () => {
    const [a, b] = await Promise.all([createMember("ada"), createMember("bayo")]);
    const made = ok(await report(b, { p_subject_type: "offer", p_offer_id: (await offerIn(a, "active")).id, p_reason: "spam" }));
    for (const action of ["warn", "resume", "cancel_agreement", "record_breach"]) {
      expect(failure(await act(mod, made.id, action)).detail).toEqual({ fields: { action: "invalid" } });
    }
    expect(failure(await act(mod, made.id, "suspend", "Reviewed the case carefully.", "reporter")).code).toBe("VALIDATION_FAILED");
  });
});

describe("exchange problems (D1–D6)", () => {
  it("pauses handover and changes for both, takes one reply from the other member, and resumes", async () => {
    const [a, b] = await Promise.all([createMember("ada"), createMember("bayo")]);
    const { agreement, proposal, target, mine } = await agreed(a, b);
    expect(agreement.problem).toMatchObject({ can_report: true, paused: false, current: null });

    expect(failure(await problem(b, agreement.id, "not_as_described", "too short")).detail).toEqual({ fields: { details: "length" } });
    const reported = ok(await problem(b, agreement.id));
    expect(reported.problem).toMatchObject({ can_report: false, paused: true, current: { status: "open", reason: "not_as_described", reported_by_you: true, can_reply: false } });

    const other = await getAgreement(a, agreement.id);
    expect(other.paused).toBe(true);
    expect(other.problem.current).toMatchObject({ reason: null, reported_by_you: false, can_reply: true, replied: false });
    expect(failure(await handover(a, other)).detail).toEqual({ reason: "paused" });
    const change = await rpc(b.client, "agreement_change_propose", {
      p_agreement_id: agreement.id,
      p_expected_version: 1,
      p_terms: { ...terms(mine.id, target.id), cash: { amount_naira: 5000, payer: "proposer" } },
      p_idempotency_key: newKey(),
    });
    expect(failure(change).detail).toEqual({ reason: "paused" });

    // Both are told, without saying who reported it.
    const { rows: lines } = await db.query("select system_event, actor_id from public.messages where proposal_id = $1 and kind = 'system' order by id", [proposal.id]);
    expect(lines.at(-1)).toEqual({ system_event: "agreement.problem_reported", actor_id: null });
    const { rows: notes } = await db.query("select recipient_id from public.notifications where proposal_id = $1 and kind = 'agreement.problem_reported'", [proposal.id]);
    expect(notes.map((n) => n.recipient_id).sort()).toEqual([a.id, b.id].sort());

    expect(failure(await rpc(b.client, "agreement_problem_reply", { p_agreement_id: agreement.id, p_reply: "Mine", p_idempotency_key: newKey() })).detail).toEqual({ reason: "no_problem" });
    ok(await rpc(a.client, "agreement_problem_reply", { p_agreement_id: agreement.id, p_reply: "The crack was shown in photo 3.", p_idempotency_key: newKey() }));
    expect(failure(await rpc(a.client, "agreement_problem_reply", { p_agreement_id: agreement.id, p_reply: "Again", p_idempotency_key: newKey() })).detail).toEqual({ reason: "already_replied" });
    expect(failure(await rpc(a.client, "agreement_problem_reply", { p_agreement_id: agreement.id, p_reply: "call 08031234567", p_idempotency_key: newKey() })).code).toBe("CONFLICT");

    const id = (await db.query("select id from public.reports where agreement_id = $1", [agreement.id])).rows[0].id as string;
    expect((await queue(mod, { p_type: "agreement" })).map((c) => c.id)).toContain(id);
    const seen = await view(mod, id);
    expect(seen).toMatchObject({ risk: "high", subject: { agreement: { paused: true, reply: "The crack was shown in photo 3.", reporter_role: "proposer" } } });
    expect(seen.actions).toMatchObject({ dismiss: false, resume: true, cancel_agreement: true, record_breach: true, warn: true });

    ok(await act(mod, id, "resume", "Photos showed the crack before agreeing."));
    const after = await getAgreement(a, agreement.id);
    expect(after.paused).toBe(false);
    expect(after.problem.current?.status).toBe("reviewed");
    ok(await handover(a, after));
  });

  it("cancels an agreement with a change pending, and records a breach as a count", async () => {
    const [a, b] = await Promise.all([createMember("ada"), createMember("bayo")]);
    const { agreement, target, mine } = await agreed(a, b);
    ok(await rpc(b.client, "agreement_change_propose", {
      p_agreement_id: agreement.id,
      p_expected_version: 1,
      p_terms: { ...terms(mine.id, target.id), cash: { amount_naira: 5000, payer: "proposer" } },
      p_idempotency_key: newKey(),
    }));
    ok(await problem(a, agreement.id, "no_show", "Waited an hour at the gate and nobody came."));
    const id = (await db.query("select id from public.reports where agreement_id = $1", [agreement.id])).rows[0].id as string;
    ok(await act(mod, id, "cancel_agreement", "Proposer didn't show up twice."));
    const after = await getAgreement(b, agreement.id);
    expect(after.status).toBe("cancelled");
    expect(after.paused).toBe(false);
    const { rows } = await db.query("select outcome from public.agreement_versions where agreement_id = $1 order by number", [agreement.id]);
    expect(rows.map((r) => r.outcome)).toEqual(["binding", "withdrawn"]);

    // A breach on a second problem, on a fresh agreement.
    const second = (await agreed(a, b)).agreement;
    ok(await problem(a, second.id, "no_show", "Again nobody came to the agreed place."));
    const id2 = (await db.query("select id from public.reports where agreement_id = $1", [second.id])).rows[0].id as string;
    ok(await act(mod, id2, "record_breach", "Second no-show in a week."));
    const third = (await agreed(a, b)).agreement;
    ok(await problem(a, third.id, "safety", "The other member was aggressive on the phone."));
    const id3 = (await db.query("select id from public.reports where agreement_id = $1", [third.id])).rows[0].id as string;
    expect((await view(mod, id3)).member_counts.breaches).toBe(1);
    // D5: a member reports at most 3 problems in 30 days.
    const fourth = (await agreed(a, b)).agreement;
    expect(failure(await problem(a, fourth.id)).code).toBe("RATE_LIMITED");
  });

  it("allows a problem on a completed agreement for 14 days, never on a cancelled one, and one open at a time", async () => {
    const [a, b] = await Promise.all([createMember("ada"), createMember("bayo")]);
    const { agreement } = await agreed(a, b);
    ok(await handover(a, agreement));
    ok(await handover(b, agreement));
    await db.query("update public.agreements set completed_at = now() - interval '15 days' where id = $1", [agreement.id]);
    expect((await getAgreement(a, agreement.id)).problem.can_report).toBe(false);
    expect(failure(await problem(a, agreement.id)).code).toBe("CONFLICT");
    await db.query("update public.agreements set completed_at = now() - interval '2 days' where id = $1", [agreement.id]);
    const reported = ok(await problem(a, agreement.id, "not_as_described"));
    expect(reported.problem.paused).toBe(false);
    expect(failure(await problem(b, agreement.id)).detail).toEqual({ reason: "already_reported" });
    const { rows } = await db.query("select system_event from public.messages where proposal_id = (select proposal_id from public.agreements where id = $1) and kind = 'system' order by id desc limit 1", [agreement.id]);
    expect(rows[0].system_event).toBe("agreement.problem_reported");

    const mine = ok(await rpc<{ subject_type: string; label: string }[]>(a.client, "my_reports", {}));
    expect(mine[0]).toMatchObject({ subject_type: "agreement", label: expect.stringMatching(/^An exchange on /) });
  });
});

describe("senior moderators (W8, W9)", () => {
  it("only a senior moderator lifts another's suspension or records an appeal", async () => {
    const [a, b] = await Promise.all([createMember("ada"), createMember("bayo")]);
    const made = ok(await report(b, { p_subject_type: "member", p_offer_id: (await offerIn(a, "active")).id, p_reason: "scam" }));
    ok(await act(senior, made.id, "suspend", "Confirmed scam pattern."));
    const sid = (await db.query("select id from public.member_suspensions where member_id = $1 and lifted_at is null", [a.id])).rows[0].id as string;
    const lift = (member: Member) => rpc(member.client, "moderation_unsuspend", { p_suspension_id: sid, p_note: "Spoke with the member.", p_idempotency_key: newKey() });
    expect(failure(await lift(mod)).detail).toEqual({ reason: "senior_only" });
    const appeal = (member: Member, outcome: string) =>
      rpc(member.client, "moderation_record_appeal", { p_suspension_id: sid, p_outcome: outcome, p_note: "Appeal by email reviewed.", p_idempotency_key: newKey() });
    expect(failure(await appeal(mod, "upheld")).detail).toEqual({ reason: "senior_only" });
    ok(await appeal(senior, "upheld"));
    expect(failure(await appeal(senior, "lifted")).detail).toEqual({ reason: "already_decided" });
    ok(await lift(senior));
    const { rows } = await db.query("select action from public.moderation_actions where member_id = $1 order by id", [a.id]);
    expect(rows.map((r) => r.action)).toEqual(["suspend", "appeal_upheld", "unsuspend"]);
  });

  it("members can't open any of it", async () => {
    const a = await createMember("ada");
    for (const [fn, args] of [
      ["moderation_queue", {}],
      ["moderation_assign", { p_report_id: newKey() }],
      ["moderation_record_appeal", { p_suspension_id: newKey(), p_outcome: "upheld", p_note: "xxxxxxxxxxxx", p_idempotency_key: newKey() }],
    ] as const) {
      expect(failure(await rpc(a.client, fn, args)).code).toBe("NOT_FOUND");
    }
    const { error } = await a.client.from("member_warnings").select("*");
    expect(error).not.toBeNull();
  });
});
