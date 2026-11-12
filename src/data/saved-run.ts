import type { ContentLang, HookOption, Take } from "../types";

// A saved run for the stage demo, used when no live Claude path is available.
// Written 12 Nov 2026 for the Moonsill rain idea. Shown with a "Saved run" label.
export const SAVED_IDEA = "Moonsill: your plants only grow when it actually rains on your street.";

const SAVED_HOOKS_TAGLISH: HookOption[] = [
  { text: "Ulan. Sa kalye mo lang.", why: "Says the twist in two beats instead of a 13-word question." },
  { text: "Bakit basa kalye mo?", why: "Opens a question the cloud shot answers right away." },
  { text: "What if, ulan mo lang?", why: "Keeps the what-if format but lands before the drop." },
  { text: "Your plants wait for rain.", why: "English control: same promise, five syllables." },
];

type SavedTake = Omit<Take, "status"> & { status?: Take["status"] };

const SAVED_TAKES_TAGLISH: SavedTake[] = [
  { code: "T01", format: "What-if", title: "Rain only here", hook: "What if, ulan mo lang?", captions: true, logoAt: 18,
    beats: [{ label: "Dry street, one cloud", seconds: 4 }, { label: "Rain hits only your pots", seconds: 6 }, { label: "Sprouts pop on the sill", seconds: 6 }, { label: "End card", seconds: 4 }],
    claims: ["grows with your real weather"], status: "checks" },
  { code: "T02", format: "I forgot", title: "Forgot to water", hook: "Nakalimutan kong diligan.", captions: true, logoAt: 17,
    beats: [{ label: "Panic over a dry pot", seconds: 4 }, { label: "Thunder outside the window", seconds: 5 }, { label: "Real rain waters it", seconds: 6 }, { label: "End card", seconds: 4 }],
    claims: ["grows with your real weather", "nothing dies"], status: "checks" },
  { code: "T03", format: "Arguing", title: "Frog vs sparrow", hook: "Uy, ulan na ba?", captions: true, logoAt: 18,
    beats: [{ label: "Frog says rain is coming", seconds: 5 }, { label: "Sparrow says no", seconds: 5 }, { label: "Sky decides: drizzle", seconds: 6 }, { label: "End card", seconds: 4 }],
    claims: ["live rain"], status: "script" },
  { code: "T04", format: "POV", title: "POV: rainy commute", hook: "POV: basa ka, sila happy.", captions: true, logoAt: 16,
    beats: [{ label: "Soaked on the jeep", seconds: 5 }, { label: "Phone: garden is blooming", seconds: 7 }, { label: "End card", seconds: 4 }],
    claims: ["grows with your real weather"], status: "hooks" },
  { code: "T05", format: "Myth-bust", title: "Pay to grow?", hook: "Myth: kailangan magbayad.", captions: true, logoAt: 18,
    beats: [{ label: "Myth card slams in", seconds: 4 }, { label: "Moonflower opens, free for everyone", seconds: 6 }, { label: "Sill of four, real weather", seconds: 6 }, { label: "End card", seconds: 4 }],
    claims: ["free to play"], status: "script" },
  { code: "T06", format: "Countdown", title: "3 rainy-day facts", hook: "Tatlo lang, promise.", captions: true, logoAt: 18,
    beats: [{ label: "3: it reads your real sky", seconds: 5 }, { label: "2: nothing dies", seconds: 5 }, { label: "1: friends send plants", seconds: 6 }, { label: "End card", seconds: 4 }],
    claims: ["grows with your real weather", "nothing dies", "friends can send plants"], status: "script" },
  { code: "T07", format: "Before/After", title: "Dry week, after", hook: "Isang linggong walang ulan.", captions: true, logoAt: 15,
    beats: [{ label: "Day 1: green sill", seconds: 4 }, { label: "Day 7: still alive, waiting", seconds: 7 }, { label: "End card", seconds: 4 }],
    claims: ["nothing dies"], status: "checks" },
  { code: "T08", format: "Skit", title: "Tita checks garden", hook: "Tita, hindi 'yan patay.", captions: true, logoAt: 18,
    beats: [{ label: "Tita worried about plants", seconds: 5 }, { label: "Frog explains: waiting for rain", seconds: 6 }, { label: "Rain starts, tita cheers", seconds: 5 }, { label: "End card", seconds: 4 }],
    claims: ["nothing dies"], status: "script" },
  { code: "T09", format: "Quick tutorial", title: "Set your street", hook: "Here's how to set up your street weather in three taps.", captions: true, logoAt: 17,
    beats: [{ label: "Tap the window", seconds: 5 }, { label: "Pick your street", seconds: 5 }, { label: "Watch the sky sync", seconds: 5 }, { label: "End card", seconds: 4 }],
    claims: ["grows with your real weather"], status: "hooks" },
  { code: "T10", format: "Reaction", title: "Reacting to rain", hook: "Teka, umuulan sa'kin?", captions: true, logoAt: 16,
    beats: [{ label: "Stitched rain clip", seconds: 5 }, { label: "Garden reacts live", seconds: 7 }, { label: "End card", seconds: 4 }],
    claims: ["live rain"], status: "script" },
];

const SAVED_HOOKS_EN: HookOption[] = [
  { text: "Rain on your street only.", why: "Says the twist in five words instead of a 13-word question." },
  { text: "Why is just your street wet?", why: "Opens a question the cloud shot answers right away." },
  { text: "What if rain was yours?", why: "Keeps the what-if format but lands before the drop." },
  { text: "Your plants wait for rain.", why: "States the promise plainly; five syllables." },
];

// English versions of the same ten takes: same beats, claims and timings.
const EN: Record<string, { hook: string; title?: string; beats?: string[] }> = {
  T01: { hook: "What if rain was yours?" },
  T02: { hook: "I forgot to water them." },
  T03: { hook: "Is it raining yet?" },
  T04: { hook: "POV: you're soaked, they're thrilled.", beats: ["Soaked on the bus", "Phone: garden is blooming", "End card"] },
  T05: { hook: "Myth: you pay to grow." },
  T06: { hook: "Three things, real quick." },
  T07: { hook: "One week, no rain." },
  T08: { hook: "Auntie, they're not dead.", title: "Auntie checks garden", beats: ["Auntie worried about plants", "Frog explains: waiting for rain", "Rain starts, auntie cheers", "End card"] },
  T09: { hook: "Here's how to set up your street weather in three taps." },
  T10: { hook: "Wait, it's raining here?" },
};

const SAVED_TAKES_EN: SavedTake[] = SAVED_TAKES_TAGLISH.map((t) => {
  const en = EN[t.code];
  return {
    ...t,
    hook: en.hook,
    title: en.title ?? t.title,
    beats: en.beats ? t.beats.map((b, i) => ({ ...b, label: en.beats![i] ?? b.label })) : t.beats,
  };
});

export const savedHooks = (lang: ContentLang) => (lang === "en" ? SAVED_HOOKS_EN : SAVED_HOOKS_TAGLISH);
export const savedTakes = (lang: ContentLang): Take[] =>
  (lang === "en" ? SAVED_TAKES_EN : SAVED_TAKES_TAGLISH).map((t) => ({ ...t, status: t.status ?? "hooks" }));
