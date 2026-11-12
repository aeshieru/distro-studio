// Local render pipeline: ElevenLabs voice-over for the new hook, then ffmpeg cuts
// [new hook over the original first seconds] + [the original from Step 1] into an MP4.
import { execFile } from "node:child_process";
import { createReadStream, existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join, resolve } from "node:path";
import { randomBytes } from "node:crypto";
import type { IncomingMessage, ServerResponse } from "node:http";
import ffmpegPath from "ffmpeg-static";

const ROOT = process.cwd();
const RENDERS = join(ROOT, "renders");
const SOURCE = join(ROOT, "public", "reels", "whatif-rain.mp4");
// The reel's own voice: ElevenLabs "Lulu - warm, cozy" (see the reel's SOURCES.md).
const VOICE = { id: "itMkRQx56fOF4CJe1D0C", name: "Lulu (ElevenLabs)", model: "eleven_v3" };

type Json = { status: number; json: unknown };

function elevenKey(): string | null {
  const p = join(homedir(), ".elevenlabs_key");
  return existsSync(p) ? readFileSync(p, "utf8").trim() : null;
}

export function renderStatus() {
  return { ready: Boolean(ffmpegPath && existsSync(ffmpegPath)), voice: elevenKey() ? VOICE.name : null };
}

const newId = () => `${new Date().toISOString().slice(0, 19).replace(/[:T]/g, "-")}-${randomBytes(2).toString("hex")}`;

