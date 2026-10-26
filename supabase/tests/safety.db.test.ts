import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type pg from "pg";
import {
  anonClient,
  connect,
  createMember,
  failure,
  newKey,
  offerIn,
  ok,
  rpc,
  transition,
  type Member,
  type Offer,
} from "./support/db.ts";

// Milestone 6, units 24–26: blocking, reports and moderation against
// the real database (specs/milestone-6.md, S1–S10 and Acceptance
// criteria).

type Proposal = { id: string; status: string; latest_revision_id: string; agreement_id?: string };
type Report = { id: string; status: string };
type Moderation = {
  id: string;
  status: string;
  subject: { offer?: { id: string; status: string; removed_at: string | null }; messages?: { id: number; reported: boolean; from: string | null }[] };
  member_suspended: boolean;
  history: { action: string; note: string }[];
  actions: { dismiss: boolean; remove_offer: boolean; suspend: boolean };
};

let db: pg.Client;
let moderator: Member;

beforeAll(async () => {
  db = await connect();
  moderator = await createMember("mod");
  await db.query("insert into private.staff_roles (member_id, role) values ($1, 'moderator')", [moderator.id]);
});
afterAll(async () => {
  await db.end();
});

const terms = (gives: string, gets: string) => ({
  gives: [{ kind: "offer", offer_id: gives }],
  gets: [{ kind: "offer", offer_id: gets }],
  cash: null,
  note: "",
});
const propose = (from: Member, target: Offer, mine: Offer) =>
  rpc<Proposal>(from.client, "proposal_create", { p_offer_id: target.id, p_terms: terms(mine.id, target.id), p_idempotency_key: newKey() });
const block = (member: Member, args: { p_offer_id?: string; p_proposal_id?: string }) =>
  rpc<{ blocked: boolean; display_name: string }>(member.client, "member_block", { ...args, p_idempotency_key: newKey() });
const report = (member: Member, args: Record<string, unknown>) =>
  rpc<Report>(member.client, "report_create", { p_details: "", ...args, p_idempotency_key: newKey() });
const visible = async (member: Member | null, offerId: string) => {
  const client = member ? member.client : anonClient();
  const { data } = await client.from("offers").select("id").eq("id", offerId);
  return (data ?? []).length === 1;
};
const act = (report: string, action: string, note = "Checked against the rules.") =>
  rpc<Moderation>(moderator.client, "moderation_act", { p_report_id: report, p_action: action, p_note: note, p_idempotency_key: newKey() });

