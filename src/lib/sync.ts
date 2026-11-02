import { syncWithGoogleDrive } from "./google-drive-sync";
import { getGoogleAccessToken } from "./google-auth";

/**
 * Cloud sync is Google Drive only (afkari-backup.json in the user's own Drive).
 * These helpers keep the call sites simple: they are silent when the user is
 * signed out or offline, and bursts of edits are coalesced into one upload.
 */

const DEBOUNCE_MS = 2000;
let timer: ReturnType<typeof setTimeout> | undefined;

const canSync = async () => (await getGoogleAccessToken()) !== null && navigator.onLine;

/** Schedule a (debounced) sync after a local change. */
const schedule = () => {
  if (timer) clearTimeout(timer);
  timer = setTimeout(() => { timer = undefined; void syncNow().catch(() => {}); }, DEBOUNCE_MS);
};

/** A local idea changed: reconcile with Drive soon (silently skipped when signed out or offline). */
export const pushIdea = async (_idea?: unknown) => {
  if (await canSync()) schedule();
};

/** A local idea was deleted (its tombstone is propagated by the next sync). */
export const deleteIdeaCloud = async (_id?: string) => {
  if (await canSync()) schedule();
};

/** Two-way sync now. Returns the number of ideas restored from Drive. */
export const syncNow = async (): Promise<number> => {
  if (!(await canSync())) return 0;
  const res = await syncWithGoogleDrive();
  return res.success ? res.restoredCount : 0;
};
