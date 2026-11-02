export type Idea = {
  id: string;
  text: string;
  createdAt: number;
  articleTitle?: string;
  articleBody?: string;
  updatedAt?: number;
  /** Set to updatedAt when the article was last AI-proofread; skip while equal. */
  aiPolishedAt?: number;
};

import { classify, OTHER, strip, TOPICS } from "./topics";
export { classify, OTHER, strip, TOPICS };

const FILLERS = /(^|\s)(اممم+|امم|آآ+|ااا+|ممم+|يعني يعني|اه اه)(?=\s|$)/g;

export function toArticle(text: string): { title: string; paragraphs: string[] } {
  const clean = text.replace(FILLERS, " ").replace(/\s+/g, " ").trim();
  const sentences = clean.split(/(?<=[.!؟?،])\s+/).filter(Boolean);
  const paragraphs: string[] = [];
  let cur: string[] = [];
  let words = 0;
  for (const s of sentences) {
    cur.push(s);
    words += s.split(" ").length;
    if (words >= 35) { paragraphs.push(cur.join(" ")); cur = []; words = 0; }
  }
  if (cur.length) paragraphs.push(cur.join(" "));
  const fixed = paragraphs.map((p) => (/[.!؟?]$/.test(p) ? p : p.replace(/[،,]$/, "") + "."));
  const title = clean.split(" ").slice(0, 6).join(" ").replace(/[.،,!؟?]+$/, "");
  return { title: title || "فكرة", paragraphs: fixed };
}

import { INITIAL_IDEAS, SEED_VERSION_KEY, CURRENT_SEED_VERSION } from './seed-data';

const KEY = "afkari.ideas";
const DEL_KEY = "afkari.deleted";

export const loadIdeas = (): Idea[] => {
  try {
    const seeded = localStorage.getItem(SEED_VERSION_KEY);
    const raw = localStorage.getItem(KEY);

    // Merge or seed initial ideas if not done for this version
    if (seeded !== CURRENT_SEED_VERSION && INITIAL_IDEAS.length > 0) {
      let existing: Idea[] = [];
      try {
        existing = raw ? JSON.parse(raw) : [];
      } catch {}
      const merged = mergeIdeas(existing, INITIAL_IDEAS, loadDeleted());
      localStorage.setItem(KEY, JSON.stringify(merged));
      localStorage.setItem(SEED_VERSION_KEY, CURRENT_SEED_VERSION);
      return merged;
    }

    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed) && parsed.length > 0) return parsed;
    }

    if (INITIAL_IDEAS.length > 0) {
      localStorage.setItem(KEY, JSON.stringify(INITIAL_IDEAS));
      localStorage.setItem(SEED_VERSION_KEY, CURRENT_SEED_VERSION);
      return INITIAL_IDEAS;
    }

    return [];
  } catch {
    return INITIAL_IDEAS;
  }
};
export const replaceIdeas = (all: Idea[]) => localStorage.setItem(KEY, JSON.stringify(all));

export function getArticle(idea: Idea): { title: string; body: string } {
  const local = toArticle(idea.text);
  return {
    title: idea.articleTitle ?? local.title,
    body: idea.articleBody ?? local.paragraphs.join("\n\n"),
  };
}

export function matchesArticle(idea: Idea, query: string): boolean {
  const article = getArticle(idea);
  const normalized = strip(query).trim().toLocaleLowerCase();
  return !normalized || strip(`${article.title}\n${article.body}\n${idea.text}`).toLocaleLowerCase().includes(normalized);
}

export function updateArticle(id: string, title: string, body: string, polished = false): Idea | undefined {
  if (!title.trim() || !body.trim()) return;
  const all = loadIdeas();
  const current = all.find((idea) => idea.id === id);
  if (!current) return;
  const updated: Idea = {
    ...current,
    articleTitle: title.trim(),
    articleBody: body.trim(),
    updatedAt: Math.max(Date.now(), (current.updatedAt ?? 0) + 1),
  };
  if (polished && updated.updatedAt !== undefined) updated.aiPolishedAt = updated.updatedAt; else delete updated.aiPolishedAt;
  replaceIdeas(all.map((idea) => idea.id === id ? updated : idea));
  return updated;
}

/** Merge editions without overwriting newer local work; deletion always wins. */
export function mergeIdeas(local: Idea[], remote: Idea[], deleted: string[]): Idea[] {
  const tombstones = new Set(deleted);
  const merged = new Map(local.filter((i) => !tombstones.has(i.id)).map((i) => [i.id, i]));
  for (const idea of remote) {
    if (tombstones.has(idea.id)) continue;
    const existing = merged.get(idea.id);
    if (!existing || (idea.updatedAt ?? 0) > (existing.updatedAt ?? 0)) merged.set(idea.id, idea);
    else if (existing.aiPolishedAt === undefined && idea.aiPolishedAt !== undefined) merged.set(idea.id, { ...existing, aiPolishedAt: idea.aiPolishedAt });
  }
  return [...merged.values()].sort((a, b) => b.createdAt - a.createdAt);
}

// Ids deleted on this device — used to propagate offline deletions to the cloud backup.
export const loadDeleted = (): string[] => {
  try { return JSON.parse(localStorage.getItem(DEL_KEY) || "[]"); } catch { return []; }
};
export const clearDeleted = (ids: string[]) =>
  localStorage.setItem(DEL_KEY, JSON.stringify(loadDeleted().filter((d) => !ids.includes(d))));

export const saveIdea = (text: string): Idea => {
  const all = loadIdeas();
  const idea: Idea = { id: crypto.randomUUID(), text, createdAt: Date.now() };
  all.unshift(idea);
  localStorage.setItem(KEY, JSON.stringify(all));
  return idea;
};
export const deleteIdea = (id: string) => {
  localStorage.setItem(KEY, JSON.stringify(loadIdeas().filter((i) => i.id !== id)));
  const del = loadDeleted();
  if (!del.includes(id)) localStorage.setItem(DEL_KEY, JSON.stringify([...del, id]));
};

export const needsPolish = (idea: Idea) => idea.aiPolishedAt === undefined || idea.aiPolishedAt < (idea.updatedAt ?? 0);

/** Save a ready article (e.g. a merge) as a new idea; `text` keeps the combined originals. */
export const saveArticleIdea = (text: string, title: string, body: string): Idea => {
  const now = Date.now();
  const idea: Idea = { id: crypto.randomUUID(), text, createdAt: now, articleTitle: title.trim(), articleBody: body.trim(), updatedAt: now, aiPolishedAt: now };
  replaceIdeas([idea, ...loadIdeas()]);
  return idea;
};
