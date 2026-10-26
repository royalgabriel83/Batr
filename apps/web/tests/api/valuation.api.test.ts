import { afterAll, beforeAll, describe, expect, it } from "vitest";
import sharp from "sharp";
import type pg from "pg";
import * as offers from "@/app/api/v1/offers/route";
import * as offer from "@/app/api/v1/offers/[id]/route";
import * as photos from "@/app/api/v1/offers/[id]/photos/route";
import * as offerValuation from "@/app/api/v1/offers/[id]/valuation/route";
import * as assessment from "@/app/api/v1/offers/[id]/assessment/route";
import * as valuation from "@/app/api/v1/valuations/[id]/route";
import * as submit from "@/app/api/v1/valuations/[id]/submit/route";
import * as withdraw from "@/app/api/v1/valuations/[id]/withdraw/route";
import * as appeal from "@/app/api/v1/valuations/[id]/appeal/route";
import * as evidence from "@/app/api/v1/valuations/[id]/evidence/route";
import * as evidenceItem from "@/app/api/v1/valuations/[id]/evidence/[evidenceId]/route";
import * as queue from "@/app/api/v1/review/valuations/route";
import * as review from "@/app/api/v1/review/valuations/[id]/route";
import * as appeals from "@/app/api/v1/review/appeals/[id]/route";
import * as webhook from "@/app/api/v1/payments/flutterwave/webhook/route";
import { WEBHOOK_HASH_SETTING } from "@/server/payments/flutterwave";
import { EVIDENCE_MESSAGES } from "@batr/shared";
import { PUBLISHABLE_FIELDS, admin, call, connect, member, phoneJpeg, photoForm, randomUUID, type ApiMember } from "./support";

// Valuation, evidence, review, appeals and fee quotes through the API
// (owner, 2026-10-17; specs/valuation-and-fees.md).

type Json = Record<string, unknown>;
type Valuation = Json & {
  id: string;
  status: string;
  revision: number;
  components: { id: string }[];
  evidence: { id: string; kind: string; mime: string }[];
  appeals: { id: string }[];
  appeals_remaining: number;
  repeat_of?: Json | null;
  assessments: { total_noncash_kobo: number }[];
  fee_quote: Json | null;
};

let owner: ApiMember;
let other: ApiMember;
let reviewer: ApiMember;
let reviewer2: ApiMember;
let reviewer3: ApiMember;
let jpeg: Buffer;
let db: pg.Client;

beforeAll(async () => {
  [owner, other, reviewer, reviewer2, reviewer3] = await Promise.all([member("owner"), member("other"), member("reviewer"), member("reviewer2"), member("reviewer3")]);
  jpeg = await phoneJpeg(1600, 1200);
  db = await connect();
  await db.query(
    "insert into private.staff_roles (member_id, role) values ($1, 'valuation_reviewer'), ($2, 'valuation_reviewer'), ($3, 'valuation_reviewer')",
    [reviewer.id, reviewer2.id, reviewer3.id],
  );
});
afterAll(async () => {
  await db.end();
});

const goods = (id = randomUUID()) => ({
  id,
  kind: "goods",
  category: "electronics",
  subcategory: "Phones",
  description: "A Samsung phone with its charger.",
  quantity: 1,
  unit: "",
  proposed_value_kobo: 9_000_000,
  details: {
    product_name: "Galaxy A54",
    brand: "  Samsung  ",
    model: "",
    goods_status: "used",
    condition: "good",
    functional_status: "working",
    has_known_defects: false,
    estimated_age_months: 14,
  },
});

/**
 * A draft offer of the owner's: valuations accept any offer that is not
 * closed, and a draft stays out of the marketplace list, so this file
 * does not disturb the ordering test in offers.api.test.ts.
 */
async function ownOffer(): Promise<{ id: string }> {
  return (await call(offers.POST, "POST", "/api/v1/offers", { as: owner, body: PUBLISHABLE_FIELDS })).body.data;
}

