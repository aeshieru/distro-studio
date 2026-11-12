import { useEffect, useRef, useState } from "react";
import { flushSync } from "react-dom";
import { codeLabel } from "../lib/codes";
import type { AiMode, Brand, ContentLang, Take, TakeStatus } from "../types";
import { blockingFailure, runChecks, type CheckResult } from "../lib/checks";
import { lintHook } from "../lib/lint";
import { render3DDraft, renderAvailable, renderDraftCut, renderExplainerDraft, productionPack } from "../lib/render";
import { currentEngine, fixTake, generateLines } from "../lib/ai";
import { FOOTAGE } from "../data/footage";
import { Storyboard } from "./Storyboard";
import { PostDialog } from "./PostDialog";
import { renderSlides, slidesZip } from "../lib/slides";
import { Progress, useSteps } from "./Progress";
import { IcDown, Pause, Play, Spark, StateIcon, Undo } from "./Icons";
import { label } from "./Analyze";

const LANES: { id: TakeStatus; title: string; hint: string }[] = [
  { id: "hooks", title: "Hooks", hint: "pick the opener" },
  { id: "script", title: "Script", hint: "beats and claims" },
  { id: "checks", title: "Checks", hint: "brand rules run here" },
  { id: "rendered", title: "Ready to render", hint: "checks passed" },
];

const REMAKE_NOTES = ["Shorter hook", "Plainer words", "Funnier", "Logo later", "Different setting"];

type Props = {
  aiMode: AiMode;
  lang: ContentLang;
  brand: Brand;
  takes: Take[];
  setTakes: (fn: (t: Take[]) => Take[]) => void;
  selected: string | null;
  setSelected: (c: string | null) => void;
  toast: (msg: string, bad?: boolean) => void;
};

