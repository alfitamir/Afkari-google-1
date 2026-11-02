/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import express, { type Request, type Response } from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import { GoogleGenAI, ThinkingLevel, Type } from '@google/genai';
import { createHash } from 'crypto';
import dotenv from 'dotenv';
import { parseImprovedArticle } from './src/lib/article-ai';
import {
  ASK_INSTRUCTIONS, ASK_SCHEMA, MERGE_SUGGEST_INSTRUCTIONS, MERGE_SUGGEST_SCHEMA, CLASSIFY_INSTRUCTIONS, CLASSIFY_SCHEMA, INSIGHTS_INSTRUCTIONS, INSIGHTS_SCHEMA,
  TRANSCRIBE_INSTRUCTIONS, EVIDENCE_INSTRUCTIONS, EVIDENCE_SCHEMA, sanitizeAsk, sanitizeEvidence, sanitizeInsights, sanitizeLabels,
} from './src/lib/ai-prompts';
import { classify } from './src/lib/topics';
import { createCache, createRateLimiter, GeminiError, modelChain, runWithFallback } from './src/lib/ai-runner';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = 3000;

app.use(express.json({ limit: '10mb' }));

const MAX_BODY_CHARS = 200_000;
// Fast-first model chain with automatic fallback. GEMINI_MODEL / GEMINI_MODELS (comma-separated) go first.
const MODELS = modelChain(process.env);
const MAX_AUDIO_BASE64 = 9_000_000; // ~6.5MB of audio, under the 10mb JSON limit

// ---- Reliable, fast Gemini access -------------------------------------------
// - model fallback + retry with backoff + timeout (src/lib/ai-runner.ts)
// - low "thinking" level for latency (retried without it if a model rejects the setting)
// - structured (JSON-schema) results are cached and identical in-flight requests are shared
type GenParams = { contents: any; config?: Record<string, any> };
const resultCache = createCache<string>(300, 60 * 60 * 1000);
const inflight = new Map<string, Promise<string>>();

async function callModel(model: string, params: GenParams, signal: AbortSignal): Promise<string> {
  const base = { model, contents: params.contents };
  const config = { ...params.config, abortSignal: signal };
  try {
    const r = await ai.models.generateContent({ ...base, config: { ...config, thinkingConfig: { thinkingLevel: ThinkingLevel.LOW } } });
    return r.text || '';
  } catch (error: any) {
    if (!/thinking/i.test(String(error?.message))) throw error;
    return (await ai.models.generateContent({ ...base, config })).text || '';
  }
}

async function gen(params: GenParams): Promise<{ text: string }> {
  const structured = params.config?.responseMimeType === 'application/json';
  const key = structured ? createHash('sha256').update(JSON.stringify(params)).digest('hex') : '';
  if (key) {
    const hit = resultCache.get(key);
    if (hit !== undefined) return { text: hit };
    const pending = inflight.get(key);
    if (pending) return { text: await pending };
  }
  const run = runWithFallback((model, signal) => callModel(model, params, signal), {
    models: MODELS,
    timeoutMs: params.contents?.[0]?.parts?.some?.((p: any) => p.inlineData) ? 120_000 : 70_000,
    onAttempt: ({ model, attempt, failure }) => { if (failure) console.warn(`[gemini] ${model} attempt ${attempt + 1} failed: ${failure}`); },
  }).then((r) => r.text);
  if (key) {
    inflight.set(key, run);
    run.then((t) => resultCache.set(key, t)).catch(() => {}).finally(() => inflight.delete(key));
  }
  return { text: await run };
}

// Per-IP limit so one client cannot burn the shared Gemini quota.
const allow = createRateLimiter(40, 60_000);
app.use('/api/gemini', (req: Request, res: Response, next) => {
  if (!allow(req.ip || 'anon')) return res.status(429).json({ error: 'طلبات كثيرة في وقت قصير. انتظر لحظة ثم حاول مجددًا.' });
  next();
});

// Fail fast with a message the user can act on instead of an opaque credentials error from the SDK.
app.use('/api/gemini', (req: Request, res: Response, next) => {
  if (!process.env.GEMINI_API_KEY) {
    return res.status(503).json({ error: 'خادم التطبيق غير مهيأ بمفتاح Gemini. أضف مفتاحك الشخصي من الإعدادات ⚙️ لتفعيل الذكاء الاصطناعي.' });
  }
  next();
});
app.get('/api/health', (_req, res) => res.json({ ok: true, gemini: Boolean(process.env.GEMINI_API_KEY) }));

