import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type pg from "pg";
import {
  connect,
  createMember,
  edit,
  failure,
  newKey,
  offerIn,
  ok,
  rpc,
  transition,
  type Member,
} from "./support/db.ts";

// Milestone 4, unit 18: agreements against the real database
// (specs/milestone-4.md, Rules and validation and Acceptance criteria;
// state-model.md §4 and §6).

type Item = { kind: "offer"; offer_id: string; content_version?: number } | { kind: "text"; description: string };
type Version = {
  id: string;
  number: number;
  proposed_by: string;
  outcome: string;
  gives: Item[];
  gets: Item[];
  cash: { amount_naira: number; payer: string } | null;
  note: string;
};
type Agreement = {
  id: string;
  status: string;
  revision: number;
  viewer_role: string;
  binding_version_id: string;
  confirmed_by: string[];
  pending_by: string | null;
  cancel_requested_by: string | null;
  versions: Version[];
  confirmations: { party_id: string; version_id: string }[];
  cancellation: { id: string; requested_by: string; reason: string; outcome: string | null } | null;
  listing_changed: boolean;
  pending_changed_offer_ids: string[];
  fee: { total_kobo: number; owner_share_kobo: number; proposer_share_kobo: number } | null;
  my_listed_offers: { id: string; title: string }[];
};
type List = { items: { id: string; status: string }[]; next: unknown };

let db: pg.Client;
let a: Member; // offer owner
let b: Member; // proposer
let c: Member; // anyone else

beforeAll(async () => {
  db = await connect();
  [a, b, c] = await Promise.all([createMember("ada"), createMember("bayo"), createMember("chika")]);
});
afterAll(async () => {
  await db.end();
});

/** B proposes their offer and ₦20,000 on A's offer; A accepts. */
async function agreed() {
  const [target, mine] = await Promise.all([offerIn(a, "active"), offerIn(b, "active")]);
  const proposal = ok(
    await rpc<{ id: string; latest_revision_id: string }>(b.client, "proposal_create", {
      p_offer_id: target.id,
      p_terms: {
        gives: [{ kind: "offer", offer_id: mine.id }],
        gets: [{ kind: "offer", offer_id: target.id }],
        cash: { amount_naira: 20000, payer: "proposer" },
        note: "",
      },
      p_idempotency_key: newKey(),
    }),
  );
  const accepted = ok(
    await rpc<{ agreement_id: string }>(a.client, "proposal_accept", {
      p_proposal_id: proposal.id,
      p_revision_id: proposal.latest_revision_id,
      p_idempotency_key: newKey(),
    }),
  );
  const agreement = ok(await get(a, accepted.agreement_id));
  return { target, mine, proposal, agreement };
}

const get = (member: Member, id: string) => rpc<Agreement>(member.client, "agreement_get", { p_agreement_id: id });
const list = async (member: Member, box: string) => ok(await rpc<List>(member.client, "agreement_list", { p_box: box }));
const handover = (member: Member, ag: Agreement, versionId = ag.binding_version_id, key = newKey()) =>
  rpc<Agreement>(member.client, "agreement_handover", { p_agreement_id: ag.id, p_version_id: versionId, p_idempotency_key: key });
const binding = (ag: Agreement) => ag.versions.find((v) => v.id === ag.binding_version_id) as Version;
const propose = (member: Member, ag: Agreement, body: Record<string, unknown>, key = newKey()) =>
  rpc<Agreement>(member.client, "agreement_change_propose", {
    p_agreement_id: ag.id,
    p_expected_version: binding(ag).number,
    p_terms: body,
    p_idempotency_key: key,
  });
const resolveChange = (member: Member, action: "accept" | "reject" | "withdraw", ag: Agreement, versionId: string) =>
  rpc<Agreement>(member.client, `agreement_change_${action}`, { p_agreement_id: ag.id, p_version_id: versionId, p_idempotency_key: newKey() });
const requestCancel = (member: Member, ag: Agreement, reason: string) =>
  rpc<Agreement>(member.client, "agreement_cancel_request", { p_agreement_id: ag.id, p_reason: reason, p_idempotency_key: newKey() });
const resolveCancel = (member: Member, action: "accept" | "reject" | "withdraw", ag: Agreement, requestId: string) =>
  rpc<Agreement>(member.client, `agreement_cancel_${action}`, { p_agreement_id: ag.id, p_request_id: requestId, p_idempotency_key: newKey() });
