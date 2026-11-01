import type { VoiceRecorder } from "./voice-recorder";

export type AIVoiceRecorder = VoiceRecorder & { retry: () => Promise<void>; hasPending: () => boolean };
type Handlers = {
  onText: (text: string) => void;
  onListening: (listening: boolean) => void;
  onMessage: (message: string) => void;
  onBusy: (busy: boolean) => void;
};

const MIMES = ["audio/webm;codecs=opus", "audio/webm", "audio/mp4", "audio/ogg;codecs=opus"];
export const pickMime = (): string | undefined =>
  typeof MediaRecorder === "undefined" ? undefined : MIMES.find((m) => MediaRecorder.isTypeSupported?.(m));
export const canRecordAudio = () =>
  typeof MediaRecorder !== "undefined" && !!navigator.mediaDevices?.getUserMedia && !!pickMime();

/** 10 minutes of 32 kbps audio stays well under the server's upload limit. */
export const MAX_RECORDING_MS = 10 * 60 * 1000;
const BITRATE = 32000;

/**
 * Records real audio and transcribes it with Gemini when the user stops.
 * Unlike browser speech recognition it never cuts out on silence and handles Egyptian Arabic well.
 * If transcription fails the audio is kept so the user can retry instead of re-speaking.
 */
export function createAIVoiceRecorder(
  transcribe: (blob: Blob) => Promise<string>, { onText, onListening, onMessage, onBusy }: Handlers,
  limitMs = MAX_RECORDING_MS,
): AIVoiceRecorder {
  let wanted = false;
  let stream: MediaStream | null = null;
  let rec: MediaRecorder | null = null;
  let chunks: Blob[] = [];
  let starting: Promise<void> | null = null;
  let limitTimer: ReturnType<typeof setTimeout> | undefined;
  let pending: Blob | null = null;

  const release = () => { clearTimeout(limitTimer); stream?.getTracks().forEach((t) => t.stop()); stream = null; };

  const run = async (blob: Blob) => {
    onBusy(true); onMessage("جارٍ تفريغ التسجيل…");
    try {
      const text = (await transcribe(blob)).trim();
      pending = null;
      if (text) { onText(text); onMessage(""); } else onMessage("لم نسمع كلامًا واضحًا في التسجيل. حاول مرة أخرى أو اكتب فكرتك.");
    } catch (error) {
      pending = blob;
      onMessage(`${error instanceof Error ? error.message : "تعذّر تفريغ التسجيل."} تسجيلك محفوظ — اضغط «إعادة المحاولة».`);
    } finally { onBusy(false); }
  };

  const finish = () =>
    new Promise<void>((resolve) => {
      const r = rec;
      if (!r || r.state === "inactive") { release(); resolve(); return; }
      r.onstop = async () => {
        release(); onListening(false);
        const blob = new Blob(chunks, { type: r.mimeType || pickMime() || "audio/webm" });
        chunks = []; rec = null;
        if (blob.size > 0) await run(blob);
        resolve();
      };
      try { r.stop(); } catch { release(); onListening(false); resolve(); }
    });

  return {
    start() {
      if (wanted) return;
      wanted = true; pending = null; chunks = [];
      onMessage("");
      starting = (async () => {
        try {
          stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } });
          if (!wanted) { release(); return; } // cancelled while the permission prompt was open
          rec = new MediaRecorder(stream, { mimeType: pickMime(), audioBitsPerSecond: BITRATE });
          rec.ondataavailable = (e) => { if (e.data.size) chunks.push(e.data); };
          rec.start(1000);
          onListening(true);
          limitTimer = setTimeout(() => { wanted = false; onMessage("وصل التسجيل إلى الحد الأقصى (10 دقائق) فتوقف تلقائيًا."); void finish(); }, limitMs);
        } catch (error) {
          wanted = false; release(); onListening(false);
          onMessage((error as Error)?.name === "NotAllowedError"
            ? "لم يُسمح باستخدام الميكروفون. فعّل الإذن أو اكتب فكرتك."
            : "تعذّر بدء التسجيل على هذا الجهاز، اكتب فكرتك.");
        }
      })();
    },
    async stop() {
      if (!wanted && !rec) return;
      wanted = false;
      await starting;
      await finish();
    },
    cancel() {
      wanted = false; pending = null; chunks = [];
      if (rec) { rec.onstop = null; try { rec.stop(); } catch { /* already stopped */ } rec = null; }
      release(); onListening(false);
    },
    isRecording: () => wanted,
    hasPending: () => pending !== null,
    async retry() { if (pending) await run(pending); },
  };
}
