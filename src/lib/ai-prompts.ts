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

// ---------- evidence: Quran, Sunnah and other writings ----------
export const HADITH_COLLECTIONS = {
  bukhari: { edition: "ara-bukhari", name: "صحيح البخاري" },
  muslim: { edition: "ara-muslim", name: "صحيح مسلم" },
  abudawud: { edition: "ara-abudawud", name: "سنن أبي داود" },
  tirmidhi: { edition: "ara-tirmidhi", name: "جامع الترمذي" },
  nasai: { edition: "ara-nasai", name: "سنن النسائي" },
  ibnmajah: { edition: "ara-ibnmajah", name: "سنن ابن ماجه" },
  malik: { edition: "ara-malik", name: "موطأ مالك" },
  nawawi: { edition: "ara-nawawi", name: "الأربعون النووية" },
  qudsi: { edition: "ara-qudsi", name: "الأحاديث القدسية" },
} as const;
export type HadithCollection = keyof typeof HADITH_COLLECTIONS;

export type EvidenceCandidate =
  | { kind: "quran"; surah: number; from: number; to: number; opening: string; claim: string; why: string }
  | { kind: "hadith"; collection: HadithCollection; number: number; opening: string; claim: string; why: string }
  | { kind: "writing"; author: string; work: string; idea: string; claim: string; why: string; confidence: "high" | "medium" };

export const EVIDENCE_INSTRUCTIONS = `أنت باحث شرعي وفكري أمين يساعد كاتبًا عربيًا على تدعيم أطروحات مقاله بالشواهد. اقرأ المقال واستخرج أهم دعاواه، ثم اقترح لها شواهد من ثلاثة أنواع. دقتك أهم من كثرة الشواهد: شاهد واحد صحيح أفضل من خمسة مشكوك فيها، وإن لم تكن متأكدًا فاترك الشاهد.

قواعد صارمة:
1. kind="quran": أعطِ رقم السورة surah ورقم الآية from وto (آية واحدة أو حتى 4 آيات متصلة). واكتب في opening أول 4 إلى 8 كلمات من الآية «حرفيًا كما وردت في المصحف». لا تذكر آية لا تحفظ موضعها يقينًا.
2. kind="hadith": ارجع إلى الكتب الستة وموطأ مالك والأربعين النووية والأحاديث القدسية فقط، وفضّل الصحيحين. collection من القائمة: ${Object.keys(HADITH_COLLECTIONS).join("، ")}. أعطِ number برقم الحديث في الكتاب، واكتب في opening أول 5 إلى 9 كلمات من متن الحديث نفسه حرفيًا بعد السند. لا تذكر حديثًا ضعيفًا أو موضوعًا أو لا تتيقن من لفظه ومخرجه.
3. kind="writing": مرجع من كتب العلماء والمفكرين المشهورة (كابن خلدون والمسيري ومالك بن نبي وابن تيمية ومحمود شاكر وسيد قطب...). أعطِ author وwork وفي idea فكرة الشاهد بصياغتك أنت في جملة أو جملتين، ولا تنقل نصًا حرفيًا ولا تختلق اقتباسًا أبدًا. اذكر فقط كتبًا تتيقن من وجودها وصلتها بالفكرة، وحدد confidence بـ high أو medium، وتجاهل ما دون ذلك.
4. لكل شاهد: claim هو الدعوى المحددة في المقال التي يدعمها (جملة قصيرة من المقال)، وwhy هو وجه الاستشهاد في جملة واحدة.
5. لا تزد على 8 شواهد في المجموع، ولا تكرر الشاهد نفسه. اترك الحقول غير المتعلقة بنوع الشاهد فارغة أو صفرًا.`;

export const EVIDENCE_SCHEMA = {
  type: "ARRAY",
  items: {
    type: "OBJECT",
    properties: {
      kind: { type: "STRING", enum: ["quran", "hadith", "writing"] },
      surah: { type: "INTEGER" }, from: { type: "INTEGER" }, to: { type: "INTEGER" },
      collection: { type: "STRING" }, number: { type: "INTEGER" }, opening: { type: "STRING" },
      author: { type: "STRING" }, work: { type: "STRING" }, idea: { type: "STRING" }, confidence: { type: "STRING" },
      claim: { type: "STRING" }, why: { type: "STRING" },
    },
    required: ["kind", "claim", "why"],
  },
};

