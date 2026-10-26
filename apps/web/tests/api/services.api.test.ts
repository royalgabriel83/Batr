import { beforeAll, describe, expect, it } from "vitest";
import { OFFER_TYPE_MESSAGES } from "@batr/shared";
import * as offers from "@/app/api/v1/offers/route";
import * as publish from "@/app/api/v1/offers/[id]/publish/route";
import * as photos from "@/app/api/v1/offers/[id]/photos/route";
import { PUBLISHABLE_FIELDS, call, expectations, member, phoneJpeg, photoForm, randomUUID, type ApiMember } from "./support";

// Services as first-class offers (specs/milestone-9-services.md):
// the publish rules through the API, and the Explore filter.

let a: ApiMember;
let jpeg: Buffer;
beforeAll(async () => {
  a = await member("tolu");
  jpeg = await phoneJpeg(1200, 900);
});

type Offer = { id: string; status: string; revision: number; offer_type: string; condition: string | null };

const SERVICE = {
  offer_type: "service",
  title: "Hair braiding",
  description: "Box braids, about four hours.",
  category: "beauty_hair",
  offering_text: "Box braids",
  wants_text: "A phone",
  exchange_mode: "in_person",
  handover_methods: ["on_site_service"],
};

async function live(fields: object): Promise<Offer> {
  const created = await call<Offer>(offers.POST, "POST", "/api/v1/offers", { as: a, body: fields });
  expect(created.status).toBe(201);
  let current = created.body.data as Offer;
  current = (await call<Offer>(photos.POST, "POST", `/api/v1/offers/${current.id}/photos`, { as: a, form: photoForm(jpeg, current), params: { id: current.id } })).body.data as Offer;
  const published = await call<Offer>(publish.POST, "POST", `/api/v1/offers/${current.id}/publish`, { as: a, body: expectations(current), params: { id: current.id } });
  expect(published.status).toBe(200);
  return published.body.data as Offer;
}

const list = async (query: string) => (await call<{ offers: Offer[] }>(offers.GET, "GET", "/api/v1/offers", { query })).body;

describe("services through the API", () => {
  it("publishes a service with no condition", async () => {
    const offer = await live({ ...SERVICE, title: `Hair braiding ${randomUUID().slice(0, 6)}` });
    expect(offer).toMatchObject({ status: "active", offer_type: "service", condition: null });
  });

  it("refuses an item-only handover method on a service, and a service method on an item, with a field message", async () => {
    const service = await call(offers.POST, "POST", "/api/v1/offers", { as: a, body: { ...SERVICE, handover_methods: ["delivery"] } });
    expect(service.status).toBe(422);
    expect(service.body.error?.fields).toMatchObject({ handover_methods: OFFER_TYPE_MESSAGES.service_method });
    const item = await call(offers.POST, "POST", "/api/v1/offers", { as: a, body: { ...PUBLISHABLE_FIELDS, exchange_mode: "remote", handover_methods: ["remote_service"] } });
    expect(item.status).toBe(422);
    expect(item.body.error?.fields).toMatchObject({ handover_methods: OFFER_TYPE_MESSAGES.item_method });
  });

  it("filters Explore to items, services or both", async () => {
    const tag = randomUUID().slice(0, 6);
    const [service, item] = [await live({ ...SERVICE, title: `Braids ${tag}` }), await live({ ...PUBLISHABLE_FIELDS, title: `Bike ${tag}` })];
    const services = await list("?type=service");
    expect(services.data?.offers.every((o) => o.offer_type === "service")).toBe(true);
    expect(services.data?.offers.map((o) => o.id)).toContain(service.id);
    const items = await list("?type=item");
    expect(items.data?.offers.every((o) => o.offer_type === "item")).toBe(true);
    expect(items.data?.offers.map((o) => o.id)).toContain(item.id);
    const both = (await list("")).data?.offers.map((o) => o.id) ?? [];
    expect(both).toEqual(expect.arrayContaining([service.id, item.id]));
    const wrong = await list("?type=goods");
    expect(wrong.error?.code).toBe("VALIDATION_FAILED");
  });
});
