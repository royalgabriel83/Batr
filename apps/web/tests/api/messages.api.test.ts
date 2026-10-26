import { beforeAll, describe, expect, it } from "vitest";
import * as offers from "@/app/api/v1/offers/route";
import * as publish from "@/app/api/v1/offers/[id]/publish/route";
import * as photos from "@/app/api/v1/offers/[id]/photos/route";
import * as proposals from "@/app/api/v1/proposals/route";
import * as accept from "@/app/api/v1/proposals/[id]/accept/route";
import * as withdraw from "@/app/api/v1/proposals/[id]/withdraw/route";
import * as messages from "@/app/api/v1/proposals/[id]/messages/route";
import * as read from "@/app/api/v1/proposals/[id]/messages/read/route";
import * as threads from "@/app/api/v1/messages/route";
import * as notifications from "@/app/api/v1/notifications/route";
import * as count from "@/app/api/v1/notifications/count/route";
import * as readOne from "@/app/api/v1/notifications/[id]/read/route";
import * as readAll from "@/app/api/v1/notifications/read-all/route";
import {
  PUBLISHABLE_FIELDS,
  call,
  expectations,
  member,
  phoneJpeg,
  photoForm,
  type ApiMember,
} from "./support";

// Milestone 5, units 21–22: the message and notification API
// (specs/milestone-5.md, API) against the real route handlers and
// local Supabase.

let a: ApiMember; // offer owner
let b: ApiMember; // proposer
let c: ApiMember; // anyone else
let jpeg: Buffer;
beforeAll(async () => {
  [a, b, c] = await Promise.all([member("ada"), member("bayo"), member("chika")]);
  jpeg = await phoneJpeg(1200, 900);
});

type Offer = { id: string; status: string; revision: number };
type Message = { id: number; kind: string; from: string | null; body: string | null; event: string | null; actor: string | null };
type Thread = { items: Message[]; more: boolean; closed: boolean; unread: number };
type Notification = { id: string; kind: string; count: number; actor_name: string | null; proposal_id: string; agreement_id: string | null; read: boolean };

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
  return live.body.data as Offer;
}

/** B proposes their bike for A's camera. */
async function proposed() {
  const [target, mine] = await Promise.all([active(a, "Canon camera"), active(b, "Road bike")]);
  const sent = await call<{ id: string; latest_revision_id: string }>(proposals.POST, "POST", "/api/v1/proposals", {
    as: b,
    body: { offer_id: target.id, gives: [{ kind: "offer", offer_id: mine.id }], gets: [{ kind: "offer", offer_id: target.id }] },
  });
  return sent.body.data as { id: string; latest_revision_id: string };
}

const at = (id: string) => `/api/v1/proposals/${id}/messages`;
const send = (as: ApiMember, id: string, body: unknown, key?: string | null) =>
  call<Message>(messages.POST, "POST", at(id), { as, body, params: { id }, ...(key === undefined ? {} : { key }) });
const thread = (as: ApiMember, id: string, query = "") =>
  call<Thread>(messages.GET, "GET", at(id), { as, params: { id }, query });
const mine = async (as: ApiMember) =>
  (await call<{ notifications: Notification[]; unread: number; next_cursor: string | null }>(notifications.GET, "GET", "/api/v1/notifications", { as })).body.data;

