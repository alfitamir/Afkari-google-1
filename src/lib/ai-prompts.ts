/**
 * Single source of truth for the AI features' instructions, schemas and output sanitizers.
 * Pure (no DOM, no storage) so the Express server and the browser's personal-key path behave identically.
 */
import { OTHER, TOPICS } from "./topics";

export const TOPIC_LIST = [...Object.keys(TOPICS), OTHER];

// ---------- transcription ----------
export const TRANSCRIBE_INSTRUCTIONS = `أنت مفرِّغ صوتي دقيق للغة العربية (فصحى ولهجة مصرية). فرّغ التسجيل كما قاله المتحدث تمامًا:
- لا تلخّص ولا تعيد الصياغة ولا تضف أي فكرة أو معلومة لم تُقل.
- احذف أصوات التردد فقط (امم، آآ، ااا) وأعد تكرار الكلمة العالق، وحافظ على التعبيرات المصرية كما نُطقت.
- ضع علامات الترقيم الصحيحة وقسّم النص إلى فقرات عند تغيّر الفكرة.
- أخرج النص المفرَّغ وحده بلا مقدمات أو شرح. إن لم تسمع كلامًا واضحًا فأخرج نصًا فارغًا.`;

// ---------- ask my ideas ----------
export type AskArticle = { id: string; title: string; excerpt: string };
export type AskAnswer = { answer: string; sources: { id: string; note: string }[] };

export const ASK_INSTRUCTIONS = `أنت مساعد بحثي أمين داخل مكتبة مقالات كاتب واحد. ستصلك قائمة مقالات (معرّف، عنوان، مقتطف) وسؤال من الكاتب.
- أجب بالعربية الفصحى الواضحة اعتمادًا على المقالات المرفقة وحدها؛ لا تُدخل معلومة من خارجها ولا تنسب للكاتب رأيًا لم يكتبه.
- إن لم تجد في المقالات ما يجيب السؤال فقل ذلك صراحة بجملة واحدة، واترك المصادر فارغة.
- لخّص الموقف الفكري للكاتب في المسألة، وبيّن إن كانت مقالاته تتفق أو تتعارض، وأشر إلى المقال بعنوانه.
- في sources أعد معرّفات المقالات التي اعتمدت عليها فعلًا فقط، مع note قصيرة (جملة) تبيّن ما أخذته من كل مقال.`;

export const ASK_SCHEMA = {
  type: "OBJECT",
  properties: {
    answer: { type: "STRING" },
    sources: { type: "ARRAY", items: { type: "OBJECT", properties: { id: { type: "STRING" }, note: { type: "STRING" } }, required: ["id", "note"] } },
  },
  required: ["answer", "sources"],
};

export function sanitizeAsk(raw: unknown, known: Set<string>): AskAnswer {
  const r = (raw ?? {}) as { answer?: unknown; sources?: unknown };
  const seen = new Set<string>();
  const sources = (Array.isArray(r.sources) ? r.sources : []).flatMap((s: any) => {
    if (!s || typeof s.id !== "string" || !known.has(s.id) || seen.has(s.id)) return [];
    seen.add(s.id);
    return [{ id: s.id, note: String(s.note ?? "").trim() }];
  });
  const answer = typeof r.answer === "string" ? r.answer.trim() : "";
  if (!answer) throw new Error("لم يصل جواب من Gemini. حاول مرة أخرى.");
  return { answer, sources };
}

// ---------- topics & tags ----------
export type ClassifyItem = { id: string; title: string; excerpt: string };
export type Label = { topic: string; tags: string[] };

export const CLASSIFY_INSTRUCTIONS = `أنت مصنِّف مقالات لكاتب عربي. لكل مقال (معرّف، عنوان، مقتطف) اختر:
- topic: موضوعًا واحدًا بالضبط من هذه القائمة المغلقة، ولا تخترع غيرها: ${TOPIC_LIST.join(" | ")}. استخدم «${OTHER}» فقط إن لم يناسب أي موضوع آخر.
- tags: من 2 إلى 4 وسوم عربية قصيرة (كلمة أو كلمتان) تصف القضية الفعلية للمقال لا الموضوع العام، بلا رموز ولا علامة #.
أعد عنصرًا لكل معرّف وصلك، ولا تضف معرّفات جديدة.`;

