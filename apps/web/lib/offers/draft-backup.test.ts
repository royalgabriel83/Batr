import { describe, expect, it } from "vitest";
import { EMPTY_OFFER_FIELDS } from "@batr/shared";
import { backupKey, clearBackup, saveBackup, takeBackup } from "./draft-backup";

function memoryStore() {
  const map = new Map<string, string>();
  return {
    map,
    getItem: (key: string) => map.get(key) ?? null,
    setItem: (key: string, value: string) => void map.set(key, value),
    removeItem: (key: string) => void map.delete(key),
  };
}

describe("draft backup", () => {
  it("keeps values and the revision they were typed against, per offer, and returns them once", () => {
    const store = memoryStore();
    saveBackup("abc", { ...EMPTY_OFFER_FIELDS, title: "Lamp" }, 4, store);
    expect(store.map.has(backupKey("abc"))).toBe(true);
    expect(takeBackup(null, store)).toBeNull();
    expect(takeBackup("abc", store)).toEqual({ values: { ...EMPTY_OFFER_FIELDS, title: "Lamp" }, revision: 4 });
    expect(takeBackup("abc", store)).toBeNull();
  });
  it("a new offer has no revision", () => {
    const store = memoryStore();
    saveBackup(null, { ...EMPTY_OFFER_FIELDS, title: "Lamp" }, null, store);
    expect(takeBackup(null, store)?.revision).toBeNull();
  });
  it("can be cleared", () => {
    const store = memoryStore();
    saveBackup("abc", EMPTY_OFFER_FIELDS, 1, store);
    clearBackup("abc", store);
    expect(takeBackup("abc", store)).toBeNull();
  });
  it("ignores values that don't pass the field schema", () => {
    const store = memoryStore();
    store.setItem(backupKey(null), JSON.stringify({ values: { category: "spaceships" }, revision: null }));
    expect(takeBackup(null, store)).toBeNull();
    store.setItem(backupKey(null), "not json");
    expect(takeBackup(null, store)).toBeNull();
  });
  it("works without storage", () => {
    expect(() => saveBackup(null, EMPTY_OFFER_FIELDS, null, null)).not.toThrow();
    expect(() => clearBackup(null, null)).not.toThrow();
    expect(takeBackup(null, null)).toBeNull();
  });
});
