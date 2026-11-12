import { useRef, useState } from "react";
import type { AiMode, Brand, ContentLang, Take } from "../types";
import { generateTakes, AiError, currentEngine, readLink, type LinkPreview } from "../lib/ai";
import { measurePacing, type Pacing } from "../lib/pacing";
import { lintHook } from "../lib/lint";
import { SAVED_IDEA, savedTakes } from "../data/saved-run";
import { Spark } from "./Icons";

type Props = {
  brand: Brand;
  aiMode: AiMode;
  lang: ContentLang;
  takes: Take[];
  takesSource: string;
  onTakes: (t: Take[], source: string) => void;
  onOpenBoard: () => void;
};

export function Ideate({ brand, aiMode, lang, takes, takesSource, onTakes, onOpenBoard }: Props) {
  const [idea, setIdea] = useState(SAVED_IDEA);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  // Style reference: a social link (public preview only), the user's own reference video, a note.
  const [link, setLink] = useState("");
  const [preview, setPreview] = useState<LinkPreview | null>(null);
  const [linkBusy, setLinkBusy] = useState(false);
  const [linkErr, setLinkErr] = useState<string | null>(null);
  const [pacing, setPacing] = useState<(Pacing & { file: string }) | null>(null);
  const [pacingBusy, setPacingBusy] = useState<number | null>(null);
  const [styleNote, setStyleNote] = useState("");
  const vidRef = useRef<HTMLInputElement>(null);

  const read = async () => {
    if (!link.trim()) return;
    setLinkBusy(true); setLinkErr(null); setPreview(null);
    try { setPreview(await readLink(link)); }
    catch (e) { setLinkErr(e instanceof AiError ? e.message : "Could not read that link."); }
    finally { setLinkBusy(false); }
  };

  const measure = async (file: File) => {
    setPacingBusy(0); setLinkErr(null);
    try { setPacing({ ...(await measurePacing(file, setPacingBusy)), file: file.name }); }
    catch (e) { setLinkErr(e instanceof Error ? e.message : "Could not read that video."); }
    finally { setPacingBusy(null); }
  };

  const style = (preview || pacing || styleNote.trim() || link.trim()) ? {
    site: preview?.site, url: preview?.url ?? (link.trim() || undefined), title: preview?.title || undefined,
    caption: preview?.caption || undefined, notes: styleNote.trim() || undefined,
    pacing: pacing ? { duration: pacing.duration, cuts: pacing.cuts, avgShot: pacing.avgShot, firstCut: pacing.firstCut } : undefined,
  } : undefined;

  const plan = async () => {
    setBusy(true);
    setErr(null);
    try {
      const out = await generateTakes(aiMode, { task: "takes", language: lang, brand, idea, style });
      onTakes(out.map((t, i) => ({ ...t, code: `T${String(i + 1).padStart(2, "0")}`, status: "hooks" })), `Written by ${currentEngine()?.label ?? "AI"} just now for “${idea}”`);
    } catch (e) {
      setErr(e instanceof AiError ? e.message : "AI request failed.");
    } finally {
      setBusy(false);
    }
  };

  const loadSaved = () => onTakes(savedTakes(lang), "Saved run, written 12 Nov");

  return (
    <>
      <section className="head">
        <div>
          <h1>One idea, ten takes</h1>
          <p className="meta">Each take is a different format, so the batch tests situations, not re-skins. The AI plans; you direct.</p>
          <p className="howto"><b>What to do:</b> type one idea, optionally paste a reel whose style you like, press <b>Plan 10 takes with AI</b>, then press <b>Arrange these on the board</b>.</p>
        </div>
      </section>
      <div className="ideate">
        <form className="panel" onSubmit={(e) => { e.preventDefault(); plan(); }}>
          <label className="field" htmlFor="idea">The idea
            <textarea id="idea" value={idea} onChange={(e) => setIdea(e.target.value)} rows={4} />
          </label>
          <p className="note">Uses the {brand.name} brief: paid features, approved claims, banned phrases and VO pace ({brand.voicePace} syl/s).</p>

          <fieldset className="style-ref">
            <legend>Style reference <span>optional</span></legend>
            <label className="field" htmlFor="ref-link">Instagram, Facebook, TikTok or YouTube link
              <span className="own-row">
                <input id="ref-link" type="text" inputMode="url" placeholder="https://www.instagram.com/reel/…" value={link}
                  onChange={(e) => { setLink(e.target.value); setPreview(null); }} onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); read(); } }} />
                <button type="button" onClick={read} disabled={linkBusy || !link.trim()}>{linkBusy ? <span className="spinner" /> : null}Read</button>
              </span>
            </label>
            {preview && (
              <div className="ref-card">
                <b>{preview.site}{preview.title ? ` · ${preview.title}` : ""}</b>
                {preview.found
                  ? <p>{preview.caption || "No caption on this post."}</p>
                  : <p>{preview.site} hides this post's details from apps, so the AI only sees the link. Add a note below on what you like about it.</p>}
              </div>
            )}
            <label className="field" htmlFor="ref-note">What you like about it
              <textarea id="ref-note" rows={2} placeholder="Fast cuts, a question in the first second, deadpan captions…" value={styleNote} onChange={(e) => setStyleNote(e.target.value)} />
            </label>
            <div className="own-row">
              <input ref={vidRef} type="file" accept="video/*" className="sr" aria-label="Reference video file"
                onChange={(e) => { const f = e.target.files?.[0]; if (f) measure(f); e.target.value = ""; }} />
              <button type="button" onClick={() => vidRef.current?.click()} disabled={pacingBusy != null}>
                {pacingBusy != null ? <><span className="spinner" />Measuring {Math.round(pacingBusy * 100)}%</> : "Measure pacing from a video file"}
              </button>
            </div>
            {pacing && <p className="note">{pacing.file}: {pacing.duration.toFixed(1)} s, {pacing.cuts} cuts, a new shot every {pacing.avgShot.toFixed(1)} s{pacing.firstCut != null ? `, first cut at ${pacing.firstCut.toFixed(1)} s` : ""}.</p>}
            {linkErr && <p className="err">{linkErr}</p>}
            <p className="note">BEAT reads only a post's public title and caption, and never downloads videos from these sites. Pacing is measured from a file you choose, on this computer.</p>
          </fieldset>
          <div className="acts">
            <button type="submit" className="pri" disabled={busy || aiMode === "saved" || !idea.trim()}
              title={aiMode === "saved" ? "Add ANTHROPIC_API_KEY to .env.local, or open the hosted page" : undefined}>
              {busy ? <span className="spinner" /> : <Spark />}{busy ? "AI is planning…" : "Plan 10 takes with AI"}
            </button>
            <button type="button" onClick={loadSaved}>Load saved run</button>
          </div>
          {aiMode === "saved" && <p className="note">No AI engine is connected in this view, so only the saved run is available.</p>}
          {err && <p className="err">{err}</p>}
        </form>

        <section aria-label="Takes">
          <div className="sec-bar">
            <span className="source">{takesSource}</span>
            <button type="button" onClick={onOpenBoard} disabled={!takes.length}>Arrange these on the board</button>
          </div>
          {takes.length === 0 ? (
            <div className="empty">No takes yet. Plan ten with AI, or load the saved run.</div>
          ) : (
            <div className="grid10">
              {takes.map((t) => {
                const lint = lintHook(t.hook, { pace: brand.voicePace, dropAt: null });
                return (
                  <article className="idea-card" key={t.code}>
                    <header><span>{t.code} · {t.format}</span><span>{t.beats.reduce((s, b) => s + b.seconds, 0)} s</span></header>
                    <p className="hook">“{t.hook}”</p>
                    <ol>{t.beats.map((b, i) => <li key={i}>{b.label} <span>· {b.seconds} s</span></li>)}</ol>
                    <footer>
                      <span className={`chip ${lint.landsAt <= 2.5 ? "good" : "bad"}`}>hook ≈ {lint.landsAt} s</span>
                      <span className="chip">{lint.lang}</span>
                      {t.claims.map((c) => <span className="chip" key={c}>{c}</span>)}
                    </footer>
                  </article>
                );
              })}
            </div>
          )}
        </section>
      </div>
    </>
  );
}