export async function handleTts(body: string): Promise<Json> {
  const { text } = JSON.parse(body) as { text: string };
  const key = elevenKey();
  if (!key) return { status: 503, json: { error: "no_voice", message: "No ElevenLabs key in ~/.elevenlabs_key." } };
  const r = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${VOICE.id}/with-timestamps?output_format=mp3_44100_192`, {
    method: "POST",
    headers: { "xi-api-key": key, "content-type": "application/json" },
    body: JSON.stringify({ text, model_id: VOICE.model, voice_settings: { stability: 0.5 } }),
  }).catch(() => null);
  if (!r) return { status: 502, json: { error: "network", message: "Could not reach ElevenLabs." } };
  if (!r.ok) return { status: r.status, json: { error: "voice", message: r.status === 401 ? "ElevenLabs rejected the key." : `ElevenLabs error ${r.status}.` } };
  const data = (await r.json()) as {
    audio_base64: string;
    alignment: { characters: string[]; character_start_times_seconds: number[]; character_end_times_seconds: number[] };
  };
  const id = newId();
  const dir = join(RENDERS, id);
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, "vo.mp3"), Buffer.from(data.audio_base64, "base64"));

  // Characters to words, with the measured time each word starts and ends.
  const a = data.alignment;
  const words: { w: string; start: number; end: number }[] = [];
  let cur: { w: string; start: number; end: number } | null = null;
  a.characters.forEach((ch, i) => {
    if (/\s/.test(ch)) { if (cur) { words.push(cur); cur = null; } return; }
    if (!cur) cur = { w: "", start: a.character_start_times_seconds[i], end: 0 };
    cur.w += ch;
    cur.end = a.character_end_times_seconds[i];
  });
  if (cur) words.push(cur);
  const spoken = words.filter((w) => /[\p{L}\p{N}]/u.test(w.w));
  return { status: 200, json: { id, words: spoken, landsAt: spoken.length ? spoken[spoken.length - 1].end : 0, voice: VOICE.name } };
}

type RenderReq = {
  id?: string; // from /api/tts; absent means no voice-over
  overlays: { png: string; start: number; end: number }[];
  introEnd: number;
  cutTo: number;
  duration: number;
};

function run(args: string[]): Promise<string> {
  return new Promise((res, rej) =>
    execFile(ffmpegPath as string, args, { maxBuffer: 64 * 1024 * 1024 }, (err, _out, stderr) => (err ? rej(new Error(stderr.slice(-800))) : res(stderr))),
  );
}

export async function handleRender(body: string): Promise<Json> {
  const req = JSON.parse(body) as RenderReq;
  if (!ffmpegPath) return { status: 503, json: { error: "no_ffmpeg", message: "ffmpeg is missing. Run npm install." } };
  const id = req.id && /^[\w-]+$/.test(req.id) ? req.id : newId();
  const dir = join(RENDERS, id);
  mkdirSync(dir, { recursive: true });
  const vo = join(dir, "vo.mp3");
  const hasVo = Boolean(req.id) && existsSync(vo);

  const pngs = req.overlays.map((o, i) => {
    const p = join(dir, `cap-${i}.png`);
    writeFileSync(p, Buffer.from(o.png.replace(/^data:image\/png;base64,/, ""), "base64"));
    return p;
  });

  const T = req.introEnd.toFixed(3), C = req.cutTo.toFixed(3);
  const inputs = ["-i", SOURCE, ...(hasVo ? ["-i", vo] : ["-f", "lavfi", "-i", "anullsrc=r=44100:cl=stereo"]), ...pngs.flatMap((p) => ["-i", p])];
  const f: string[] = [`[0:v]split=2[va][vb]`, `[va]trim=0:${T},setpts=PTS-STARTPTS[v0]`];
  req.overlays.forEach((o, i) => {
    f.push(`[v${i}][${i + 2}:v]overlay=0:0:enable='between(t,${o.start.toFixed(3)},${o.end.toFixed(3)})'[v${i + 1}]`);
  });
  const vi = `v${req.overlays.length}`;
  f.push(
    `[vb]trim=start=${C},setpts=PTS-STARTPTS[vr]`,
    `[${vi}][vr]concat=n=2:v=1:a=0[v]`,
    `[1:a]aresample=44100,aformat=channel_layouts=stereo,apad,atrim=0:${T},asetpts=PTS-STARTPTS[ai]`,
    `[0:a]aresample=44100,aformat=channel_layouts=stereo,atrim=start=${C},asetpts=PTS-STARTPTS[ar]`,
    `[ai][ar]concat=n=2:v=0:a=1,loudnorm=I=-14:TP=-1.5:LRA=11[a]`,
  );
  const out = join(dir, "whatif-rain-new-hook.mp4");
  try {
    await run(["-y", "-hide_banner", ...inputs, "-filter_complex", f.join(";"), "-map", "[v]", "-map", "[a]",
      "-c:v", "libx264", "-preset", "veryfast", "-crf", "23", "-maxrate", "2400k", "-bufsize", "4800k", "-pix_fmt", "yuv420p", "-r", "30",
      "-c:a", "aac", "-b:a", "160k", "-ar", "44100", "-movflags", "+faststart", out]);
  } catch (e) {
    return { status: 500, json: { error: "ffmpeg", message: "The render failed. " + String((e as Error).message).split("\n").slice(-2).join(" ") } };
  }

  // Measure what we made: integrated loudness and file size.
  let lufs: number | null = null;
  try {
    const log = await run(["-hide_banner", "-nostats", "-i", out, "-af", "ebur128=framelog=quiet", "-f", "null", "-"]);
    const m = log.match(/Integrated loudness:\s*\n\s*I:\s*(-?\d+(?:\.\d+)?) LUFS/);
    lufs = m ? Number(m[1]) : null;
  } catch { /* measurement is best effort */ }

  return {
    status: 200,
    json: {
      url: `renders/${id}/whatif-rain-new-hook.mp4`,
      path: out,
      duration: req.introEnd + (req.duration - req.cutTo),
      sizeMB: Math.round((statSync(out).size / 1048576) * 10) / 10,
      lufs,
      voice: hasVo ? VOICE.name : null,
    },
  };
}

type AnimaticReq = { id?: string; code: string; frames: { png: string; seconds: number }[] };

// An animatic: one storyboard card per beat, timed to the script, with the hook's voice-over.
export async function handleAnimatic(body: string): Promise<Json> {
  const req = JSON.parse(body) as AnimaticReq;
  if (!ffmpegPath) return { status: 503, json: { error: "no_ffmpeg", message: "ffmpeg is missing. Run npm install." } };
  const id = req.id && /^[\w-]+$/.test(req.id) ? req.id : newId();
  const code = /^[\w-]{1,12}$/.test(req.code) ? req.code : "take";
  const dir = join(RENDERS, id);
  mkdirSync(dir, { recursive: true });
  const vo = join(dir, "vo.mp3");
  const hasVo = Boolean(req.id) && existsSync(vo);
  const total = req.frames.reduce((s, f) => s + f.seconds, 0);
  const inputs: string[] = [];
  req.frames.forEach((f, i) => {
    const p = join(dir, `card-${i}.png`);
    writeFileSync(p, Buffer.from(f.png.replace(/^data:image\/png;base64,/, ""), "base64"));
    inputs.push("-loop", "1", "-framerate", "30", "-t", f.seconds.toFixed(3), "-i", p);
  });
  inputs.push(...(hasVo ? ["-i", vo] : ["-f", "lavfi", "-i", "anullsrc=r=44100:cl=stereo"]));
  const a = req.frames.length;
  const f = [
    req.frames.map((_, i) => `[${i}:v]scale=1080:1920,setsar=1,format=yuv420p[c${i}]`).join(";"),
    `${req.frames.map((_, i) => `[c${i}]`).join("")}concat=n=${a}:v=1:a=0[v]`,
    `[${a}:a]aresample=44100,aformat=channel_layouts=stereo,apad,atrim=0:${total.toFixed(3)},loudnorm=I=-14:TP=-1.5:LRA=11[aout]`,
  ];
  const out = join(dir, `${code}-animatic.mp4`);
  try {
    await run(["-y", "-hide_banner", ...inputs, "-filter_complex", f.join(";"), "-map", "[v]", "-map", "[aout]",
      "-c:v", "libx264", "-preset", "veryfast", "-crf", "23", "-maxrate", "2400k", "-bufsize", "4800k", "-r", "30",
      "-c:a", "aac", "-b:a", "160k", "-ar", "44100", "-movflags", "+faststart", out]);
  } catch (e) {
    return { status: 500, json: { error: "ffmpeg", message: "The animatic failed. " + String((e as Error).message).split("\n").slice(-2).join(" ") } };
  }
  let lufs: number | null = null;
  try {
    const log = await run(["-hide_banner", "-nostats", "-i", out, "-af", "ebur128=framelog=quiet", "-f", "null", "-"]);
    const m = log.match(/Integrated loudness:\s*\n\s*I:\s*(-?\d+(?:\.\d+)?) LUFS/);
    lufs = m ? Number(m[1]) : null;
  } catch { /* best effort */ }
  return { status: 200, json: { url: `renders/${id}/${code}-animatic.mp4`, path: out, duration: total, sizeMB: Math.round((statSync(out).size / 1048576) * 10) / 10, lufs, voice: hasVo ? VOICE.name : null } };
}

// Serves files under renders/ during dev.
export function serveRender(req: IncomingMessage, res: ServerResponse, next: () => void) {
  const rel = decodeURIComponent((req.url ?? "").split("?")[0]).replace(/^\/+/, "");
  const file = resolve(RENDERS, rel);
  if (!file.startsWith(RENDERS + "/") || !existsSync(file)) return next();
  const size = statSync(file).size;
  const range = req.headers.range?.match(/bytes=(\d*)-(\d*)/);
  const type = file.endsWith(".mp4") ? "video/mp4" : file.endsWith(".mp3") ? "audio/mpeg" : "application/octet-stream";
  if (range) {
    const start = range[1] ? Number(range[1]) : 0;
    const end = range[2] ? Number(range[2]) : size - 1;
    res.writeHead(206, { "content-type": type, "content-length": end - start + 1, "content-range": `bytes ${start}-${end}/${size}`, "accept-ranges": "bytes" });
    createReadStream(file, { start, end }).pipe(res);
  } else {
    res.writeHead(200, { "content-type": type, "content-length": size, "accept-ranges": "bytes" });
    createReadStream(file).pipe(res);
  }
}
