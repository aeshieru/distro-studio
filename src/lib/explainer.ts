// Motion-graphics explainer: an editorial, no-face style for takes that recreate a reference
// reel's look. Serif headlines with one colored italic word, a numbered tab bar, the brand's
// real app screens floating in rounded cards (blurred "before" → sharp "after"), one full
// brand-color wordmark break, a recap of stacked cards, and word-by-word subtitles low in
// frame. Everything is drawn here on a 1080×1920 canvas and recorded in the browser.
import { visibleClock } from "./recclock";
import "@fontsource/instrument-serif/400.css";
import "@fontsource/instrument-serif/400-italic.css";
import { matchScreen, SCREENS } from "../data/screens";

const W = 1080, H = 1920;
const SERIF = "'Instrument Serif', Georgia, serif";
const SANS = "Inter, 'Helvetica Neue', Arial, sans-serif";
const MONO = "ui-monospace, 'SF Mono', Menlo, monospace";
const INK = "#141312";
const STOP = new Set("a an the and or but to of in on at for with your you my me i it its is are was this that so if what when how get just yours our we be".split(" "));

type Beat = { label: string; seconds: number };
export type ExplainerInput = {
  beats: Beat[]; lines: string[]; secs: number[]; lineDur: number[];
  appName: string; cta: string; brandId: string; color: string;
  onProgress: (t: number, total: number) => void;
};

