import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type pg from "pg";
import {
  addPhoto,
  admin,
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
  type Offer,
  type RpcResult,
} from "./support/db.ts";

// Milestone 3, unit 13: proposals against the real database
// (specs/milestone-3.md, Rules and validation and Acceptance criteria;
// state-model.md §3–5).

type Item = { kind: "offer"; offer_id: string; content_version?: number; snapshot?: Record<string, unknown> } | { kind: "text"; description: string };
type Revision = { id: string; number: number; author_id: string; gives: Item[]; gets: Item[]; cash: { amount_naira: number; payer: string } | null; note: string };
type Proposal = {
  id: string;
  offer_id: string;
  status: string;
  close_reason: string | null;
  revision: number;
  latest_revision_id: string;
  latest_author_id: string;
  agreement_id: string | null;
  changed_offer_ids: string[];
  viewer_role: string;
  proposer: { id: string; display_name: string | null };
  revisions: Revision[];
  gives_choices: { id: string }[];
};
type List = { items: { id: string; status: string; latest: Revision }[]; next: { updated_at: string; id: string } | null };

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

const terms = (target: Offer, gives: Item[], extra: Record<string, unknown> = {}) => ({
  gives,
  gets: [{ kind: "offer", offer_id: target.id }],
  cash: null,
  note: "",
  ...extra,
});

const create = (member: Member, target: Offer, body: Record<string, unknown>, key = newKey()): Promise<RpcResult<Proposal>> =>
  rpc<Proposal>(member.client, "proposal_create", { p_offer_id: target.id, p_terms: body, p_idempotency_key: key });

const counter = (member: Member, p: Proposal, body: Record<string, unknown>, key = newKey()) =>
  rpc<Proposal>(member.client, "proposal_counter", { p_proposal_id: p.id, p_expected_revision: p.revision, p_terms: body, p_idempotency_key: key });

const accept = (member: Member, p: Proposal, revisionId = p.latest_revision_id, key = newKey()) =>
  rpc<Proposal>(member.client, "proposal_accept", { p_proposal_id: p.id, p_revision_id: revisionId, p_idempotency_key: key });

const act = (member: Member, action: "decline" | "withdraw", p: Proposal, key = newKey()) =>
  rpc<Proposal>(member.client, `proposal_${action}`, { p_proposal_id: p.id, p_expected_revision: p.revision, p_idempotency_key: key });

const get = (member: Member, id: string) => rpc<Proposal>(member.client, "proposal_get", { p_proposal_id: id });
const list = async (member: Member, box: string) => ok(await rpc<List>(member.client, "proposal_list", { p_box: box }));
const events = async (id: string) =>
  (await db.query<{ action: string; actor_id: string | null; note: string | null }>("select action, actor_id, note from public.proposal_events where proposal_id = $1 order by id", [id])).rows;

/** A fresh pair of offers: A's target and B's offer to give. */
async function setup() {
  const [target, mine] = await Promise.all([offerIn(a, "active"), offerIn(b, "active")]);
  return { target, mine };
}

