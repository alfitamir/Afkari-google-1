import { loadIdeas, loadDeleted, mergeIdeas, replaceIdeas, type Idea } from "./ideas";

const APP = "afkari";
const VERSION = 1;

/** Serialize ideas to the portable JSON backup format. */
export function buildBackup(ideas: Idea[]): string {
  return JSON.stringify({ app: APP, version: VERSION, exportedAt: Date.now(), ideas }, null, 2);
}

const isIdea = (v: unknown): v is Idea => {
  const i = v as Idea;
  return !!i && typeof i.id === "string" && typeof i.text === "string" && Number.isFinite(Number(i.createdAt));
};

/** Parse and validate a backup file; throws an Arabic message the UI can show. */
export function parseBackup(raw: string): Idea[] {
  let data: unknown;
  try { data = JSON.parse(raw); } catch { throw new Error("الملف ليس نسخة احتياطية صالحة."); }
  const obj = data as { app?: string; ideas?: unknown };
  const list = Array.isArray(data) ? data : obj?.ideas;
  if (!Array.isArray(list) || (!Array.isArray(data) && obj.app !== APP)) {
    throw new Error("هذا الملف ليس نسخة احتياطية من «أفكاري».");
  }
  const ideas = list.filter(isIdea).map((i) => ({ ...i, createdAt: Number(i.createdAt) }));
  if (list.length && !ideas.length) throw new Error("لم نجد أفكارًا صالحة في هذا الملف.");
  return ideas;
}

/** Merge a backup into local storage without overwriting newer work. Returns how many ideas were newly added. */
export function restoreBackup(ideas: Idea[]): number {
  const before = loadIdeas();
  const known = new Set(before.map((i) => i.id));
  const merged = mergeIdeas(before, ideas, loadDeleted());
  replaceIdeas(merged);
  window.dispatchEvent(new Event("afkari:ideas-changed"));
  return merged.filter((i) => !known.has(i.id)).length;
}