function fileForm(bytes: Uint8Array, kind: string, componentId: string | null, name: string, type: string) {
  const form = new FormData();
  form.set("file", new File([new Uint8Array(bytes)], name, { type }));
  form.set("kind", kind);
  if (componentId) form.set("component_id", componentId);
  return form;
}

/**
 * A phone photo of a different colour each time, so no two uploads share
 * a fingerprint and the repeat-valuation check (owner, 2026-10-18) only
 * fires where a test means it to.
 */
const itemPhoto = () =>
  sharp({ create: { width: 640, height: 480, channels: 3, background: { r: rand(), g: rand(), b: rand() } } })
    .jpeg({ quality: 90 })
    .withExifMerge({ IFD0: { Make: "TestCam", Model: "Phone 1" } })
    .toBuffer();
const rand = () => Math.floor(Math.random() * 256);

const upload = (v: { id: string }, form: FormData, as: ApiMember = owner) =>
  call<Valuation>(evidence.POST, "POST", "/x", { as, form, params: { id: v.id } });

/** A goods valuation with two photos, sent for review. */
async function sent(): Promise<{ v: Valuation; componentId: string; photos: Buffer[] }> {
  const offer = await ownOffer();
  let v = (await call<Valuation>(offerValuation.POST, "POST", "/x", { as: owner, params: { id: offer.id } })).body.data as Valuation;
  const componentId = randomUUID();
  v = (await call<Valuation>(valuation.PATCH, "PATCH", "/x", {
    as: owner,
    params: { id: v.id },
    body: { expected_revision: v.revision, draft: { exchange_type: "pure_barter", cash_component_kobo: 0, components: [goods(componentId)] } },
  })).body.data as Valuation;
  const photos = [await itemPhoto(), await itemPhoto()];
  for (const bytes of photos) await upload(v, fileForm(bytes, "photo", componentId, "item.jpg", "image/jpeg"));
  const result = await call<Valuation>(submit.POST, "POST", "/x", { as: owner, params: { id: v.id }, body: { expected_revision: v.revision, declaration: true } });
  expect(result.status, JSON.stringify(result.body)).toBe(200);
  return { v: result.body.data as Valuation, componentId, photos };
}

describe("member endpoints", () => {
  it("starts, saves and reads a valuation, privately and uncached", async () => {
    const offer = await ownOffer();
    const created = await call<Valuation>(offerValuation.POST, "POST", "/x", { as: owner, params: { id: offer.id } });
    expect(created.status).toBe(201);
    expect(created.headers.get("cache-control")).toBe("private, no-store");
    const v = created.body.data as Valuation;
    const g = goods();
    const saved = await call<Valuation>(valuation.PATCH, "PATCH", "/x", {
      as: owner,
      params: { id: v.id },
      body: { expected_revision: v.revision, draft: { exchange_type: "pure_barter", cash_component_kobo: 0, components: [g] } },
    });
    expect(saved.status).toBe(200);
    expect(saved.body.data?.components[0]).toMatchObject({ details: { brand: "Samsung" } });
    expect((await call(offerValuation.GET, "GET", "/x", { as: owner, params: { id: offer.id } })).body.data).toMatchObject({ id: v.id });
    expect((await call(valuation.GET, "GET", "/x", { as: other, params: { id: v.id } })).status).toBe(404);
    expect((await call(offerValuation.GET, "GET", "/x", { as: other, params: { id: offer.id } })).status).toBe(404);
    expect((await call(offerValuation.POST, "POST", "/x", { as: owner, params: { id: offer.id }, key: null })).status).toBe(400);
    expect((await call(valuation.GET, "GET", "/x", { params: { id: v.id } })).status).toBe(401);
  });

  it("explains what is missing before sending", async () => {
    const offer = await ownOffer();
    const v = (await call<Valuation>(offerValuation.POST, "POST", "/x", { as: owner, params: { id: offer.id } })).body.data as Valuation;
    const g = goods();
    const saved = (await call<Valuation>(valuation.PATCH, "PATCH", "/x", {
      as: owner,
      params: { id: v.id },
      body: { expected_revision: v.revision, draft: { exchange_type: "pure_barter", cash_component_kobo: 0, components: [g] } },
    })).body.data as Valuation;
    const noDeclaration = await call(submit.POST, "POST", "/x", { as: owner, params: { id: v.id }, body: { expected_revision: saved.revision, declaration: false } });
    expect(noDeclaration.status).toBe(422);
    expect(noDeclaration.body.error?.fields).toEqual({ declaration: "Confirm that the information is accurate." });
    const noPhotos = await call(submit.POST, "POST", "/x", { as: owner, params: { id: v.id }, body: { expected_revision: saved.revision, declaration: true } });
    expect(noPhotos.body.error?.fields).toEqual({ [`${g.id}.photos`]: "Add at least 2 photos of the actual item from different angles." });
  });

  it("422 for an invalid draft, with the field named", async () => {
    const offer = await ownOffer();
    const v = (await call<Valuation>(offerValuation.POST, "POST", "/x", { as: owner, params: { id: offer.id } })).body.data as Valuation;
    const bad = await call(valuation.PATCH, "PATCH", "/x", {
      as: owner,
      params: { id: v.id },
      body: { expected_revision: v.revision, draft: { exchange_type: "pure_barter", cash_component_kobo: 1.5, components: [] } },
    });
    expect(bad.status).toBe(422);
    expect(bad.body.error?.fields).toHaveProperty("draft");
    const stale = await call(valuation.PATCH, "PATCH", "/x", {
      as: owner,
      params: { id: v.id },
      body: { expected_revision: v.revision + 5, draft: { exchange_type: "pure_barter", cash_component_kobo: 0, components: [] } },
    });
    expect(stale.status).toBe(409);
    expect(stale.body.error).toMatchObject({ reason: "stale_revision", current_revision: v.revision });
  });
});

