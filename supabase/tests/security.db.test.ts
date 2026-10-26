import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type pg from "pg";
import type { SupabaseClient } from "@supabase/supabase-js";
import { anonClient, beginAsMember, connect, createMember, offerIn, type Member, type Offer } from "./support/db.ts";

// Database security with real RLS and real member sessions
// (milestone-1.md, Automated tests: Database security; criteria 4, 10, 26, 29).

let a: Member;
let b: Member;
let anon: SupabaseClient;
let db: pg.Client;
const offers = {} as Record<Offer["status"], Offer>;

beforeAll(async () => {
  [a, b] = await Promise.all([createMember("alice"), createMember("bob")]);
  anon = anonClient();
  db = await connect();
  for (const status of ["draft", "active", "paused", "closed"] as const) offers[status] = await offerIn(a, status);
});
afterAll(async () => {
  await db.end();
});

const ids = () => Object.values(offers).map((o) => o.id);

describe("reading", () => {
  it("the owner sees all their offers and photo rows", async () => {
    const { data } = await a.client.from("offers").select("id, status").in("id", ids());
    expect(data?.map((o) => o.status).sort()).toEqual(["active", "closed", "draft", "paused"]);
    const photos = await a.client.from("offer_photos").select("id").in("offer_id", ids());
    expect(photos.data).toHaveLength(4);
  });

  for (const [name, client] of [["another member", () => b.client], ["a signed-out visitor", () => anon]] as const) {
    it(`${name} sees only the active offer, its photo rows and its owner's profile`, async () => {
      const { data, error } = await client().from("offers").select("id, status").in("id", ids());
      expect(error).toBeNull();
      expect(data).toEqual([{ id: offers.active.id, status: "active" }]);
      const photos = await client().from("offer_photos").select("offer_id").in("offer_id", ids());
      expect(photos.data).toEqual([{ offer_id: offers.active.id }]);
      const profile = await client().from("profiles").select("id, display_name").eq("id", a.id);
      expect(profile.data).toEqual([{ id: a.id, display_name: "alice" }]);
    });
  }

  it("a profile with no active offer is visible only to its owner", async () => {
    expect((await anon.from("profiles").select("id").eq("id", b.id)).data).toEqual([]);
    expect((await a.client.from("profiles").select("id").eq("id", b.id)).data).toEqual([]);
    expect((await b.client.from("profiles").select("id").eq("id", b.id)).data).toEqual([{ id: b.id }]);
  });

  it("members read only their own audit events", async () => {
    const own = await a.client.from("audit_events").select("actor_id").in("entity_id", ids());
    expect(own.data?.length).toBeGreaterThan(0);
    expect(new Set(own.data?.map((e) => e.actor_id))).toEqual(new Set([a.id]));
    expect((await b.client.from("audit_events").select("id").in("entity_id", ids())).data).toEqual([]);
    expect((await anon.from("audit_events").select("id").in("entity_id", ids())).data).toEqual([]);
  });
});

