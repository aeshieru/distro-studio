// Photo story (TikTok photo mode): real moments alternating with the app reacting to them.
// Each slide is drawn to a 1080×1920 PNG in the browser. Moments use the brand's own footage
// when a shot fits, else a 3D still; app slides use the brand's real app screens.
// Captions use the platform-native look (white, heavy black outline), not Distro's UI type.
import "@fontsource/inter/800.css";
import "@fontsource/inter-tight/800.css";
import { FOOTAGE, matchShot } from "../data/footage";
import { matchScreen, screenById } from "../data/screens";

export type Slide = { kind: "moment" | "app"; caption: string; scene: string; sticker?: string; screen?: string };
type BrandLite = { id: string; name: string; colors?: string[]; cta: string };

const W = 1080, H = 1920;
// Inter is wider than Inter Tight, closer to the platforms' own caption type.
const FONT = "'Inter', 'Inter Tight', 'Archivo', Arial, sans-serif";

// ---- Sources ---------------------------------------------------------------

const imgCache = new Map<string, Promise<HTMLImageElement>>();
function loadImage(src: string) {
  if (!imgCache.has(src)) {
    imgCache.set(src, new Promise((res, rej) => {
      const im = new Image();
      im.onload = () => res(im);
      im.onerror = () => rej(new Error(`Could not load ${src}`));
      im.src = src.startsWith("/") || /^https?:|^blob:|^data:/.test(src) ? src : `/${src}`;
    }));
  }
  return imgCache.get(src)!;
}

// One frame of a video file, at time t.
async function grabFrame(src: string, t: number): Promise<HTMLCanvasElement> {
  const v = document.createElement("video");
  v.muted = true; v.playsInline = true; v.preload = "auto";
  v.src = src.startsWith("/") ? src : `/${src}`;
  await new Promise<void>((res, rej) => {
    v.onloadeddata = () => res();
    v.onerror = () => rej(new Error(`Could not open ${src}`));
  });
  await new Promise<void>((res) => { v.onseeked = () => res(); v.currentTime = Math.min(t, Math.max(0, v.duration - 0.1)); });
  const c = document.createElement("canvas");
  c.width = v.videoWidth; c.height = v.videoHeight;
  c.getContext("2d")!.drawImage(v, 0, 0);
  v.removeAttribute("src"); v.load();
  return c;
}

// Cover-fit a source into the slide; focus picks which band survives a vertical crop.
function drawCover(x: CanvasRenderingContext2D, src: CanvasImageSource & { width: number; height: number }, focusY = 0.5) {
  const sw = src.width, sh = src.height;
  const s = Math.max(W / sw, H / sh);
  const dw = sw * s, dh = sh * s;
  const dx = (W - dw) / 2;
  const dy = Math.min(0, Math.max(H - dh, H / 2 - dh * focusY));
  x.drawImage(src, dx, dy, dw, dh);
}

let grainTile: HTMLCanvasElement | null = null;
function grain() {
  if (grainTile) return grainTile;
  const c = document.createElement("canvas"); c.width = c.height = 256;
  const x = c.getContext("2d")!, d = x.createImageData(256, 256);
  for (let i = 0; i < d.data.length; i += 4) { const v = 110 + Math.random() * 40; d.data[i] = d.data[i + 1] = d.data[i + 2] = v; d.data[i + 3] = 255; }
  x.putImageData(d, 0, 0);
  return (grainTile = c);
}

// A phone-photo feel: soft vignette, a touch of grain, slightly warm.
function photoFinish(x: CanvasRenderingContext2D) {
  const g = x.createRadialGradient(W / 2, H * 0.46, H * 0.28, W / 2, H * 0.5, H * 0.78);
  g.addColorStop(0, "rgba(0,0,0,0)"); g.addColorStop(1, "rgba(0,0,0,0.38)");
  x.fillStyle = g; x.fillRect(0, 0, W, H);
  x.save(); x.globalAlpha = 0.07; x.globalCompositeOperation = "overlay";
  x.fillStyle = x.createPattern(grain(), "repeat")!; x.fillRect(0, 0, W, H);
  x.restore();
  x.save(); x.globalAlpha = 0.05; x.fillStyle = "#ffb070"; x.globalCompositeOperation = "soft-light"; x.fillRect(0, 0, W, H); x.restore();
}

