import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type pg from "pg";
import { connect, createMember, createOffer, edit, failure, newKey, offerIn, ok, rpc, type Member } from "./support/db.ts";
import { AMBIGUOUS, CONTACT, ORDINARY } from "./fixtures/contact-messages.ts";

// Milestone 7: keeping contact details in BATR against the real database
// (specs/milestone-7-contact-details.md, C1–C9 and Acceptance 1–6).

let db: pg.Client;
let a: Member; // offer owner
let b: Member; // proposer

beforeAll(async () => {
  db = await connect();
  [a, b] = await Promise.all([createMember("ada"), createMember("bayo")]);
});
afterAll(async () => {
  await db.end();
});

const check = async (texts: string[]) =>
  (await db.query<{ t: string; k: string }>("select t, private.contact_check(t) as k from unnest($1::text[]) t", [texts])).rows;

async function proposed(note = "") {
  const [target, mine] = await Promise.all([offerIn(a, "active"), offerIn(b, "active")]);
  return {
    target,
    mine,
    result: await rpc<{ id: string; latest_revision_id: string }>(b.client, "proposal_create", {
      p_offer_id: target.id,
      p_terms: { gives: [{ kind: "offer", offer_id: mine.id }], gets: [{ kind: "offer", offer_id: target.id }], cash: null, note },
      p_idempotency_key: newKey(),
    }),
  };
}

const send = (member: Member, proposalId: string, body: string, key = newKey()) =>
  rpc(member.client, "message_send", { p_proposal_id: proposalId, p_body: body, p_idempotency_key: key });

const refusedOutcomes = async (memberId: string) =>
  Number((await db.query("select count(*) from private.contact_attempts where member_id = $1 and outcome = 'refused'", [memberId])).rows[0].count);

describe("the test set (Acceptance 2)", () => {
  it("has at least 200 realistic messages", () => {
    expect(CONTACT.length + AMBIGUOUS.length + ORDINARY.length).toBeGreaterThanOrEqual(200);
  });

  it("catches at least 95% of contact details", async () => {
    const rows = await check(CONTACT);
    const missed = rows.filter((r) => !["phone", "email", "link"].includes(r.k));
    expect(missed.map((r) => r.t)).toEqual([]);
    expect((rows.length - missed.length) / rows.length).toBeGreaterThanOrEqual(0.95);
  });

  it("refuses no more than 2% of ordinary messages", async () => {
    const rows = await check(ORDINARY);
    const blocked = rows.filter((r) => ["phone", "email", "link"].includes(r.k));
    expect(blocked.map((r) => r.t)).toEqual([]);
    expect(blocked.length / rows.length).toBeLessThanOrEqual(0.02);
  });

  it("marks handles, short numbers and plain web addresses as ambiguous, not refused", async () => {
    const rows = await check(AMBIGUOUS);
    expect(rows.filter((r) => r.k !== "ambiguous").map((r) => `${r.t} → ${r.k}`)).toEqual([]);
  });
});