// Server-side Google Gemini client
const ai = new GoogleGenAI({
  apiKey: process.env.GEMINI_API_KEY,
  httpOptions: {
    headers: {
      'User-Agent': 'aistudio-build',
    },
  },
});

// 1. Author writing style system instructions
const STYLE_INSTRUCTIONS = `أنت محرر فكري وأدبي أمين لصوت الكاتب وأسلوبه الخاص. مهمتك ضبط المقال وتعديله وصقله ليعبر تماماً عن هوية الكاتب وأسلوبه وفق القواعد التالية:

1. الهوية والنبرة:
- اكتب بصوت كاتب صاحب موقف، يفكّر بصوت مسموع، ويشرح خلفيات المشكلة بدل الاكتفاء بالتعليق السطحي عليها.
- الصوت فصيح، تحليلي، ومباشر، تتخلله تعبيرات مصرية حية وصور شعبية ذكية عند الحاجة لإضفاء الحرارة أو السخرية الهادفة أو تقريب المعنى، دون إفراط ودون تحويل النص إلى عامية كاملة أو بيان أكاديمي جاف.
- كن حازماً وصارماً تجاه الأفكار والسلوك والمنظومات، دون تجريح أو إهانة شخصية للأفراد، ودون ادعاء معرفة النوايا أو الحكم على المصائر.
- لا تستخدم أبداً لغة دعائية، ولا كليشيهات تسويقية، ولا أسئلة تفاعلية مصطنعة مثل «ما رأيكم؟» أو «شاركوني رأيكم».

2. البناء المفضل للمقال:
- ابدأ بعنوان مباشر يحدد القضية بدقة.
- استهل النص بجملة تقريرية واضحة تحمل الموقف والأطروحة المركزية.
- اشرح الأسباب والعوامل المتراكمة، وانقل النقاش من الواقعة الفردية أو الشخص إلى المنظومة والخلل الهيكلي.
- اربط الواقعة الخاصة بالسؤال العام المتعلق بالدولة أو المجتمع أو الثقافة أو المشروع الحضاري.
- افحص المسؤوليات واسأل: من المسؤول؟ وما الأسئلة التي يتجنب الخطاب العام مناقشتها؟
- استخدم أدوات الكاتب الأسلوبية:
  * المقابلات والثنائيات الواضحة (الأفكار والأفعال، الفرد والمنظومة، الدولة والإعلام، مصر والأمة).
  * التعداد المتتابع لإظهار تراكم الخلل (مثل: «لا تدريب محترم، ولا رواتب محترمة، ولا إمكانيات عمل محترمة...»).
  * صيغ التمحيص والتعميق: «المشكلة ليست في... وحده، بل في...»، و«لا أحد يسأل السؤال الأهم...».
  * الأسئلة الكاشفة التي تحفز التفكير لا لطلب تفاعل شكلي.
- اختم بخلاصة فكرية وازنة أو سؤال ثقيل أو أفق مستقبلي؛ لا تختم بمواعظ إنشائية ولا طلب تفاعل.

3. الأمانة والدقة:
- دقق الإملاء والنحو والترقيم واللغة.
- لا تبتدع وقائع أو تواريخ أو تجارب أو آراء لم يقلها الكاتب. حافظ على كل فكرة طرحها دون حذف أو اختصار مخل.
- أخرج عنوان المقال في السطر الأول، يليه سطر فارغ، ثم نص المقال فقط مباشرة، بدون مقدمات أو شرح أو رموز Markdown إضافية.`;