describe("creating a proposal", () => {
  it("opens revision 1 with snapshots; the owner's turn, the proposer waiting", async () => {
    const { target, mine } = await setup();
    const p = ok(
      await create(b, target, terms(target, [{ kind: "offer", offer_id: mine.id }, { kind: "text", description: " A phone charger " }], {
        cash: { amount_naira: 20000, payer: "proposer" },
        note: "Happy to meet in Yaba.",
      })),
    );
    expect(p).toMatchObject({ status: "open", revision: 1, latest_author_id: b.id, viewer_role: "proposer", agreement_id: null, changed_offer_ids: [] });
    const [first] = p.revisions;
    expect(first?.cash).toEqual({ amount_naira: 20000, payer: "proposer" });
    expect(first?.gives[1]).toEqual({ kind: "text", description: "A phone charger" });
    expect(first?.gives[0]).toMatchObject({ kind: "offer", offer_id: mine.id, content_version: mine.content_version, snapshot: { title: "Road bike" } });
    expect((first?.gets[0] as unknown as { snapshot: { photo: { thumb_path: string } } }).snapshot.photo.thumb_path).toBe(target.photos[0]?.thumb_path);

    expect((await list(a, "turn")).items.map((row) => row.id)).toContain(p.id);
    expect((await list(b, "waiting")).items.map((row) => row.id)).toContain(p.id);
    expect((await list(b, "turn")).items.map((row) => row.id)).not.toContain(p.id);
    expect(ok(await rpc<{ turn: number }>(a.client, "proposal_counts", {})).turn).toBeGreaterThanOrEqual(1);
    expect(await events(p.id)).toEqual([{ action: "create", actor_id: b.id, note: null }]);
  });

  it("refuses the owner, a second open proposal and offers that are not active", async () => {
    const { target, mine } = await setup();
    const body = terms(target, [{ kind: "offer", offer_id: mine.id }]);
    expect(failure(await create(a, target, body))).toMatchObject({ status: 403, code: "FORBIDDEN", detail: { reason: "own_offer" } });
    const first = ok(await create(b, target, body));
    expect(failure(await create(b, target, body))).toMatchObject({ status: 409, code: "CONFLICT", detail: { reason: "already_open", proposal_id: first.id } });

    const paused = await offerIn(a, "paused");
    const closed = await offerIn(a, "closed");
    expect(failure(await create(b, paused, terms(paused, [{ kind: "offer", offer_id: mine.id }]))).code).toBe("NOT_FOUND");
    expect(failure(await create(b, closed, terms(closed, [{ kind: "offer", offer_id: mine.id }]))).code).toBe("NOT_FOUND");
  });

  it("checks the terms: own active offers to give, this offer to get, limits", async () => {
    const { target, mine } = await setup();
    const others = await offerIn(c, "active");
    const myPaused = await offerIn(b, "paused");
    const fields = async (body: Record<string, unknown>) => failure(await create(b, target, body)).detail.fields;
    expect(await fields(terms(target, [{ kind: "offer", offer_id: others.id }]))).toEqual({ gives: "offer_unavailable" });
    expect(await fields(terms(target, [{ kind: "offer", offer_id: myPaused.id }]))).toEqual({ gives: "offer_unavailable" });
    expect(await fields({ ...terms(target, [{ kind: "text", description: "Pen set" }]), gets: [{ kind: "text", description: "A bag" }] })).toEqual({ gets: "target" });
    expect(await fields({ ...terms(target, [{ kind: "text", description: "Pen set" }]), gets: [{ kind: "offer", offer_id: others.id }] })).toEqual({ gets: "target" });
    expect(await fields(terms(target, [{ kind: "offer", offer_id: target.id }]))).toEqual({ gives: "offer_unavailable" });
    expect(await fields(terms(target, [{ kind: "offer", offer_id: mine.id }, { kind: "offer", offer_id: mine.id }]))).toEqual({ gives: "duplicate" });
    expect(await fields(terms(target, []))).toEqual({ gives: "count" });
    expect(await fields(terms(target, Array.from({ length: 4 }, () => ({ kind: "text", description: "Pens" }))))).toEqual({ gives: "count" });
    expect(await fields(terms(target, [{ kind: "text", description: "ab" }]))).toEqual({ gives: "text_length" });
    expect(await fields(terms(target, ["text"] as unknown as Item[]))).toEqual({ gives: "invalid" });
    expect(await fields(terms(target, [{ kind: "offer", offer_id: "nope" }]))).toEqual({ gives: "invalid" });
    expect(await fields(terms(target, [{ kind: "text", description: "Pens" }], { cash: { amount_naira: 0, payer: "owner" } }))).toEqual({ cash: "invalid" });
    expect(await fields(terms(target, [{ kind: "text", description: "Pens" }], { cash: { amount_naira: 1.5, payer: "owner" } }))).toEqual({ cash: "invalid" });
    expect(await fields(terms(target, [{ kind: "text", description: "Pens" }], { cash: { amount_naira: 100000001, payer: "owner" } }))).toEqual({ cash: "invalid" });
    expect(await fields(terms(target, [{ kind: "text", description: "Pens" }], { cash: { amount_naira: 10, payer: "bank" } }))).toEqual({ cash: "invalid" });
    expect(await fields(terms(target, [{ kind: "text", description: "Pens" }], { note: "x".repeat(1001) }))).toEqual({ note: "too_long" });
    expect(await fields({ ...terms(target, [{ kind: "text", description: "Pens" }]), extra: 1 })).toEqual({ terms: "invalid" });
    // Nothing was created by any of these.
    expect((await db.query("select 1 from public.proposals where offer_id = $1", [target.id])).rowCount).toBe(0);
    expect(ok(await create(b, target, terms(target, [{ kind: "offer", offer_id: mine.id }])))).toBeTruthy();
  });
});

