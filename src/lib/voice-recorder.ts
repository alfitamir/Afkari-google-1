/**
 * Continuous speech recognition that keeps listening until the user presses stop.
 * Browsers end SpeechRecognition sessions on silence or after a time limit, so we restart
 * transparently while the user still wants to record.
 */
export type VoiceRecorder = {
  start: () => void;
  stop: () => Promise<void>;
  cancel: () => void;
  isRecording: () => boolean;
};

type Handlers = {
  onText: (text: string) => void;
  onListening: (listening: boolean) => void;
  onMessage: (message: string) => void;
};

const FATAL = new Set(["not-allowed", "service-not-allowed", "audio-capture", "language-not-supported"]);

export function createVoiceRecorder(SR: new () => any, { onText, onListening, onMessage }: Handlers): VoiceRecorder {
  let rec: any = null;
  let wanted = false;
  let finished: (() => void) | null = null;

  const spawn = () => {
    rec = new SR();
    rec.lang = "ar-EG";
    rec.continuous = true;
    rec.interimResults = false;
    rec.onresult = (e: any) => {
      for (let i = e.resultIndex; i < e.results.length; i++) {
        if (e.results[i].isFinal) {
          const s = String(e.results[i][0]?.transcript ?? "").trim();
          if (s) onText(s);
        }
      }
    };
    rec.onerror = (e: any) => {
      if (FATAL.has(e.error)) {
        wanted = false;
        onMessage(e.error === "not-allowed" || e.error === "service-not-allowed"
          ? "لم يُسمح باستخدام الميكروفون. فعّل الإذن أو اكتب فكرتك."
          : "تعذّر التسجيل الصوتي على هذا الجهاز، اكتب فكرتك.");
      }
      // "no-speech" / "aborted" / "network" are retried by onend while still wanted.
    };
    rec.onend = () => {
      if (wanted) {
        try { spawn(); rec.start(); return; } catch { wanted = false; }
      }
      onListening(false);
      finished?.();
      finished = null;
    };
  };

  return {
    start() {
      if (wanted) return;
      wanted = true;
      onMessage("");
      try { spawn(); rec.start(); onListening(true); }
      catch { wanted = false; onListening(false); onMessage("تعذّر بدء التسجيل، حاول مرة أخرى."); }
    },
    stop() {
      if (!wanted || !rec) return Promise.resolve();
      wanted = false;
      return new Promise<void>((resolve) => {
        finished = resolve;
        try { rec.stop(); } catch { onListening(false); resolve(); finished = null; }
        setTimeout(() => { finished?.(); finished = null; }, 1500); // never hang the save button
      });
    },
    cancel() {
      wanted = false;
      try { rec?.abort(); } catch { /* already stopped */ }
      onListening(false);
    },
    isRecording: () => wanted,
  };
}