// When nothing fits: a soft gradient in the brand's colors, never a blank slide.
function drawGradient(x: CanvasRenderingContext2D, colors: string[]) {
  const [a, b] = [colors[0] ?? "#2b2f63", colors[1] ?? colors[0] ?? "#6b5bd6"];
  const g = x.createLinearGradient(0, 0, W * 0.4, H);
  g.addColorStop(0, a); g.addColorStop(1, b);
  x.fillStyle = g; x.fillRect(0, 0, W, H);
}

// A clean neutral app card for brands with no screenshots.
function drawAppCard(x: CanvasRenderingContext2D, brand: BrandLite, scene: string) {
  const accent = brand.colors?.find((c) => /^#[0-9a-f]{6}$/i.test(c)) ?? "#ff5a1f";
  x.fillStyle = "#f6f5f2"; x.fillRect(0, 0, W, H);
  x.fillStyle = "#111"; x.font = `800 64px ${FONT}`; x.textAlign = "left"; x.textBaseline = "alphabetic";
  x.fillText(brand.name, 80, 200);
  x.fillStyle = "#fff"; x.strokeStyle = "#e6e3dc"; x.lineWidth = 3;
  x.beginPath(); x.roundRect(60, 280, W - 120, 1180, 48); x.fill(); x.stroke();
  x.fillStyle = accent; x.beginPath(); x.arc(W / 2, 640, 190, 0, Math.PI * 2); x.fill();
  x.fillStyle = "#fff"; x.beginPath(); x.arc(W / 2, 640, 140, 0, Math.PI * 2); x.fill();
  x.fillStyle = "#111"; x.font = `700 46px ${FONT}`; x.textAlign = "center";
  wrap(x, scene, W - 260).slice(0, 3).forEach((l, i) => x.fillText(l, W / 2, 960 + i * 60));
  [0, 1, 2].forEach((i) => { x.fillStyle = "#f1efea"; x.beginPath(); x.roundRect(120, 1160 + i * 90, W - 240, 64, 20); x.fill(); });
}

// ---- Type ------------------------------------------------------------------

function wrap(x: CanvasRenderingContext2D, text: string, max: number) {
  const out: string[] = []; let cur = "";
  for (const w of text.split(/\s+/).filter(Boolean)) {
    const next = cur ? `${cur} ${w}` : w;
    if (x.measureText(next).width > max && cur) { out.push(cur); cur = w; } else cur = next;
  }
  if (cur) out.push(cur);
  return out;
}

// Platform-native caption: white, heavy black outline, centered.
function caption(x: CanvasRenderingContext2D, text: string, cy: number, size = 68) {
  if (!text.trim()) return;
  x.font = `800 ${size}px ${FONT}`; x.textAlign = "center"; x.textBaseline = "middle";
  spacing(x, size);
  const lines = balanced(x, text.trim(), 860).slice(0, 4);
  const lh = size * 1.2, y0 = cy - ((lines.length - 1) * lh) / 2;
  x.lineJoin = "round"; x.miterLimit = 2;
  lines.forEach((l, i) => {
    const y = y0 + i * lh;
    x.lineWidth = size * 0.17; x.strokeStyle = "#000"; x.strokeText(l, W / 2, y);
    x.fillStyle = "#fff"; x.fillText(l, W / 2, y);
  });
}

// The outline eats into word gaps, so open them up a little.
function spacing(x: CanvasRenderingContext2D, size: number) {
  const c = x as CanvasRenderingContext2D & { wordSpacing?: string; letterSpacing?: string };
  if ("wordSpacing" in c) c.wordSpacing = `${Math.round(size * 0.14)}px`;
  if ("letterSpacing" in c) c.letterSpacing = `${(size * 0.005).toFixed(1)}px`;
}

// Same line count as a greedy wrap, but lines of even length (no one-word last line).
function balanced(x: CanvasRenderingContext2D, text: string, max: number) {
  const n = wrap(x, text, max).length;
  if (n < 2) return wrap(x, text, max);
  let lo = max / n, hi = max;
  for (let k = 0; k < 12; k++) { const mid = (lo + hi) / 2; if (wrap(x, text, mid).length > n) lo = mid; else hi = mid; }
  return wrap(x, text, hi);
}

const isEmojiOnly = (s: string) => !/[\p{L}\p{N}]/u.test(s);

function sticker(x: CanvasRenderingContext2D, text: string) {
  x.save();
  x.translate(W * 0.36, H * 0.6); x.rotate((-6 * Math.PI) / 180);
  x.textAlign = "center"; x.textBaseline = "middle";
  if (isEmojiOnly(text)) {
    x.font = `180px "Apple Color Emoji", "Segoe UI Emoji", "Noto Color Emoji", sans-serif`;
    x.fillText(text, 0, 0);
  } else {
    let size = 120;
    x.font = `800 ${size}px ${FONT}`;
    while (x.measureText(text).width > 820 && size > 60) { size -= 6; x.font = `800 ${size}px ${FONT}`; }
    spacing(x, size);
    x.lineJoin = "round"; x.lineWidth = size * 0.18; x.strokeStyle = "#000"; x.strokeText(text, 0, 0);
    x.fillStyle = "#fff"; x.fillText(text, 0, 0);
  }
  x.restore();
}

// End card pill: where to get the app.
function ctaPill(x: CanvasRenderingContext2D, text: string) {
  x.font = `800 46px ${FONT}`; x.textAlign = "center"; x.textBaseline = "middle";
  spacing(x, 30);
  const lines = wrap(x, text, 820).slice(0, 2);
  const w = Math.max(...lines.map((l) => x.measureText(l).width)) + 96, h = lines.length * 58 + 52;
  const bx = (W - w) / 2, by = H * 0.76 - h / 2;
  x.fillStyle = "rgba(0,0,0,0.22)"; x.beginPath(); x.roundRect(bx, by + 8, w, h, h / 2 > 60 ? 40 : h / 2); x.fill();
  x.fillStyle = "#fff"; x.beginPath(); x.roundRect(bx, by, w, h, h / 2 > 60 ? 40 : h / 2); x.fill();
  x.fillStyle = "#111"; lines.forEach((l, i) => x.fillText(l, W / 2, by + 26 + 29 + i * 58));
}

// ---- Render ----------------------------------------------------------------

async function momentBackground(x: CanvasRenderingContext2D, slide: Slide, brand: BrandLite) {
  const lib = FOOTAGE[brand.id];
  const shot = matchShot(slide.scene, lib);
  if (lib && shot) {
    try { drawCover(x, await grabFrame(lib.src, (shot.start + shot.end) / 2), shot.focus); return; } catch { /* fall through */ }
  }
  try {
    const m = (await import("./scene3d")) as unknown as Record<string, unknown>;
    const still = m.renderStill as undefined | ((o: { label: string; line: string; appName: string; cta: string; width: number; height: number; isEnd?: boolean }) => Promise<HTMLCanvasElement>);
    if (typeof still === "function") {
      drawCover(x, await still({ label: slide.scene, line: slide.caption, appName: brand.name, cta: brand.cta, width: W, height: H }));
      return;
    }
  } catch { /* fall through */ }
  drawGradient(x, brand.colors ?? []);
}

async function appBackground(x: CanvasRenderingContext2D, slide: Slide, brand: BrandLite) {
  const scr = screenById(brand.id, slide.screen) ?? matchScreen(`${slide.scene} ${slide.caption}`, brand.id);
  if (scr) {
    try { drawCover(x, await loadImage(scr.src), 0.42); return; } catch { /* fall through */ }
  }
  drawAppCard(x, brand, slide.scene);
}

export async function renderSlides(o: {
  slides: Slide[];
  brand: BrandLite;
  onStep?: (done: number, total: number, label: string) => void;
  // PNG by default; JPEG files are about a tenth of the size and every platform takes them.
  format?: "png" | "jpeg";
}): Promise<{ name: string; blob: Blob; url: string }[]> {
  await Promise.all([document.fonts.load(`800 68px 'Inter'`), document.fonts.load(`800 120px 'Inter'`)]).catch(() => null);
  const type = o.format === "jpeg" ? "image/jpeg" : "image/png", ext = o.format === "jpeg" ? "jpg" : "png";
  const slug = brand(o.brand.name);
  const out: { name: string; blob: Blob; url: string }[] = [];
  const total = o.slides.length;
  for (let i = 0; i < total; i++) {
    const s = o.slides[i];
    const end = i === total - 1;
    o.onStep?.(i, total, `${s.kind === "app" || end ? "App screen" : "Moment"}: ${s.scene}`);
    const c = document.createElement("canvas"); c.width = W; c.height = H;
    const x = c.getContext("2d")!;
    x.fillStyle = "#000"; x.fillRect(0, 0, W, H);
    if (s.kind === "app" || end) await appBackground(x, s, o.brand);
    else { await momentBackground(x, s, o.brand); photoFinish(x); }
    if (end) {
      // Darken just enough that the caption and pill read on any screen.
      const g = x.createLinearGradient(0, H * 0.25, 0, H); g.addColorStop(0, "rgba(0,0,0,0)"); g.addColorStop(1, "rgba(0,0,0,0.35)");
      x.fillStyle = g; x.fillRect(0, 0, W, H);
      caption(x, s.caption || o.brand.name, H * 0.4);
      ctaPill(x, o.brand.cta);
    } else {
      caption(x, s.caption, s.kind === "app" ? H * 0.4 : H * 0.28);
    }
    if (s.sticker?.trim()) sticker(x, s.sticker.trim());
    const blob = await new Promise<Blob>((res, rej) => c.toBlob((b) => (b ? res(b) : rej(new Error("Could not encode the slide."))), type, 0.92));
    out.push({ name: `${slug}-slide-${String(i + 1).padStart(2, "0")}.${ext}`, blob, url: URL.createObjectURL(blob) });
  }
  o.onStep?.(total, total, "Done");
  return out;
}

const brand = (name: string) => name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "story";

// ---- Zip (STORE, no compression; PNGs are already compressed) ---------------

const CRC = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; }
  return t;
})();
function crc32(d: Uint8Array) {
  let c = 0xffffffff;
  for (let i = 0; i < d.length; i++) c = CRC[(c ^ d[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

export function zipFiles(files: { name: string; data: Uint8Array }[]): Blob {
  const enc = new TextEncoder();
  const now = new Date();
  const time = (now.getHours() << 11) | (now.getMinutes() << 5) | (now.getSeconds() >> 1);
  const date = ((now.getFullYear() - 1980) << 9) | ((now.getMonth() + 1) << 5) | now.getDate();
  const parts: BlobPart[] = [], central: Uint8Array[] = [];
  let offset = 0;
  for (const f of files) {
    const name = enc.encode(f.name), crc = crc32(f.data), size = f.data.length;
    const lh = new DataView(new ArrayBuffer(30));
    lh.setUint32(0, 0x04034b50, true); lh.setUint16(4, 20, true); lh.setUint16(6, 0x0800, true); lh.setUint16(8, 0, true);
    lh.setUint16(10, time, true); lh.setUint16(12, date, true); lh.setUint32(14, crc, true);
    lh.setUint32(18, size, true); lh.setUint32(22, size, true); lh.setUint16(26, name.length, true); lh.setUint16(28, 0, true);
    parts.push(lh.buffer, name, f.data as BlobPart);
    const ch = new DataView(new ArrayBuffer(46));
    ch.setUint32(0, 0x02014b50, true); ch.setUint16(4, 20, true); ch.setUint16(6, 20, true); ch.setUint16(8, 0x0800, true); ch.setUint16(10, 0, true);
    ch.setUint16(12, time, true); ch.setUint16(14, date, true); ch.setUint32(16, crc, true); ch.setUint32(20, size, true); ch.setUint32(24, size, true);
    ch.setUint16(28, name.length, true); ch.setUint16(30, 0, true); ch.setUint16(32, 0, true); ch.setUint16(34, 0, true); ch.setUint16(36, 0, true);
    ch.setUint32(38, 0, true); ch.setUint32(42, offset, true);
    const entry = new Uint8Array(46 + name.length); entry.set(new Uint8Array(ch.buffer), 0); entry.set(name, 46);
    central.push(entry);
    offset += 30 + name.length + size;
  }
  const cdSize = central.reduce((a, c) => a + c.length, 0);
  const eocd = new DataView(new ArrayBuffer(22));
  eocd.setUint32(0, 0x06054b50, true); eocd.setUint16(8, files.length, true); eocd.setUint16(10, files.length, true);
  eocd.setUint32(12, cdSize, true); eocd.setUint32(16, offset, true);
  return new Blob([...parts, ...central, eocd.buffer], { type: "application/zip" });
}

export async function slidesZip(files: { name: string; blob: Blob }[]): Promise<Blob> {
  return zipFiles(await Promise.all(files.map(async (f) => ({ name: f.name, data: new Uint8Array(await f.blob.arrayBuffer()) }))));
}
