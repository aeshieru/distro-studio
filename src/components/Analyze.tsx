import { useEffect, useMemo, useRef, useState } from "react";
import type { AiMode, Brand, ContentLang, HookOption, Reel, RetentionPoint, RetentionSource, Take } from "../types";
import { interpolate } from "../lib/retention";
import { lintHook, syllables, type HookLint } from "../lib/lint";
import { generateHooks, AiError, currentEngine } from "../lib/ai";
import { useFrames } from "../lib/useFrames";
import { savedHooks } from "../data/saved-run";
import { estimateWords, renderAvailable, renderNewHook, type RenderResult } from "../lib/render";
import { Check, Copy, Cross, Pause, Play, Spark } from "./Icons";

// Chart geometry (SVG user units). Colours mirror the CSS tokens.
const W = 900, PL = 40, PR = 12, TOP = 12, H = 190;
const C = { ink: "#E9E6F5", drop: "#FF6B5E", dropTint: "rgba(255,107,94,0.16)", data: "#8E51FF", dataInk: "#A684FF" };

// One rule for every time on screen: m:ss, floored, like a video timecode.
export const fmt = (t: number) => `${Math.floor(t / 60)}:${String(Math.floor(t % 60)).padStart(2, "0")}`;

type Props = {
  reel: Reel;
  brand: Brand;
  retention: RetentionPoint[];
  source: RetentionSource;
  dropAt: number | null;
  aiMode: AiMode;
  lang: ContentLang;
  takes: Take[];
  onOpenTake: (code: string) => void;
  toast: (msg: string, bad?: boolean) => void;
};

