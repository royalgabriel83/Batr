import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type pg from "pg";
import {
  AGREEMENT_LIMITS,
  MESSAGE_LIMITS,
  MODERATION_ACTIONS,
  REPORT_REASON_IDS,
  CASE_SUBJECTS,
  PROBLEM_REASON_IDS,
  SAFETY_LIMITS,
  NOTIFICATION_KINDS,
  SYSTEM_EVENTS,
  AGREEMENT_STATUSES,
  VERSION_OUTCOMES,
  OFFER_CATEGORY_IDS,
  OFFER_CONDITION_IDS,
  OFFER_FIELD_GROUPS,
  OFFER_TYPE_IDS,
  categoryType,
  offerTypeProblems,
  type OfferType,
  OFFER_STATUSES,
  OFFER_TRANSITIONS,
  PUBLISH_RULE_MESSAGES,
  DISPLAY_NAME_LINK_PATTERN,
  DisplayNameSchema,
  checkOfferFields,
  logisticsProblem,
  OFFER_AREA_IDS,
  OFFER_EXCHANGE_MODE_IDS,
  OFFER_HANDOVER_METHOD_IDS,
  OFFER_HANDOVER_METHODS,
  type OfferExchangeMode,
  type OfferHandoverMethod,
  type OfferFields,
  ADJUSTMENT_FACTORS,
  APPEAL_OUTCOMES,
  ASSESSMENT_OUTCOMES,
  COMPARISON_PRICE_KINDS,
  COMPONENT_KINDS,
  CONFIDENCE_LEVELS,
  DETAIL_ENUMS,
  EVIDENCE_KINDS,
  EVIDENCE_LIMITS,
  EXCHANGE_TYPES,
  FEE_POLICY,
  GOODS_DETAIL_FIELDS,
  SENSITIVE_EVIDENCE_KINDS,
  SERVICE_CATEGORIES,
  SERVICE_DETAIL_FIELDS,
  VALUATION_LIMITS,
  VALUATION_POLICY,
  DETAIL_LIMITS,
  adjustedPrice,
  CASH_PAYERS,
  PROPOSAL_LIMITS,
  PROPOSAL_STATUSES,
} from "../../packages/shared/src/index.ts";
import { connect } from "./support/db.ts";

// The database copies of the shared rules must equal packages/shared
// (state-model.md §1: "A test asserts both tables are identical").

let db: pg.Client;
beforeAll(async () => {
  db = await connect();
});
afterAll(async () => {
  await db.end();
});

const sorted = <T>(rows: T[]) => rows.map((r) => JSON.stringify(r)).sort();