describe("every write path (C1, Acceptance 1)", () => {
  it("refuses a message with a phone number, saves nothing and notifies no one", async () => {
    const { result } = await proposed();
    const proposal = ok(result);
    const before = Number((await db.query("select count(*) from public.notifications where proposal_id = $1", [proposal.id])).rows[0].count);
    const refused = failure(await send(b, proposal.id, "call me 0803 123 4567"));
    expect(refused).toMatchObject({ status: 422, code: "CONTACT_DETAILS", detail: { kind: "phone", field: "body", location: "message" } });
    const { rows } = await db.query("select count(*) from public.messages where proposal_id = $1 and kind = 'text'", [proposal.id]);
    expect(Number(rows[0].count)).toBe(0);
    const after = Number((await db.query("select count(*) from public.notifications where proposal_id = $1", [proposal.id])).rows[0].count);
    expect(after).toBe(before);
  });

  it("gives the same refusal on a retry with the same key (Acceptance 6)", async () => {
    const { result } = await proposed();
    const proposal = ok(result);
    const key = newKey();
    const first = failure(await send(b, proposal.id, "ada.obi@gmail.com", key));
    const again = failure(await send(b, proposal.id, "ada.obi@gmail.com", key));
    expect(again).toEqual(first);
  });

  it("sends ambiguous text", async () => {
    const { result } = await proposed();
    ok(await send(b, ok(result).id, "find me @bayo_store"));
  });

  it("refuses a proposal note, a described item and a cancel reason", async () => {
    expect(failure((await proposed("WhatsApp me on 08031234567")).result)).toMatchObject({ code: "CONTACT_DETAILS", detail: { field: "note", location: "note" } });

    const [target] = await Promise.all([offerIn(a, "active")]);
    const described = await rpc(b.client, "proposal_create", {
      p_offer_id: target.id,
      p_terms: { gives: [{ kind: "text", description: "Phone repair, call 0905 444 5555" }], gets: [{ kind: "offer", offer_id: target.id }], cash: null, note: "" },
      p_idempotency_key: newKey(),
    });
    expect(failure(described)).toMatchObject({ code: "CONTACT_DETAILS", detail: { field: "terms", location: "terms" } });

    const proposal = ok((await proposed()).result);
    const accepted = ok(
      await rpc<{ agreement_id: string }>(a.client, "proposal_accept", {
        p_proposal_id: proposal.id,
        p_revision_id: proposal.latest_revision_id,
        p_idempotency_key: newKey(),
      }),
    );
    const cancel = await rpc(a.client, "agreement_cancel_request", {
      p_agreement_id: accepted.agreement_id,
      p_reason: "Text me on tolu[at]outlook.com",
      p_idempotency_key: newKey(),
    });
    expect(failure(cancel)).toMatchObject({ code: "CONTACT_DETAILS", detail: { field: "reason", kind: "email" } });
  });

  it("refuses an offer's title or description, but lets an untouched old value stay", async () => {
    const created = await rpc(a.client, "offer_create", { p_fields: { title: "Bike, call 08031234567" }, p_idempotency_key: newKey() });
    expect(failure(created)).toMatchObject({ code: "CONTACT_DETAILS", detail: { field: "title", location: "offer" } });

    const offer = await createOffer(a, { title: "Road bike" });
    expect(failure(await edit(a, offer, { description: "see wa.me/2348031234567" }))).toMatchObject({
      code: "CONTACT_DETAILS",
      detail: { field: "description", kind: "link" },
    });
    // A value saved before the check isn't re-checked when another field changes.
    await db.query("alter table public.offers disable trigger offers_contact_details");
    await db.query("update public.offers set description = 'old 08031234567' where id = $1", [offer.id]);
    await db.query("alter table public.offers enable trigger offers_contact_details");
    const fresh = (await db.query("select revision from public.offers where id = $1", [offer.id])).rows[0];
    ok(await edit(a, { ...offer, revision: fresh.revision }, { title: "Road bike, steel frame" }));
  });

  it("refuses a display name with contact details", async () => {
    expect(failure(await rpc(a.client, "profile_set_display_name", { p_display_name: "Ada 08031234567" }))).toMatchObject({ status: 422 });
  });
});

describe("counting and the automatic report (C6, C7, Acceptance 4–5)", () => {
  it("records attempts without the text and opens one report on the third", async () => {
    const member = await createMember("tolu");
    for (const kind of ["phone", "email"]) ok(await rpc(member.client, "contact_attempt_record", { p_location: "message", p_kind: kind }));
    let reports = await db.query("select * from public.reports where member_id = $1", [member.id]);
    expect(reports.rows).toHaveLength(0);

    ok(await rpc(member.client, "contact_attempt_record", { p_location: "note", p_kind: "phone" }));
    ok(await rpc(member.client, "contact_attempt_record", { p_location: "message", p_kind: "link" }));
    reports = await db.query("select * from public.reports where member_id = $1", [member.id]);
    expect(reports.rows).toHaveLength(1);
    expect(reports.rows[0]).toMatchObject({ reporter_id: null, reason: "contact_details", subject_type: "member", status: "open" });
    expect(reports.rows[0].details).toBe("Refused attempts to share contact details in the last 24 hours: email 1, phone 2.");

    expect(await refusedOutcomes(member.id)).toBe(4);
    const columns = (await db.query("select column_name from information_schema.columns where table_schema = 'private' and table_name = 'contact_attempts'")).rows.map((r) => r.column_name);
    expect(columns.sort()).toEqual(["created_at", "id", "kind", "location", "member_id", "outcome"]);
  });

  it("counts a warning for ambiguous text and returns the kind", async () => {
    const member = await createMember("kemi");
    expect(ok(await rpc<string>(member.client, "contact_warning", { p_location: "message", p_text: "follow @kemi.braids" }))).toBe("ambiguous");
    expect(ok(await rpc<string>(member.client, "contact_warning", { p_location: "message", p_text: "see you at 4" }))).toBe("none");
    const { rows } = await db.query("select outcome, kind from private.contact_attempts where member_id = $1", [member.id]);
    expect(rows).toEqual([{ outcome: "warned", kind: "ambiguous" }]);
  });

  it("members can't read attempts or choose the automatic reason", async () => {
    const { error } = await a.client.schema("private" as never).from("contact_attempts").select("*");
    expect(error).not.toBeNull();
    const offer = await offerIn(b, "active");
    const filed = await rpc(a.client, "report_create", { p_subject_type: "offer", p_offer_id: offer.id, p_reason: "contact_details", p_details: "", p_idempotency_key: newKey() });
    expect(failure(filed).status).toBe(422);
  });

  it("the purge removes attempts older than 180 days", async () => {
    const member = await createMember("old");
    await db.query("insert into private.contact_attempts (member_id, location, kind, outcome, created_at) values ($1, 'message', 'phone', 'refused', now() - interval '181 days')", [member.id]);
    await db.query("select public.contact_attempts_purge()");
    expect(await refusedOutcomes(member.id)).toBe(0);
  });
});
