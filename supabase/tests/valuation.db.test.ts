import { randomBytes, randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type pg from "pg";
import { calculatePlatformFee, adjustedPrice, VALUATION_POLICY, type ExchangeType } from "../../packages/shared/src/index.ts";
import {
  WEBP_BYTES,
  admin,
  anonClient,
  connect,
  createMember,
  failure,
  newKey,
  offerIn,
  ok,
  rpc,
  sha256,
  type Member,
} from "./support/db.ts";

// Structured valuation, assessment, appeals and the 3% fee (owner,
// 2026-10-17; approved policies 2026-10-18; specs/valuation-and-fees.md).

type Json = Record<string, unknown>;
type Valuation = Json & {
  id: string;
  status: string;
  revision: number;
  components: Json[];
  evidence: { id: string; kind: string; component_id: string | null; sensitive: boolean }[];
  requests: Json[];
  inspections: { id: string; status: string }[];
  assessments: { id: string; version: number; outcome: string; total_noncash_kobo: number }[];
  appeals: { id: string; number: number; status: string; outcome: string | null; excluded_reviewer_id?: string }[];
  appeals_remaining?: number;
  appeal_limit?: number;
  repeat_of?: Json | null;
  repeat_reason?: string | null;
  comparisons: { id: string; excluded?: boolean; adjusted_kobo: number }[];
  fee_quote: Json | null;
  history: Json[];
  notes?: Json[];
};

const PDF_BYTES = Buffer.from("%PDF-1.4\n1 0 obj<<>>endobj\ntrailer<<>>\n%%EOF\n", "latin1");
const uniqueWebp = () => Buffer.concat([WEBP_BYTES, randomBytes(12)]);

let owner: Member;
let other: Member;
let reviewer: Member;
let reviewer2: Member;
let reviewer3: Member;
let inspector: Member;
let db: pg.Client;

beforeAll(async () => {
  [owner, other, reviewer, reviewer2, reviewer3, inspector] = await Promise.all([
    createMember("owner"),
    createMember("other"),
    createMember("reviewer"),
    createMember("reviewer2"),
    createMember("reviewer3"),
    createMember("inspector"),
  ]);
  db = await connect();
  await db.query(
    "insert into private.staff_roles (member_id, role) values ($1, 'valuation_reviewer'), ($2, 'valuation_reviewer'), ($3, 'valuation_reviewer'), ($4, 'valuation_inspector')",
    [reviewer.id, reviewer2.id, reviewer3.id, inspector.id],
  );
});
afterAll(async () => {
  await db.end();
});

// Helpers ---------------------------------------------------------------

const goods = (id = randomUUID(), details: Json = {}) => ({
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
    goods_status: "used",
    condition: "good",
    functional_status: "working",
    has_known_defects: false,
    estimated_age_months: 14,
    ...details,
  },
});

const service = (id = randomUUID()) => ({
  id,
  kind: "service",
  category: "home_repair",
  subcategory: "",
  description: "Repaint one bedroom, walls only.",
  quantity: 1,
  unit: "room",
  proposed_value_kobo: 4_000_000,
  details: {
    service_type: "Painting",
    scope: "Walls of one bedroom, two coats.",
    deliverables: "A painted room.",
    acceptance_criteria: "Even coverage, no drips.",
    estimated_hours: 8,
    complexity: "standard",
    experience: "Six years painting homes.",
  },
});

async function create(member: Member, offerId?: string): Promise<Valuation> {
  const id = offerId ?? (await offerIn(member, "active")).id;
  return ok(await rpc<Valuation>(member.client, "valuation_create", { p_offer_id: id, p_idempotency_key: newKey() }));
}

const save = (member: Member, v: Valuation, draft: Json) =>
  rpc<Valuation>(member.client, "valuation_save", {
    p_submission_id: v.id,
    p_expected_revision: v.revision,
    p_draft: draft,
    p_idempotency_key: newKey(),
  });

/**
 * Uploads a WebP file (different bytes each time unless `bytes` is
 * given, as the server's re-encoding of a different photo would be)
 * and records it as evidence.
 */
async function addEvidence(member: Member, v: Valuation, kind: string, componentId: string | null, bytes: Buffer = uniqueWebp()) {
  const evidenceId = randomUUID();
  const path = `${member.id}/${v.id}/${evidenceId}.webp`;
  const upload = await member.client.storage.from("valuation-evidence").upload(path, bytes, { contentType: "image/webp" });
  if (upload.error) throw upload.error;
  const result = await rpc<Valuation>(member.client, "valuation_evidence_add", {
    p_submission_id: v.id,
    p_evidence_id: evidenceId,
    p_kind: kind,
    p_component_id: componentId,
    p_mime: "image/webp",
    p_size_bytes: bytes.length,
    p_request_hash: sha256(evidenceId),
    p_idempotency_key: newKey(),
  });
  return { result, path, evidenceId };
}

const submit = (member: Member, v: Valuation, declaration = true, note = "") =>
  rpc<Valuation>(member.client, "valuation_submit", {
    p_submission_id: v.id,
    p_expected_revision: v.revision,
    p_declaration: declaration,
    p_note: note,
    p_idempotency_key: newKey(),
  });

const decide = (member: Member, v: Valuation, decision: Json) =>
  rpc<Valuation>(member.client, "review_decide", {
    p_submission_id: v.id,
    p_expected_revision: v.revision,
    p_decision: { rationale: "Matches recent sales of the same model in Ibadan.", confidence: "medium", limitations: "", message: "", ...decision },
    p_idempotency_key: newKey(),
  });

const memberView = async (member: Member, v: { id: string }) => ok(await rpc<Valuation>(member.client, "valuation_get", { p_submission_id: v.id }));
const reviewView = async (member: Member, v: { id: string }) => ok(await rpc<Valuation>(member.client, "review_get", { p_submission_id: v.id }));

/** A goods valuation with two photos, sent for review. */
async function submitted(exchangeType: ExchangeType = "pure_barter", cash = 0): Promise<{ v: Valuation; componentId: string }> {
  let v = await create(owner);
  const componentId = randomUUID();
  v = ok(await save(owner, v, { exchange_type: exchangeType, cash_component_kobo: cash, components: [goods(componentId)] }));
  await addEvidence(owner, v, "photo", componentId);
  v = ok((await addEvidence(owner, v, "photo", componentId)).result);
  v = ok(await submit(owner, v));
  return { v, componentId };
}

// Member flow -----------------------------------------------------------

