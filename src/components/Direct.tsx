import { useEffect, useRef, useState } from "react";
import type { Brand, Take, TakeStatus } from "../types";
import { blockingFailure, runChecks, type CheckResult } from "../lib/checks";
import { lintHook } from "../lib/lint";
import { renderAnimatic, renderAvailable, productionPack } from "../lib/render";
import { Storyboard } from "./Storyboard";
import { Play, Spark, StateIcon, Undo } from "./Icons";
import { label } from "./Analyze";

const LANES: { id: TakeStatus; title: string; hint: string }[] = [
  { id: "hooks", title: "Hooks", hint: "pick the opener" },
  { id: "script", title: "Script", hint: "beats and claims" },
  { id: "checks", title: "Checks", hint: "brand rules run here" },
  { id: "rendered", title: "Ready to render", hint: "checks passed" },
];

const REMAKE_NOTES = ["Shorter hook", "Plainer words", "Funnier", "Logo later", "Different setting"];

type Props = {
  brand: Brand;
  takes: Take[];
  setTakes: (fn: (t: Take[]) => Take[]) => void;
  selected: string | null;
  setSelected: (c: string | null) => void;
  toast: (msg: string, bad?: boolean) => void;
};

export function Direct({ brand, takes, setTakes, selected, setSelected, toast }: Props) {
  const [dragging, setDragging] = useState<string | null>(null);
  const [over, setOver] = useState<TakeStatus | null>(null);
  const sel = takes.find((t) => t.code === selected) ?? null;
  const detailRef = useRef<HTMLElement>(null);
  const [renderInfo, setRenderInfo] = useState<{ ready: boolean; voice: string | null } | null>(null);
  const [stage, setStage] = useState<string | null>(null);
  const [renderErr, setRenderErr] = useState<string | null>(null);
  useEffect(() => { renderAvailable().then(setRenderInfo); }, []);

  const makeAnimatic = async () => {
    if (!sel) return;
    setRenderErr(null);
    try {
      const out = await renderAnimatic({ take: sel, brandName: brand.name, cta: brand.cta, withVoice: Boolean(renderInfo?.voice), onStage: setStage });
      setTakes((all) => all.map((t) => (t.code === sel.code ? { ...t, animatic: out, note: "animatic rendered" } : t)));
      toast(`${sel.code} animatic rendered`);
    } catch (e) {
      setRenderErr(e instanceof Error ? e.message : "The animatic failed.");
    } finally {
      setStage(null);
    }
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

  const move = (code: string, to: TakeStatus) => {
    const take = takes.find((t) => t.code === code);
    if (!take || take.status === to) return;
    const order: TakeStatus[] = ["hooks", "script", "checks", "rendered"];
    let note: string | undefined;
    let dest = to;

    if (to === "checks" || to === "rendered") {
      const fail = blockingFailure(runChecks(take, brand));
      if (fail) {
        dest = "checks";
        note = `Blocked: ${fail.detail}`;
        toast(`${code} stays in Checks: ${fail.label.toLowerCase()} failed`, true);
      } else {
        note = "checks passed";
        if (to === "rendered") { toast(`${code} passed every blocking check. Next: check its storyboard and render it below.`); setTimeout(() => detailRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }), 80); }
      }
    } else if (to === "rejected") {
      note = "rejected";
      toast(`${code} moved to the bin`);
    } else if (order.indexOf(to) < order.indexOf(take.status) || take.status === "rejected") {
      note = "remake";
    }
    setTakes((all) => all.map((t) => (t.code === code ? { ...t, status: dest, note } : t)));
    setSelected(code);
  };

  const addNote = (n: string) => sel && setTakes((all) => all.map((t) => (t.code === sel.code ? { ...t, note: `remake: ${n.toLowerCase()}` } : t)));

  const laneProps = (id: TakeStatus) => ({
    onDragOver: (e: React.DragEvent) => { e.preventDefault(); setOver(id); },
    onDragLeave: () => setOver((o) => (o === id ? null : o)),
    onDrop: (e: React.DragEvent) => { e.preventDefault(); setOver(null); const c = e.dataTransfer.getData("text/plain"); if (c) move(c, id); },
  });

  const results: CheckResult[] = sel ? runChecks(sel, brand) : [];
  const failAt = results.findIndex((r) => r.state === "fail" && r.blocks);

  return (
    <>
      <section className="head">
        <div>
          <h1>Arrange the next batch</h1>
          <p className="howto"><b>What to do:</b> drag a card to the next column. Entering <b>Checks</b> or <b>Ready to render</b> runs {brand.name}'s brand rules and stops any take that breaks one, with the reason. When a take is ready, check its storyboard below and press <b>Render animatic</b>. Press Delete to reject a take.</p>
        </div>
      </section>

      <div className="board">
        {LANES.map((lane) => {
          const cards = takes.filter((t) => t.status === lane.id);
          return (
            <section key={lane.id} className={`lane${over === lane.id ? " over" : ""}`} aria-label={lane.title} {...laneProps(lane.id)}>
              <header><span>{lane.title} <small>{lane.hint}</small></span><span>{cards.length}</span></header>
              <div className="cards">
                {cards.length === 0 && <div className="drop-hint">Drop a take here</div>}
                {cards.map((t) => <Card key={t.code} t={t} brand={brand} sel={t.code === selected} dragging={dragging === t.code}
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
        <section className="detail" ref={detailRef} aria-label={`${sel.code} details`}>
          <div className="sec-bar">
            <h2>{sel.code} · {sel.format}: {sel.title}</h2>
            <span className={`s ${sel.status}`}>{label(sel.status)}</span>
          </div>

          {sel.status === "rendered" && (
            <div className="next">
              <ol className="next-steps">
                <li className="done">Passed every blocking check</li>
                <li className={sel.animatic ? "done" : "now"}>Check the storyboard, then render the animatic</li>
                <li className={sel.animatic ? "now" : ""}>Download the production pack for your editor</li>
              </ol>
              <div className="acts-row">
                <button type="button" className="pri" onClick={makeAnimatic} disabled={!renderInfo || Boolean(stage)}
                  title={!renderInfo ? "Rendering runs on the local app (npm run dev)" : undefined}>
                  {stage ? <span className="spinner" /> : <Spark />}{stage ? "Rendering…" : sel.animatic ? "Render again" : "Render animatic"}
                </button>
                <button type="button" onClick={downloadPack}>Download production pack</button>
              </div>
              {stage && <p className="note" role="status">{stage}</p>}
              {renderErr && <p className="err">{renderErr}</p>}
              {!renderInfo && <p className="note">Rendering runs on the local app, where ffmpeg and the voice key live. The production pack works everywhere.</p>}
            </div>
          )}
          {sel.status !== "rendered" && sel.status !== "rejected" && (
            <p className="note">Check the storyboard, then drag {sel.code} to <b>Ready to render</b> to run the brand rules and unlock rendering.</p>
          )}

          <h3 className="sub">Storyboard</h3>
          <Storyboard take={sel} cta={brand.cta} />

          {sel.animatic && (
            <div className="animatic">
              <video src={sel.animatic.url} controls playsInline preload="metadata" />
              <dl className="facts">
                <div><dt>Animatic</dt><dd>{sel.animatic.duration.toFixed(1)} s · {sel.animatic.sizeMB} MB{sel.animatic.lufs != null ? ` · ${sel.animatic.lufs} LUFS` : ""}</dd></div>
                <div><dt>Voice</dt><dd>{sel.animatic.voice ?? "None. Captions only."}</dd></div>
                <div><dt>Saved to</dt><dd className="path">{sel.animatic.path.replace(/^\/Users\/[^/]+/, "~")}</dd></div>
                <div><a className="btn" href={sel.animatic.url} download><Play />Download MP4</a></div>
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
              </li>
            ))}
          </ul>
          <div className="remake">
            <span className="lbl"><Undo className="i" /> Remake note:</span>
            {REMAKE_NOTES.map((n) => <button key={n} type="button" onClick={() => addNote(n)}>{n}</button>)}
            <button type="button" className="ghost" onClick={() => move(sel.code, "script")}>Send back to Script</button>
          </div>
        </section>
      )}
    </>
  );
}

function Card({ t, brand, sel, dragging, onSelect, onDrag, onMove }: {
  t: Take; brand: Brand; sel: boolean; dragging: boolean;
  onSelect: () => void; onDrag: (c: string | null) => void; onMove: (c: string, to: TakeStatus) => void;
}) {
  const lint = lintHook(t.hook, { pace: brand.voicePace, dropAt: null });
  const blocked = t.note?.startsWith("Blocked");
  const keys: Record<string, TakeStatus> = { "1": "hooks", "2": "script", "3": "checks", "4": "rendered", Delete: "rejected", Backspace: "rejected" };
  return (
    <button type="button" draggable className={`card${sel ? " sel" : ""}${dragging ? " dragging" : ""}`}
      onClick={onSelect}
      onKeyDown={(e) => { const to = keys[e.key]; if (to) { e.preventDefault(); onMove(t.code, to); } }}
      onDragStart={(e) => { e.dataTransfer.setData("text/plain", t.code); e.dataTransfer.effectAllowed = "move"; onDrag(t.code); }}
      onDragEnd={() => onDrag(null)}
      aria-label={`${t.code} ${t.format}. Keys 1 to 4 move it, Delete rejects.`}>
      <h4><span>{t.code} · {t.format}</span><span style={{ fontWeight: 500, color: "var(--text-2)" }}>{t.beats.reduce((s, b) => s + b.seconds, 0)} s</span></h4>
      <span className="h">“{t.hook}”</span>
      <span className="meta-row">
        <span className={`flag ${lint.landsAt <= 2.5 ? "ok" : "warn"}`}>hook ≈ {lint.landsAt} s · {lint.lang}</span>
        {t.note && <span className={`flag ${blocked ? "no" : t.note === "checks passed" ? "ok" : ""}`}>{t.note.replace(/^Blocked: /, "Blocked · ")}</span>}
      </span>
    </button>
  );
}