describe("blocking (S1, S2)", () => {
  it("works both ways: no proposals, no messages, offers hidden; open proposals close quietly", async () => {
    const [a, b] = await Promise.all([createMember("ada"), createMember("bayo")]);
    const [camera, bike, lamp] = await Promise.all([offerIn(a, "active"), offerIn(b, "active"), offerIn(a, "active")]);
    const open = ok(await propose(b, camera, bike));
    expect(await visible(b, lamp.id)).toBe(true);

    expect(ok(await block(a, { p_proposal_id: open.id }))).toMatchObject({ blocked: true });
    const { data: rows } = await b.client.from("blocks").select("id");
    expect(rows).toEqual([]);

    const closed = ok(await rpc<Proposal>(b.client, "proposal_get", { p_proposal_id: open.id }));
    expect(closed.status).toBe("declined");
    const thread = ok(await rpc<{ closed: boolean; items: { event: string | null }[] }>(b.client, "message_list", { p_proposal_id: open.id }));
    expect(thread.closed).toBe(true);
    expect(thread.items.at(-1)?.event).toBe("proposal.block_decline");
    // Nobody is told.
    const { data: told } = await b.client.from("notifications").select("kind").eq("proposal_id", open.id);
    expect(told?.map((n) => n.kind)).not.toContain("proposal.block_decline");

    expect(await visible(b, lamp.id)).toBe(false);
    expect(await visible(a, bike.id)).toBe(false);
    expect(await visible(null, lamp.id)).toBe(true);
    for (const [from, target, mine] of [[b, lamp, bike], [a, bike, lamp]] as const) {
      expect(failure(await propose(from, target, mine))).toMatchObject({ status: 403, code: "FORBIDDEN", detail: { reason: "member_unavailable" } });
    }
    expect(failure(await rpc(b.client, "message_send", { p_proposal_id: open.id, p_body: "Hello?", p_idempotency_key: newKey() })).detail).toEqual({ reason: "thread_closed" });

    const list = ok(await rpc<{ id: string; display_name: string }[]>(a.client, "member_blocks", {}));
    expect(list.map((x) => x.display_name)).toEqual([expect.stringContaining("bayo")]);
    expect(failure(await rpc(b.client, "member_unblock", { p_block_id: list[0]?.id })).code).toBe("NOT_FOUND");
    ok(await rpc(a.client, "member_unblock", { p_block_id: list[0]?.id }));
    expect(await visible(b, lamp.id)).toBe(true);
    expect(ok(await rpc<Proposal>(b.client, "proposal_get", { p_proposal_id: open.id })).status).toBe("declined");
    ok(await propose(b, lamp, bike));
  });

  it("leaves an active agreement to be handed over", async () => {
    const [a, b] = await Promise.all([createMember("ada"), createMember("bayo")]);
    const [camera, bike] = await Promise.all([offerIn(a, "active"), offerIn(b, "active")]);
    const open = ok(await propose(b, camera, bike));
    const accepted = ok(await rpc<{ agreement_id: string }>(a.client, "proposal_accept", {
      p_proposal_id: open.id, p_revision_id: open.latest_revision_id, p_idempotency_key: newKey(),
    }));
    ok(await block(b, { p_offer_id: camera.id }));
    const agreement = ok(await rpc<{ binding_version_id: string; status: string }>(a.client, "agreement_get", { p_agreement_id: accepted.agreement_id }));
    expect(agreement.status).toBe("active");
    for (const member of [a, b])
      ok(await rpc(member.client, "agreement_handover", { p_agreement_id: accepted.agreement_id, p_version_id: agreement.binding_version_id, p_idempotency_key: newKey() }));
    expect(ok(await rpc<{ status: string }>(a.client, "agreement_get", { p_agreement_id: accepted.agreement_id })).status).toBe("completed");
  });

  it("refuses blocking yourself, or someone you can't see", async () => {
    const [a, b] = await Promise.all([createMember("ada"), createMember("bayo")]);
    const [mine, draft] = await Promise.all([offerIn(a, "active"), offerIn(b, "draft")]);
    expect(failure(await block(a, { p_offer_id: mine.id })).detail).toEqual({ reason: "own" });
    expect(failure(await block(a, { p_offer_id: draft.id })).code).toBe("NOT_FOUND");
    expect(failure(await block(a, {})).code).toBe("VALIDATION_FAILED");
  });
});

