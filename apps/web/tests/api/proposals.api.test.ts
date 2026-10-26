import { beforeAll, describe, expect, it } from "vitest";
import * as offers from "@/app/api/v1/offers/route";
import * as offer from "@/app/api/v1/offers/[id]/route";
import * as publish from "@/app/api/v1/offers/[id]/publish/route";
import * as photos from "@/app/api/v1/offers/[id]/photos/route";
import * as offerProposals from "@/app/api/v1/offers/[id]/proposals/route";
import * as proposals from "@/app/api/v1/proposals/route";
import * as proposal from "@/app/api/v1/proposals/[id]/route";
import * as counter from "@/app/api/v1/proposals/[id]/counter/route";
import * as accept from "@/app/api/v1/proposals/[id]/accept/route";
import * as decline from "@/app/api/v1/proposals/[id]/decline/route";
import * as withdraw from "@/app/api/v1/proposals/[id]/withdraw/route";
import * as agreement from "@/app/api/v1/agreements/[id]/route";
import {
  PUBLISHABLE_FIELDS,
  call,
  expectations,
  member,
  phoneJpeg,
  photoForm,
  randomUUID,
  type ApiMember,
} from "./support";

// Milestone 3, unit 14: the proposal API (specs/milestone-3.md, API)
// against the real route handlers and local Supabase.

let a: ApiMember; // offer owner
let b: ApiMember; // proposer
let c: ApiMember; // anyone else
let jpeg: Buffer;
beforeAll(async () => {
  [a, b, c] = await Promise.all([
    member("ada"),
    member("bayo"),
    member("chika"),
  ]);
  jpeg = await phoneJpeg(1200, 900);
});

type Offer = { id: string; status: string; revision: number };
type Item = {
  kind: string;
  offer_id?: string;
  description?: string;
  changed?: boolean;
  snapshot?: {
    title: string;
    photo: { url: string | null; thumb_url: string | null } | null;
  };
};
type Proposal = {
  id: string;
  status: string;
  revision: number;
  latest_revision_id: string;
  turn: string | null;
  viewer_role: string;
  agreement_id: string | null;
  actions: Record<string, boolean>;
  revisions: {
    id: string;
    number: number;
    author: string;
    gives: Item[];
    gets: Item[];
    cash: unknown;
    note: string;
  }[];
};

async function active(as: ApiMember, title = "Road bike"): Promise<Offer> {
  const created = await call<Offer>(offers.POST, "POST", "/api/v1/offers", {
    as,
    body: { ...PUBLISHABLE_FIELDS, title },
  });
  let current = created.body.data as Offer;
  const added = await call<Offer>(
    photos.POST,
    "POST",
    `/api/v1/offers/${current.id}/photos`,
    { as, form: photoForm(jpeg, current), params: { id: current.id } },
  );
  current = added.body.data as Offer;
  const live = await call<Offer>(
    publish.POST,
    "POST",
    `/api/v1/offers/${current.id}/publish`,
    { as, body: expectations(current), params: { id: current.id } },
  );
  expect(live.status).toBe(200);
  return live.body.data as Offer;
}

const send = (as: ApiMember, target: Offer, mine: Offer, extra: object = {}) =>
  call<Proposal>(proposals.POST, "POST", "/api/v1/proposals", {
    as,
    body: {
      offer_id: target.id,
      gives: [{ kind: "offer", offer_id: mine.id }],
      gets: [{ kind: "offer", offer_id: target.id }],
      ...extra,
    },
  });

const at = (id: string) => `/api/v1/proposals/${id}`;

