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
  // Cover the reel's burned-in captions: the "WHAT IF…" tape and the word-by-word band.
  ctx.fillStyle = "#0B0816";
  ctx.fillRect(0, H * 0.1, W, H * 0.11);
  ctx.fillRect(0, H * 0.56, W, H * 0.19);

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
  onStage: (s: string) => void;
}): Promise<RenderResult> {
  let id: string | undefined;
  let words: Word[];
  let measured = false;
  if (opts.withVoice) {
    opts.onStage("Recording the new voice-over…");
    const tts = await post<{ id: string; words: Word[]; landsAt: number }>("api/tts", { text: opts.text });
    id = tts.id;
    words = tts.words;
    measured = true;
  } else {
    words = opts.estimate();
  }
  const landsAt = words[words.length - 1].end;
  const introEnd = landsAt + 0.45;

  opts.onStage("Drawing captions…");
  const overlays = [];
  for (let k = 1; k <= words.length; k++) {
    overlays.push({
      png: await captionPng(words.slice(0, k).map((w) => w.w)),
      start: k === 1 ? 0 : words[k - 1].start,
      end: k < words.length ? words[k].start : introEnd,
    });
  }

  opts.onStage("Cutting the video…");
  const out = await post<Omit<RenderResult, "landsAt" | "measured">>("api/render", { id, overlays, introEnd, cutTo: opts.cutTo, duration: opts.duration });
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
  ctx.fillText(`${o.brandName} · ${take.code} ${take.format}`, 80, 96);
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
  ctx.fillText(`BEAT ${index + 1} · ${fmtT(o.start)}–${fmtT(o.end)}`, px + 48, py + 48);
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
    `# ${brand.name} · ${take.code} ${take.format}: ${take.title}`,
    "",
    `**Hook (spoken, first line):** "${take.hook}"`,
    `**Runtime:** ${t} s · **Voice:** ${brand.voice}`,
    `**End card:** ${brand.cta}`,
    "",
    "## Shot list",
    ...shots,
    "",
    "## Claims made (all on the approved list)",
    ...(take.claims.length ? take.claims.map((c) => `- ${c}`) : ["- none"]),
    "",
    "## Brand checks",
    ...checks.map((c) => `- [${c.state === "pass" ? "x" : " "}] ${c.label}: ${c.detail}`),
    "",
    take.animatic ? `Animatic: ${take.animatic.path}` : "Animatic: not rendered yet",
    "",
    "Made with BEAT.",
  ].join("\n");
}
