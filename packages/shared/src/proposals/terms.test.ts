import { describe, expect, it } from "vitest";
import {
  cashLabel,
  changedWord,
  chipsFor,
  exchangeTitle,
  formatDay,
  formatRecordTime,
  shortRef,
  formatWhen,
  handoverInstruction,
  itemLabel,
  itemsSentence,
  nameOr,
  otherRole,
  sidesFor,
} from "./terms.ts";
import type { ItemView, RevisionView } from "./views.ts";

const offer = (title: string, id = title): ItemView => ({
  kind: "offer",
  offer_id: id,
  content_version: 1,
  changed: false,
  snapshot: {
    title,
    description: "",
    condition: null,
    category: null,
    offering_text: "",
    wants_text: "",
    photo: null,
  },
});
const text = (description: string): ItemView => ({ kind: "text", description });
const revision = (
  gives: ItemView[],
  gets: ItemView[],
  extra: Partial<RevisionView> = {},
): RevisionView => ({
  id: "r",
  number: 1,
  author: "proposer",
  gives,
  gets,
  cash: null,
  note: "",
  created_at: "2026-10-20T09:56:00Z",
  ...extra,
});

describe("terms from the viewer's side", () => {
  it("maps the stored sides to You give and You get", () => {
    const terms = { gives: [1], gets: [2] };
    expect(sidesFor("proposer", terms)).toEqual({ give: [1], get: [2] });
    expect(sidesFor("owner", terms)).toEqual({ give: [2], get: [1] });
    expect(otherRole("owner")).toBe("proposer");
    expect(otherRole("proposer")).toBe("owner");
  });

  it("says who pays the cash", () => {
    expect(cashLabel(null, "owner", "Ada")).toBeNull();
    expect(
      cashLabel({ amount_naira: 20000, payer: "proposer" }, "proposer", "Ada"),
    ).toBe("You pay ₦20,000");
    expect(
      cashLabel({ amount_naira: 20000, payer: "proposer" }, "owner", "Bayo"),
    ).toBe("Bayo pays ₦20,000");
  });

  it("names items and lists them in a sentence", () => {
    expect(itemLabel(offer(""))).toBe("An offer");
    expect(itemsSentence([])).toBe("");
    expect(itemsSentence([offer("Road bike")])).toBe("Road bike");
    expect(
      itemsSentence([offer("Road bike"), text("A charger"), text("A pump")]),
    ).toBe("Road bike, A charger and A pump");
    expect(nameOr(null)).toBe("The other member");
    expect(nameOr("  ", "Someone")).toBe("Someone");
    expect(nameOr("Ada")).toBe("Ada");
  });

  it("shows change chips against the previous revision", () => {
    const first = revision([offer("Bike")], [offer("Camera")]);
    const second = revision(
      [offer("Bike"), text("A pump")],
      [offer("Camera")],
      { cash: { amount_naira: 500, payer: "owner" }, note: "Ok?" },
    );
    expect(chipsFor(undefined, first)).toEqual([]);
    expect(chipsFor(first, second)).toEqual(["added", "cash", "note"]);
  });

  it("formats times in Nigerian time", () => {
    expect(formatWhen("2026-10-20T09:56:00Z")).toBe("20 Oct, 10:56");
    expect(formatRecordTime("2026-10-20T09:56:00Z")).toBe("20 Oct 2026, 10:56 WAT");
    expect(shortRef("95545102-02ea-4719-b112-805911472c15")).toBe("Ref. 95545102");
    expect(formatDay("2026-11-03T09:56:00Z")).toBe("3 November");
  });
});

describe("exchangeTitle", () => {
  it("leads with the listed offer, whichever side it is on", () => {
    const terms = { gives: [offer("Road bike", "bike")], gets: [offer("Canon camera", "camera")] };
    expect(exchangeTitle(terms, "camera")).toBe("Canon camera");
    expect(exchangeTitle(terms, "bike")).toBe("Road bike");
  });

  it("falls back to an offer, then a described item", () => {
    expect(exchangeTitle({ gives: [{ kind: "text", description: "Two hours of tutoring" }], gets: [offer("Desk")] }, "gone")).toBe("Desk");
    expect(exchangeTitle({ gives: [{ kind: "text", description: "Two hours of tutoring" }], gets: [] })).toBe("Two hours of tutoring");
    expect(exchangeTitle({ gives: [], gets: [] })).toBe("An exchange");
  });
});

describe("service wording (milestone 9, V5 and V6)", () => {
  const lesson = (id: string): ItemView => {
    const item = offer("Maths lessons", id);
    return item.kind === "offer" ? { ...item, snapshot: { ...item.snapshot, offer_type: "service" } } : item;
  };

  it("names what changed a service only when every changed offer is one", () => {
    const items = [offer("Road bike", "bike"), lesson("maths"), text("A charger")];
    expect(changedWord(items, ["maths"])).toBe("service");
    expect(changedWord(items, ["bike", "maths"])).toBe("item");
    // Snapshots from before services have no type: an item.
    expect(changedWord(items, ["bike"])).toBe("item");
  });

  it("asks for the service to be done before a handover is confirmed", () => {
    expect(handoverInstruction([lesson("a"), lesson("b")])).toBe("Confirm only once the service has been done.");
    expect(handoverInstruction([offer("Road bike"), lesson("a")])).toBe("Confirm only once you've handed over your side and the service has been done.");
    expect(handoverInstruction([offer("Road bike"), text("Cash")])).toBe("Confirm only once you've handed over your side.");
  });
});
