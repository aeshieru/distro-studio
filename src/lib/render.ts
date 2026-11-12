// Browser side of the render: draws the caption balloons as 1080×1920 PNG overlays
// and asks the local studio server for the voice-over and the ffmpeg cut.

export type Word = { w: string; start: number; end: number };
export type RenderResult = { url: string; path: string; duration: number; sizeMB: number; lufs: number | null; voice: string | null; landsAt: number; measured: boolean };

const W = 1080, H = 1920;

export async function renderAvailable(): Promise<{ ready: boolean; voice: string | null } | null> {
  try {
    const r = await fetch("api/render");
    if (!r.ok) return null;
    const j = await r.json();
    return j?.ready ? j : null;
  } catch {
    return null;
  }
}

async function post<T>(url: string, body: unknown): Promise<T> {
  const r = await fetch(url, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(j.message ?? "The request failed.");
  return j as T;
}

function wrap(ctx: CanvasRenderingContext2D, words: string[], max: number) {
  const lines: string[][] = [[]];
  for (const w of words) {
    const line = lines[lines.length - 1];
    const test = [...line, w].join(" ");
    if (line.length && ctx.measureText(test).width > max) lines.push([w]);
    else line.push(w);
  }
  return lines;
}

async function captionPng(shown: string[]): Promise<string> {
  await document.fonts.load("64px 'Patrick Hand SC'");
  const c = document.createElement("canvas");
  c.width = W; c.height = H;
  const ctx = c.getContext("2d")!;
  // The new hook plays over the clean render of the reel, so nothing needs covering.

  ctx.font = "64px 'Patrick Hand SC', 'Comic Neue', cursive";
  ctx.textBaseline = "middle";
  const lines = wrap(ctx, shown, 820);
  const lh = 74;
  const widths = lines.map((l) => ctx.measureText(l.join(" ")).width);
  const bw = Math.max(...widths) + 90, bh = lines.length * lh + 50;
  const bx = (W - bw) / 2, by = H * 0.655 - bh / 2;

  // Balloon with a tail, in the strip's ink and white.
  ctx.lineWidth = 6;
  ctx.strokeStyle = "#120D22";
  ctx.fillStyle = "#FFFFFF";
  ctx.beginPath();
  ctx.roundRect(bx, by, bw, bh, bh / 2);
  ctx.fill(); ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(bx + 70, by + 3); ctx.lineTo(bx + 54, by - 34); ctx.lineTo(bx + 112, by + 3);
  ctx.fill(); ctx.stroke();
  ctx.fillRect(bx + 72, by + 2, 38, 8);

  let wi = 0;
  const total = shown.length;
  lines.forEach((line, li) => {
    let x = W / 2 - widths[li] / 2;
    const y = by + 25 + lh * li + lh / 2;
    line.forEach((w) => {
      wi += 1;
      ctx.fillStyle = wi === total ? "#6B2FD6" : "#120D22";
      ctx.fillText(w, x, y);
      x += ctx.measureText(w + " ").width;
    });
  });
  return c.toDataURL("image/png");
}

// Estimated word timing when there is no voice-over: same pace rule as the hook lint.
export function estimateWords(text: string, pace: number, syllables: (w: string) => number): Word[] {
  let t = 0.15;
  return text.split(/\s+/).filter(Boolean).map((w) => {
    const d = syllables(w) / pace;
    const word = { w, start: t, end: t + d };
    t += d;
    return word;
  });
}

export async function renderNewHook(opts: {
  text: string;
  withVoice: boolean;
  cutTo: number;
  duration: number;
  estimate: () => Word[];
  onStep: (id: "voice" | "captions" | "cut", state: "now" | "done", detail?: string) => void;
}): Promise<RenderResult> {
  let id: string | undefined;
  let words: Word[];
  let measured = false;
  if (opts.withVoice) {
    opts.onStep("voice", "now", `“${opts.text}”`);
    const tts = await post<{ id: string; words: Word[]; landsAt: number }>("api/tts", { text: opts.text });
    id = tts.id;
    words = tts.words;
    measured = true;
    opts.onStep("voice", "done", `${tts.words.length} words, finishes at ${tts.landsAt.toFixed(1)} s`);
  } else {
    words = opts.estimate();
  }
  const landsAt = words[words.length - 1].end;
  const introEnd = landsAt + 0.45;

  opts.onStep("captions", "now", `0 of ${words.length} words`);
  const overlays = [];
  for (let k = 1; k <= words.length; k++) {
    opts.onStep("captions", "now", `${k} of ${words.length} words`);
    overlays.push({
      png: await captionPng(words.slice(0, k).map((w) => w.w)),
      start: k === 1 ? 0 : words[k - 1].start,
      end: k < words.length ? words[k].start : introEnd,
    });
  }

  opts.onStep("captions", "done", `${words.length} word-by-word captions`);
  opts.onStep("cut", "now", "new hook over the clean footage, then the original from Step 1");
  const out = await post<Omit<RenderResult, "landsAt" | "measured">>("api/render", { id, overlays, introEnd, cutTo: opts.cutTo, duration: opts.duration });
  opts.onStep("cut", "done", `${out.duration.toFixed(1)} s · ${out.sizeMB} MB${out.lufs != null ? ` · ${out.lufs} LUFS` : ""}`);
  return { ...out, landsAt, measured };
}

// ---- Animatic: a timed storyboard of a planned take ----------------------

type TakeLike = { code: string; format: string; title: string; hook: string; beats: { label: string; seconds: number }[]; claims: string[] };

const fmtT = (t: number) => `${Math.floor(t / 60)}:${String(Math.floor(t % 60)).padStart(2, "0")}`;

async function cardPng(o: { take: TakeLike; brandName: string; cta: string; index: number; start: number; end: number; hookWords?: string[] }): Promise<string> {
  await Promise.all([document.fonts.load("64px 'Patrick Hand SC'"), document.fonts.load("800 40px Archivo"), document.fonts.load("500 30px 'Public Sans'")]);
  const c = document.createElement("canvas"); c.width = W; c.height = H;
  const ctx = c.getContext("2d")!;
  const { take, index } = o;
  const beat = take.beats[index];
  const last = index === take.beats.length - 1;
  ctx.fillStyle = "#080410"; ctx.fillRect(0, 0, W, H);
  // Header: brand, take, and an honest label.
  ctx.fillStyle = "#B9B4CC"; ctx.font = "500 30px 'Public Sans', sans-serif"; ctx.textBaseline = "top";
  ctx.fillText(`${o.brandName} · ${codeLabel(take.code)} ${take.format}`, 80, 96);
  ctx.fillStyle = "#A684FF"; ctx.font = "700 26px Archivo, sans-serif";
  const tag = "ANIMATIC"; ctx.fillText(tag, W - 80 - ctx.measureText(tag).width, 98);
  // Beat progress.
  const n = take.beats.length, gap = 12, bw = (W - 160 - gap * (n - 1)) / n;
  take.beats.forEach((_, i) => { ctx.fillStyle = i <= index ? "#8E51FF" : "#2B2742"; ctx.fillRect(80 + i * (bw + gap), 160, bw, 10); });
  // The panel.
  const px = 80, py = 260, pw = W - 160, ph = 1060;
  ctx.fillStyle = "#17132A"; ctx.fillRect(px, py, pw, ph);
  for (let y = py + 6; y < py + ph; y += 14) for (let x = px + 6; x < px + pw; x += 14) { ctx.fillStyle = "rgba(142,81,255,0.16)"; ctx.fillRect(x, y, 3, 3); }
  ctx.strokeStyle = "#3D3760"; ctx.lineWidth = 4; ctx.strokeRect(px, py, pw, ph);
  ctx.fillStyle = "#A684FF"; ctx.font = "700 34px Archivo, sans-serif";
  ctx.fillText(`Beat ${index + 1} · ${fmtT(o.start)}–${fmtT(o.end)}`, px + 48, py + 48);
  ctx.fillStyle = "#FFFFFF"; ctx.font = "84px 'Patrick Hand SC', cursive"; ctx.textBaseline = "middle";
  const text = last && /end card/i.test(beat.label) ? o.cta : beat.label;
  const lines = wrap(ctx, text.split(/\s+/), pw - 120);
  lines.forEach((l, i) => ctx.fillText(l.join(" "), px + 60, py + ph / 2 - ((lines.length - 1) * 50) + i * 100));
  // Caption box under the panel.
  ctx.fillStyle = "#1C1838"; ctx.fillRect(px, py + ph + 40, pw, 200);
  ctx.strokeStyle = "#3D3760"; ctx.lineWidth = 3; ctx.strokeRect(px, py + ph + 40, pw, 200);
  ctx.fillStyle = "#B9B4CC"; ctx.font = "500 30px 'Public Sans', sans-serif"; ctx.textBaseline = "top";
  ctx.fillText(index === 0 ? "Spoken hook" : last ? "End card" : "On screen", px + 36, py + ph + 64);
  ctx.fillStyle = "#FFFFFF"; ctx.font = "56px 'Patrick Hand SC', cursive";
  const cap = index === 0 ? `“${(o.hookWords ?? take.hook.split(/\s+/)).join(" ")}”` : last ? take.title : beat.label;
  wrap(ctx, cap.split(/\s+/), pw - 72).slice(0, 2).forEach((l, i) => ctx.fillText(l.join(" "), px + 36, py + ph + 112 + i * 62));
  return c.toDataURL("image/png");
}

export type AnimaticResult = { url: string; path: string; sizeMB: number; lufs: number | null; duration: number; voice: string | null };

export async function renderAnimatic(o: { take: TakeLike; brandName: string; cta: string; withVoice: boolean; onStage: (s: string) => void }): Promise<AnimaticResult> {
  let id: string | undefined;
  let landsAt = 0;
  if (o.withVoice) {
    o.onStage("Recording the hook voice-over…");
    const tts = await post<{ id: string; landsAt: number }>("api/tts", { text: o.take.hook });
    id = tts.id; landsAt = tts.landsAt;
  }
  o.onStage("Drawing the storyboard…");
  const secs = o.take.beats.map((b, i) => (i === 0 ? Math.max(b.seconds, landsAt + 0.6) : b.seconds));
  let t = 0;
  const frames = [];
  for (let i = 0; i < o.take.beats.length; i++) {
    frames.push({ png: await cardPng({ take: o.take, brandName: o.brandName, cta: o.cta, index: i, start: t, end: t + secs[i] }), seconds: secs[i] });
    t += secs[i];
  }
  o.onStage("Cutting the animatic…");
  return post<AnimaticResult>("api/animatic", { id, code: o.take.code, frames });
}

// A plain-text production pack for whoever makes the final video.
export function productionPack(take: TakeLike & { animatic?: { path: string } }, brand: { name: string; cta: string; voice: string }, checks: { label: string; state: string; detail: string }[]) {
  let t = 0;
  const shots = take.beats.map((b, i) => { const line = `${i + 1}. ${fmtT(t)}–${fmtT(t + b.seconds)}  ${b.label}`; t += b.seconds; return line; });
  return [
    `# ${brand.name} · ${codeLabel(take.code)} ${take.format}: ${take.title}`,
    "",
    `**Hook (spoken, first line):** "${take.hook}"`,
    `**Runtime:** ${t} s · **Voice:** ${brand.voice}`,
    `**End card:** ${brand.cta}`,
    "",
    "## Shot list",
    ...shots,
    "",
    ...((take as { animatic?: { lines?: string[] } }).animatic?.lines?.length ? ["## Voice-over", ...(take as { animatic?: { lines?: string[] } }).animatic!.lines!.map((l, i) => `${i + 1}. ${l}`), ""] : []),
    "## Claims made (all on the approved list)",
    ...(take.claims.length ? take.claims.map((c) => `- ${c}`) : ["- none"]),
    "",
    "## Brand checks",
    ...checks.map((c) => `- [${c.state === "pass" ? "x" : " "}] ${c.label}: ${c.detail}`),
    "",
    take.animatic ? `Draft cut: ${take.animatic.path}` : "Draft cut: not rendered yet",
    "",
    "Made with Distro.",
  ].join("\n");
}

// ---- Draft cut: own footage + sketches + per-beat voice-over --------------

import { renderToStaticMarkup } from "react-dom/server";
import { codeLabel } from "./codes";
import { createElement } from "react";
import { PANEL_Y, matchShot, type FootageLibrary } from "../data/footage";
import { sketchFor } from "../components/Storyboard";

export type DraftResult = AnimaticResult & { plan: { label: string; source: string }[]; lines: string[] };

async function sketchImage(label: string, i: number): Promise<HTMLImageElement> {
  const svg = renderToStaticMarkup(createElement("svg", {
    xmlns: "http://www.w3.org/2000/svg", viewBox: "0 0 160 100", width: 960, height: 600,
    fill: "none", stroke: "#2a2440", strokeWidth: 2, strokeLinecap: "round", strokeLinejoin: "round",
  }, sketchFor(label, i)));
  const img = new Image();
  img.src = "data:image/svg+xml;charset=utf-8," + encodeURIComponent(svg);
  await img.decode();
  return img;
}

async function draftFrame(o: {
  brandName: string; code: string; format: string; index: number; count: number; start: number; end: number;
  label: string; line: string; hook?: string; source: string; window: { height: number };
  footage: boolean; sketch?: HTMLImageElement; endCard?: string;
}): Promise<string> {
  await Promise.all([document.fonts.load("64px 'Patrick Hand SC'"), document.fonts.load("800 40px Archivo"), document.fonts.load("500 30px 'Public Sans'")]);
  const c = document.createElement("canvas"); c.width = W; c.height = H;
  const ctx = c.getContext("2d")!;
  const wh = Math.round(H * o.window.height / 2) * 2;
  ctx.fillStyle = "#080410"; ctx.fillRect(0, 0, W, H);
  // Header and progress.
  ctx.textBaseline = "top";
  ctx.fillStyle = "#B9B4CC"; ctx.font = "500 30px 'Public Sans', sans-serif";
  ctx.fillText(`${o.brandName} · ${codeLabel(o.code)} ${o.format}`, 60, 70);
  ctx.fillStyle = "#A684FF"; ctx.font = "700 26px Archivo, sans-serif";
  const tag = "DRAFT CUT"; ctx.fillText(tag, W - 60 - ctx.measureText(tag).width, 72);
  const gap = 10, bw = (W - 120 - gap * (o.count - 1)) / o.count;
  for (let i = 0; i < o.count; i++) { ctx.fillStyle = i <= o.index ? "#8E51FF" : "#2B2742"; ctx.fillRect(60 + i * (bw + gap), 130, bw, 8); }
  // Above the window: the hook balloon on beat 1, otherwise the beat and its time.
  if (o.hook) {
    ctx.font = "60px 'Patrick Hand SC', cursive"; ctx.textBaseline = "middle";
    const lines = wrap(ctx, o.hook.split(/\s+/), 860);
    const lw = Math.max(...lines.map((l) => ctx.measureText(l.join(" ")).width));
    const bwid = lw + 80, bh = lines.length * 66 + 40, bx = (W - bwid) / 2, by = 300 - bh / 2;
    ctx.fillStyle = "#FFFFFF"; ctx.strokeStyle = "#120D22"; ctx.lineWidth = 5;
    ctx.beginPath(); ctx.roundRect(bx, by, bwid, bh, bh / 2); ctx.fill(); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(bx + 90, by + bh - 3); ctx.lineTo(bx + 76, by + bh + 34); ctx.lineTo(bx + 132, by + bh - 3); ctx.fill(); ctx.stroke();
    ctx.fillRect(bx + 92, by + bh - 8, 38, 9);
    ctx.fillStyle = "#120D22";
    lines.forEach((l, i) => ctx.fillText(l.join(" "), W / 2 - ctx.measureText(l.join(" ")).width / 2, by + 20 + 33 + i * 66));
  } else {
    ctx.fillStyle = "#A684FF"; ctx.font = "700 32px Archivo, sans-serif"; ctx.textBaseline = "top";
    ctx.fillText(`Beat ${o.index + 1} · ${fmtT(o.start)}–${fmtT(o.end)}`, 60, 210);
    ctx.fillStyle = "#FFFFFF"; ctx.font = "62px 'Patrick Hand SC', cursive";
    wrap(ctx, o.label.split(/\s+/), W - 120).slice(0, 2).forEach((l, i) => ctx.fillText(l.join(" "), 60, 270 + i * 66));
  }
  // The window: transparent for footage (the server puts the shot behind it), drawn otherwise.
  if (o.footage) ctx.clearRect(0, PANEL_Y, W, wh);
  else if (o.endCard) {
    ctx.fillStyle = "#17132A"; ctx.fillRect(0, PANEL_Y, W, wh);
    ctx.fillStyle = "#FFFFFF"; ctx.font = "800 88px Archivo, sans-serif"; ctx.textBaseline = "middle";
    const n = o.brandName; ctx.fillText(n, W / 2 - ctx.measureText(n).width / 2, PANEL_Y + wh / 2 - 60);
    ctx.fillStyle = "#A684FF"; ctx.font = "60px 'Patrick Hand SC', cursive";
    wrap(ctx, o.endCard.split(/\s+/), W - 160).slice(0, 2).forEach((l, i) => ctx.fillText(l.join(" "), W / 2 - ctx.measureText(l.join(" ")).width / 2, PANEL_Y + wh / 2 + 40 + i * 70));
  } else {
    ctx.fillStyle = "#F4F2FB"; ctx.fillRect(0, PANEL_Y, W, wh);
    if (o.sketch) ctx.drawImage(o.sketch, (W - 960) / 2, PANEL_Y + (wh - 600) / 2, 960, 600);
  }
  ctx.strokeStyle = "#3D3760"; ctx.lineWidth = 6; ctx.strokeRect(3, PANEL_Y - 3, W - 6, wh + 6);
  ctx.fillStyle = "rgba(8,4,16,0.75)"; ctx.fillRect(W - 300, PANEL_Y + wh - 54, 300, 54);
  ctx.fillStyle = "#B9B4CC"; ctx.font = "500 26px 'Public Sans', sans-serif"; ctx.textBaseline = "middle";
  const src = o.source; ctx.fillText(src, W - 20 - ctx.measureText(src).width, PANEL_Y + wh - 27);
  // Caption box: the spoken line.
  const cy = PANEL_Y + wh + 60, ch = 360;
  ctx.fillStyle = "#1C1838"; ctx.fillRect(60, cy, W - 120, ch);
  ctx.strokeStyle = "#3D3760"; ctx.lineWidth = 3; ctx.strokeRect(60, cy, W - 120, ch);
  ctx.fillStyle = "#B9B4CC"; ctx.font = "500 28px 'Public Sans', sans-serif"; ctx.textBaseline = "top";
  ctx.fillText("Voice-over", 96, cy + 30);
  ctx.fillStyle = "#FFFFFF"; ctx.font = "64px 'Patrick Hand SC', cursive";
  wrap(ctx, o.line.split(/\s+/), W - 200).slice(0, 4).forEach((l, i) => ctx.fillText(l.join(" "), 96, cy + 86 + i * 70));
  return c.toDataURL("image/png");
}

export async function renderDraftCut(o: {
  take: TakeLike; brandName: string; cta: string; lines: string[]; library?: FootageLibrary;
  withVoice: boolean; onStep: (id: "voice" | "match" | "frames" | "cut", state: "now" | "done", detail?: string) => void;
}): Promise<DraftResult> {
  const beats = o.take.beats;
  const lines = beats.map((b, i) => o.lines[i] ?? (i === 0 ? o.take.hook : b.label));
  // Record each line; a beat is never shorter than its line.
  let id: string | undefined;
  const lineDur: number[] = [];
  if (o.withVoice) {
    o.onStep("voice", "now", `0 of ${lines.length} lines`);
    for (let i = 0; i < lines.length; i++) {
      const r = await post<{ id: string; landsAt: number }>("api/tts", { text: lines[i], id, name: `line-${i}` });
      id = r.id; lineDur.push(r.landsAt);
      o.onStep("voice", "now", `${i + 1} of ${lines.length} lines · “${lines[i].slice(0, 40)}${lines[i].length > 40 ? "…" : ""}” ${r.landsAt.toFixed(1)} s`);
    }
    o.onStep("voice", "done", `${lines.length} lines, ${lineDur.reduce((a, b) => a + b, 0).toFixed(1)} s of speech`);
  }
  const secs = beats.map((b, i) => Math.max(b.seconds, (lineDur[i] ?? 0) + 0.5));
  o.onStep("match", "now");
  const plan: { label: string; source: string }[] = [];
  const segments: unknown[] = [];
  const atTimes: number[] = [];
  let t = 0;
  for (let i = 0; i < beats.length; i++) {
    const b = beats[i];
    const last = i === beats.length - 1;
    const isEnd = last && /end card|logo|cta/i.test(b.label);
    const shot = isEnd ? null : matchShot(b.label + " " + lines[i], o.library);
    const sketch = shot || isEnd ? undefined : await sketchImage(b.label, i);
    const source = shot ? `Footage: ${shot.label}` : isEnd ? "End card" : "Sketch";
    plan.push({ label: b.label, source });
    o.onStep("match", "now", plan.map((p, k) => `${k + 1}: ${p.source.replace("Footage: ", "")}`).join(" · "));
    if (i === 0) o.onStep("frames", "now", `1 of ${beats.length}`); else o.onStep("frames", "now", `${i + 1} of ${beats.length}`);
    const png = await draftFrame({
      brandName: o.brandName, code: o.take.code, format: o.take.format, index: i, count: beats.length,
      start: t, end: t + secs[i], label: b.label, line: lines[i], hook: i === 0 ? o.take.hook : undefined,
      source, window: o.library?.window ?? { height: 0.38 }, footage: Boolean(shot), sketch, endCard: isEnd ? o.cta : undefined,
    });
    if (shot) {
      const room = shot.end - shot.start;
      const start = room >= secs[i] ? shot.start + Math.min(0.4 * i, room - secs[i]) : Math.max(0, shot.end - secs[i]);
      segments.push({ kind: "footage", start, seconds: secs[i], png, cropTop: Math.max(0, shot.focus - (o.library?.window.height ?? 0.42) / 2) });
    } else segments.push({ kind: "still", seconds: secs[i], png });
    atTimes.push(t + 0.15);
    t += secs[i];
  }
  const nFoot = plan.filter((p) => p.source.startsWith("Footage")).length;
  o.onStep("match", "done", `${nFoot} from your footage, ${plan.length - nFoot - (plan.some((p) => p.source === "End card") ? 1 : 0)} sketched, end card drawn`);
  o.onStep("frames", "done", `${beats.length} frames`);
  o.onStep("cut", "now", "ffmpeg is cutting and mixing");
  const out = await post<AnimaticResult>("api/roughcut", {
    id, code: o.take.code, window: o.library?.window ?? { top: 0.21, height: 0.38 }, segments,
    lines: o.withVoice ? lines.map((_, i) => ({ file: `line-${i}.mp3`, at: atTimes[i] })) : [],
  });
  o.onStep("cut", "done", `${out.duration.toFixed(1)} s · ${out.sizeMB} MB`);
  return { ...out, plan, lines };
}

// ---- 3D draft: Distro builds the picture itself --------------------------------

import { recordScene, type Look } from "./scene3d";

export async function render3DDraft(o: {
  take: TakeLike; brandName: string; cta: string; lines: string[]; look: Look; withVoice: boolean;
  onStep: (id: "voice" | "build" | "record" | "cut", state: "now" | "done", detail?: string) => void;
}): Promise<DraftResult> {
  const beats = o.take.beats;
  const lines = beats.map((b, i) => o.lines[i] ?? (i === 0 ? o.take.hook : b.label));
  let id: string | undefined;
  const lineDur: number[] = [];
  if (o.withVoice) {
    o.onStep("voice", "now", `0 of ${lines.length} lines`);
    for (let i = 0; i < lines.length; i++) {
      const r = await post<{ id: string; landsAt: number }>("api/tts", { text: lines[i], id, name: `line-${i}` });
      id = r.id; lineDur.push(r.landsAt);
      o.onStep("voice", "now", `${i + 1} of ${lines.length} lines · “${lines[i].slice(0, 40)}${lines[i].length > 40 ? "…" : ""}” ${r.landsAt.toFixed(1)} s`);
    }
    o.onStep("voice", "done", `${lines.length} lines, ${lineDur.reduce((a, b) => a + b, 0).toFixed(1)} s of speech`);
  }
  const secs = beats.map((b, i) => Math.max(b.seconds, (lineDur[i] ?? 0) + 0.5));
  const total = secs.reduce((a, b) => a + b, 0);
  o.onStep("build", "now", "a set per beat from what it describes");
  o.onStep("build", "done", `${beats.length} sets · captions: ${o.look.captions}${o.look.cutEvery ? ` · a cut every ${o.look.cutEvery.toFixed(1)} s` : ""}`);
  o.onStep("record", "now", `0.0 of ${total.toFixed(1)} s`);
  const webm = await recordScene({ beats, lines, secs, appName: o.brandName, cta: o.cta, look: o.look, onProgress: (t, all) => o.onStep("record", "now", `${t.toFixed(1)} of ${all.toFixed(1)} s`) });
  assertRecorded(webm);
  o.onStep("record", "done", `${(webm.size / 1048576).toFixed(1)} MB recorded`);
  o.onStep("cut", "now", "adding the voice-over and exporting the MP4");
  const at = secs.map((_, i) => secs.slice(0, i).reduce((a, b) => a + b, 0) + 0.15);
  const q = new URLSearchParams({ code: o.take.code, total: String(total), lines: JSON.stringify(o.withVoice ? lines.map((_, i) => ({ file: `line-${i}.mp3`, at: at[i] })) : []) });
  if (id) q.set("id", id);
  const r = await fetch(`api/scenecut?${q}`, { method: "POST", headers: { "content-type": "video/webm" }, body: webm });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(j.message ?? "The 3D draft failed.");
  o.onStep("cut", "done", `${j.duration.toFixed(1)} s · ${j.sizeMB} MB`);
  return { ...(j as AnimaticResult), plan: beats.map((b) => ({ label: b.label, source: "3D scene" })), lines };
}

// ---- Motion-graphics explainer: editorial serif titles, floating app screens ----------

import { recordExplainer } from "./explainer";
import { assertRecorded } from "./recclock";

export async function renderExplainerDraft(o: {
  take: TakeLike; brandName: string; brandId: string; color: string; cta: string; lines: string[]; withVoice: boolean;
  onStep: (id: "voice" | "build" | "record" | "cut", state: "now" | "done", detail?: string) => void;
}): Promise<DraftResult> {
  const beats = o.take.beats;
  const lines = beats.map((b, i) => o.lines[i] ?? (i === 0 ? o.take.hook : b.label));
  let id: string | undefined;
  const lineDur: number[] = [];
  if (o.withVoice) {
    o.onStep("voice", "now", `0 of ${lines.length} lines`);
    for (let i = 0; i < lines.length; i++) {
      const r = await post<{ id: string; landsAt: number }>("api/tts", { text: lines[i], id, name: `line-${i}` });
      id = r.id; lineDur.push(r.landsAt);
      o.onStep("voice", "now", `${i + 1} of ${lines.length} lines · “${lines[i].slice(0, 40)}${lines[i].length > 40 ? "…" : ""}” ${r.landsAt.toFixed(1)} s`);
    }
    o.onStep("voice", "done", `${lines.length} lines, ${lineDur.reduce((a, b) => a + b, 0).toFixed(1)} s of speech`);
  }
  const secs = beats.map((b, i) => Math.max(b.seconds, (lineDur[i] ?? 0) + 0.7));
  const total = secs.reduce((a, b) => a + b, 0);
  o.onStep("build", "now", "title card, numbered sections, app screens, recap");
  o.onStep("build", "done", `title card · ${Math.max(1, beats.length - 2)} numbered sections · recap of stacked cards`);
  o.onStep("record", "now", `0.0 of ${total.toFixed(1)} s`);
  const webm = await recordExplainer({ beats, lines, secs, lineDur, appName: o.brandName, cta: o.cta, brandId: o.brandId, color: o.color, onProgress: (t, all) => o.onStep("record", "now", `${t.toFixed(1)} of ${all.toFixed(1)} s`) });
  assertRecorded(webm);
  o.onStep("record", "done", `${(webm.size / 1048576).toFixed(1)} MB recorded`);
  o.onStep("cut", "now", "adding the voice-over and exporting the MP4");
  const at = secs.map((_, i) => secs.slice(0, i).reduce((a, b) => a + b, 0) + 0.15);
  const q = new URLSearchParams({ code: o.take.code, total: String(total), lines: JSON.stringify(o.withVoice ? lines.map((_, i) => ({ file: `line-${i}.mp3`, at: at[i] })) : []) });
  if (id) q.set("id", id);
  const r = await fetch(`api/scenecut?${q}`, { method: "POST", headers: { "content-type": "video/webm" }, body: webm });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(j.message ?? "The motion-graphics draft failed.");
  o.onStep("cut", "done", `${j.duration.toFixed(1)} s · ${j.sizeMB} MB`);
  return { ...(j as AnimaticResult), plan: beats.map((b, i) => ({ label: b.label, source: i === 0 ? "Title card" : i === beats.length - 1 ? "Recap" : "Motion graphics" })), lines };
}
