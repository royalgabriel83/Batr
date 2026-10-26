import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type pg from "pg";
import {
  connect,
  createMember,
  failure,
  newKey,
  offerIn,
  ok,
  rpc,
  transition,
  type Member,
} from "./support/db.ts";

// Milestone 5, units 21–22: messages and in-app notifications against
// the real database (specs/milestone-5.md, Rules and Acceptance
// criteria; N1–N7).

type Message = {
  id: number;
  kind: "text" | "system";
  from: "you" | "them" | null;
  body: string | null;
  event: string | null;
  actor: "you" | "them" | null;
};
type Thread = { items: Message[]; more: boolean; closed: boolean; unread: number };
type Notification = {
  id: string;
  kind: string;
  count: number;
  actor_name: string | null;
  offer_title: string;
  proposal_id: string;
  agreement_id: string | null;
  read: boolean;
};
type NotificationPage = { items: Notification[]; next: { updated_at: string; id: string } | null; unread: number };

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

/** B proposes their offer for A's offer. */
async function proposed() {
  const [target, mine] = await Promise.all([offerIn(a, "active"), offerIn(b, "active")]);
  const proposal = ok(
    await rpc<{ id: string; latest_revision_id: string }>(b.client, "proposal_create", {
      p_offer_id: target.id,
      p_terms: {
        gives: [{ kind: "offer", offer_id: mine.id }],
        gets: [{ kind: "offer", offer_id: target.id }],
        cash: null,
        note: "",
      },
      p_idempotency_key: newKey(),
    }),
  );
  return { target, mine, proposal };
}

const send = (member: Member, proposalId: string, body: string, key = newKey()) =>
  rpc<Message>(member.client, "message_send", { p_proposal_id: proposalId, p_body: body, p_idempotency_key: key });
const thread = (member: Member, proposalId: string, args: Record<string, unknown> = {}) =>
  rpc<Thread>(member.client, "message_list", { p_proposal_id: proposalId, ...args });
const read = (member: Member, proposalId: string) => rpc<{ unread: number }>(member.client, "message_read", { p_proposal_id: proposalId });
const notifications = async (member: Member) => ok(await rpc<NotificationPage>(member.client, "notification_list", {}));
const forProposal = async (member: Member, proposalId: string) =>
  (await notifications(member)).items.filter((n) => n.proposal_id === proposalId);
const count = async (member: Member) => ok(await rpc<number>(member.client, "notification_count", {}));