describe("starting and saving a valuation", () => {
  it("lets only the offer's owner start one, once per offer", async () => {
    const offer = await offerIn(owner, "active");
    expect(failure(await rpc(other.client, "valuation_create", { p_offer_id: offer.id, p_idempotency_key: newKey() })).status).toBe(404);
    const v = await create(owner, offer.id);
    expect(v).toMatchObject({ status: "draft", revision: 1, exchange_type: "pure_barter", components: [] });
    const again = failure(await rpc(owner.client, "valuation_create", { p_offer_id: offer.id, p_idempotency_key: newKey() }));
    expect(again).toMatchObject({ status: 409, detail: { reason: "valuation_open" } });
  });

  it("refuses closed offers and signed-out callers", async () => {
    const closed = await offerIn(owner, "closed");
    expect(failure(await rpc(owner.client, "valuation_create", { p_offer_id: closed.id, p_idempotency_key: newKey() })).status).toBe(409);
    // Signed-out visitors cannot call the function at all.
    expect((await rpc(anonClient(), "valuation_create", { p_offer_id: closed.id, p_idempotency_key: newKey() })).error).not.toBeNull();
  });

  it("saves goods and services together and drops blank answers", async () => {
    const v = await create(owner);
    const g = goods(undefined, { brand: "  Samsung ", model: "", warranty: null });
    const saved = ok(await save(owner, v, { exchange_type: "cash_plus_barter", cash_component_kobo: 2_000_000, components: [g, service()] }));
    expect(saved.revision).toBe(2);
    expect(saved.components).toHaveLength(2);
    expect(saved.components[0]).toMatchObject({ kind: "goods", details: { brand: "Samsung" } });
    expect((saved.components[0] as { details: Json }).details).not.toHaveProperty("model");
    expect(saved.components[1]).toMatchObject({ kind: "service", category: "home_repair" });
  });

  it("refuses invalid answers with the item and field named", async () => {
    const v = await create(owner);
    const g = goods(undefined, { condition: "mint", purchase_date: "2999-01-01", colour_of_sky: "blue" });
    const result = failure(await save(owner, v, { exchange_type: "pure_barter", cash_component_kobo: 0, components: [g] }));
    expect(result.status).toBe(422);
    expect(result.detail.fields).toEqual({
      [`${g.id}.condition`]: "invalid",
      [`${g.id}.purchase_date`]: "invalid",
      [`${g.id}.colour_of_sky`]: "not_applicable",
    });
    const wrongCategory = failure(await save(owner, v, { exchange_type: "pure_barter", cash_component_kobo: 0, components: [{ ...service(), category: "electronics" }] }));
    expect(wrongCategory.status).toBe(422);
    const fraction = failure(await save(owner, v, { exchange_type: "pure_barter", cash_component_kobo: 1.5, components: [] }));
    expect(fraction.detail.fields).toEqual({ cash_component_kobo: "invalid" });
  });

  it("refuses a stale revision and another member's submission", async () => {
    const v = await create(owner);
    ok(await save(owner, v, { exchange_type: "pure_barter", cash_component_kobo: 0, components: [] }));
    expect(failure(await save(owner, v, { exchange_type: "pure_barter", cash_component_kobo: 0, components: [] }))).toMatchObject({
      status: 409,
      detail: { reason: "stale_revision", current_revision: 2 },
    });
    expect(failure(await save(other, { ...v, revision: 2 }, { exchange_type: "pure_barter", cash_component_kobo: 0, components: [] })).status).toBe(404);
    expect(failure(await rpc(other.client, "valuation_get", { p_submission_id: v.id })).status).toBe(404);
  });

  it("does not let an item id from another submission be taken over", async () => {
    const first = await create(owner);
    const g = goods();
    ok(await save(owner, first, { exchange_type: "pure_barter", cash_component_kobo: 0, components: [g] }));
    const second = await create(other);
    expect(failure(await save(other, second, { exchange_type: "pure_barter", cash_component_kobo: 0, components: [g] })).status).toBe(422);
  });
});

describe("sending for review", () => {
  it("lists every missing answer, the photos and the declaration", async () => {
    let v = await create(owner);
    const g = { ...goods(), category: null, description: "short", details: { has_known_defects: true } };
    v = ok(await save(owner, v, { exchange_type: "pure_barter", cash_component_kobo: 0, components: [g] }));
    v = ok((await addEvidence(owner, v, "photo", g.id)).result);
    const result = failure(await submit(owner, v, false));
    expect(result.status).toBe(422);
    expect(result.detail.fields).toMatchObject({
      declaration: "required",
      [`${g.id}.category`]: "required",
      [`${g.id}.description`]: "too_short",
      [`${g.id}.product_name`]: "required",
      [`${g.id}.condition`]: "required",
      [`${g.id}.defects`]: "required",
      [`${g.id}.estimated_age_months`]: "required",
      [`${g.id}.photos`]: "too_few",
    });
  });

  it("applies the exchange type rules", async () => {
    let v = await create(owner);
    v = ok(await save(owner, v, { exchange_type: "cash_plus_barter", cash_component_kobo: 0, components: [service()] }));
    expect(failure(await submit(owner, v)).detail.fields).toEqual({ cash_component_kobo: "required" });
    v = ok(await save(owner, v, { exchange_type: "pure_barter", cash_component_kobo: 500, components: [service()] }));
    expect(failure(await submit(owner, v)).detail.fields).toEqual({ cash_component_kobo: "not_allowed" });
    v = ok(await save(owner, v, { exchange_type: "cash_only", cash_component_kobo: 500, components: [service()] }));
    expect(failure(await submit(owner, v)).detail.fields).toEqual({ components: "not_allowed" });
  });

  it("sends a complete submission, and a retry returns the same result", async () => {
    let v = await create(owner);
    const s = service();
    v = ok(await save(owner, v, { exchange_type: "pure_barter", cash_component_kobo: 0, components: [s] }));
    const key = newKey();
    const args = { p_submission_id: v.id, p_expected_revision: v.revision, p_declaration: true, p_note: "", p_idempotency_key: key };
    const first = ok(await rpc<Valuation>(owner.client, "valuation_submit", args));
    const retry = ok(await rpc<Valuation>(owner.client, "valuation_submit", args));
    expect(first.status).toBe("submitted");
    expect(retry).toEqual(first);
    expect(first.declaration_accepted_at).toBeTruthy();
  });
});