const pendingOf = (ag: Agreement) => ag.versions.find((v) => v.outcome === "pending") as Version;
const events = async (id: string) =>
  (await db.query<{ action: string; to_status: string; version: number }>("select action, to_status, version from public.agreement_events where agreement_id = $1 order by id", [id])).rows;

/** The binding terms with a different cash amount. */
const withCash = (ag: Agreement, amount: number) => {
  const terms = binding(ag);
  const strip = (items: Item[]) => items.map((i) => (i.kind === "offer" ? { kind: "offer", offer_id: i.offer_id } : i));
  return { gives: strip(terms.gives), gets: strip(terms.gets), cash: { amount_naira: amount, payer: "proposer" }, note: "" };
};

describe("version 1", () => {
  it("is the accepted revision, binding, readable by the two parties only", async () => {
    const { proposal, agreement, mine } = await agreed();
    const revision = (await db.query<{ gives: unknown; gets: unknown }>("select gives, gets from public.proposal_revisions where id = $1", [proposal.latest_revision_id])).rows[0];
    expect(agreement).toMatchObject({ status: "active", revision: 1, viewer_role: "owner", confirmed_by: [], pending_by: null, cancel_requested_by: null, fee: null });
    expect(agreement.versions).toHaveLength(1);
    expect(agreement.versions[0]).toMatchObject({ number: 1, outcome: "binding", proposed_by: b.id, cash: { amount_naira: 20000, payer: "proposer" } });
    expect(agreement.versions[0]?.gives).toEqual(revision?.gives);
    expect(agreement.versions[0]?.gets).toEqual(revision?.gets);
    expect(agreement.versions[0]?.gives[0]).toMatchObject({ offer_id: mine.id });
    expect(ok(await get(b, agreement.id)).viewer_role).toBe("proposer");
    expect(failure(await get(c, agreement.id)).code).toBe("NOT_FOUND");
    expect((await list(a, "active")).items.map((r) => r.id)).toContain(agreement.id);
    expect((await list(b, "active")).items.map((r) => r.id)).toContain(agreement.id);
    for (const box of ["active", "closed"]) expect((await list(c, box)).items.map((r) => r.id)).not.toContain(agreement.id);
    expect(await events(agreement.id)).toEqual([{ action: "create", to_status: "active", version: 1 }]);
    // The accepted proposal now lives under its agreement, not Closed.
    const closed = ok(await rpc<List>(a.client, "proposal_list", { p_box: "closed" }));
    expect(closed.items.map((r) => r.id)).not.toContain(proposal.id);
  });

  it("never changes when a listing is edited, paused or closed (state-model.md §4)", async () => {
    const { agreement, target, mine } = await agreed();
    ok(await edit(b, mine, { title: "Road bike, new tyres" }));
    await transition(a, "pause", target);
    const after = ok(await get(a, agreement.id));
    expect(after).toMatchObject({ status: "active", revision: 1, listing_changed: true });
    expect(after.versions).toEqual(agreement.versions);
    const paused = (await db.query<{ status: string; revision: number }>("select status, revision from public.offers where id = $1", [target.id])).rows[0];
    await transition(a, "close", { ...target, status: "paused", revision: paused?.revision ?? 0 });
    expect(ok(await get(a, agreement.id))).toMatchObject({ status: "active", revision: 1 });
  });

  it("shows the fee shares from the offer's current quote as information only (A1)", async () => {
    const { agreement, target } = await agreed();
    const submission = (
      await db.query<{ id: string }>(
        "insert into public.valuation_submissions (offer_id, submitter_id, status, policy_version) values ($1, $2, 'assessed', 'valuation-2026-10-17') returning id",
        [target.id, a.id],
      )
    ).rows[0];
    await db.query(
      `insert into public.fee_quotes (submission_id, exchange_type, assessed_noncash_kobo, cash_kobo, fee_basis_kobo, fee_bp,
         total_fee_kobo, party_a_share_kobo, party_b_share_kobo, policy_version)
       values ($1, 'pure_barter', 10000000, 0, 10000000, 300, 300001, 150001, 150000, 'fees-2026-10-17')`,
      [submission?.id],
    );
    expect(ok(await get(b, agreement.id)).fee).toEqual({ total_kobo: 300001, owner_share_kobo: 150001, proposer_share_kobo: 150000, requires_reconfirmation: false });
    // Both confirm handover: still no liability or payment.
    const first = ok(await handover(a, ok(await get(a, agreement.id))));
    ok(await handover(b, first));
    const ledger = await db.query("select 1 from public.fee_liabilities where agreement_id = $1", [agreement.id]);
    expect(ledger.rowCount).toBe(0);
  });
});

