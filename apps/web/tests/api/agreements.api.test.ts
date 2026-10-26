import { beforeAll, describe, expect, it } from "vitest";
import * as offers from "@/app/api/v1/offers/route";
import * as publish from "@/app/api/v1/offers/[id]/publish/route";
import * as photos from "@/app/api/v1/offers/[id]/photos/route";
import * as proposals from "@/app/api/v1/proposals/route";
import * as accept from "@/app/api/v1/proposals/[id]/accept/route";
import * as agreements from "@/app/api/v1/agreements/route";
import * as agreement from "@/app/api/v1/agreements/[id]/route";
import * as handover from "@/app/api/v1/agreements/[id]/handover/route";
import * as changes from "@/app/api/v1/agreements/[id]/changes/route";
import * as acceptChange from "@/app/api/v1/agreements/[id]/changes/[versionId]/accept/route";
import * as rejectChange from "@/app/api/v1/agreements/[id]/changes/[versionId]/reject/route";
import * as cancellation from "@/app/api/v1/agreements/[id]/cancellation/route";
import * as acceptCancel from "@/app/api/v1/agreements/[id]/cancellation/accept/route";
import * as rejectCancel from "@/app/api/v1/agreements/[id]/cancellation/reject/route";
import {
  PUBLISHABLE_FIELDS,
  call,
  expectations,
  member,
  phoneJpeg,
  photoForm,
  type ApiMember,
} from "./support";

// Milestone 4, unit 18: the agreement API (specs/milestone-4.md, API)
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
type Item = { kind: string; offer_id?: string; description?: string };
type Version = {
  id: string;
  number: number;
  proposed_by: string;
  outcome: string;
  gives: Item[];
  gets: Item[];
  cash: { amount_naira: number; payer: string } | null;
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
  actions: Record<string, boolean>;
  waits_on_viewer: boolean;
  versions: Version[];
  cancellation: { id: string; requested_by: string; reason: string } | null;
};

async function active(as: ApiMember, title: string): Promise<Offer> {
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
  return live.body.data as Offer;
}

/** B proposes their bike and ₦20,000 for A's camera; A accepts. */
async function agreed(): Promise<{ target: Offer; mine: Offer; agreement: Agreement }> {
  const [target, mine] = await Promise.all([
    active(a, "Canon camera"),
    active(b, "Road bike"),
  ]);
  const sent = await call<{ id: string; latest_revision_id: string }>(
    proposals.POST,
    "POST",
    "/api/v1/proposals",
    {
      as: b,
      body: {
        offer_id: target.id,
        gives: [{ kind: "offer", offer_id: mine.id }],
        gets: [{ kind: "offer", offer_id: target.id }],
        cash: { amount_naira: 20000, payer: "proposer" },
      },
    },
  );
  const p = sent.body.data as { id: string; latest_revision_id: string };
  const accepted = await call<{ agreement_id: string }>(
    accept.POST,
    "POST",
    `/api/v1/proposals/${p.id}/accept`,
    { as: a, body: { revision_id: p.latest_revision_id }, params: { id: p.id } },
  );
  const id = accepted.body.data?.agreement_id as string;
  return { target, mine, agreement: await read(a, id) };
}

const at = (id: string) => `/api/v1/agreements/${id}`;

async function read(as: ApiMember, id: string): Promise<Agreement> {
  const result = await call<Agreement>(agreement.GET, "GET", at(id), {
    as,
    params: { id },
  });
  expect(result.status, JSON.stringify(result.body)).toBe(200);
  return result.body.data as Agreement;
}

const binding = (ag: Agreement) =>
  ag.versions.find((v) => v.id === ag.binding_version_id) as Version;