describe("private evidence", () => {
  it("keeps files private to the uploader and BATR staff", async () => {
    let v = await create(owner);
    const g = goods();
    v = ok(await save(owner, v, { exchange_type: "pure_barter", cash_component_kobo: 0, components: [g] }));
    const { path, result } = await addEvidence(owner, v, "receipt", g.id);
    expect(ok(result).evidence[0]).toMatchObject({ kind: "receipt", sensitive: true });

    const signed = async (member: Member | null) =>
      (member ? member.client : anonClient()).storage.from("valuation-evidence").createSignedUrl(path, 60);
    expect((await signed(owner)).error).toBeNull();
    expect((await signed(other)).data).toBeNull();
    expect((await signed(null)).data).toBeNull();
    const download = await other.client.storage.from("valuation-evidence").download(path);
    expect(download.data).toBeNull();
    // Staff cannot read a draft's evidence; nobody can list other folders.
    expect((await signed(reviewer)).data).toBeNull();
    const listed = await other.client.storage.from("valuation-evidence").list(`${owner.id}/${v.id}`);
    expect(listed.data ?? []).toHaveLength(0);
  });

  it("lets staff read evidence once it is sent, through short-lived links", async () => {
    const { v } = await submitted();
    const { rows } = await db.query<{ storage_path: string }>("select storage_path from public.valuation_evidence where submission_id = $1", [v.id]);
    const path = rows[0]?.storage_path ?? "";
    expect((await reviewer.client.storage.from("valuation-evidence").createSignedUrl(path, 120)).data?.signedUrl).toBeTruthy();
    expect((await inspector.client.storage.from("valuation-evidence").createSignedUrl(path, 120)).data?.signedUrl).toBeTruthy();
    expect((await other.client.storage.from("valuation-evidence").createSignedUrl(path, 120)).data).toBeNull();
  });

  it("refuses uploads into another member's folder or submission", async () => {
    const v = await create(owner);
    const intoOwners = await other.client.storage
      .from("valuation-evidence")
      .upload(`${owner.id}/${v.id}/${randomUUID()}.webp`, WEBP_BYTES, { contentType: "image/webp" });
    expect(intoOwners.error).not.toBeNull();
    const ownFolder = await other.client.storage
      .from("valuation-evidence")
      .upload(`${other.id}/${v.id}/${randomUUID()}.webp`, WEBP_BYTES, { contentType: "image/webp" });
    expect(ownFolder.error).not.toBeNull();
    const badType = await owner.client.storage
      .from("valuation-evidence")
      .upload(`${owner.id}/${v.id}/${randomUUID()}.webp`, Buffer.from("<html></html>"), { contentType: "text/html" });
    expect(badType.error).not.toBeNull();
  });

  it("needs the uploaded file, and a photo must be a processed image", async () => {
    const v = await create(owner);
    const evidenceId = randomUUID();
    const missing = failure(
      await rpc(owner.client, "valuation_evidence_add", {
        p_submission_id: v.id, p_evidence_id: evidenceId, p_kind: "photo", p_component_id: null,
        p_mime: "image/webp", p_size_bytes: 10, p_request_hash: sha256(evidenceId), p_idempotency_key: newKey(),
      }),
    );
    expect(missing.detail.fields).toEqual({ file: "file_missing" });
    const pdfPhoto = failure(
      await rpc(owner.client, "valuation_evidence_add", {
        p_submission_id: v.id, p_evidence_id: evidenceId, p_kind: "photo", p_component_id: null,
        p_mime: "application/pdf", p_size_bytes: 10, p_request_hash: sha256(evidenceId), p_idempotency_key: newKey(),
      }),
    );
    expect(pdfPhoto.code).toBe("UNSUPPORTED_FORMAT");
  });

  it("refuses PDFs until malware scanning exists, in storage and in the table, and keeps images", async () => {
    let v = await create(owner);
    const g = goods();
    v = ok(await save(owner, v, { exchange_type: "pure_barter", cash_component_kobo: 0, components: [g] }));
    const pdfPath = `${owner.id}/${v.id}/${randomUUID()}.pdf`;
    const stored = await owner.client.storage.from("valuation-evidence").upload(pdfPath, PDF_BYTES, { contentType: "application/pdf" });
    expect(stored.error).not.toBeNull();
    await expect(db.query(
      "insert into public.valuation_evidence (id, submission_id, component_id, uploader_id, kind, storage_path, mime, size_bytes, sensitive) values ($1, $2, $3, $4, 'receipt', $5, 'application/pdf', 100, true)",
      [randomUUID(), v.id, g.id, owner.id, pdfPath],
    )).rejects.toThrow(/UNSUPPORTED_FORMAT/);
    const image = ok((await addEvidence(owner, v, "receipt", g.id)).result);
    expect(image.evidence.map((e) => e.kind)).toEqual(["receipt"]);
  });

  it("lets evidence be removed from an unsent draft only", async () => {
    let v = await create(owner);
    const s = service();
    v = ok(await save(owner, v, { exchange_type: "pure_barter", cash_component_kobo: 0, components: [s] }));
    const first = await addEvidence(owner, v, "portfolio", s.id);
    const removed = ok(await rpc<Valuation & { cleanup_paths: string[] }>(owner.client, "valuation_evidence_remove", {
      p_submission_id: v.id, p_evidence_id: first.evidenceId, p_idempotency_key: newKey(),
    }));
    expect(removed.cleanup_paths).toEqual([first.path]);
    const kept = await addEvidence(owner, v, "portfolio", s.id);
    v = ok(await submit(owner, await memberView(owner, v)));
    expect(failure(await rpc(owner.client, "valuation_evidence_remove", {
      p_submission_id: v.id, p_evidence_id: kept.evidenceId, p_idempotency_key: newKey(),
    })).status).toBe(409);
  });
});

// Review ----------------------------------------------------------------

describe("the reviewer workspace", () => {
  it("is for staff only, and never for their own submissions", async () => {
    const { v } = await submitted();
    expect(failure(await rpc(other.client, "review_queue", {})).status).toBe(403);
    expect(failure(await rpc(owner.client, "review_get", { p_submission_id: v.id })).status).toBe(403);
    const queue = ok(await rpc<{ id: string }[]>(reviewer.client, "review_queue", {}));
    expect(queue.map((row) => row.id)).toContain(v.id);

    await db.query("insert into private.staff_roles (member_id, role) values ($1, 'valuation_reviewer')", [owner.id]);
    try {
      expect(failure(await rpc(owner.client, "review_get", { p_submission_id: v.id }))).toMatchObject({ status: 403, detail: { reason: "own_submission" } });
      expect(failure(await decide(owner, v, { outcome: "approved", components: [] })).status).toBe(403);
      const ownQueue = ok(await rpc<{ id: string }[]>(owner.client, "review_queue", {}));
      expect(ownQueue.map((row) => row.id)).not.toContain(v.id);
    } finally {
      await db.query("delete from private.staff_roles where member_id = $1", [owner.id]);
    }
  });

  it("records comparisons with adjustments, and exclusions need a reason", async () => {
    const { v, componentId } = await submitted();
    const comparison = {
      component_id: componentId,
      source: "Jiji listing",
      url: "https://jiji.ng/example",
      observed_on: "2026-10-10",
      price_kind: "asking",
      price_kobo: 10_000_000,
      condition: "Used, good",
      characteristics: "Same model",
      adjustments: [{ factor: "condition", percent_bp: -1500, note: "Scratches" }, { factor: "age", percent_bp: 500, note: "" }],
    };
    const added = ok(await rpc<Valuation>(reviewer.client, "review_comparison_add", { p_submission_id: v.id, p_comparison: comparison, p_idempotency_key: newKey() }));
    expect(added.comparisons[0]?.adjusted_kobo).toBe(adjustedPrice(10_000_000, comparison.adjustments));
    expect(added.comparisons[0]?.adjusted_kobo).toBe(9_000_000);
    const badLink = failure(await rpc(reviewer.client, "review_comparison_add", {
      p_submission_id: v.id, p_comparison: { ...comparison, url: "javascript:alert(1)" }, p_idempotency_key: newKey(),
    }));
    expect(badLink.detail.fields).toEqual({ url: "invalid" });
    const id = added.comparisons[0]?.id;
    const noReason = failure(await rpc(reviewer.client, "review_comparison_exclude", {
      p_submission_id: v.id, p_comparison_id: id, p_excluded: true, p_reason: "", p_idempotency_key: newKey(),
    }));
    expect(noReason.status).toBe(422);
    const excluded = ok(await rpc<Valuation>(reviewer.client, "review_comparison_exclude", {
      p_submission_id: v.id, p_comparison_id: id, p_excluded: true, p_reason: "Listing is for a different storage size.", p_idempotency_key: newKey(),
    }));
    expect(excluded.comparisons[0]).toMatchObject({ excluded: true, exclusion_reason: "Listing is for a different storage size." });
  });

  it("keeps internal notes, internal events and excluded comparisons from the member", async () => {
    const { v, componentId } = await submitted();
    ok(await rpc(reviewer.client, "review_note_add", { p_submission_id: v.id, p_body: "Check the IMEI.", p_idempotency_key: newKey() }));
    const base = { component_id: componentId, url: "", observed_on: "2026-10-01", price_kind: "sold", condition: "", characteristics: "", adjustments: [] };
    const two = ok(await rpc<Valuation>(reviewer.client, "review_comparison_add", { p_submission_id: v.id, p_comparison: { ...base, source: "Kept", price_kobo: 8_000_000 }, p_idempotency_key: newKey() }));
    const withThird = ok(await rpc<Valuation>(reviewer.client, "review_comparison_add", { p_submission_id: v.id, p_comparison: { ...base, source: "Dropped", price_kobo: 1_000 }, p_idempotency_key: newKey() }));
    ok(await rpc(reviewer.client, "review_comparison_exclude", {
      p_submission_id: v.id, p_comparison_id: withThird.comparisons[1]?.id, p_excluded: true, p_reason: "Not the same item.", p_idempotency_key: newKey(),
    }));
    expect(two.notes).toHaveLength(1);
    const current = await reviewView(reviewer, v);
    ok(await decide(reviewer, current, { outcome: "approved", components: [{ component_id: componentId, value_kobo: 8_000_000 }] }));
    const seen = await memberView(owner, v);
    expect(seen).not.toHaveProperty("notes");
    expect(seen.comparisons.map((c) => (c as Json).source)).toEqual(["Kept"]);
    expect(JSON.stringify(seen)).not.toContain(reviewer.id);
    expect(JSON.stringify(seen)).not.toContain("IMEI");
    expect(seen.history.map((h) => h.action)).not.toContain("comparison_added");
  });
});

