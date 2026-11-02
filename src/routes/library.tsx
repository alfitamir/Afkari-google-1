import { createFileRoute, Link } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useState } from "react";
import { ArrowRight, Lightbulb, Search, Settings, Sparkles, Tags } from "lucide-react";
import { ArticleEditor } from "@/components/article-editor";
import { MergeBanner } from "@/components/merge-banner";
import { SettingsDialog } from "@/components/settings-dialog";
import { AskDialog } from "@/components/ask-dialog";
import { InsightsDialog } from "@/components/insights-dialog";
import { labelAll, labelFor, loadLabels, unlabeled } from "@/lib/ai-labels";
import { deleteIdea, loadIdeas, matchesArticle, OTHER, TOPICS, strip, type Idea } from "@/lib/ideas";
import { deleteIdeaCloud, syncNow } from "@/lib/sync";

export const Route = createFileRoute("/library")({
  head: () => ({
    meta: [
      { title: "المقالات — أفكاري" },
      { name: "description", content: "أفكارك ومقالاتك مبوّبة حسب الموضوع، قابلة للتحرير والضبط والدمج." },
    ],
  }),
  component: Library,
});

const ALL = "الكل";

function Library() {
  const [ideas, setIdeas] = useState<Idea[]>([]);
  const [query, setQuery] = useState("");
  const [topic, setTopic] = useState(ALL);
  const [online, setOnline] = useState(true);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [askOpen, setAskOpen] = useState(false);
  const [insightsOpen, setInsightsOpen] = useState(false);
  const [labels, setLabels] = useState(loadLabels);
  const [labeling, setLabeling] = useState<{ done: number; total: number } | null>(null);
  const [labelError, setLabelError] = useState("");

  const refresh = useCallback(() => { setIdeas(loadIdeas()); setLabels(loadLabels()); }, []);

  useEffect(() => {
    refresh();
    setOnline(navigator.onLine);
    const up = () => { setOnline(true); void syncNow().catch(() => {}); };
    const down = () => setOnline(false);
    window.addEventListener("afkari:ideas-changed", refresh);
    window.addEventListener("afkari:labels-changed", refresh);
    window.addEventListener("online", up);
    window.addEventListener("offline", down);
    void syncNow().catch(() => {});
    return () => {
      window.removeEventListener("afkari:ideas-changed", refresh);
      window.removeEventListener("afkari:labels-changed", refresh);
      window.removeEventListener("online", up);
      window.removeEventListener("offline", down);
    };
  }, [refresh]);

  const labelOf = useMemo(() => new Map(ideas.map((i) => [i.id, labelFor(i, labels)])), [ideas, labels]);
  const topicOf = useMemo(() => new Map([...labelOf].map(([id, l]) => [id, l.topic])), [labelOf]);
  const stale = useMemo(() => unlabeled(ideas).length, [ideas, labels]);
  const topics = useMemo(() => [ALL, ...Object.keys(TOPICS), OTHER].filter((t) => t === ALL || ideas.some((i) => topicOf.get(i.id) === t)), [ideas, topicOf]);
  const shown = useMemo(
    () => ideas.filter((i) => (topic === ALL || topicOf.get(i.id) === topic)
      && (matchesArticle(i, query) || (labelOf.get(i.id)?.tags ?? []).some((t) => strip(t).includes(strip(query).trim())))),
    [ideas, topic, topicOf, labelOf, query],
  );

  const classifyAll = async () => {
    setLabelError(""); setLabeling({ done: 0, total: stale });
    try { await labelAll(ideas, { onProgress: (done, total) => setLabeling({ done, total }) }); }
    catch (e) { setLabelError(e instanceof Error ? e.message : "تعذّر التصنيف."); }
    finally { setLabeling(null); refresh(); }
  };

  const remove = (id: string) => {
    deleteIdea(id);
    void deleteIdeaCloud(id).catch(() => {});
    refresh();
  };

  return (
    <main dir="rtl" className="paper min-h-screen px-5 pb-16 pt-5">
      <div className="mx-auto max-w-2xl">
        <header className="mb-5 flex items-center justify-between">
          <Link to="/" aria-label="الرئيسية" className="icon-btn"><ArrowRight className="size-5" /></Link>
          <h1 className="font-display text-3xl text-foreground">المقالات</h1>
          <button onClick={() => setSettingsOpen(true)} aria-label="الإعدادات" className="icon-btn"><Settings className="size-5" /></button>
        </header>

        <div className="relative mb-4">
          <Search className="pointer-events-none absolute right-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <input
            type="search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="ابحث في المقالات…"
            className="w-full rounded-full border border-border bg-card py-2.5 pl-4 pr-10 text-card-foreground outline-none focus:ring-2 focus:ring-ring"
          />
        </div>

        <div className="mb-3 flex flex-wrap gap-2">
          <button onClick={() => setAskOpen(true)} className="inline-flex items-center gap-1.5 rounded-full bg-primary px-3.5 py-1.5 text-sm font-medium text-primary-foreground hover:opacity-90"><Sparkles className="size-4" />اسأل أفكاري</button>
          <button onClick={() => setInsightsOpen(true)} className="inline-flex items-center gap-1.5 rounded-full border border-border bg-card px-3.5 py-1.5 text-sm font-medium text-foreground hover:bg-accent"><Lightbulb className="size-4" />رؤى</button>
          {stale > 0 && (
            <button onClick={() => void classifyAll()} disabled={!online || !!labeling} className="inline-flex items-center gap-1.5 rounded-full border border-border bg-card px-3.5 py-1.5 text-sm font-medium text-foreground hover:bg-accent disabled:opacity-50">
              <Tags className="size-4" />{labeling ? `جارٍ التصنيف ${labeling.done}/${labeling.total}…` : `صنّف بالذكاء الاصطناعي (${stale})`}
            </button>
          )}
        </div>
        {labelError && <p role="alert" className="mb-3 text-sm text-destructive">{labelError}</p>}

        <div className="mb-4 flex flex-wrap gap-2" role="tablist" aria-label="المواضيع">
          {topics.map((t) => (
            <button
              key={t} role="tab" aria-selected={topic === t} onClick={() => setTopic(t)}
              className={`rounded-full px-3.5 py-1.5 text-sm transition ${topic === t ? "bg-primary text-primary-foreground" : "bg-secondary text-secondary-foreground hover:opacity-80"}`}
            >
              {t}
            </button>
          ))}
        </div>

        <MergeBanner ideas={ideas} online={online} onChange={refresh} />

        {!online && <p className="mb-3 text-center text-xs text-muted-foreground">أنت غير متصل — الأفكار محفوظة على هذا الجهاز وسنزامنها عند عودة الاتصال.</p>}

        {shown.length === 0 ? (
          <p className="py-16 text-center text-muted-foreground">{ideas.length ? "لا مقالات تطابق بحثك." : "لا أفكار بعد. سجّل فكرتك الأولى من الصفحة الرئيسية."}</p>
        ) : (
          shown.map((idea) => (
            <div key={`${idea.id}:${idea.updatedAt ?? 0}`}>
              {(labelOf.get(idea.id)?.tags.length ?? 0) > 0 && (
                <div className="-mb-3 flex flex-wrap gap-1.5 pt-4">
                  {labelOf.get(idea.id)!.tags.map((t) => (
                    <button key={t} onClick={() => setQuery(t)} className="rounded-full bg-secondary px-2.5 py-0.5 text-xs text-secondary-foreground hover:opacity-80">#{t}</button>
                  ))}
                </div>
              )}
              <ArticleEditor idea={idea} online={online} onChange={refresh} onDelete={() => remove(idea.id)} />
            </div>
          ))
        )}
      </div>
      <SettingsDialog open={settingsOpen} onOpenChange={setSettingsOpen} />
      <AskDialog open={askOpen} onOpenChange={setAskOpen} ideas={ideas} online={online} onPick={setQuery} />
      <InsightsDialog open={insightsOpen} onOpenChange={setInsightsOpen} ideas={ideas} online={online} onChange={refresh} onPick={setQuery} />
    </main>
  );
}
