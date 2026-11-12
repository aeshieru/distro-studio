// Shared by the dev proxy (server/ai.ts) and the hosted artifact path (src/lib/ai.ts).
import type { Brand, ContentLang } from "../types";

export type HooksRequest = {
  task: "hooks";
  language: ContentLang;
  brand: Brand;
  idea: string;
  currentHook: string;
  landsAt: number;
  dropAt: number | null;
  nextBeat: string;
};

export type StyleRef = {
  site?: string;
  url?: string;
  title?: string;
  caption?: string;
  notes?: string;
  pacing?: { duration: number; cuts: number; avgShot: number; firstCut: number | null };
  // What Claude in Chrome saw when it looked at the post: its type and structure, never its content.
  seen?: { type: "reel" | "slideshow"; slides?: number; seconds?: number; structure: string[]; captions: string; pacing: string; hook: string; summary: string };
};

export type TakesRequest = {
  task: "takes";
  language: ContentLang;
  brand: Brand;
  idea: string;
  style?: StyleRef;
  count?: number;
  formats?: string[];
  kind?: "reel" | "slideshow";
};

function styleBlock(s?: StyleRef) {
  if (!s || !(s.url || s.notes || s.pacing || s.seen)) return "";
  const lines = ["", "Style reference the user wants these takes to feel like:"];
  if (s.url) lines.push(`- ${s.site ?? "Post"}: ${s.url}${s.title ? ` (${s.title})` : ""}`);
  if (s.caption) lines.push(`- Its caption: "${s.caption.slice(0, 600)}"`);
  if (s.pacing) lines.push(`- Measured pacing of their reference video: ${s.pacing.duration.toFixed(1)} s long, ${s.pacing.cuts} cuts, a new shot about every ${s.pacing.avgShot.toFixed(1)} s${s.pacing.firstCut != null ? `, first cut at ${s.pacing.firstCut.toFixed(1)} s` : ""}. Match this rhythm in the beat lengths.`);
  if (s.seen) {
    lines.push(`- Claude looked at the post: it is a ${s.seen.type}${s.seen.slides ? ` of ${s.seen.slides} slides` : ""}${s.seen.seconds ? `, about ${s.seen.seconds} s` : ""}. ${s.seen.summary}`);
    if (s.seen.structure.length) lines.push(`- Its structure, in order: ${s.seen.structure.map((x, i) => `${i + 1}) ${x}`).join(" ")}. Follow this structure.`);
    lines.push(`- Captions: ${s.seen.captions}. Pacing: ${s.seen.pacing}. Hook: ${s.seen.hook}.`);
  }
  if (s.notes) lines.push(`- What they like about it: ${s.notes.slice(0, 600)}`);
  lines.push("Borrow the style (pacing, hook shape, tone, format), never its content, brand, characters or exact words.");
  return lines.join("\n");
}

export type LinesRequest = {
  task: "lines";
  language: ContentLang;
  brand: Brand;
  take: { format: string; title: string; hook: string; beats: { label: string; seconds: number }[] };
};

export type FixRequest = {
  task: "fix";
  language: ContentLang;
  brand: Brand;
  take: { format: string; title: string; hook: string; beats: { label: string; seconds: number }[]; claims: string[]; logoAt: number; captions: boolean };
  problem: string; // what failed, or the remake note
};

export type AiRequest = HooksRequest | TakesRequest | LinesRequest | FixRequest;

export const FORMATS = [
  "What-if", "I forgot", "Arguing", "POV", "Myth-bust",
  "Countdown", "Before/After", "Skit", "Quick tutorial", "Reaction",
];

// Slideshow formats: photo posts that tell a small story across slides.
export const SLIDE_FORMATS = [
  "Story with the app", "Before/After", "POV", "Expectation vs reality", "Diary",
  "Myth vs fact", "Countdown", "Checklist", "Day in my life", "Reaction",
];

function brandBlock(raw: Brand) {
  const c = (a: string[]) => a.map((s) => s.trim()).filter(Boolean);
  const b = { ...raw, paidFeatures: c(raw.paidFeatures), approvedClaims: c(raw.approvedClaims), bannedPhrases: c(raw.bannedPhrases) };
  return [
    `Brand: ${b.name}. ${b.oneLiner}`,
    `Audience: ${b.audience}`,
    `Voice: ${b.voice}`,
    `Paid features (never call these free, libre or included): ${b.paidFeatures.join(", ") || "none listed"}`,
    `Approved claims (the only factual claims allowed, copy them verbatim): ${b.approvedClaims.join(" | ") || "none listed"}`,
    `Banned phrases: ${b.bannedPhrases.join(", ")}`,
    b.tone?.length ? `Tone: ${b.tone.join(", ")}` : "",
    b.values?.length ? `Values: ${b.values.join(", ")}` : "",
    b.aesthetic?.length ? `Look: ${b.aesthetic.join(", ")}` : "",
    b.tagline ? `Tagline: ${b.tagline}` : "",
  ].filter(Boolean).join("\n");
}