describe("negotiating", () => {
  it("alternates counters with the turn, refuses a note-only counter and keeps every revision", async () => {
    const { target, mine } = await setup();
    let p = ok(await create(b, target, terms(target, [{ kind: "offer", offer_id: mine.id }])));
    // Not B's turn.
    expect(failure(await counter(b, p, terms(target, [{ kind: "text", description: "A bag" }])))).toMatchObject({ status: 403, detail: { reason: "not_your_turn" } });
    // A note alone is not new terms.
    expect(failure(await counter(a, p, terms(target, [{ kind: "offer", offer_id: mine.id }], { note: "Please?" })))).toMatchObject({
      status: 422,
      detail: { fields: { terms: "unchanged" } },
    });
    p = ok(await counter(a, p, terms(target, [{ kind: "offer", offer_id: mine.id }], { cash: { amount_naira: 5000, payer: "proposer" } })));
    expect(p).toMatchObject({ revision: 2, latest_author_id: a.id, viewer_role: "owner" });
    p = ok(await counter(b, p, terms(target, [{ kind: "offer", offer_id: mine.id }], { cash: { amount_naira: 2000, payer: "proposer" } })));
    p = ok(await counter(a, p, terms(target, [{ kind: "offer", offer_id: mine.id }, { kind: "text", description: "The charger too" }], { cash: { amount_naira: 2000, payer: "proposer" } })));
    expect(p.revisions.map((r) => [r.number, r.author_id])).toEqual([
      [1, b.id],
      [2, a.id],
      [3, b.id],
      [4, a.id],
    ]);
    // A stale counter, from an older revision, is a conflict.
    expect(failure(await counter(b, { ...p, revision: 3 }, terms(target, [{ kind: "text", description: "Pens" }])))).toMatchObject({
      status: 409,
      detail: { reason: "stale_revision", current_revision: 4 },
    });
    expect((await events(p.id)).map((e) => e.action)).toEqual(["create", "counter", "counter", "counter"]);
    // The owner may ask for any of the proposer's active offers.
    expect(p.gives_choices.map((o) => o.id)).toContain(mine.id);
  });

  it("lets only the turn party decline and only the latest author withdraw", async () => {
    const { target, mine } = await setup();
    const p = ok(await create(b, target, terms(target, [{ kind: "offer", offer_id: mine.id }])));
    expect(failure(await act(b, "decline", p))).toMatchObject({ status: 403, detail: { reason: "not_your_turn" } });
    expect(failure(await act(a, "withdraw", p))).toMatchObject({ status: 403, detail: { reason: "not_author" } });
    expect(failure(await act(c, "decline", p)).code).toBe("NOT_FOUND");
    const withdrawn = ok(await act(b, "withdraw", p));
    expect(withdrawn.status).toBe("withdrawn");
    expect(failure(await act(a, "decline", p))).toMatchObject({ status: 409, detail: { reason: "status_changed", current_status: "withdrawn" } });

    const { target: t2, mine: m2 } = await setup();
    const q = ok(await create(b, t2, terms(t2, [{ kind: "offer", offer_id: m2.id }])));
    expect(ok(await act(a, "decline", q)).status).toBe("declined");
    expect((await list(b, "closed")).items.map((row) => row.id)).toEqual(expect.arrayContaining([p.id, q.id]));
  });
});

