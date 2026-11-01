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