export const CLASSIFY_SCHEMA = {
  type: "ARRAY",
  items: {
    type: "OBJECT",
    properties: { id: { type: "STRING" }, topic: { type: "STRING" }, tags: { type: "ARRAY", items: { type: "STRING" } } },
    required: ["id", "topic", "tags"],
  },
};

/** Unknown ids are dropped; an unknown topic falls back to `fallback(id)` so a bad label never hides an article. */
export function sanitizeLabels(raw: unknown, ids: string[], fallback: (id: string) => string): Record<string, Label> {
  const known = new Set(ids);
  const out: Record<string, Label> = {};
  for (const item of Array.isArray(raw) ? raw : []) {
    if (!item || typeof item.id !== "string" || !known.has(item.id) || out[item.id]) continue;
    const topic = TOPIC_LIST.includes(item.topic) ? item.topic : fallback(item.id);
    const tags = [...new Set((Array.isArray(item.tags) ? item.tags : [])
      .map((t: unknown) => String(t ?? "").replace(/^#+/, "").trim())
      .filter((t: string) => t.length > 0 && t.length <= 30))].slice(0, 4) as string[];
    out[item.id] = { topic, tags };
  }
  return out;
}

// ---------- insights ----------
export type InsightItem = { id: string; title: string; excerpt: string };
export type Insights = {
  themes: { name: string; summary: string; ids: string[] }[];
  prompts: { title: string; angle: string }[];
};

export const INSIGHTS_INSTRUCTIONS = `أنت محرر فكري يقرأ مجمل كتابات كاتب واحد (معرّف، عنوان، مقتطف) ويقدّم له رؤية بانورامية:
1. themes: من 3 إلى 6 محاور تتكرر عبر مقالاته فعلًا (لا محاور عامة). لكل محور: name قصير، وsummary من جملتين تصف موقف الكاتب فيه كما ظهر في مقالاته، وids للمقالات التي تنتمي إليه (مقالان على الأقل).
2. prompts: من 4 إلى 6 مقالات مقترحة لم يكتبها بعد، تنبع من فجوات أو توترات أو أسئلة مفتوحة في كتاباته الحالية. لكل منها title بصيغة عنوان مباشر بأسلوبه، وangle من جملة أو جملتين تحدد الأطروحة والزاوية.
التزم بما ورد في المقالات؛ لا تنسب للكاتب وقائع أو آراء لم ترد.`;

export const INSIGHTS_SCHEMA = {
  type: "OBJECT",
  properties: {
    themes: { type: "ARRAY", items: { type: "OBJECT", properties: { name: { type: "STRING" }, summary: { type: "STRING" }, ids: { type: "ARRAY", items: { type: "STRING" } } }, required: ["name", "summary", "ids"] } },
    prompts: { type: "ARRAY", items: { type: "OBJECT", properties: { title: { type: "STRING" }, angle: { type: "STRING" } }, required: ["title", "angle"] } },
  },
  required: ["themes", "prompts"],
};

export function sanitizeInsights(raw: unknown, ids: string[]): Insights {
  const known = new Set(ids);
  const r = (raw ?? {}) as { themes?: unknown; prompts?: unknown };
  const themes = (Array.isArray(r.themes) ? r.themes : []).flatMap((t: any) => {
    const tid = [...new Set((Array.isArray(t?.ids) ? t.ids : []).filter((id: unknown): id is string => typeof id === "string" && known.has(id)))] as string[];
    const name = String(t?.name ?? "").trim();
    return name && tid.length >= 2 ? [{ name, summary: String(t?.summary ?? "").trim(), ids: tid }] : [];
  });
  const prompts = (Array.isArray(r.prompts) ? r.prompts : []).flatMap((p: any) => {
    const title = String(p?.title ?? "").trim();
    return title ? [{ title, angle: String(p?.angle ?? "").trim() }] : [];
  });
  if (!themes.length && !prompts.length) throw new Error("لم تتوفر رؤى كافية بعد. أضف مقالات أكثر وحاول مجددًا.");
  return { themes, prompts };
}
