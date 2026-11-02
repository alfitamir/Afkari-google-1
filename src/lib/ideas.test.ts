import { describe, expect, it } from "vitest";
import {
  classify, deleteIdea, getArticle, loadDeleted, loadIdeas, matchesArticle, mergeIdeas, needsPolish, OTHER,
  saveArticleIdea, saveIdea, toArticle, updateArticle, type Idea,
} from "./ideas";
import { INITIAL_IDEAS } from "./seed-data";

const idea = (id: string, over: Partial<Idea> = {}): Idea => ({ id, text: `text ${id}`, createdAt: 1, ...over });

describe("classify", () => {
  it("routes text to the topic with most keyword hits", () => {
    expect(classify("غزة وفلسطين والمقاومة")).toBe("الأمة والعالم");
    expect(classify("الصلاة والقرآن والدعاء")).toBe("الإيمان والروح");
  });
  it("ignores diacritics and hamza variants", () => {
    expect(classify("إِسْرَائِيل وَأَمْرِيكَا")).toBe("الأمة والعالم");
  });
  it("falls back to OTHER when nothing matches", () => {
    expect(classify("zzz qqq")).toBe(OTHER);
  });
});

describe("toArticle", () => {
  it("strips filler sounds and builds a short title", () => {
    const { title, paragraphs } = toArticle("اممم هذه فكرة مهمة جدا عن الحياة والعمل. ثم نكمل الكلام");
    expect(title.split(" ").length).toBeLessThanOrEqual(6);
    expect(paragraphs.join(" ")).not.toContain("اممم");
  });
  it("ends every paragraph with terminal punctuation", () => {
    const { paragraphs } = toArticle("جملة اولى بلا نقطة، وجملة ثانية");
    expect(paragraphs.every((p) => /[.!؟?]$/.test(p))).toBe(true);
  });
  it("never returns an empty title", () => {
    expect(toArticle("   ").title).toBe("فكرة");
  });
});

describe("mergeIdeas", () => {
  it("keeps the newer edition of the same idea", () => {
    const out = mergeIdeas([idea("a", { updatedAt: 1, articleTitle: "old" })], [idea("a", { updatedAt: 5, articleTitle: "new" })], []);
    expect(out[0].articleTitle).toBe("new");
  });
  it("does not overwrite newer local work with an older remote", () => {
    const out = mergeIdeas([idea("a", { updatedAt: 9, articleTitle: "local" })], [idea("a", { updatedAt: 2, articleTitle: "remote" })], []);
    expect(out[0].articleTitle).toBe("local");
  });
  it("lets deletions win on both sides", () => {
    const out = mergeIdeas([idea("a"), idea("b")], [idea("a"), idea("c")], ["a", "c"]);
    expect(out.map((i) => i.id)).toEqual(["b"]);
  });
  it("adopts a remote aiPolishedAt flag when local has none", () => {
    const out = mergeIdeas([idea("a", { updatedAt: 3 })], [idea("a", { updatedAt: 3, aiPolishedAt: 3 })], []);
    expect(out[0].aiPolishedAt).toBe(3);
  });
  it("sorts newest first", () => {
    const out = mergeIdeas([idea("old", { createdAt: 1 }), idea("new", { createdAt: 9 })], [], []);
    expect(out.map((i) => i.id)).toEqual(["new", "old"]);
  });
});

describe("storage lifecycle", () => {
  it("seeds bundled ideas on first load", () => {
    expect(INITIAL_IDEAS.length).toBeGreaterThan(0);
    expect(loadIdeas().length).toBe(INITIAL_IDEAS.length);
  });
  it("saveIdea puts new ideas first and persists them", () => {
    const saved = saveIdea("فكرة جديدة");
    expect(loadIdeas()[0].id).toBe(saved.id);
  });
  it("deleteIdea records a tombstone so offline deletions sync later", () => {
    const saved = saveIdea("x");
    deleteIdea(saved.id);
    expect(loadIdeas().some((i) => i.id === saved.id)).toBe(false);
    expect(loadDeleted()).toContain(saved.id);
  });
  it("a seeded idea deleted by the user stays deleted after a reseed", () => {
    const victim = loadIdeas()[0];
    deleteIdea(victim.id);
    localStorage.removeItem("afkari.seed.version");
    expect(loadIdeas().some((i) => i.id === victim.id)).toBe(false);
  });
  it("updateArticle rejects blank input and bumps updatedAt monotonically", () => {
    const saved = saveIdea("نص");
    expect(updateArticle(saved.id, " ", "body")).toBeUndefined();
    const a = updateArticle(saved.id, "t", "b")!;
    const b = updateArticle(saved.id, "t2", "b2")!;
    expect(b.updatedAt!).toBeGreaterThan(a.updatedAt!);
  });
  it("polished flag is set only when requested and makes needsPolish false", () => {
    const saved = saveIdea("نص");
    expect(needsPolish(updateArticle(saved.id, "t", "b")!)).toBe(true);
    expect(needsPolish(updateArticle(saved.id, "t", "b2", true)!)).toBe(false);
  });
  it("saveArticleIdea stores a ready, already-polished article", () => {
    const a = saveArticleIdea("orig", " عنوان ", " نص ");
    expect(getArticle(a)).toEqual({ title: "عنوان", body: "نص" });
    expect(needsPolish(a)).toBe(false);
  });
});

describe("matchesArticle", () => {
  it("matches title/body/text ignoring diacritics, and empty query matches all", () => {
    const i = idea("a", { text: "كَلِمَةٌ", articleTitle: "عنوان", articleBody: "متن" });
    expect(matchesArticle(i, "كلمة")).toBe(true);
    expect(matchesArticle(i, "متن")).toBe(true);
    expect(matchesArticle(i, "")).toBe(true);
    expect(matchesArticle(i, "غائب")).toBe(false);
  });
});
