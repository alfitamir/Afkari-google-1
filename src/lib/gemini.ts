// Browser-only Gemini client using the user's personal key, stored only on this device.
// No platform credits are used on this path.

const KEY = "afkari.geminiKey";
/**
 * Fast models first. "gemini-flash-latest" points at a heavy thinking model that can take
 * 30s+ even for one word, so it is not used. Each entry falls back to the next on
 * missing model, unsupported setting, rate limit (each model has its own free quota),
 * overload, or a stalled stream.
 */
export const GEMINI_MODELS = [
  { name: "gemini-3.6-flash", thinkingLevel: "low" },
  { name: "gemini-3-flash-preview", thinkingLevel: "low" },
  { name: "gemini-flash-lite-latest", thinkingLevel: "minimal" },
] as const;
/** Max wait for the first chunk / between chunks before trying the next model. */
const FIRST_CHUNK_MS = 25000, IDLE_MS = 30000;

export const getGeminiKey = (): string => {
  try { return localStorage.getItem(KEY)?.trim() ?? ""; } catch { return ""; }
};
export const setGeminiKey = (key: string) => {
  const k = key.replace(/\s+/g, "").replace(/^["']|["']$/g, "");
  if (k) localStorage.setItem(KEY, k); else localStorage.removeItem(KEY);
  window.dispatchEvent(new Event("afkari:settings-changed"));
};

export const IMPROVE_INSTRUCTIONS = `أنت محرر فكري وأدبي أمين لصوت الكاتب وأسلوبه الخاص. مهمتك ضبط المقال وتعديله وصقله ليعبر تماماً عن هوية الكاتب وأسلوبه وفق القواعد التالية:

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

export const MERGE_INSTRUCTIONS = `أنت محرر فكري أمين لصوت كاتب واحد. ستصلك مجموعة من الأفكار أو المقالات المسجلة للكاتب في موضوع متصل. مهمتك دمجها في مقال تحليلي متكامل، متماسك، وبناء، يحمل البصمة الأسلوبية والهوية الفكرية للكاتب:

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

export const SUGGEST_INSTRUCTIONS = `أنت مساعد فكري ذكي يرتب ويفحص مقالات كاتب واحد. اقرأ قائمة المقالات (معرف، عنوان، مقتطف) واقترح مجموعات من مقالين أو أكثر تتناول نفس القضية الفكرية أو الاجتماعية أو السياسية أو الموضوع المتصل، بحيث يكون دمجها في مقال تحليلي مركب - يربط الأسباب بالنتائج والخاص بالعام ويناقش الخلل الهيكلي - خطوة طبيعية ومثرية لمشروع الكاتب الفكري.

قواعد الاقتراح:
- لا تقترح دمج مقالات متباعدة في الموضوع أو لا رابط فكرياً حقيقياً يجمعها.
- كل مقال يظهر في مجموعة واحدة على الأكثر.
- لكل مجموعة أعد:
  * ids: مصفوفة المعرفات الأصلية للمقالات (كما هي).
  * title: عنوان مقترح مباشر يحدد القضية الموحدة للمقال المدمج.
  * reason: سبب مقنع وموجز يوضح كيف يكمل المقالان بعضهما تحليلياً ومنظومياً.
إن لم توجد مقالات متقاربة كفاية، أعد مصفوفة فارغة.`;

const sleep = (ms: number, signal: AbortSignal) => new Promise<void>((resolve, reject) => {
  const t = setTimeout(resolve, ms);
  signal.addEventListener("abort", () => { clearTimeout(t); reject(new DOMException("Aborted", "AbortError")); }, { once: true });
});

export function geminiErrorMessage(status: number, message = ""): string {
  if (status === 400 && /key/i.test(message)) return "مفتاح Gemini غير صحيح. راجعه من الإعدادات ⚙️.";
  if (status === 401 || status === 403) return "مفتاح Gemini غير صالح أو غير مفعّل. راجعه من الإعدادات ⚙️.";
  if (status === 429) return "تجاوزت الحد المجاني المؤقت لـ Gemini. حاول بعد دقيقة.";
  if (status === 500 || status === 503) return "Gemini مشغول الآن. حاول بعد قليل؛ مقالك محفوظ كما هو.";
  return "تعذّر الاتصال بـ Gemini الآن. مقالك محفوظ كما هو.";
}

class Fallback extends Error {}

/** Stream a Gemini response; returns the full text. Throws an Arabic message on failure or truncation. */
export type GeminiPart = { text: string } | { inlineData: { mimeType: string; data: string } };

export async function geminiStream(
  key: string, system: string, user: string | GeminiPart[], signal: AbortSignal,
  onText: (text: string) => void = () => {}, json?: object,
): Promise<string> {
  let last: Error = new Error(geminiErrorMessage(0));
  for (const [m, model] of GEMINI_MODELS.entries()) {
    const isLast = m === GEMINI_MODELS.length - 1;
    for (let attempt = 0; attempt < 2; attempt++) {
      if (signal.aborted) throw new DOMException("Aborted", "AbortError");
      try {
        return await streamOnce(key, model, system, user, signal, onText, json, isLast);
      } catch (error) {
        if (signal.aborted || !(error instanceof Fallback)) throw error;
        last = new Error(error.message);
        onText("");
        if (error.cause === "busy" && attempt === 0) { await sleep(2000, signal); continue; }
        break;
      }
    }
  }
  throw last;
}

async function streamOnce(
  key: string, model: (typeof GEMINI_MODELS)[number], system: string, user: string | GeminiPart[], outer: AbortSignal,
  onText: (text: string) => void, json: object | undefined, isLast: boolean,
): Promise<string> {
  const controller = new AbortController();
  const stopOuter = () => controller.abort();
  outer.addEventListener("abort", stopOuter, { once: true });
  let stalled = false, timer: ReturnType<typeof setTimeout> | undefined;
  const watch = (ms: number) => { clearTimeout(timer); timer = setTimeout(() => { stalled = true; controller.abort(); }, ms); };
  const stallError = () => new Fallback("Gemini تأخر في الرد. حاول مرة أخرى؛ مقالك محفوظ كما هو.", { cause: "stall" });
  try {
    watch(FIRST_CHUNK_MS);
    let response: Response;
    try {
      response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model.name}:streamGenerateContent?alt=sse`, {
        method: "POST", signal: controller.signal,
        headers: { "Content-Type": "application/json", "x-goog-api-key": key },
        body: JSON.stringify({
          systemInstruction: { parts: [{ text: system }] },
          contents: [{ role: "user", parts: typeof user === "string" ? [{ text: user }] : user }],
          generationConfig: {
            maxOutputTokens: 65536,
            thinkingConfig: { thinkingLevel: model.thinkingLevel },
            ...(json ? { responseMimeType: "application/json", responseSchema: json } : {}),
          },
        }),
      });
    } catch (error) {
      if (stalled) throw stallError();
      if (outer.aborted) throw error;
      throw new Fallback("تعذّر الوصول إلى Gemini. تأكد من الإنترنت وحاول مرة أخرى.", { cause: "network" });
    }
    if (!response.ok) {
      const error = await response.json().catch(() => ({}));
      const message = geminiErrorMessage(response.status, error?.error?.message);
      if (response.status === 401 || response.status === 403 || (response.status === 400 && /api key/i.test(error?.error?.message ?? ""))) throw new Error(message);
      if (response.status === 429 && isLast) throw new Error(message);
      throw new Fallback(message, { cause: response.status >= 500 ? "busy" : "model" });
    }
    if (!response.body) throw new Fallback(geminiErrorMessage(0), { cause: "model" });
    watch(FIRST_CHUNK_MS);
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "", output = "", finish = "";
    const processLine = (line: string) => {
      if (!line.startsWith("data:")) return;
      const event = JSON.parse(line.slice(5));
      if (event.promptFeedback?.blockReason) throw new Error("لم يُتح Gemini معالجة هذا النص. لم يتغير مقالك.");
      const candidate = event.candidates?.[0];
      for (const part of candidate?.content?.parts ?? []) {
        if (part.thought || typeof part.text !== "string" || !part.text) continue;
        output += part.text; onText(output);
      }
      if (candidate?.finishReason) finish = candidate.finishReason;
    };
    try {
      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        watch(IDLE_MS);
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";
        lines.forEach(processLine);
      }
      buffer += decoder.decode();
      processLine(buffer.trim());
    } catch (error) {
      if (stalled) throw stallError();
      throw error;
    } finally {
      reader.releaseLock();
    }
    if (finish === "MAX_TOKENS") throw new Error("النسخة المقترحة ناقصة، لم نغير مقالك.");
    if (!finish) throw new Fallback("انقطع الاتصال قبل اكتمال الرد. مقالك محفوظ كما هو.", { cause: "stall" });
    if (finish !== "STOP" || !output.trim()) throw new Error("لم يُتح Gemini معالجة هذا النص. لم يتغير مقالك.");
    return output;
  } finally {
    clearTimeout(timer);
    outer.removeEventListener("abort", stopOuter);
  }
}

/** Quick check that a key works. Returns null on success or an Arabic error message. */
export async function testGeminiKey(key: string): Promise<string | null> {
  try {
    await geminiStream(key, "أجب بكلمة واحدة.", "قل: تم", AbortSignal.timeout(100000));
    return null;
  } catch (error) {
    return error instanceof Error ? error.message : geminiErrorMessage(0);
  }
}