describe("decisions, evidence requests and inspections", () => {
  it("asks for more evidence, then takes the member's answer", async () => {
    let { v } = await submitted();
    v = await reviewView(reviewer, v);
    v = ok(await decide(reviewer, v, { outcome: "evidence_required", message: "Please add a photo of the screen switched on." }));
    expect(v.status).toBe("evidence_requested");
    let mine = await memberView(owner, v);
    expect(mine.requests[0]).toMatchObject({ message: "Please add a photo of the screen switched on.", responded_at: null });
    const componentId = (mine.components[0] as { id: string }).id;
    await addEvidence(owner, mine, "photo", componentId);
    mine = ok(await submit(owner, await memberView(owner, v), true, "Added the photo."));
    expect(mine.status).toBe("submitted");
    expect(mine.requests[0]).toMatchObject({ response_note: "Added the photo." });
    expect(mine.evidence.filter((e) => e.kind === "photo")).toHaveLength(3);
  });

  it("needs a completed inspection before approving once one is required", async () => {
    const start = await submitted();
    const componentId = start.componentId;
    let v = ok(await decide(reviewer, await reviewView(reviewer, start.v), { outcome: "inspection_required", message: "High value: inspect before approving." }));
    expect(v.status).toBe("inspection_required");
    const values = { outcome: "approved", components: [{ component_id: componentId, value_kobo: 8_500_000 }] };
    expect(failure(await decide(reviewer, v, values))).toMatchObject({ status: 409, detail: { reason: "inspection_pending" } });
    const inspection = v.inspections[0] as { id: string };
    expect(failure(await rpc(other.client, "review_inspection_update", { p_inspection_id: inspection.id, p_action: "complete", p_data: {}, p_idempotency_key: newKey() })).status).toBe(403);
    ok(await rpc(inspector.client, "review_inspection_update", {
      p_inspection_id: inspection.id, p_action: "schedule", p_data: { scheduled_for: "2026-10-20T10:00:00Z", arrangements: "Bodija market, main gate" }, p_idempotency_key: newKey(),
    }));
    const short = failure(await rpc(inspector.client, "review_inspection_update", { p_inspection_id: inspection.id, p_action: "complete", p_data: { findings: "ok" }, p_idempotency_key: newKey() }));
    expect(short.status).toBe(422);
    ok(await rpc(inspector.client, "review_inspection_update", {
      p_inspection_id: inspection.id, p_action: "complete",
      p_data: { findings: "Phone works, screen has light scratches, battery health 88%.", condition_confirmed: "good" }, p_idempotency_key: newKey(),
    }));
    v = ok(await decide(reviewer, await reviewView(reviewer, v), values));
    expect(v.status).toBe("assessed");
    const mine = await memberView(owner, v);
    expect(mine.assessments[0]).toMatchObject({ outcome: "approved", total_noncash_kobo: 8_500_000, inspected: true });
    expect(mine.inspections[0]).toMatchObject({ status: "completed", condition_confirmed: "good" });
    expect(mine.inspections[0]).not.toHaveProperty("inspector_id");
  });

  it("requires an inspection above the policy threshold once one is set", async () => {
    await db.query("update private.valuation_policies set inspection_threshold_kobo = 5000000");
    try {
      const { v, componentId } = await submitted();
      const current = await reviewView(reviewer, v);
      expect(current.inspection_threshold_kobo).toBe(5_000_000);
      const result = failure(await decide(reviewer, current, { outcome: "approved", components: [{ component_id: componentId, value_kobo: 6_000_000 }] }));
      expect(result.detail).toEqual({ reason: "inspection_required_by_policy" });
      ok(await decide(reviewer, current, { outcome: "approved", components: [{ component_id: componentId, value_kobo: 4_000_000 }] }));
    } finally {
      await db.query("update private.valuation_policies set inspection_threshold_kobo = null");
    }
  });

  it("needs one value per item and a rationale", async () => {
    const { v, componentId } = await submitted();
    const current = await reviewView(reviewer, v);
    expect(failure(await decide(reviewer, current, { outcome: "approved", components: [] })).detail.fields).toEqual({ components: "invalid" });
    expect(failure(await decide(reviewer, current, { outcome: "approved", components: [{ component_id: componentId, value_kobo: 0 }] })).status).toBe(422);
    expect(failure(await decide(reviewer, current, { outcome: "approved", rationale: "ok", components: [{ component_id: componentId, value_kobo: 1 }] })).detail.fields).toEqual({ rationale: "required" });
  });

  it("keeps assessments append-only", async () => {
    const { v, componentId } = await submitted();
    ok(await decide(reviewer, await reviewView(reviewer, v), { outcome: "approved", components: [{ component_id: componentId, value_kobo: 7_000_000 }] }));
    await expect(db.query("update public.valuation_assessments set total_noncash_kobo = 1 where submission_id = $1", [v.id])).rejects.toThrow(/append-only/);
  });
});

// Fees ------------------------------------------------------------------