describe("handover (§6.1)", () => {
  it("records each party once; the second confirmation completes it", async () => {
    const { agreement, target, mine } = await agreed();
    expect(failure(await handover(c, agreement)).code).toBe("NOT_FOUND");
    expect(failure(await handover(a, agreement, newKey()))).toMatchObject({ status: 409, detail: { reason: "stale_version" } });

    const one = ok(await handover(a, agreement));
    expect(one).toMatchObject({ status: "active", confirmed_by: [a.id], revision: 2 });
    expect(ok(await rpc<{ agreements: number }>(b.client, "proposal_counts", {})).agreements).toBeGreaterThanOrEqual(1);
    // A repeat is the existing confirmation: no new row or event.
    const again = ok(await handover(a, agreement));
    expect(again).toMatchObject({ status: "active", confirmed_by: [a.id], revision: 2 });
    expect((await events(agreement.id)).map((e) => e.action)).toEqual(["create", "handover"]);

    const done = ok(await handover(b, agreement));
    expect(done).toMatchObject({ status: "completed", confirmed_by: [a.id, b.id] });
    // A2: nothing closes automatically; each sees their own listed offers.
    expect(done.my_listed_offers.map((o) => o.id)).toEqual([mine.id]);
    expect(ok(await get(a, agreement.id)).my_listed_offers.map((o) => o.id)).toEqual([target.id]);
    expect((await events(agreement.id)).at(-1)).toEqual({ action: "handover", to_status: "completed", version: 1 });
    expect((await list(a, "closed")).items.map((r) => r.id)).toContain(agreement.id);
    expect((await list(a, "active")).items.map((r) => r.id)).not.toContain(agreement.id);
    // Repeating after completion still returns the confirmation.
    expect(ok(await handover(b, agreement)).status).toBe("completed");
    // Nothing else succeeds on a completed agreement.
    expect(failure(await requestCancel(a, done, "Changed my mind"))).toMatchObject({ status: 409, detail: { reason: "status_changed", current_status: "completed" } });
    expect(failure(await propose(b, done, withCash(done, 1000))).detail).toMatchObject({ reason: "status_changed" });
  });

  it("completes exactly once when both confirm at the same moment", async () => {
    const { agreement } = await agreed();
    const results = await Promise.all([handover(a, agreement), handover(b, agreement)]);
    expect(results.every((r) => !r.error)).toBe(true);
    expect(ok(await get(a, agreement.id)).status).toBe("completed");
    const completions = (await events(agreement.id)).filter((e) => e.to_status === "completed");
    expect(completions).toHaveLength(1);
    expect((await db.query("select 1 from public.handover_confirmations where agreement_id = $1", [agreement.id])).rowCount).toBe(2);
  });

  it("repeats nothing for a repeated idempotency key", async () => {
    const { agreement } = await agreed();
    const key = newKey();
    const first = ok(await handover(a, agreement, agreement.binding_version_id, key));
    const second = ok(await handover(a, agreement, agreement.binding_version_id, key));
    expect(second).toEqual(first);
    expect((await events(agreement.id)).map((e) => e.action)).toEqual(["create", "handover"]);
  });
});