// 2. Merge instructions
const MERGE_INSTRUCTIONS = `أنت محرر فكري أمين لصوت كاتب واحد. ستصلك مجموعة من الأفكار أو المقالات المسجلة للكاتب في موضوع متصل. مهمتك دمجها في مقال تحليلي متكامل، متماسك، وبناء، يحمل البصمة الأسلوبية والهوية الفكرية للكاتب:

1. البناء المتكامل للمقال المدمج:
- عنوان مباشر وشامل يحدد جوهر القضية.
- استهلال بجملة تقريرية حاسمة تلخص الأطروحة والموقف المركزي المشترك.
- شرح الأسباب والعوامل المتراكمة، ونقل المشكلة من الواقعة أو الحادثة المفردة إلى المنظومة والأسباب الجذرية.
- إبراز المقابلات والثنائيات الفكرية (مثل: الأفكار والأفعال، الفرد والمنظومة، الخاص والعام).
- تسلسل منطقي وانتقالات سلسة بين الفقرات، مع حذف التكرار الحرفي الصريح فقط دون المساس بأي فكرة أو رأي ذكره الكاتب.
- خاتمة تحليلية تنتهي بخلاصة فكرية، أو سؤال ثقيل يفتح الأفق للمستقبل، بعيداً عن المواعظ السطحية أو الأسئلة التفاعلية المصطنعة.

2. الصوت واللغة:
- فصحى تحليلية حية ومباشرة، بلهجة كاتب صاحب موقف يفكر بصوت مسموع.
- تطعيم النص بتعبيرات مصرية حية أو صور واقعية ذكية في مواضعها المناسبة للحرارة والسخرية الهادفة أو تقريب المعنى، بلا ابتذال ولا تحويل إلى عامية مطلقة.
- الصرامة والحدة الفكرية تجاه المنظومة والأداء مع العدل الكامل والابتعاد عن الشتائم أو التعميم غير المنضبط.
- الحفاظ التام على أفكار الكاتب وعدم اختلاق معلومات أو تجارب خارجية.

أخرج عنوان المقال المدمج في السطر الأول، ثم سطراً فارغاً، ثم نص المقال المدمج مباشرة، بدون مقدمات أو اعتذارات أو شرح.`;

// API Routes

// 1. Polish and Adjust Article to Writer Style
app.post('/api/gemini/polish', async (req: Request, res: Response) => {
  try {
    const { title, body, original, samples } = req.body;
    if (!body || typeof body !== 'string') {
      return res.status(400).json({ error: 'نص المقال مطلوب' });
    }
    if (body.length > MAX_BODY_CHARS) {
      return res.status(413).json({ error: 'المقال أطول من الحد المسموح' });
    }

    const prompt = `المقال الحالي المراد تحسينه وضبطه:\nالعنوان: ${title || 'بدون عنوان'}\n\nالنص:\n${body}\n\nالنص الأصلي المسجل:\n${original || body}\n\nعينات من أسلوب الكاتب للاسترشاد بنبرته ومفرداته:\n${(samples || []).join('\n---\n')}`;

    const response = await gen({
      contents: prompt,
      config: {
        systemInstruction: STYLE_INSTRUCTIONS,
      },
    });

    const { title: newTitle, body: newBody } = parseImprovedArticle(response.text || '');
    return res.json({ title: newTitle || title, body: newBody });
  } catch (error: any) {
    console.error('Error polishing article:', error);
    return res.status(500).json({ error: error?.message || 'تعذّر ضبط المقال عبر Gemini' });
  }
});

// 2. Suggest Merge Opportunities Across Articles
app.post('/api/gemini/suggest-merges', async (req: Request, res: Response) => {
  try {
    const { articles } = req.body ?? {};
    if (!Array.isArray(articles) || articles.length < 2) return res.json({ suggestions: [] });
    // The browser sends `excerpt` (opening + ending of each article); accept legacy `body`/`text` too.
    const payload = articles.slice(0, 80).map((a: any) => ({
      id: clip(a?.id, 80), title: clip(a?.title, 200), excerpt: clip(a?.excerpt ?? a?.body ?? a?.text, 800),
    }));
    const response = await gen({
      contents: JSON.stringify(payload),
      config: { systemInstruction: MERGE_SUGGEST_INSTRUCTIONS, responseMimeType: 'application/json', responseSchema: MERGE_SUGGEST_SCHEMA as any },
    });
    const parsed = JSON.parse(response.text || '[]');
    return res.json({ suggestions: Array.isArray(parsed) ? parsed : [] });
  } catch (error: any) {
    // Suggestions are optional background help: never surface an error banner for them.
    console.error('Error suggesting merges:', error?.cause ?? error);
    return res.json({ suggestions: [] });
  }
});

// 3. Merge Articles into One Cohesive Piece
app.post('/api/gemini/merge', async (req: Request, res: Response) => {
  try {
    const { articles } = req.body;
    if (!Array.isArray(articles) || articles.length < 2) {
      return res.status(400).json({ error: 'يلزم مقالان على الأقل للدمج' });
    }

    const prompt = `ادمج المقالات التالية في مقال تحليلي واحد متماسك بأسلوب الكاتب:\n\n${articles
      .map((a: any, idx: number) => `--- المقال ${idx + 1}: ${a.title} ---\n${a.body || a.text}`)
      .join('\n\n')}`;

    const response = await gen({
      contents: prompt,
      config: {
        systemInstruction: MERGE_INSTRUCTIONS,
      },
    });

    return res.json(parseImprovedArticle(response.text || ''));
  } catch (error: any) {
    console.error('Error merging articles:', error);
    return res.status(500).json({ error: error?.message || 'تعذّر دمج المقالات عبر Gemini' });
  }
});

