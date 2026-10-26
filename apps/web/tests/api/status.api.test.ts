import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { Client } from "pg";
import * as offers from "@/app/api/v1/offers/route";
import * as publish from "@/app/api/v1/offers/[id]/publish/route";
import * as photos from "@/app/api/v1/offers/[id]/photos/route";
import * as proposals from "@/app/api/v1/proposals/route";
import * as messages from "@/app/api/v1/proposals/[id]/messages/route";
import * as status from "@/app/api/v1/me/status/route";
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

// The mobile app's counts and banner (specs/milestone-2-part-2.md, Q8).

let a: ApiMember; // offer owner
let b: ApiMember; // proposer
let jpeg: Buffer;
let db: Client;
beforeAll(async () => {
  [a, b] = await Promise.all([member("ada"), member("bayo")]);
  jpeg = await phoneJpeg(1200, 900);
  db = await connect();
});
afterAll(async () => {
  await db.end();
});

type Offer = { id: string; status: string; revision: number };
type Status = { exchanges: number; waiting: { turn: number; agreements: number }; messages: number; unread_by_proposal: Record<string, number>; notifications: number; suspended: boolean; warned: boolean };

async function active(as: ApiMember, title: string): Promise<Offer> {
  const created = await call<Offer>(offers.POST, "POST", "/api/v1/offers", { as, body: { ...PUBLISHABLE_FIELDS, title } });
  let current = created.body.data as Offer;
  const added = await call<Offer>(photos.POST, "POST", `/api/v1/offers/${current.id}/photos`, { as, form: photoForm(jpeg, current), params: { id: current.id } });
  current = added.body.data as Offer;
  const live = await call<Offer>(publish.POST, "POST", `/api/v1/offers/${current.id}/publish`, { as, body: expectations(current), params: { id: current.id } });
  return live.body.data as Offer;
}

const statusOf = async (as: ApiMember) => (await call<Status>(status.GET, "GET", "/api/v1/me/status", { as })).body.data as Status;

describe("GET /api/v1/me/status", () => {
  it("401 when signed out", async () => {
    expect((await call(status.GET, "GET", "/api/v1/me/status")).status).toBe(401);
  });

  it("counts what waits on the member, with no ids", async () => {
    const first = await call<Status>(status.GET, "GET", "/api/v1/me/status", { as: a });
    expect(first.status).toBe(200);
    expect(first.body.data).toEqual({ exchanges: 0, waiting: { turn: 0, agreements: 0 }, messages: 0, unread_by_proposal: {}, notifications: 0, suspended: false, warned: false });

    const [target, mine] = await Promise.all([active(a, "Canon camera"), active(b, "Road bike")]);
    const sent = await call<{ id: string }>(proposals.POST, "POST", "/api/v1/proposals", {
      as: b,
      body: { offer_id: target.id, gives: [{ kind: "offer", offer_id: mine.id }], gets: [{ kind: "offer", offer_id: target.id }] },
    });
    const id = (sent.body.data as { id: string }).id;
    await call(messages.POST, "POST", `/api/v1/proposals/${id}/messages`, { as: b, body: { body: "Is the lens included?" }, params: { id } });

    const owner = await statusOf(a);
    // The system line for the proposal and Bayo's message.
    expect(owner).toMatchObject({ exchanges: 1, waiting: { turn: 1, agreements: 0 }, messages: 1, unread_by_proposal: { [id]: 2 }, suspended: false });
    expect(owner.notifications).toBeGreaterThanOrEqual(1);
    // The proposer acted, so nothing waits on them.
    expect(await statusOf(b)).toEqual({ exchanges: 0, waiting: { turn: 0, agreements: 0 }, messages: 0, unread_by_proposal: {}, notifications: 0, suspended: false, warned: false });

    const text = JSON.stringify(await call(status.GET, "GET", "/api/v1/me/status", { as: a }));
    for (const secret of [a.id, b.id]) expect(text).not.toContain(secret);
  });

  it("says when the member is suspended", async () => {
    await db.query("insert into public.member_suspensions (member_id, suspended_by) values ($1, $1)", [b.id]);
    expect(await statusOf(b)).toMatchObject({ suspended: true });
    expect(await statusOf(a)).toMatchObject({ suspended: false });
  });
});