describe("threads", () => {
  it("lets the two members talk; a third member can't read or send", async () => {
    const { proposal } = await proposed();
    const sent = ok(await send(b, proposal.id, "  Is the lens scratched?  "));
    expect(sent).toMatchObject({ kind: "text", from: "you", body: "Is the lens scratched?" });
    ok(await send(a, proposal.id, "No, it's clean."));

    const seen = ok(await thread(a, proposal.id));
    expect(seen.items.map((m) => [m.kind, m.from, m.body ?? m.event])).toEqual([
      ["system", null, "proposal.create"],
      ["text", "them", "Is the lens scratched?"],
      ["text", "you", "No, it's clean."],
    ]);
    expect(seen.items[0]?.actor).toBe("them");
    expect(seen.closed).toBe(false);

    expect(failure(await thread(c, proposal.id)).code).toBe("NOT_FOUND");
    expect(failure(await send(c, proposal.id, "Hello")).code).toBe("NOT_FOUND");
    const { data } = await c.client.from("messages").select("id").eq("proposal_id", proposal.id);
    expect(data).toEqual([]);
  });

  it("returns only newer messages when polling, and older pages on request", async () => {
    const { proposal } = await proposed();
    const first = ok(await send(b, proposal.id, "one"));
    ok(await send(a, proposal.id, "two"));
    const newer = ok(await thread(b, proposal.id, { p_after: first.id }));
    expect(newer.items.map((m) => m.body)).toEqual(["two"]);

    const page = ok(await thread(b, proposal.id, { p_limit: 2 }));
    expect(page.items.map((m) => m.body)).toEqual(["one", "two"]);
    expect(page.more).toBe(true);
    const older = ok(await thread(b, proposal.id, { p_before: page.items[0]?.id, p_limit: 2 }));
    expect(older.items.map((m) => m.event)).toEqual(["proposal.create"]);
    expect(older.more).toBe(false);
  });

  it("checks the body: trimmed, 1–2000 characters", async () => {
    const { proposal } = await proposed();
    for (const body of ["   ", "x".repeat(2001)]) {
      const error = failure(await send(b, proposal.id, body));
      expect(error).toMatchObject({ status: 422, code: "VALIDATION_FAILED", detail: { fields: { body: "length" } } });
    }
    ok(await send(b, proposal.id, "x".repeat(2000)));
  });

  it("doesn't repeat a send retried with the same key", async () => {
    const { proposal } = await proposed();
    const key = newKey();
    const first = ok(await send(b, proposal.id, "Still available?", key));
    const again = ok(await send(b, proposal.id, "Still available?", key));
    expect(again.id).toBe(first.id);
    const texts = ok(await thread(a, proposal.id)).items.filter((m) => m.kind === "text");
    expect(texts).toHaveLength(1);
    expect((await forProposal(a, proposal.id)).find((n) => n.kind === "message")?.count).toBe(1);
  });

  it("limits a member to 30 messages a minute (N4)", async () => {
    // A new member, so no earlier sends count towards this minute.
    const sender = await createMember("efe");
    const [target, mine] = await Promise.all([offerIn(a, "active"), offerIn(sender, "active")]);
    const proposal = ok(await rpc<{ id: string }>(sender.client, "proposal_create", {
      p_offer_id: target.id,
      p_terms: { gives: [{ kind: "offer", offer_id: mine.id }], gets: [{ kind: "offer", offer_id: target.id }], cash: null, note: "" },
      p_idempotency_key: newKey(),
    }));
    for (let i = 1; i <= 30; i += 1) ok(await send(sender, proposal.id, `Message ${String(i)}`));
    expect(failure(await send(sender, proposal.id, "One too many"))).toMatchObject({ status: 429, code: "RATE_LIMITED" });
    // The other member isn't limited by it.
    ok(await send(a, proposal.id, "Slow down"));
  });

  it("closes when the proposal ends without agreement (N5)", async () => {
    const { proposal } = await proposed();
    ok(await rpc(b.client, "proposal_withdraw", { p_proposal_id: proposal.id, p_expected_revision: 1, p_idempotency_key: newKey() }));
    const seen = ok(await thread(a, proposal.id));
    expect(seen.closed).toBe(true);
    expect(seen.items.map((m) => m.event)).toEqual(["proposal.create", "proposal.withdraw"]);
    expect(failure(await send(a, proposal.id, "Why?"))).toMatchObject({ status: 409, code: "CONFLICT", detail: { reason: "thread_closed" } });
  });

  it("carries on into the agreement, and closes 30 days after it ends (N5)", async () => {
    const { proposal } = await proposed();
    const accepted = ok(await rpc<{ agreement_id: string }>(a.client, "proposal_accept", {
      p_proposal_id: proposal.id, p_revision_id: proposal.latest_revision_id, p_idempotency_key: newKey(),
    }));
    ok(await send(b, proposal.id, "Saturday at noon?"));
    const agreement = ok(await rpc<{ binding_version_id: string }>(a.client, "agreement_get", { p_agreement_id: accepted.agreement_id }));
    for (const member of [a, b])
      ok(await rpc(member.client, "agreement_handover", { p_agreement_id: accepted.agreement_id, p_version_id: agreement.binding_version_id, p_idempotency_key: newKey() }));

    const seen = ok(await thread(b, proposal.id));
    expect(seen.items.map((m) => m.event ?? m.body)).toEqual([
      "proposal.create", "proposal.accept", "Saturday at noon?", "agreement.handover", "agreement.completed",
    ]);
    expect(seen.closed).toBe(false);
    ok(await send(a, proposal.id, "Thanks!"));

    await db.query("update public.agreements set completed_at = now() - interval '31 days' where id = $1", [accepted.agreement_id]);
    expect(ok(await thread(b, proposal.id)).closed).toBe(true);
    expect(failure(await send(b, proposal.id, "Hello again")).detail).toEqual({ reason: "thread_closed" });
  });

  it("can't be edited or deleted by members, or edited at all (N6)", async () => {
    const { proposal } = await proposed();
    const sent = ok(await send(b, proposal.id, "Original"));
    await b.client.from("messages").update({ body: "Changed" }).eq("id", sent.id);
    await b.client.from("messages").delete().eq("id", sent.id);
    const { error: insert } = await b.client.from("messages").insert({ proposal_id: proposal.id, kind: "text", sender_id: b.id, body: "Forged" });
    expect(insert).not.toBeNull();
    await expect(db.query("update public.messages set body = 'Changed' where id = $1", [sent.id])).rejects.toThrow();
    const texts = ok(await thread(a, proposal.id)).items.filter((m) => m.kind === "text");
    expect(texts.map((m) => m.body)).toEqual(["Original"]);
  });
});