describe("reports (S3, S7, S10)", () => {
  it("reports an offer, a member and a message; the reporter sees Received, never the outcome", async () => {
    const [a, b] = await Promise.all([createMember("ada"), createMember("bayo")]);
    const [camera, bike] = await Promise.all([offerIn(a, "active"), offerIn(b, "active")]);
    const open = ok(await propose(b, camera, bike));
    const message = ok(await rpc<{ id: number }>(a.client, "message_send", { p_proposal_id: open.id, p_body: "Pay me outside BATR", p_idempotency_key: newKey() }));

    const onOffer = ok(await report(b, { p_subject_type: "offer", p_offer_id: camera.id, p_reason: "prohibited_item" }));
    expect(onOffer.status).toBe("received");
    ok(await report(b, { p_subject_type: "member", p_proposal_id: open.id, p_reason: "harassment" }));
    ok(await report(b, { p_subject_type: "message", p_message_id: message.id, p_reason: "scam", p_details: "Asked for a bank transfer." }));

    expect(failure(await report(b, { p_subject_type: "offer", p_offer_id: camera.id, p_reason: "spam" }))).toMatchObject({ status: 409, detail: { reason: "already_reported" } });
    expect(failure(await report(a, { p_subject_type: "message", p_message_id: message.id, p_reason: "spam" })).detail).toEqual({ reason: "own" });
    expect(failure(await report(a, { p_subject_type: "offer", p_offer_id: camera.id, p_reason: "spam" })).detail).toEqual({ reason: "own" });
    expect(failure(await report(b, { p_subject_type: "offer", p_offer_id: camera.id, p_reason: "rude" })).detail).toEqual({ fields: { reason: "invalid" } });
    expect(failure(await report(b, { p_subject_type: "member", p_offer_id: camera.id, p_reason: "other", p_details: "bad" })).detail).toEqual({ fields: { details: "length" } });
    const c = await createMember("chika");
    expect(failure(await report(c, { p_subject_type: "message", p_message_id: message.id, p_reason: "spam" })).code).toBe("NOT_FOUND");

    const mine = ok(await rpc<{ label: string; status: string; reason: string }[]>(b.client, "my_reports", {}));
    expect(mine.map((r) => r.status)).toEqual(["received", "received", "received"]);
    expect(mine.map((r) => r.label)).toContain(camera.title);
    const { data } = await a.client.from("reports").select("id");
    expect(data).toEqual([]);
    const { error } = await a.client.from("moderation_actions").select("id");
    expect(error === null ? [] : error.message).toEqual([]);
  });

  it("allows 10 reports a day", async () => {
    const [a, b] = await Promise.all([createMember("ada"), createMember("bayo")]);
    const offers = await Promise.all(Array.from({ length: 11 }, () => offerIn(a, "active")));
    for (const offer of offers.slice(0, 10)) ok(await report(b, { p_subject_type: "offer", p_offer_id: offer.id, p_reason: "spam" }));
    expect(failure(await report(b, { p_subject_type: "offer", p_offer_id: offers[10]?.id, p_reason: "spam" }))).toMatchObject({ status: 429, code: "RATE_LIMITED" });
  });
});