describe("fee quotes", () => {
  it("pure barter: 3% of the assessed value, half each (₦100,000 → ₦3,000; ₦1,500 each)", async () => {
    const { v, componentId } = await submitted();
    const done = ok(await decide(reviewer, await reviewView(reviewer, v), { outcome: "approved", components: [{ component_id: componentId, value_kobo: 10_000_000 }] }));
    expect((await memberView(owner, done)).fee_quote).toMatchObject({
      exchange_type: "pure_barter", assessed_noncash_kobo: 10_000_000, cash_kobo: 0, fee_basis_kobo: 10_000_000, fee_bp: 300,
      total_fee_kobo: 300_000, party_a_share_kobo: 150_000, party_b_share_kobo: 150_000, policy_version: "fees-2026-10-17",
      requires_reconfirmation: false,
    });
  });

  it("barter plus cash: one fee on value plus cash (₦100,000 + ₦20,000 → ₦3,600; ₦1,800 each)", async () => {
    const { v, componentId } = await submitted("cash_plus_barter", 2_000_000);
    ok(await decide(reviewer, await reviewView(reviewer, v), { outcome: "approved", components: [{ component_id: componentId, value_kobo: 10_000_000 }] }));
    expect((await memberView(owner, v)).fee_quote).toMatchObject({
      fee_basis_kobo: 12_000_000, total_fee_kobo: 360_000, party_a_share_kobo: 180_000, party_b_share_kobo: 180_000,
    });
  });

  it("cash only: 3% of the agreed cash, with nothing to assess (₦100,000 → ₦3,000)", async () => {
    let v = await create(owner);
    v = ok(await save(owner, v, { exchange_type: "cash_only", cash_component_kobo: 10_000_000, components: [] }));
    v = ok(await submit(owner, v));
    expect(v.status).toBe("assessed");
    expect(v.assessments).toHaveLength(0);
    expect(v.fee_quote).toMatchObject({ fee_basis_kobo: 10_000_000, total_fee_kobo: 300_000, party_a_share_kobo: 150_000, party_b_share_kobo: 150_000 });
  });

  it("matches the shared calculator exactly, including rounding and odd kobo", async () => {
    const cases: [ExchangeType, number, number][] = [
      ["pure_barter", 1, 0], ["pure_barter", 33, 0], ["pure_barter", 50, 0], ["pure_barter", 1_234_567, 0],
      ["cash_plus_barter", 10_000_000, 2_000_000], ["cash_plus_barter", 99_999, 1], ["cash_plus_barter", 100_000_000_000_000, 33],
      ["cash_only", 0, 49], ["cash_only", 0, 10_000_000], ["cash_only", 0, 9_999_999_999],
    ];
    for (const [type, noncash, cash] of cases) {
      const { rows } = await db.query<{ fee: Json }>("select private.platform_fee($1, $2, $3) as fee", [type, noncash, cash]);
      const shared = calculatePlatformFee({ exchangeType: type, assessedNonCash: noncash, agreedCash: cash });
      expect(rows[0]?.fee).toEqual({
        exchange_type: shared.exchangeType, assessed_noncash_kobo: shared.assessedNonCash, cash_kobo: shared.agreedCash,
        fee_basis_kobo: shared.feeBasis, fee_bp: shared.feeBasisPoints, total_fee_kobo: shared.totalFee,
        party_a_share_kobo: shared.partyAShare, party_b_share_kobo: shared.partyBShare, policy_version: shared.policyVersion,
      });
    }
    await expect(db.query("select private.platform_fee('pure_barter', 100, 5)")).rejects.toThrow(/VALIDATION_FAILED/);
    await expect(db.query("select private.platform_fee('cash_only', 5, 100)")).rejects.toThrow(/VALIDATION_FAILED/);
  });

  it("withdrawing voids the quote", async () => {
    const { v, componentId } = await submitted();
    const done = ok(await decide(reviewer, await reviewView(reviewer, v), { outcome: "approved", components: [{ component_id: componentId, value_kobo: 5_000_000 }] }));
    const withdrawn = ok(await rpc<Valuation>(owner.client, "valuation_withdraw", { p_submission_id: v.id, p_expected_revision: done.revision, p_idempotency_key: newKey() }));
    expect(withdrawn).toMatchObject({ status: "withdrawn", fee_quote: null });
  });

  it("creates two liabilities that add up to the fee, and stores provider events once", async () => {
    const { v, componentId } = await submitted();
    ok(await decide(reviewer, await reviewView(reviewer, v), { outcome: "approved", components: [{ component_id: componentId, value_kobo: 3_333_333 }] }));
    const quote = (await memberView(owner, v)).fee_quote as { id: string; total_fee_kobo: number };
    const agreement = randomUUID();
    await db.query("select private.create_fee_liabilities($1, $2, $3, $4)", [quote.id, agreement, owner.id, other.id]);
    await db.query("select private.create_fee_liabilities($1, $2, $3, $4)", [quote.id, agreement, owner.id, other.id]);
    const { rows } = await db.query<{ party_role: string; amount_kobo: string }>(
      "select party_role, amount_kobo from public.fee_liabilities where agreement_id = $1 order by party_role", [agreement]);
    expect(rows.map((r) => [r.party_role, Number(r.amount_kobo)])).toEqual([["party_a", 50_000], ["party_b", 50_000]]);
    expect(rows.reduce((sum, r) => sum + Number(r.amount_kobo), 0)).toBe(quote.total_fee_kobo);

    const event = { p_provider: "flutterwave", p_event_id: `evt-${randomUUID()}`, p_event_type: "charge.completed", p_payload: {}, p_signature_valid: true };
    expect(ok(await rpc(admin, "payment_provider_event_record", event))).toEqual({ duplicate: false });
    expect(ok(await rpc(admin, "payment_provider_event_record", event))).toEqual({ duplicate: true });
    expect((await rpc(owner.client, "payment_provider_event_record", event)).error).not.toBeNull();
    expect((await owner.client.from("fee_liabilities").select("*")).data ?? []).toHaveLength(0);
  });
});

// Appeals ---------------------------------------------------------------