describe("POST /api/v1/proposals and GET /api/v1/proposals/:id", () => {
  it("creates revision 1 with signed snapshot photos, and never returns ids, paths or emails", async () => {
    const [target, mine] = await Promise.all([
      active(a, "Canon camera"),
      active(b, "Road bike"),
    ]);
    const created = await send(b, target, mine, {
      gives: [
        { kind: "offer", offer_id: mine.id },
        { kind: "text", description: "A phone charger" },
      ],
      cash: { amount_naira: 20000, payer: "proposer" },
    });
    expect(created.status, JSON.stringify(created.body)).toBe(201);
    const p = created.body.data as Proposal;
    expect(p).toMatchObject({
      status: "open",
      revision: 1,
      turn: "owner",
      viewer_role: "proposer",
      actions: { withdraw: true, accept: false },
    });
    expect(p.revisions[0]).toMatchObject({
      author: "proposer",
      cash: { amount_naira: 20000, payer: "proposer" },
    });
    expect(p.revisions[0]?.gets[0]?.snapshot).toMatchObject({
      title: "Canon camera",
      photo: { thumb_url: expect.stringContaining("/storage/v1/object/sign/") },
    });
    // Signed photo links carry the storage path, as for every offer photo; nothing else may.
    const text = JSON.stringify(p, (key, value: unknown) =>
      key === "url" || key === "thumb_url" ? null : value,
    );
    expect(text).not.toMatch(
      /@example\.test|_path"|author_id|proposer_id|owner_id/,
    );
    expect(text).not.toContain(a.id);
    expect(text).not.toContain(b.id);

    const asOwner = await call<Proposal>(proposal.GET, "GET", at(p.id), {
      as: a,
      params: { id: p.id },
    });
    expect(asOwner.body.data).toMatchObject({
      viewer_role: "owner",
      turn: "owner",
      actions: { accept: true, counter: true, decline: true, withdraw: false },
    });
    expect(asOwner.headers.get("cache-control")).toBe("private, no-store");
    expect(
      (
        await call(proposal.GET, "GET", at(p.id), {
          as: c,
          params: { id: p.id },
        })
      ).status,
    ).toBe(404);
    expect(
      (await call(proposal.GET, "GET", at(p.id), { params: { id: p.id } }))
        .status,
    ).toBe(401);
    expect(
      (
        await call(proposal.GET, "GET", at("not-a-uuid"), {
          as: a,
          params: { id: "not-a-uuid" },
        })
      ).status,
    ).toBe(404);
  });

  it("refuses bad bodies, missing keys, the owner and a second open proposal with clear errors", async () => {
    const [target, mine] = await Promise.all([active(a), active(b)]);
    const bad = await send(b, target, mine, { gives: [] });
    expect(bad.status).toBe(422);
    expect(bad.body.error?.fields).toEqual({ gives: "Add at least one item." });
    const noKey = await call(proposals.POST, "POST", "/api/v1/proposals", {
      as: b,
      key: null,
      body: {},
    });
    expect(noKey.body.error?.code).toBe("IDEMPOTENCY_KEY_REQUIRED");
    const own = await send(a, target, mine);
    expect(own.status).toBe(403);
    expect(own.body.error).toMatchObject({
      reason: "own_offer",
      message: "You can't propose an exchange on your own offer.",
    });
    const notMine = await send(c, target, mine);
    expect(notMine.status).toBe(422);
    expect(notMine.body.error?.fields).toEqual({
      gives: "One of these offers is no longer available.",
    });
    const first = await send(b, target, mine);
    const second = await send(b, target, mine);
    expect(second.status).toBe(409);
    expect(second.body.error).toMatchObject({
      reason: "already_open",
      proposal_id: first.body.data?.id,
    });
    expect(
      (await call(proposals.POST, "POST", "/api/v1/proposals", { body: {} }))
        .status,
    ).toBe(401);
  });
});

