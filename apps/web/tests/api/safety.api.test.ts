import type pg from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import * as offers from "@/app/api/v1/offers/route";
import * as offer from "@/app/api/v1/offers/[id]/route";
import * as publish from "@/app/api/v1/offers/[id]/publish/route";
import * as photos from "@/app/api/v1/offers/[id]/photos/route";
import * as proposals from "@/app/api/v1/proposals/route";
import * as messages from "@/app/api/v1/proposals/[id]/messages/route";
import * as blocks from "@/app/api/v1/blocks/route";
import * as unblock from "@/app/api/v1/blocks/[id]/route";
import * as reports from "@/app/api/v1/reports/route";
import * as queue from "@/app/api/v1/moderation/reports/route";
import * as report from "@/app/api/v1/moderation/reports/[id]/route";
import * as act from "@/app/api/v1/moderation/reports/[id]/actions/route";
import * as suspensions from "@/app/api/v1/moderation/suspensions/route";
import * as lift from "@/app/api/v1/moderation/suspensions/[id]/lift/route";
import {
  PUBLISHABLE_FIELDS,
  call,
  connect,
  expectations,
  member,
  phoneJpeg,
  photoForm,
  type ApiMember,
} from "./support";

// Milestone 6, unit 24: blocking, reports and moderation through the
// real route handlers (specs/milestone-6.md).

let a: ApiMember; // offer owner
let b: ApiMember; // proposer
let mod: ApiMember; // moderator
let jpeg: Buffer;
let db: pg.Client;

beforeAll(async () => {
  [a, b, mod] = await Promise.all([member("ada"), member("bayo"), member("mo")]);
  jpeg = await phoneJpeg(1200, 900);
  db = await connect();
  await db.query("insert into private.staff_roles (member_id, role) values ($1, 'moderator')", [mod.id]);
});
afterAll(async () => {
  await db.end();
});

type Offer = { id: string; status: string; revision: number; removed_at?: string | null };

async function active(as: ApiMember, title: string): Promise<Offer> {
  const created = await call<Offer>(offers.POST, "POST", "/api/v1/offers", { as, body: { ...PUBLISHABLE_FIELDS, title } });
  let current = created.body.data as Offer;
  const added = await call<Offer>(photos.POST, "POST", `/api/v1/offers/${current.id}/photos`, {
    as,
    form: photoForm(jpeg, current),
    params: { id: current.id },
  });
  current = added.body.data as Offer;
  const live = await call<Offer>(publish.POST, "POST", `/api/v1/offers/${current.id}/publish`, {
    as,
    body: expectations(current),
    params: { id: current.id },
  });
  if (!live.body.data) throw new Error(JSON.stringify([created.body, added.body.error, live.body.error]));
  return live.body.data as Offer;
}

const propose = (as: ApiMember, target: Offer, mine: Offer) =>
  call<{ id: string; status: string }>(proposals.POST, "POST", "/api/v1/proposals", {
    as,
    body: { offer_id: target.id, gives: [{ kind: "offer", offer_id: mine.id }], gets: [{ kind: "offer", offer_id: target.id }] },
  });

const fileReport = (as: ApiMember, body: unknown) => call<{ id: string; status: string }>(reports.POST, "POST", "/api/v1/reports", { as, body });