describe("evidence uploads", () => {
  it("re-encodes photos without location or camera data", async () => {
    const { v } = await sent();
    const item = v.evidence[0];
    expect(item).toMatchObject({ kind: "photo", mime: "image/webp" });
    const { data } = await admin.storage.from("valuation-evidence").download(`${owner.id}/${v.id}/${item?.id ?? ""}.webp`);
    const stored = Buffer.from(await (data as Blob).arrayBuffer());
    const meta = await sharp(stored).metadata();
    expect(meta.format).toBe("webp");
    expect(meta.exif).toBeUndefined();
    expect(stored.includes(Buffer.from("TestCam"))).toBe(false);
  });

  it("refuses PDFs while BATR has no malware scanner, and accepts image receipts", async () => {
    const offer = await ownOffer();
    const v = (await call<Valuation>(offerValuation.POST, "POST", "/x", { as: owner, params: { id: offer.id } })).body.data as Valuation;
    const plain = Buffer.from("%PDF-1.4\n1 0 obj << /Type /Catalog >> endobj\n%%EOF\n", "latin1");
    const scripted = Buffer.from("%PDF-1.4\n1 0 obj << /OpenAction << /S /JavaScript /JS (app.alert(1)) >> >> endobj\n%%EOF\n", "latin1");
    for (const [bytes, kind] of [[plain, "receipt"], [scripted, "receipt"], [plain, "warranty"], [plain, "photo"]] as const) {
      const refused = await upload(v, fileForm(bytes, kind, null, "file.pdf", "application/pdf"));
      expect(refused.status).toBe(422);
      expect(refused.body.error?.code).toBe("UNSUPPORTED_FORMAT");
      if (kind !== "photo") expect(refused.body.error?.message).toBe(EVIDENCE_MESSAGES.pdfDisabled);
    }
    const html = await upload(v, fileForm(Buffer.from("<html><script>alert(1)</script></html>"), "receipt", null, "receipt.pdf", "application/pdf"));
    expect(html.body.error?.code).toBe("UNSUPPORTED_FORMAT");
    // A photo or screenshot of the receipt is still accepted, re-encoded and marked sensitive.
    const receipt = await upload(v, fileForm(await itemPhoto(), "receipt", null, "receipt.jpg", "image/jpeg"));
    expect(receipt.status, JSON.stringify(receipt.body)).toBe(201);
    expect(receipt.body.data?.evidence[0]).toMatchObject({ kind: "receipt", mime: "image/webp", sensitive: true });
    const intruder = await upload(v, fileForm(await itemPhoto(), "receipt", null, "receipt.jpg", "image/jpeg"), other);
    expect(intruder.status).toBe(404);
  });

  it("gives short-lived links to the uploader and staff only", async () => {
    const { v } = await sent();
    const id = v.evidence[0]?.id ?? "";
    const mine = await call<{ url: string; expires_in: number }>(evidenceItem.GET, "GET", "/x", { as: owner, params: { id: v.id, evidenceId: id } });
    expect(mine.status).toBe(200);
    expect(mine.body.data?.expires_in).toBe(120);
    expect((await fetch(mine.body.data?.url ?? "")).status).toBe(200);
    expect((await call(evidenceItem.GET, "GET", "/x", { as: reviewer, params: { id: v.id, evidenceId: id } })).status).toBe(200);
    expect((await call(evidenceItem.GET, "GET", "/x", { as: other, params: { id: v.id, evidenceId: id } })).status).toBe(404);
    expect((await call(evidenceItem.GET, "GET", "/x", { params: { id: v.id, evidenceId: id } })).status).toBe(401);
    // Sent evidence is kept with the history.
    expect((await call(evidenceItem.DELETE, "DELETE", "/x", { as: owner, params: { id: v.id, evidenceId: id } })).status).toBe(409);
  });
});