describe("accepting", () => {
  it("accepts the exact latest revision once and records the agreement in the same transaction", async () => {
    const { target, mine } = await setup();
    const first = ok(await create(b, target, terms(target, [{ kind: "offer", offer_id: mine.id }])));
    const p = ok(await counter(a, first, terms(target, [{ kind: "offer", offer_id: mine.id }], { cash: { amount_naira: 1000, payer: "owner" } })));
    expect(failure(await accept(a, p))).toMatchObject({ status: 403, detail: { reason: "not_your_turn" } });
    expect(failure(await accept(b, p, first.latest_revision_id))).toMatchObject({ status: 409, detail: { reason: "stale_revision" } });
    expect((await db.query("select 1 from public.agreements where proposal_id = $1", [p.id])).rowCount).toBe(0);

    // Two accepts at once: exactly one agreement.
    const results = await Promise.all([accept(b, p), accept(b, p)]);
    expect(results.filter((r) => !r.error)).toHaveLength(1);
    expect(failure(results.find((r) => r.error) as RpcResult<Proposal>)).toMatchObject({ status: 409, detail: { reason: "status_changed" } });
    const agreements = await db.query<{ id: string; revision_id: string }>("select id, revision_id from public.agreements where proposal_id = $1", [p.id]);
    expect(agreements.rows).toEqual([{ id: expect.any(String), revision_id: p.latest_revision_id }]);

    const done = ok(await get(a, p.id));
    expect(done).toMatchObject({ status: "accepted", agreement_id: agreements.rows[0]?.id });
    const agreement = ok(await rpc<{ versions: Revision[]; viewer_role: string; listing_changed: boolean }>(a.client, "agreement_get", { p_agreement_id: done.agreement_id }));
    // Version 1 is the accepted revision (Milestone 4).
    expect(agreement).toMatchObject({ viewer_role: "owner", listing_changed: false, versions: [{ number: 1, outcome: "binding", cash: { amount_naira: 1000, payer: "owner" } }] });
    expect(failure(await rpc(c.client, "agreement_get", { p_agreement_id: done.agreement_id })).code).toBe("NOT_FOUND");
    expect((await events(p.id)).map((e) => e.action)).toEqual(["create", "counter", "accept"]);
    // D1: the offer stays listed.
    expect((await db.query<{ status: string }>("select status from public.offers where id = $1", [target.id])).rows[0]?.status).toBe("active");
  });

  it("refuses terms an offer changed after (TERMS_CHANGED); a refreshed counter can be accepted", async () => {
    const { target, mine } = await setup();
    const p = ok(await create(b, target, terms(target, [{ kind: "offer", offer_id: mine.id }])));
    // A material edit to B's own offer, which B is giving.
    ok(await edit(b, mine, { title: "Road bike, new tyres" }));
    const seen = ok(await get(a, p.id));
    expect(seen.changed_offer_ids).toEqual([mine.id]);
    expect(failure(await accept(a, seen))).toMatchObject({ status: 409, code: "TERMS_CHANGED", detail: { offer_ids: [mine.id] } });
    expect((await db.query("select 1 from public.agreements where proposal_id = $1", [p.id])).rowCount).toBe(0);
    // The turn party counters with the same items: new snapshots, so new terms.
    const refreshed = ok(await counter(a, seen, terms(target, [{ kind: "offer", offer_id: mine.id }])));
    const latest = refreshed.revisions.at(-1);
    expect(latest?.gives[0]).toMatchObject({ content_version: mine.content_version + 1, snapshot: { title: "Road bike, new tyres" } });
    expect(refreshed.revisions[0]?.gives[0]).toMatchObject({ snapshot: { title: "Road bike" } });
    expect(ok(await accept(b, refreshed)).status).toBe("accepted");
  });

  it("still accepts on a paused offer (D3); a non-material edit changes nothing", async () => {
    const { target, mine } = await setup();
    const p = ok(await create(b, target, terms(target, [{ kind: "offer", offer_id: mine.id }])));
    const paused = await transition(a, "pause", target);
    ok(await edit(a, paused, { wants_text: "A tent or a stove" }));
    expect(failure(await create(c, paused, terms(paused, [{ kind: "text", description: "Pens" }]))).code).toBe("NOT_FOUND");
    expect(ok(await accept(a, p)).status).toBe("accepted");
  });
});

