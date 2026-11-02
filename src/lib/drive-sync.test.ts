// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from "vitest";

const auth = vi.hoisted(() => ({ token: "tok" as string | null, expire: vi.fn() }));
vi.mock("./google-auth", () => ({
  getGoogleAccessToken: async () => auth.token,
  expireGoogleAccessToken: () => { auth.expire(); auth.token = null; },
}));

import { syncWithGoogleDrive } from "./google-drive-sync";
import { deleteIdeaCloud, pushIdea, syncNow } from "./sync";
import { loadIdeas, saveIdea } from "./ideas";

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

beforeEach(() => {
  localStorage.clear();
  auth.token = "tok";
  auth.expire.mockReset();
  vi.restoreAllMocks();
  vi.useRealTimers();
});

describe("Google Drive sync", () => {
  it("creates exactly one backup file when two syncs overlap", async () => {
    saveIdea("فكرة أولى");
    let creates = 0;
    vi.stubGlobal("fetch", vi.fn(async (url: string, init?: RequestInit) => {
      if (init?.method === "POST") { creates++; await new Promise((r) => setTimeout(r, 20)); return json({ id: "f1" }); }
      if (init?.method === "PATCH") return json({});
      if (url.includes("alt=media")) return json([]);
      if (url.includes("/f1?")) return json({ id: "f1", trashed: false });
      if (url.includes("?spaces=drive")) return json({ files: creates ? [{ id: "f1" }] : [] });
      return json({});
    }));
    const [a, b] = await Promise.all([syncWithGoogleDrive(), syncWithGoogleDrive()]);
    expect(a.success && b.success).toBe(true);
    expect(creates).toBe(1);
  });

  it("restores ideas that exist only in Drive", async () => {
    localStorage.setItem("afkari.drive.fileId", "f1");
    const remote = [{ id: "r1", text: "من درايف", createdAt: 1, updatedAt: 1 }];
    vi.stubGlobal("fetch", vi.fn(async (url: string, init?: RequestInit) => {
      if (init?.method === "PATCH") return json({});
      if (url.includes("alt=media")) return json(remote);
      return json({ id: "f1", trashed: false });
    }));
    const res = await syncWithGoogleDrive();
    expect(res.restoredCount).toBe(1);
    expect(loadIdeas().some((i) => i.id === "r1")).toBe(true);
  });

  it("asks the user to sign in again when Google rejects the token", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => json({ error: { message: "Invalid Credentials" } }, 401)));
    const res = await syncWithGoogleDrive();
    expect(res.success).toBe(false);
    expect(res.message).toContain("سجّل الدخول مرة أخرى");
    expect(auth.expire).toHaveBeenCalled();
  });

  it("does nothing, silently, when signed out", async () => {
    auth.token = null;
    const f = vi.fn();
    vi.stubGlobal("fetch", f);
    expect(await syncNow()).toBe(0);
    await pushIdea();
    await deleteIdeaCloud("x");
    expect(f).not.toHaveBeenCalled();
  });

  it("coalesces a burst of edits into one sync", async () => {
    vi.useFakeTimers();
    const f = vi.fn(async (url: string, init?: RequestInit) => {
      if (init?.method === "POST") return json({ id: "f1" });
      if (url.includes("?spaces=drive")) return json({ files: [] });
      return json({});
    });
    vi.stubGlobal("fetch", f);
    await pushIdea(); await pushIdea(); await deleteIdeaCloud("z");
    await vi.advanceTimersByTimeAsync(2500);
    expect(f.mock.calls.filter(([, i]) => (i as RequestInit | undefined)?.method === "POST")).toHaveLength(1);
  });
});