const text = (v: unknown, max = 400) => String(v ?? "").replace(/\s+/g, " ").trim().slice(0, max);
const int = (v: unknown) => (Number.isInteger(Number(v)) ? Number(v) : NaN);

/** Structural validation only: anything that cannot even be looked up is dropped before any network call. */
export function sanitizeEvidence(raw: unknown): EvidenceCandidate[] {
  const out: EvidenceCandidate[] = [];
  const seen = new Set<string>();
  for (const r of (Array.isArray(raw) ? raw : []) as Record<string, unknown>[]) {
    if (!r || out.length >= 8) continue;
    const claim = text(r.claim), why = text(r.why);
    let c: EvidenceCandidate | null = null;
    if (r.kind === "quran") {
      const surah = int(r.surah), from = int(r.from), to = int(r.to) || from;
      const opening = text(r.opening, 120);
      if (surah >= 1 && surah <= 114 && from >= 1 && to >= from && to - from <= 4 && opening.split(" ").length >= 2) {
        c = { kind: "quran", surah, from, to, opening, claim, why };
      }
    } else if (r.kind === "hadith") {
      const collection = text(r.collection, 20).toLowerCase() as HadithCollection;
      const number = int(r.number), opening = text(r.opening, 160);
      if (collection in HADITH_COLLECTIONS && number >= 1 && opening.split(" ").length >= 3) {
        c = { kind: "hadith", collection, number, opening, claim, why };
      }
    } else if (r.kind === "writing") {
      const author = text(r.author, 80), work = text(r.work, 120), idea = text(r.idea, 500);
      const confidence = r.confidence === "high" ? "high" : r.confidence === "medium" ? "medium" : null;
      if (author && work && idea && confidence) c = { kind: "writing", author, work, idea, claim, why, confidence };
    }
    if (!c) continue;
    const key = c.kind === "quran" ? `q${c.surah}:${c.from}-${c.to}` : c.kind === "hadith" ? `h${c.collection}${c.number}` : `w${c.author}|${c.work}`;
    if (seen.has(key)) continue;
    seen.add(key); out.push(c);
  }
  return out;
}

// ---------- merge suggestions ----------
export const MERGE_SUGGEST_INSTRUCTIONS = `أنت محرر فكري يقرأ مجموعة مقالات لكاتب واحد (معرّف، عنوان، بداية المقال ونهايته) ويبحث عن مقالات يصنع دمجها مقالًا أقوى من كل منها منفردًا.

متى يستحق الدمج؟ فقط حين يجمع المقالين أو أكثر أحد هذه الروابط الحقيقية:
- يعالجون الدعوى نفسها من زوايا مختلفة (سبب ونتيجة، واقعة وقاعدة، نقد وبديل).
- أحدهم يكمل حجة الآخر أو يقدم لها شاهدًا أو مثالًا.
- يقولون الشيء نفسه تقريبًا فيُغني دمجهم عن التكرار.
لا تقترح الدمج لمجرد اشتراكهم في مجال واسع (كلاهما «سياسة» أو «دين»)، ولا تجمع مقالات تتعارض أطروحاتها دون أن تجعل ذلك التعارض محور المقال.

لكل مجموعة أعد:
- ids: معرّفات من مقالين إلى خمسة، كما وردت تمامًا، ولا يظهر مقال في أكثر من مجموعة.
- title: عنوان مباشر للمقال المدمج يحدد قضيته.
- thesis: الأطروحة التي سيدافع عنها المقال المدمج في جملة واحدة قوية، تجمع ما في المقالات ولا تضيف رأيًا لم يكتبه الكاتب.
- reason: ما الذي يكسبه المقال بالدمج (جملة واحدة).
- strength: رقم من 1 إلى 5 يقيس قوة الرابط (5 = دمج يكاد يكون مؤكدًا). لا تُرجع إلا المجموعات التي قوتها 3 فأكثر، ولا تزد على 5 مجموعات، ورتّبها من الأقوى.
إن لم توجد مقالات يستحق دمجها فأعد مصفوفة فارغة.`;

export const MERGE_SUGGEST_SCHEMA = {
  type: "ARRAY",
  items: {
    type: "OBJECT",
    properties: {
      ids: { type: "ARRAY", items: { type: "STRING" } },
      title: { type: "STRING" }, thesis: { type: "STRING" }, reason: { type: "STRING" }, strength: { type: "INTEGER" },
    },
    required: ["ids", "title", "thesis", "reason", "strength"],
  },
};