describe("appeals", () => {
  it("go to a different reviewer, and a revised value needs both parties to confirm again", async () => {
    const { v, componentId } = await submitted();
    let current = ok(await decide(reviewer, await reviewView(reviewer, v), { outcome: "approved", components: [{ component_id: componentId, value_kobo: 6_000_000 }] }));
    const firstQuote = (await memberView(owner, v)).fee_quote as { id: string };
    let mine = await memberView(owner, v);
    expect(failure(await rpc(owner.client, "valuation_appeal", { p_submission_id: v.id, p_expected_revision: mine.revision, p_reason: "too low", p_idempotency_key: newKey() })).status).toBe(422);
    mine = ok(await rpc<Valuation>(owner.client, "valuation_appeal", {
      p_submission_id: v.id, p_expected_revision: mine.revision,
      p_reason: "The same phone sold for ₦90,000 last week; receipt attached.", p_idempotency_key: newKey(),
    }));
    expect(mine.status).toBe("appealed");
    await addEvidence(owner, mine, "receipt", componentId);

    current = await reviewView(reviewer, v);
    const appealId = current.appeals[0]?.id;
    expect(failure(await rpc(reviewer.client, "review_appeal_claim", { p_appeal_id: appealId, p_idempotency_key: newKey() }))).toMatchObject({
      status: 403, detail: { reason: "appealed_reviewer" },
    });
    ok(await rpc(reviewer2.client, "review_appeal_claim", { p_appeal_id: appealId, p_idempotency_key: newKey() }));
    current = await reviewView(reviewer2, v);
    const decision = {
      outcome: "revised", components: [{ component_id: componentId, value_kobo: 8_000_000 }],
      rationale: "The receipt and a second sale support a higher value.", confidence: "high", limitations: "", message: "",
    };
    expect(failure(await rpc(reviewer.client, "review_appeal_decide", { p_appeal_id: appealId, p_expected_revision: current.revision, p_decision: decision, p_idempotency_key: newKey() })).status).toBe(403);
    ok(await rpc(reviewer2.client, "review_appeal_decide", { p_appeal_id: appealId, p_expected_revision: current.revision, p_decision: decision, p_idempotency_key: newKey() }));

    mine = await memberView(owner, v);
    expect(mine.status).toBe("assessed");
    expect(mine.assessments.map((a) => [a.version, a.total_noncash_kobo])).toEqual([[1, 6_000_000], [2, 8_000_000]]);
    expect(mine.appeals[0]).toMatchObject({ status: "decided", outcome: "revised" });
    expect(mine.fee_quote).toMatchObject({ total_fee_kobo: 240_000, requires_reconfirmation: true });
    const { rows } = await db.query<{ status: string; superseded_by: string }>("select status, superseded_by from public.fee_quotes where id = $1", [firstQuote.id]);
    expect(rows[0]).toMatchObject({ status: "superseded", superseded_by: (mine.fee_quote as { id: string }).id });
    // The appealed reviewer makes no later first-line decision on it either.
    expect((await reviewView(reviewer, v)).viewer).toMatchObject({ excluded: true });
    expect(mine).toMatchObject({ appeal_limit: 2, appeals_remaining: 1 });
  });

  it("allow a second, final appeal, handled by neither earlier decision-maker, then no third", async () => {
    const { v, componentId } = await submitted();
    ok(await decide(reviewer, await reviewView(reviewer, v), { outcome: "approved", components: [{ component_id: componentId, value_kobo: 6_000_000 }] }));
    const appealOnce = async (reason: string) => {
      const mine = await memberView(owner, v);
      return rpc<Valuation>(owner.client, "valuation_appeal", { p_submission_id: v.id, p_expected_revision: mine.revision, p_reason: reason, p_idempotency_key: newKey() });
    };
    const decideAppeal = async (by: Member, appealId: string | undefined, decision: Json) => {
      const current = await reviewView(by, v);
      return rpc<Valuation>(by.client, "review_appeal_decide", {
        p_appeal_id: appealId, p_expected_revision: current.revision,
        p_decision: { components: [], confidence: "high", limitations: "", message: "", ...decision }, p_idempotency_key: newKey(),
      });
    };

    // First appeal: reviewer2 upholds reviewer's value.
    ok(await appealOnce("The value ignores the original box and charger that come with it."));
    const first = (await reviewView(reviewer2, v)).appeals[0];
    expect(first).toMatchObject({ appeal_number: 1, excluded_reviewer_id: reviewer.id });
    ok(await rpc(reviewer2.client, "review_appeal_claim", { p_appeal_id: first?.id, p_idempotency_key: newKey() }));
    ok(await decideAppeal(reviewer2, first?.id, { outcome: "upheld", rationale: "Accessories are already reflected in the comparisons." }));
    const firstQuote = (await memberView(owner, v)).fee_quote as { id: string };
    expect(await memberView(owner, v)).toMatchObject({ status: "assessed", appeals_remaining: 1 });

    // Second appeal challenges reviewer2's uphold: neither reviewer2 nor reviewer may take it.
    const second = ok(await appealOnce("A receipt shows I paid ₦95,000 two months ago; please look again."));
    expect(second.appeals.map((a) => a.number)).toEqual([1, 2]);
    expect(second).toMatchObject({ status: "appealed", appeals_remaining: 0 });
    const [, secondAppeal] = (await reviewView(reviewer3, v)).appeals as (Valuation["appeals"][number] & { assessment_id: string })[];
    // Both appeals challenge the same assessment: the first upheld it.
    expect(secondAppeal).toMatchObject({ appeal_number: 2, excluded_reviewer_id: reviewer2.id, assessment_id: (first as { assessment_id?: string }).assessment_id });
    for (const blocked of [reviewer2, reviewer]) {
      expect(failure(await rpc(blocked.client, "review_appeal_claim", { p_appeal_id: secondAppeal?.id, p_idempotency_key: newKey() }))).toMatchObject({
        status: 403, detail: { reason: "appealed_reviewer" },
      });
    }
    ok(await rpc(reviewer3.client, "review_appeal_claim", { p_appeal_id: secondAppeal?.id, p_idempotency_key: newKey() }));
    ok(await decideAppeal(reviewer3, secondAppeal?.id, {
      outcome: "revised", components: [{ component_id: componentId, value_kobo: 8_500_000 }], rationale: "The receipt supports a higher value.",
    }));

    // A revised value: a new quote that supersedes the old one and needs both parties to confirm.
    const mine = await memberView(owner, v);
    expect(mine.assessments.map((a) => a.total_noncash_kobo)).toEqual([6_000_000, 8_500_000]);
    expect(mine.fee_quote).toMatchObject({ total_fee_kobo: 255_000, party_a_share_kobo: 127_500, party_b_share_kobo: 127_500, requires_reconfirmation: true });
    const { rows } = await db.query<{ status: string; superseded_by: string }>("select status, superseded_by from public.fee_quotes where id = $1", [firstQuote.id]);
    expect(rows[0]).toMatchObject({ status: "superseded", superseded_by: (mine.fee_quote as { id: string }).id });

    // No third appeal, through the function or straight into the table.
    expect(failure(await appealOnce("Asking for a third look at the value, please."))).toMatchObject({ status: 409, detail: { reason: "appeal_limit_reached" } });
    const latest = mine.assessments.at(-1) as { id: string };
    await expect(db.query(
      "insert into public.valuation_appeals (submission_id, assessment_id, appellant_id, reason, excluded_reviewer_id, appeal_number) values ($1, $2, $3, 'x', $4, 3)",
      [v.id, latest.id, owner.id, reviewer3.id],
    )).rejects.toThrow();
    // Every reviewer who made an appealed decision now only reads it.
    for (const member of [reviewer, reviewer2]) expect((await reviewView(member, v)).viewer).toMatchObject({ excluded: true });
  });

  it("replays a repeated appeal request instead of using up a second appeal", async () => {
    const { v, componentId } = await submitted();
    ok(await decide(reviewer, await reviewView(reviewer, v), { outcome: "approved", components: [{ component_id: componentId, value_kobo: 6_000_000 }] }));
    const mine = await memberView(owner, v);
    const key = newKey();
    const body = { p_submission_id: v.id, p_expected_revision: mine.revision, p_reason: "The same phone sold for more in Bodija last week.", p_idempotency_key: key };
    const once = ok(await rpc<Valuation>(owner.client, "valuation_appeal", body));
    const twice = ok(await rpc<Valuation>(owner.client, "valuation_appeal", body));
    expect(twice).toEqual(once);
    expect((await memberView(owner, v)).appeals).toHaveLength(1);
  });

  it("let a first appeal ask for evidence, then allow the second appeal against the next decision", async () => {
    const { v, componentId } = await submitted();
    ok(await decide(reviewer, await reviewView(reviewer, v), { outcome: "approved", components: [{ component_id: componentId, value_kobo: 6_000_000 }] }));
    let mine = await memberView(owner, v);
    ok(await rpc(owner.client, "valuation_appeal", { p_submission_id: v.id, p_expected_revision: mine.revision, p_reason: "The battery was replaced last month; receipt to follow.", p_idempotency_key: newKey() }));
    const appealId = (await reviewView(reviewer2, v)).appeals[0]?.id;
    ok(await rpc(reviewer2.client, "review_appeal_claim", { p_appeal_id: appealId, p_idempotency_key: newKey() }));
    let current = await reviewView(reviewer2, v);
    ok(await rpc(reviewer2.client, "review_appeal_decide", {
      p_appeal_id: appealId, p_expected_revision: current.revision,
      p_decision: { outcome: "evidence_required", components: [], rationale: "Need the repair receipt.", confidence: "medium", limitations: "", message: "Please add the battery repair receipt." },
      p_idempotency_key: newKey(),
    }));
    mine = await memberView(owner, v);
    expect(mine).toMatchObject({ status: "evidence_requested", appeals_remaining: 1 });
    await addEvidence(owner, mine, "repair_record", componentId);
    ok(await submit(owner, await memberView(owner, v)));
    // The reviewer whose value was appealed still can't decide; another can.
    current = await reviewView(reviewer3, v);
    expect(failure(await decide(reviewer, current, { outcome: "approved", components: [{ component_id: componentId, value_kobo: 7_000_000 }] }))).toMatchObject({ status: 403 });
    ok(await decide(reviewer3, current, { outcome: "approved", components: [{ component_id: componentId, value_kobo: 7_000_000 }] }));
    mine = await memberView(owner, v);
    const second = ok(await rpc<Valuation>(owner.client, "valuation_appeal", { p_submission_id: v.id, p_expected_revision: mine.revision, p_reason: "Still lower than recent sales of the same model.", p_idempotency_key: newKey() }));
    expect(second).toMatchObject({ status: "appealed", appeals_remaining: 0 });
    expect((await reviewView(reviewer2, v)).appeals[1]).toMatchObject({ appeal_number: 2, excluded_reviewer_id: reviewer3.id });
  });

  it("leave an appealed reviewer read-only on that valuation, whichever route they try", async () => {
    const { v, componentId } = await submitted();
    ok(await decide(reviewer, await reviewView(reviewer, v), { outcome: "inspection_required", message: "Inspect the screen before approving." }));
    const inspection = (await reviewView(reviewer2, v)).inspections[0] as { id: string };
    ok(await rpc(inspector.client, "review_inspection_update", { p_inspection_id: inspection.id, p_action: "complete", p_data: { findings: "Screen has a small crack in one corner." }, p_idempotency_key: newKey() }));
    ok(await decide(reviewer, await reviewView(reviewer, v), { outcome: "not_approved", rationale: "Cracked screen is not disclosed in the form." }));
    const mine = await memberView(owner, v);
    ok(await rpc(owner.client, "valuation_appeal", { p_submission_id: v.id, p_expected_revision: mine.revision, p_reason: "The crack was disclosed in the condition notes.", p_idempotency_key: newKey() }));

    const forbidden = { status: 403, detail: { reason: "appealed_reviewer" } };
    const comparison = { component_id: componentId, source: "Jiji", url: "", observed_on: "2026-10-10", price_kind: "asking", price_kobo: 9_000_000, condition: "", characteristics: "", adjustments: [] };
    expect(failure(await rpc(reviewer.client, "review_comparison_add", { p_submission_id: v.id, p_comparison: comparison, p_idempotency_key: newKey() }))).toMatchObject(forbidden);
    expect(failure(await rpc(reviewer.client, "review_note_add", { p_submission_id: v.id, p_body: "Uphold this.", p_idempotency_key: newKey() }))).toMatchObject(forbidden);
    const appealId = (await reviewView(reviewer2, v)).appeals[0]?.id;
    expect(failure(await rpc(reviewer.client, "review_appeal_claim", { p_appeal_id: appealId, p_idempotency_key: newKey() }))).toMatchObject(forbidden);
    // Not even by writing the assignment straight into the table.
    await expect(db.query("update public.valuation_appeals set status = 'assigned', assigned_reviewer_id = $2 where id = $1", [appealId, reviewer.id])).rejects.toThrow();
    // Nor can the member's own account take it, even with a reviewer role.
    await expect(db.query("update public.valuation_appeals set status = 'assigned', assigned_reviewer_id = $2 where id = $1", [appealId, owner.id])).rejects.toThrow();
    ok(await rpc(reviewer2.client, "review_note_add", { p_submission_id: v.id, p_body: "Checking the condition notes.", p_idempotency_key: newKey() }));
  });

  it("can uphold a refusal", async () => {
    const { v } = await submitted();
    ok(await decide(reviewer, await reviewView(reviewer, v), { outcome: "not_approved", rationale: "Photos do not show the item described in the form." }));
    let mine = await memberView(owner, v);
    expect(mine).toMatchObject({ status: "not_approved", fee_quote: null });
    mine = ok(await rpc<Valuation>(owner.client, "valuation_appeal", {
      p_submission_id: v.id, p_expected_revision: mine.revision, p_reason: "The photos are of the right item; see the serial.", p_idempotency_key: newKey(),
    }));
    const appealId = (await reviewView(reviewer2, v)).appeals[0]?.id;
    ok(await rpc(reviewer2.client, "review_appeal_claim", { p_appeal_id: appealId, p_idempotency_key: newKey() }));
    const current = await reviewView(reviewer2, v);
    ok(await rpc(reviewer2.client, "review_appeal_decide", {
      p_appeal_id: appealId, p_expected_revision: current.revision,
      p_decision: { outcome: "upheld", components: [], rationale: "The serial in the photo doesn't match the receipt.", confidence: "high", limitations: "", message: "" },
      p_idempotency_key: newKey(),
    }));
    expect((await memberView(owner, v)).status).toBe("not_approved");
  });
});