describe("closing the offer (D2)", () => {
  it("declines its open proposals with a system note; settled proposals are untouched", async () => {
    const { target, mine } = await setup();
    const open = ok(await create(b, target, terms(target, [{ kind: "offer", offer_id: mine.id }])));
    const settled = ok(await create(c, target, terms(target, [{ kind: "text", description: "A desk lamp" }])));
    ok(await act(c, "withdraw", settled));
    await transition(a, "close", target);
    expect(ok(await get(b, open.id))).toMatchObject({ status: "declined", close_reason: "offer_closed" });
    expect(await events(open.id)).toEqual([
      { action: "create", actor_id: b.id, note: null },
      { action: "auto_decline", actor_id: null, note: "The offer was closed." },
    ]);
    expect(ok(await get(c, settled.id)).status).toBe("withdrawn");
  });
});

describe("expiry (P3)", () => {
  it("shows an expired proposal as expired, refuses every action and the sweep records it", async () => {
    const { target, mine } = await setup();
    const p = ok(await create(b, target, terms(target, [{ kind: "offer", offer_id: mine.id }])));
    await db.query("update public.proposals set expires_at = now() - interval '1 minute' where id = $1", [p.id]);
    expect(ok(await get(a, p.id)).status).toBe("expired");
    expect((await list(a, "turn")).items.map((r) => r.id)).not.toContain(p.id);
    expect((await list(a, "closed")).items.map((r) => r.id)).toContain(p.id);
    expect(failure(await accept(a, p))).toMatchObject({ status: 409, detail: { reason: "expired" } });
    expect(failure(await counter(a, p, terms(target, [{ kind: "text", description: "Pens" }]))).detail.reason).toBe("expired");
    expect(failure(await act(b, "withdraw", p)).detail.reason).toBe("expired");

    // Either member can start again: the new proposal records the old one as expired.
    const again = ok(await create(b, target, terms(target, [{ kind: "offer", offer_id: mine.id }])));
    expect(again.id).not.toBe(p.id);
    expect((await events(p.id)).map((e) => e.action)).toEqual(["create", "expire"]);

  });

  it("the sweep runs with the server key only", async () => {
    const { target, mine } = await setup();
    const p = ok(await create(b, target, terms(target, [{ kind: "offer", offer_id: mine.id }])));
    await db.query("update public.proposals set expires_at = now() - interval '1 minute' where id = $1", [p.id]);
    expect((await b.client.rpc("proposal_expire_due")).error).not.toBeNull();
    const swept = await admin.rpc("proposal_expire_due");
    expect(swept.data).toBeGreaterThanOrEqual(1);
    expect((await db.query<{ status: string }>("select status from public.proposals where id = $1", [p.id])).rows[0]?.status).toBe("expired");
  });
});