describe("blocking", () => {
  it("stops proposals and messages both ways, hides offers, and unblocks", async () => {
    const [target, mine] = await Promise.all([active(a, "Blender"), active(b, "Kettle")]);
    const proposal = (await propose(b, target, mine)).body.data as { id: string };

    const blocked = await call<{ blocked: boolean; display_name: string }>(blocks.POST, "POST", "/api/v1/blocks", {
      as: a,
      body: { proposal_id: proposal.id },
    });
    expect(blocked.status).toBe(201);
    expect(blocked.body.data).toMatchObject({ blocked: true });
    expect(JSON.stringify(blocked.body)).not.toContain(b.id);

    const sent = await call(messages.POST, "POST", `/api/v1/proposals/${proposal.id}/messages`, {
      as: b,
      body: { body: "Hello?" },
      params: { id: proposal.id },
    });
    // The block declined the proposal, so its conversation is closed.
    expect(sent.status).toBe(409);
    expect(sent.body.error).toMatchObject({ reason: "thread_closed" });

    const again = await propose(b, target, mine);
    expect(again.status).toBe(403);
    expect(again.body.error).toMatchObject({ reason: "member_unavailable", message: "This member isn't available." });

    const hidden = await call(offer.GET, "GET", `/api/v1/offers/${target.id}`, { as: b, params: { id: target.id } });
    expect(hidden.status).toBe(404);

    const list = await call<{ blocks: { id: string; display_name: string }[] }>(blocks.GET, "GET", "/api/v1/blocks", { as: a });
    expect(list.body.data?.blocks).toHaveLength(1);
    expect(JSON.stringify(list.body)).not.toContain(b.id);
    const blockId = list.body.data?.blocks[0]?.id as string;

    expect((await call(unblock.DELETE, "DELETE", `/api/v1/blocks/${blockId}`, { as: b, params: { id: blockId } })).status).toBe(404);
    const undone = await call(unblock.DELETE, "DELETE", `/api/v1/blocks/${blockId}`, { as: a, params: { id: blockId } });
    expect(undone.status).toBe(200);
    expect((await call(offer.GET, "GET", `/api/v1/offers/${target.id}`, { as: b, params: { id: target.id } })).status).toBe(200);
  });

  it("refuses blocking yourself and a body naming no one", async () => {
    const own = await active(a, "Desk lamp");
    const self = await call(blocks.POST, "POST", "/api/v1/blocks", { as: a, body: { offer_id: own.id } });
    expect(self.status).toBe(403);
    expect(self.body.error).toMatchObject({ reason: "own" });
    expect((await call(blocks.POST, "POST", "/api/v1/blocks", { as: a, body: {} })).status).toBe(422);
    expect((await call(blocks.POST, "POST", "/api/v1/blocks", { body: { offer_id: own.id } })).status).toBe(401);
  });
});

describe("reports", () => {
  it("files a report once, lists it as Received, and checks the reason", async () => {
    const target = await active(a, "Phone charger");
    const missing = await fileReport(b, { subject_type: "offer", offer_id: target.id, reason: "other", details: "short" });
    expect(missing.status).toBe(422);
    expect(missing.body.error?.fields).toHaveProperty("details");

    const filed = await fileReport(b, { subject_type: "offer", offer_id: target.id, reason: "scam", details: "Asks for payment first." });
    expect(filed.status).toBe(201);
    expect(filed.body.data).toMatchObject({ status: "received" });

    const twice = await fileReport(b, { subject_type: "offer", offer_id: target.id, reason: "spam" });
    expect(twice.status).toBe(409);
    expect(twice.body.error).toMatchObject({ reason: "already_reported" });

    const mine = await call<{ reports: { id: string; status: string; label: string }[] }>(reports.GET, "GET", "/api/v1/reports", { as: b });
    expect(mine.body.data?.reports.find((r) => r.id === filed.body.data?.id)).toMatchObject({ status: "received", label: "Phone charger" });
    expect(JSON.stringify(mine.body)).not.toContain(a.id);
  });
});