export function hooksPrompt(r: HooksRequest) {
  const maxSyl = Math.max(5, Math.floor(r.brand.voicePace * 2.3));
  return `You write opening hooks for short vertical videos for small studios and indie developers.

${brandBlock(r.brand)}

The reel: ${r.idea}
Its current hook: "${r.currentHook}" — the voice-over finishes it at ${r.landsAt.toFixed(1)} s.
${r.dropAt != null ? `Facebook reported the biggest audience drop at ${r.dropAt} s, so the hook must land before that.` : ""}
The next beat after the hook says: "${r.nextBeat}"

${r.language === "taglish" ? "Write 4 replacement hooks in natural Taglish (mix Tagalog and English the way Manila 18-34 speak; at least 2 of the 4 must include Tagalog words)." : "Write 4 replacement hooks in plain, natural English that any viewer worldwide understands. No slang that only works in one country."}
Rules:
- At most ${maxSyl} syllables each, so the brand's voice (${r.brand.voicePace} syllables per second) finishes it in about 2.5 s.
- Talk to the viewer ("mo", "ka", "you").
- Open a question or a gap the next beat answers. Keep the same promise as the current hook; do not invent features.
- No hashtags, no emoji, no "AI".
For each, give "why": one short plain-English sentence on what it changes.`;
}

export function takesPrompt(r: TakesRequest) {
  return `You plan short vertical videos (15-25 s) for small studios and indie developers.

${brandBlock(r.brand)}

Idea: ${r.idea}

${r.formats?.length ? `Plan exactly ${r.formats.length} take${r.formats.length > 1 ? "s" : ""}, one per format, in this order: ${r.formats.join(", ")}.` : `Plan exactly ${Math.min(10, Math.max(1, r.count ?? 10))} takes, each a different format, picked from: ${FORMATS.join(", ")}.`}
For each take:
- "format": the format name above.
- "title": 2-5 words.
- "hook": the first spoken line ${r.language === "taglish" ? "in natural Taglish" : "in plain, natural English"}, at most ${Math.floor(r.brand.voicePace * 2.3)} syllables.
- "beats": 3 to 5 beats; "label" is what happens on screen in under 8 words, "seconds" is a whole number; the beats add up to ${r.brand.targetSeconds[0]}-${r.brand.targetSeconds[1]} seconds and the last beat is the end card.
- "claims": the approved claims this take states, copied verbatim from the list (can be empty).
- "logoAt": the second the logo or app screen first appears. It must equal the second the end card beat starts (the sum of every earlier beat).
- "captions": true.
Make every take a genuinely different situation, not the same scene re-skinned.${styleBlock(r.style)}`;
}

// Photo slideshows in the style of a TikTok photo post: real moments with native captions,
// cut with app screens that react to each moment, ending on the app.
export function slidesPrompt(r: TakesRequest) {
  return `You plan photo slideshows (TikTok and Instagram photo mode) for small studios and indie developers.

${brandBlock(r.brand)}

Idea: ${r.idea}

${r.formats?.length ? `Plan exactly ${r.formats.length} slideshow${r.formats.length > 1 ? "s" : ""}, one per format, in this order: ${r.formats.join(", ")}.` : `Plan exactly ${Math.min(10, Math.max(1, r.count ?? 5))} slideshows, each a different format, picked from: ${SLIDE_FORMATS.join(", ")}.`}
How these posts work: a small real-life story told in 5 to 8 slides. "moment" slides are photos of the viewer's life; "app" slides show ${r.brand.name}'s screen reacting to that moment. Alternate them so the app is part of the story, not an ad. The last slide is an app slide that ends the story.
For each slideshow:
- "format": the format name above.
- "title": 2-5 words.
- "hook": the caption on slide 1, at most 8 words, ${r.language === "taglish" ? "natural Taglish" : "plain, natural English"}, first person or talking to the viewer.
- "slides": 5 to 8 slides. Each has "kind" ("moment" or "app"), "scene" (what the picture shows, under 8 words; for app slides, which screen of ${r.brand.name} and what it shows), "caption" (the on-picture text, casual, under 9 words, like a real person posting; slide 1's caption is the hook), and "sticker" (a one-word reaction like "OKAAY" or "wait", or "" for none; use it on at most 2 slides).
- "claims": the approved claims the captions state, copied verbatim (can be empty).
Captions never call a paid feature free and state only approved claims. No hashtags.
Make every slideshow a genuinely different situation.${styleBlock(r.style)}`;
}