describe("review, fee quote and appeal", () => {
  it("is refused to members who are not staff", async () => {
    expect((await call(queue.GET, "GET", "/x", { as: other })).status).toBe(403);
  });

  it("approves a value, quotes the fee, and sends an appeal to a different reviewer", async () => {
    const { v, componentId } = await sent();
    const listed = await call<{ id: string }[]>(queue.GET, "GET", "/x", { as: reviewer });
    expect(listed.body.data?.map((row) => row.id)).toContain(v.id);
    const current = (await call<Valuation>(review.GET, "GET", "/x", { as: reviewer, params: { id: v.id } })).body.data as Valuation;
    const comparison = await call(review.POST, "POST", "/x", {
      as: reviewer,
      params: { id: v.id },
      body: {
        action: "add_comparison",
        comparison: {
          component_id: componentId, source: "Jiji listing", url: "https://jiji.ng/example", observed_on: "2026-10-10", price_kind: "asking",
          price_kobo: 11_000_000, condition: "Used", characteristics: "Same model", adjustments: [{ factor: "condition", percent_bp: -1000, note: "" }],
        },
      },
    });
    expect(comparison.status).toBe(201);
    const decided = await call<Valuation>(review.POST, "POST", "/x", {
      as: reviewer,
      params: { id: v.id },
      body: {
        action: "decide",
        decision: {
          expected_revision: current.revision, outcome: "approved", components: [{ component_id: componentId, value_kobo: 10_000_000 }],
          rationale: "In line with the adjusted asking price of the same model.", confidence: "medium", limitations: "Photos only.", message: "",
        },
      },
    });
    expect(decided.status, JSON.stringify(decided.body)).toBe(200);
    const mine = (await call<Valuation>(valuation.GET, "GET", "/x", { as: owner, params: { id: v.id } })).body.data as Valuation;
    expect(mine.fee_quote).toMatchObject({ fee_basis_kobo: 10_000_000, total_fee_kobo: 300_000, party_a_share_kobo: 150_000, party_b_share_kobo: 150_000 });

    // The offer page's summary (specs/milestone-2.md): the owner sees the value of their draft;
    // another member and a visitor learn nothing, because only active offers are shown to others.
    const offerId = (mine as Json).offer_id as string;
    const shown = await call(assessment.GET, "GET", "/x", { as: owner, params: { id: offerId } });
    expect(shown.body.data).toEqual({ assessed: true, summary: { total_noncash_kobo: 10_000_000, confidence: "medium", inspected: false, assessed_at: expect.any(String) } });
    expect((await call(assessment.GET, "GET", "/x", { as: other, params: { id: offerId } })).body.data).toEqual({ assessed: false, summary: null });
    expect((await call(assessment.GET, "GET", "/x", { params: { id: offerId } })).body.data).toEqual({ assessed: false, summary: null });

    const appealed = await call<Valuation>(appeal.POST, "POST", "/x", {
      as: owner,
      params: { id: v.id },
      body: { expected_revision: mine.revision, reason: "Two identical phones sold for ₦110,000 this month." },
    });
    expect(appealed.status).toBe(200);
    const appealId = (await call<Valuation>(review.GET, "GET", "/x", { as: reviewer, params: { id: v.id } })).body.data?.appeals[0]?.id ?? "";
    const sameReviewer = await call(appeals.POST, "POST", "/x", { as: reviewer, params: { id: appealId }, body: { action: "claim" } });
    expect(sameReviewer.status).toBe(403);
    expect(sameReviewer.body.error?.message).toBe("A decision of yours on this valuation was appealed, so other reviewers handle it now.");
    expect((await call(appeals.POST, "POST", "/x", { as: reviewer2, params: { id: appealId }, body: { action: "claim" } })).status).toBe(200);
    const fresh = (await call<Valuation>(review.GET, "GET", "/x", { as: reviewer2, params: { id: v.id } })).body.data as Valuation;
    const revised = await call(appeals.POST, "POST", "/x", {
      as: reviewer2,
      params: { id: appealId },
      body: {
        action: "decide",
        decision: {
          expected_revision: fresh.revision, outcome: "revised", components: [{ component_id: componentId, value_kobo: 11_000_000 }],
          rationale: "The sales the member cites are verified and recent.", confidence: "high", limitations: "", message: "",
        },
      },
    });
    expect(revised.status, JSON.stringify(revised.body)).toBe(200);
    const after = (await call<Valuation>(valuation.GET, "GET", "/x", { as: owner, params: { id: v.id } })).body.data as Valuation;
    expect(after.fee_quote).toMatchObject({ fee_basis_kobo: 11_000_000, total_fee_kobo: 330_000, requires_reconfirmation: true });
    expect(JSON.stringify(after)).not.toContain(reviewer.id);
    expect(after.appeals_remaining).toBe(1);

    // The second appeal is the last: neither earlier decision-maker takes it, and no third is accepted.
    const second = await call<Valuation>(appeal.POST, "POST", "/x", {
      as: owner, params: { id: v.id }, body: { expected_revision: after.revision, reason: "A third identical sale at ₦120,000 is attached." },
    });
    expect(second.status).toBe(200);
    expect(second.body.data?.appeals_remaining).toBe(0);
    const secondId = (await call<Valuation>(review.GET, "GET", "/x", { as: reviewer3, params: { id: v.id } })).body.data?.appeals[1]?.id ?? "";
    for (const blocked of [reviewer, reviewer2]) {
      expect((await call(appeals.POST, "POST", "/x", { as: blocked, params: { id: secondId }, body: { action: "claim" } })).status).toBe(403);
    }
    expect((await call(appeals.POST, "POST", "/x", { as: reviewer3, params: { id: secondId }, body: { action: "claim" } })).status).toBe(200);
    const latest = (await call<Valuation>(review.GET, "GET", "/x", { as: reviewer3, params: { id: v.id } })).body.data as Valuation;
    const upheld = await call(appeals.POST, "POST", "/x", {
      as: reviewer3,
      params: { id: secondId },
      body: { action: "decide", decision: { expected_revision: latest.revision, outcome: "upheld", components: [], rationale: "The revised value already reflects these sales.", confidence: "high", limitations: "", message: "" } },
    });
    expect(upheld.status, JSON.stringify(upheld.body)).toBe(200);
    const final = (await call<Valuation>(valuation.GET, "GET", "/x", { as: owner, params: { id: v.id } })).body.data as Valuation;
    const third = await call(appeal.POST, "POST", "/x", {
      as: owner, params: { id: v.id }, body: { expected_revision: final.revision, reason: "Asking once more for another look at the value." },
    });
    expect(third.status).toBe(409);
    expect(third.body.error?.message).toBe("This valuation has used both appeals and the last decision is final. To add new evidence, withdraw it and start a new valuation.");
  });

  it("withdrawing clears the quote", async () => {
    const { v } = await sent();
    const result = await call<Valuation>(withdraw.POST, "POST", "/x", { as: owner, params: { id: v.id }, body: { expected_revision: v.revision } });
    expect(result.body.data).toMatchObject({ status: "withdrawn", fee_quote: null });
  });
});