describe("privacy and history", () => {
  it("hides a proposal from everyone but the two members", async () => {
    const { target, mine } = await setup();
    const p = ok(await create(b, target, terms(target, [{ kind: "offer", offer_id: mine.id }])));
    expect(failure(await get(c, p.id))).toMatchObject({ status: 404, code: "NOT_FOUND" });
    for (const box of ["turn", "waiting", "closed"]) expect((await list(c, box)).items.map((r) => r.id)).not.toContain(p.id);
    for (const table of ["proposals", "proposal_revisions", "proposal_events", "proposal_snapshot_photos"]) {
      const { data } = await c.client.from(table).select("*").eq(table === "proposals" ? "id" : "proposal_id", p.id);
      expect(data).toEqual([]);
    }
    expect(failure(await rpc(c.client, "offer_proposals", { p_offer_id: target.id }))).toMatchObject({ status: 403 });
    expect(ok(await rpc<{ id: string }[]>(a.client, "offer_proposals", { p_offer_id: target.id })).map((r) => r.id)).toEqual([p.id]);
    // Member e-mail addresses never appear.
    expect(JSON.stringify(ok(await get(a, p.id)))).not.toMatch(/@example\.test/);
  });

  it("keeps revisions and snapshots unchangeable by members and by direct writes", async () => {
    const { target, mine } = await setup();
    const p = ok(await create(b, target, terms(target, [{ kind: "offer", offer_id: mine.id }])));
    const revisionId = p.latest_revision_id;
    const update = await b.client.from("proposal_revisions").update({ note: "changed" }).eq("id", revisionId).select();
    expect(update.error?.code ?? (update.data ?? []).length).toBeTruthy();
    const remove = await b.client.from("proposal_revisions").delete().eq("id", revisionId).select();
    expect(remove.error?.code ?? (remove.data ?? []).length).toBeTruthy();
    const insert = await b.client.from("proposals").update({ status: "accepted" }).eq("id", p.id).select();
    expect(insert.error).not.toBeNull();
    await expect(db.query("update public.proposal_revisions set note = 'x' where id = $1", [revisionId])).rejects.toThrow(/cannot be changed/);
    await db.query("update public.proposals set status = 'withdrawn', closed_at = now() where id = $1", [p.id]);
    await expect(db.query("update public.proposals set status = 'open', closed_at = null where id = $1", [p.id])).rejects.toThrow(/not allowed/);
    expect((await db.query<{ note: string }>("select note from public.proposal_revisions where id = $1", [revisionId])).rows[0]?.note).toBe("");
  });

  it("keeps a snapshot photo viewable after the owner removes it from the offer", async () => {
    const { target, mine } = await setup();
    const p = ok(await create(b, target, terms(target, [{ kind: "offer", offer_id: mine.id }])));
    const photo = target.photos[0] as Offer["photos"][number];
    // The owner adds a second photo, then removes the first (the snapshot's cover).
    const withTwo = await addPhoto(a, target);
    const removed = ok(
      await rpc<Offer & { cleanup_paths: string[] }>(a.client, "offer_photo_remove", {
        p_offer_id: target.id,
        p_photo_id: photo.id,
        p_expected_status: withTwo.status,
        p_expected_revision: withTwo.revision,
        p_idempotency_key: newKey(),
      }),
    );
    expect(removed.cleanup_paths).toEqual(expect.arrayContaining([photo.thumb_path]));
    expect((await admin.rpc("storage_cleanup_queued", { p_paths: removed.cleanup_paths })).data).toEqual([]);
    for (const member of [a, b]) {
      const signed = await member.client.storage.from("offer-photos").createSignedUrl(photo.thumb_path, 60);
      expect(signed.error).toBeNull();
    }
    expect((await c.client.storage.from("offer-photos").createSignedUrl(photo.thumb_path, 60)).error).not.toBeNull();
    const orphans = await admin.rpc("storage_orphaned_files", { p_older_than: "0 seconds", p_limit: 5000 });
    expect((orphans.data as { path: string }[]).map((row) => row.path)).not.toContain(photo.thumb_path);
    // The accepted terms still show the old cover.
    expect((ok(await get(b, p.id)).revisions[0]?.gets[0] as unknown as { snapshot: { photo: { thumb_path: string } } }).snapshot.photo.thumb_path).toBe(photo.thumb_path);
  });
});

describe("idempotency", () => {
  it("returns the stored response for a repeated key and refuses a key reused for different terms", async () => {
    const { target, mine } = await setup();
    const key = newKey();
    const body = terms(target, [{ kind: "offer", offer_id: mine.id }]);
    const first = ok(await create(b, target, body, key));
    const again = ok(await create(b, target, body, key));
    expect(again.id).toBe(first.id);
    expect(failure(await create(b, target, { ...body, note: "different" }, key))).toMatchObject({ status: 422, code: "IDEMPOTENCY_KEY_REUSED" });
    const counterKey = newKey();
    const countered = ok(await counter(a, first, terms(target, [{ kind: "text", description: "A desk lamp" }]), counterKey));
    expect(ok(await counter(a, first, terms(target, [{ kind: "text", description: "A desk lamp" }]), counterKey)).revision).toBe(countered.revision);
    expect((await events(first.id)).map((e) => e.action)).toEqual(["create", "counter"]);
    expect(failure(await rpc(b.client, "proposal_create", { p_offer_id: target.id, p_terms: body })).code).toBe("IDEMPOTENCY_KEY_REQUIRED");
  });
});