// ---- easing and color helpers ------------------------------------------------
const clamp = (x: number, a = 0, b = 1) => Math.max(a, Math.min(b, x));
const ease = (x: number) => 1 - Math.pow(1 - clamp(x), 3); // easeOutCubic
const easeIO = (x: number) => { const t = clamp(x); return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2; };
const back = (x: number) => { const t = clamp(x), c = 1.6; return 1 + (c + 1) * Math.pow(t - 1, 3) + c * Math.pow(t - 1, 2); };
function hex(c: string) { const m = c.replace("#", ""); const n = parseInt(m.length === 3 ? m.split("").map((x) => x + x).join("") : m, 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; }
const rgba = (c: string, a: number) => { const [r, g, b] = hex(c); return `rgba(${r},${g},${b},${a})`; };
function mix(c: string, w: string, t: number) { const a = hex(c), b = hex(w); return `rgb(${a.map((v, i) => Math.round(v + (b[i] - v) * t)).join(",")})`; }

// The word that carries the line: longest non-filler word.
function keyIndex(words: string[]) {
  let best = -1, len = 0;
  words.forEach((w, i) => { const c = w.toLowerCase().replace(/[^a-z0-9']/g, ""); if (!STOP.has(c) && c.length > len) { len = c.length; best = i; } });
  return best;
}

// Rich headline: serif, with the key word italic in the brand color. Wraps to maxW.
function headline(x: CanvasRenderingContext2D, text: string, o: { x: number; y: number; maxW: number; size: number; align: "left" | "center"; color: string; alpha?: number; rise?: number }) {
  const words = text.replace(/\s+/g, " ").trim().split(" ");
  const k = keyIndex(words);
  const font = (i: number) => `${i === k ? "italic " : ""}400 ${o.size}px ${SERIF}`;
  const space = o.size * 0.24;
  const lines: { i: number; w: number }[][] = [[]];
  let lw = 0;
  words.forEach((w, i) => {
    x.font = font(i); const ww = x.measureText(w).width;
    if (lw + ww > o.maxW && lines[lines.length - 1].length) { lines.push([]); lw = 0; }
    lines[lines.length - 1].push({ i, w: ww }); lw += ww + space;
  });
  const lh = o.size * 1.02;
  x.textBaseline = "alphabetic";
  lines.forEach((ln, li) => {
    const total = ln.reduce((a, b) => a + b.w, 0) + space * (ln.length - 1);
    let cx = o.align === "center" ? o.x - total / 2 : o.x;
    ln.forEach(({ i, w }) => {
      x.font = font(i);
      x.fillStyle = i === k ? o.color : INK;
      x.globalAlpha = o.alpha ?? 1;
      x.fillText(words[i], cx, o.y + li * lh + (o.rise ?? 0) * (li + 1));
      cx += w + space;
    });
  });
  x.globalAlpha = 1;
  return lines.length * lh;
}

function roundRect(x: CanvasRenderingContext2D, rx: number, ry: number, w: number, h: number, r: number) {
  x.beginPath(); x.roundRect(rx, ry, w, h, r);
}

function background(x: CanvasRenderingContext2D, tint: string, drift: number) {
  const g = x.createLinearGradient(0, 0, W * 0.3, H);
  g.addColorStop(0, "#fbf8f2"); g.addColorStop(0.55, "#f6f1e8"); g.addColorStop(1, mix(tint, "#f4eee4", 0.9));
  x.fillStyle = g; x.fillRect(0, 0, W, H);
  // a soft glow that drifts slowly
  const rg = x.createRadialGradient(W * (0.75 + 0.05 * Math.sin(drift * 0.4)), H * 0.28, 40, W * 0.7, H * 0.3, W * 0.9);
  rg.addColorStop(0, rgba(tint, 0.1)); rg.addColorStop(1, rgba(tint, 0));
  x.fillStyle = rg; x.fillRect(0, 0, W, H);
  const v = x.createRadialGradient(W / 2, H / 2, H * 0.35, W / 2, H / 2, H * 0.78);
  v.addColorStop(0, "rgba(40,30,20,0)"); v.addColorStop(1, "rgba(40,30,20,0.12)");
  x.fillStyle = v; x.fillRect(0, 0, W, H);
}

function mono(x: CanvasRenderingContext2D, s: string, px: number, py: number, size: number, color: string, align: CanvasTextAlign = "left", spacing = 2) {
  x.font = `500 ${size}px ${MONO}`; x.fillStyle = color; x.textAlign = align; x.textBaseline = "middle";
  (x as CanvasRenderingContext2D & { letterSpacing?: string }).letterSpacing = `${spacing}px`;
  x.fillText(s, px, py);
  (x as CanvasRenderingContext2D & { letterSpacing?: string }).letterSpacing = "0px";
  x.textAlign = "left";
}

function brandMark(x: CanvasRenderingContext2D, name: string, color: string, a: number) {
  x.globalAlpha = a;
  x.fillStyle = color; x.beginPath(); x.arc(W - 96, 98, 10, 0, Math.PI * 2); x.fill();
  x.font = `italic 400 40px ${SERIF}`; x.fillStyle = INK; x.textAlign = "right"; x.textBaseline = "middle";
  x.fillText(name, W - 118, 100); x.textAlign = "left"; x.globalAlpha = 1;
}

function tabBar(x: CanvasRenderingContext2D, n: number, cur: number, color: string, p: number) {
  const w = 132, gap = 14, total = n * w + (n - 1) * gap, x0 = (W - total) / 2, y = 190;
  for (let i = 0; i < n; i++) {
    const on = i === cur;
    const bx = x0 + i * (w + gap);
    x.globalAlpha = ease(p * 1.6 - i * 0.12);
    roundRect(x, bx, y, w, 62, 31);
    x.fillStyle = on ? color : "rgba(20,19,18,0.06)"; x.fill();
    mono(x, String(i + 1).padStart(2, "0"), bx + w / 2, y + 32, 26, on ? "#fff" : "rgba(20,19,18,0.45)", "center", 3);
  }
  x.globalAlpha = 1;
}

// A floating card with the app screen: "before" (blurred, washed) blends into "after".
function screenCard(x: CanvasRenderingContext2D, img: HTMLImageElement | null, o: { cx: number; cy: number; w: number; h: number; p: number; t: number; color: string; label: string; appName: string }) {
  const lift = (1 - ease(o.p)) * 120, sc = 0.94 + 0.06 * ease(o.p);
  const fy = Math.sin(o.t * 1.4) * 8;
  const w = o.w * sc, h = o.h * sc, rx = o.cx - w / 2, ry = o.cy - h / 2 + lift + fy;
  x.save();
  x.globalAlpha = ease(o.p * 1.4);
  x.shadowColor = "rgba(40,28,16,0.22)"; x.shadowBlur = 70; x.shadowOffsetY = 34;
  roundRect(x, rx, ry, w, h, 44); x.fillStyle = "#fff"; x.fill();
  x.shadowColor = "transparent";
  roundRect(x, rx + 14, ry + 14, w - 28, h - 28, 32); x.clip();
  if (img) {
    const ir = img.width / img.height, br = (w - 28) / (h - 28);
    let sw = img.width, sh = img.height, sx = 0, sy = 0;
    if (ir > br) { sw = img.height * br; sx = (img.width - sw) / 2; } else { sh = img.width / br; sy = (img.height - sh) * 0.15; }
    const after = easeIO((o.p - 0.35) / 0.45);
    x.filter = `blur(${(1 - after) * 14}px) saturate(${0.35 + 0.65 * after})`;
    x.drawImage(img, sx, sy, sw, sh, rx + 14, ry + 14, w - 28, h - 28);
    x.filter = "none";
    x.fillStyle = `rgba(250,246,238,${0.4 * (1 - after)})`; x.fillRect(rx, ry, w, h);
  } else {
    const g = x.createLinearGradient(rx, ry, rx, ry + h);
    g.addColorStop(0, mix(o.color, "#ffffff", 0.82)); g.addColorStop(1, mix(o.color, "#ffffff", 0.55));
    x.fillStyle = g; x.fillRect(rx, ry, w, h);
    x.font = `italic 400 64px ${SERIF}`; x.fillStyle = INK; x.textAlign = "center"; x.textBaseline = "middle";
    x.fillText(o.appName, o.cx, ry + h * 0.42); x.textAlign = "left";
    mono(x, o.label.toUpperCase().slice(0, 24), o.cx, ry + h * 0.52, 22, "rgba(20,19,18,0.55)", "center");
  }
  x.restore();
  // a small status chip on the card, like a live app label
  const chipA = ease((o.p - 0.55) / 0.3);
  if (chipA > 0) {
    x.globalAlpha = chipA;
    x.font = `500 26px ${MONO}`; const tw = x.measureText(o.label.toLowerCase()).width + 60;
    roundRect(x, o.cx - tw / 2, ry - 34, tw, 58, 29); x.fillStyle = "#fff"; x.shadowColor = "rgba(40,28,16,0.18)"; x.shadowBlur = 24; x.fill(); x.shadowColor = "transparent";
    x.fillStyle = o.color; x.beginPath(); x.arc(o.cx - tw / 2 + 28, ry - 5, 8, 0, Math.PI * 2); x.fill();
    mono(x, o.label.toLowerCase(), o.cx + 12, ry - 4, 24, INK, "center", 1);
    x.globalAlpha = 1;
  }
}

// Word-by-word subtitles low in frame; the key word turns into colored italic serif.
function subtitles(x: CanvasRenderingContext2D, line: string, local: number, dur: number, color: string, fade: number) {
  const words = line.split(/\s+/).filter(Boolean);
  if (!words.length) return;
  const k = keyIndex(words);
  const per = Math.max(0.12, (dur * 0.92) / words.length);
  const shownN = clamp(Math.floor(local / per) + 1, 0, words.length);
  // a sliding window of up to ~7 words, two lines max
  const from = Math.max(0, Math.floor((shownN - 1) / 7) * 7);
  const slice = words.slice(from, Math.min(words.length, from + 7));
  const size = 44, space = 13;
  const fontOf = (i: number) => (i === k ? `italic 400 ${size * 1.3}px ${SERIF}` : `500 ${size}px ${SANS}`);
  let total = 0; const ws = slice.map((w, j) => { x.font = fontOf(from + j); const m = x.measureText(w).width; total += m; return m; });
  total += space * (slice.length - 1);
  let cx = (W - total) / 2; const cy = H * 0.785;
  x.textBaseline = "alphabetic";
  slice.forEach((w, j) => {
    const i = from + j;
    const appear = (local - i * per) / 0.22;
    if (appear > 0) {
      const a = ease(appear) * fade;
      x.globalAlpha = a; x.font = fontOf(i);
      x.filter = appear < 1 ? `blur(${(1 - ease(appear)) * 8}px)` : "none";
      x.fillStyle = i === k ? color : INK;
      x.fillText(w, cx, cy + (1 - ease(appear)) * 14);
      x.filter = "none";
    }
    cx += ws[j] + space;
  });
  x.globalAlpha = 1;
}

// ---- scenes -----------------------------------------------------------------

type Scene = { kind: "title" | "section" | "recap"; i: number };

function drawScene(x: CanvasRenderingContext2D, s: Scene, local: number, dur: number, o: ExplainerInput, imgs: (HTMLImageElement | null)[], t: number) {
  const n = o.beats.length;
  const sections = Math.max(1, n - 2);
  const p = local / Math.max(0.6, Math.min(1.2, dur * 0.4));
  background(x, o.color, t);
  if (s.kind === "title") {
    mono(x, `${sections} ${sections === 1 ? "THING" : "THINGS"} ${o.appName.toUpperCase()} DOES`, W / 2, 560, 26, "rgba(20,19,18,0.5)", "center", 6);
    const hh = headline(x, o.beats.length ? (o.lines[0] || o.beats[0].label) : "", { x: W / 2, y: 730, maxW: 900, size: 124, align: "center", color: o.color, alpha: ease(p), rise: (1 - ease(p)) * 30 });
    // the "icons" row: a tile per section, the app's real screens as thumbnails
    const tile = 168, gap = 26, total = sections * tile + (sections - 1) * gap, x0 = (W - total) / 2, ty = 730 + hh + 40;
    for (let k = 0; k < sections; k++) {
      const a = back((local - 0.5 - k * 0.12) / 0.45);
      if (a <= 0) continue;
      const bx = x0 + k * (tile + gap);
      x.save(); x.globalAlpha = clamp(a);
      x.translate(bx + tile / 2, ty + tile / 2); x.scale(a, a); x.translate(-(bx + tile / 2), -(ty + tile / 2));
      x.shadowColor = "rgba(40,28,16,0.2)"; x.shadowBlur = 30; x.shadowOffsetY = 14;
      roundRect(x, bx, ty, tile, tile, 34); x.fillStyle = mix(o.color, "#ffffff", 0.78 - k * 0.12); x.fill(); x.shadowColor = "transparent";
      const img = imgs[k + 1];
      if (img) { x.save(); roundRect(x, bx + 8, ty + 8, tile - 16, tile - 16, 26); x.clip(); const s2 = img.width; x.drawImage(img, 0, img.height * 0.08, s2, s2, bx + 8, ty + 8, tile - 16, tile - 16); x.restore(); }
      x.restore();
    }
  } else if (s.kind === "section") {
    tabBar(x, sections, s.i - 1, o.color, p);
    brandMark(x, o.appName, o.color, ease(p));
    mono(x, `${String(s.i).padStart(2, "0")} / ${String(sections).padStart(2, "0")}`, 90, 340, 26, o.color, "left", 4);
    headline(x, o.beats[s.i].label.replace(/^(app screen|end card):\s*/i, ""), { x: 90, y: 450, maxW: 900, size: 96, align: "left", color: o.color, alpha: ease(p - 0.1), rise: (1 - ease(p - 0.1)) * 24 });
    screenCard(x, imgs[s.i], { cx: W / 2, cy: 990, w: 620, h: 700, p: (local - 0.35) / Math.max(0.8, dur * 0.55), t, color: o.color, label: o.beats[s.i].label.split(/\s+/).slice(0, 3).join(" "), appName: o.appName });
  } else {
    mono(x, "SO BASICALLY…", W / 2, 230, 28, "rgba(20,19,18,0.5)", "center", 6);
    headline(x, `That's ${o.appName}.`, { x: W / 2, y: 380, maxW: 900, size: 110, align: "center", color: o.color, alpha: ease(p) });
    const cardH = 150, gap = 22, y0 = 520;
    const per = Math.min(0.5, (dur * 0.55) / sections);
    for (let k = 0; k < sections; k++) {
      const a = (local - 0.4 - k * per) / 0.5;
      if (a <= 0) continue;
      const y = y0 + k * (cardH + gap) - (1 - ease(a)) * 160;
      const shade = mix(o.color, "#ffffff", 0.15 + 0.2 * (k % 3));
      x.save(); x.globalAlpha = ease(a);
      x.shadowColor = "rgba(40,28,16,0.18)"; x.shadowBlur = 40; x.shadowOffsetY = 18;
      roundRect(x, 110, y, W - 220, cardH, 38); x.fillStyle = k % 2 ? "#ffffff" : shade; x.fill(); x.shadowColor = "transparent";
      mono(x, String(k + 1).padStart(2, "0"), 170, y + cardH / 2, 26, k % 2 ? o.color : "rgba(255,255,255,0.85)", "left", 3);
      x.font = `400 54px ${SERIF}`; x.fillStyle = k % 2 ? INK : "#fff"; x.textBaseline = "middle";
      const lab = o.beats[k + 1]?.label.replace(/^(app screen|end card):\s*/i, "") ?? "";
      x.fillText(lab.length > 30 ? `${lab.slice(0, 29)}…` : lab, 250, y + cardH / 2 + 4);
      x.restore();
    }
    const ca = ease((local - 0.6 - sections * per) / 0.5);
    if (ca > 0) {
      const y = y0 + sections * (cardH + gap) + 40;
      x.globalAlpha = ca;
      x.font = `italic 400 64px ${SERIF}`; x.fillStyle = INK; x.textAlign = "center"; x.textBaseline = "middle";
      x.fillText(o.cta.replace(new RegExp(`^${o.appName}\\s*[—:-]\\s*`, "i"), ""), W / 2, y + 30);
      x.textAlign = "left"; x.globalAlpha = 1;
    }
  }
}

// One full brand-color break with the wordmark, between the middle sections.
function wordmarkBreak(x: CanvasRenderingContext2D, q: number, o: ExplainerInput) {
  // q runs 0→1 over the break: wipe in, hold, wipe out
  const inP = easeIO(q / 0.35), outP = easeIO((q - 0.65) / 0.35);
  const top = H * (1 - inP), bottom = H * (1 - outP);
  if (bottom <= top + 1) return;
  x.fillStyle = o.color; x.fillRect(0, top, W, bottom - top);
  const a = clamp(Math.min(inP, 1 - outP) * 1.4);
  x.save(); x.beginPath(); x.rect(0, top, W, bottom - top); x.clip();
  x.globalAlpha = a;
  x.font = `italic 400 180px ${SERIF}`; x.fillStyle = "#fff"; x.textAlign = "center"; x.textBaseline = "middle";
  x.fillText(o.appName, W / 2, H / 2 - 10);
  mono(x, "BY THE WAY", W / 2, H / 2 + 120, 26, "rgba(255,255,255,0.8)", "center", 8);
  x.restore();
}

async function loadImg(src: string) {
  return new Promise<HTMLImageElement | null>((res) => { const i = new Image(); i.onload = () => res(i); i.onerror = () => res(null); i.src = src; });
}

export async function recordExplainer(o: ExplainerInput): Promise<Blob> {
  await Promise.all([document.fonts.load(`400 96px ${SERIF}`), document.fonts.load(`italic 400 96px ${SERIF}`), document.fonts.load(`500 44px ${SANS}`)]);
  const has = Boolean(SCREENS[o.brandId]?.length);
  // Best-matching screen per beat, never the same screen twice in a row of sections.
  const used = new Set<string>();
  const picks = o.beats.map((b, i) => {
    if (!has || i === 0 || i === o.beats.length - 1) return null;
    const list = SCREENS[o.brandId];
    let m = matchScreen(`${b.label} ${o.lines[i] ?? ""}`, o.brandId)!;
    if (used.has(m.id)) m = list.find((x) => !used.has(x.id)) ?? m;
    used.add(m.id);
    return m.src;
  });
  const imgs = await Promise.all(picks.map((src) => (src ? loadImg(src) : Promise.resolve(null))));
  const n = o.beats.length;
  const scenes: Scene[] = o.beats.map((_, i) => ({ kind: i === 0 ? "title" : i === n - 1 ? "recap" : "section", i }));
  const starts = o.secs.map((_, i) => o.secs.slice(0, i).reduce((a, b) => a + b, 0));
  const total = o.secs.reduce((a, b) => a + b, 0);
  const breakAt = n > 3 ? starts[1 + Math.floor((n - 2) / 2)] : -1;
  const BREAK = 1.1;

  const out = document.createElement("canvas"); out.width = W; out.height = H;
  const x = out.getContext("2d")!;
  const layer = document.createElement("canvas"); layer.width = W; layer.height = H;
  const lx = layer.getContext("2d")!;
  const stream = out.captureStream(30);
  const mime = ["video/webm;codecs=vp9", "video/webm;codecs=vp8", "video/webm"].find((m) => MediaRecorder.isTypeSupported(m)) ?? "video/webm";
  const rec = new MediaRecorder(stream, { mimeType: mime, videoBitsPerSecond: 12_000_000 });
  const chunks: Blob[] = [];
  rec.ondataavailable = (e) => e.data.size && chunks.push(e.data);
  const done = new Promise<void>((r) => { rec.onstop = () => r(); });
  rec.start(250);
  const TR = 0.45;
  const clock = visibleClock(rec);
  await new Promise<void>((resolve) => {
    const frame = () => {
      const t = clock.now();
      if (t >= total) { resolve(); return; }
      let i = starts.findIndex((s, k) => t >= s && t < s + o.secs[k]); if (i < 0) i = n - 1;
      const local = t - starts[i];
      // Blur-and-fade transition from the previous beat into this one.
      if (i > 0 && local < TR) {
        const q = easeIO(local / TR);
        drawScene(x, scenes[i - 1], o.secs[i - 1], o.secs[i - 1], o, imgs, t);
        lx.clearRect(0, 0, W, H);
        drawScene(lx, scenes[i], local, o.secs[i], o, imgs, t);
        x.save(); x.globalAlpha = q; x.filter = `blur(${(1 - q) * 18}px)`; x.drawImage(layer, 0, 0); x.restore();
      } else {
        drawScene(x, scenes[i], local, o.secs[i], o, imgs, t);
      }
      if (i > 0) subtitles(x, o.lines[i] ?? o.beats[i].label, local - 0.15, o.lineDur[i] || o.secs[i] * 0.8, o.color, clamp((o.secs[i] - local) / 0.3));
      if (breakAt > 0 && t >= breakAt - BREAK / 2 && t < breakAt + BREAK / 2) wordmarkBreak(x, (t - (breakAt - BREAK / 2)) / BREAK, o);
      mono(x, "Distro draft", 40, H - 40, 18, "rgba(20,19,18,0.3)", "left", 1);
      o.onProgress(Math.min(t, total), total);
      requestAnimationFrame(frame);
    };
    requestAnimationFrame(frame);
  });
  clock.stop(); rec.stop(); await done;
  return new Blob(chunks, { type: "video/webm" });
}
