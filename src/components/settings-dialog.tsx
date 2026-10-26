import { useEffect, useRef, useState } from "react";
import { Download, KeyRound, Trash2, Upload, BookOpen, Sparkles, CheckCircle2, ChevronDown, Cloud, RefreshCw, HardDrive } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { getGeminiKey, setGeminiKey, testGeminiKey } from "@/lib/gemini";
import { buildBackup, parseBackup, restoreBackup } from "@/lib/backup";
import { loadIdeas } from "@/lib/ideas";
import { getGoogleUser, signInWithGoogle, onGoogleAuthStateChange } from "@/lib/google-auth";
import { syncWithGoogleDrive, getLastDriveSyncTime } from "@/lib/google-drive-sync";
import type { User } from "firebase/auth";

export function SettingsDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const [saved, setSaved] = useState(false);
  const [draft, setDraft] = useState("");
  const [keyMsg, setKeyMsg] = useState("");
  const [testing, setTesting] = useState(false);
  const [backupMsg, setBackupMsg] = useState("");
  const [styleOpen, setStyleOpen] = useState(false);
  const [googleUser, setGoogleUser] = useState<User | null>(getGoogleUser());
  const [driveSyncing, setDriveSyncing] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => { if (open) { setSaved(!!getGeminiKey()); setDraft(""); setKeyMsg(""); setBackupMsg(""); } }, [open]);

  const saveKey = async () => {
    const key = draft.trim();
    if (!key) return;
    setGeminiKey(key); setSaved(true); setDraft("");
    if (!navigator.onLine) { setKeyMsg("حُفظ المفتاح ✓ سنستخدمه عند الاتصال بالإنترنت."); return; }
    setTesting(true); setKeyMsg("جارٍ التأكد من المفتاح…");
    const error = await testGeminiKey(key);
    setTesting(false);
    setKeyMsg(error ? `حُفظ المفتاح، لكن: ${error}` : "المفتاح يعمل ✓ الضبط والدمج سيستخدمان Gemini الخاص بك.");
  };
  const removeKey = () => { setGeminiKey(""); setSaved(false); setKeyMsg("حُذف المفتاح من هذا الهاتف."); };

  const exportBackup = async () => {
    setBackupMsg("");
    const ideas = loadIdeas();
    const date = new Date().toISOString().slice(0, 10);
    const name = `afkari-backup-${date}.json`;
    const file = new File([buildBackup(ideas)], name, { type: "application/json" });
    try {
      if (navigator.canShare?.({ files: [file] })) {
        await navigator.share({ files: [file], title: "نسخة أفكاري الاحتياطية" });
        setBackupMsg(`جُهزت النسخة (${ideas.length} فكرة) ✓ اختر Google Drive لحفظها.`);
        return;
      }
    } catch (error) {
      if (error instanceof Error && error.name === "AbortError") return;
    }
    const url = URL.createObjectURL(file);
    const a = document.createElement("a");
    a.href = url; a.download = name; a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    setBackupMsg(`نُزّلت النسخة (${ideas.length} فكرة) ✓ ارفعها إلى Google Drive من مجلد التنزيلات.`);
  };
  const importBackup = async (file: File | undefined) => {
    if (!file) return;
    try {
      const added = restoreBackup(parseBackup(await file.text()));
      setBackupMsg(added ? `استُعيدت ${added} فكرة ✓` : "النسخة مستعادة ✓ كل أفكارها موجودة بالفعل.");
      void syncWithGoogleDrive().catch(() => {});
    } catch (error) {
      setBackupMsg(error instanceof Error ? error.message : "تعذّرت قراءة الملف.");
    } finally { if (fileRef.current) fileRef.current.value = ""; }
  };

  return <Dialog open={open} onOpenChange={onOpenChange}>
    <DialogContent dir="rtl" className="max-h-[85dvh] overflow-y-auto">
      <DialogTitle className="text-start font-display">الإعدادات</DialogTitle>
      <section className="space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="font-display text-lg">اتصال Google Gemini للذكاء الاصطناعي</h3>
          <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/10 px-2.5 py-0.5 text-xs font-medium text-emerald-600 dark:text-emerald-400 border border-emerald-500/20">
            <CheckCircle2 className="size-3" />
            نشط عبر الخادم
          </span>
        </div>
        <p className="text-sm text-muted-foreground">
          التطبيق متصل الآن مباشرة بنموذج Gemini 3.8 Flash لضبط المقالات لغوياً وهيكلياً على أسلوبك، واقتراح دمج المقالات المتكاملة، وتوليد إضافات واقتباسات فكرية.
        </p>
        <p className="text-xs text-muted-foreground">
          (اختياري): يمكنك حفظ مفتاح API شخصي إضافي إذا أردت استخدام حسابك المباشر.
        </p>
        {saved && <p className="text-sm text-primary">✓ يوجد مفتاح شخصي مخصص محفوظ على هذا الجهاز</p>}
        <input type="password" aria-label="مفتاح Gemini" placeholder={saved ? "ضع مفتاحًا جديدًا لاستبداله" : "الصق المفتاح المخصص هنا (اختياري)"} value={draft} onChange={(e) => setDraft(e.target.value)}
          dir="ltr" autoComplete="off" className="w-full rounded-md border border-input bg-card px-3 py-2 outline-none focus:ring-2 focus:ring-ring" />
        <div className="flex flex-wrap gap-2">
          <Button onClick={saveKey} disabled={!draft.trim() || testing}><KeyRound />حفظ المفتاح المخصص</Button>
          {saved && <Button variant="ghost" className="text-destructive" onClick={removeKey}><Trash2 />حذف المفتاح المخصص</Button>}
        </div>
        {keyMsg && <p role="status" className="break-words text-sm text-muted-foreground">{keyMsg}</p>}
      </section>

      <section className="space-y-3 border-t border-border pt-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <BookOpen className="size-5 text-primary" />
            <h3 className="font-display text-lg">أسلوب الكاتب المعتمد</h3>
          </div>
          <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/10 px-2.5 py-0.5 text-xs font-medium text-emerald-600 dark:text-emerald-400 border border-emerald-500/20">
            <CheckCircle2 className="size-3" />
            مفعّل في الضبط والدمج
          </span>
        </div>
        <p className="text-sm text-muted-foreground">
          تُطبّق تعليمات أسلوبك الخاصة عند صياغة أو تعديل أو دمج المقالات واقتراحها بالذكاء الاصطناعي: صوت تحليلي صاحب موقف، فصحى حية تتخللها تعبيرات مصرية محسوبة، نقد هيكلي للمنظومة بدون تجريح شخصي.
        </p>

        <Button
          variant="outline"
          size="sm"
          onClick={() => setStyleOpen(!styleOpen)}
          className="w-full justify-between"
        >
          <span>عرض تفاصيل ملامح الأسلوب</span>
          <ChevronDown className={`size-4 transition-transform ${styleOpen ? "rotate-180" : ""}`} />
        </Button>

        {styleOpen && (
          <div className="rounded-xl border border-border bg-card p-3.5 text-xs text-foreground space-y-2 font-sans leading-relaxed">
            <p><strong>1. الهوية والنبرة:</strong> كاتب صاحب موقف يفكر بصوت مسموع، فصحى تحليلية تُطعّم بتعبيرات مصرية حية باعتدال، حازم مع المنظومة والسياسات بلا شتائم ولا ادعاء معرفة النوايا.</p>
            <p><strong>2. البناء المفضل:</strong> يبدأ بعنوان مباشر يحدد القضية، ثم جملة تقريرية بالأطروحة، ونقل النقاش للأسباب المتراكمة والخلل الهيكلي، واستخدام الثنائيات (الأفكار والأفعال، الفرد والمنظومة، الدولة والإعلام)، والخاتمة بسؤال ثقيل أو خلاصة فكرية.</p>
            <p><strong>3. الضوابط الصارمة:</strong> ممنوع لغة التسويق والدعاية والخطافات السطحية، ممنوع الأسئلة التفاعلية المصطنعة («ما رأيكم؟»)، وممنوع اختلاق وقائع أو تواريخ أو تجارب لم يقلها الكاتب.</p>
          </div>
        )}
      </section>

      <section className="space-y-3 border-t border-border pt-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <HardDrive className="size-5 text-primary" />
            <h3 className="font-display text-lg">مزامنة Google Drive السحابية</h3>
          </div>
          {googleUser ? (
            <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/10 px-2.5 py-0.5 text-xs font-medium text-emerald-600 dark:text-emerald-400 border border-emerald-500/20">
              <CheckCircle2 className="size-3" />
              متصل
            </span>
          ) : (
            <span className="text-xs text-muted-foreground">غير متصل</span>
          )}
        </div>

        <p className="text-sm text-muted-foreground">
          حفظ سحابي مباشر على Google Drive الخاص بك في ملف (<code className="text-xs font-mono">afkari-backup.json</code>) يُحدّث تلقائياً ويُستعاد على أي جهاز.
        </p>

        {googleUser ? (
          <div className="space-y-2 rounded-xl bg-card border border-border p-3.5">
            <div className="flex items-center justify-between text-xs">
              <span className="text-muted-foreground">الحساب:</span>
              <span className="font-medium text-foreground truncate max-w-[200px]" dir="ltr">{googleUser.email}</span>
            </div>
            {getLastDriveSyncTime() && (
              <div className="flex items-center justify-between text-xs">
                <span className="text-muted-foreground">آخر مزامنة:</span>
                <span className="text-foreground">{new Date(getLastDriveSyncTime()!).toLocaleTimeString("ar")}</span>
              </div>
            )}
            <Button
              variant="default"
              size="sm"
              className="w-full mt-2"
              disabled={driveSyncing}
              onClick={async () => {
                setDriveSyncing(true);
                setBackupMsg("جارٍ المزامنة مع Google Drive...");
                const res = await syncWithGoogleDrive();
                setDriveSyncing(false);
                setBackupMsg(res.message);
              }}
            >
              <RefreshCw className={`size-3.5 ${driveSyncing ? "animate-spin" : ""}`} />
              {driveSyncing ? "جارٍ المزامنة..." : "مزامنة سحابية الآن"}
            </Button>
          </div>
        ) : (
          <Button
            variant="outline"
            size="sm"
            className="w-full justify-center gap-2"
            disabled={driveSyncing}
            onClick={async () => {
              setDriveSyncing(true);
              setBackupMsg("");
              try {
                const res = await signInWithGoogle();
                setGoogleUser(res.user);
                setBackupMsg("تم تسجيل الدخول بحساب Google! جارٍ المزامنة...");
                const syncRes = await syncWithGoogleDrive();
                setBackupMsg(syncRes.message);
              } catch (err: any) {
                setBackupMsg(err?.message || "تعذّر تسجيل الدخول.");
              } finally {
                setDriveSyncing(false);
              }
            }}
          >
            <Cloud className="size-4 text-primary" />
            <span>تسجيل الدخول بحساب Google لتفعيل الحفظ التلقائي</span>
          </Button>
        )}
      </section>

      <section className="space-y-3 border-t border-border pt-4">
        <h3 className="font-display text-lg">تصدير / استعادة يدوية</h3>
        <p className="text-sm text-muted-foreground">تنزيل ملف النسخة الاحتياطية محلياً أو استعادته يدوياً دون الحاجة للاتصال السحابي.</p>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" onClick={exportBackup}><Download />تصدير نسخة</Button>
          <Button variant="outline" onClick={() => fileRef.current?.click()}><Upload />استعادة نسخة</Button>
          <input ref={fileRef} type="file" accept=".json,application/json,text/plain" hidden aria-label="ملف النسخة الاحتياطية" onChange={(e) => importBackup(e.target.files?.[0])} />
        </div>
        {backupMsg && <p role="status" className="break-words text-sm text-muted-foreground">{backupMsg}</p>}
      </section>
    </DialogContent>
  </Dialog>;
}
