import type pg from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import * as offers from "@/app/api/v1/offers/route";
import * as publish from "@/app/api/v1/offers/[id]/publish/route";
import * as photos from "@/app/api/v1/offers/[id]/photos/route";
import * as proposals from "@/app/api/v1/proposals/route";
import * as accept from "@/app/api/v1/proposals/[id]/accept/route";
import * as agreement from "@/app/api/v1/agreements/[id]/route";
import * as handover from "@/app/api/v1/agreements/[id]/handover/route";
import * as problem from "@/app/api/v1/agreements/[id]/problem/route";
import * as problemReply from "@/app/api/v1/agreements/[id]/problem/reply/route";
import * as reports from "@/app/api/v1/reports/route";
import * as queue from "@/app/api/v1/moderation/reports/route";
import * as report from "@/app/api/v1/moderation/reports/[id]/route";
import * as assign from "@/app/api/v1/moderation/reports/[id]/assign/route";
import * as act from "@/app/api/v1/moderation/reports/[id]/actions/route";
import * as suspensions from "@/app/api/v1/moderation/suspensions/route";
import * as lift from "@/app/api/v1/moderation/suspensions/[id]/lift/route";
import * as appeal from "@/app/api/v1/moderation/suspensions/[id]/appeal/route";
import * as status from "@/app/api/v1/me/status/route";
import * as warning from "@/app/api/v1/me/warning/route";
import { PUBLISHABLE_FIELDS, call, connect, expectations, member, phoneJpeg, photoForm, type ApiMember } from "./support";

// Milestone 8: cases, assignment, appeals and exchange problems through
// the real route handlers (specs/milestone-8-moderation-and-disputes.md).

let a: ApiMember; // offer owner
let b: ApiMember; // proposer
let mod: ApiMember; // moderator
let mod2: ApiMember; // another moderator
let senior: ApiMember; // senior moderator
let jpeg: Buffer;
let db: pg.Client;

beforeAll(async () => {
  [a, b, mod, mod2, senior] = await Promise.all([member("kemi"), member("uche"), member("mo"), member("mide"), member("sade")]);
  jpeg = await phoneJpeg(1200, 900);
  db = await connect();
  await db.query(
    "insert into private.staff_roles (member_id, role) values ($1, 'moderator'), ($2, 'moderator'), ($3, 'senior_moderator')",
    [mod.id, mod2.id, senior.id],
  );
});
afterAll(async () => {
  await db.end();
});

type Offer = { id: string; status: string; revision: number };
type Problem = {
  can_report: boolean;
  paused: boolean;
  current: { status: string; reason: string | null; reported_by_you: boolean; can_reply: boolean; replied: boolean } | null;
};
type Agreement = { id: string; status: string; binding_version_id: string; paused: boolean; actions: Record<string, boolean>; problem: Problem };
type Case = {
  id: string;
  case_number: number;
  subject_type: string;
  status: string;
  risk: string;
  assignee_name: string | null;
  assigned_to_me: boolean;
  reporter_name: string;
  member_counts: { reports_30_days: number; earlier_actions: number; breaches: number };
  history: { action: string; note: string }[];
  actions: Record<string, boolean>;
  subject: { agreement?: { paused: boolean; reply: string | null; terms: { gives: string[]; gets: string[] } } };
};

async function active(as: ApiMember, title: string): Promise<Offer> {
  const created = await call<Offer>(offers.POST, "POST", "/api/v1/offers", { as, body: { ...PUBLISHABLE_FIELDS, title } });
  let current = created.body.data as Offer;
  const added = await call<Offer>(photos.POST, "POST", `/api/v1/offers/${current.id}/photos`, { as, form: photoForm(jpeg, current), params: { id: current.id } });
  current = added.body.data as Offer;
  const live = await call<Offer>(publish.POST, "POST", `/api/v1/offers/${current.id}/publish`, { as, body: expectations(current), params: { id: current.id } });
  return live.body.data as Offer;
}