describe("the thread", () => {
  it("lets the two members talk, with no member ids; others get 404", async () => {
    const proposal = await proposed();
    const sent = await send(b, proposal.id, { body: "  Is the lens scratched?  " });
    expect(sent.status).toBe(201);
    expect(sent.body.data).toMatchObject({ kind: "text", from: "you", body: "Is the lens scratched?" });

    const seen = await thread(a, proposal.id);
    expect(seen.status).toBe(200);
    expect(seen.body.data?.items.map((m) => [m.from ?? m.actor, m.body ?? m.event])).toEqual([
      ["them", "proposal.create"],
      ["them", "Is the lens scratched?"],
    ]);
    const text = JSON.stringify(seen.body.data);
    expect(text).not.toContain(a.id);
    expect(text).not.toContain(b.id);

    const newer = await thread(a, proposal.id, `?after=${String(sent.body.data?.id)}`);
    expect(newer.body.data?.items).toEqual([]);
    expect((await thread(a, proposal.id, "?after=abc")).status).toBe(422);

    const hidden = await thread(c, proposal.id);
    expect(hidden.status).toBe(404);
    expect(hidden.body.error?.message).toBe("This conversation isn't available.");
    expect((await send(c, proposal.id, { body: "Hi" })).status).toBe(404);
    expect((await call(messages.GET, "GET", at(proposal.id), { params: { id: proposal.id } })).status).toBe(401);
  });

  it("checks the body, needs an idempotency key and doesn't repeat a retry", async () => {
    const proposal = await proposed();
    const empty = await send(b, proposal.id, { body: "   " });
    expect(empty.status).toBe(422);
    expect(empty.body.error?.fields).toEqual({ body: "Write a message first." });
    expect((await send(b, proposal.id, { body: "Hi", photo: "x" })).status).toBe(422);
    expect((await send(b, proposal.id, { body: "Hi" }, null)).status).toBe(400);
    const key = crypto.randomUUID();
    const first = await send(b, proposal.id, { body: "Still available?" }, key);
    const again = await send(b, proposal.id, { body: "Still available?" }, key);
    expect(again.body.data?.id).toBe(first.body.data?.id);
  });

  it("refuses sends once the proposal has ended", async () => {
    const proposal = await proposed();
    const accepted = await call<{ agreement_id: string }>(accept.POST, "POST", `/api/v1/proposals/${proposal.id}/accept`, {
      as: a,
      body: { revision_id: proposal.latest_revision_id },
      params: { id: proposal.id },
    });
    expect(accepted.status).toBe(200);
    // Accepted: the thread carries on.
    expect((await send(b, proposal.id, { body: "Saturday?" })).status).toBe(201);
    const other = await proposed();
    const withdrawn = await call(
      withdraw.POST,
      "POST",
      `/api/v1/proposals/${other.id}/withdraw`,
      { as: b, body: { expected_revision: 1 }, params: { id: other.id } },
    );
    expect(withdrawn.status).toBe(200);
    const closed = await send(a, other.id, { body: "Why?" });
    expect(closed.status).toBe(409);
    expect(closed.body.error).toMatchObject({ reason: "thread_closed", message: "This conversation is closed." });
  });
});

describe("unread, the Messages page and notifications", () => {
  it("counts, lists and clears what the member hasn't seen", async () => {
    const proposal = await proposed();
    await send(b, proposal.id, { body: "One" });
    const last = await send(b, proposal.id, { body: "Two" });

    const list = await call<{ threads: { proposal_id: string; unread: number; other_name: string }[]; next_cursor: string | null }>(
      threads.GET, "GET", "/api/v1/messages", { as: a },
    );
    expect(list.body.data?.threads[0]).toMatchObject({ proposal_id: proposal.id, unread: 3 });
    expect((await call(threads.GET, "GET", "/api/v1/messages", { as: a, query: "?cursor=!!" })).status).toBe(422);

    const before = await mine(a);
    const grouped = before?.notifications.find((n) => n.proposal_id === proposal.id && n.kind === "message");
    expect(grouped).toMatchObject({ count: 2, read: false, agreement_id: null });
    expect(JSON.stringify(before)).not.toContain(b.id);
    const unread = (await call<{ unread: number }>(count.GET, "GET", "/api/v1/notifications/count", { as: a })).body.data?.unread;
    expect(unread).toBe(before?.unread);

    const marked = await call<{ unread: number }>(read.POST, "POST", `${at(proposal.id)}/read`, {
      as: a,
      body: { up_to: last.body.data?.id },
      params: { id: proposal.id },
    });
    expect(marked.body.data).toEqual({ unread: 0 });
    expect((await mine(a))?.notifications.find((n) => n.id === grouped?.id)?.read).toBe(true);

    const event = (await mine(a))?.notifications.find((n) => n.proposal_id === proposal.id && n.kind === "proposal.create");
    const eventId = event?.id ?? "";
    expect((await call(readOne.POST, "POST", `/api/v1/notifications/${eventId}/read`, { as: b, params: { id: eventId } })).status).toBe(404);
    const one = await call<{ unread: number }>(readOne.POST, "POST", `/api/v1/notifications/${eventId}/read`, { as: a, params: { id: eventId } });
    expect(one.status).toBe(200);
    const all = await call<{ unread: number }>(readAll.POST, "POST", "/api/v1/notifications/read-all", { as: a });
    expect(all.body.data).toEqual({ unread: 0 });
    expect((await mine(a))?.unread).toBe(0);
  });
});
