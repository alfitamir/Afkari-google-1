import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { saveIdea } from "@/lib/ideas";
import { onGoogleAuthStateChange, getGoogleUser, getGoogleAccessToken } from "@/lib/google-auth";
import { syncWithGoogleDrive } from "@/lib/google-drive-sync";
import { createVoiceRecorder, type VoiceRecorder } from "@/lib/voice-recorder";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "أفكاري — سجّل فكرتك" },
      { name: "description", content: "سجّل أفكارك بالصوت أو الكتابة لتتحول إلى مقالات مبوبة." },
      { property: "og:title", content: "أفكاري — سجّل فكرتك" },
      { property: "og:description", content: "سجّل أفكارك بالصوت أو الكتابة لتتحول إلى مقالات مبوبة." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: Index,
});

function Index() {
  const [open, setOpen] = useState(false);
  const [text, setText] = useState("");
  const [listening, setListening] = useState(false);
  const [msg, setMsg] = useState("");
  const [cloud, setCloud] = useState<"off" | "on" | "syncing">("off");
  const [userEmail, setUserEmail] = useState<string>("");
  const recRef = useRef<VoiceRecorder | null>(null);

  useEffect(() => {
    let alive = true;

    const checkAndSync = async () => {
      const user = getGoogleUser();
      const token = await getGoogleAccessToken();

      if (!alive) return;
      if (user && token) {
        setUserEmail(user.email || "");
        setCloud("syncing");
        try {
          const res = await syncWithGoogleDrive();
          if (!alive) return;
          setCloud(res.success ? "on" : "off");
        } catch {
          if (alive) setCloud("off");
        }
      } else {
        setCloud("off");
        setUserEmail("");
      }
    };

    checkAndSync();

    const unsub = onGoogleAuthStateChange((user, token) => {
      if (user && token) {
        setUserEmail(user.email || "");
        checkAndSync();
      } else {
        setCloud("off");
        setUserEmail("");
      }
    });

    window.addEventListener("online", checkAndSync);
    return () => {
      alive = false;
      unsub();
      window.removeEventListener("online", checkAndSync);
    };
  }, []);

  // Recording runs until the user presses stop (see createVoiceRecorder).
  const textRef = useRef("");
  useEffect(() => { textRef.current = text; }, [text]);
  useEffect(() => () => { recRef.current?.cancel(); }, []);

  const toggleMic = async () => {
    if (recRef.current?.isRecording()) { await recRef.current.stop(); return; }
    const SR = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SR) { setMsg("التسجيل الصوتي غير متاح على هذا الجهاز، اكتب فكرتك."); return; }
    recRef.current?.cancel();
    recRef.current = createVoiceRecorder(SR, {
      onText: (s) => setText((t) => { const n = (t + " " + s).trim(); textRef.current = n; return n; }),
      onListening: setListening,
      onMessage: setMsg,
    });
    recRef.current.start();
  };

  const save = async () => {
    if (recRef.current?.isRecording()) await recRef.current.stop();
    const body = textRef.current.trim();
    if (!body) return;
    const idea = saveIdea(body);
    textRef.current = "";
    setText(""); 
    setOpen(false); 
    setMsg("حُفظت الفكرة ✓");

    // Sync to Google Drive in background if connected
    const token = await getGoogleAccessToken();
    if (token && navigator.onLine) {
      setCloud("syncing");
      void syncWithGoogleDrive().then((res) => {
        if (res.success) setCloud("on");
      }).catch(() => {});
    }
  };

  const cancel = () => { recRef.current?.cancel(); setOpen(false); };

  return (
    <main dir="rtl" className="paper flex min-h-screen flex-col items-center justify-center gap-10 px-6">
      <Link to="/library" aria-label="المقالات" className="icon-btn absolute left-5 top-5">
        <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M4 19.5V5a2 2 0 0 1 2-2h13v16H6a2 2 0 0 0-2 2Zm0 0A2 2 0 0 0 6 22h13"/></svg>
      </Link>
      <h1 className="font-display text-4xl text-foreground">أفكاري</h1>
      {!open ? (
        <button onClick={() => setOpen(true)} className="record-btn">سجّل فكرة</button>
      ) : (
        <div className="w-full max-w-md space-y-4">
          <textarea autoFocus value={text} onChange={(e) => setText(e.target.value)} rows={8}
            placeholder="اكتب أو تكلم..." className="w-full rounded-2xl border border-border bg-card p-4 text-lg leading-relaxed text-card-foreground outline-none focus:ring-2 focus:ring-ring" />
          {listening && <p className="text-center text-sm text-destructive">● جاري التسجيل… لن يتوقف إلا بضغطك على «إيقاف التسجيل»</p>}
          <div className="flex gap-3">
            <button onClick={toggleMic} aria-pressed={listening} className={`flex-1 rounded-full py-3 font-semibold ${listening ? "bg-destructive text-destructive-foreground animate-pulse" : "bg-secondary text-secondary-foreground"}`}>
              {listening ? "■ إيقاف التسجيل" : "🎙 ابدأ التسجيل"}
            </button>
            <button onClick={save} className="flex-1 rounded-full bg-primary py-3 font-semibold text-primary-foreground">حفظ</button>
          </div>
          <button onClick={cancel} className="w-full text-sm text-muted-foreground">إلغاء</button>
        </div>
      )}
      {msg && <p className="text-center text-sm text-muted-foreground">{msg}</p>}

      {cloud === "on" ? (
        <Link to="/auth" className="text-center text-xs text-muted-foreground hover:text-foreground flex items-center justify-center gap-1.5 transition">
          <span className="w-2 h-2 rounded-full bg-emerald-500"></span>
          <span>محفوظ سحابياً على Google Drive {userEmail && `(${userEmail})`}</span>
        </Link>
      ) : cloud === "syncing" ? (
        <p className="text-center text-xs text-muted-foreground flex items-center justify-center gap-1.5 animate-pulse">
          <span className="w-2 h-2 rounded-full bg-amber-500"></span>
          <span>جارٍ المزامنة مع Google Drive...</span>
        </p>
      ) : (
        <Link to="/auth" className="text-center text-xs text-primary underline hover:opacity-80 flex items-center justify-center gap-1.5">
          <span>☁️ تسجيل الدخول بحساب Google لحفظ المقالات على Drive</span>
        </Link>
      )}
    </main>
  );
}