describe("moderation (S4–S6)", () => {
  it("is open to moderators only, never on reports about or by themselves", async () => {
    const [a, b] = await Promise.all([createMember("ada"), createMember("bayo")]);
    const camera = await offerIn(a, "active");
    const made = ok(await report(b, { p_subject_type: "offer", p_offer_id: camera.id, p_reason: "spam" }));
    for (const member of [a, b]) {
      expect(failure(await rpc(member.client, "moderation_queue", {})).code).toBe("NOT_FOUND");
      expect(failure(await rpc(member.client, "moderation_report", { p_report_id: made.id })).code).toBe("NOT_FOUND");
    }
    expect(ok(await rpc<{ id: string }[]>(moderator.client, "moderation_queue", {})).map((r) => r.id)).toContain(made.id);

    const modOffer = await offerIn(moderator, "active");
    const aboutMod = ok(await report(a, { p_subject_type: "offer", p_offer_id: modOffer.id, p_reason: "spam" }));
    expect(ok(await rpc<{ id: string }[]>(moderator.client, "moderation_queue", {})).map((r) => r.id)).not.toContain(aboutMod.id);
    expect(failure(await act(aboutMod.id, "dismiss")).code).toBe("NOT_FOUND");
  });

  it("removes an offer: closed, marked, proposals declined, logged; reporter still sees only Reviewed", async () => {
    const [a, b, c] = await Promise.all([createMember("ada"), createMember("bayo"), createMember("chika")]);
    const [camera, bike] = await Promise.all([offerIn(a, "active"), offerIn(c, "active")]);
    const open = ok(await propose(c, camera, bike));
    const made = ok(await report(b, { p_subject_type: "offer", p_offer_id: camera.id, p_reason: "prohibited_item" }));
    const seen = ok(await rpc<Moderation>(moderator.client, "moderation_report", { p_report_id: made.id }));
    expect(seen.actions).toEqual({ take: true, dismiss: true, remove_offer: true, warn: false, suspend: true, resume: false, cancel_agreement: false, record_breach: false });
    expect(seen.subject.offer).not.toHaveProperty("owner_id");

    expect(failure(await act(made.id, "remove_offer", "short")).detail).toEqual({ fields: { note: "length" } });
    const done = ok(await act(made.id, "remove_offer", "Sells a prohibited item."));
    expect(done.status).toBe("closed");
    expect(done.subject.offer).toMatchObject({ status: "closed", removed_at: expect.any(String) });
    expect(done.history.map((h) => h.action)).toEqual(["remove_offer"]);
    expect(ok(await rpc<Proposal>(c.client, "proposal_get", { p_proposal_id: open.id })).status).toBe("declined");
    expect(failure(await act(made.id, "dismiss")).detail).toEqual({ reason: "already_reviewed" });
    expect(ok(await rpc<{ status: string }[]>(b.client, "my_reports", {}))[0]?.status).toBe("reviewed");

    await expect(db.query("update public.moderation_actions set note = 'changed' where report_id = $1", [made.id])).rejects.toThrow();
  });

  it("suspends a member: no publishing, proposing or messaging, offers hidden; lifting restores them", async () => {
    const [a, b] = await Promise.all([createMember("ada"), createMember("bayo")]);
    const [camera, bike, draft] = await Promise.all([offerIn(a, "active"), offerIn(b, "active"), offerIn(a, "draft")]);
    const open = ok(await propose(b, camera, bike));
    const made = ok(await report(b, { p_subject_type: "member", p_offer_id: camera.id, p_reason: "scam" }));
    ok(await act(made.id, "suspend", "Repeated scam reports."));

    expect(ok(await rpc<{ suspended: boolean }>(a.client, "my_safety_status", {}))).toEqual({ suspended: true, moderator: false, senior: false, warned: false });
    expect(await visible(b, camera.id)).toBe(false);
    expect(await visible(null, camera.id)).toBe(false);
    expect(await visible(a, camera.id)).toBe(true);
    await expect(transition(a, "publish", draft)).rejects.toThrow(/PT403 FORBIDDEN .*suspended/);
    expect(failure(await rpc(a.client, "message_send", { p_proposal_id: open.id, p_body: "Hi", p_idempotency_key: newKey() })).detail).toEqual({ reason: "suspended" });
    expect(failure(await rpc(a.client, "proposal_accept", { p_proposal_id: open.id, p_revision_id: open.latest_revision_id, p_idempotency_key: newKey() })).detail).toEqual({ reason: "suspended" });
    expect(failure(await propose(a, bike, camera)).detail).toEqual({ reason: "suspended" });

    const suspensions = ok(await rpc<{ id: string; member_name: string }[]>(moderator.client, "moderation_suspensions", {}));
    const mine = suspensions.find((s) => s.member_name.includes("ada"));
    expect(failure(await rpc(a.client, "moderation_unsuspend", { p_suspension_id: mine?.id, p_note: "Let me back in.", p_idempotency_key: newKey() })).code).toBe("NOT_FOUND");
    ok(await rpc(moderator.client, "moderation_unsuspend", { p_suspension_id: mine?.id, p_note: "Cleared after review.", p_idempotency_key: newKey() }));
    expect(await visible(b, camera.id)).toBe(true);
    ok(await rpc(a.client, "message_send", { p_proposal_id: open.id, p_body: "Back again", p_idempotency_key: newKey() }));
  });

  it("shows a reported message with only the messages around it", async () => {
    const [a, b] = await Promise.all([createMember("ada"), createMember("bayo")]);
    const [camera, bike] = await Promise.all([offerIn(a, "active"), offerIn(b, "active")]);
    const open = ok(await propose(b, camera, bike));
    const ids: number[] = [];
    for (let i = 0; i < 25; i += 1) {
      const sender = i % 2 === 0 ? a : b;
      ids.push(ok(await rpc<{ id: number }>(sender.client, "message_send", { p_proposal_id: open.id, p_body: `Message ${String(i)}`, p_idempotency_key: newKey() })).id);
    }
    const target = ids[12] as number;
    const made = ok(await report(b, { p_subject_type: "message", p_message_id: target, p_reason: "harassment" }));
    const seen = ok(await rpc<Moderation>(moderator.client, "moderation_report", { p_report_id: made.id }));
    const shown = seen.subject.messages ?? [];
    expect(shown).toHaveLength(21);
    expect(shown.find((m) => m.reported)?.id).toBe(target);
    expect(shown[0]?.id).toBe(ids[2]);
    expect(shown.at(-1)?.id).toBe(ids[22]);
    expect(shown.find((m) => m.reported)?.from).toBe("reported");
    ok(await act(made.id, "dismiss", "Heated but within the rules."));
  });
});