/** B proposes a bike for A's camera; A accepts. */
async function agreed(title: string): Promise<Agreement> {
  const [target, mine] = await Promise.all([active(a, title), active(b, `Bike for ${title}`)]);
  const sent = await call<{ id: string; latest_revision_id: string }>(proposals.POST, "POST", "/api/v1/proposals", {
    as: b,
    body: { offer_id: target.id, gives: [{ kind: "offer", offer_id: mine.id }], gets: [{ kind: "offer", offer_id: target.id }] },
  });
  const p = sent.body.data as { id: string; latest_revision_id: string };
  const accepted = await call<{ agreement_id: string }>(accept.POST, "POST", `/api/v1/proposals/${p.id}/accept`, {
    as: a,
    body: { revision_id: p.latest_revision_id },
    params: { id: p.id },
  });
  return read(a, accepted.body.data?.agreement_id as string);
}

async function read(as: ApiMember, id: string): Promise<Agreement> {
  const result = await call<Agreement>(agreement.GET, "GET", `/api/v1/agreements/${id}`, { as, params: { id } });
  expect(result.status, JSON.stringify(result.body)).toBe(200);
  return result.body.data as Agreement;
}

/** Titles are searched, and the database isn't reset between runs. */
const tag = Math.random().toString(36).slice(2, 8);

const listCases = (as: ApiMember, query = "") => call<{ reports: Case[] }>(queue.GET, "GET", "/api/v1/moderation/reports", { as, query });
const getCase = (as: ApiMember, id: string) => call<Case>(report.GET, "GET", `/api/v1/moderation/reports/${id}`, { as, params: { id } });