describe("negotiating through the API", () => {
  it("counters, refuses a note-only counter, accepts the latest and shows the agreement", async () => {
    const [target, mine] = await Promise.all([active(a), active(b)]);
    let p = (await send(b, target, mine)).body.data as Proposal;
    const terms = (extra: object = {}) => ({
      expected_revision: p.revision,
      gives: [{ kind: "offer", offer_id: mine.id }],
      gets: [{ kind: "offer", offer_id: target.id }],
      ...extra,
    });

    const noteOnly = await call(counter.POST, "POST", `${at(p.id)}/counter`, {
      as: a,
      params: { id: p.id },
      body: terms({ note: "Add cash?" }),
    });
    expect(noteOnly.status).toBe(422);
    expect(noteOnly.body.error?.fields).toEqual({
      terms: "Change an item or the cash. A new note alone isn't new terms.",
    });
    const notYours = await call(counter.POST, "POST", `${at(p.id)}/counter`, {
      as: b,
      params: { id: p.id },
      body: terms({ cash: { amount_naira: 1, payer: "owner" } }),
    });
    expect(notYours.status).toBe(403);

    const countered = await call<Proposal>(
      counter.POST,
      "POST",
      `${at(p.id)}/counter`,
      {
        as: a,
        params: { id: p.id },
        body: terms({
          cash: { amount_naira: 5000, payer: "proposer" },
          note: "With ₦5,000 from you.",
        }),
      },
    );
    expect(countered.status).toBe(200);
    const stale = p;
    p = countered.body.data as Proposal;
    expect(p).toMatchObject({
      revision: 2,
      turn: "proposer",
      revisions: [
        { author: "proposer" },
        { author: "owner", note: "With ₦5,000 from you." },
      ],
    });

    const staleAccept = await call(accept.POST, "POST", `${at(p.id)}/accept`, {
      as: b,
      params: { id: p.id },
      body: { revision_id: stale.latest_revision_id },
    });
    expect(staleAccept.status).toBe(409);
    expect(staleAccept.body.error).toMatchObject({
      reason: "stale_revision",
      current_revision: 2,
    });

    const accepted = await call<Proposal>(
      accept.POST,
      "POST",
      `${at(p.id)}/accept`,
      {
        as: b,
        params: { id: p.id },
        body: { revision_id: p.latest_revision_id },
      },
    );
    expect(accepted.status).toBe(200);
    expect(accepted.body.data).toMatchObject({
      status: "accepted",
      turn: null,
      agreement_id: expect.any(String),
    });
    const agreementId = accepted.body.data?.agreement_id as string;
    const read = await call(
      agreement.GET,
      "GET",
      `/api/v1/agreements/${agreementId}`,
      { as: a, params: { id: agreementId } },
    );
    expect(read.body.data).toMatchObject({
      viewer_role: "owner",
      listing_changed: false,
      // Version 1 of the agreement is the accepted revision (Milestone 4).
      versions: [
        {
          number: 1,
          outcome: "binding",
          cash: { amount_naira: 5000, payer: "proposer" },
        },
      ],
    });
    const hidden = await call(
      agreement.GET,
      "GET",
      `/api/v1/agreements/${agreementId}`,
      { as: c, params: { id: agreementId } },
    );
    expect(hidden.status).toBe(404);
    expect(hidden.body.error?.message).toBe("This agreement isn't available.");

    const closed = await call<{ proposals: { id: string }[] }>(
      proposals.GET,
      "GET",
      "/api/v1/proposals",
      { as: b, query: "?box=closed" },
    );
    // An accepted proposal lives under its agreement, not Closed (A6).
    expect(closed.body.data?.proposals.map((row) => row.id)).not.toContain(
      p.id,
    );
  });

  it("reports TERMS_CHANGED after a material edit, and flags the changed item", async () => {
    const [target, mine] = await Promise.all([active(a), active(b)]);
    const p = (await send(b, target, mine)).body.data as Proposal;
    const current = (
      await call<Offer>(offer.GET, "GET", `/api/v1/offers/${mine.id}`, {
        as: b,
        params: { id: mine.id },
      })
    ).body.data as Offer;
    const edited = await call(
      offer.PATCH,
      "PATCH",
      `/api/v1/offers/${mine.id}`,
      {
        as: b,
        params: { id: mine.id },
        body: {
          ...expectations(current),
          fields: { title: "Road bike, serviced" },
        },
      },
    );
    expect(edited.status, JSON.stringify(edited.body)).toBe(200);
    const seen = (
      await call<Proposal>(proposal.GET, "GET", at(p.id), {
        as: a,
        params: { id: p.id },
      })
    ).body.data as Proposal;
    expect(seen.revisions[0]?.gives[0]).toMatchObject({
      changed: true,
      snapshot: { title: "Road bike" },
    });
    const refused = await call(accept.POST, "POST", `${at(p.id)}/accept`, {
      as: a,
      params: { id: p.id },
      body: { revision_id: p.latest_revision_id },
    });
    expect(refused.status).toBe(409);
    expect(refused.body.error).toMatchObject({
      code: "TERMS_CHANGED",
      offer_ids: [mine.id],
    });
  });

  it("declines and withdraws with the revision the member saw", async () => {
    const [target, mine] = await Promise.all([active(a), active(b)]);
    const p = (await send(b, target, mine)).body.data as Proposal;
    const wrong = await call(decline.POST, "POST", `${at(p.id)}/decline`, {
      as: a,
      params: { id: p.id },
      body: { expected_revision: 7 },
    });
    expect(wrong.status).toBe(409);
    const notAuthor = await call(
      withdraw.POST,
      "POST",
      `${at(p.id)}/withdraw`,
      { as: a, params: { id: p.id }, body: { expected_revision: 1 } },
    );
    expect(notAuthor.body.error?.reason).toBe("not_author");
    const key = randomUUID();
    const done = await call<Proposal>(
      withdraw.POST,
      "POST",
      `${at(p.id)}/withdraw`,
      { as: b, key, params: { id: p.id }, body: { expected_revision: 1 } },
    );
    expect(done.body.data?.status).toBe("withdrawn");
    const replay = await call<Proposal>(
      withdraw.POST,
      "POST",
      `${at(p.id)}/withdraw`,
      { as: b, key, params: { id: p.id }, body: { expected_revision: 1 } },
    );
    expect(replay.status).toBe(200);
    expect(replay.body.data?.status).toBe("withdrawn");
  });
});