describe("changes (§6.2)", () => {
  it("keeps the old version binding until the other party accepts that exact version", async () => {
    const { agreement } = await agreed();
    expect(failure(await propose(b, agreement, { ...withCash(agreement, 20000), note: "Just a note" })).detail.fields).toEqual({ terms: "unchanged" });
    const pending = ok(await propose(b, agreement, withCash(agreement, 15000)));
    expect(pending).toMatchObject({ status: "amendment_pending", pending_by: b.id, binding_version_id: agreement.binding_version_id });
    const change = pendingOf(pending);
    expect(change).toMatchObject({ number: 2, outcome: "pending", proposed_by: b.id, cash: { amount_naira: 15000 } });
    expect(ok(await rpc<{ agreements: number }>(a.client, "proposal_counts", {})).agreements).toBeGreaterThanOrEqual(1);

    // Handover, a second change and cancelling wait while it is pending.
    expect(failure(await handover(a, pending)).detail).toMatchObject({ reason: "status_changed", current_status: "amendment_pending" });
    expect(failure(await propose(a, pending, withCash(agreement, 1000))).detail).toMatchObject({ reason: "status_changed" });
    expect(failure(await requestCancel(a, pending, "Not needed")).detail).toMatchObject({ reason: "status_changed" });

    expect(failure(await resolveChange(b, "accept", pending, change.id))).toMatchObject({ status: 403, detail: { reason: "own_change" } });
    expect(failure(await resolveChange(a, "withdraw", pending, change.id))).toMatchObject({ status: 403, detail: { reason: "not_proposer" } });
    expect(failure(await resolveChange(a, "accept", pending, agreement.binding_version_id))).toMatchObject({ status: 409, detail: { reason: "stale_version" } });
    expect(failure(await resolveChange(c, "accept", pending, change.id)).code).toBe("NOT_FOUND");

    const accepted = ok(await resolveChange(a, "accept", pending, change.id));
    expect(accepted).toMatchObject({ status: "active", binding_version_id: change.id, pending_by: null });
    expect(accepted.versions.map((v) => v.outcome)).toEqual(["superseded", "binding"]);
    expect((await events(agreement.id)).map((e) => [e.action, e.version])).toEqual([
      ["create", 1],
      ["propose_change", 1],
      ["accept_change", 2],
    ]);
  });

  it("leaves the terms unchanged when a change is rejected or withdrawn", async () => {
    const { agreement } = await agreed();
    let current = ok(await propose(a, agreement, withCash(agreement, 25000)));
    current = ok(await resolveChange(b, "reject", current, pendingOf(current).id));
    expect(current).toMatchObject({ status: "active", binding_version_id: agreement.binding_version_id });
    current = ok(await propose(a, current, withCash(agreement, 30000)));
    expect(pendingOf(current).number).toBe(3);
    current = ok(await resolveChange(a, "withdraw", current, pendingOf(current).id));
    expect(current.versions.map((v) => v.outcome)).toEqual(["binding", "rejected", "withdrawn"]);
    expect(binding(current).cash).toEqual({ amount_naira: 20000, payer: "proposer" });
  });

  it("is refused once anyone has confirmed handover (D4)", async () => {
    const { agreement } = await agreed();
    ok(await handover(b, agreement));
    expect(failure(await propose(a, agreement, withCash(agreement, 1000)))).toMatchObject({ status: 409, detail: { reason: "handover_started" } });
  });

  it("keeps an agreed item whose listing closed; a new item must still match its listing to be accepted", async () => {
    const { agreement, target } = await agreed();
    // A closes the listing after agreeing (D1); a cash change still works.
    await transition(a, "close", target);
    const kept = ok(await propose(b, agreement, withCash(agreement, 18000)));
    expect(pendingOf(kept).gets).toEqual(binding(agreement).gets);
    const done = ok(await resolveChange(a, "accept", kept, pendingOf(kept).id));

    // B adds another offer of theirs, then edits it before A accepts.
    const extra = await offerIn(b, "active");
    const body = withCash(done, 18000);
    ok(await propose(b, done, { ...body, gives: [...body.gives, { kind: "offer", offer_id: extra.id }] }));
    ok(await edit(b, extra, { title: "Helmet, used once" }));
    const seen = ok(await get(a, agreement.id));
    expect(seen.pending_changed_offer_ids).toEqual([extra.id]);
    expect(failure(await resolveChange(a, "accept", seen, pendingOf(seen).id))).toMatchObject({ status: 409, code: "TERMS_CHANGED", detail: { offer_ids: [extra.id] } });
    // Offers that aren't B's, or the target on B's side, are refused.
    ok(await resolveChange(b, "withdraw", seen, pendingOf(seen).id));
    const others = await offerIn(c, "active");
    expect(failure(await propose(b, seen, { ...body, gives: [{ kind: "offer", offer_id: others.id }] })).detail.fields).toEqual({ gives: "offer_unavailable" });
    expect(failure(await propose(b, seen, { ...body, gives: [{ kind: "offer", offer_id: target.id }] })).detail.fields).toEqual({ gives: "offer_unavailable" });
  });
});

