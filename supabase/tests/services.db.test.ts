import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type pg from "pg";
import { addPhoto, connect, createMember, createOffer, edit, failure, ok, rpc, transition, type Member, type Offer } from "./support/db.ts";

// Services as first-class offers (specs/milestone-9-services.md, V1–V8).

type Typed = Offer & { offer_type: string; condition: string | null; handover_methods: string[] };

let a: Member;
let db: pg.Client;
beforeAll(async () => {
  a = await createMember("sade");
  db = await connect();
});
afterAll(async () => {
  await db.end();
});

const SERVICE = {
  offer_type: "service",
  title: "Maths lessons",
  description: "Two hours a week.",
  category: "lessons_tutoring",
  offering_text: "Maths lessons",
  wants_text: "A bicycle",
  exchange_mode: "either",
  handover_methods: ["on_site_service", "remote_service"],
};

const typed = (offer: Offer) => offer as Typed;

describe("services", () => {
  it("existing and new offers are items unless they say otherwise (V1)", async () => {
    expect(typed(await createOffer(a, { title: "Kettle" })).offer_type).toBe("item");
    const { rows } = await db.query("select column_default from information_schema.columns where table_name = 'offers' and column_name = 'offer_type'");
    expect(rows[0].column_default).toContain("item");
  });

  it("publishes a service with a service category and no condition (V2, V3)", async () => {
    let offer = await createOffer(a, SERVICE);
    offer = await addPhoto(a, offer);
    const live = typed(await transition(a, "publish", offer));
    expect(live).toMatchObject({ status: "active", offer_type: "service", condition: null, category: "lessons_tutoring" });
  });

  it("refuses an item category, a condition or an item method on a service, and the reverse", async () => {
    const service = await rpc(a.client, "offer_create", {
      p_fields: { ...SERVICE, category: "electronics", condition: "good", handover_methods: ["delivery"], exchange_mode: "in_person" },
      p_idempotency_key: crypto.randomUUID(),
    });
    expect(failure(service)).toMatchObject({
      status: 422,
      detail: { fields: { category: "service_category", condition: "service_condition", handover_methods: "service_method" } },
    });
    const item = await rpc(a.client, "offer_create", {
      p_fields: { title: "Desk", category: "repairs", handover_methods: ["on_site_service"] },
      p_idempotency_key: crypto.randomUUID(),
    });
    expect(failure(item)).toMatchObject({ status: 422, detail: { fields: { category: "item_category", handover_methods: "item_method" } } });
  });

  it("an item still needs a condition to publish", async () => {
    let offer = await createOffer(a, { ...SERVICE, offer_type: "item", category: "books_media", exchange_mode: "in_person", handover_methods: ["collection"] });
    offer = await addPhoto(a, offer);
    const result = await rpc(a.client, "offer_publish", {
      p_offer_id: offer.id,
      p_expected_status: offer.status,
      p_expected_revision: offer.revision,
      p_idempotency_key: crypto.randomUUID(),
    });
    expect(JSON.stringify(failure(result).detail)).toContain("condition");
  });

  it("switching type clears what doesn't fit and is a material change (V7)", async () => {
    const item = typed(await createOffer(a, { title: "Phone repair kit", category: "electronics", condition: "good", exchange_mode: "either", handover_methods: ["collection", "delivery"] }));
    const service = typed(ok(await edit(a, item, { offer_type: "service" })));
    expect(service).toMatchObject({ offer_type: "service", category: null, condition: null, handover_methods: [] });
    expect(service.content_version).toBe(item.content_version + 1);
    const kept = typed(ok(await edit(a, service, { category: "repairs", handover_methods: ["on_site_service"] })));
    const back = typed(ok(await edit(a, kept, { offer_type: "item", category: "other", condition: "fair" })));
    expect(back).toMatchObject({ offer_type: "item", category: "other", condition: "fair", handover_methods: [] });
  });

  it("snapshots carry the type, so proposals and agreements can word a service (V5)", async () => {
    const offer = await createOffer(a, SERVICE);
    const { rows } = await db.query("select private.offer_snapshot($1) ->> 'offer_type' as type", [offer.id]);
    expect(rows[0].type).toBe("service");
  });
});
