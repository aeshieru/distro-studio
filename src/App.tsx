import { useEffect, useRef, useState } from "react";
import type { AiMode, Brand, ContentLang, RetentionPoint, RetentionSource, Take } from "./types";
import { BRANDS } from "./data/brands";
import { WHATIF_REEL } from "./data/reel";
import { savedTakes } from "./data/saved-run";
import { aiEngines, currentEngine, detectAiMode, setEngine } from "./lib/ai";
import { parseRetentionCsv, steepestDrop } from "./lib/retention";
import { runChecks, blockingFailure } from "./lib/checks";
import { Analyze } from "./components/Analyze";
import { Ideate } from "./components/Ideate";
import { Direct } from "./components/Direct";
import { Brief } from "./components/Brief";
import { Upload } from "./components/Icons";

// BEAT: Brief · Explore · Arrange · Track.
type Section = "brief" | "explore" | "arrange" | "track";
const SECTIONS: { id: Section; letter: string; name: string; hint: string }[] = [
  { id: "brief", letter: "B", name: "Brief", hint: "Your app's rules: what's paid, what you may claim" },
  { id: "explore", letter: "E", name: "Explore", hint: "Turn one idea into ten takes" },
  { id: "arrange", letter: "A", name: "Arrange", hint: "Move takes through brand checks" },
  { id: "track", letter: "T", name: "Track", hint: "See where viewers left, fix the hook, render" },
];

const fromHash = (): Section => {
  const h = location.hash.replace("#", "");
  return (SECTIONS.some((s) => s.id === h) ? h : "track") as Section;
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

export default function App() {
  const [section, setSection] = useState<Section>(fromHash);
  const [brands, setBrands] = useState<Brand[]>(() => load("beat.brands", BRANDS));
  const [brandId, setBrandId] = useState("moonsill");
  const brand = brands.find((b) => b.id === brandId) ?? brands[0];
  const reel = WHATIF_REEL;

  const [aiMode, setAiMode] = useState<AiMode>("saved");
  const [lang, setLang] = useState<ContentLang>(() => load("beat.lang", "en" as ContentLang));
  const [takes, setTakesState] = useState<Take[]>(() => withNotes(savedTakes(load("beat.lang", "en" as ContentLang)), BRANDS[0]));
  const [takesSource, setTakesSource] = useState("Saved run, written 12 Nov");
  const [selected, setSelected] = useState<string | null>("T05");
  const [retention, setRetention] = useState<{ points: RetentionPoint[]; source: RetentionSource }>(
    { points: reel.retention, source: reel.retentionSource });
  const [toastMsg, setToastMsg] = useState<{ msg: string; bad: boolean } | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => { detectAiMode().then(setAiMode); }, []);
  useEffect(() => {
    const on = () => setSection(fromHash());
    window.addEventListener("hashchange", on);
    return () => window.removeEventListener("hashchange", on);
  }, []);
  useEffect(() => { if (!toastMsg) return; const t = setTimeout(() => setToastMsg(null), 3600); return () => clearTimeout(t); }, [toastMsg]);

  const changeLang = (l: ContentLang) => {
    setLang(l);
    save("beat.lang", l);
    // Only swap takes that came from a saved run; keep live Claude output as it is.
    if (takesSource.startsWith("Saved run")) setTakesState(withNotes(savedTakes(l), brand));
  };

  const go = (s: Section) => { location.hash = s; setSection(s); window.scrollTo({ top: 0 }); };
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
  const aiLabel = aiMode === "artifact" ? "AI: Claude" : aiMode === "proxy" ? `AI: ${currentEngine()?.label ?? "on"}` : "AI: saved run only";

  return (
    <div className="app">
      <nav className="rail" aria-label="Sections">
        <div className="logo" title="Brief · Explore · Arrange · Track">BEAT</div>
        {SECTIONS.map((s) => (
          <button key={s.id} type="button" className="nav" aria-current={section === s.id ? "page" : undefined} title={s.hint} onClick={() => go(s.id)}>
            <b>{s.letter}</b>{s.name}
          </button>
        ))}
      </nav>
      <div style={{ minWidth: 0 }}>
        <header className="top">
          <div className="crumb">
            <select aria-label="Brand" value={brandId} onChange={(e) => setBrandId(e.target.value)}>
              {brands.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
            </select>
            &nbsp;&nbsp;/&nbsp; {SECTIONS.find((s) => s.id === section)!.name}
            {section === "track" && <> &nbsp;/&nbsp; <strong>{reel.title}</strong></>}
          </div>
          <div className="sp" />
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
            <span className={`ai-pill${aiMode !== "saved" ? " live" : ""}`} title={aiMode === "saved" ? "Log in to Claude Code or Codex, or add an API key to .env.local" : undefined}><i />{aiLabel}</span>
          )}
          {section === "track" && (
            <>
              <input ref={fileRef} type="file" accept=".csv,.tsv,.txt" className="sr" aria-label="FB retention export"
                onChange={(e) => { const f = e.target.files?.[0]; if (f) importCsv(f); e.target.value = ""; }} />
              {retention.source.kind === "imported" && (
                <button type="button" className="gh" onClick={() => setRetention({ points: reel.retention, source: reel.retentionSource })}>Use reported points</button>
              )}
              <button type="button" onClick={() => fileRef.current?.click()}><Upload />Import FB export</button>
            </>
          )}
        </header>
        <main className="page">
          {brand.id !== reel.brandId && section === "track" ? (
            <div className="empty">No posted {brand.name} reels yet. Track opens a reel after you post it and import its FB retention export. For the demo, switch to Moonsill.</div>
          ) : section === "track" ? (
            <Analyze reel={reel} brand={brand} retention={retention.points} source={retention.source} dropAt={dropAt}
              aiMode={aiMode} lang={lang} takes={takes} onOpenTake={(c) => { setSelected(c); go("arrange"); }} toast={toast} />
          ) : section === "explore" ? (
            <Ideate brand={brand} aiMode={aiMode} lang={lang} takes={takes} takesSource={takesSource}
              onTakes={(t, src) => { setTakesState(withNotes(t, brand)); setTakesSource(src); setSelected(t[0]?.code ?? null); }}
              onOpenBoard={() => go("arrange")} />
          ) : section === "arrange" ? (
            <Direct brand={brand} takes={takes} setTakes={setTakes} selected={selected} setSelected={setSelected} toast={toast} />
          ) : (
            <Brief brand={brand} aiMode={aiMode} onChange={setBrand} onCreate={(b) => { const next = [...brands, b]; setBrands(next); save("beat.brands", next); setBrandId(b.id); toast(`Created ${b.name}. Explore and Arrange now use its rules.`); }} />
          )}
        </main>
      </div>
      {toastMsg && <div className={`toast${toastMsg.bad ? " bad" : ""}`} role="status">{toastMsg.msg}</div>}
    </div>
  );
}