describe("repeat valuations", () => {
  it("refuses an unchanged resubmission of a decided valuation and accepts new evidence with a note", async () => {
    const { v, photos } = await sent();
    const current = (await call<Valuation>(review.GET, "GET", "/x", { as: reviewer, params: { id: v.id } })).body.data as Valuation;
    const refused = await call(review.POST, "POST", "/x", {
      as: reviewer,
      params: { id: v.id },
      body: { action: "decide", decision: { expected_revision: current.revision, outcome: "not_approved", components: [], rationale: "The photos don't show the serial number clearly.", confidence: "low", limitations: "", message: "" } },
    });
    expect(refused.status, JSON.stringify(refused.body)).toBe(200);

    // The same item and photos again on the same offer, with only the proposed value changed.
    const stored = (await call<Valuation>(valuation.GET, "GET", "/x", { as: owner, params: { id: v.id } })).body.data as Valuation;
    const offerId = (stored as Json).offer_id as string;
    const componentId = randomUUID();
    let again = (await call<Valuation>(offerValuation.POST, "POST", "/x", { as: owner, params: { id: offerId } })).body.data as Valuation;
    again = (await call<Valuation>(valuation.PATCH, "PATCH", "/x", {
      as: owner,
      params: { id: again.id },
      body: { expected_revision: again.revision, draft: { exchange_type: "pure_barter", cash_component_kobo: 0, components: [{ ...goods(componentId), proposed_value_kobo: 12_000_000 }] } },
    })).body.data as Valuation;
    for (const bytes of photos) {
      expect((await upload(again, fileForm(bytes, "photo", componentId, "item.jpg", "image/jpeg"))).status).toBe(201);
    }
    again = (await call<Valuation>(valuation.GET, "GET", "/x", { as: owner, params: { id: again.id } })).body.data as Valuation;
    expect(again.repeat_of).toMatchObject({ id: v.id, same_offer: true, outcome: "not_approved" });
    const unchanged = await call(submit.POST, "POST", "/x", { as: owner, params: { id: again.id }, body: { expected_revision: again.revision, declaration: true, note: "Please look at it again, the value is fair." } });
    expect(unchanged.status).toBe(409);
    expect(unchanged.body.error?.message).toBe("BATR has already decided a valuation of this item. To send a new one, add new evidence or change the details, and tell BATR what's new.");

    // A new photo, but no note saying what's new.
    await upload(again, fileForm(await itemPhoto(), "photo", componentId, "serial.jpg", "image/jpeg"));
    again = (await call<Valuation>(valuation.GET, "GET", "/x", { as: owner, params: { id: again.id } })).body.data as Valuation;
    const noNote = await call(submit.POST, "POST", "/x", { as: owner, params: { id: again.id }, body: { expected_revision: again.revision, declaration: true } });
    expect(noNote.status).toBe(422);
    expect(noNote.body.error?.fields).toMatchObject({ note: "Tell BATR what's new since the earlier valuation, in at least 20 characters." });
    const accepted = await call<Valuation>(submit.POST, "POST", "/x", {
      as: owner, params: { id: again.id }, body: { expected_revision: again.revision, declaration: true, note: "Added a clear photo of the serial number." },
    });
    expect(accepted.status, JSON.stringify(accepted.body)).toBe(200);
    expect(accepted.body.data).toMatchObject({ status: "submitted", repeat_reason: "Added a clear photo of the serial number.", appeals_remaining: 2 });
  });
});

