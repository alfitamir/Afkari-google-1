import {
  ASK_INSTRUCTIONS, ASK_SCHEMA, CLASSIFY_INSTRUCTIONS, CLASSIFY_SCHEMA, EVIDENCE_INSTRUCTIONS, EVIDENCE_SCHEMA, INSIGHTS_INSTRUCTIONS, INSIGHTS_SCHEMA,
  TRANSCRIBE_INSTRUCTIONS, sanitizeAsk, sanitizeInsights, sanitizeLabels,
  type AskAnswer, type AskArticle, type ClassifyItem, type InsightItem, type Insights, type Label,
} from "./ai-prompts";
import { verifyAll, type EvidenceResult } from "./evidence";
import { getGeminiKey, geminiStream } from "./gemini";
import { classify, getArticle, strip, type Idea } from "./ideas";

/** Every feature runs on the user's own Gemini key when saved in Settings, otherwise on the app server. */
export type AIOptions = { key?: string; signal?: AbortSignal };
const keyOf = (o: AIOptions) => (o.key ?? getGeminiKey()) || undefined;
const signalOf = (o: AIOptions) => o.signal ?? new AbortController().signal;

async function server<T>(path: string, body: unknown, signal: AbortSignal): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`/api/gemini/${path}`, { method: "POST", signal, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  } catch (error) {
    if (signal.aborted) throw error;
    throw new Error("تعذّر الوصول إلى الخادم. تأكد من الإنترنت وحاول مرة أخرى.");
  }
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || "تعذّر تنفيذ الطلب عبر الذكاء الاصطناعي.");
  }
  return res.json();
}

const parseJSON = (text: string) => {
  try { return JSON.parse(text); } catch { throw new Error("جاء رد Gemini غير مكتمل. حاول مرة أخرى."); }
};

// ---------- transcription ----------
export const blobToBase64 = (blob: Blob) =>
  new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("تعذّرت قراءة التسجيل."));
    reader.onload = () => resolve(String(reader.result).split(",")[1] ?? "");
    reader.readAsDataURL(blob);
  });

export async function transcribeAudio(blob: Blob, o: AIOptions = {}): Promise<string> {
  const data = await blobToBase64(blob);
  const mimeType = (blob.type || "audio/webm").split(";")[0];
  const key = keyOf(o);
  if (key) {
    const text = await geminiStream(key, TRANSCRIBE_INSTRUCTIONS, [{ inlineData: { mimeType, data } }, { text: "فرّغ هذا التسجيل." }], signalOf(o));
    return text.trim();
  }
  const { text } = await server<{ text: string }>("transcribe", { mimeType, data }, signalOf(o));
  return String(text ?? "").trim();
}

// ---------- ask my ideas ----------
const norm = (s: string) => strip(s).toLocaleLowerCase().replace(/ة/g, "ه").replace(/ى/g, "ي");

const tokens = (q: string) =>
  [...new Set(norm(q).split(/[^\p{L}\p{N}]+/u).map((w) => w.replace(/^(ال|و|ف|ب|ل)/, "")).filter((w) => w.length > 2))];

/** Most relevant paragraphs of an article for the question, capped so the request stays small. */
export function excerptFor(body: string, toks: string[], max: number): string {
  const paras = body.split(/\n\s*\n/).filter(Boolean);
  const scored = paras.map((p, i) => ({ p, i, s: toks.filter((t) => norm(p).includes(t)).length }));
  const picked: typeof scored = [];
  let used = 0;
  for (const c of [...scored].sort((a, b) => b.s - a.s || a.i - b.i)) {
    if (picked.length && used + c.p.length > max) continue;
    picked.push(c); used += c.p.length;
    if (used >= max) break;
  }
  return picked.sort((a, b) => a.i - b.i).map((c) => c.p).join("\n\n").slice(0, max);
}

