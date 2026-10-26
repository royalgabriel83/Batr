import { describe, expect, it } from "vitest";
import { guardedDestination, type LinkClick, type LinkTarget } from "./leave-guard";

const here = new URL("http://localhost:3000/offers/new");
const click = (change: Partial<LinkClick> = {}): LinkClick => ({
  button: 0,
  metaKey: false,
  ctrlKey: false,
  shiftKey: false,
  altKey: false,
  defaultPrevented: false,
  ...change,
});
const link = (href: string, change: Partial<LinkTarget> = {}): LinkTarget => ({ href, target: "", download: false, ...change });

describe("guardedDestination", () => {
  it("steps in for a plain click on another BATR page", () => {
    expect(guardedDestination(click(), link("http://localhost:3000/my-offers"), here)).toBe("/my-offers");
    expect(guardedDestination(click(), link("/offers/abc/edit?x=1#top"), here)).toBe("/offers/abc/edit?x=1#top");
  });
  it("leaves new-tab clicks, other buttons and handled clicks alone", () => {
    for (const change of [{ metaKey: true }, { ctrlKey: true }, { shiftKey: true }, { altKey: true }, { button: 1 }, { defaultPrevented: true }]) {
      expect(guardedDestination(click(change), link("/my-offers"), here)).toBeNull();
    }
    expect(guardedDestination(click(), link("/my-offers", { target: "_blank" }), here)).toBeNull();
    expect(guardedDestination(click(), link("/my-offers", { download: true }), here)).toBeNull();
  });
  it("leaves other sites and same-page anchors to the browser", () => {
    expect(guardedDestination(click(), link("https://example.com/"), here)).toBeNull();
    expect(guardedDestination(click(), link("/offers/new#photos"), here)).toBeNull();
  });
});
