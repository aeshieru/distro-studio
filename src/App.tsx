import { useEffect, useRef, useState } from "react";
import type { AiMode, Brand, ContentLang, RetentionPoint, RetentionSource, Take } from "./types";
import { BRANDS } from "./data/brands";
import { WHATIF_REEL } from "./data/reel";
import { SAVED_IDEA, savedTakes } from "./data/saved-run";
import { aiEngines, currentEngine, detectAiMode, setEngine } from "./lib/ai";
import { parseRetentionCsv, steepestDrop } from "./lib/retention";
import { runChecks, blockingFailure } from "./lib/checks";
import { Analyze } from "./components/Analyze";
import { Ideate, type MakeKind } from "./components/Ideate";
import { Direct } from "./components/Direct";
import { Brief } from "./components/Brief";
import { Welcome } from "./components/Welcome";
import { Library } from "./components/Library";
import { Check, IcBack, IcBoard, IcBrand, IcCreate, IcLibrary, IcResults, Play, Upload } from "./components/Icons";
import { startTour } from "./lib/tour";

// Distro: brand profile → what to make → idea and angles → checks → render → results.
type Section = "welcome" | "brief" | "explore" | "arrange" | "library" | "track";
export type ExploreStage = "type" | "plan";

const NAV: { id: Section; name: string; icon: (p: { className?: string }) => JSX.Element }[] = [
  { id: "brief", name: "Brand profile", icon: IcBrand },
  { id: "explore", name: "Create", icon: IcCreate },
  { id: "arrange", name: "Board", icon: IcBoard },
  { id: "library", name: "Library", icon: IcLibrary },
  { id: "track", name: "Results", icon: IcResults },
];

const fromHash = (): Section => {
  const h = location.hash.replace("#", "");
  if (h === "welcome") return "welcome";
  if (NAV.some((s) => s.id === h)) return h as Section;
  let seen = false;
  try { seen = localStorage.getItem("beat.welcomed") === "1"; } catch { /* storage blocked */ }
  return seen ? "track" : "welcome";
};

function load<T>(key: string, fallback: T): T {
  try { const v = localStorage.getItem(key); return v ? (JSON.parse(v) as T) : fallback; } catch { return fallback; }
}
function save(key: string, value: unknown) {
  try { localStorage.setItem(key, JSON.stringify(value)); } catch { /* storage blocked */ }
}

function withNotes(takes: Take[], brand: Brand): Take[] {
  return takes.map((t) => {
    if (t.status !== "rendered" && t.status !== "checks") return t;
    const fail = blockingFailure(runChecks(t, brand));
    return fail ? { ...t, status: "checks", note: `Blocked: ${fail.detail}` } : { ...t, note: "checks passed" };
  });
}

const short = (s: string, n = 34) => (s.length > n ? `${s.slice(0, n - 1).trimEnd()}…` : s);