describe("unread", () => {
  it("counts the other member's messages and events until read", async () => {
    const { proposal } = await proposed();
    // The proposal's own line was B's doing, so it's unread only for A.
    expect(ok(await thread(b, proposal.id)).unread).toBe(0);
    expect(ok(await thread(a, proposal.id)).unread).toBe(1);
    ok(await send(b, proposal.id, "Hi"));
    ok(await send(b, proposal.id, "Are you there?"));
    expect(ok(await rpc<Record<string, number>>(a.client, "message_unread_counts", {}))[proposal.id]).toBe(3);
    expect(ok(await rpc<Record<string, number>>(b.client, "message_unread_counts", {}))[proposal.id]).toBeUndefined();

    expect(ok(await read(a, proposal.id)).unread).toBe(0);
    expect(ok(await rpc<Record<string, number>>(a.client, "message_unread_counts", {}))[proposal.id]).toBeUndefined();
    expect((await forProposal(a, proposal.id)).find((n) => n.kind === "message")?.read).toBe(true);
    expect(failure(await read(c, proposal.id)).code).toBe("NOT_FOUND");
  });
});

describe("the Messages page (N2)", () => {
  it("lists the viewer's threads, latest message first, with unread counts", async () => {
    const member = await createMember("funmi");
    const first = await (async () => {
      const [target, mine] = await Promise.all([offerIn(a, "active"), offerIn(member, "active")]);
      return ok(await rpc<{ id: string }>(member.client, "proposal_create", {
        p_offer_id: target.id,
        p_terms: { gives: [{ kind: "offer", offer_id: mine.id }], gets: [{ kind: "offer", offer_id: target.id }], cash: null, note: "" },
        p_idempotency_key: newKey(),
      }));
    })();
    const second = await (async () => {
      const [target, mine] = await Promise.all([offerIn(b, "active"), offerIn(member, "active")]);
      return ok(await rpc<{ id: string }>(member.client, "proposal_create", {
        p_offer_id: target.id,
        p_terms: { gives: [{ kind: "offer", offer_id: mine.id }], gets: [{ kind: "offer", offer_id: target.id }], cash: null, note: "" },
        p_idempotency_key: newKey(),
      }));
    })();
    ok(await send(a, first.id, "Hello from Ada"));

    type Threads = { items: { proposal_id: string; other_name: string; unread: number; last: Message; agreement_id: string | null }[]; next: number | null };
    const page = ok(await rpc<Threads>(member.client, "message_threads", {}));
    expect(page.items.map((t) => t.proposal_id)).toEqual([first.id, second.id]);
    expect(page.items[0]).toMatchObject({ other_name: expect.stringContaining("ada"), unread: 1, agreement_id: null, last: { from: "them", body: "Hello from Ada" } });
    expect(page.items[1]).toMatchObject({ unread: 0, last: { event: "proposal.create", actor: "you" } });

    const one = ok(await rpc<Threads>(member.client, "message_threads", { p_limit: 1 }));
    expect(one.items.map((t) => t.proposal_id)).toEqual([first.id]);
    const rest = ok(await rpc<Threads>(member.client, "message_threads", { p_limit: 1, p_before: one.next }));
    expect(rest.items.map((t) => t.proposal_id)).toEqual([second.id]);
    expect(rest.next).toBeNull();
    expect(ok(await rpc<Threads>(c.client, "message_threads", {})).items.map((t) => t.proposal_id)).not.toContain(first.id);
  });
});