export function Analyze({ reel, brand, retention, source, dropAt, aiMode, lang, takes, onOpenTake, toast }: Props) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [time, setTime] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [paceMul, setPaceMul] = useState(1);
  const [options, setOptions] = useState<HookOption[]>(() => savedHooks(lang));
  const [optSource, setOptSource] = useState<"saved" | "live">("saved");

  // Switching the content language swaps in that language's saved rewrites.
  useEffect(() => { setOptions(savedHooks(lang)); setOptSource("saved"); setPicked(0); }, [lang]);
  const [picked, setPicked] = useState(0);
  const [own, setOwn] = useState("");
  const [busy, setBusy] = useState(false);
  const [aiErr, setAiErr] = useState<string | null>(null);
  const [preview, setPreview] = useState<{ text: string; landsAt: number; phase: "hook" | "rest" } | null>(null);
  // Guided path: 1 see the drop, 2 pick a hook, 3 preview it, 4 render it.
  const [seen, setSeen] = useState(false);
  const [touched, setTouched] = useState(false);
  const [previewed, setPreviewed] = useState(false);
  const [renderInfo, setRenderInfo] = useState<{ ready: boolean; voice: string | null } | null>(null);
  const [rendering, setRendering] = useState<string | null>(null);
  const [result, setResult] = useState<(RenderResult & { hook: string }) | null>(null);
  const [renderErr, setRenderErr] = useState<string | null>(null);
  const resultRef = useRef<HTMLElement>(null);
  const beforeRef = useRef<HTMLVideoElement>(null);
  const afterRef = useRef<HTMLVideoElement>(null);
  useEffect(() => { renderAvailable().then(setRenderInfo); }, []);
  const pick = (i: number) => { setPicked(i); setTouched(true); setSeen(true); };
  const step = !seen ? 1 : !touched ? 2 : !previewed ? 3 : !result ? 4 : 5;

  const x = (t: number) => PL + (t / reel.duration) * (W - PL - PR);
  const y = (pct: number) => TOP + (1 - pct / 100) * H;
  const pace = brand.voicePace * paceMul;
  const b1 = reel.beats[0], b2 = reel.beats[1];

  const rawHook = reel.hookWords.map((w) => w.w).join(" ");
  const hookText = rawHook.charAt(0).toUpperCase() + rawHook.slice(1);
  const hookEnd = reel.hookWords[reel.hookWords.length - 1].end;
  const curLint = lintHook(hookText, { pace, dropAt, measuredLandsAt: hookEnd, banned: brand.bannedPhrases });
  const estOld = lintHook(hookText, { pace, dropAt }).landsAt;
  const lints = options.map((o) => lintHook(o.text, { pace, dropAt, banned: brand.bannedPhrases }));
  const ownLint = own.trim() ? lintHook(own, { pace, dropAt, banned: brand.bannedPhrases }) : null;
  const chosen = picked === -1
    ? (ownLint ? { text: own.trim(), lint: ownLint } : null)
    : options[picked] ? { text: options[picked].text, lint: lints[picked] } : null;

  const frames = useFrames(reel.videoUrl, reel.beats.map((b) => Math.min(b.end - 0.2, b.start + (b.end - b.start) * 0.55)));
  const dropBeat = dropAt == null ? null : reel.beats.find((b) => dropAt >= b.start && dropAt < b.end) ?? null;
  const nowBeat = reel.beats.find((b) => time >= b.start && time < b.end) ?? reel.beats[reel.beats.length - 1];

  // Playhead follows the video; in a preview, cut to Step 1 once the new hook has landed.
  useEffect(() => {
    let raf = 0;
    const tick = () => {
      const v = videoRef.current;
      if (v) {
        setTime(v.currentTime);
        if (preview?.phase === "hook" && v.currentTime >= preview.landsAt + 0.45) {
          v.currentTime = b2.start;
          v.muted = false;
          setPreview((p) => (p ? { ...p, phase: "rest" } : p));
          setPreviewed(true);
        }
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [preview, b2.start]);

  const seek = (t: number) => {
    const v = videoRef.current;
    if (!v) return;
    setSeen(true);
    if (preview) { setPreview(null); v.muted = false; }
    v.currentTime = Math.max(0, Math.min(reel.duration - 0.05, t));
    setTime(v.currentTime);
  };

  const togglePlay = () => {
    const v = videoRef.current;
    if (!v) return;
    setSeen(true);
    if (v.paused) v.play().catch(() => toast("The browser blocked playback. Click play again.", true));
    else v.pause();
  };

  const startPreview = () => {
    const v = videoRef.current;
    if (!v || !chosen) return;
    v.muted = true;
    v.currentTime = 0;
    setPreview({ text: chosen.text, landsAt: chosen.lint.landsAt, phase: "hook" });
    v.play().catch(() => toast("The browser blocked playback. Click Preview again.", true));
  };

  const askClaude = async () => {
    setBusy(true);
    setAiErr(null);
    try {
      const hooks = await generateHooks(aiMode, {
        task: "hooks", language: lang, brand: { ...brand, voicePace: pace }, idea: `${brand.name} reel "${reel.title}"`,
        currentHook: hookText, landsAt: hookEnd, dropAt, nextBeat: b2.line,
      });
      setOptions(hooks);
      setOptSource("live");
      pick(0);
    } catch (e) {
      setAiErr(e instanceof AiError ? e.message : "AI request failed.");
    } finally {
      setBusy(false);
    }
  };

  const doRender = async () => {
    if (!chosen || !renderInfo) return;
    setRenderErr(null);
    setResult(null);
    try {
      const out = await renderNewHook({
        text: chosen.text, withVoice: Boolean(renderInfo.voice), cutTo: b2.start, duration: reel.duration,
        estimate: () => estimateWords(chosen.text, pace, syllables), onStage: setRendering,
      });
      setResult({ ...out, hook: chosen.text });
      setPreviewed(true);
      setTimeout(() => resultRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }), 50);
    } catch (e) {
      setRenderErr(e instanceof Error ? e.message : "The render failed.");
    } finally {
      setRendering(null);
    }
  };

  const playBoth = () => {
    const a = beforeRef.current, b = afterRef.current;
    if (!a || !b) return;
    a.currentTime = 0; b.currentTime = 0;
    a.muted = true; b.muted = false;
    a.play().catch(() => null); b.play().catch(() => null);
  };

  const copyForRender = async () => {
    if (!chosen) return;
    const payload = JSON.stringify({ reel: reel.id, replaceUntil: b2.start, hook: chosen.text, estLandsAt: chosen.lint.landsAt }, null, 2);
    try { await navigator.clipboard.writeText(payload); toast("Copied the render brief for the pipeline"); }
    catch { toast("Copy failed. Select the hook text instead.", true); }
  };

  const lastT = retention[retention.length - 1].t;
  const curve = useMemo(() => {
    const pts: string[] = [];
    if (source.kind === "imported") retention.forEach((p) => pts.push(`${x(p.t).toFixed(1)},${y(p.pct).toFixed(1)}`));
    else for (let t = 0; t <= lastT + 0.001; t += 0.2) pts.push(`${x(t).toFixed(1)},${y(interpolate(retention, t)).toFixed(1)}`);
    return pts;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [retention, source.kind, reel.duration]);
  const area = `M${x(0)},${y(0)} L${curve.join(" L")} L${x(lastT)},${y(0)} Z`;

  const onChartPointer = (e: React.PointerEvent<SVGSVGElement>) => {
    if (e.type === "pointermove" && e.buttons !== 1) return;
    const r = e.currentTarget.getBoundingClientRect();
    const px = ((e.clientX - r.left) / r.width) * W;
    seek(((px - PL) / (W - PL - PR)) * reel.duration);
  };

  const reveal = preview?.phase === "hook" ? revealWords(preview.text, time, pace) : null;
  const newRuntime = chosen ? chosen.lint.landsAt + 0.45 + (reel.duration - b2.start) : null;
  const goneBy = source.kind === "reported" ? retention.find((p) => p.t > 0) : null;

  return (
    <>
      <section className="head">
        <div>
          <h1>{reel.title}</h1>
          <p className="meta">{brand.name} · {reel.platform} · {reel.posted} · {reel.duration.toFixed(1)} s (FB says 31 s)</p>
        </div>
        <div className="stats">
          {reel.stats.map((s) => <div className="st" key={s.label}>{s.value}<span>{s.label}</span></div>)}
          <span className="src">{reel.statsSource}</span>
        </div>
      </section>

      <Stepper step={step} hookEnd={hookEnd} dropAt={dropAt} onSeen={() => setSeen(true)} canRender={Boolean(renderInfo)} />

      <div className="analyze">
        <section className={`main${step === 1 ? " cue-wrap" : ""}`} aria-labelledby="where">
          {result && (
            <section className="result" ref={resultRef} aria-labelledby="ba">
              <div className="sec-bar">
                <h2 id="ba">Before and after</h2>
                <button type="button" className="pri" onClick={playBoth}><Play />Play both (sound from the new one)</button>
              </div>
              <div className="ba">
                <figure>
                  <video ref={beforeRef} src={reel.videoUrl} playsInline controls preload="metadata" />
                  <figcaption><b>Before</b> · hook finishes {hookEnd.toFixed(1)} s · {reel.duration.toFixed(1)} s</figcaption>
                </figure>
                <figure>
                  <video ref={afterRef} src={result.url} playsInline controls preload="auto" />
                  <figcaption><b>After</b> · hook finishes {result.landsAt.toFixed(1)} s · {result.duration.toFixed(1)} s</figcaption>
                </figure>
                <dl className="facts">
                  <div><dt>New hook</dt><dd>“{result.hook}”</dd></div>
                  <div><dt>Hook finishes</dt><dd>{hookEnd.toFixed(1)} s → <b>{result.landsAt.toFixed(1)} s</b> {result.measured ? "(measured from the new voice-over)" : "(estimated; no voice-over)"}</dd></div>
                  <div><dt>Voice</dt><dd>{result.voice ?? "None. Captions only."}</dd></div>
                  <div><dt>Loudness</dt><dd>{result.lufs != null ? `${result.lufs} LUFS (target −14)` : "not measured"}</dd></div>
                  <div><dt>File</dt><dd>{result.sizeMB} MB · {result.sizeMB < 10 ? "fits every platform's upload limit" : "over 10 MB"}</dd></div>
                  <div><dt>Saved to</dt><dd className="path">{result.path.replace(/^\/Users\/[^/]+/, "~")}</dd></div>
                </dl>
                <a className="btn" href={result.url} download="whatif-rain-new-hook.mp4">Download MP4</a>
              </div>
              <p className="note">The new version is not posted anywhere. Retention for it only exists after you post it; judge it at 24 h.</p>
            </section>
          )}
          <div className="sec-bar">
            <h2 id="where">Where they left, beat by beat</h2>
            <span className="lbl">Beats from the render's own VO timing</span>
          </div>

          <div className="scrollx">
            <div className="inner">
              <div className="strip-wrap" style={{ paddingLeft: `${(PL / W) * 100}%`, paddingRight: `${(PR / W) * 100}%` }}>
                {dropBeat && (
                  <div className="balloon" style={{ left: `calc(${(x(dropBeat.start) / W) * 100}% + 4px)` }}>
                    {lang === "taglish" ? "Dito sila umalis" : "They left here"} · <b>{fmt(dropAt!)}</b>
                  </div>
                )}
                <div className="strip">
                  {reel.beats.map((b, i) => (
                    <button key={b.id} type="button"
                      className={`pn${b === dropBeat ? " drop" : ""}${b === nowBeat ? " now" : ""}`}
                      style={{ flex: `${b.end - b.start} 1 0`, padding: 0, font: "inherit", textAlign: "left" }}
                      onClick={() => seek(b.start + 0.01)} title={`${b.id} ${fmt(b.start)}–${fmt(b.end)}: ${b.line}`}>
                      <div className="fr">{frames[i] && <img src={frames[i]!} alt="" />}</div>
                      <div className="cap">
                        <i>{b.id} {fmt(b.start)}–{fmt(b.end)}</i>{b.label}
                      </div>
                    </button>
                  ))}
                </div>
              </div>

              <svg className="chart" viewBox={`0 0 ${W} ${H + TOP + 30}`} role="img"
                aria-label={`Retention: ${retention.map((p) => `${p.pct}% at ${p.t} s`).join(", ")}`}
                onPointerDown={onChartPointer} onPointerMove={onChartPointer}>
                <defs>
                  <pattern id="ht" width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(15)">
                    <circle cx="3" cy="3" r="1.7" fill={C.data} />
                  </pattern>
                </defs>
                {dropAt != null && dropAt < hookEnd && (
                  <rect x={x(dropAt)} y={TOP} width={x(hookEnd) - x(dropAt)} height={H} fill={C.dropTint} />
                )}
                <g stroke={C.ink} strokeOpacity=".14">
                  {[25, 50, 75].map((p) => <line key={p} x1={PL} x2={W - PR} y1={y(p)} y2={y(p)} />)}
                </g>
                <g stroke={C.ink} strokeOpacity=".28" strokeDasharray="2 3">
                  {reel.beats.slice(1).map((b) => <line key={b.id} x1={x(b.start)} x2={x(b.start)} y1={TOP} y2={TOP + H} />)}
                </g>
                <path d={area} fill="url(#ht)" opacity=".9" />
                <polyline points={curve.join(" ")} fill="none" stroke={C.ink} strokeWidth="2.2"
                  strokeDasharray={source.kind === "reported" ? "6 4" : undefined} />
                {source.kind === "reported" && retention.map((p) => (
                  <g key={p.t}>
                    <circle cx={x(p.t)} cy={y(p.pct)} r="5" fill={C.ink} />
                    {p.t > 0 && <text className="lab" x={x(p.t) + 9} y={y(p.pct) - 9}>{p.t < hookEnd ? `${p.pct}%` : `${p.pct}% at ${fmt(p.t)}`}</text>}
                  </g>
                ))}
                {source.kind === "reported" && <text x={x(lastT) + 10} y={y(4)}>no reported data after {fmt(lastT)}</text>}
                <line x1={x(hookEnd)} x2={x(hookEnd)} y1={TOP} y2={TOP + H} stroke={C.ink} strokeWidth="1.5" strokeDasharray="4 3" />
                <text className="lab" x={x(hookEnd) + 6} y={TOP + 14}>Old hook finishes {hookEnd.toFixed(1)} s</text>
                {chosen && (
                  <>
                    <line x1={x(chosen.lint.landsAt)} x2={x(chosen.lint.landsAt)} y1={TOP + 22} y2={TOP + H} stroke={C.dataInk} strokeWidth="2.5" />
                    <text className="lab" x={x(hookEnd) + 6} y={TOP + 32} style={{ fill: C.dataInk }}>
                      New hook lands ≈ {chosen.lint.landsAt} s (blue line)
                    </text>
                  </>
                )}
                {dropAt != null && (
                  <>
                    <line x1={x(dropAt)} x2={x(dropAt)} y1={TOP} y2={TOP + H} stroke={C.drop} strokeWidth="2" />
                    <rect x={x(dropAt) + 4} y={TOP + H - 30} width="178" height="22" rx="4" fill={C.drop} />
                    <text className="tag" x={x(dropAt) + 12} y={TOP + H - 15}>Biggest drop {fmt(dropAt)} ({source.kind === "reported" ? "FB" : "export"})</text>
                  </>
                )}
                <line x1={x(time)} x2={x(time)} y1={TOP - 4} y2={TOP + H} stroke={C.ink} strokeWidth="1" />
                <circle cx={x(time)} cy={TOP - 4} r="4" fill={C.ink} />
                <line x1={PL} x2={W - PR} y1={TOP + H} y2={TOP + H} stroke={C.ink} strokeWidth="1.5" />
                <text x={PL - 6} y={y(100) + 4} textAnchor="end">100%</text>
                <text x={PL - 6} y={y(50) + 4} textAnchor="end">50%</text>
                <text x={PL - 6} y={y(0) + 4} textAnchor="end">0%</text>
                <g textAnchor="middle">
                  {reel.beats.map((b) => <text key={b.id} x={x(b.start)} y={TOP + H + 18}>{fmt(b.start)}</text>)}
                  <text x={x(reel.duration) - 8} y={TOP + H + 18}>{fmt(reel.duration)}</text>
                </g>
              </svg>
            </div>
          </div>

          <div className="legend">
            {source.kind === "reported" ? (
              <>
                <span className="k"><i className="dot" />reported by FB</span>
                <span className="k"><i className="dash" />estimated between reported points</span>
              </>
            ) : (
              <span className="k"><i className="dash" style={{ borderTopStyle: "solid" }} />from {source.fileName}</span>
            )}
            {dropAt != null && dropAt < hookEnd && <span className="k"><i className="band" />still on the hook after viewers left</span>}
            <span>Drag the chart to scrub.</span>
          </div>
          <p className="verdict">
            The hook kept talking until <b>{hookEnd.toFixed(1)} s</b>; viewers left at <b>{dropAt != null ? fmt(dropAt) : "—"}</b>
            {goneBy ? <> and {Math.round(100 - goneBy.pct)}% were gone by {fmt(goneBy.t)}</> : null}.
            {" "}At {pace.toFixed(1)} syl/s the lint estimates {estOld} s for the old hook (measured {hookEnd.toFixed(2)} s), so its estimates for rewrites are grounded.
          </p>
        </section>

        <aside className="side" aria-label="Hook rewrite">
          <div className={`player${preview ? " big" : ""}`}>
            <div className="screen">
              <video ref={videoRef} src={reel.videoUrl} playsInline preload="auto"
                onPlay={() => setPlaying(true)} onPause={() => setPlaying(false)}
                onEnded={() => { setPlaying(false); setPreview(null); if (videoRef.current) videoRef.current.muted = false; }} />
              {preview && <span className="badge">{preview.phase === "hook" ? "New hook" : `Original from ${b2.id}`}</span>}
              {preview?.phase === "hook" && <div className="mask top" aria-hidden="true" />}
              {reveal && (
                <div className="mask cap">
                  <span className="say" key={reveal.length}>{reveal.map((w, i) => i === reveal.length - 1 ? <b key={i}>{w}</b> : `${w} `)}</span>
                </div>
              )}
            </div>
            <div className="pctl">
              <div className="tc">{fmt(time)}<span>/ {fmt(reel.duration)}</span></div>
              <div className="now-beat">{nowBeat.id} · {nowBeat.label}</div>
              <button type="button" onClick={togglePlay}>{playing ? <><Pause />Pause</> : <><Play />Play reel</>}</button>
              {preview && <p className="note">Preview cut: new hook as captions over the original first seconds, then the original from {b2.id}. The voice-over is recorded in the render.</p>}
            </div>
          </div>

          <div>
            <div className="sec-bar" style={{ marginBottom: 4 }}><h2>Hook rewrite</h2><span className="lbl">{b1.id} · {fmt(b1.start)}–{fmt(b1.end)}</span></div>
            <p className="cur">“{hookText}”</p>
            <LintChips lint={curLint} />
          </div>

          <div className="pace">
            <label htmlFor="pace">VO pace</label>
            <input id="pace" type="range" min="0.8" max="1.4" step="0.05" value={paceMul} onChange={(e) => setPaceMul(Number(e.target.value))} />
            <span>{pace.toFixed(1)} syl/s</span>
          </div>

          <div>
            <div className="sec-bar" style={{ marginBottom: 4 }}>
              <span className="lbl">{lang === "taglish" ? "Taglish rewrites" : "Rewrites"} · {optSource === "live" ? `written by ${currentEngine()?.label ?? "AI"} just now` : "saved run"}</span>
              <button type="button" className="ghost" onClick={askClaude} disabled={busy || aiMode === "saved"}
                title={aiMode === "saved" ? "Add ANTHROPIC_API_KEY to .env.local, or open the hosted page" : "Write 4 new rewrites"}>
                {busy ? <span className="spinner" /> : <Spark />}Write 4 with AI
              </button>
            </div>
            {aiErr && <p className="err">{aiErr} The saved run is still here.</p>}
            <div className={`opts${step === 2 ? " cue" : ""}`} role="radiogroup" aria-label="Hook options">
              {options.map((o, i) => (
                <label key={o.text} className={`opt${picked === i ? " sel" : ""}`}>
                  <input type="radio" name="hook" checked={picked === i} onChange={() => pick(i)} />
                  <p>“{o.text}”</p>
                  <span className={`t ${lints[i].landsAt <= 2.5 ? "good" : "bad"}`}>≈ {lints[i].landsAt} s</span>
                  {picked === i && <><LintChips lint={lints[i]} /><span className="why">{o.why}</span></>}
                </label>
              ))}
              <label className={`opt${picked === -1 ? " sel" : ""}`}>
                <input type="radio" name="hook" checked={picked === -1} onChange={() => pick(-1)} />
                <input type="text" placeholder="Type your own hook to lint it" value={own}
                  onFocus={() => pick(-1)} onChange={(e) => setOwn(e.target.value)} aria-label="Your own hook" style={{ gridColumn: "2 / -1" }} />
                {ownLint && picked === -1 && <LintChips lint={ownLint} />}
              </label>
            </div>
          </div>

          <div className="acts">
            <button type="button" className={`${step <= 3 ? "pri" : ""}${step === 3 ? " cue" : ""}`} onClick={startPreview} disabled={!chosen}><Play />3 · Preview</button>
            <button type="button" className={`${step >= 4 ? "pri" : ""}${step === 4 ? " cue" : ""}`} onClick={doRender}
              disabled={!chosen || !renderInfo || Boolean(rendering)}
              title={!renderInfo ? "Rendering runs on the local app (npm run dev)" : undefined}>
              {rendering ? <span className="spinner" /> : <Spark />}{rendering ? "Rendering…" : "4 · Render MP4"}
            </button>
            <button type="button" className="ghost" onClick={copyForRender} disabled={!chosen} title="Copy a JSON brief for your own render pipeline"><Copy />Copy brief</button>
            {rendering && <p className="note" role="status" style={{ flexBasis: "100%" }}>{rendering}</p>}
            {renderErr && <p className="err" style={{ flexBasis: "100%" }}>{renderErr}</p>}
            {!renderInfo && <p className="note" style={{ flexBasis: "100%" }}>Rendering runs on the local app, where ffmpeg and the voice key live.</p>}
            {newRuntime && <p className="note" style={{ flexBasis: "100%" }}>New cut runs about {newRuntime.toFixed(1)} s instead of {reel.duration.toFixed(1)} s. Hook lint checks rules, not predicted views.</p>}
          </div>
        </aside>

        <section className="takes" aria-labelledby="next">
          <div className="sec-bar">
            <h2 id="next">Next batch<span className="sum">{summary(takes)}</span></h2>
            <button type="button" onClick={() => onOpenTake(takes[0]?.code ?? "")}>Open board</button>
          </div>
          <div className="row">
            {takes.map((t) => (
              <button type="button" className="tk" key={t.code} onClick={() => onOpenTake(t.code)}>
                <h3>{t.code}</h3>
                <span className={`s ${t.status}`}>{label(t.status)}</span>
                <p>{t.format}</p>
                {t.note && t.status !== "hooks" && t.status !== "script" && (
                  <span className={`bc${t.note.startsWith("Blocked") || t.status === "rejected" ? " no" : ""}`}>
                    {t.note.startsWith("Blocked") || t.status === "rejected" ? <Cross /> : <Check />}
                    {t.note.startsWith("Blocked") ? "blocked" : t.note}
                  </span>
                )}
              </button>
            ))}
          </div>
        </section>
      </div>
    </>
  );
}

function LintChips({ lint }: { lint: HookLint }) {
  return (
    <div className="chips">
      <span className={`chip ${lint.landsAt <= 2.5 ? "good" : "bad"}`}>{lint.measured ? "finishes" : "lands ≈"} {lint.landsAt} s</span>
      <span className="chip">{lint.talksToYou ? <Check /> : <Cross />}talks to you</span>
      <span className="chip">{lint.words} words · {lint.syllables} syl</span>
      <span className="chip">{lint.lang}</span>
      {lint.opensQuestion && <span className="chip">opens a question</span>}
      {lint.beforeDrop === false && <span className="chip bad">after the drop</span>}
      {lint.banned.length > 0 && <span className="chip bad">banned: {lint.banned.join(", ")}</span>}
    </div>
  );
}

function revealWords(text: string, t: number, pace: number) {
  const words = text.split(/\s+/).filter(Boolean);
  let acc = 0.15;
  const out: string[] = [];
  for (const w of words) {
    if (t < acc) break;
    out.push(w);
    acc += syllables(w) / pace;
  }
  return out.length ? out : [words[0]];
}

export function label(s: Take["status"]) {
  return { hooks: "Hooks", script: "Script", checks: "Checks", rendered: "Ready to render", rejected: "Rejected" }[s];
}

function summary(takes: Take[]) {
  const c = (s: Take["status"]) => takes.filter((t) => t.status === s).length;
  return `${c("rendered")} ready to render · ${c("checks")} in checks · ${c("script")} script · ${c("hooks")} hooks · ${c("rejected")} rejected`;
}

const STEPS = ["See where they left", "Pick a shorter hook", "Preview it", "Render the MP4"];

function Stepper({ step, hookEnd, dropAt, onSeen, canRender }: { step: number; hookEnd: number; dropAt: number | null; onSeen: () => void; canRender: boolean }) {
  const say: Record<number, React.ReactNode> = {
    1: <>The coral line is where most viewers swiped away ({dropAt != null ? fmt(dropAt) : "—"}). The old hook kept talking until {hookEnd.toFixed(1)} s. <button type="button" className="linkish" onClick={onSeen}>Got it, next</button></>,
    2: <>Pick one of the shorter hooks on the right, or type your own. Blue times land before the drop; coral ones land after it.</>,
    3: <>Press <b>Preview</b> to hear and see the new opening over the real reel.</>,
    4: canRender ? <>Press <b>Render MP4</b>. BEAT records the new voice-over and cuts a real video file.</> : <>Rendering needs the local app. Run <code>npm run dev</code> and open it there.</>,
    5: <>Done. Compare before and after above, then download the MP4. Try another hook any time.</>,
  };
  return (
    <section className="stepper" aria-label="What to do">
      <ol>
        {STEPS.map((s, i) => (
          <li key={s} className={i + 1 < step ? "done" : i + 1 === step ? "now" : ""} aria-current={i + 1 === step ? "step" : undefined}>
            <span className="n">{i + 1 < step ? <Check /> : i + 1}</span>{s}
          </li>
        ))}
      </ol>
      <p>{say[step]}</p>
    </section>
  );
}
