import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { 
  signInWithGoogle, 
  signOutGoogle, 
  getGoogleUser, 
  onGoogleAuthStateChange 
} from "@/lib/google-auth";
import { syncWithGoogleDrive, getLastDriveSyncTime } from "@/lib/google-drive-sync";
import { CheckCircle2, RefreshCw, LogOut, ArrowRight, ShieldCheck, HardDrive } from "lucide-react";
import type { User } from "firebase/auth";

export const Route = createFileRoute("/auth")({
  head: () => ({
    meta: [
      { title: "تسجيل الدخول — أفكاري" },
      { name: "description", content: "سجّل الدخول بحساب Google لحفظ واستعادة أفكارك على Google Drive." },
      { property: "og:title", content: "تسجيل الدخول — أفكاري" },
      { property: "og:description", content: "سجّل الدخول بحساب Google لحفظ واستعادة أفكارك على Google Drive." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: Auth,
});

function Auth() {
  const navigate = useNavigate();
  const [user, setUser] = useState<User | null>(getGoogleUser());
  const [busy, setBusy] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [msg, setMsg] = useState("");
  const [lastSync, setLastSync] = useState<number | null>(getLastDriveSyncTime());

  useEffect(() => {
    const unsub = onGoogleAuthStateChange((currentUser) => {
      setUser(currentUser);
      setLastSync(getLastDriveSyncTime());
    });
    return unsub;
  }, []);

  const handleGoogleLogin = async () => {
    setBusy(true);
    setMsg("");
    try {
      const result = await signInWithGoogle();
      setUser(result.user);
      setMsg("تم تسجيل الدخول بنجاح! جارٍ مزامنة مقالاتك مع Google Drive...");
      setSyncing(true);
      const syncResult = await syncWithGoogleDrive();
      setSyncing(false);
      setMsg(syncResult.message);
      setLastSync(syncResult.timestamp || Date.now());
      setTimeout(() => navigate({ to: "/" }), 1200);
    } catch (err: any) {
      console.warn('Google sign in / sync warning:', err);
      setMsg(err?.message || "تعذّر تسجيل الدخول بحساب Google. حاول مرة أخرى.");
    } finally {
      setBusy(false);
      setSyncing(false);
    }
  };

  const handleSyncNow = async () => {
    setSyncing(true);
    setMsg("جارٍ الاتصال بـ Google Drive وتحديث المقالات...");
    const result = await syncWithGoogleDrive();
    setSyncing(false);
    setMsg(result.message);
    if (result.timestamp) setLastSync(result.timestamp);
  };

  const handleLogout = async () => {
    setBusy(true);
    await signOutGoogle();
    setUser(null);
    setBusy(false);
    setMsg("تم تسجيل الخروج بنجاح.");
  };

  return (
    <main dir="rtl" className="paper flex min-h-screen flex-col items-center justify-center gap-6 px-6 py-10 font-sans">
      <button 
        onClick={() => navigate({ to: "/" })} 
        className="icon-btn absolute left-5 top-5"
        title="رجوع إلى الرئيسية"
        aria-label="رجوع"
      >
        <ArrowRight className="w-5 h-5" />
      </button>

      <div className="w-16 h-16 rounded-full bg-primary/10 border border-primary/20 flex items-center justify-center text-primary mb-2">
        <HardDrive className="w-8 h-8" />
      </div>

      <h1 className="font-display text-3xl text-foreground text-center">
        {user ? "حسابك ومزامنة Google Drive" : "حفظ أفكارك على Google Drive"}
      </h1>

      <p className="max-w-md text-center text-sm text-muted-foreground leading-relaxed">
        {user 
          ? "أفكارك ومقالاتك مرتبطة بحساب Google الخاص بك وتُحفظ تلقائياً في ملف مخصص على Google Drive مع الحفاظ على خصوصيتك التامة."
          : "سجّل الدخول بحساب Google الخاص بك لحفظ أفكارك ومقالاتك تلقائياً في Google Drive، واستعادتها في أي وقت ومن أي هاتف أو متصفح."
        }
      </p>

      {user ? (
        <div className="w-full max-w-sm rounded-2xl border border-border bg-card p-6 shadow-sm space-y-5">
          <div className="flex items-center gap-3">
            {user.photoURL ? (
              <img 
                src={user.photoURL} 
                alt={user.displayName || "Google User"} 
                className="w-12 h-12 rounded-full border border-border"
              />
            ) : (
              <div className="w-12 h-12 rounded-full bg-primary/10 text-primary flex items-center justify-center font-bold text-lg">
                {(user.displayName || user.email || "G")[0].toUpperCase()}
              </div>
            )}
            <div className="min-w-0 flex-1">
              <h3 className="font-semibold text-base text-foreground truncate">
                {user.displayName || "مستخدم Google"}
              </h3>
              <p className="text-xs text-muted-foreground truncate" dir="ltr">
                {user.email}
              </p>
            </div>
          </div>

          <div className="rounded-xl bg-muted/50 p-3 text-xs space-y-1.5 border border-border/60">
            <div className="flex items-center gap-1.5 text-emerald-600 dark:text-emerald-400 font-medium">
              <CheckCircle2 className="w-4 h-4 shrink-0" />
              <span>متصل بـ Google Drive (afkari-backup.json)</span>
            </div>
            {lastSync && (
              <p className="text-muted-foreground">
                آخر مزامنة: {new Date(lastSync).toLocaleTimeString("ar", { hour: '2-digit', minute: '2-digit' })}
              </p>
            )}
          </div>

          <div className="space-y-2">
            <button
              onClick={handleSyncNow}
              disabled={syncing}
              className="w-full flex items-center justify-center gap-2 py-3 px-4 rounded-xl bg-primary text-primary-foreground font-semibold text-sm hover:opacity-90 disabled:opacity-60 transition"
            >
              <RefreshCw className={`w-4 h-4 ${syncing ? 'animate-spin' : ''}`} />
              <span>{syncing ? "جارٍ المزامنة..." : "مزامنة الآن مع Google Drive"}</span>
            </button>

            <button
              onClick={handleLogout}
              disabled={busy}
              className="w-full flex items-center justify-center gap-2 py-2.5 px-4 rounded-xl border border-destructive/30 text-destructive font-medium text-xs hover:bg-destructive/10 transition"
            >
              <LogOut className="w-4 h-4" />
              <span>تسجيل الخروج</span>
            </button>
          </div>
        </div>
      ) : (
        <div className="w-full max-w-sm space-y-4">
          {/* Official Google Sign In Button */}
          <button
            onClick={handleGoogleLogin}
            disabled={busy}
            className="w-full flex items-center justify-center gap-3 py-3.5 px-5 rounded-2xl bg-white text-slate-800 font-medium text-sm border border-slate-300 shadow-sm hover:bg-slate-50 hover:shadow transition active:scale-[0.99] disabled:opacity-60"
          >
            <svg className="w-5 h-5 shrink-0" viewBox="0 0 48 48">
              <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"></path>
              <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"></path>
              <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"></path>
              <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"></path>
            </svg>
            <span>{busy ? "جارٍ تسجيل الدخول..." : "متابعة باستخدام حساب Google"}</span>
          </button>

          <div className="p-3.5 rounded-xl bg-card border border-border text-xs text-muted-foreground flex items-start gap-2.5">
            <ShieldCheck className="w-4 h-4 text-emerald-500 shrink-0 mt-0.5" />
            <p className="leading-relaxed">
              تطبيقك يطلب صلاحية الوصول المحدودة للملفات التي ينشئها فقط على Google Drive لحفظ واستعادة أفكارك، ولا يطلع على أي ملفات أخرى في حسابك.
            </p>
          </div>
        </div>
      )}

      {msg && (
        <p role="status" className="max-w-sm text-center text-xs text-muted-foreground font-medium animate-fadeIn">
          {msg}
        </p>
      )}

      <button 
        onClick={() => navigate({ to: "/" })} 
        className="text-xs text-muted-foreground hover:text-foreground transition underline"
      >
        العودة إلى تسجيل الأفكار
      </button>
    </main>
  );
}