export const HOOKS_JSON_HINT = `Reply with JSON only: {"hooks":[{"text":"...","why":"..."}]}`;
export const TAKES_JSON_HINT = `Reply with JSON only: {"takes":[{"format":"...","title":"...","hook":"...","beats":[{"label":"...","seconds":5}],"claims":["..."],"logoAt":18,"captions":true}]}`;

export const SLIDES_JSON_HINT = `Reply with JSON only: {"takes":[{"format":"...","title":"...","hook":"...","slides":[{"kind":"moment","scene":"...","caption":"...","sticker":""}],"claims":["..."]}]}`;

export function briefPrompt(fileName: string, text: string | null) {
  return `You read a product document for an app (a PRD, README, pitch or notes) and pull out the rules a short-video studio needs before it writes promo videos for that app.

Use only what the document says. Never invent features, prices, numbers or claims. If something is not in the document, leave it empty and say so in "notes".

Return:
- "name": the app's name.
- "oneLiner": one plain sentence on what the app does, for a viewer who has never heard of it.
- "audience": who it is for, as the document describes them.
- "voice": the tone videos should use. If the document does not describe one, describe the tone of the document itself and say so in notes.
- "paidFeatures": exact names of features the document says are paid, premium, pro, part of a purchase or subscription. Empty if none.
- "approvedClaims": up to 10 short factual claims the document supports, each under 8 words, written plainly (e.g. "works offline", "no account needed").
- "bannedPhrases": words or promises the document says to avoid. Empty if none.
- "cta": a short end-card line with the app name and where to get it, only if the document says where.
- "tagline": the app's own tagline if it has one, else a short one in its voice (say so in notes).
- "values": 3-5 brand values, two or three words each.
- "tone": 3-5 single words for the tone of voice.
- "aesthetic": 3-5 short phrases for the visual look.
- "colors": up to 5 brand colors as hex codes, only from the document's own CSS or stated colors (empty if none).
- "links": store, website and social links found in the document.
- "notes": one or two sentences on what was missing or unclear.

${text != null ? `The document "${fileName}":\n\n<document>\n${text}\n</document>` : `Read the document at the path given below with the Read tool, then answer.`}`;
}

// One spoken line per beat for a draft cut's voice-over.
export function linesPrompt(r: LinesRequest) {
  const beats = r.take.beats.map((b, i) => `${i + 1}. (${b.seconds} s, at most ${Math.max(4, Math.floor(b.seconds * r.brand.voicePace * 0.85))} syllables) ${b.label}`).join("\n");
  return `Write the voice-over for a short vertical video, one spoken line per beat.

${brandBlock(r.brand)}

Video: ${r.take.format} — ${r.take.title}
Beats (what is on screen):
${beats}

Rules:
- Line 1 is exactly the hook: "${r.take.hook}"
- Each line must fit its syllable limit so the voice finishes inside the beat.
- ${r.language === "taglish" ? "Natural Taglish." : "Plain, natural English."} Talk to the viewer. No hashtags, no emoji.
- The last beat is the end card: say the app name and where to get it, using only the approved claims.
- Never call a paid feature free. State only approved claims.
Return exactly ${r.take.beats.length} lines.`;
}

// Fix or remake one take: keep its format and what works, change only what's needed.
export function fixPrompt(r: FixRequest) {
  const runtime = r.take.beats.reduce((a, b) => a + b.seconds, 0);
  return `You fix one planned short vertical video so it passes the brand's rules.

${brandBlock(r.brand)}

The take (JSON): ${JSON.stringify(r.take)}
Runtime: ${runtime} s. The end card must be the last beat.

What to change: ${r.problem}

Rules:
- Keep the format "${r.take.format}" and everything that already works; change only what fixes the problem.
- Never call a paid feature free, included or "for everyone". State only approved claims, copied verbatim.
- "logoAt" must equal the second the end card beat starts.
- Hook at most ${Math.floor(r.brand.voicePace * 2.3)} syllables, ${r.language === "taglish" ? "natural Taglish" : "plain English"}, talking to the viewer.
- Runtime ${r.brand.targetSeconds[0]}-${r.brand.targetSeconds[1]} s, whole seconds per beat.
Return exactly 1 take in "takes".`;
}

// Updates the brand profile from something the user says in plain words.
export function profileChatPrompt(profile: Record<string, unknown>, message: string) {
  return `You keep a brand profile for a short-video studio up to date.

Current profile (JSON): ${JSON.stringify(profile)}

The user says: "${message}"

Return the full profile with only the fields the message changes or adds. Keep every other field exactly as it is.
Never invent facts the user didn't give. Paid features must never be listed as approved claims.
In "notes", write one short sentence to the user saying what you changed, or asking one question if the message is unclear.`;
}