// 4. Suggest Additions, Quotes, and Key Questions for Article Enrichment
app.post('/api/gemini/suggest-additions', async (req: Request, res: Response) => {
  try {
    const { title, body } = req.body;
    if (!body || typeof body !== 'string') {
      return res.status(400).json({ error: 'نص المقال مطلوب' });
    }

    const prompt = `بناءً على المقال التالي للكاتب، اقترح إضافات فكرية واقتباسات ملهمة لتعميق المقال:\nالعنوان: ${title}\n\nالنص:\n${body}`;

    const response = await gen({
      contents: prompt,
      config: {
        systemInstruction: `أنت مستشار فكري وتحريري خبير بأسلوب الكاتب وقضاياه (الدولة والمجتمع، المنظومة، المقاومة، الفكر الإسلامي الحضاري، كتابات المسيري ومالك بن نبي وابن خلدون وسيد قطب ومحمود شاكر).
مهمتك دراسة المقال وتقديم مقترحات ذكية تطوره وتزيده وزناً وعمقاً بأسلوبه:
1. إضافات فكرية مقترحة (أفكار محورية أو زوايا تحليلية تعمق المقال وتخدم أطروحته الهيكلية).
2. اقتباسات وأقوال مقترحة (اقتباسات دقيقة من مفكرين أو نصوص تراثية/معاصرة تخدم الفكرة).
3. أسئلة كاشفة مقترحة (أسئلة عميقة تحفز التفكير وتكشف المسكوت عنه في الخطاب العام).
أعد المخرجات في صيغة JSON مطابقة تماماً للمخطط.`,
        responseMimeType: 'application/json',
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            additions: {
              type: Type.ARRAY,
              items: { type: Type.STRING },
              description: 'زوايا فكرية وأفكار مقترحة لتعميق التحليل',
            },
            quotes: {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                properties: {
                  quote: { type: Type.STRING, description: 'نص الاقتباس' },
                  author: { type: Type.STRING, description: 'صاحب القول أو المرجع' },
                  context: { type: Type.STRING, description: 'كيف يخدم فكرة المقال' },
                },
                required: ['quote', 'author', 'context'],
              },
              description: 'اقتباسات مناسبة لأطروحة المقال',
            },
            questions: {
              type: Type.ARRAY,
              items: { type: Type.STRING },
              description: 'أسئلة كاشفة تعزز خاتمة أو محور المقال',
            },
          },
          required: ['additions', 'quotes', 'questions'],
        },
      },
    });

    const parsed = JSON.parse(response.text || '{}');
    return res.json(parsed);
  } catch (error: any) {
    console.error('Error suggesting additions:', error);
    return res.status(500).json({ error: error?.message || 'تعذّر توليد الاقتراحات عبر Gemini' });
  }
});

// ---- AI features ----------------------------------------------------------

const clip = (v: unknown, n: number) => String(v ?? '').slice(0, n);
const STATUS = { auth: 503, quota: 429, busy: 503, timeout: 504, model: 502, other: 500 } as const;
const fail = (res: Response, label: string, error: any) => {
  console.error(`Error in ${label}:`, error?.cause ?? error);
  if (error instanceof GeminiError) return res.status(STATUS[error.kind]).json({ error: error.message });
  return res.status(500).json({ error: error?.message || `تعذّر تنفيذ العملية عبر Gemini (${label})` });
};

// 5. Transcribe a voice recording (more reliable than the browser's speech recognition)
app.post('/api/gemini/transcribe', async (req: Request, res: Response) => {
  try {
    const { mimeType, data } = req.body ?? {};
    if (typeof data !== 'string' || !data || typeof mimeType !== 'string' || !/^audio\//.test(mimeType)) {
      return res.status(400).json({ error: 'تسجيل صوتي صالح مطلوب' });
    }
    if (data.length > MAX_AUDIO_BASE64) {
      return res.status(413).json({ error: 'التسجيل أطول من الحد المسموح، قسّمه إلى تسجيلين.' });
    }
    const response = await gen({
      contents: [{ role: 'user', parts: [{ inlineData: { mimeType: mimeType.split(';')[0], data } }, { text: 'فرّغ هذا التسجيل.' }] }],
      config: { systemInstruction: TRANSCRIBE_INSTRUCTIONS },
    });
    return res.json({ text: (response.text || '').trim() });
  } catch (error) { return fail(res, 'transcribe', error); }
});

