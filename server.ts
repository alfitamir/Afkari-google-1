/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import express, { type Request, type Response } from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import { GoogleGenAI, Type } from '@google/genai';
import dotenv from 'dotenv';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = 3000;

app.use(express.json({ limit: '10mb' }));

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

    const prompt = `المقال الحالي المراد تحسينه وضبطه:\nالعنوان: ${title || 'بدون عنوان'}\n\nالنص:\n${body}\n\nالنص الأصلي المسجل:\n${original || body}\n\nعينات من أسلوب الكاتب للاسترشاد بنبرته ومفرداته:\n${(samples || []).join('\n---\n')}`;

    const response = await ai.models.generateContent({
      model: 'gemini-3.8-flash',
      contents: prompt,
      config: {
        systemInstruction: STYLE_INSTRUCTIONS,
      },
    });

    const text = response.text || '';
    const parts = text.split(/\n\s*\n/);
    const newTitle = (parts[0] || '').replace(/^[#*\s]+/, '').trim();
    const newBody = parts.slice(1).join('\n\n').trim() || text;

    return res.json({
      title: newTitle || title,
      body: newBody || text,
    });
  } catch (error: any) {
    console.error('Error polishing article:', error);
    return res.status(500).json({ error: error?.message || 'تعذّر ضبط المقال عبر Gemini' });
  }
});

// 2. Suggest Merge Opportunities Across Articles
app.post('/api/gemini/suggest-merges', async (req: Request, res: Response) => {
  try {
    const { articles } = req.body;
    if (!Array.isArray(articles) || articles.length < 2) {
      return res.json({ suggestions: [] });
    }

    const payload = articles.map((a: any) => ({
      id: a.id,
      title: a.title,
      snippet: (a.body || a.text || '').slice(0, 500),
    }));

    const prompt = `اقرأ قائمة المقالات التالية واقترح مجموعات من مقالين أو أكثر تتناول نفس القضية الفكرية أو الاجتماعية أو السياسية بحيث يكون دمجها في مقال تركيبي واحداً مفيداً ومثرياً:\n\n${JSON.stringify(payload)}`;

    const response = await ai.models.generateContent({
      model: 'gemini-3.8-flash',
      contents: prompt,
      config: {
        systemInstruction: `أنت مساعد فكري يرتب مقالات كاتب واحد. اقرأ قائمة المقالات واقترح مجموعات من مقالين أو أكثر تتناول الموضوع نفسه بحيث يكون دمجها في مقال واحد مفيداً. أعد قائمة JSON تحوي مصفوفة من المجموعات. كل مجموعة تحوي: ids (مصفوفة معرفات المقالات)، title (عنوان مقترح قصير للمقال المدمج)، reason (سبب قصير جداً للدمج). إن لم توجد مقالات متقاربة أعد مصفوفة فارغة.`,
        responseMimeType: 'application/json',
        responseSchema: {
          type: Type.ARRAY,
          items: {
            type: Type.OBJECT,
            properties: {
              ids: {
                type: Type.ARRAY,
                items: { type: Type.STRING },
                description: 'معرفات المقالات المقترحة للدمج',
              },
              title: {
                type: Type.STRING,
                description: 'عنوان جامع مقترح للمقال المدمج',
              },
              reason: {
                type: Type.STRING,
                description: 'سبب موجز يوضح التكامل بين المقالات',
              },
            },
            required: ['ids', 'title', 'reason'],
          },
        },
      },
    });

    const parsed = JSON.parse(response.text || '[]');
    return res.json({ suggestions: Array.isArray(parsed) ? parsed : [] });
  } catch (error: any) {
    console.error('Error suggesting merges:', error);
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

    const response = await ai.models.generateContent({
      model: 'gemini-3.8-flash',
      contents: prompt,
      config: {
        systemInstruction: MERGE_INSTRUCTIONS,
      },
    });

    const text = response.text || '';
    const parts = text.split(/\n\s*\n/);
    const title = (parts[0] || '').replace(/^[#*\s]+/, '').trim();
    const body = parts.slice(1).join('\n\n').trim() || text;

    return res.json({ title, body });
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

    const response = await ai.models.generateContent({
      model: 'gemini-3.8-flash',
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