describe("exchange problems (D1–D5)", () => {
  it("pauses handover for both, takes one reply, keeps the reporter anonymous, and resumes", async () => {
    const ag = await agreed(`Problem camera ${tag}`);
    expect(ag.problem).toEqual({ can_report: true, paused: false, current: null });

    const short = await call(problem.POST, "POST", `/api/v1/agreements/${ag.id}/problem`, {
      as: b,
      body: { reason: "no_show", details: "Didn't come" },
      params: { id: ag.id },
    });
    expect(short.status).toBe(422);
    expect(short.body.error?.fields).toHaveProperty("details");

    const filed = await call<Agreement>(problem.POST, "POST", `/api/v1/agreements/${ag.id}/problem`, {
      as: b,
      body: { reason: "no_show", details: "We agreed Ikeja at 4pm and Ada never came." },
      params: { id: ag.id },
    });
    expect(filed.status, JSON.stringify(filed.body)).toBe(201);
    expect(filed.body.data).toMatchObject({
      paused: true,
      actions: { handover: false, propose_change: false, request_cancel: true },
      problem: { paused: true, can_report: false, current: { status: "open", reason: "no_show", reported_by_you: true, can_reply: false } },
    });

    // The other member is told, but not who reported it or why.
    const theirs = await read(a, ag.id);
    expect(theirs.problem.current).toMatchObject({ reported_by_you: false, reason: null, can_reply: true });

    const blocked = await call(handover.POST, "POST", `/api/v1/agreements/${ag.id}/handover`, {
      as: a,
      body: { version_id: ag.binding_version_id },
      params: { id: ag.id },
    });
    expect(blocked.status).toBe(409);
    expect(blocked.body.error).toMatchObject({ reason: "paused" });

    const again = await call(problem.POST, "POST", `/api/v1/agreements/${ag.id}/problem`, {
      as: a,
      body: { reason: "safety", details: "Bayo was rude when we spoke on the phone." },
      params: { id: ag.id },
    });
    expect(again.status).toBe(409);
    expect(again.body.error).toMatchObject({ reason: "already_reported" });

    const reply = await call<Agreement>(problemReply.POST, "POST", `/api/v1/agreements/${ag.id}/problem/reply`, {
      as: a,
      body: { reply: "I waited at the gate from 4 to 5." },
      params: { id: ag.id },
    });
    expect(reply.status).toBe(200);
    expect(reply.body.data?.problem.current).toMatchObject({ replied: true, can_reply: false });
    const twice = await call(problemReply.POST, "POST", `/api/v1/agreements/${ag.id}/problem/reply`, {
      as: a,
      body: { reply: "One more thing." },
      params: { id: ag.id },
    });
    expect(twice.status).toBe(409);
    expect(twice.body.error).toMatchObject({ reason: "already_replied" });
    const ownReply = await call(problemReply.POST, "POST", `/api/v1/agreements/${ag.id}/problem/reply`, {
      as: b,
      body: { reply: "Adding to my own report." },
      params: { id: ag.id },
    });
    expect(ownReply.status).toBe(409);

    // The case, as the moderator sees it: high risk, the reply, labels only.
    const cases = await listCases(mod, `?type=agreement&q=${encodeURIComponent(`Problem camera ${tag}`)}`);
    const found = cases.body.data?.reports.find((c) => c.reporter_name === "uche");
    expect(found).toMatchObject({ risk: "high", status: "open" });
    const detail = await getCase(mod, found?.id as string);
    expect(detail.body.data?.subject.agreement).toMatchObject({ paused: true, reply: "I waited at the gate from 4 to 5." });
    expect(detail.body.data?.subject.agreement?.terms.gets).toEqual([`Problem camera ${tag}`]);
    expect(detail.body.data?.actions).toMatchObject({ resume: true, cancel_agreement: true, record_breach: true, dismiss: false });
    const text = JSON.stringify(detail.body);
    for (const secret of [a.id, b.id, "thumb_path", "display_path"]) expect(text).not.toContain(secret);

    const resumed = await call<Case>(act.POST, "POST", `/api/v1/moderation/reports/${found?.id}/actions`, {
      as: mod,
      body: { action: "resume", note: "Both turned up late; carry on." },
      params: { id: found?.id as string },
    });
    expect(resumed.status, JSON.stringify(resumed.body)).toBe(200);
    expect(resumed.body.data?.status).toBe("closed");
    const after = await read(a, ag.id);
    expect(after).toMatchObject({ paused: false, actions: { handover: true }, problem: { paused: false, current: { status: "reviewed" } } });
  });

  it("lets a moderator cancel the agreement or record a breach against the reporter", async () => {
    const ag = await agreed(`Cancelled camera ${tag}`);
    await call(problem.POST, "POST", `/api/v1/agreements/${ag.id}/problem`, {
      as: a,
      body: { reason: "not_as_described", details: "The bike's frame is cracked, not as shown." },
      params: { id: ag.id },
    });
    const cases = await listCases(mod, `?q=${encodeURIComponent(`Cancelled camera ${tag}`)}`);
    const id = cases.body.data?.reports[0]?.id as string;
    const cancelled = await call(act.POST, "POST", `/api/v1/moderation/reports/${id}/actions`, {
      as: mod,
      body: { action: "cancel_agreement", note: "Photos show the crack; cancelled." },
      params: { id },
    });
    expect(cancelled.status).toBe(200);
    expect((await read(b, ag.id)).status).toBe("cancelled");

    const second = await agreed(`Breach camera ${tag}`);
    await call(problem.POST, "POST", `/api/v1/agreements/${second.id}/problem`, {
      as: b,
      body: { reason: "not_received", details: "I handed over the bike and got nothing back." },
      params: { id: second.id },
    });
    const caseId = (await listCases(mod, `?q=${encodeURIComponent(`Breach camera ${tag}`)}`)).body.data?.reports[0]?.id as string;
    const breach = await call<Case>(act.POST, "POST", `/api/v1/moderation/reports/${caseId}/actions`, {
      as: mod,
      body: { action: "record_breach", note: "Reporter never handed over.", target: "reporter" },
      params: { id: caseId },
    });
    expect(breach.status, JSON.stringify(breach.body)).toBe(200);
    expect(breach.body.data?.history[0]).toMatchObject({ action: "record_breach" });
    expect((await read(b, second.id)).paused).toBe(false);
  });
});