// 6. Answer a question from the author's own articles
app.post('/api/gemini/ask', async (req: Request, res: Response) => {
  try {
    const { question, articles } = req.body ?? {};
    if (typeof question !== 'string' || !question.trim()) return res.status(400).json({ error: 'السؤال مطلوب' });
    if (!Array.isArray(articles) || !articles.length) return res.status(400).json({ error: 'لا مقالات للبحث فيها' });
    const list = articles.slice(0, 20).map((a: any) => ({ id: clip(a?.id, 80), title: clip(a?.title, 200), excerpt: clip(a?.excerpt, 2000) }));
    const response = await gen({
      contents: `السؤال: ${clip(question, 1000)}\n\nالمقالات:\n${JSON.stringify(list)}`,
      config: { systemInstruction: ASK_INSTRUCTIONS, responseMimeType: 'application/json', responseSchema: ASK_SCHEMA as any },
    });
    return res.json(sanitizeAsk(JSON.parse(response.text || '{}'), new Set(list.map((a) => a.id))));
  } catch (error) { return fail(res, 'ask', error); }
});

// 7. Topic + tags for a batch of articles
app.post('/api/gemini/classify', async (req: Request, res: Response) => {
  try {
    const { articles } = req.body ?? {};
    if (!Array.isArray(articles) || !articles.length) return res.json({ labels: {} });
    const list = articles.slice(0, 40).map((a: any) => ({ id: clip(a?.id, 80), title: clip(a?.title, 200), excerpt: clip(a?.excerpt, 500), text: clip(a?.excerpt, 500) }));
    const response = await gen({
      contents: JSON.stringify(list.map(({ id, title, excerpt }) => ({ id, title, excerpt }))),
      config: { systemInstruction: CLASSIFY_INSTRUCTIONS, responseMimeType: 'application/json', responseSchema: CLASSIFY_SCHEMA as any },
    });
    const byId = new Map(list.map((a) => [a.id, a]));
    const labels = sanitizeLabels(JSON.parse(response.text || '[]'), list.map((a) => a.id), (id) => classify(`${byId.get(id)?.title} ${byId.get(id)?.text}`));
    return res.json({ labels });
  } catch (error) { return fail(res, 'classify', error); }
});

// 8. Themes across the whole library + suggested articles to write next
app.post('/api/gemini/insights', async (req: Request, res: Response) => {
  try {
    const { articles } = req.body ?? {};
    if (!Array.isArray(articles) || articles.length < 3) return res.status(400).json({ error: 'تلزم ثلاثة مقالات على الأقل لاستخراج الرؤى' });
    const list = articles.slice(0, 120).map((a: any) => ({ id: clip(a?.id, 80), title: clip(a?.title, 200), excerpt: clip(a?.excerpt, 500) }));
    const response = await gen({
      contents: JSON.stringify(list),
      config: { systemInstruction: INSIGHTS_INSTRUCTIONS, responseMimeType: 'application/json', responseSchema: INSIGHTS_SCHEMA as any },
    });
    return res.json(sanitizeInsights(JSON.parse(response.text || '{}'), list.map((a) => a.id)));
  } catch (error) { return fail(res, 'insights', error); }
});

// 9. Evidence candidates (Quran / Sunnah / other writings). The CLIENT verifies the text against authoritative sources.
app.post('/api/gemini/evidence', async (req: Request, res: Response) => {
  try {
    const { title, body } = req.body ?? {};
    if (typeof body !== 'string' || body.trim().length < 40) return res.status(400).json({ error: 'نص المقال قصير جدًا لاقتراح شواهد له' });
    const response = await gen({
      contents: `عنوان المقال: ${clip(title, 200)}\n\nنص المقال:\n${clip(body, 12000)}`,
      config: { systemInstruction: EVIDENCE_INSTRUCTIONS, responseMimeType: 'application/json', responseSchema: EVIDENCE_SCHEMA as any },
    });
    return res.json({ candidates: sanitizeEvidence(JSON.parse(response.text || '[]')) });
  } catch (error) { return fail(res, 'evidence', error); }
});

// Vite middleware mounting for development
async function startServer() {
  if (process.env.NODE_ENV !== 'production') {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    app.use(express.static(path.join(__dirname, 'dist')));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(__dirname, 'dist', 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server running on http://0.0.0.0:${PORT}`);
  });
}

startServer();