describe("notifications", () => {
  it("tells the other member about each event, never the actor (N7)", async () => {
    const { proposal, target, mine } = await proposed();
    const received = await forProposal(a, proposal.id);
    expect(received.map((n) => n.kind)).toEqual(["proposal.create"]);
    expect(received[0]).toMatchObject({ count: 1, actor_name: expect.stringContaining("bayo"), offer_title: target.title, agreement_id: null, read: false });
    expect(await forProposal(b, proposal.id)).toEqual([]);

    const countered = ok(await rpc<{ latest_revision_id: string }>(a.client, "proposal_counter", {
      p_proposal_id: proposal.id,
      p_expected_revision: 1,
      p_terms: { gives: [{ kind: "offer", offer_id: mine.id }], gets: [{ kind: "offer", offer_id: target.id }], cash: { amount_naira: 5000, payer: "proposer" }, note: "" },
      p_idempotency_key: newKey(),
    }));
    expect((await forProposal(b, proposal.id)).map((n) => n.kind)).toEqual(["proposal.counter"]);

    const accepted = ok(await rpc<{ agreement_id: string }>(b.client, "proposal_accept", {
      p_proposal_id: proposal.id, p_revision_id: countered.latest_revision_id, p_idempotency_key: newKey(),
    }));
    const toA = await forProposal(a, proposal.id);
    expect(toA[0]).toMatchObject({ kind: "proposal.accept", agreement_id: accepted.agreement_id });
    // The agreement's own `create` adds nothing.
    expect(toA).toHaveLength(2);
    expect(await forProposal(b, proposal.id)).toHaveLength(1);

    ok(await rpc(a.client, "agreement_cancel_request", { p_agreement_id: accepted.agreement_id, p_reason: "Changed my mind", p_idempotency_key: newKey() }));
    expect((await forProposal(b, proposal.id))[0]).toMatchObject({ kind: "agreement.request_cancel", agreement_id: accepted.agreement_id });
    expect(await forProposal(c, proposal.id)).toEqual([]);
  });

  it("groups messages into one unread notification per thread", async () => {
    const { proposal } = await proposed();
    ok(await send(b, proposal.id, "One"));
    ok(await send(b, proposal.id, "Two"));
    let messages = (await forProposal(a, proposal.id)).filter((n) => n.kind === "message");
    expect(messages).toHaveLength(1);
    expect(messages[0]?.count).toBe(2);
    ok(await read(a, proposal.id));
    ok(await send(b, proposal.id, "Three"));
    messages = (await forProposal(a, proposal.id)).filter((n) => n.kind === "message");
    expect(messages.map((n) => [n.count, n.read])).toEqual([[1, false], [2, true]]);
  });

  it("tells only the proposer when closing the offer declines the proposal", async () => {
    const { proposal, target } = await proposed();
    await transition(a, "close", target);
    expect((await forProposal(b, proposal.id)).map((n) => n.kind)).toEqual(["proposal.auto_decline"]);
    expect((await forProposal(a, proposal.id)).map((n) => n.kind)).toEqual(["proposal.create"]);
  });

  it("are read one at a time or all at once, by their recipient only", async () => {
    const { proposal } = await proposed();
    const [mine] = await forProposal(a, proposal.id);
    const before = await count(a);
    expect(before).toBeGreaterThan(0);
    expect(failure(await rpc(b.client, "notification_read", { p_notification_id: mine?.id })).code).toBe("NOT_FOUND");
    expect(ok(await rpc<number>(a.client, "notification_read", { p_notification_id: mine?.id }))).toBe(before - 1);
    expect((await forProposal(a, proposal.id))[0]?.read).toBe(true);
    ok(await rpc(a.client, "notification_read_all", {}));
    expect(await count(a)).toBe(0);
    expect((await notifications(a)).unread).toBe(0);

    await a.client.from("notifications").update({ read_at: null }).eq("id", mine?.id ?? "");
    expect((await forProposal(a, proposal.id))[0]?.read).toBe(true);
    const { data } = await c.client.from("notifications").select("id").eq("id", mine?.id ?? "");
    expect(data).toEqual([]);
  });

  it("pages newest first", async () => {
    const member = await createMember("dayo");
    const offers = await Promise.all([offerIn(member, "active"), offerIn(member, "active"), offerIn(member, "active")]);
    const ids: string[] = [];
    for (const offer of offers) {
      const mine = await offerIn(b, "active");
      ids.push(ok(await rpc<{ id: string }>(b.client, "proposal_create", {
        p_offer_id: offer.id,
        p_terms: { gives: [{ kind: "offer", offer_id: mine.id }], gets: [{ kind: "offer", offer_id: offer.id }], cash: null, note: "" },
        p_idempotency_key: newKey(),
      })).id);
    }
    const first = ok(await rpc<NotificationPage>(member.client, "notification_list", { p_limit: 2 }));
    expect(first.items).toHaveLength(2);
    expect(first.items.map((n) => n.proposal_id)).toEqual([ids[2], ids[1]]);
    const rest = ok(await rpc<NotificationPage>(member.client, "notification_list", {
      p_limit: 2, p_before_updated_at: first.next?.updated_at, p_before_id: first.next?.id,
    }));
    expect(rest.items.map((n) => n.proposal_id)).toEqual([ids[0]]);
    expect(rest.next).toBeNull();
  });
});