describe("GET /api/v1/agreements and /api/v1/agreements/:id", () => {
  it("shows the two parties their agreement with roles, never ids, paths or emails", async () => {
    const { agreement: ag } = await agreed();
    expect(ag).toMatchObject({
      status: "active",
      viewer_role: "owner",
      confirmed_by: [],
      pending_by: null,
      waits_on_viewer: false,
      actions: { handover: true, propose_change: true, request_cancel: true, accept_change: false },
    });
    expect(binding(ag)).toMatchObject({ number: 1, proposed_by: "proposer", outcome: "binding" });
    const text = JSON.stringify(ag, (key, value: unknown) =>
      key === "url" || key === "thumb_url" ? null : value,
    );
    expect(text).not.toMatch(/@example\.test|_path"|proposer_id|owner_id/);
    expect(text).not.toContain(a.id);
    expect(text).not.toContain(b.id);

    const hidden = await call(agreement.GET, "GET", at(ag.id), {
      as: c,
      params: { id: ag.id },
    });
    expect(hidden.status).toBe(404);
    expect(hidden.body.error?.message).toBe("This agreement isn't available.");
    const signedOut = await call(agreement.GET, "GET", at(ag.id), {
      params: { id: ag.id },
    });
    expect(signedOut.status).toBe(401);

    const list = await call<{ agreements: { id: string }[] }>(
      agreements.GET,
      "GET",
      "/api/v1/agreements",
      { as: b, query: "?box=active" },
    );
    expect(list.body.data?.agreements.map((row) => row.id)).toContain(ag.id);
    const bad = await call(agreements.GET, "GET", "/api/v1/agreements", {
      as: b,
      query: "?box=everything",
    });
    expect(bad.status).toBe(422);
  });
});

describe("writes", () => {
  it("confirms handover by both and completes; needs an idempotency key", async () => {
    const { agreement: ag } = await agreed();
    const body = { version_id: ag.binding_version_id };
    const noKey = await call(handover.POST, "POST", `${at(ag.id)}/handover`, {
      as: a,
      key: null,
      body,
      params: { id: ag.id },
    });
    expect(noKey.status).toBe(400);
    const first = await call<Agreement>(handover.POST, "POST", `${at(ag.id)}/handover`, {
      as: a,
      body,
      params: { id: ag.id },
    });
    expect(first.body.data).toMatchObject({ status: "active", confirmed_by: ["owner"], actions: { handover: false, propose_change: false } });
    expect((await read(b, ag.id)).waits_on_viewer).toBe(true);
    const second = await call<Agreement>(handover.POST, "POST", `${at(ag.id)}/handover`, {
      as: b,
      body,
      params: { id: ag.id },
    });
    expect(second.body.data).toMatchObject({ status: "completed", confirmed_by: ["owner", "proposer"] });
    const closed = await call<{ agreements: { id: string }[] }>(
      agreements.GET,
      "GET",
      "/api/v1/agreements",
      { as: a, query: "?box=closed" },
    );
    expect(closed.body.data?.agreements.map((row) => row.id)).toContain(ag.id);
  });

  it("proposes a change, refuses a stale or own acceptance, and accepts or rejects it", async () => {
    const { target, mine, agreement: ag } = await agreed();
    const terms = (amount: number) => ({
      expected_version: 1,
      gives: [{ kind: "offer", offer_id: mine.id }],
      gets: [{ kind: "offer", offer_id: target.id }],
      cash: { amount_naira: amount, payer: "proposer" },
    });
    const noteOnly = await call(changes.POST, "POST", `${at(ag.id)}/changes`, {
      as: b,
      body: { ...terms(20000), note: "Same again" },
      params: { id: ag.id },
    });
    expect(noteOnly.status).toBe(422);
    expect(noteOnly.body.error?.fields).toEqual({
      terms: "Change an item or the cash. A new note alone isn't new terms.",
    });
    const proposed = await call<Agreement>(changes.POST, "POST", `${at(ag.id)}/changes`, {
      as: b,
      body: terms(15000),
      params: { id: ag.id },
    });
    expect(proposed.status, JSON.stringify(proposed.body)).toBe(200);
    expect(proposed.body.data).toMatchObject({ status: "amendment_pending", pending_by: "proposer" });
    const pending = proposed.body.data?.versions.find((v) => v.outcome === "pending") as Version;

    const own = await call(acceptChange.POST, "POST", `${at(ag.id)}/changes/${pending.id}/accept`, {
      as: b,
      params: { id: ag.id, versionId: pending.id },
    });
    expect(own.status).toBe(403);
    expect(own.body.error?.message).toBe("Only the other member can accept or reject your change.");
    const stale = await call(acceptChange.POST, "POST", `${at(ag.id)}/changes/${ag.binding_version_id}/accept`, {
      as: a,
      params: { id: ag.id, versionId: ag.binding_version_id },
    });
    expect(stale.status).toBe(409);
    expect(stale.body.error).toMatchObject({ reason: "stale_version" });

    const accepted = await call<Agreement>(acceptChange.POST, "POST", `${at(ag.id)}/changes/${pending.id}/accept`, {
      as: a,
      params: { id: ag.id, versionId: pending.id },
    });
    expect(accepted.body.data).toMatchObject({ status: "active", binding_version_id: pending.id });
    expect(binding(accepted.body.data as Agreement).cash).toEqual({ amount_naira: 15000, payer: "proposer" });

    const again = await call<Agreement>(changes.POST, "POST", `${at(ag.id)}/changes`, {
      as: a,
      body: { ...terms(12000), expected_version: 2 },
      params: { id: ag.id },
    });
    const next = again.body.data?.versions.find((v) => v.outcome === "pending") as Version;
    const rejected = await call<Agreement>(rejectChange.POST, "POST", `${at(ag.id)}/changes/${next.id}/reject`, {
      as: b,
      params: { id: ag.id, versionId: next.id },
    });
    expect(rejected.body.data).toMatchObject({ status: "active", binding_version_id: pending.id });
  });

  it("asks to cancel with a reason; the other member keeps or ends the agreement", async () => {
    const { agreement: ag } = await agreed();
    const short = await call(cancellation.POST, "POST", `${at(ag.id)}/cancellation`, {
      as: a,
      body: { reason: "no" },
      params: { id: ag.id },
    });
    expect(short.status).toBe(422);
    expect(short.body.error?.fields).toEqual({ reason: "Give a reason of at least 3 characters." });
    const asked = await call<Agreement>(cancellation.POST, "POST", `${at(ag.id)}/cancellation`, {
      as: a,
      body: { reason: "The lens is cracked." },
      params: { id: ag.id },
    });
    expect(asked.body.data).toMatchObject({
      status: "cancellation_requested",
      cancel_requested_by: "owner",
      cancellation: { requested_by: "owner", reason: "The lens is cracked." },
    });
    const requestId = asked.body.data?.cancellation?.id as string;
    expect((await read(b, ag.id)).actions).toMatchObject({ accept_cancel: true, reject_cancel: true, withdraw_cancel: false });
    const kept = await call<Agreement>(rejectCancel.POST, "POST", `${at(ag.id)}/cancellation/reject`, {
      as: b,
      body: { request_id: requestId },
      params: { id: ag.id },
    });
    expect(kept.body.data?.status).toBe("active");

    const again = await call<Agreement>(cancellation.POST, "POST", `${at(ag.id)}/cancellation`, {
      as: b,
      body: { reason: "Found another camera" },
      params: { id: ag.id },
    });
    const ended = await call<Agreement>(acceptCancel.POST, "POST", `${at(ag.id)}/cancellation/accept`, {
      as: a,
      body: { request_id: again.body.data?.cancellation?.id },
      params: { id: ag.id },
    });
    expect(ended.body.data).toMatchObject({ status: "cancelled", actions: { handover: false, request_cancel: false } });
    const late = await call(handover.POST, "POST", `${at(ag.id)}/handover`, {
      as: a,
      body: { version_id: ag.binding_version_id },
      params: { id: ag.id },
    });
    expect(late.status).toBe(409);
    expect(late.body.error?.message).toBe("This agreement has changed. Refresh to see the latest before you act.");
  });
});