export function Direct({ aiMode, lang, brand, takes, setTakes, selected, setSelected, toast }: Props) {
  const [dragging, setDragging] = useState<string | null>(null);
  const [over, setOver] = useState<TakeStatus | null>(null);
  // Optimistic move: the card lands where it was dropped and runs its checks there, one by one.
  const [checking, setChecking] = useState<{ code: string; step: number; total: number; label: string; failed?: boolean } | null>(null);
  const sel = takes.find((t) => t.code === selected) ?? null;
  const detailRef = useRef<HTMLElement>(null);
  const [renderInfo, setRenderInfo] = useState<{ ready: boolean; voice: string | null } | null>(null);
  const [stage, setStage] = useState<string | null>(null);
  const prog = useSteps();
  const [renderErr, setRenderErr] = useState<string | null>(null);
  const fprog = useSteps();
  const [fixing, setFixing] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
  const [source, setSource] = useState<"footage" | "3d" | "motion">(FOOTAGE[brand.id] ? "footage" : "3d");
  // A take that recreates someone's style renders as motion graphics in that reel's editorial look.
  useEffect(() => { if (sel?.look?.ref) setSource("motion"); }, [sel?.code, sel?.look?.ref]);
  // Rendered slide files, kept for the zip download.
  const slideFiles = useRef<Record<string, { name: string; blob: Blob }[]>>({});
  const [posting, setPosting] = useState(false);
  useEffect(() => { renderAvailable().then(setRenderInfo); }, []);

  const makeAnimatic = async () => {
    if (!sel) return;
    setRenderErr(null);
    try {
      setStage("working");
      const withVoice = Boolean(renderInfo?.voice);
      prog.reset(source === "motion" ? [
        { id: "script", label: "Write the voice-over script" },
        ...(withVoice ? [{ id: "voice", label: `Record each line (${renderInfo?.voice})` }] : []),
        { id: "build", label: "Lay out the title, sections and recap" },
        { id: "record", label: "Animate and record the motion graphics" },
        { id: "cut", label: "Add the voice-over and export the MP4" },
      ] : source === "3d" ? [
        { id: "script", label: "Write the voice-over script" },
        ...(withVoice ? [{ id: "voice", label: `Record each line (${renderInfo?.voice})` }] : []),
        { id: "build", label: "Build a 3D set for each beat" },
        { id: "record", label: "Play and record the scene" },
        { id: "cut", label: "Add the voice-over and export the MP4" },
      ] : [
        { id: "script", label: "Write the voice-over script" },
        ...(withVoice ? [{ id: "voice", label: `Record each line (${renderInfo?.voice})` }] : []),
        { id: "match", label: "Match each beat to your footage" },
        { id: "frames", label: "Draw captions and frames" },
        { id: "cut", label: "Cut and mix the video" },
      ]);
      let lines: string[] = [];
      prog.update("script", "now", aiMode !== "saved" ? "one line per beat, timed to the voice's pace" : undefined);
      if (aiMode !== "saved") lines = await generateLines(aiMode, { task: "lines", language: lang, brand, take: sel }).catch(() => []);
      prog.update("script", "done", lines.length ? lines.map((l, i) => `${i + 1}. ${l}`).join("  ") : "Using the hook and beat notes (no AI engine connected)");
      const out = source === "motion"
        ? await renderExplainerDraft({ take: sel, brandName: brand.name, brandId: brand.id, color: brand.colors?.find((c) => /^#[0-9a-f]{6}$/i.test(c.trim()))?.trim() ?? "#FF5A1F", cta: brand.cta, lines, withVoice, onStep: (id, state, detail) => prog.update(id, state, detail) })
        : source === "3d"
        ? await render3DDraft({ take: sel, brandName: brand.name, cta: brand.cta, lines, withVoice, look: sel.look ?? { captions: "balloon" }, onStep: (id, state, detail) => prog.update(id, state, detail) })
        : await renderDraftCut({
          take: sel, brandName: brand.name, cta: brand.cta, lines, library: FOOTAGE[brand.id], withVoice,
          onStep: (id, state, detail) => prog.update(id, state, detail),
        });
      setTakes((all) => all.map((t) => (t.code === sel.code ? { ...t, animatic: out, note: "draft cut rendered" } : t)));
      toast(`${codeLabel(sel.code)} draft cut rendered`);
    } catch (e) {
      const m = e instanceof Error ? e.message : "The draft cut failed.";
      prog.failNow(m.length > 90 ? "failed, see the note below" : m);
      setRenderErr(m);
    } finally {
      setStage(null);
    }
  };

  const makeSlides = async () => {
    if (!sel?.slides?.length) return;
    setRenderErr(null); setStage("working");
    prog.reset([{ id: "pics", label: "Pick a picture for each slide" }, { id: "draw", label: "Draw the captions and stickers" }, { id: "save", label: "Save 1080×1920 images" }]);
    prog.update("pics", "now", `${sel.slides.filter((x) => x.kind === "moment").length} moments from your footage, ${sel.slides.filter((x) => x.kind === "app").length} app screens`);
    try {
      const files = await renderSlides({ slides: sel.slides, brand, format: "jpeg", onStep: (done, total, l) => {
        if (done > 0) prog.update("pics", "done");
        prog.update("draw", done >= total ? "done" : "now", `${done} of ${total} · ${l}`);
      } });
      prog.update("pics", "done"); prog.update("draw", "done", `${files.length} slides`);
      prog.update("save", "done", `${files.length} JPGs, ready for TikTok and Instagram photo mode`);
      slideFiles.current[sel.code] = files.map((f) => ({ name: f.name, blob: f.blob }));
      setTakes((all) => all.map((t) => (t.code === sel.code ? { ...t, slideset: files.map((f) => ({ name: f.name, url: f.url })), note: "slides rendered" } : t)));
      toast(`${codeLabel(sel.code)}: ${files.length} slides rendered`);
    } catch (e) {
      prog.failNow("failed");
      setRenderErr(e instanceof Error ? e.message : "The slides failed.");
    } finally { setStage(null); }
  };

  const downloadSlides = async () => {
    if (!sel) return;
    const files = slideFiles.current[sel.code];
    if (!files?.length) return;
    const zip = await slidesZip(files);
    const a = document.createElement("a");
    a.href = URL.createObjectURL(zip);
    a.download = `${brand.name.replace(/\W+/g, "-")}-${sel.code}-slides.zip`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  };

  const downloadPack = () => {
    if (!sel) return;
    const md = productionPack(sel, brand, runChecks(sel, brand));
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([md], { type: "text/markdown" }));
    a.download = `${brand.name.replace(/\W+/g, "-")}-${sel.code}-production-pack.md`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  };

  const move = (code: string, to: TakeStatus, override?: Take, quiet = false) => {
    const take = override ?? takes.find((t) => t.code === code);
    if (!take || (!override && take.status === to)) return;
    const order: TakeStatus[] = ["hooks", "script", "checks", "rendered"];
    let note: string | undefined;
    let dest = to;

    if (to === "checks" || to === "rendered") {
      // Land the card now, then play the checks on it.
      setTakes((all) => all.map((t) => (t.code === code ? { ...t, status: to, note: undefined } : t)));
      setSelected(code);
      const results = runChecks(take, brand).filter((r) => r.state !== "later");
      const fail = blockingFailure(results);
      const stopAt = fail ? results.indexOf(fail) : results.length - 1;
      results.slice(0, stopAt + 1).forEach((r, i) => {
        setTimeout(() => setChecking({ code, step: i + 1, total: results.length, label: r.label, failed: r === fail }), 140 * i);
      });
      setTimeout(() => {
        setChecking(null);
        if (fail) {
          setTakes((all) => all.map((t) => (t.code === code ? { ...t, status: "checks", note: `Blocked: ${fail.detail}` } : t)));
          if (!quiet) toast(`${codeLabel(code)} stays in Checks: ${fail.label.toLowerCase()} failed`, true);
        } else {
          setTakes((all) => all.map((t) => (t.code === code ? { ...t, note: "checks passed" } : t)));
          if (to === "rendered" && !quiet) { toast(`${codeLabel(code)} passed every blocking check. Next: check its storyboard and render it below.`); setTimeout(() => detailRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }), 80); }
        }
      }, 140 * stopAt + (fail ? 900 : 380));
      return;
    } else if (to === "rejected") {
      note = "rejected";
      toast(`${codeLabel(code)} moved to the bin`);
    } else if (order.indexOf(to) < order.indexOf(take.status) || take.status === "rejected") {
      note = "remake";
    }
    setTakes((all) => all.map((t) => (t.code === code ? { ...t, status: dest, note } : t)));
    setSelected(code);
  };

  // Auto-run: every take walks Hooks → Script → Checks → Ready to render, one at a time.
  // Cards fly between columns (View Transitions where the browser has them); a broken rule
  // leaves the card in Checks with its fix waiting.
  const [auto, setAuto] = useState<{ n: number; total: number; code: string; lane: TakeStatus; passed: number; blocked: number } | null>(null);
  const stopAuto = useRef(false);
  const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
  const fly = (fn: () => void) => {
    const d = document as Document & { startViewTransition?: (cb: () => void) => unknown };
    if (d.startViewTransition && !matchMedia("(prefers-reduced-motion: reduce)").matches) d.startViewTransition(() => flushSync(fn));
    else fn();
  };
  const autoRun = async () => {
    const queue = takes.filter((t) => t.status !== "rendered" && t.status !== "rejected" && !t.note?.startsWith("Blocked"));
    if (!queue.length) { toast("Nothing left to run. Every take is ready, blocked with a fix, or in the bin."); return; }
    stopAuto.current = false;
    let passed = 0, blocked = 0;
    for (let n = 0; n < queue.length; n++) {
      if (stopAuto.current) break;
      const t = queue[n];
      const step = (lane: TakeStatus) => setAuto({ n: n + 1, total: queue.length, code: t.code, lane, passed, blocked });
      if (t.status === "hooks") {
        step("script"); fly(() => move(t.code, "script", t, true)); await sleep(700);
        if (stopAuto.current) break;
      }
      const results = runChecks(t, brand).filter((r) => r.state !== "later");
      const fail = blockingFailure(results);
      const stopAt = fail ? results.indexOf(fail) : results.length - 1;
      step("checks"); fly(() => move(t.code, "checks", t, true));
      await sleep(140 * stopAt + (fail ? 900 : 380) + 450);
      if (fail) { blocked++; continue; }
      if (stopAuto.current) break;
      step("rendered"); fly(() => move(t.code, "rendered", t, true));
      await sleep(140 * stopAt + 380 + 500);
      passed++;
    }
    setAuto(null);
    toast(stopAuto.current
      ? `Auto-run stopped: ${passed} ready to render, ${blocked} blocked`
      : `Auto-run done: ${passed} ready to render${blocked ? `, ${blocked} blocked with a fix waiting` : ""}`, blocked > 0 && passed === 0);
  };

  const addNote = (n: string) => sel && setTakes((all) => all.map((t) => (t.code === sel.code ? { ...t, note: `remake: ${n.toLowerCase()}` } : t)));

  // Fixing a blocked take: change it, then re-run the checks by moving it to Ready to render again.
  const applyFix = (take: Take, patch: Partial<Take>, msg: string) => {
    const next = { ...take, ...patch, note: undefined };
    setTakes((all) => all.map((t) => (t.code === take.code ? next : t)));
    toast(`${codeLabel(take.code)}: ${msg}. Re-checking…`);
    setTimeout(() => move(take.code, "rendered", next), 120);
  };

  const aiFix = async (take: Take, problem: string, label: string, recheck = true) => {
    if (aiMode === "saved") { toast("No AI engine is connected. Edit the take by hand instead.", true); return; }
    setFixing(label);
    fprog.reset([
      { id: "fix", label: `${currentEngine()?.label ?? "The AI"} ${label.toLowerCase()}` },
      ...(recheck ? [{ id: "check", label: "Re-run the brand checks" }] : []),
    ]);
    fprog.update("fix", "now", problem);
    try {
      const out = await fixTake(aiMode, { task: "fix", language: lang, brand, take, problem });
      const runtime = out.beats.reduce((a, b) => a + b.seconds, 0);
      const last = out.beats[out.beats.length - 1];
      const logoAt = last && /end card|logo|cta/i.test(last.label) ? runtime - last.seconds : out.logoAt;
      const next: Take = { ...take, ...out, format: take.format, logoAt, note: undefined, animatic: undefined };
      fprog.update("fix", "done", `“${next.hook}” · ${runtime} s`);
      setTakes((all) => all.map((t) => (t.code === take.code ? next : t)));
      if (recheck) {
        fprog.update("check", "now");
        setTimeout(() => { move(take.code, "rendered", next); fprog.update("check", "done", "watch the card"); }, 150);
      } else {
        setTakes((all) => all.map((t) => (t.code === take.code ? { ...next, status: "script", note: "remade" } : t)));
        toast(`${codeLabel(take.code)} remade. Drag it to Ready to render when you're happy with it.`);
      }
    } catch (e) {
      fprog.update("fix", "fail", e instanceof Error ? e.message : "The AI couldn't fix it.");
    } finally {
      setFixing(null);
    }
  };

  // One-click fixes where the rule says exactly what to change; the AI for wording problems.
  const fixesFor = (r: CheckResult, take: Take): { label: string; run: () => void }[] => {
    const runtime = take.beats.reduce((a, b) => a + b.seconds, 0);
    const last = take.beats[take.beats.length - 1];
    switch (r.id) {
      case "captions": return [{ label: "Turn captions on", run: () => applyFix(take, { captions: true }, "captions turned on") }];
      case "logo": {
        const at = Math.max(runtime - brand.endCardSeconds, last && /end card/i.test(last.label) ? runtime - last.seconds : 0);
        return [{ label: `Move the logo to ${at} s (the end card)`, run: () => applyFix(take, { logoAt: at }, `logo moved to ${at} s`) }];
      }
      case "claims": return [
        { label: "Remove the unapproved claims", run: () => applyFix(take, { claims: take.claims.filter((c) => brand.approvedClaims.some((a) => a.trim().toLowerCase() === c.toLowerCase())) }, "unapproved claims removed") },
        { label: "Rewrite with AI", run: () => aiFix(take, `${r.label} failed: ${r.detail}`, "rewrites the claims") },
      ];
      case "paid": return [{ label: "Rewrite that beat with AI", run: () => aiFix(take, `${r.label} failed: ${r.detail} Rewrite only the beats that do this.`, "rewrites the beat") }];
      case "banned": return [{ label: "Rewrite without it (AI)", run: () => aiFix(take, `${r.label} failed: ${r.detail}`, "removes the banned phrase") }];
      case "hook": return r.state === "warn" ? [{ label: "Shorten the hook with AI", run: () => aiFix(take, `The hook takes ${r.detail}. Make it land within 2.5 s.`, "shortens the hook") }] : [];
      default: return [];
    }
  };

  const laneProps = (id: TakeStatus) => ({
    onDragOver: (e: React.DragEvent) => { e.preventDefault(); setOver(id); },
    onDragLeave: () => setOver((o) => (o === id ? null : o)),
    onDrop: (e: React.DragEvent) => { e.preventDefault(); setOver(null); const c = e.dataTransfer.getData("text/plain"); if (c) move(c, id); },
  });

  const results: CheckResult[] = sel ? runChecks(sel, brand) : [];
  const failAt = results.findIndex((r) => r.state === "fail" && r.blocks);

  return (
    <>
      <div className="auto-bar">
        {auto ? (
          <>
            <div className="auto-status" role="status" aria-live="polite">
              <span className="spinner" />
              <span><b>Auto-run {auto.n} of {auto.total}:</b> {codeLabel(auto.code)} → {LANES.find((l) => l.id === auto.lane)?.title}</span>
              <span className="auto-track"><i style={{ width: `${((auto.n - 1) / auto.total) * 100}%` }} /></span>
            </div>
            <button type="button" onClick={() => { stopAuto.current = true; }}><Pause />Stop</button>
          </>
        ) : (
          <button type="button" className="pri auto-go" onClick={autoRun} data-tour="autorun"><Play />Auto-run the board</button>
        )}
        <span className="lbl">Walks every take through Hooks → Script → Checks → Ready to render. Anything that breaks a rule stops in Checks with its fix.</span>
      </div>
      <p className="howto">Drag a card to the next column. Entering <b>Checks</b> or <b>Ready to render</b> runs {brand.name}'s brand rules and stops anything that breaks one, with the reason. When a take is ready, check it below and render it. Delete rejects a take.</p>

      <div className="board" data-tour="board">
        {LANES.map((lane) => {
          const cards = takes.filter((t) => t.status === lane.id);
          return (
            <section key={lane.id} className={`lane${over === lane.id ? " over" : ""}${auto?.lane === lane.id ? " auto-target" : ""}`} aria-label={lane.title} {...laneProps(lane.id)}>
              <header><span>{lane.title} <small>{lane.hint}</small></span><span>{cards.length}</span></header>
              <div className="cards">
                {over === lane.id && dragging && !cards.some((c) => c.code === dragging)
                  ? <div className="drop-ghost">Drop {codeLabel(dragging)} here{lane.id === "checks" || lane.id === "rendered" ? " to run the brand checks" : ""}</div>
                  : cards.length === 0 && <div className="drop-hint">Drop a take here</div>}
                {cards.map((t) => <Card key={t.code} t={t} brand={brand} sel={t.code === selected} dragging={dragging === t.code}
                  checking={checking?.code === t.code ? checking : null}
                  onSelect={() => setSelected(t.code)} onDrag={setDragging} onMove={move} />)}
              </div>
            </section>
          );
        })}
        <section className={`lane bin${over === "rejected" ? " over" : ""}`} aria-label="Bin" {...laneProps("rejected")}>
          <header><span>Bin <small>reject</small></span><span>{takes.filter((t) => t.status === "rejected").length}</span></header>
          <div className="cards">
            {takes.filter((t) => t.status === "rejected").map((t) => <Card key={t.code} t={t} brand={brand} sel={t.code === selected}
              dragging={dragging === t.code} onSelect={() => setSelected(t.code)} onDrag={setDragging} onMove={move} />)}
          </div>
        </section>
      </div>

      {sel && (
        <section className="detail" data-tour="detail" ref={detailRef} aria-label={`${codeLabel(sel.code)} details`}>
          <div className="sec-bar">
            <h2>{codeLabel(sel.code)} · {sel.format}: {sel.title}</h2>
            <span className={`s ${sel.status}`}>{label(sel.status)}</span>
          </div>

          {sel.status === "rendered" && (
            <div className="next">
              <ol className="next-steps">
                <li className="done">Passed every blocking check</li>
                <li className={sel.animatic || sel.slideset ? "done" : "now"}>{sel.kind === "slideshow" ? "Check the slides, then render them" : "Check the storyboard, then render the draft cut"}</li>
                <li className={sel.animatic || sel.slideset ? "now" : ""}>{sel.kind === "slideshow" ? "Download the slides and post them in photo mode" : "Download the production pack for your editor"}</li>
              </ol>
              {sel.kind === "slideshow" ? (
                <div className="acts-row">
                  <button type="button" className="pri" onClick={makeSlides} disabled={Boolean(stage)}>
                    {stage ? <span className="spinner" /> : <Spark />}{stage ? "Rendering…" : sel.slideset ? "Render slides again" : `Render ${sel.slides?.length ?? ""} slides`}
                  </button>
                  {sel.slideset && <button type="button" onClick={downloadSlides} disabled={!slideFiles.current[sel.code]}><IcDown />Download slides (.zip)</button>}
                  {sel.slideset && <button type="button" onClick={() => setPosting(true)}>Post…</button>}
                  <button type="button" onClick={downloadPack}>Download production pack</button>
                </div>
              ) : (<>
              <div className="count">
                  <span className="lbl">Picture</span>
                  <div className="seg-pill" role="radiogroup" aria-label="Draft picture">
                    <button type="button" role="radio" aria-checked={source === "footage"} className={source === "footage" ? "on" : ""} disabled={!FOOTAGE[brand.id]} onClick={() => setSource("footage")}>Your footage</button>
                    <button type="button" role="radio" aria-checked={source === "3d"} className={source === "3d" ? "on" : ""} onClick={() => setSource("3d")}>3D scene</button>
                  <button type="button" role="radio" aria-checked={source === "motion"} className={source === "motion" ? "on" : ""} onClick={() => setSource("motion")}>Motion graphics</button>
                  </div>
                  <span className="lbl">{source === "motion"
                    ? `${sel.look?.ref ? `Following ${sel.look.ref.replace(/^https?:\/\/(www\.)?/, "").split("/")[0]}'s style` : "Editorial explainer"} · serif titles, floating app screens, word-by-word subtitles`
                    : source === "3d"
                    ?`${sel.look?.ref ? `Following ${sel.look.ref.replace(/^https?:\/\/(www\.)?/, "").split("/")[0]}'s style` : "Distro builds it"} · captions: ${sel.look?.captions ?? "balloon"}${sel.look?.cutEvery ? ` · a cut every ${sel.look.cutEvery.toFixed(1)} s` : ""}`
                    : `shots from your reels, sketches where none fit${sel.look?.ref ? " · doesn't follow the style reference" : ""}`}</span>
                </div>
                <div className="acts-row">
                  <button type="button" className="pri" onClick={makeAnimatic} disabled={!renderInfo || Boolean(stage)}
                    title={!renderInfo ? "Rendering runs on the local app (npm run dev)" : undefined}>
                    {stage ? <span className="spinner" /> : <Spark />}{stage ? "Rendering…" : sel.animatic ? "Render again" : "Render draft cut"}
                  </button>
                  <button type="button" onClick={downloadPack}>Download production pack</button>
                </div>
              </>)}
              {(stage || prog.steps.some((x) => x.state === "done")) && <Progress steps={prog.steps} title={stage ? `Rendering ${codeLabel(sel.code)}` : `${codeLabel(sel.code)} rendered`} />}
              {renderErr && <p className="err">{renderErr}</p>}
              {!renderInfo && <p className="note">Rendering runs on the local app, where ffmpeg and the voice key live. The production pack works everywhere.</p>}
            </div>
          )}
          {sel.note?.startsWith("Blocked") && failAt !== -1 && (
            <div className="blocked">
              <b>{codeLabel(sel.code)} is blocked: {results[failAt].label.toLowerCase()}.</b>
              <span>{results[failAt].detail}</span>
              <span className="fixes">
                {fixesFor(results[failAt], sel).map((f, k) => <button key={f.label} type="button" className={k === 0 ? "pri" : ""} onClick={f.run} disabled={Boolean(fixing)}>{f.label}</button>)}
                <button type="button" onClick={() => setEditing(true)}>Edit the take</button>
              </span>
            </div>
          )}
          {fprog.steps.length > 0 && (fixing || fprog.steps.some((x) => x.state !== "todo")) && <Progress steps={fprog.steps} title={fixing ? `Fixing ${codeLabel(sel.code)}` : undefined} />}
          {sel.status !== "rendered" && sel.status !== "rejected" && !sel.note?.startsWith("Blocked") && (
            <p className="note">Check the storyboard, then drag {codeLabel(sel.code)} to <b>Ready to render</b> to run the brand rules and unlock rendering.</p>
          )}
          {!editing ? (
            <div><button type="button" onClick={() => setEditing(true)}>Edit the take</button></div>
          ) : (
            <TakeEditor take={sel} onCancel={() => setEditing(false)} onSave={(next) => { setEditing(false); applyFix(sel, next, "edited"); }} />
          )}

          {sel.kind === "slideshow" ? (
            <>
              <h3 className="sub">{sel.slideset ? "Slides" : "Slide plan"}</h3>
              <ol className="slide-row" aria-label={`${codeLabel(sel.code)} slides`}>
                {sel.slides?.map((x, i) => (
                  <li key={i} className={`slide-card ${x.kind}`}>
                    {sel.slideset?.[i] ? <img src={sel.slideset[i].url} alt={`Slide ${i + 1}: ${x.caption}`} /> : (
                      <div className="slide-plan">
                        <span className="tt-cap">{x.caption}</span>
                        {x.sticker && <span className="tt-sticker">{x.sticker}</span>}
                      </div>
                    )}
                    <span className="slide-meta"><i>{i + 1} · {x.kind === "app" ? "app screen" : "real moment"}</i>{x.scene}</span>
                  </li>
                ))}
              </ol>
            </>
          ) : (
            <>
              <h3 className="sub">Storyboard</h3>
              <Storyboard take={sel} cta={brand.cta} library={FOOTAGE[brand.id]} />
            </>
          )}

          {sel.animatic && (
            <div className="animatic">
              <video src={sel.animatic.url} controls playsInline preload="metadata" />
              <dl className="facts">
                <div><dt>Draft cut</dt><dd>{sel.animatic.duration.toFixed(1)} s · {sel.animatic.sizeMB} MB{sel.animatic.lufs != null ? ` · ${sel.animatic.lufs} LUFS` : ""}</dd></div>
                <div><dt>Voice</dt><dd>{sel.animatic.voice ?? "None. Captions only."}</dd></div>
                {sel.animatic.plan && <div><dt>Shots</dt><dd>{sel.animatic.plan.map((p, i) => `${i + 1}. ${p.source}`).join(" · ")}</dd></div>}
                <div><dt>Saved to</dt><dd className="path">{sel.animatic.path.replace(/^\/Users\/[^/]+/, "~")}</dd></div>
                <div className="acts-row">
                  <button type="button" className="pri" onClick={() => setPosting(true)}>Post…</button>
                  <a className="btn" href={sel.animatic.url} download><Play />Download MP4</a>
                </div>
              </dl>
            </div>
          )}
          <h3 className="sub">Brand checks, cheapest first</h3>
          <ul className="checklist">
            {results.map((r, i) => (
              <li key={r.id}>
                <StateIcon state={failAt !== -1 && i > failAt ? "skip" : r.state} />
                <b>{r.label}{!r.blocks && r.state !== "later" ? " (advice)" : ""}</b>
                <span>{failAt !== -1 && i > failAt ? "Not run: an earlier check failed" : r.detail}</span>
                {(r.state === "fail" || r.state === "warn") && !(failAt !== -1 && i > failAt) && fixesFor(r, sel).length > 0 && (
                  <span className="fixes">
                    {fixesFor(r, sel).map((f, k) => <button key={f.label} type="button" className={k === 0 ? "pri" : ""} onClick={f.run} disabled={Boolean(fixing)}>{f.label}</button>)}
                  </span>
                )}
              </li>
            ))}
          </ul>
          <div className="remake">
            <span className="lbl"><Undo className="i" /> Remake with AI:</span>
            {REMAKE_NOTES.map((n) => <button key={n} type="button" disabled={Boolean(fixing)} onClick={() => aiMode === "saved" ? addNote(n) : aiFix(sel, `Remake: ${n.toLowerCase()}. Keep it passing every brand rule.`, `remakes it: ${n.toLowerCase()}`, false)}>{n}</button>)}
            <button type="button" className="ghost" onClick={() => move(sel.code, "script")}>Send back to Script</button>
          </div>
        </section>
      )}
      {posting && sel && (
        <PostDialog take={sel} brand={brand} slides={sel.kind === "slideshow"}
          file={sel.animatic ? { url: sel.animatic.url, path: sel.animatic.path, name: `${brand.name}-${sel.code}.mp4` } : undefined}
          onSlidesZip={downloadSlides} onClose={() => setPosting(false)} />
      )}
    </>
  );
}

