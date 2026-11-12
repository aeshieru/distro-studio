// A rough storyboard for checking a take before it is rendered: one panel per beat,
// a quick pencil sketch picked from what the beat describes, its timing, and the hook
// in a balloon on the first panel.
import type { Take } from "../types";

const fmt = (t: number) => `${Math.floor(t / 60)}:${String(Math.floor(t % 60)).padStart(2, "0")}`;

type Sketch = (k: number) => JSX.Element;

// Pencil sketches, drawn in a 160×100 box. Each is a few strokes; k varies them slightly.
const S: Record<string, Sketch> = {
  rain: (k) => <g>{[20, 50, 80, 110, 140].map((x, i) => <path key={i} d={`M${x + k} ${18 + (i % 2) * 8} l-6 16 M${x + 14 + k} ${44 + (i % 2) * 6} l-6 16`} />)}<path d="M8 92 H152" /></g>,
  cloud: () => <g><path d="M38 52 q-14 0 -14 -12 q0 -14 16 -12 q4 -16 22 -14 q14 -10 28 2 q20 -2 20 16 q12 2 10 14 q-2 8 -14 8 Z" /><path d="M8 92 H152" /></g>,
  sun: () => <g><circle cx="80" cy="44" r="16" />{[0, 45, 90, 135, 180, 225, 270, 315].map((a) => <path key={a} d={`M${80 + 22 * Math.cos(a * Math.PI / 180)} ${44 + 22 * Math.sin(a * Math.PI / 180)} l${8 * Math.cos(a * Math.PI / 180)} ${8 * Math.sin(a * Math.PI / 180)}`} />)}<path d="M8 92 H152" /></g>,
  plant: () => <g><path d="M62 92 l6 -24 h24 l6 24 Z" /><path d="M80 68 V40 M80 52 q-14 -6 -18 -18 q14 0 18 14 M80 46 q12 -8 20 -20 q-14 0 -20 16" /><path d="M8 92 H152" /></g>,
  phone: () => <g><rect x="60" y="14" width="40" height="76" rx="6" /><path d="M66 26 H94 M66 34 H88 M66 74 H94" /><circle cx="80" cy="54" r="10" /></g>,
  person: () => <g><circle cx="80" cy="28" r="10" /><path d="M80 38 V66 M80 46 L64 58 M80 46 L96 58 M80 66 L68 90 M80 66 L92 90" /><path d="M8 92 H152" /></g>,
  two: () => <g><circle cx="50" cy="40" r="10" /><path d="M50 50 V72 M50 58 L40 66 M50 72 L42 90 M50 72 L58 90" /><circle cx="110" cy="40" r="10" /><path d="M110 50 V72 M110 58 L120 66 M110 72 L102 90 M110 72 L118 90" /><path d="M64 26 q16 -10 32 0" /></g>,
  frog: () => <g><ellipse cx="80" cy="66" rx="34" ry="22" /><circle cx="64" cy="44" r="9" /><circle cx="96" cy="44" r="9" /><circle cx="64" cy="44" r="3" /><circle cx="96" cy="44" r="3" /><path d="M66 72 q14 8 28 0" /></g>,
  card: () => <g><rect x="22" y="22" width="116" height="56" /><path d="M36 40 H124 M36 52 H110 M36 64 H96" /></g>,
  count: (k) => <g><text x="80" y="66" textAnchor="middle" style={{ font: "700 46px Archivo, sans-serif", fill: "none", stroke: "currentColor", strokeWidth: 1.6 }}>{3 - (k % 3)}</text><path d="M30 80 H130" /></g>,
  window: () => <g><rect x="34" y="14" width="92" height="64" /><path d="M80 14 V78 M34 46 H126" /><path d="M24 84 H136" /></g>,
  street: () => <g><path d="M8 92 L64 40 H96 L152 92" /><path d="M80 48 V56 M80 64 V74 M80 82 V92" /><rect x="14" y="28" width="22" height="34" /><rect x="124" y="22" width="24" height="40" /></g>,
  moon: () => <g><path d="M92 18 a28 28 0 1 0 0 56 a22 22 0 1 1 0 -56" /><path d="M8 92 H152" /></g>,
  end: () => <g><rect x="40" y="24" width="80" height="44" rx="8" /><path d="M58 46 H102" /><path d="M54 84 H106" /></g>,
  scene: () => <g><path d="M8 92 H152" /><circle cx="80" cy="56" r="18" /><path d="M20 30 l16 -10 l16 10" /></g>,
};

const RULES: [RegExp, string][] = [
  [/end card|logo|cta/i, "end"],
  [/rain|drizzle|wet|storm|thunder|soak/i, "rain"],
  [/cloud|sky/i, "cloud"],
  [/sun|dry|heat|week/i, "sun"],
  [/moon|night|flower opens/i, "moon"],
  [/frog/i, "frog"],
  [/phone|tap|screen|app|notification|sync/i, "phone"],
  [/vs|argu|says no|debate|auntie|tita|explains/i, "two"],
  [/myth|card|text|fact/i, "card"],
  [/^\s*[123]\b|countdown|three|two|one/i, "count"],
  [/sill|window|garden|pot|plant|sprout|bloom|green/i, "plant"],
  [/street|jeep|bus|commute/i, "street"],
  [/pov|panic|worried|cheers|person|you/i, "person"],
  [/window/i, "window"],
];

function sketchFor(label: string, i: number) {
  const hit = RULES.find(([re]) => re.test(label));
  return (S[hit?.[1] ?? "scene"])(i);
}

export function Storyboard({ take, cta }: { take: Take; cta: string }) {
  let t = 0;
  return (
    <ol className="board-strip" aria-label={`Storyboard for ${take.code}`}>
      {take.beats.map((b, i) => {
        const start = t; t += b.seconds;
        const last = i === take.beats.length - 1;
        return (
          <li key={i} className="sb" style={{ flex: `${b.seconds} 1 0` }}>
            <div className="sb-frame">
              <svg viewBox="0 0 160 100" aria-hidden="true">{sketchFor(b.label, i)}</svg>
              {i === 0 && <span className="sb-say">“{take.hook}”</span>}
              <span className="sb-time">{fmt(start)}–{fmt(t)}</span>
            </div>
            <p className="sb-cap"><i>Beat {i + 1}</i>{last && /end card/i.test(b.label) ? cta : b.label}</p>
          </li>
        );
      })}
    </ol>
  );
}
