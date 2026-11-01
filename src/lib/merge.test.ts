import { afterEach, describe, expect, it, vi } from "vitest";
import { dismissSuggestion, fingerprint, liveSuggestions, mergeArticles, sanitizeSuggestions } from "./merge";
import { INCOMPLETE } from "./article-ai";
import type { Idea } from "./ideas";

const ideas: Idea[] = ["a", "b", "c", "d"].map((id, n) => ({ id, text: id, createdAt: n, updatedAt: n }));

describe("sanitizeSuggestions", () => {
  it("drops unknown ids, singletons and non-arrays", () => {
    expect(sanitizeSuggestions("x", ideas)).toEqual([]);
    expect(sanitizeSuggestions([{ ids: ["a", "zzz"], title: "t", reason: "r" }], ideas)).toEqual([]);
  });
  it("never lets one article appear in two groups", () => {
    const out = sanitizeSuggestions([
      { ids: ["a", "b"], title: "one", reason: "" },
      { ids: ["b", "c"], title: "two", reason: "" }, // b already used → only c left → dropped
    ], ideas);
    expect(out.map((s) => s.ids)).toEqual([["a", "b"]]);
  });
  it("dedupes ids inside a group and defaults the title", () => {
    const [s] = sanitizeSuggestions([{ ids: ["a", "a", "b"], title: "  ", reason: " r " }], ideas);
    expect(s).toEqual({ ids: ["a", "b"], title: "مقال مدمج", reason: "r" });
  });
});

describe("liveSuggestions / dismissal", () => {
  const list = [{ ids: ["a", "b"], title: "t", reason: "" }, { ids: ["c", "gone"], title: "t", reason: "" }];
  it("hides groups whose articles were deleted", () => {
    expect(liveSuggestions(list, ideas).map((s) => s.ids)).toEqual([["a", "b"]]);
  });
  it("dismissal is order-insensitive and persists", () => {
    dismissSuggestion(["b", "a"]);
    expect(liveSuggestions(list, ideas)).toEqual([]);
  });
});

describe("fingerprint", () => {
  it("is order-independent and changes when an article is edited", () => {
    expect(fingerprint(ideas)).toBe(fingerprint([...ideas].reverse()));
    expect(fingerprint(ideas)).not.toBe(fingerprint(ideas.map((i) => (i.id === "a" ? { ...i, updatedAt: 99 } : i))));
  });
});

describe("mergeArticles (server engine)", () => {
  afterEach(() => vi.unstubAllGlobals());
  const A = "الدولة والمجتمع والمنظومة والخلل الهيكلي في الأداء العام";
  const B = "المقاومة والأمة والعالم والاستعمار الحديث في غزة";
  const sources = [{ title: "1", body: A }, { title: "2", body: B }];
  const stub = (payload: unknown) => vi.stubGlobal("fetch", vi.fn(async () => ({ ok: true, json: async () => payload })));
  const run = () => mergeArticles(sources, new AbortController().signal, () => {});

  it("accepts a merge that keeps both sources", async () => {
    stub({ title: "مدمج", body: `${A}. ${B}` });
    expect((await run()).title).toBe("مدمج");
  });
  it("REGRESSION: rejects a merge that silently dropped a source", async () => {
    stub({ title: "مدمج", body: A });
    await expect(run()).rejects.toThrow(INCOMPLETE);
  });
});