describe("cases (W1–W9)", () => {
  it("are 404 for members on every new endpoint", async () => {
    const target = await active(a, "Hidden case offer");
    const filed = (await call<{ id: string }>(reports.POST, "POST", "/api/v1/reports", { as: b, body: { subject_type: "offer", offer_id: target.id, reason: "spam" } }))
      .body.data as { id: string };
    expect((await call(assign.POST, "POST", `/api/v1/moderation/reports/${filed.id}/assign`, { as: b, params: { id: filed.id } })).status).toBe(404);
    expect((await call(assign.POST, "POST", `/api/v1/moderation/reports/${filed.id}/assign`, { params: { id: filed.id } })).status).toBe(404);
    expect((await listCases(b, "?risk=high")).status).toBe(404);
    expect(
      (await call(appeal.POST, "POST", `/api/v1/moderation/suspensions/${filed.id}/appeal`, { as: b, body: { outcome: "lifted", note: "Not a moderator here." }, params: { id: filed.id } }))
        .status,
    ).toBe(404);
  });

  it("filter, search, take over with a log, and order high risk first", async () => {
    // Fresh owners, so neither case is high risk from earlier reports (W2).
    const [spammer, scammer] = await Promise.all([member("femi"), member("gozie")]);
    const spam = await active(spammer, `Spammy listing ${tag}`);
    const scam = await active(scammer, `Scam listing ${tag}`);
    const spamCase = (await call<{ id: string }>(reports.POST, "POST", "/api/v1/reports", { as: b, body: { subject_type: "offer", offer_id: spam.id, reason: "spam" } }))
      .body.data as { id: string };
    const scamCase = (await call<{ id: string }>(reports.POST, "POST", "/api/v1/reports", { as: b, body: { subject_type: "offer", offer_id: scam.id, reason: "scam" } }))
      .body.data as { id: string };

    const all = (await listCases(mod, "?type=offer")).body.data?.reports.map((c) => c.id) ?? [];
    expect(all.indexOf(scamCase.id)).toBeLessThan(all.indexOf(spamCase.id));
    const low = (await listCases(mod, "?risk=low")).body.data?.reports.map((c) => c.id) ?? [];
    expect(low).toContain(spamCase.id);
    expect(low).not.toContain(scamCase.id);
    const searched = (await listCases(mod, `?q=${encodeURIComponent(`Spammy listing ${tag}`)}`)).body.data?.reports ?? [];
    expect(searched.map((c) => c.id)).toEqual([spamCase.id]);
    const byNumber = (await listCases(mod, `?q=${String(searched[0]?.case_number)}`)).body.data?.reports ?? [];
    expect(byNumber.map((c) => c.id)).toEqual([spamCase.id]);
    // An unknown filter value is ignored rather than refused.
    expect((await listCases(mod, "?risk=extreme")).status).toBe(200);

    const taken = await call<Case>(assign.POST, "POST", `/api/v1/moderation/reports/${spamCase.id}/assign`, { as: mod, params: { id: spamCase.id } });
    expect(taken.body.data).toMatchObject({ status: "in_review", assigned_to_me: true, actions: { take: false } });
    const mine = (await listCases(mod, "?assigned=me")).body.data?.reports.map((c) => c.id) ?? [];
    expect(mine).toContain(spamCase.id);
    const unassigned = (await listCases(mod, "?assigned=unassigned")).body.data?.reports.map((c) => c.id) ?? [];
    expect(unassigned).not.toContain(spamCase.id);

    const takenOver = await call<Case>(assign.POST, "POST", `/api/v1/moderation/reports/${spamCase.id}/assign`, { as: mod2, params: { id: spamCase.id } });
    expect(takenOver.body.data?.history.map((h) => h.note)).toEqual(["Took over this case from mo.", "Took this case."]);
  });

  it("let only a senior moderator lift someone else's suspension and record an appeal", async () => {
    const target = await active(a, "Appeal offer");
    const filed = (await call<{ id: string }>(reports.POST, "POST", "/api/v1/reports", { as: b, body: { subject_type: "member", offer_id: target.id, reason: "harassment" } }))
      .body.data as { id: string };
    const suspended = await call(act.POST, "POST", `/api/v1/moderation/reports/${filed.id}/actions`, {
      as: mod,
      body: { action: "suspend", note: "Harassment in messages." },
      params: { id: filed.id },
    });
    expect(suspended.status).toBe(200);
    type Suspension = { id: string; member_name: string; mine: boolean; appeal_outcome: string | null };
    const listed = (await call<{ suspensions: Suspension[] }>(suspensions.GET, "GET", "/api/v1/moderation/suspensions", { as: mod2 })).body.data?.suspensions ?? [];
    const s = listed.find((x) => x.member_name === "kemi") as Suspension;
    expect(s).toMatchObject({ mine: false, appeal_outcome: null });

    const notSenior = await call(lift.POST, "POST", `/api/v1/moderation/suspensions/${s.id}/lift`, { as: mod2, body: { note: "Seems fine to me." }, params: { id: s.id } });
    expect(notSenior.status).toBe(403);
    expect(notSenior.body.error).toMatchObject({ reason: "senior_only", message: "Only a senior moderator can do this." });
    const appealByMod = await call(appeal.POST, "POST", `/api/v1/moderation/suspensions/${s.id}/appeal`, {
      as: mod,
      body: { outcome: "upheld", note: "Reviewed the email appeal." },
      params: { id: s.id },
    });
    expect(appealByMod.status).toBe(403);

    const upheld = await call(appeal.POST, "POST", `/api/v1/moderation/suspensions/${s.id}/appeal`, {
      as: senior,
      body: { outcome: "upheld", note: "Reviewed the email appeal." },
      params: { id: s.id },
    });
    expect(upheld.status, JSON.stringify(upheld.body)).toBe(200);
    const decided = await call(appeal.POST, "POST", `/api/v1/moderation/suspensions/${s.id}/appeal`, {
      as: senior,
      body: { outcome: "lifted", note: "Changed my mind on this." },
      params: { id: s.id },
    });
    expect(decided.status).toBe(409);
    expect(decided.body.error).toMatchObject({ reason: "already_decided" });

    const lifted = await call(lift.POST, "POST", `/api/v1/moderation/suspensions/${s.id}/lift`, { as: senior, body: { note: "Lifted after a month." }, params: { id: s.id } });
    expect(lifted.status).toBe(200);
  });

  it("show a warned member the banner once", async () => {
    const target = await active(b, "Warned offer");
    const filed = (await call<{ id: string }>(reports.POST, "POST", "/api/v1/reports", { as: a, body: { subject_type: "member", offer_id: target.id, reason: "harassment" } }))
      .body.data as { id: string };
    const warned = await call(act.POST, "POST", `/api/v1/moderation/reports/${filed.id}/actions`, {
      as: mod,
      body: { action: "warn", note: "First report; a warning." },
      params: { id: filed.id },
    });
    expect(warned.status).toBe(200);
    type Status = { warned: boolean };
    expect((await call<Status>(status.GET, "GET", "/api/v1/me/status", { as: b })).body.data?.warned).toBe(true);
    expect((await call(warning.POST, "POST", "/api/v1/me/warning", { as: b })).status).toBe(200);
    expect((await call<Status>(status.GET, "GET", "/api/v1/me/status", { as: b })).body.data?.warned).toBe(false);
  });
});