describe("assessed value on an offer", () => {
  it("is shown to signed-in members only; signed-out visitors learn at most that it was assessed", async () => {
    const { v, componentId } = await submitted();
    ok(await decide(reviewer, await reviewView(reviewer, v), { outcome: "approved", components: [{ component_id: componentId, value_kobo: 7_500_000 }] }));
    const offerId = (await memberView(owner, v)).offer_id as string;
    const summary = ok(await rpc<Json>(other.client, "offer_valuation_summary", { p_offer_id: offerId }));
    expect(summary).toEqual({ total_noncash_kobo: 7_500_000, confidence: "medium", inspected: false, assessed_at: expect.any(String), policy_version: VALUATION_POLICY.version });

    // Signed out: no permission to the summary, and the indicator is a bare yes or no.
    const anonSummary = await rpc(anonClient(), "offer_valuation_summary", { p_offer_id: offerId });
    expect(anonSummary.data ?? null).toBeNull();
    expect(anonSummary.error).not.toBeNull();
    expect(JSON.stringify(anonSummary)).not.toContain("7500000");
    expect(ok(await rpc(anonClient(), "offer_assessment_indicator", { p_offer_id: offerId }))).toBe(true);
    for (const table of ["valuation_assessments", "fee_quotes", "valuation_submissions"]) {
      expect((await anonClient().from(table).select("*")).data ?? []).toHaveLength(0);
    }

    const draftOffer = await offerIn(owner, "draft");
    expect(ok(await rpc(other.client, "offer_valuation_summary", { p_offer_id: draftOffer.id }))).toBeNull();
    expect(ok(await rpc(anonClient(), "offer_assessment_indicator", { p_offer_id: draftOffer.id }))).toBe(false);
    expect((await anonClient().from("valuation_submissions").select("*")).data ?? []).toHaveLength(0);
    expect((await other.client.from("valuation_evidence").select("*")).data ?? []).toHaveLength(0);
  });
});

describe("staff roles", () => {
  it("records every grant and removal in a log that can't be edited", async () => {
    const staff = await createMember("staff-audit");
    await db.query("insert into private.staff_roles (member_id, role) values ($1, 'valuation_inspector')", [staff.id]);
    await db.query("delete from private.staff_roles where member_id = $1", [staff.id]);
    const { rows } = await db.query<{ role: string; action: string }>(
      "select role, action from private.staff_role_events where member_id = $1 order by id", [staff.id]);
    expect(rows).toEqual([{ role: "valuation_inspector", action: "granted" }, { role: "valuation_inspector", action: "revoked" }]);
    await expect(db.query("update private.staff_role_events set action = 'granted' where member_id = $1", [staff.id])).rejects.toThrow();
    await expect(db.query("delete from private.staff_role_events where member_id = $1", [staff.id])).rejects.toThrow();
  });
});

