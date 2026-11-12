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
};

export type TakesRequest = {
  task: "takes";
  language: ContentLang;
  brand: Brand;
  idea: string;
  style?: StyleRef;
};

function styleBlock(s?: StyleRef) {
  if (!s || !(s.url || s.notes || s.pacing)) return "";
  const lines = ["", "Style reference the user wants these takes to feel like:"];
  if (s.url) lines.push(`- ${s.site ?? "Post"}: ${s.url}${s.title ? ` (${s.title})` : ""}`);
  if (s.caption) lines.push(`- Its caption: "${s.caption.slice(0, 600)}"`);
  if (s.pacing) lines.push(`- Measured pacing of their reference video: ${s.pacing.duration.toFixed(1)} s long, ${s.pacing.cuts} cuts, a new shot about every ${s.pacing.avgShot.toFixed(1)} s${s.pacing.firstCut != null ? `, first cut at ${s.pacing.firstCut.toFixed(1)} s` : ""}. Match this rhythm in the beat lengths.`);
  if (s.notes) lines.push(`- What they like about it: ${s.notes.slice(0, 600)}`);
  lines.push("Borrow the style (pacing, hook shape, tone, format), never its content, brand, characters or exact words.");
  return lines.join("\n");
}

export type AiRequest = HooksRequest | TakesRequest;

const FORMATS = [
  "What-if", "I forgot", "Arguing", "POV", "Myth-bust",
  "Countdown", "Before/After", "Skit", "Quick tutorial", "Reaction",
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
  ].join("\n");
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

Plan exactly 10 takes, one per format, in this order: ${FORMATS.join(", ")}.
For each take:
- "format": the format name above.
- "title": 2-5 words.
- "hook": the first spoken line ${r.language === "taglish" ? "in natural Taglish" : "in plain, natural English"}, at most ${Math.floor(r.brand.voicePace * 2.3)} syllables.
- "beats": 3 to 5 beats; "label" is what happens on screen in under 8 words, "seconds" is a whole number; the beats add up to ${r.brand.targetSeconds[0]}-${r.brand.targetSeconds[1]} seconds and the last beat is the end card.
- "claims": the approved claims this take states, copied verbatim from the list (can be empty).
- "logoAt": the second the logo or app screen first appears (only during the end card).
- "captions": true.
Make the ten genuinely different situations, not the same scene re-skinned.${styleBlock(r.style)}`;
}

export const HOOKS_JSON_HINT = `Reply with JSON only: {"hooks":[{"text":"...","why":"..."}]}`;
export const TAKES_JSON_HINT = `Reply with JSON only: {"takes":[{"format":"...","title":"...","hook":"...","beats":[{"label":"...","seconds":5}],"claims":["..."],"logoAt":18,"captions":true}]}`;

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
- "notes": one or two sentences on what was missing or unclear.

${text != null ? `The document "${fileName}":\n\n<document>\n${text}\n</document>` : `Read the document at the path given below with the Read tool, then answer.`}`;
}
