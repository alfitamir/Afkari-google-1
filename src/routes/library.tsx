import { createFileRoute, Link } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useState } from "react";
import { ArrowRight, Search, Settings } from "lucide-react";
import { ArticleEditor } from "@/components/article-editor";
import { MergeBanner } from "@/components/merge-banner";
import { SettingsDialog } from "@/components/settings-dialog";
import { classify, deleteIdea, loadIdeas, matchesArticle, OTHER, TOPICS, type Idea } from "@/lib/ideas";
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

  const refresh = useCallback(() => setIdeas(loadIdeas()), []);

  useEffect(() => {
    refresh();
    setOnline(navigator.onLine);
    const up = () => { setOnline(true); void syncNow().catch(() => {}); };
    const down = () => setOnline(false);
    window.addEventListener("afkari:ideas-changed", refresh);
    window.addEventListener("online", up);
    window.addEventListener("offline", down);
    void syncNow().catch(() => {});
    return () => {
      window.removeEventListener("afkari:ideas-changed", refresh);
      window.removeEventListener("online", up);
      window.removeEventListener("offline", down);
    };
  }, [refresh]);

  const topicOf = useMemo(() => new Map(ideas.map((i) => [i.id, classify(i.text)])), [ideas]);
  const topics = useMemo(() => [ALL, ...Object.keys(TOPICS), OTHER].filter((t) => t === ALL || ideas.some((i) => topicOf.get(i.id) === t)), [ideas, topicOf]);
  const shown = useMemo(
    () => ideas.filter((i) => (topic === ALL || topicOf.get(i.id) === topic) && matchesArticle(i, query)),
    [ideas, topic, topicOf, query],
  );

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
            <ArticleEditor key={`${idea.id}:${idea.updatedAt ?? 0}`} idea={idea} online={online} onChange={refresh} onDelete={() => remove(idea.id)} />
          ))
        )}
      </div>
      <SettingsDialog open={settingsOpen} onOpenChange={setSettingsOpen} />
    </main>
  );
}