describe("repeat valuations", () => {
  const repeatNote = "Added the original receipt and a photo of the serial number.";

  /** A valuation of `offerId` with the given photos, saved and ready to send. */
  async function draftWith(offerId: string, photos: Buffer[], item = goods()) {
    let v = await create(owner, offerId);
    v = ok(await save(owner, v, { exchange_type: "pure_barter", cash_component_kobo: 0, components: [item] }));
    for (const bytes of photos) v = ok((await addEvidence(owner, v, "photo", item.id, bytes)).result);
    return { v, item };
  }

  /** Sends a valuation and has `reviewer` refuse it, so BATR has decided it. */
  async function refused(offerId: string, photos: Buffer[]) {
    const { v } = await draftWith(offerId, photos);
    ok(await submit(owner, v));
    ok(await decide(reviewer, await reviewView(reviewer, v), { outcome: "not_approved", rationale: "The photos don't show the serial number clearly." }));
    return memberView(owner, v);
  }

  it("refuse an unchanged resubmission, even with only the proposed value changed, and accept new evidence with a note", async () => {
    const offer = await offerIn(owner, "active");
    const photos = [uniqueWebp(), uniqueWebp()];
    const first = await refused(offer.id, photos);

    const same = await draftWith(offer.id, photos, { ...goods(), proposed_value_kobo: 12_000_000 });
    expect(same.v.repeat_of).toMatchObject({ id: first.id, status: "not_approved", same_offer: true, outcome: "not_approved", final: false });
    expect(failure(await submit(owner, same.v, true, repeatNote))).toMatchObject({ status: 409, detail: { reason: "repeat_without_change" } });

    // A genuinely new photo: still needs a note saying what's new.
    const withNew = ok((await addEvidence(owner, same.v, "photo", same.item.id)).result);
    expect(failure(await submit(owner, withNew, true, "new"))).toMatchObject({ status: 422, detail: { fields: { note: "repeat_reason_required" } } });
    const sent = ok(await submit(owner, withNew, true, repeatNote));
    expect(sent).toMatchObject({ status: "submitted", repeat_reason: repeatNote, appeals_remaining: 2 });
    expect(sent.repeat_of).toMatchObject({ id: first.id });
    expect((await reviewView(reviewer2, sent)).repeat_of).toMatchObject({ id: first.id });
  });

  it("accept a material change of the facts without new files", async () => {
    const offer = await offerIn(owner, "active");
    const photos = [uniqueWebp(), uniqueWebp()];
    await refused(offer.id, photos);
    const changed = await draftWith(offer.id, photos, goods(randomUUID(), { condition: "fair", condition_notes: "Small crack in the top corner." }));
    expect(ok(await submit(owner, changed.v, true, "Disclosed the screen crack and changed the condition to fair."))).toMatchObject({ status: "submitted" });
  });

  it("catch the same files sent again on another offer", async () => {
    const photos = [uniqueWebp(), uniqueWebp()];
    const first = await refused((await offerIn(owner, "active")).id, photos);
    const elsewhere = await draftWith((await offerIn(owner, "active")).id, photos);
    expect(elsewhere.v.repeat_of).toMatchObject({ id: first.id, same_offer: false });
    expect(failure(await submit(owner, elsewhere.v, true, repeatNote))).toMatchObject({ status: 409, detail: { reason: "repeat_without_change" } });
    // Once it carries something new, the repeat is sent and still names the earlier valuation on the other offer.
    const withNew = ok((await addEvidence(owner, elsewhere.v, "photo", elsewhere.item.id)).result);
    const sent = ok(await submit(owner, withNew, true, repeatNote));
    expect(sent.repeat_of).toMatchObject({ id: first.id, same_offer: false });
    expect((await reviewView(reviewer2, sent)).repeat_of).toMatchObject({ id: first.id, same_offer: false });
  });

  it("keep earlier conflicted reviewers off a repeat, and ask both parties to reconfirm its fee", async () => {
    const offer = await offerIn(owner, "active");
    const photos = [uniqueWebp(), uniqueWebp()];
    // First valuation: reviewer approves, the member appeals, reviewer2 upholds, then the member withdraws.
    const { v, item } = await draftWith(offer.id, photos);
    ok(await submit(owner, v));
    ok(await decide(reviewer, await reviewView(reviewer, v), { outcome: "approved", components: [{ component_id: item.id, value_kobo: 6_000_000 }] }));
    let mine = await memberView(owner, v);
    ok(await rpc(owner.client, "valuation_appeal", { p_submission_id: v.id, p_expected_revision: mine.revision, p_reason: "Recent sales of this model are higher.", p_idempotency_key: newKey() }));
    const appealId = (await reviewView(reviewer2, v)).appeals[0]?.id;
    ok(await rpc(reviewer2.client, "review_appeal_claim", { p_appeal_id: appealId, p_idempotency_key: newKey() }));
    ok(await rpc(reviewer2.client, "review_appeal_decide", {
      p_appeal_id: appealId, p_expected_revision: (await reviewView(reviewer2, v)).revision,
      p_decision: { outcome: "upheld", components: [], rationale: "The comparisons already cover recent sales.", confidence: "high", limitations: "", message: "" },
      p_idempotency_key: newKey(),
    }));
    mine = await memberView(owner, v);
    ok(await rpc(owner.client, "valuation_withdraw", { p_submission_id: v.id, p_expected_revision: mine.revision, p_idempotency_key: newKey() }));

    // The repeat, with a new photo: the appealed reviewer stays read-only on it.
    const again = await draftWith(offer.id, [...photos, uniqueWebp()]);
    const sent = ok(await submit(owner, again.v, true, repeatNote));
    expect((await reviewView(reviewer, sent)).viewer).toMatchObject({ excluded: true });
    expect(failure(await decide(reviewer, await reviewView(reviewer, sent), { outcome: "approved", components: [{ component_id: again.item.id, value_kobo: 7_000_000 }] })))
      .toMatchObject({ status: 403, detail: { reason: "appealed_reviewer" } });
    ok(await decide(reviewer3, await reviewView(reviewer3, sent), { outcome: "approved", components: [{ component_id: again.item.id, value_kobo: 7_000_000 }] }));
    const repeated = await memberView(owner, sent);
    expect(repeated.fee_quote).toMatchObject({ total_fee_kobo: 210_000, requires_reconfirmation: true });
    expect(repeated).toMatchObject({ appeals_remaining: 2 });
  });

  it("show when the earlier decision was final", async () => {
    const offer = await offerIn(owner, "active");
    const photos = [uniqueWebp(), uniqueWebp()];
    const { v } = await draftWith(offer.id, photos);
    ok(await submit(owner, v));
    ok(await decide(reviewer, await reviewView(reviewer, v), { outcome: "not_approved", rationale: "The item in the photos doesn't match the form." }));
    for (const by of [reviewer2, reviewer3]) {
      const mine = await memberView(owner, v);
      ok(await rpc(owner.client, "valuation_appeal", { p_submission_id: v.id, p_expected_revision: mine.revision, p_reason: "The photos show the same phone as the form.", p_idempotency_key: newKey() }));
      const appeal = (await reviewView(by, v)).appeals.at(-1);
      ok(await rpc(by.client, "review_appeal_claim", { p_appeal_id: appeal?.id, p_idempotency_key: newKey() }));
      ok(await rpc(by.client, "review_appeal_decide", {
        p_appeal_id: appeal?.id, p_expected_revision: (await reviewView(by, v)).revision,
        p_decision: { outcome: "upheld", components: [], rationale: "Still doesn't match the form.", confidence: "high", limitations: "", message: "" },
        p_idempotency_key: newKey(),
      }));
    }
    const again = await draftWith(offer.id, photos);
    expect(again.v.repeat_of).toMatchObject({ final: true, appeals_used: 2 });
    expect(failure(await submit(owner, again.v, true, repeatNote))).toMatchObject({ status: 409, detail: { reason: "repeat_without_change" } });
  });
});