function Card({ t, brand, sel, dragging, checking, onSelect, onDrag, onMove }: {
  t: Take; brand: Brand; sel: boolean; dragging: boolean;
  checking?: { step: number; total: number; label: string; failed?: boolean } | null;
  onSelect: () => void; onDrag: (c: string | null) => void; onMove: (c: string, to: TakeStatus) => void;
}) {
  const lint = lintHook(t.hook, { pace: brand.voicePace, dropAt: null });
  const blocked = t.note?.startsWith("Blocked");
  const keys: Record<string, TakeStatus> = { "1": "hooks", "2": "script", "3": "checks", "4": "rendered", Delete: "rejected", Backspace: "rejected" };
  return (
    <button type="button" draggable style={{ viewTransitionName: `card-${t.code}` } as React.CSSProperties} className={`card${sel ? " sel" : ""}${dragging ? " dragging" : ""}${checking ? " checking" : ""}${checking?.failed ? " failing" : ""}`}
      onClick={onSelect}
      onKeyDown={(e) => { const to = keys[e.key]; if (to) { e.preventDefault(); onMove(t.code, to); } }}
      onDragStart={(e) => { e.dataTransfer.setData("text/plain", t.code); e.dataTransfer.effectAllowed = "move"; onDrag(t.code); }}
      onDragEnd={() => onDrag(null)}
      aria-label={`${codeLabel(t.code)} ${t.format}. Keys 1 to 4 move it, Delete rejects.`}>
      <h4><span>{codeLabel(t.code)} · {t.format}</span><span className="dur">{t.kind === "slideshow" ? `${t.slides?.length} slides` : `${t.beats.reduce((s, b) => s + b.seconds, 0)} s`}</span></h4>
      <span className="h">“{t.hook}”</span>
      <span className="meta-row">
        {t.kind === "slideshow"
          ? <span className="flag ok">{t.slides?.length} slides · photo post</span>
          : <span className={`flag ${lint.landsAt <= 2.5 ? "ok" : "warn"}`}>hook ≈ {lint.landsAt} s · {lint.lang}</span>}
        {checking ? (
          <span className={`check-run${checking.failed ? " no" : ""}`} aria-live="polite">
            <span className="check-bar"><i style={{ width: `${(checking.step / checking.total) * 100}%` }} /></span>
            {checking.failed ? `Failed: ${checking.label}` : `Checking ${checking.step} of ${checking.total} · ${checking.label}`}
          </span>
        ) : t.note && <span className={`flag ${blocked ? "no" : t.note === "checks passed" ? "ok" : ""}`}>{t.note.replace(/^Blocked: /, "Blocked · ")}</span>}
      </span>
    </button>
  );
}