describe("direct writes are refused", () => {
  for (const [name, member] of [["the owner", () => a], ["another member", () => b]] as const) {
    it(`${name} cannot insert, update or delete offers or photo rows with their own token`, async () => {
      const client = member().client;
      for (const status of ["draft", "active", "paused", "closed"] as const) {
        const offer = offers[status];
        const update = await client.from("offers").update({ title: "Changed" }).eq("id", offer.id);
        const remove = await client.from("offers").delete().eq("id", offer.id);
        const photoUpdate = await client.from("offer_photos").update({ position: 2 }).eq("offer_id", offer.id);
        const photoDelete = await client.from("offer_photos").delete().eq("offer_id", offer.id);
        for (const result of [update, remove, photoUpdate, photoDelete]) expect(result.error?.code).toBe("42501");
      }
      const insert = await client.from("offers").insert({ owner_id: member().id, title: "Direct" });
      expect(insert.error?.code).toBe("42501");
      const photoInsert = await client.from("offer_photos").insert({
        offer_id: offers.draft.id, display_path: "x", thumb_path: "y", position: 2, width: 1, height: 1,
      });
      expect(photoInsert.error?.code).toBe("42501");
      const auditInsert = await client.from("audit_events").insert({
        actor_id: member().id, entity_type: "offer", entity_id: offers.draft.id, action: "edit", content_version: 1, revision: 1,
      });
      expect(auditInsert.error?.code).toBe("42501");
      const profileUpdate = await client.from("profiles").update({ display_name: "Changed" }).eq("id", member().id);
      expect(profileUpdate.error?.code).toBe("42501");
    });
  }

  it("nothing changed after those attempts", async () => {
    const rows = await db.query("select status, title, revision from public.offers where id = any($1) order by status", [ids()]);
    expect(rows.rows.map((r) => [r.status, r.title])).toEqual([
      ["draft", "Road bike"], ["active", "Road bike"], ["paused", "Road bike"], ["closed", "Road bike"],
    ]);
  });

  it("the private tables (idempotency keys, cleanup queue, transition table) are closed to members", async () => {
    expect((await a.client.schema("private").from("idempotency_keys").select("*")).error).not.toBeNull();
    for (const table of ["idempotency_keys", "storage_cleanup_queue", "offer_transitions", "offer_field_groups"]) {
      for (const sql of [`select * from private.${table}`, `delete from private.${table}`]) {
        await beginAsMember(db, a.id);
        await expect(db.query(sql)).rejects.toThrow(/permission denied/);
        await db.query("rollback");
      }
    }
  });

  it("members cannot call the private helper functions", async () => {
    await beginAsMember(db, a.id);
    await expect(db.query("select private.audit($1, null, 'edit', null, null)", [a.id])).rejects.toThrow(/permission denied/);
    await db.query("rollback");
  });

  it("only the server's cleanup job can list or clear the cleanup queue, orphaned files and expired keys", async () => {
    const jobFunctions = [
      ["storage_cleanup_pending", {}],
      ["storage_orphaned_files", {}],
      ["idempotency_keys_purge", {}],
      ["storage_cleanup_complete", { p_paths: ["x"] }],
      ["storage_cleanup_failed", { p_paths: ["x"], p_error: "x" }],
    ] as const;
    for (const [client, name] of [
      [a.client, "member"],
      [anon, "signed-out"],
    ] as const) {
      for (const [fn, args] of jobFunctions) {
        const { error } = await client.rpc(fn, args);
        expect(error?.code, `${name} ${fn}`).toBe("42501");
      }
    }
  });
});

describe("commit-time triggers, even for the database owner (criteria 20, 29)", () => {
  const rejectsAtCommit = async (statements: string[], params: unknown[][] = []) => {
    await db.query("begin");
    for (const [i, sql] of statements.entries()) await db.query(sql, params[i] ?? []);
    await expect(db.query("commit")).rejects.toThrow();
  };

  it("rejects status changes outside the transition table", async () => {
    for (const [from, to] of [["active", "draft"], ["closed", "active"], ["paused", "draft"], ["draft", "paused"]] as const) {
      await rejectsAtCommit([`update public.offers set status = '${to}' where id = $1`], [[offers[from].id]]);
      expect((await db.query("select status from public.offers where id = $1", [offers[from].id])).rows[0].status).toBe(from);
    }
    await rejectsAtCommit([
      "insert into public.offers (owner_id, title, status) values ($1, 'Born active', 'active')",
    ], [[a.id]]);
  });

  it("rejects an active or paused offer that fails a publish rule", async () => {
    for (const status of ["active", "paused"] as const) {
      await rejectsAtCommit(["update public.offers set title = 'Bike' where id = $1"], [[offers[status].id]]);
      await rejectsAtCommit(["update public.offers set category = null where id = $1"], [[offers[status].id]]);
      await rejectsAtCommit(["delete from public.offer_photos where offer_id = $1"], [[offers[status].id]]);
    }
  });

  it("rejects photo positions that are not 1..n", async () => {
    await rejectsAtCommit(["update public.offer_photos set position = 3 where offer_id = $1"], [[offers.draft.id]]);
  });

  it("allows valid direct changes, such as a draft edit", async () => {
    await db.query("begin");
    await db.query("update public.offers set description = 'Fine' where id = $1", [offers.draft.id]);
    await db.query("commit");
    expect((await db.query("select description from public.offers where id = $1", [offers.draft.id])).rows[0].description).toBe("Fine");
  });
});