describe("assessed value visibility", () => {
  it("never reaches signed-out visitors through the offer or valuation API", async () => {
    const { v, componentId } = await sent();
    const current = (await call<Valuation>(review.GET, "GET", "/x", { as: reviewer, params: { id: v.id } })).body.data as Valuation;
    const decided = await call(review.POST, "POST", "/x", {
      as: reviewer,
      params: { id: v.id },
      body: {
        action: "decide",
        decision: {
          expected_revision: current.revision, outcome: "approved", components: [{ component_id: componentId, value_kobo: 12_345_600 }],
          rationale: "In line with recent sales of the same model.", confidence: "medium", limitations: "", message: "",
        },
      },
    });
    expect(decided.status, JSON.stringify(decided.body)).toBe(200);
    // Make the offer public with an old publication date, so it stays off the first marketplace page other tests read.
    const offerId = (v as Json).offer_id as string;
    const draftOffer = (await call<{ id: string; status: string; revision: number }>(offer.GET, "GET", "/x", { as: owner, params: { id: offerId } })).body.data;
    expect((await call(photos.POST, "POST", "/x", { as: owner, form: photoForm(jpeg, draftOffer as { status: string; revision: number }), params: { id: offerId } })).status).toBe(201);
    await db.query("update public.offers set status = 'active', published_at = '2020-01-01T00:00:00Z' where id = $1", [offerId]);

    const anonValuation = await call(offerValuation.GET, "GET", "/x", { params: { id: offerId } });
    expect(anonValuation.status).toBe(401);
    expect(JSON.stringify(anonValuation.body)).not.toContain("12345600");
    expect((await call(valuation.GET, "GET", "/x", { params: { id: v.id } })).status).toBe(401);
    for (const as of [null, other]) {
      const detail = await call(offer.GET, "GET", "/x", { as, params: { id: offerId } });
      expect(detail.status).toBe(200);
      expect(JSON.stringify(detail.body)).not.toMatch(/12345600|123,456|assess/i);
    }
    // Other members can't read the owner's valuation record either.
    expect((await call(valuation.GET, "GET", "/x", { as: other, params: { id: v.id } })).status).toBe(404);
  });
});

