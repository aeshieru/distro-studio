import { useEffect, useRef, useState } from "react";
import { codeLabel } from "../lib/codes";
import type { AiMode, Brand, ContentLang, Take } from "../types";
import { generateTakes, AiError, currentEngine, readLink, lookWithChrome, type LinkPreview, type LookResult } from "../lib/ai";
import { measurePacing, type Pacing } from "../lib/pacing";
import { FORMATS, SLIDE_FORMATS } from "../lib/prompts";
import { toSlideshow, savedSlideshows } from "../lib/slideshow";
import { Progress, useSteps } from "./Progress";
import { lintHook } from "../lib/lint";
import { blockingFailure, runChecks } from "../lib/checks";
import { savedTakes } from "../data/saved-run";
import { MakeChooser } from "./MakeChooser";
import { Check, IcArrow, IcBulb, IcLink, IcPencil, Spark, Undo } from "./Icons";

export type MakeKind = "reel" | "slideshow" | "recreate";

type Props = {
  brand: Brand;
  aiMode: AiMode;
  lang: ContentLang;
  takes: Take[];
  takesSource: string;
  stage: "type" | "plan";
  kind: MakeKind;
  idea: string;
  setIdea: (s: string) => void;
  onPick: (k: MakeKind | "fix") => void;
  onTakes: (t: Take[], source: string) => void;
  onOpenBoard: (code?: string) => void;
};

const KIND_LABEL: Record<MakeKind, string> = { reel: "Reels", slideshow: "Slideshows", recreate: "Recreate a style" };
const hostOf = (u: string) => { try { return new URL(u.trim()).hostname.replace(/^www\./, ""); } catch { return "that site"; } };

// How good an angle looks before anyone renders it: passes the brand rules, the hook lands
// fast, the runtime or slide count fits. Used to show the best three first.
function score(t: Take, brand: Brand) {
  let n = blockingFailure(runChecks(t, brand)) ? -100 : 0;
  if (t.kind === "slideshow") {
    const sl = t.slides ?? [];
    n += (sl.length >= 5 && sl.length <= 8 ? 5 : 0) + (sl.some((x) => x.kind === "app") && sl.some((x) => x.kind === "moment") ? 3 : 0);
    n += Math.max(0, 9 - t.hook.split(/\s+/).length);
  } else {
    const l = lintHook(t.hook, { pace: brand.voicePace, dropAt: null });
    const rt = t.beats.reduce((a, b) => a + b.seconds, 0);
    n += (l.landsAt <= 2.5 ? 10 : 0) - l.landsAt + (rt >= brand.targetSeconds[0] && rt <= brand.targetSeconds[1] ? 3 : 0) + (l.talksToYou ? 2 : 0) + (l.opensQuestion ? 1 : 0);
  }
  return n + t.claims.length * 0.5;
}