describe("lists", () => {
  it("files proposals under the right tab and pages with a cursor", async () => {
    const [mine] = await Promise.all([active(b)]);
    const targets = await Promise.all([active(a), active(a), active(a)]);
    for (const target of targets)
      expect((await send(b, target, mine)).status).toBe(201);
    const turn = await call<{
      proposals: { id: string; turn: string; latest: { gives: Item[] } }[];
    }>(proposals.GET, "GET", "/api/v1/proposals", {
      as: a,
      query: "?box=turn",
    });
    expect(turn.body.data?.proposals.length).toBeGreaterThanOrEqual(3);
    expect(turn.body.data?.proposals[0]).toMatchObject({
      turn: "owner",
      latest: { gives: [{ kind: "offer", snapshot: { title: "Road bike" } }] },
    });
    const waiting = await call<{ proposals: { id: string }[] }>(
      proposals.GET,
      "GET",
      "/api/v1/proposals",
      { as: b, query: "?box=waiting" },
    );
    expect(waiting.body.data?.proposals.length).toBeGreaterThanOrEqual(3);
    expect(
      (
        await call(proposals.GET, "GET", "/api/v1/proposals", {
          as: c,
          query: "?box=waiting",
        })
      ).body.data,
    ).toEqual({ proposals: [], next_cursor: null });
    expect(
      (
        await call(proposals.GET, "GET", "/api/v1/proposals", {
          as: a,
          query: "?box=everything",
        })
      ).status,
    ).toBe(422);
    expect(
      (
        await call(proposals.GET, "GET", "/api/v1/proposals", {
          as: a,
          query: "?box=turn&cursor=bad",
        })
      ).status,
    ).toBe(422);

    // Paging: the server returns at most 20, so check the cursor round trip directly.
    const { encodeCursor, listProposalsFor } =
      await import("@/server/api/proposals");
    const { createClient } = await import("@supabase/supabase-js");
    const client = createClient(
      process.env.SUPABASE_URL ?? "",
      process.env.SUPABASE_ANON_KEY ?? "",
      {
        global: { headers: { Authorization: `Bearer ${a.token}` } },
        auth: { persistSession: false, autoRefreshToken: false },
      },
    );
    const caller = {
      client,
      user: { id: a.id } as never,
      via: "bearer" as const,
    };
    const all = await listProposalsFor(caller, "turn");
    const ids = all.proposals.map((row) => row.id);
    const [first] = all.proposals;
    if (!first) throw new Error("expected proposals");
    const after = await listProposalsFor(
      caller,
      "turn",
      encodeCursor({ updated_at: first.updated_at, id: first.id }),
    );
    expect(after.proposals.map((row) => row.id)).toEqual(ids.slice(1));
  });

  it("lets only the owner list the proposals on their offer", async () => {
    const [target, mine] = await Promise.all([active(a), active(b)]);
    const p = (await send(b, target, mine)).body.data as Proposal;
    const own = await call<{ proposals: { id: string }[] }>(
      offerProposals.GET,
      "GET",
      `/api/v1/offers/${target.id}/proposals`,
      { as: a, params: { id: target.id } },
    );
    expect(own.body.data?.proposals.map((row) => row.id)).toEqual([p.id]);
    expect(
      (
        await call(
          offerProposals.GET,
          "GET",
          `/api/v1/offers/${target.id}/proposals`,
          { as: b, params: { id: target.id } },
        )
      ).status,
    ).toBe(403);
  });
});