describe("Flutterwave notifications", () => {
  const notify = (hash: string | null, body: unknown) =>
    webhook.POST(
      new Request("http://localhost/api/v1/payments/flutterwave/webhook", {
        method: "POST",
        headers: { "content-type": "application/json", ...(hash ? { "verif-hash": hash } : {}) },
        body: JSON.stringify(body),
      }),
    );

  it("answers 503 and stores nothing until payments are configured", async () => {
    Reflect.deleteProperty(process.env, WEBHOOK_HASH_SETTING);
    expect((await notify("anything", { event: "charge.completed", data: { id: 1 } })).status).toBe(503);
  });

  it("refuses a wrong signature and stores each event once, without customer details", async () => {
    process.env[WEBHOOK_HASH_SETTING] = "test-secret-hash";
    try {
      const id = Date.now();
      const body = { event: "charge.completed", data: { id, tx_ref: "batr-fee-1", status: "successful", amount: 1500, currency: "NGN", customer: { email: "a@example.test", phone_number: "0800" } } };
      expect((await notify("wrong", body)).status).toBe(401);
      expect((await notify(null, body)).status).toBe(401);
      const first = await notify("test-secret-hash", body);
      expect(first.status).toBe(200);
      expect(await first.json()).toEqual({ data: { received: true, duplicate: false } });
      expect(await (await notify("test-secret-hash", body)).json()).toEqual({ data: { received: true, duplicate: true } });
      const { rows } = await db.query<{ payload: Json }>("select payload from private.payment_provider_events where event_id = $1", [String(id)]);
      expect(JSON.stringify(rows[0]?.payload)).not.toContain("example.test");
      expect(rows[0]?.payload).toMatchObject({ event: "charge.completed", data: { tx_ref: "batr-fee-1" } });
    } finally {
      Reflect.deleteProperty(process.env, WEBHOOK_HASH_SETTING);
    }
  });
});