// Hand edits: hook, each beat, and when the logo appears.
function TakeEditor({ take, onSave, onCancel }: { take: Take; onSave: (patch: Partial<Take>) => void; onCancel: () => void }) {
  const [hook, setHook] = useState(take.hook);
  const [beats, setBeats] = useState(take.beats.map((b) => ({ ...b })));
  const runtime = beats.reduce((a, b) => a + (Number(b.seconds) || 0), 0);
  const [logoAt, setLogoAt] = useState(String(take.logoAt));
  return (
    <form className="take-editor" onSubmit={(e) => { e.preventDefault(); onSave({ hook: hook.trim(), beats: beats.map((b) => ({ label: b.label.trim(), seconds: Math.max(1, Math.round(Number(b.seconds) || 1)) })), logoAt: Number(logoAt) || 0 }); }}>
      <label className="field" htmlFor="ed-hook">Hook (spoken first line)
        <input id="ed-hook" type="text" value={hook} onChange={(e) => setHook(e.target.value)} />
      </label>
      <div className="ed-beats">
        {beats.map((b, i) => (
          <div className="ed-beat" key={i}>
            <span className="lbl">Beat {i + 1}</span>
            <input type="text" aria-label={`Beat ${i + 1} on screen`} value={b.label} onChange={(e) => setBeats((all) => all.map((x, k) => (k === i ? { ...x, label: e.target.value } : x)))} />
            <input type="text" inputMode="numeric" aria-label={`Beat ${i + 1} seconds`} className="secs" value={String(b.seconds)} onChange={(e) => setBeats((all) => all.map((x, k) => (k === i ? { ...x, seconds: Number(e.target.value) || 0 } : x)))} />
            <span className="lbl">s</span>
          </div>
        ))}
      </div>
      <label className="field" htmlFor="ed-logo">Logo first appears at (seconds) <span className="hint">runtime {runtime} s; the end card starts at {runtime - (beats[beats.length - 1]?.seconds ?? 0)} s</span>
        <input id="ed-logo" type="text" inputMode="numeric" value={logoAt} onChange={(e) => setLogoAt(e.target.value)} />
      </label>
      <div className="acts-row">
        <button type="submit" className="pri">Save and re-check</button>
        <button type="button" className="ghost" onClick={onCancel}>Cancel</button>
      </div>
    </form>
  );
}