describe("moderation", () => {
  it("is 404 for members, and lets a moderator remove an offer and suspend a member", async () => {
    const target = await active(a, "Fake watch");
    const filed = (await fileReport(b, { subject_type: "offer", offer_id: target.id, reason: "misleading" })).body.data as { id: string };

    expect((await call(queue.GET, "GET", "/api/v1/moderation/reports", { as: b })).status).toBe(404);
    expect((await call(queue.GET, "GET", "/api/v1/moderation/reports")).status).toBe(404);
    expect((await call(report.GET, "GET", `/api/v1/moderation/reports/${filed.id}`, { as: a, params: { id: filed.id } })).status).toBe(404);

    const open = await call<{ reports: { id: string }[] }>(queue.GET, "GET", "/api/v1/moderation/reports", { as: mod });
    expect(open.body.data?.reports.map((r) => r.id)).toContain(filed.id);

    type Detail = {
      subject: { offer: { title: string; photos: { url: string | null }[] } };
      actions: Record<string, boolean>;
      status: string;
    };
    const detail = await call<Detail>(report.GET, "GET", `/api/v1/moderation/reports/${filed.id}`, { as: mod, params: { id: filed.id } });
    expect(detail.status).toBe(200);
    expect(detail.body.data?.subject.offer.title).toBe("Fake watch");
    expect(detail.body.data?.subject.offer.photos[0]?.url).toMatch(/^http/);
    expect(detail.body.data?.actions).toMatchObject({ dismiss: true, remove_offer: true, suspend: true });
    // Signed photo links carry the storage path, as everywhere else; nothing else may.
    const text = JSON.stringify(detail.body).replace(/"(thumb_)?url":"[^"]*"/g, "");
    for (const secret of [a.id, b.id, "display_path", "owner_id"]) expect(text).not.toContain(secret);

    const shortNote = await call(act.POST, "POST", `/api/v1/moderation/reports/${filed.id}/actions`, {
      as: mod,
      body: { action: "remove_offer", note: "no" },
      params: { id: filed.id },
    });
    expect(shortNote.status).toBe(422);

    const removed = await call<Detail>(act.POST, "POST", `/api/v1/moderation/reports/${filed.id}/actions`, {
      as: mod,
      body: { action: "remove_offer", note: "Counterfeit listing, removed." },
      params: { id: filed.id },
    });
    expect(removed.status).toBe(200);
    expect(removed.body.data?.status).toBe("closed");
    const owned = await call<Offer>(offer.GET, "GET", `/api/v1/offers/${target.id}`, { as: a, params: { id: target.id } });
    expect(owned.body.data).toMatchObject({ status: "closed" });
    expect(owned.body.data?.removed_at).toBeTruthy();

    const reviewedAgain = await call(act.POST, "POST", `/api/v1/moderation/reports/${filed.id}/actions`, {
      as: mod,
      body: { action: "dismiss", note: "Already handled this." },
      params: { id: filed.id },
    });
    expect(reviewedAgain.status).toBe(409);
    expect(reviewedAgain.body.error).toMatchObject({ reason: "already_reviewed" });

    // Suspend the same member through a member report.
    const other = await active(a, "Office desk");
    const aboutMember = (await fileReport(b, { subject_type: "member", offer_id: other.id, reason: "harassment" })).body.data as { id: string };
    const suspended = await call(act.POST, "POST", `/api/v1/moderation/reports/${aboutMember.id}/actions`, {
      as: mod,
      body: { action: "suspend", note: "Repeated harassment reports." },
      params: { id: aboutMember.id },
    });
    expect(suspended.status).toBe(200);

    const draft = await call<Offer>(offers.POST, "POST", "/api/v1/offers", { as: a, body: { ...PUBLISHABLE_FIELDS, title: "Kitchen stool" } });
    const withPhoto = await call<Offer>(photos.POST, "POST", `/api/v1/offers/${draft.body.data?.id}/photos`, {
      as: a,
      form: photoForm(jpeg, draft.body.data as Offer),
      params: { id: draft.body.data?.id as string },
    });
    const refused = await call(publish.POST, "POST", `/api/v1/offers/${draft.body.data?.id}/publish`, {
      as: a,
      body: expectations(withPhoto.body.data as Offer),
      params: { id: draft.body.data?.id as string },
    });
    expect(refused.status).toBe(403);
    expect(refused.body.error).toMatchObject({ reason: "suspended" });

    const list = await call<{ suspensions: { id: string; member_name: string }[] }>(suspensions.GET, "GET", "/api/v1/moderation/suspensions", { as: mod });
    const suspension = list.body.data?.suspensions[0];
    expect(suspension).toBeDefined();
    expect(JSON.stringify(list.body)).not.toContain(a.id);
    const lifted = await call(lift.POST, "POST", `/api/v1/moderation/suspensions/${suspension?.id}/lift`, {
      as: mod,
      body: { note: "Member agreed to the rules." },
      params: { id: suspension?.id as string },
    });
    expect(lifted.status).toBe(200);
    const liftedAgain = await call(lift.POST, "POST", `/api/v1/moderation/suspensions/${suspension?.id}/lift`, {
      as: mod,
      body: { note: "Member agreed to the rules." },
      params: { id: suspension?.id as string },
    });
    expect(liftedAgain.status).toBe(409);
    expect(liftedAgain.body.error).toMatchObject({ reason: "already_lifted" });
  });
});