describe("cancellation", () => {
  it("needs both parties; Keep the agreement returns to active", async () => {
    const { agreement } = await agreed();
    expect(failure(await requestCancel(a, agreement, " no ")).detail.fields).toEqual({ reason: "length" });
    expect(failure(await requestCancel(a, agreement, "x".repeat(501))).detail.fields).toEqual({ reason: "length" });
    let current = ok(await requestCancel(a, agreement, "  The lens is cracked.  "));
    expect(current).toMatchObject({ status: "cancellation_requested", cancel_requested_by: a.id, cancellation: { requested_by: a.id, reason: "The lens is cracked.", outcome: null } });
    const request = current.cancellation?.id as string;
    expect(failure(await handover(b, current)).detail).toMatchObject({ reason: "status_changed" });
    expect(failure(await resolveCancel(a, "accept", current, request))).toMatchObject({ status: 403, detail: { reason: "own_request" } });
    expect(failure(await resolveCancel(b, "withdraw", current, request))).toMatchObject({ status: 403, detail: { reason: "not_requester" } });
    expect(failure(await resolveCancel(b, "accept", current, agreement.id))).toMatchObject({ status: 409, detail: { reason: "stale_request" } });
    current = ok(await resolveCancel(b, "reject", current, request));
    expect(current).toMatchObject({ status: "active", cancel_requested_by: null, cancellation: { outcome: "rejected" } });

    current = ok(await requestCancel(b, current, "Found another bike"));
    current = ok(await resolveCancel(b, "withdraw", current, current.cancellation?.id as string));
    expect(current.status).toBe("active");
    expect((await events(agreement.id)).map((e) => e.action)).toEqual(["create", "request_cancel", "reject_cancel", "request_cancel", "withdraw_cancel"]);
  });

  it("can be asked after a handover (A3) and ends the agreement when agreed", async () => {
    const { agreement } = await agreed();
    ok(await handover(a, agreement));
    let current = ok(await requestCancel(b, agreement, "The bike was stolen."));
    current = ok(await resolveCancel(a, "accept", current, current.cancellation?.id as string));
    expect(current).toMatchObject({ status: "cancelled", cancellation: { reason: "The bike was stolen.", outcome: "accepted" } });
    expect((await list(b, "closed")).items.map((r) => r.id)).toContain(agreement.id);
    expect(failure(await handover(b, current)).detail).toMatchObject({ reason: "status_changed", current_status: "cancelled" });
    expect(failure(await requestCancel(a, current, "Again")).detail).toMatchObject({ current_status: "cancelled" });
  });
});

describe("backstops", () => {
  it("refuses member writes and edits to history, and completion without two confirmations", async () => {
    const { agreement } = await agreed();
    const v1 = agreement.binding_version_id;
    expect((await a.client.from("agreement_versions").insert({ agreement_id: agreement.id, number: 9, proposed_by: a.id, gives: [], gets: [], outcome: "pending" })).error).not.toBeNull();
    expect((await a.client.from("handover_confirmations").insert({ agreement_id: agreement.id, party_id: a.id, version_id: v1 })).error).not.toBeNull();
    expect((await a.client.from("agreements").update({ status: "completed" }).eq("id", agreement.id)).error).not.toBeNull();
    await expect(db.query("update public.agreement_versions set note = 'edited' where id = $1", [v1])).rejects.toThrow(/cannot be changed/);
    await expect(db.query("update public.agreement_versions set outcome = 'pending', resolved_at = null where id = $1", [v1])).rejects.toThrow(/cannot be changed/);
    await expect(db.query("update public.agreements set status = 'completed', completed_at = now() where id = $1", [agreement.id])).rejects.toThrow(/both parties/);
    await expect(db.query("update public.agreements set status = 'cancelled', cancelled_at = now() where id = $1", [agreement.id])).rejects.toThrow(/not allowed/);
    ok(await handover(a, agreement));
    await expect(db.query("update public.handover_confirmations set confirmed_at = now() where agreement_id = $1", [agreement.id])).rejects.toThrow(/cannot be changed/);
    // C sees none of it through row-level security.
    for (const table of ["agreements", "agreement_versions", "handover_confirmations", "agreement_events"]) {
      const column = table === "agreements" ? "id" : "agreement_id";
      expect((await c.client.from(table).select("*").eq(column, agreement.id)).data).toEqual([]);
    }
  });
});
