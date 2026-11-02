# أفكاري (Afkari)

Arabic-first app for capturing ideas by voice or text and turning them into organized, editable articles.
Gemini polishes articles in the author's voice and suggests merging related ones.

## Run

```bash
bun install
cp .env.example .env      # set GEMINI_API_KEY
bun run dev               # http://localhost:3000 (Express + Vite)
```

| Script | Purpose |
| --- | --- |
| `bun run dev` / `start` | Express server with Vite middleware (`server.ts`) |
| `bun run lint` | Type-check (`tsc --noEmit`) |
| `bun run test` | Unit tests (Vitest + jsdom) |
| `bun run build` | Production build to `dist/` |

## AI features

All run on the server's `GEMINI_API_KEY`, or directly from the browser on the user's own key saved in Settings.
Set `GEMINI_MODEL` to override the default model.

| Feature | Where | Endpoint |
| --- | --- | --- |
| Voice capture: records audio, Gemini transcribes (falls back to browser speech recognition when offline) | `/` | `POST /api/gemini/transcribe` |
| Polish an article in the author's voice, with a completeness guard | `/library` | `/api/gemini/polish` |
| Merge related articles | `/library` | `/api/gemini/{suggest-merges,merge}` |
| **Ask my ideas**: answers only from the author's own articles, with sources | `/library` | `/api/gemini/ask` |
| **AI topics and tags** (closed topic list; stored beside ideas, invalidated on edit) | `/library` | `/api/gemini/classify` |
| **Evidence**: Quran, Sunnah and other writings that support an article's claims, with the text fetched and checked against the source | `/library` (book icon), merge preview | `POST /api/gemini/evidence` |
| **Insights**: recurring themes + suggested articles to write next | `/library` | `/api/gemini/insights` |

### Evidence is verified, not recalled

Language models invent verses and hadith. So the model only proposes **references** (surah:ayah, collection + number, with the opening words of the text).
The app then fetches the real text from [alquran.cloud](https://alquran.cloud) and the [hadith-api](https://github.com/fawazahmed0/hadith-api) CDN and
checks it matches those opening words (`src/lib/evidence.ts`):

- text shown is always the **source's**, never the model's wording;
- a reference whose text does not match, or does not exist, is dropped (and the count shown);
- openings made only of stock phrases ("قال رسول الله صلى الله عليه وسلم") cannot verify anything and are rejected;
- if the source is unreachable the reference is kept but shown **without text** and marked unverified;
- other writings (books) are shown as paraphrased ideas labelled "راجع الكتاب قبل الاستشهاد", never as quotes.

## Server reliability

`src/lib/ai-runner.ts` wraps every Gemini call: model fallback chain (`GEMINI_MODEL` / `GEMINI_MODELS` first, then
`gemini-3.6-flash → gemini-3-flash-preview → gemini-flash-lite-latest`), retry with backoff, per-call timeout, Arabic error messages,
a 1-hour cache for structured results with shared in-flight requests, and a 40 requests/minute/IP limit.

Prompts, schemas and output sanitizers live in `src/lib/ai-prompts.ts` and are shared by server and browser.
Model output is never trusted: unknown ids, invented topics and empty answers are filtered before reaching the UI.

## Layout

- `server.ts` — Gemini endpoints: `/api/gemini/{polish,merge,suggest-merges,suggest-additions}`, `/api/health`
- `src/routes` — `/` record an idea, `/library` browse/edit/merge articles, `/auth` Google sign-in
- `src/lib/ideas.ts` — local-first storage, topic classifier, conflict-free `mergeIdeas` (deletions win, newer edit wins)
- `src/lib/article-ai.ts`, `merge.ts` — AI client logic; **every AI rewrite must pass `isComplete` / `isMergeComplete`** so a truncated answer can never overwrite an article
- `src/lib/backup.ts` — JSON export/import; `google-drive-sync.ts` — optional Drive backup
- `src/lib/voice-recorder.ts` — continuous speech recognition that survives browser silence timeouts

## Data & privacy

Ideas live in `localStorage` first. Optional sync targets: Google Drive (`afkari-backup.json`) and Supabase.
Set `VITE_SUPABASE_URL` / `VITE_SUPABASE_PUBLISHABLE_KEY` to enable Supabase; without them the app runs fully offline.