export function Ideate({ brand, aiMode, lang, takes, takesSource, stage, kind, idea, setIdea, onPick, onTakes, onOpenBoard }: Props) {
  const [count, setCount] = useState(kind === "reel" ? 10 : 5);
  const [editIdea, setEditIdea] = useState(false);
  const [slots, setSlots] = useState<{ format: string; take?: Omit<Take, "code" | "status">; failed?: boolean }[] | null>(null);
  const prog = useSteps();
  const lprog = useSteps();
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [picked, setPicked] = useState<Set<string>>(() => new Set());
  const [showAll, setShowAll] = useState(false);
  const [regen, setRegen] = useState<string | null>(null);
  // Style reference: a social link (public preview, then Claude in Chrome when the preview is hidden).
  const [link, setLink] = useState("");
  const [preview, setPreview] = useState<LinkPreview | null>(null);
  const [seen, setSeen] = useState<LookResult | null>(null);
  const [linkBusy, setLinkBusy] = useState(false);
  const [linkErr, setLinkErr] = useState<string | null>(null);
  const [pacing, setPacing] = useState<(Pacing & { file: string }) | null>(null);
  const [pacingBusy, setPacingBusy] = useState<number | null>(null);
  const [styleNote, setStyleNote] = useState("");
  const [captions, setCaptions] = useState<"balloon" | "bold" | "lower">("balloon");
  const vidRef = useRef<HTMLInputElement>(null);


  useEffect(() => { setCount(kind === "reel" ? 10 : 5); }, [kind]);

  // What gets made: a recreated style follows what Claude saw (a reel or a slideshow).
  const out: "reel" | "slideshow" = kind === "recreate" ? (seen?.type ?? "reel") : kind;
  const shown = takes.filter((t) => (out === "slideshow" ? t.kind === "slideshow" : t.kind !== "slideshow"));
  const ranked = [...shown].sort((a, b) => score(b, brand) - score(a, brand));
  const best = ranked.slice(0, 3).map((t) => t.code);
  const visible = showAll ? ranked : ranked.slice(0, 3);
  const bestKey = best.join(",");
  // The three best start selected; more angles are one click away.
  useEffect(() => { setPicked(new Set(bestKey ? bestKey.split(",") : [])); setShowAll(false); }, [bestKey]);
  const canAi = aiMode !== "saved";
  const engine = currentEngine()?.label ?? "The AI";

  const read = async () => {
    if (!link.trim()) return;
    setLinkBusy(true); setLinkErr(null); setPreview(null); setSeen(null);
    lprog.reset([{ id: "open", label: `Read the public preview on ${hostOf(link)}` }, ...(kind === "recreate" ? [{ id: "look", label: "Claude in Chrome looks at the post" }] : [])]);
    lprog.update("open", "now");
    try {
      const p = await readLink(link);
      setPreview(p);
      lprog.update("open", "done", p.found ? (p.caption ? `“${p.caption.slice(0, 80)}${p.caption.length > 80 ? "…" : ""}”` : "found the post") : `${p.site} hides this post from apps`);
      if (kind === "recreate" || !p.found) await look(p);
    } catch (e) {
      const m = e instanceof AiError ? e.message : "Could not read that link.";
      lprog.update("open", "fail", m); setLinkErr(m);
    } finally { setLinkBusy(false); }
  };

  // The plain fetch can't see most posts, so Claude opens it in Chrome and reads its structure.
  const look = async (p?: LinkPreview | null) => {
    if (!lprog.steps.some((s) => s.id === "look")) lprog.reset([...lprog.steps.map((s) => ({ id: s.id, label: s.label })), { id: "look", label: "Claude in Chrome looks at the post" }]);
    setTimeout(() => lprog.update("look", "now", "opens it in your Chrome, steps through every slide or a few moments, then closes the tab"), 0);
    setLinkBusy(true);
    try {
      const r = await lookWithChrome((p?.url ?? link).trim());
      setSeen(r);
      lprog.update("look", "done", `${r.type === "slideshow" ? `photo slideshow${r.slides ? `, ${r.slides} slides` : ""}` : `video reel${r.seconds ? `, about ${r.seconds} s` : ""}`} · ${r.structure.length} parts`);
    } catch (e) {
      const m = e instanceof AiError ? e.message : "Claude couldn't look at it in Chrome.";
      lprog.update("look", "fail", m); setLinkErr(m);
    } finally { setLinkBusy(false); }
  };

  const measure = async (file: File) => {
    setPacingBusy(0); setLinkErr(null);
    try { setPacing({ ...(await measurePacing(file, setPacingBusy)), file: file.name }); }
    catch (e) { setLinkErr(e instanceof Error ? e.message : "Could not read that video."); }
    finally { setPacingBusy(null); }
  };

  const style = (preview || seen || pacing || styleNote.trim() || link.trim()) ? {
    site: preview?.site, url: preview?.url ?? (link.trim() || undefined), title: preview?.title || undefined,
    caption: preview?.caption || undefined, notes: styleNote.trim() || undefined,
    pacing: pacing ? { duration: pacing.duration, cuts: pacing.cuts, avgShot: pacing.avgShot, firstCut: pacing.firstCut } : undefined,
    seen: seen ?? undefined,
  } : undefined;

  const plan = async () => {
    setBusy(true); setErr(null);
    const list = out === "slideshow" ? SLIDE_FORMATS : FORMATS;
    const formats = list.slice(0, count);
    setSlots(formats.map((format) => ({ format })));
    prog.reset([
      { id: "brief", label: `Read the ${brand.name} profile` },
      ...(style ? [{ id: "style", label: kind === "recreate" ? "Follow the structure Claude saw" : "Apply your style reference" }] : []),
      { id: "write", label: `${engine} writes ${count} ${out === "slideshow" ? "slideshows" : "angles"}` },
      { id: "check", label: out === "slideshow" ? "Check captions and claims" : "Time the hooks and check claims" },
    ]);
    prog.update("brief", "done", `${brand.paidFeatures.filter(Boolean).length} paid features, ${brand.approvedClaims.filter(Boolean).length} approved claims`);
    if (style) prog.update("style", "done", [seen && `${seen.type}, ${seen.structure.length} parts`, style.site, style.pacing && `${style.pacing.cuts} cuts measured`, style.notes && "your notes"].filter(Boolean).join(" · "));
    prog.update("write", "now", `0 of ${count} ready`);

    // Two formats per request, three requests at a time: cards fill in as each returns.
    const batches: number[][] = [];
    for (let i = 0; i < formats.length; i += 2) batches.push([i, i + 1].filter((k) => k < formats.length));
    const results: (Omit<Take, "code" | "status"> | null)[] = formats.map(() => null);
    let ready = 0, failures = 0;
    const runBatch = async (idx: number[]) => {
      try {
        const res = await generateTakes(aiMode, { task: "takes", kind: out, language: lang, brand, idea, style, formats: idx.map((k) => formats[k]) });
        idx.forEach((k, j) => {
          const r = res[j] as unknown as Parameters<typeof toSlideshow>[0] & Omit<Take, "code" | "status">;
          results[k] = !r ? null : out === "slideshow" ? (r.slides?.length ? toSlideshow(r, formats[k]) : null) : { ...r, format: formats[k], kind: "reel" };
        });
      } catch { failures += idx.length; }
      ready += idx.length;
      setSlots((cur) => cur && cur.map((sl, k) => (idx.includes(k) ? { ...sl, take: results[k] ?? undefined, failed: !results[k] } : sl)));
      prog.update("write", "now", `${ready - failures} of ${count} ready${failures ? ` · ${failures} failed` : ""}`);
    };
    const queue = [...batches];
    await Promise.all(Array.from({ length: Math.min(3, queue.length) }, async () => { while (queue.length) await runBatch(queue.shift()!); }));

    const got = results.filter(Boolean) as Omit<Take, "code" | "status">[];
    prog.update("write", got.length ? "done" : "fail", `${got.length} of ${count} written${failures ? `, ${failures} failed` : ""}`);
    if (!got.length) {
      setErr("The AI didn't return anything. Try again, switch the AI engine, or load the saved run.");
      setBusy(false); return;
    }
    prog.update("check", "now");
    // A recreated style carries into the render: its caption look and cut rhythm, as Claude saw them.
    const seenCut = seen ? Number((seen.pacing.match(/(\d+(?:\.\d+)?)\s*(?:-|–|to)?\s*(?:\d+(?:\.\d+)?)?\s*s(?:ec|econds?)?\b/i) ?? [])[1]) || undefined : undefined;
    const seenCaps: typeof captions | undefined = seen ? (/lower|bar|banner|subtitle/i.test(seen.captions) ? "lower" : /bubble|balloon|speech/i.test(seen.captions) ? "balloon" : "bold") : undefined;
    const look = out === "reel" ? { captions: seenCaps ?? captions, cutEvery: pacing ? Math.max(0.6, pacing.avgShot) : seenCut ? Math.max(0.6, seenCut) : undefined, ref: preview?.url ?? (link.trim() || undefined) } : undefined;
    const prefix = out === "slideshow" ? "S" : "T";
    const made = got.map((t, i) => ({ ...t, look, code: `${prefix}${String(i + 1).padStart(2, "0")}`, status: "hooks" as const }));
    const late = out === "reel" ? made.filter((t) => lintHook(t.hook, { pace: brand.voicePace, dropAt: null }).landsAt > 2.5).length : 0;
    prog.update("check", "done", out === "slideshow" ? `${made.reduce((n, t) => n + (t.slides?.length ?? 0), 0)} slides across ${made.length} posts` : late ? `${late} hook${late > 1 ? "s" : ""} run past 2.5 s` : "Every hook lands within 2.5 s");
    onTakes(made, `Written by ${engine} just now for “${idea}”`);
    setSlots(null); setBusy(false);
  };

  // Rewrite one angle in the same format; it keeps its code and place.
  const regenOne = async (t: Take) => {
    if (!canAi) return;
    setRegen(t.code); setErr(null);
    try {
      const res = await generateTakes(aiMode, { task: "takes", kind: out, language: lang, brand, idea: `${idea} (a fresh angle, different from: “${t.hook}”)`, style, formats: [t.format] });
      const r = res[0] as unknown as Parameters<typeof toSlideshow>[0] & Omit<Take, "code" | "status">;
      if (!r) throw new Error("empty");
      const base = out === "slideshow" ? toSlideshow(r, t.format) : { ...r, format: t.format, kind: "reel" as const, look: t.look };
      onTakes(takes.map((x) => (x.code === t.code ? { ...base, code: t.code, status: "hooks" } : x)), takesSource);
    } catch {
      setErr(`${codeLabel(t.code)} didn't come back. Try again or switch the AI engine.`);
    } finally { setRegen(null); }
  };

  const loadSaved = () => onTakes(out === "slideshow" ? savedSlideshows(lang).slice(0, count) : savedTakes(lang).slice(0, count), "Saved run, written 12 Nov");
  const toggle = (c: string) => setPicked((p) => { const n = new Set(p); if (n.has(c)) n.delete(c); else n.add(c); return n; });
  const sendCount = shown.filter((t) => picked.has(t.code)).length;
  const send = () => {
    const keep = takes.filter((t) => !shown.includes(t) || picked.has(t.code));
    if (keep.length !== takes.length) onTakes(keep, takesSource);
    onOpenBoard(shown.find((t) => picked.has(t.code))?.code);
  };

  if (stage === "type") {
    return (
      <section className="chooser">
        <p className="lead">Your {brand.name} profile is ready. Pick what to make; every option follows its rules.</p>
        <MakeChooser onPick={onPick} />
      </section>
    );
  }

  const recreateReady = kind !== "recreate" || Boolean(seen);
  return (
    <div className="create">
      <div className="kind-tabs" role="tablist" aria-label="What to make">
        {(["reel", "slideshow", "recreate"] as MakeKind[]).map((k) => (
          <button key={k} type="button" role="tab" aria-selected={kind === k} className={kind === k ? "on" : ""} onClick={() => onPick(k)}>{KIND_LABEL[k]}</button>
        ))}
        <button type="button" role="tab" aria-selected={false} onClick={() => onPick("fix")}>Fix a posted reel</button>
      </div>

      {kind === "recreate" && (
        <section className="card-panel recreate" data-tour="style">
          <div className="cp-head"><h2>Style to recreate</h2><span className="lbl">a reel or photo post you like</span></div>
          <form className="own-row" onSubmit={(e) => { e.preventDefault(); read(); }}>
            <span className="in-ico"><IcLink /></span>
            <input type="text" inputMode="url" aria-label="Instagram, Facebook, TikTok or YouTube link" placeholder="https://www.tiktok.com/@…/photo/…" value={link}
              onChange={(e) => { setLink(e.target.value); setPreview(null); setSeen(null); }} />
            <button type="submit" className="pri" disabled={linkBusy || !link.trim()}>{linkBusy ? <span className="spinner" /> : <Spark />}Look at it</button>
          </form>
          {lprog.steps.length > 0 && (linkBusy || lprog.steps.some((s) => s.state !== "todo")) && <Progress steps={lprog.steps} />}
          {preview && !seen && !linkBusy && (
            <div className="seen-actions">
              <button type="button" onClick={() => look(preview)}>Have Claude look at it in Chrome</button>
            </div>
          )}
          {seen && <SeenCard seen={seen} host={hostOf(link)} />}
          {linkErr && <p className="err">{linkErr}</p>}
          <p className="fine">Distro borrows the structure (how many slides, what each one does, caption style, pacing), never the post's content. It never downloads videos.</p>
        </section>
      )}

      <section className="idea-bar" data-tour="idea">
        <span className="idea-ico"><IcBulb /></span>
        <div className="idea-body">
          <span className="lbl">Your idea</span>
          {editIdea
            ? <textarea autoFocus rows={2} aria-label="Your idea" value={idea} onChange={(e) => setIdea(e.target.value)} onBlur={() => setEditIdea(false)} />
            : <p onClick={() => setEditIdea(true)}>{idea || <span className="muted">One sentence: what should these be about?</span>}</p>}
        </div>
        <button type="button" className="icon-btn" aria-label="Edit the idea" onClick={() => setEditIdea((v) => !v)}><IcPencil /></button>
        <div className="idea-acts" data-tour="plan">
          <div className="seg-pill" role="radiogroup" aria-label={`How many ${out === "slideshow" ? "slideshows" : "angles"}`}>
            {(out === "slideshow" ? [3, 5, 8] : [3, 5, 8, 10]).map((n) => (
              <button key={n} type="button" role="radio" aria-checked={count === n} className={count === n ? "on" : ""} onClick={() => setCount(n)}>{n}</button>
            ))}
          </div>
          <button type="button" className="pri" onClick={plan} disabled={busy || !canAi || !idea.trim() || !recreateReady}
            title={!canAi ? "Log in to Claude Code or Codex, or add an API key to .env.local" : !recreateReady ? "Look at the post first" : undefined}>
            {busy ? <span className="spinner" /> : <Spark />}{busy ? "Writing…" : out === "slideshow" ? "Generate slideshows" : "Generate angles"}
          </button>
        </div>
      </section>

      {kind !== "recreate" && (
        <details className="card-panel ref-details" data-tour="style">
          <summary><b>Add a style reference</b> <span className="lbl">optional: a post you like, what you like about it{out === "reel" ? ", its pacing" : ""}</span></summary>
          <div className="ref-grid">
            <label className="field" htmlFor="ref-link">Instagram, Facebook, TikTok or YouTube link
              <span className="own-row">
                <input id="ref-link" type="text" inputMode="url" placeholder="https://www.instagram.com/reel/…" value={link}
                  onChange={(e) => { setLink(e.target.value); setPreview(null); setSeen(null); }} onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); read(); } }} />
                <button type="button" onClick={read} disabled={linkBusy || !link.trim()}>{linkBusy ? <span className="spinner" /> : null}Read</button>
              </span>
            </label>
            <label className="field" htmlFor="ref-note">What you like about it
              <textarea id="ref-note" rows={2} placeholder="Fast cuts, a question in the first second, deadpan captions…" value={styleNote} onChange={(e) => setStyleNote(e.target.value)} />
            </label>
          </div>
          {lprog.steps.length > 0 && (linkBusy || lprog.steps.some((s) => s.state !== "todo")) && <Progress steps={lprog.steps} />}
          {preview?.found && <div className="ref-card"><b>{preview.site}{preview.title ? ` · ${preview.title}` : ""}</b><p>{preview.caption || "No caption on this post."}</p></div>}
          {seen && <SeenCard seen={seen} host={hostOf(link)} />}
          {out === "reel" && (
            <div className="ref-row">
              <input ref={vidRef} type="file" accept="video/*" className="sr" aria-label="Reference video file"
                onChange={(e) => { const f = e.target.files?.[0]; if (f) measure(f); e.target.value = ""; }} />
              <button type="button" onClick={() => vidRef.current?.click()} disabled={pacingBusy != null}>
                {pacingBusy != null ? <><span className="spinner" />Measuring {Math.round(pacingBusy * 100)}%</> : "Measure pacing from a video file"}
              </button>
              <span className="lbl">Caption look</span>
              <div className="seg-pill" role="radiogroup" aria-label="Caption look">
                {([["balloon", "Balloon"], ["bold", "Bold words"], ["lower", "Lower third"]] as const).map(([id, l]) => (
                  <button key={id} type="button" role="radio" aria-checked={captions === id} className={captions === id ? "on" : ""} onClick={() => setCaptions(id)}>{l}</button>
                ))}
              </div>
            </div>
          )}
          {pacing && <p className="note">{pacing.file}: {pacing.duration.toFixed(1)} s, {pacing.cuts} cuts, a new shot every {pacing.avgShot.toFixed(1)} s{pacing.firstCut != null ? `, first cut at ${pacing.firstCut.toFixed(1)} s` : ""}.</p>}
          {linkErr && <p className="err">{linkErr}</p>}
        </details>
      )}

      {busy && <Progress steps={prog.steps} title={`Writing ${count} ${out === "slideshow" ? "slideshows" : "angles"}`} />}
      {!canAi && <p className="note">No AI engine is connected in this view, so only the saved run is available.</p>}
      {err && <p className="err">{err}</p>}

      <section className="angles" aria-label="Angle ideas" data-tour="takes">
        <div className="sec-bar">
          <div>
            <h2>{slots ? (out === "slideshow" ? "Writing slideshows" : "Writing angles") : `Best ${Math.min(3, shown.length)} ${out === "slideshow" ? "slideshows" : "angles"}`} <span className="count-n">({slots ? slots.length : `${shown.length} written`})</span></h2>
            <span className="source">{shown.length ? takesSource : "Nothing yet"}</span>
          </div>
          <div className="acts-row">
            <button type="button" className="ghost" onClick={loadSaved}>Load saved run</button>
            {shown.length > 0 && <button type="button" onClick={plan} disabled={busy || !canAi || !recreateReady}><Undo />Regenerate all</button>}
            <button type="button" className="pri" onClick={send} disabled={!sendCount || busy}>Send {sendCount || ""} to the board <IcArrow /></button>
          </div>
        </div>
        {slots ? (
          <div className="angle-grid">
            {slots.map((sl, k) => sl.take ? (
              <AngleCard key={k} t={{ ...sl.take, code: `${out === "slideshow" ? "S" : "T"}${String(k + 1).padStart(2, "0")}`, status: "hooks" }} brand={brand} fresh />
            ) : (
              <article className={`angle skel${sl.failed ? " failed" : ""}`} key={k} aria-busy={!sl.failed}>
                <header><span className="box" /><b>{sl.format}</b></header>
                <span className="skel-state">{sl.failed ? "didn't come back" : "writing…"}</span>
                <div className="skel-line big" /><div className="skel-line short" />
              </article>
            ))}
          </div>
        ) : shown.length === 0 ? (
          <div className="empty">{out === "slideshow" ? "No slideshows yet. Generate them, or load the saved run." : "No angles yet. Generate them, or load the saved run."}</div>
        ) : (
          <>
            <div className="angle-grid">
              {visible.map((t) => <AngleCard key={t.code} t={t} brand={brand} on={picked.has(t.code)} onToggle={() => toggle(t.code)}
                top={best.indexOf(t.code)} busy={regen === t.code} onRegen={canAi ? () => regenOne(t) : undefined} />)}
            </div>
            {shown.length > 3 && (
              <button type="button" className="more-btn" onClick={() => setShowAll((v) => !v)}>
                {showAll ? "Show only the best 3" : `Show ${shown.length - 3} more ${out === "slideshow" ? "slideshows" : "angles"}`}
              </button>
            )}
          </>
        )}
      </section>
    </div>
  );
}