/** Keyword retrieval over the local library: title hits weigh most. Falls back to the newest articles. */
export function retrieveRelevant(question: string, ideas: Idea[], k = 8, maxChars = 1800): AskArticle[] {
  const toks = tokens(question);
  const scored = ideas.map((idea) => {
    const a = getArticle(idea);
    const title = norm(a.title), body = norm(a.body);
    const s = toks.reduce((n, t) => n + (title.includes(t) ? 3 : 0) + Math.min(5, body.split(t).length - 1), 0);
    return { idea, a, s };
  });
  const ranked = scored.filter((x) => x.s > 0).sort((x, y) => y.s - x.s);
  const top = (ranked.length ? ranked : scored.sort((x, y) => y.idea.createdAt - x.idea.createdAt)).slice(0, k);
  return top.map(({ idea, a }) => ({ id: idea.id, title: a.title, excerpt: excerptFor(a.body, toks, maxChars) }));
}

export async function askIdeas(question: string, ideas: Idea[], o: AIOptions = {}): Promise<AskAnswer & { used: AskArticle[] }> {
  const used = retrieveRelevant(question, ideas);
  if (!used.length) throw new Error("لا توجد مقالات للبحث فيها بعد.");
  const known = new Set(used.map((a) => a.id));
  const key = keyOf(o);
  const raw = key
    ? parseJSON(await geminiStream(key, ASK_INSTRUCTIONS, `السؤال: ${question}\n\nالمقالات:\n${JSON.stringify(used)}`, signalOf(o), () => {}, ASK_SCHEMA))
    : await server<unknown>("ask", { question, articles: used }, signalOf(o));
  return { ...sanitizeAsk(raw, known), used };
}

// ---------- topics & tags ----------
export async function classifyBatch(ideas: Idea[], o: AIOptions = {}): Promise<Record<string, Label>> {
  if (!ideas.length) return {};
  const items: ClassifyItem[] = ideas.map((idea) => {
    const a = getArticle(idea);
    return { id: idea.id, title: a.title, excerpt: a.body.slice(0, 500) };
  });
  const fallback = (id: string) => classify(ideas.find((i) => i.id === id)?.text ?? "");
  const key = keyOf(o);
  if (key) {
    const raw = parseJSON(await geminiStream(key, CLASSIFY_INSTRUCTIONS, JSON.stringify(items), signalOf(o), () => {}, CLASSIFY_SCHEMA));
    return sanitizeLabels(raw, items.map((i) => i.id), fallback);
  }
  const { labels } = await server<{ labels: Record<string, Label> }>("classify", { articles: items }, signalOf(o));
  return labels ?? {};
}

// ---------- insights ----------
export async function getInsights(ideas: Idea[], o: AIOptions = {}): Promise<Insights> {
  if (ideas.length < 3) throw new Error("تلزم ثلاثة مقالات على الأقل لاستخراج الرؤى.");
  const items: InsightItem[] = ideas.slice(0, 120).map((idea) => {
    const a = getArticle(idea);
    return { id: idea.id, title: a.title, excerpt: a.body.slice(0, 500) };
  });
  const key = keyOf(o);
  const raw = key
    ? parseJSON(await geminiStream(key, INSIGHTS_INSTRUCTIONS, JSON.stringify(items), signalOf(o), () => {}, INSIGHTS_SCHEMA))
    : await server<unknown>("insights", { articles: items }, signalOf(o));
  return sanitizeInsights(raw, items.map((i) => i.id));
}

// ---------- evidence from Quran, Sunnah and other writings ----------
/** The model proposes references; every Quran/hadith text shown is fetched from a source and checked against them. */
export async function getEvidence(article: { title: string; body: string }, o: AIOptions = {}): Promise<EvidenceResult> {
  if (article.body.trim().length < 40) throw new Error("المقال قصير جدًا لاقتراح شواهد له.");
  const key = keyOf(o);
  const raw = key
    ? parseJSON(await geminiStream(key, EVIDENCE_INSTRUCTIONS, `عنوان المقال: ${article.title}\n\nنص المقال:\n${article.body.slice(0, 12000)}`, signalOf(o), () => {}, EVIDENCE_SCHEMA))
    : (await server<{ candidates: unknown }>("evidence", article, signalOf(o))).candidates;
  const result = await verifyAll(raw, o.signal);
  if (!result.items.length) {
    throw new Error(result.dropped
      ? "لم نجد شاهدًا يتطابق مع نصوص المصادر الموثوقة، فأسقطنا الاقتراحات احتياطًا. جرّب مقالًا أطول أو أعد المحاولة."
      : "لم يقترح الذكاء الاصطناعي شواهد مناسبة لهذا المقال.");
  }
  return result;
}
