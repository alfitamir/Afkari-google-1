import { afterEach, describe, expect, it, vi } from "vitest";
import { INCOMPLETE, improveFull, isComplete, isMergeComplete, parseImprovedArticle, readArticleStream, splitChunks } from "./article-ai";

const BODY = "هذا مقال طويل يتحدث عن الدولة والمجتمع والمنظومة والخلل الهيكلي في الأداء العام للمؤسسات. وفي الخاتمة نسأل السؤال الثقيل عن المستقبل";

describe("parseImprovedArticle", () => {
  it("takes the first line as title and strips markdown", () => {
    expect(parseImprovedArticle("## **عنوان**\n\nنص المقال")).toEqual({ title: "عنوان", body: "نص المقال" });
  });
  it("accepts a title directly followed by the body", () => {
    expect(parseImprovedArticle("عنوان\nنص")).toEqual({ title: "عنوان", body: "نص" });
  });
  it("throws when the body is missing so the original is never replaced", () => {
    expect(() => parseImprovedArticle("عنوان فقط")).toThrow();
    expect(() => parseImprovedArticle("")).toThrow();
  });
});

describe("isComplete", () => {
  it("accepts a faithful rewrite", () => {
    expect(isComplete(BODY, BODY.replace("الثقيل", "الكبير"))).toBe(true);
  });
  it("rejects output that is too short", () => {
    expect(isComplete(BODY, "هذا مقال قصير")).toBe(false);
  });
  it("rejects output that lost the ending even if long enough", () => {
    const truncated = BODY.split(" ").slice(0, -7).join(" ") + " كلمات اخرى مختلفة تماما حشو حشو حشو";
    expect(isComplete(BODY, truncated)).toBe(false);
  });
  it("tolerates Arabic definite-article and conjunction prefixes on the ending", () => {
    expect(isComplete("نص عن السؤال والمستقبل البعيد جدا هنا", "نص عن سؤال ومستقبل بعيد جدا هنا")).toBe(true);
  });
});

describe("isMergeComplete", () => {
  const a = "الدولة والمجتمع والمنظومة والخلل الهيكلي في الأداء العام";
  const b = "المقاومة والأمة والعالم والاستعمار الحديث في غزة";
  it("passes when both sources survive", () => {
    expect(isMergeComplete([a, b], `${a}. ${b}`)).toBe(true);
  });
  it("fails when one source is dropped", () => {
    expect(isMergeComplete([a, b], a)).toBe(false);
  });
});

describe("splitChunks", () => {
  it("keeps short bodies whole", () => {
    expect(splitChunks("a b\n\nc d")).toEqual(["a b\n\nc d"]);
  });
  it("splits on paragraph boundaries and loses nothing", () => {
    const body = Array.from({ length: 6 }, (_, i) => `${"كلمة ".repeat(40).trim()} ${i}`).join("\n\n");
    const chunks = splitChunks(body, 100);
    expect(chunks.length).toBeGreaterThan(1);
    expect(chunks.join("\n\n")).toBe(body);
  });
});

const streamOf = (lines: string[]) =>
  new Response(new ReadableStream({ start(c) { lines.forEach((l) => c.enqueue(new TextEncoder().encode(l))); c.close(); } }));

describe("readArticleStream", () => {
  it("accumulates text events and requires a done event", async () => {
    const seen: string[] = [];
    const out = await readArticleStream(
      streamOf(['{"type":"text","text":"أ"}\n{"type":"te', 'xt","text":"ب"}\n{"type":"done"}\n']), (t) => seen.push(t));
    expect(out).toBe("أب");
    expect(seen.at(-1)).toBe("أب");
  });
  it("reports a dropped connection instead of returning partial text", async () => {
    await expect(readArticleStream(streamOf(['{"type":"text","text":"أ"}\n']), () => {})).rejects.toThrow("انقطع");
  });
  it("surfaces server error events", async () => {
    await expect(readArticleStream(streamOf(['{"type":"error","message":"boom"}\n']), () => {})).rejects.toThrow("boom");
  });
});

describe("improveFull (server engine)", () => {
  afterEach(() => vi.unstubAllGlobals());
  const stubFetch = (payload: unknown, ok = true) =>
    vi.stubGlobal("fetch", vi.fn(async () => ({ ok, json: async () => payload })));
  const run = () => improveFull({ title: "ع", body: BODY }, BODY, [], { kind: "server" }, new AbortController().signal, () => {});

  it("returns a complete rewrite", async () => {
    stubFetch({ title: "عنوان جديد", body: BODY });
    expect(await run()).toEqual({ title: "عنوان جديد", body: BODY });
  });
  it("REGRESSION: rejects a truncated server rewrite instead of overwriting the article", async () => {
    stubFetch({ title: "ع", body: "هذا مقال قصير" });
    await expect(run()).rejects.toThrow(INCOMPLETE);
  });
  it("keeps the old title when the server returns none", async () => {
    stubFetch({ title: "", body: BODY });
    expect((await run()).title).toBe("ع");
  });
  it("propagates the server's error message", async () => {
    stubFetch({ error: "حد الاستخدام" }, false);
    await expect(run()).rejects.toThrow("حد الاستخدام");
  });
});
