// Footage a brand already owns, cut into shots Distro can reuse in draft cuts.
// Times come from the Moonsill reel's own beat timing (src/data/reel.ts). The source is a
// clean render of that reel with every caption hidden, so any band of the frame can be used.
// Where the footage window sits on the 1080×1920 draft frame. The server crops to match.
export const PANEL_Y = 430;

// focus: where the subject sits vertically (0 top, 1 bottom), so the crop keeps it in frame.
export type Shot = { id: string; label: string; start: number; end: number; focus: number; tags: string[] };
export type FootageLibrary = { brandId: string; title: string; src: string; window: { top: number; height: number }; shots: Shot[] };

export const MOONSILL_FOOTAGE: FootageLibrary = {
  brandId: "moonsill",
  title: "Moonsill reel “What if it only rained on your street?”",
  src: "reels/whatif-rain-clean.mp4",
  window: { top: 0.3, height: 0.42 },
  shots: [
    { id: "frog", label: "Frog at the sill", start: 0.4, end: 5.8, focus: 0.55, tags: ["frog", "sill", "window", "you", "pov", "hello", "worried", "auntie", "tita", "panic", "explains", "what if", "hook"] },
    { id: "cloud", label: "Cloud rolls in", start: 6.1, end: 11.6, focus: 0.45, tags: ["cloud", "sky", "weather", "check", "coming", "forecast", "storm", "thunder", "outside", "street"] },
    { id: "rain", label: "Rain on the pots", start: 11.9, end: 17.7, focus: 0.55, tags: ["rain", "raining", "drizzle", "wet", "water", "waters", "soaked", "drops", "pots", "lands", "real rain", "live rain"] },
    { id: "dry", label: "Dry week, nothing dies", start: 18.0, end: 22.8, focus: 0.55, tags: ["dry", "week", "sun", "alive", "waiting", "nothing dies", "dead", "green", "day 1", "day 7", "sprouts", "grow", "garden"] },
    { id: "moon", label: "Moonflower opens", start: 23.1, end: 29.2, focus: 0.55, tags: ["moon", "night", "flower", "bloom", "blooming", "opens", "moonflower", "cheers"] },
  ],
};

export const FOOTAGE: Record<string, FootageLibrary> = { moonsill: MOONSILL_FOOTAGE };

// The shot whose tags best match a beat, or null when nothing fits (that beat gets its sketch).
export function matchShot(label: string, lib: FootageLibrary | undefined): Shot | null {
  if (!lib || /end card|logo|cta/i.test(label)) return null;
  const l = label.toLowerCase();
  let best: Shot | null = null, score = 0;
  for (const s of lib.shots) {
    const sc = s.tags.reduce((n, t) => n + (l.includes(t) ? t.length : 0), 0);
    if (sc > score) { score = sc; best = s; }
  }
  return score >= 3 ? best : null;
}
