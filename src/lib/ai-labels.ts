import type { Label } from "./ai-prompts";
import { classifyBatch, type AIOptions } from "./ai-features";
import { classify, type Idea } from "./ideas";

/** AI labels live beside the ideas (not inside them) so sync and backups stay untouched. */
type Stored = Label & { v: number };
const KEY = "afkari.aiLabels";
const BATCH = 30;

const load = (): Record<string, Stored> => {
  try { return JSON.parse(localStorage.getItem(KEY) || "{}") ?? {}; } catch { return {}; }
};
const version = (idea: Idea) => idea.updatedAt ?? 0;

/** The AI label if it is still valid for this edition of the article, otherwise the offline keyword fallback. */
export function labelFor(idea: Idea, all: Record<string, Stored> = load()): Label & { ai: boolean } {
  const s = all[idea.id];
  if (s && s.v === version(idea)) return { topic: s.topic, tags: s.tags, ai: true };
  return { topic: classify(idea.text), tags: [], ai: false };
}

export const unlabeled = (ideas: Idea[]) => {
  const all = load();
  return ideas.filter((i) => !all[i.id] || all[i.id].v !== version(i));
};

export const loadLabels = load;

/** Label every stale/unlabeled idea in batches; progress callback reports done/total. Partial progress is kept on failure. */
export async function labelAll(
  ideas: Idea[], o: AIOptions & { onProgress?: (done: number, total: number) => void } = {},
): Promise<number> {
  const todo = unlabeled(ideas);
  let done = 0;
  for (let i = 0; i < todo.length; i += BATCH) {
    const chunk = todo.slice(i, i + BATCH);
    const labels = await classifyBatch(chunk, o);
    const all = load();
    for (const idea of chunk) if (labels[idea.id]) all[idea.id] = { ...labels[idea.id], v: version(idea) };
    localStorage.setItem(KEY, JSON.stringify(all));
    done += chunk.length;
    o.onProgress?.(Math.min(done, todo.length), todo.length);
  }
  window.dispatchEvent(new Event("afkari:labels-changed"));
  return todo.length;
}