export default function App() {
  const [section, setSection] = useState<Section>(fromHash);
  const [stage, setStage] = useState<ExploreStage>("type");
  const [kind, setKind] = useState<MakeKind>("reel");
  const [brands, setBrands] = useState<Brand[]>(() => load("beat.brands", BRANDS));
  const [brandId, setBrandId] = useState("moonsill");
  const brand = brands.find((b) => b.id === brandId) ?? brands[0];
  const reel = WHATIF_REEL;

  const [aiMode, setAiMode] = useState<AiMode>("saved");
  const [aiReady, setAiReady] = useState(false);
  const [lang, setLang] = useState<ContentLang>(() => load("beat.lang", "en" as ContentLang));
  const [idea, setIdea] = useState(SAVED_IDEA);
  const [takes, setTakesState] = useState<Take[]>(() => withNotes(savedTakes(load("beat.lang", "en" as ContentLang)), BRANDS[0]));
  const [takesSource, setTakesSource] = useState("Saved run, written 12 Nov");
  const [fresh, setFresh] = useState(false);
  const [selected, setSelected] = useState<string | null>("T05");
  const [retention, setRetention] = useState<{ points: RetentionPoint[]; source: RetentionSource }>(
    { points: reel.retention, source: reel.retentionSource });
  const [toastMsg, setToastMsg] = useState<{ msg: string; bad: boolean } | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => { detectAiMode().then((m) => { setAiMode(m); setAiReady(true); }); }, []);
  useEffect(() => {
    const on = () => setSection(fromHash());
    window.addEventListener("hashchange", on);
    return () => window.removeEventListener("hashchange", on);
  }, []);
  useEffect(() => { if (!toastMsg) return; const t = setTimeout(() => setToastMsg(null), 3600); return () => clearTimeout(t); }, [toastMsg]);

  const changeLang = (l: ContentLang) => {
    setLang(l);
    save("beat.lang", l);
    if (takesSource.startsWith("Saved run")) setTakesState(withNotes(savedTakes(l), brand));
  };

  const go = (s: Section) => { location.hash = s; setSection(s); window.scrollTo({ top: 0 }); };
  const goStage = (st: ExploreStage) => { setStage(st); go("explore"); };
  const startDemo = () => startTour((s) => go(s === "choose" ? "explore" : s), (s) => {
    if (s === "choose") setStage("type");
    if (s === "explore") { setKind("reel"); setStage("plan"); }
    if (s === "arrange") { setBrandId("moonsill"); setSelected("T05"); }
    if (s === "track") setBrandId("moonsill");
  });
  const pickKind = (k: MakeKind | "fix") => {
    if (k === "fix") { go("track"); return; }
    setKind(k); goStage("plan");
  };

  const toast = (msg: string, bad = false) => setToastMsg({ msg, bad });
  const setTakes = (fn: (t: Take[]) => Take[]) => setTakesState(fn);
  const setBrand = (b: Brand) => { const next = brands.map((x) => (x.id === b.id ? b : x)); setBrands(next); save("beat.brands", next); };

  const dropAt = retention.source.kind === "imported" ? steepestDrop(retention.points) ?? reel.reportedDropAt : reel.reportedDropAt;

  const importCsv = async (file: File) => {
    try {
      const points = parseRetentionCsv(await file.text());
      setRetention({ points, source: { kind: "imported", fileName: file.name } });
      toast(`Imported ${points.length} retention points from ${file.name}`);
    } catch (e) {
      toast(e instanceof Error ? e.message : "Could not read that file.", true);
    }
  };

  const [, bump] = useState(0);
  const aiLabel = !aiReady ? "AI: connecting…" : aiMode === "artifact" ? "AI: Claude" : aiMode === "proxy" ? `AI: ${currentEngine()?.label ?? "on"}` : "AI: saved run only";

  if (section === "welcome") {
    return <Welcome onStart={() => { try { localStorage.setItem("beat.welcomed", "1"); } catch { /* storage blocked */ } go("brief"); }} onTour={startDemo} />;
  }

  // The project path, shown as a numbered stepper in the header.
  const selTake = takes.find((t) => t.code === selected);
  const STEPS: { label: string; to: () => void }[] = [
    { label: "Brand", to: () => go("brief") },
    { label: "Type", to: () => goStage("type") },
    { label: "Idea", to: () => goStage("plan") },
    { label: "Angles", to: () => goStage("plan") },
    { label: "Checks", to: () => go("arrange") },
    { label: "Render", to: () => go("arrange") },
    { label: "Results", to: () => go("track") },
  ];
  const at = section === "brief" ? 0 : section === "explore" ? (stage === "type" ? 1 : fresh || takes.length ? 3 : 2)
    : section === "arrange" ? (selTake?.status === "rendered" ? 5 : 4) : section === "track" ? 6 : -1;
  const title = section === "brief" ? "Brand profile" : section === "explore" ? (stage === "type" ? "What do you want to make?" : <>Idea <span className="arrow">→</span> Angles</>)
    : section === "arrange" ? (at === 5 ? "Render" : "Board and checks") : section === "library" ? "Library" : "Results";
  const back = section === "explore" && stage === "plan" ? () => goStage("type") : at > 0 ? STEPS[at - 1].to : undefined;

  return (
    <div className="app">
      <aside className="side-nav" aria-label="Distro">
        <button type="button" className="brand-logo" title="Distro home" onClick={() => go("welcome")}>
          <img src="brand/distro-logo.png" alt="Distro" />
        </button>
        <nav className="nav-list" aria-label="Sections">
          {NAV.map((n) => (
            <button key={n.id} type="button" className="nav" aria-current={section === n.id ? "page" : undefined}
              onClick={() => (n.id === "explore" ? goStage(section === "explore" ? stage : takes.length ? "plan" : "type") : go(n.id))}>
              <n.icon />{n.name}
            </button>
          ))}
        </nav>
        <div className="nav-tools">
          <button type="button" className="tour-btn" onClick={startDemo}><Play />Demo tour</button>
          <select aria-label="Content language" value={lang} onChange={(e) => changeLang(e.target.value as ContentLang)}>
            <option value="en">Content: English</option>
            <option value="taglish">Content: Taglish</option>
          </select>
          {aiMode === "proxy" && aiEngines.length > 1 ? (
            <label className="ai-pill live"><i /><span className="sr">AI engine</span>
              <select aria-label="AI engine" value={currentEngine()?.id} onChange={(e) => { setEngine(e.target.value); bump((n) => n + 1); toast(`AI switched to ${currentEngine()?.label}`); }}>
                {aiEngines.map((e) => <option key={e.id} value={e.id}>AI: {e.label}</option>)}
              </select>
            </label>
          ) : (
            <span className={`ai-pill${aiMode !== "saved" ? " live" : ""}${!aiReady ? " connecting" : ""}`} title={aiMode === "saved" ? "Log in to Claude Code or Codex, or add an API key to .env.local" : undefined}><i />{aiLabel}</span>
          )}
        </div>
        <label className="studio">
          <span className="studio-av" style={{ background: brand.colors?.find(Boolean) ?? "var(--orange)" }} aria-hidden="true">{brand.name.charAt(0)}</span>
          <span className="studio-txt"><b>{brand.name} Studio</b><span>Switch brand</span></span>
          <select aria-label="Brand" value={brandId} onChange={(e) => setBrandId(e.target.value)}>
            {brands.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
          </select>
        </label>
      </aside>

      <div className="work">
        <header className="top">
          <div className="top-row">
            <p className="crumbs">Projects <span>/</span> {brand.name} — {short(idea.replace(new RegExp(`^${brand.name}:\\s*`, "i"), ""))}</p>
            {section === "track" && (
              <div className="top-acts">
                <input ref={fileRef} type="file" accept=".csv,.tsv,.txt" className="sr" aria-label="FB retention export"
                  onChange={(e) => { const f = e.target.files?.[0]; if (f) importCsv(f); e.target.value = ""; }} />
                {retention.source.kind === "imported" && (
                  <button type="button" className="ghost" onClick={() => setRetention({ points: reel.retention, source: reel.retentionSource })}>Use reported points</button>
                )}
                <button type="button" onClick={() => fileRef.current?.click()}><Upload />Import FB export</button>
              </div>
            )}
          </div>
          <div className="title-row">
            <h1 className="page-title">
              {back && <button type="button" className="back" aria-label="Back" onClick={back}><IcBack /></button>}
              {title}
            </h1>
            {at >= 0 && (
              <ol className="steps" aria-label="Project steps">
                {STEPS.map((s, i) => (
                  <li key={s.label} className={i < at ? "done" : i === at ? "now" : ""} aria-current={i === at ? "step" : undefined}>
                    <button type="button" onClick={s.to}><span className="n">{i < at ? <Check /> : i + 1}</span>{s.label}</button>
                  </li>
                ))}
              </ol>
            )}
          </div>
        </header>
        <main className="page">
          {brand.id !== reel.brandId && section === "track" ? (
            <div className="empty">No posted {brand.name} reels yet. Results opens a reel after you post it and import its FB retention export. For the demo, switch to Moonsill.</div>
          ) : section === "track" ? (
            <Analyze reel={reel} brand={brand} retention={retention.points} source={retention.source} dropAt={dropAt}
              aiMode={aiMode} lang={lang} takes={takes} onOpenTake={(c) => { setSelected(c); go("arrange"); }} toast={toast} />
          ) : section === "explore" ? (
            <Ideate brand={brand} aiMode={aiMode} lang={lang} takes={takes} takesSource={takesSource}
              stage={stage} kind={kind} idea={idea} setIdea={setIdea} onPick={pickKind}
              onTakes={(t, src) => { setTakesState(withNotes(t, brand)); setTakesSource(src); setFresh(true); setSelected(t[0]?.code ?? null); }}
              onOpenBoard={(code) => { if (code) setSelected(code); go("arrange"); }} />
          ) : section === "arrange" ? (
            <Direct aiMode={aiMode} lang={lang} brand={brand} takes={takes} setTakes={setTakes} selected={selected} setSelected={setSelected} toast={toast} />
          ) : section === "library" ? (
            <Library brand={brand} takes={takes} onOpenTake={(c) => { setSelected(c); go("arrange"); }} />
          ) : (
            <Brief brand={brand} aiMode={aiMode} onPick={pickKind} onChange={setBrand}
              onCreate={(b) => { const next = [...brands, b]; setBrands(next); save("beat.brands", next); setBrandId(b.id); toast(`Created ${b.name}. Create and the board now use its rules.`); }} />
          )}
        </main>
      </div>
      {toastMsg && <div className={`toast${toastMsg.bad ? " bad" : ""}`} role="status">{toastMsg.msg}</div>}
    </div>
  );
}
