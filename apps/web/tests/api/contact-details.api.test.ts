import { beforeAll, describe, expect, it } from "vitest";
import { CONTACT_DETAILS_MESSAGES } from "@batr/shared";
import * as offers from "@/app/api/v1/offers/route";
import * as offer from "@/app/api/v1/offers/[id]/route";
import * as publish from "@/app/api/v1/offers/[id]/publish/route";
import * as photos from "@/app/api/v1/offers/[id]/photos/route";
import * as proposals from "@/app/api/v1/proposals/route";
import * as messages from "@/app/api/v1/proposals/[id]/messages/route";
import * as profile from "@/app/api/v1/me/profile/route";
import { PUBLISHABLE_FIELDS, admin, call, expectations, member, phoneJpeg, photoForm, type ApiMember } from "./support";

// Milestone 7: contact details refused through every API route
// (specs/milestone-7-contact-details.md, Acceptance 1, 3, 5 and 6).

let a: ApiMember; // offer owner
let b: ApiMember; // proposer
let jpeg: Buffer;
beforeAll(async () => {
  [a, b] = await Promise.all([member("ada"), member("bayo")]);
  jpeg = await phoneJpeg(1200, 900);
});

type Offer = { id: string; status: string; revision: number };

async function active(as: ApiMember, title: string): Promise<Offer> {
  const created = await call<Offer>(offers.POST, "POST", "/api/v1/offers", { as, body: { ...PUBLISHABLE_FIELDS, title } });
  let current = created.body.data as Offer;
  const added = await call<Offer>(photos.POST, "POST", `/api/v1/offers/${current.id}/photos`, { as, form: photoForm(jpeg, current), params: { id: current.id } });
  current = added.body.data as Offer;
  const live = await call<Offer>(publish.POST, "POST", `/api/v1/offers/${current.id}/publish`, { as, body: expectations(current), params: { id: current.id } });
  return live.body.data as Offer;
}

async function proposed() {
  const [target, mine] = await Promise.all([active(a, "Canon camera"), active(b, "Road bike")]);
  const sent = await call<{ id: string }>(proposals.POST, "POST", "/api/v1/proposals", {
    as: b,
    body: { offer_id: target.id, gives: [{ kind: "offer", offer_id: mine.id }], gets: [{ kind: "offer", offer_id: target.id }] },
  });
  return { target, mine, proposal: sent.body.data as { id: string } };
}

const send = (as: ApiMember, id: string, body: string, key?: string) =>
  call(messages.POST, "POST", `/api/v1/proposals/${id}/messages`, { as, body: { body }, params: { id }, ...(key ? { key } : {}) });

describe("messages", () => {
  it("refuses a phone number with the message wording, and a retry gets the same answer", async () => {
    const { proposal } = await proposed();
    const key = crypto.randomUUID();
    const refused = await send(b, proposal.id, "Call me 0803 123 4567", key);
    expect(refused.status).toBe(422);
    expect(refused.body.error).toMatchObject({ code: "CONTACT_DETAILS", kind: "phone", message: CONTACT_DETAILS_MESSAGES.message, fields: { body: CONTACT_DETAILS_MESSAGES.message } });
    const again = await send(b, proposal.id, "Call me 0803 123 4567", key);
    expect(again.status).toBe(422);
    expect(again.body.error?.code).toBe("CONTACT_DETAILS");
    const thread = await call(messages.GET, "GET", `/api/v1/proposals/${proposal.id}/messages`, { as: a, params: { id: proposal.id } });
    expect((thread.body.data as { items: { kind: string }[] }).items.filter((m) => m.kind === "text")).toEqual([]);
  });

  it("sends ambiguous text with a warning for the sender only", async () => {
    const { proposal } = await proposed();
    const sent = await send(b, proposal.id, "Find me @bayo_store");
    expect(sent.status).toBe(201);
    expect(sent.body.data).toMatchObject({ body: "Find me @bayo_store", warning: CONTACT_DETAILS_MESSAGES.warning });
    const plain = await send(b, proposal.id, "See you at 4");
    expect(plain.body.data).not.toHaveProperty("warning");
    const thread = await call(messages.GET, "GET", `/api/v1/proposals/${proposal.id}/messages`, { as: a, params: { id: proposal.id } });
    expect(JSON.stringify(thread.body.data)).not.toContain("warning");
  });
});

describe("other write paths", () => {
  it("refuses a proposal note, an offer field and a display name, each on its field", async () => {
    const [target, mine] = await Promise.all([active(a, "Desk lamp"), active(b, "Kettle")]);
    const note = await call(proposals.POST, "POST", "/api/v1/proposals", {
      as: b,
      body: { offer_id: target.id, gives: [{ kind: "offer", offer_id: mine.id }], gets: [{ kind: "offer", offer_id: target.id }], note: "email me ada.obi@gmail.com" },
    });
    expect(note.status).toBe(422);
    expect(note.body.error).toMatchObject({ code: "CONTACT_DETAILS", kind: "email", fields: { note: CONTACT_DETAILS_MESSAGES.field } });

    const draft = await call<Offer>(offers.POST, "POST", "/api/v1/offers", { as: a, body: { title: "Lamp" } });
    const current = draft.body.data as Offer;
    const edited = await call(offer.PATCH, "PATCH", `/api/v1/offers/${current.id}`, {
      as: a,
      body: { ...expectations(current), fields: { description: "wa.me/2348031234567" } },
      params: { id: current.id },
    });
    expect(edited.status).toBe(422);
    expect(edited.body.error).toMatchObject({ code: "CONTACT_DETAILS", kind: "link", fields: { description: CONTACT_DETAILS_MESSAGES.field } });

    const name = await call(profile.PATCH, "PATCH", "/api/v1/me/profile", { as: a, body: { display_name: "Ada 08031234567" } });
    expect(name.status).toBe(422);
  });

  it("the third refusal in a day opens one automatic report", async () => {
    const tolu = await member("tolu");
    const { proposal } = await (async () => {
      const [target, mine] = await Promise.all([active(a, "Standing fan"), active(tolu, "Pressing iron")]);
      const sent = await call<{ id: string }>(proposals.POST, "POST", "/api/v1/proposals", {
        as: tolu,
        body: { offer_id: target.id, gives: [{ kind: "offer", offer_id: mine.id }], gets: [{ kind: "offer", offer_id: target.id }] },
      });
      return { proposal: sent.body.data as { id: string } };
    })();
    for (const text of ["08031234567", "tolu@gmail.com", "wa.me/2348031234567"]) expect((await send(tolu, proposal.id, text)).status).toBe(422);
    const { data } = await admin.from("reports").select("reason, reporter_id, status").eq("member_id", tolu.id);
    expect(data).toEqual([{ reason: "contact_details", reporter_id: null, status: "open" }]);
  });
});
