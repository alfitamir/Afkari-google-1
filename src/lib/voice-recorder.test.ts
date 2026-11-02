import { beforeEach, describe, expect, it, vi } from "vitest";
import { createVoiceRecorder } from "./voice-recorder";

let instances: FakeSR[] = [];
class FakeSR {
  lang = ""; continuous = false; interimResults = true;
  onresult: any; onerror: any; onend: any;
  started = 0; stopped = 0; aborted = 0;
  constructor() { instances.push(this); }
  start() { this.started++; }
  stop() { this.stopped++; queueMicrotask(() => this.onend?.()); }
  abort() { this.aborted++; }
  say(text: string, isFinal = true) {
    this.onresult({ resultIndex: 0, results: [Object.assign([{ transcript: text }], { isFinal })] });
  }
}

const setup = () => {
  const h = { onText: vi.fn(), onListening: vi.fn(), onMessage: vi.fn() };
  return { h, rec: createVoiceRecorder(FakeSR as any, h) };
};

beforeEach(() => { instances = []; });

describe("createVoiceRecorder", () => {
  it("starts an Arabic continuous session and reports listening", () => {
    const { rec, h } = setup();
    rec.start();
    expect(instances[0]).toMatchObject({ lang: "ar-EG", continuous: true, started: 1 });
    expect(h.onListening).toHaveBeenCalledWith(true);
    expect(rec.isRecording()).toBe(true);
  });
  it("forwards only final, non-empty transcripts", () => {
    const { rec, h } = setup();
    rec.start();
    instances[0].say("مؤقت", false);
    instances[0].say("   ");
    instances[0].say(" فكرة ");
    expect(h.onText.mock.calls).toEqual([["فكرة"]]);
  });
  it("keeps recording across browser-initiated session ends (silence timeouts)", () => {
    const { rec } = setup();
    rec.start();
    instances[0].onend();
    expect(instances).toHaveLength(2);
    expect(instances[1].started).toBe(1);
    expect(rec.isRecording()).toBe(true);
  });
  it("stop() resolves, stops listening and does not restart", async () => {
    const { rec, h } = setup();
    rec.start();
    await rec.stop();
    expect(rec.isRecording()).toBe(false);
    expect(h.onListening).toHaveBeenLastCalledWith(false);
    expect(instances).toHaveLength(1);
  });
  it("microphone permission denial stops recording with a helpful message", () => {
    const { rec, h } = setup();
    rec.start();
    instances[0].onerror({ error: "not-allowed" });
    instances[0].onend();
    expect(rec.isRecording()).toBe(false);
    expect(h.onMessage).toHaveBeenLastCalledWith(expect.stringContaining("الميكروفون"));
  });
  it("transient errors (no-speech) do not end the session", () => {
    const { rec } = setup();
    rec.start();
    instances[0].onerror({ error: "no-speech" });
    instances[0].onend();
    expect(rec.isRecording()).toBe(true);
  });
  it("cancel() aborts without restarting", () => {
    const { rec } = setup();
    rec.start();
    rec.cancel();
    expect(instances[0].aborted).toBe(1);
    expect(rec.isRecording()).toBe(false);
  });
  it("start() twice does not create a second session", () => {
    const { rec } = setup();
    rec.start(); rec.start();
    expect(instances).toHaveLength(1);
  });
});