function SeenCard({ seen, host }: { seen: LookResult; host: string }) {
  return (
    <div className="seen">
      <div className="seen-head">
        <b>Claude saw a {seen.type === "slideshow" ? `photo slideshow${seen.slides ? ` · ${seen.slides} slides` : ""}` : `video reel${seen.seconds ? ` · about ${seen.seconds} s` : ""}`}</b>
        <span className="lbl">on {host}</span>
      </div>
      <p>{seen.summary}</p>
      <ol className="seen-structure">{seen.structure.map((s, i) => <li key={i}><span>{i + 1}</span>{s}</li>)}</ol>
      <dl className="seen-facts">
        <div><dt>Captions</dt><dd>{seen.captions}</dd></div>
        <div><dt>Pacing</dt><dd>{seen.pacing}</dd></div>
        <div><dt>Hook</dt><dd>{seen.hook}</dd></div>
      </dl>
    </div>
  );
}

function AngleCard({ t, brand, on, onToggle, fresh, top = -1, busy, onRegen }: { t: Take; brand: Brand; on?: boolean; onToggle?: () => void; fresh?: boolean; top?: number; busy?: boolean; onRegen?: () => void }) {
  const slides = t.kind === "slideshow";
  const lint = slides ? null : lintHook(t.hook, { pace: brand.voicePace, dropAt: null });
  const runtime = t.beats.reduce((s, b) => s + b.seconds, 0);
  return (
    <article className={`angle${on ? " on" : ""}${fresh ? " fresh" : ""}${busy ? " busy" : ""}`} onClick={onToggle} role={onToggle ? "checkbox" : undefined} aria-checked={onToggle ? on : undefined}
      tabIndex={onToggle ? 0 : undefined} onKeyDown={(e) => { if (onToggle && (e.key === " " || e.key === "Enter")) { e.preventDefault(); onToggle(); } }}>
      <header>
        <span className={`box${on ? " on" : ""}`} aria-hidden="true">{on && <Check />}</span><b>{t.format}</b>
        {top >= 0 && <span className="best">#{top + 1} best</span>}
        <span className="code">{codeLabel(t.code)}</span>
        {onRegen && <button type="button" className="regen" aria-label={`Regenerate ${codeLabel(t.code)}`} title="Write a fresh angle in this format" disabled={busy}
          onClick={(e) => { e.stopPropagation(); onRegen(); }}>{busy ? <span className="spinner" /> : <Undo />}</button>}
      </header>
      <p className="hook">“{t.hook}”</p>
      {slides ? (
        <ol className="mini-slides" aria-label={`${t.slides?.length} slides`}>
          {t.slides?.slice(0, 4).map((s, i) => <li key={i} className={s.kind}><span>{s.kind === "app" ? "app" : "photo"}</span>{s.caption}</li>)}
          {(t.slides?.length ?? 0) > 4 && <li className="more">+{(t.slides?.length ?? 0) - 4} more</li>}
        </ol>
      ) : (
        <p className="beats-line">{t.beats.map((b) => b.label).join(" → ")}</p>
      )}
      <footer>
        {slides ? <span className="chip">{t.slides?.length} slides</span> : <span className={`chip ${lint!.landsAt <= 2.5 ? "good" : "bad"}`}>hook ≈ {lint!.landsAt} s</span>}
        {!slides && <span className="chip">{runtime} s</span>}
        {on && <span className="chip sel">Selected</span>}
      </footer>
    </article>
  );
}