describe("database rules equal packages/shared", () => {
  it("transition table", async () => {
    const { rows } = await db.query("select action, from_status as from, to_status as to from private.offer_transitions");
    expect(sorted(rows)).toEqual(sorted(OFFER_TRANSITIONS.map((r) => ({ action: r.action, from: r.from, to: r.to }))));
  });

  it("statuses", async () => {
    const { rows } = await db.query("select unnest(enum_range(null::public.offer_status))::text as status");
    expect(rows.map((r) => r.status)).toEqual([...OFFER_STATUSES]);
  });

  it("field groups", async () => {
    const { rows } = await db.query("select field, field_group from private.offer_field_groups");
    expect(Object.fromEntries(rows.map((r) => [r.field, r.field_group]))).toEqual(OFFER_FIELD_GROUPS);
  });

  it("categories and conditions", async () => {
    const categories = await db.query("select id from private.offer_categories order by id");
    const conditions = await db.query("select id from private.offer_conditions order by id");
    expect(categories.rows.map((r) => r.id)).toEqual([...OFFER_CATEGORY_IDS].sort());
    expect(conditions.rows.map((r) => r.id)).toEqual([...OFFER_CONDITION_IDS].sort());
  });

  it("offer types: each category's type and each method's service flag (milestone 9)", async () => {
    const categories = await db.query("select id, offer_type from private.offer_categories order by id");
    expect(categories.rows.map((r) => [r.id, r.offer_type])).toEqual([...OFFER_CATEGORY_IDS].sort().map((id) => [id, categoryType(id)]));
    const methods = await db.query("select id, for_service from private.offer_handover_methods order by id");
    expect(methods.rows.map((r) => [r.id, r.for_service])).toEqual(
      [...OFFER_HANDOVER_METHOD_IDS].sort().map((id) => [id, OFFER_HANDOVER_METHODS[id].service]),
    );
    const check = await db.query("select pg_get_constraintdef(oid) as def from pg_constraint where conname = 'offers_offer_type_check'");
    for (const type of OFFER_TYPE_IDS) expect(check.rows[0]?.def ?? "").toContain(`'${type}'`);
  });

  it("type rules give the same reasons for the same input", async () => {
    const cases: [OfferType, string | null, string | null, OfferHandoverMethod[]][] = [
      ["item", "electronics", "good", ["collection"]],
      ["item", "repairs", "good", ["remote_service"]],
      ["service", "repairs", null, ["on_site_service", "remote_service"]],
      ["service", "electronics", "new", ["delivery"]],
      ["service", null, null, []],
      ["item", null, null, ["on_site_service"]],
    ];
    for (const [type, category, condition, methods] of cases) {
      const { rows } = await db.query("select private.offer_type_problems($1, $2, $3, $4) as problems", [type, category, condition, methods]);
      expect([type, category, rows[0].problems]).toEqual([type, category, offerTypeProblems(type, category, condition, methods)]);
    }
  });

  it("areas, exchange modes and handover methods", async () => {
    const areas = await db.query("select id from private.offer_areas order by id");
    const modes = await db.query("select id from private.offer_exchange_modes order by id");
    const methods = await db.query("select id, in_person from private.offer_handover_methods order by id");
    expect(areas.rows.map((r) => r.id)).toEqual([...OFFER_AREA_IDS].sort());
    expect(modes.rows.map((r) => r.id)).toEqual([...OFFER_EXCHANGE_MODE_IDS].sort());
    expect(methods.rows.map((r) => [r.id, r.in_person])).toEqual(
      [...OFFER_HANDOVER_METHOD_IDS].sort().map((id) => [id, OFFER_HANDOVER_METHODS[id].inPerson]),
    );
  });

  it("logistics combinations are refused the same way", async () => {
    const cases: [OfferExchangeMode | null, OfferHandoverMethod[]][] = [
      ["remote", ["collection"]], ["remote", ["remote_service"]], ["in_person", ["remote_service"]],
      ["in_person", ["delivery", "public_meetup"]], ["either", ["collection", "remote_service"]], [null, ["delivery"]],
    ];
    for (const [mode, methods] of cases) {
      const { rows } = await db.query("select private.logistics_problem($1, $2) as field", [mode, methods]);
      expect([mode, methods, rows[0].field !== null]).toEqual([mode, methods, logisticsProblem(mode, methods) !== null]);
    }
  });

  it("publish rules fail the same fields for the same input", async () => {
    const base: OfferFields = {
      offer_type: "item", title: "Road bike", description: "", category: "other", condition: "good", offering_text: "Bike", wants_text: "Tent",
      area: null, exchange_mode: null, handover_methods: [],
    };
    const cases: [Partial<OfferFields>, number][] = [
      [{}, 1], [{}, 8], [{}, 0], [{}, 9],
      [{ title: "Bike" }, 1], [{ title: "Bikes" }, 1], [{ title: "" }, 1],
      [{ category: null, condition: null }, 1],
      [{ offering_text: "ab", wants_text: "abc" }, 1],
      [{ title: "", category: null, condition: null, offering_text: "", wants_text: "" }, 0],
    ];
    for (const [change, photos] of cases) {
      const fields = { ...base, ...change };
      const shared = checkOfferFields("publish", fields, photos);
      const expected = shared.ok ? [] : Object.keys(shared.errors).sort();
      const { rows } = await db.query("select private.publish_rule_failures($1, $2, $3, $4, $5, $6) as failures", [
        fields.title, fields.category, fields.condition, fields.offering_text, fields.wants_text, photos,
      ]);
      expect([change, photos, [...rows[0].failures].sort()]).toEqual([change, photos, expected]);
    }
  });

  it("display-name link pattern", async () => {
    const { rows } = await db.query("select private.display_name_link_pattern() as pattern");
    expect(rows[0].pattern).toBe(DISPLAY_NAME_LINK_PATTERN);
  });

  it("display-name rules accept and refuse the same names", async () => {
    const names = [
      "Ab", "A", "a".repeat(40), "a".repeat(41), "  Ada  ", "   A   ", "🙂🙂", "🙂".repeat(40), "🙂".repeat(41),
      "Mary.Ann", "J. R. Smith", "bob.com", "BOB.COM", "Visit Bob.COM now", "https://x", "HTTP:x", "ftp://x",
      "www.bob", "WWW.bob", "bob.shop/now", "Bob.company", "bob.co.", "bob.io-", "bob.me7", "Zoë Ò'Brien",
    ];
    for (const name of names) {
      const shared = DisplayNameSchema.safeParse(name);
      const { rows } = await db.query("select private.valid_display_name(private.trim_text($1)) as valid", [name]);
      expect([name, rows[0].valid]).toEqual([name, shared.success]);
    }
  });

  it("every publish rule the database reports has a shared message", async () => {
    const { rows } = await db.query("select private.publish_rule_failures('', null, null, '', '', 0) as failures");
    expect([...rows[0].failures].sort()).toEqual(Object.keys(PUBLISH_RULE_MESSAGES).sort());
  });

  it("valuation reference lists", async () => {
    const { rows } = await db.query<{ list: string; ids: string[] }>(
      "select list, array_agg(id order by id) as ids from private.valuation_options group by list",
    );
    const lists = Object.fromEntries(rows.map((r) => [r.list, r.ids]));
    const keys = (record: Record<string, unknown>) => Object.keys(record).sort();
    expect(lists).toEqual({
      exchange_type: keys(EXCHANGE_TYPES),
      component_kind: keys(COMPONENT_KINDS),
      service_category: keys(SERVICE_CATEGORIES),
      condition: keys(DETAIL_ENUMS.condition),
      goods_status: keys(DETAIL_ENUMS.goods_status),
      functional_status: keys(DETAIL_ENUMS.functional_status),
      complexity: keys(DETAIL_ENUMS.complexity),
      recurrence: keys(DETAIL_ENUMS.recurrence),
      evidence_kind: keys(EVIDENCE_KINDS),
      sensitive_evidence_kind: [...SENSITIVE_EVIDENCE_KINDS].sort(),
      comparison_price_kind: keys(COMPARISON_PRICE_KINDS),
      adjustment_factor: keys(ADJUSTMENT_FACTORS),
      assessment_outcome: keys(ASSESSMENT_OUTCOMES),
      appeal_outcome: keys(APPEAL_OUTCOMES),
      confidence: keys(CONFIDENCE_LEVELS),
    });
  });

  it("valuation questions", async () => {
    const { rows } = await db.query(
      "select kind_group, key, type, options, required, required_when, required_unless from private.valuation_detail_fields order by kind_group, position",
    );
    const shared = (group: string, fields: typeof GOODS_DETAIL_FIELDS) =>
      fields.map((f) => ({
        kind_group: group,
        key: f.key,
        type: f.type,
        options: f.options ?? null,
        required: f.required ?? false,
        required_when: f.requiredWhen ?? null,
        required_unless: f.requiredUnless ?? null,
      }));
    expect(rows).toEqual([...shared("goods", GOODS_DETAIL_FIELDS), ...shared("service", SERVICE_DETAIL_FIELDS)]);
  });

  it("valuation limits, fee policy and comparison adjustments", async () => {
    const limit = async (name: string) => Number((await db.query("select private.valuation_limit($1) as v", [name])).rows[0]?.v);
    expect(await limit("kobo_max")).toBe(VALUATION_LIMITS.koboMax);
    expect(await limit("components_max")).toBe(VALUATION_LIMITS.componentsMax);
    expect(await limit("description_min")).toBe(VALUATION_LIMITS.descriptionMinToSubmit);
    expect(await limit("text_max")).toBe(DETAIL_LIMITS.textMax);
    expect(await limit("long_text_max")).toBe(DETAIL_LIMITS.longTextMax);
    expect(await limit("integer_max")).toBe(DETAIL_LIMITS.integerMax);
    expect(await limit("evidence_max")).toBe(EVIDENCE_LIMITS.maxPerSubmission);
    expect(await limit("evidence_bytes_max")).toBe(EVIDENCE_LIMITS.maxBytes);
    expect(await limit("min_photos_per_goods")).toBe(EVIDENCE_LIMITS.minPhotosPerGoods);
    const fee = (await db.query("select version, fee_bp, party_share_bp, currency from private.current_fee_policy()")).rows[0];
    expect(fee).toEqual({ version: FEE_POLICY.version, fee_bp: FEE_POLICY.feeBasisPoints, party_share_bp: FEE_POLICY.partyShareBasisPoints, currency: FEE_POLICY.currency });
    const valuation = (await db.query("select version, inspection_threshold_kobo, appeals_max, pdf_uploads_enabled from private.current_valuation_policy()")).rows[0];
    expect(valuation).toEqual({
      version: VALUATION_POLICY.version,
      inspection_threshold_kobo: VALUATION_POLICY.inspectionThresholdKobo,
      appeals_max: VALUATION_POLICY.appealsMax,
      pdf_uploads_enabled: VALUATION_POLICY.pdfUploadsEnabled,
    });
    for (const [price, adjustments] of [
      [10_000_000, []],
      [10_000_000, [{ percent_bp: -1500 }, { percent_bp: 500 }]],
      [333, [{ percent_bp: -5000 }]],
      [1_000, [{ percent_bp: -9000 }, { percent_bp: -9000 }]],
      [99_999_999, [{ percent_bp: 3333 }]],
    ] as const) {
      const { rows } = await db.query("select private.comparison_adjusted_kobo($1, $2) as v", [price, JSON.stringify(adjustments)]);
      expect(Number(rows[0]?.v)).toBe(adjustedPrice(price, adjustments));
    }
  });

  it("proposal statuses, limits and cash payers", async () => {
    const statuses = await db.query("select unnest(enum_range(null::public.proposal_status))::text as status");
    expect(statuses.rows.map((r: { status: string }) => r.status)).toEqual([...PROPOSAL_STATUSES]);
    const limits = await db.query<{ name: string; value: number }>("select name, value from private.proposal_limits");
    expect(Object.fromEntries(limits.rows.map((r) => [r.name, r.value]))).toEqual({ ...PROPOSAL_LIMITS });
    const payers = await db.query<{ def: string }>(
      "select pg_get_constraintdef(oid) as def from pg_constraint where conrelid = 'public.proposal_revisions'::regclass and pg_get_constraintdef(oid) like '%cash_payer%ANY%'",
    );
    for (const payer of CASH_PAYERS) expect(payers.rows[0]?.def).toContain(`'${payer}'`);
  });

  it("agreement statuses, version outcomes and limits", async () => {
    const constraint = async (table: string, column: string) =>
      (
        await db.query<{ def: string }>(
          `select pg_get_constraintdef(oid) as def from pg_constraint where conrelid = $1::regclass and pg_get_constraintdef(oid) like '%' || $2 || '%ANY%'`,
          [table, column],
        )
      ).rows[0]?.def ?? "";
    const quoted = (def: string) => [...def.matchAll(/'([a-z_]+)'::text/g)].map((m) => m[1]);
    expect(quoted(await constraint("public.agreements", "status"))).toEqual([...AGREEMENT_STATUSES]);
    expect(quoted(await constraint("public.agreement_versions", "outcome"))).toEqual([...VERSION_OUTCOMES]);
    const limits = await db.query<{ name: string; value: number }>("select name, value from private.agreement_limits");
    expect(Object.fromEntries(limits.rows.map((r) => [r.name, r.value]))).toEqual({ ...AGREEMENT_LIMITS });
  });

  it("message limits and event kinds", async () => {
    const limits = await db.query<{ name: string; value: number }>("select name, value from private.message_limits");
    expect(Object.fromEntries(limits.rows.map((r) => [r.name, r.value]))).toEqual({ ...MESSAGE_LIMITS });
    const kinds = await db.query<{ kinds: string[] }>("select private.event_kinds() as kinds");
    expect(kinds.rows[0]?.kinds).toEqual([...SYSTEM_EVENTS]);
    expect(NOTIFICATION_KINDS).toEqual(["message", ...SYSTEM_EVENTS]);
  });

  it("safety limits, report reasons, subjects and moderator actions", async () => {
    const limits = await db.query<{ name: string; value: number }>("select name, value from private.safety_limits");
    expect(Object.fromEntries(limits.rows.map((r) => [r.name, r.value]))).toEqual({ ...SAFETY_LIMITS });
    const reasons = await db.query<{ reasons: string[] }>("select private.report_reasons() as reasons");
    expect(reasons.rows[0]?.reasons).toEqual(REPORT_REASON_IDS);
    const problems = await db.query<{ reasons: string[] }>("select private.problem_reasons() as reasons");
    expect(problems.rows[0]?.reasons).toEqual(PROBLEM_REASON_IDS);
    const check = async (table: string, column: string) =>
      [...((await db.query<{ def: string }>(
        `select pg_get_constraintdef(oid) as def from pg_constraint where conrelid = $1::regclass and conname = $2`,
        [table, `${table.split(".")[1] ?? ""}_${column}_check`],
      )).rows[0]?.def ?? "").matchAll(/'([a-z_]+)'::text/g)].map((m) => m[1]!);
    expect(await check("public.reports", "subject_type")).toEqual([...CASE_SUBJECTS]);
    expect((await check("public.moderation_actions", "action")).filter((a) => !["unsuspend", "assign", "appeal_upheld", "appeal_lifted"].includes(a))).toEqual([...MODERATION_ACTIONS]);
  });
});
