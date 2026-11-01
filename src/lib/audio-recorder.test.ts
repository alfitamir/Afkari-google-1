import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { canRecordAudio, createAIVoiceRecorder, pickMime } from "./audio-recorder";

const stopTrack = vi.fn();
let recorders: FakeMR[] = [];
class FakeMR {
  static isTypeSupported = (m: string) => m === "audio/webm;codecs=opus";
  state = "inactive"; mimeType = "audio/webm;codecs=opus";
  ondataavailable: any; onstop: any;
  constructor(public stream: unknown, public opts: any) { recorders.push(this); }
  start() { this.state = "recording"; }
  stop() { this.state = "inactive"; queueMicrotask(() => { this.ondataavailable?.({ data: new Blob(["audio-bytes"]) }); this.onstop?.(); }); }
}
const setupEnv = (getUserMedia: () => Promise<unknown>) => {
  vi.stubGlobal("MediaRecorder", FakeMR);
  Object.defineProperty(navigator, "mediaDevices", { configurable: true, value: { getUserMedia } });
};
const handlers = () => ({ onText: vi.fn(), onListening: vi.fn(), onMessage: vi.fn(), onBusy: vi.fn() });
const goodStream = async () => ({ getTracks: () => [{ stop: stopTrack }] });
const tick = () => new Promise((r) => setTimeout(r, 0));

beforeEach(() => { recorders = []; stopTrack.mockClear(); setupEnv(goodStream); });
afterEach(() => vi.unstubAllGlobals());

describe("environment detection", () => {
  it("picks the first supported mime type and reports capability", () => {
    expect(pickMime()).toBe("audio/webm;codecs=opus");
    expect(canRecordAudio()).toBe(true);
  });
  it("is not capable without MediaRecorder", () => {
    vi.stubGlobal("MediaRecorder", undefined);
    expect(canRecordAudio()).toBe(false);
  });
});

describe("createAIVoiceRecorder", () => {
  it("records at a low bitrate, then transcribes on stop and releases the mic", async () => {
    const h = handlers(); const transcribe = vi.fn(async () => " فكرة مفرَّغة ");
    const rec = createAIVoiceRecorder(transcribe, h);
    rec.start(); await tick();
    expect(recorders[0].opts.audioBitsPerSecond).toBe(32000);
    expect(h.onListening).toHaveBeenCalledWith(true);
    await rec.stop();
    expect(transcribe).toHaveBeenCalledTimes(1);
    expect((transcribe.mock.calls[0] as unknown as [Blob])[0].size).toBeGreaterThan(0);
    expect(h.onText).toHaveBeenCalledWith("فكرة مفرَّغة");
    expect(h.onBusy.mock.calls.map((c) => c[0])).toEqual([true, false]);
    expect(stopTrack).toHaveBeenCalled();
    expect(rec.isRecording()).toBe(false);
  });
  it("keeps the audio for retry when transcription fails, and retry succeeds", async () => {
    const h = handlers();
    const transcribe = vi.fn().mockRejectedValueOnce(new Error("الشبكة ضعيفة.")).mockResolvedValueOnce("نجح");
    const rec = createAIVoiceRecorder(transcribe, h);
    rec.start(); await tick(); await rec.stop();
    expect(rec.hasPending()).toBe(true);
    expect(h.onText).not.toHaveBeenCalled();
    expect(h.onMessage).toHaveBeenLastCalledWith(expect.stringContaining("إعادة المحاولة"));
    await rec.retry();
    expect(h.onText).toHaveBeenCalledWith("نجح");
    expect(rec.hasPending()).toBe(false);
    expect(transcribe).toHaveBeenCalledTimes(2);
  });
  it("tells the user when nothing intelligible was said", async () => {
    const h = handlers();
    const rec = createAIVoiceRecorder(async () => "  ", h);
    rec.start(); await tick(); await rec.stop();
    expect(h.onText).not.toHaveBeenCalled();
    expect(h.onMessage).toHaveBeenLastCalledWith(expect.stringContaining("لم نسمع"));
  });
  it("microphone permission denial stops cleanly with a helpful message", async () => {
    setupEnv(async () => { throw Object.assign(new Error("denied"), { name: "NotAllowedError" }); });
    const h = handlers(); const rec = createAIVoiceRecorder(vi.fn(), h);
    rec.start(); await tick();
    expect(rec.isRecording()).toBe(false);
    expect(h.onMessage).toHaveBeenLastCalledWith(expect.stringContaining("الميكروفون"));
  });
  it("stop() pressed while the permission prompt is open still ends cleanly", async () => {
    let grant!: (s: unknown) => void;
    setupEnv(() => new Promise((r) => { grant = r; }));
    const transcribe = vi.fn(async () => "x");
    const rec = createAIVoiceRecorder(transcribe, handlers());
    rec.start();
    const stopped = rec.stop();
    grant(await goodStream());
    await stopped;
    expect(rec.isRecording()).toBe(false);
    expect(stopTrack).toHaveBeenCalled(); // mic never left on
  });
  it("cancel() discards audio without transcribing", async () => {
    const transcribe = vi.fn(async () => "x");
    const rec = createAIVoiceRecorder(transcribe, handlers());
    rec.start(); await tick(); rec.cancel(); await tick();
    expect(transcribe).not.toHaveBeenCalled();
    expect(stopTrack).toHaveBeenCalled();
    expect(rec.hasPending()).toBe(false);
  });
  it("auto-stops at the time limit and transcribes what was captured", async () => {
    const h = handlers(); const transcribe = vi.fn(async () => "طويل");
    const rec = createAIVoiceRecorder(transcribe, h, 20);
    rec.start(); await tick();
    await new Promise((r) => setTimeout(r, 60));
    expect(transcribe).toHaveBeenCalledTimes(1);
    expect(h.onText).toHaveBeenCalledWith("طويل");
    expect(h.onMessage).toHaveBeenCalledWith(expect.stringContaining("الحد الأقصى"));
  });
});
