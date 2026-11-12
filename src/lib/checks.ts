import type { Brand, Take } from "../types";
import { lintHook } from "./lint";

export type CheckResult = {
  id: string;
  label: string;
  state: "pass" | "fail" | "warn" | "later";
  detail: string;
  blocks: boolean;
};

const FREE_WORDS = /\b(free|libre|walang bayad|no cost)\b/i;

function takeText(t: Take) {
  return [t.title, t.hook, ...t.beats.map((b) => b.label), ...t.claims].join(" \n ");
}

// Cheapest first. A failing blocking check stops the run, like a gate.
const clean = (a: string[]) => a.map((s) => s.trim()).filter(Boolean);

export function runChecks(take: Take, rawBrand: Brand): CheckResult[] {
  const brand = { ...rawBrand, paidFeatures: clean(rawBrand.paidFeatures), approvedClaims: clean(rawBrand.approvedClaims), bannedPhrases: clean(rawBrand.bannedPhrases) };
  const out: CheckResult[] = [];
  const runtime = take.beats.reduce((s, b) => s + b.seconds, 0);
  const text = takeText(take);
  const lower = text.toLowerCase();

  const push = (r: CheckResult) => { out.push(r); return r.state === "fail" && r.blocks; };

  if (push({
    id: "captions", label: "Captions on", blocks: true,
    state: take.captions ? "pass" : "fail",
    detail: take.captions ? "Word-by-word captions in the scene" : "Most feed viewers watch muted. Turn captions on.",
  })) return out;

  const banned = brand.bannedPhrases.filter((p) => lower.includes(p.toLowerCase()));
  if (push({
    id: "banned", label: "No banned phrases", blocks: true,
    state: banned.length ? "fail" : "pass",
    detail: banned.length ? `Uses “${banned.join("”, “")}”` : `None of ${brand.bannedPhrases.length} banned phrases`,
  })) return out;

  const paidSaidFree = brand.paidFeatures.filter((f) => lower.includes(f.toLowerCase()));
  const pitchesFree = paidSaidFree.length > 0 && text.split(/\n/).some((line) =>
    FREE_WORDS.test(line) && paidSaidFree.some((f) => line.toLowerCase().includes(f.toLowerCase())));
  if (push({
    id: "paid", label: "Paid features not pitched as free", blocks: true,
    state: pitchesFree ? "fail" : "pass",
    detail: pitchesFree
      ? `Calls ${paidSaidFree.join(", ")} free. It's in the ${brand.name} unlock.`
      : paidSaidFree.length ? `Mentions ${paidSaidFree.join(", ")} without calling it free` : "No paid features mentioned",
  })) return out;

  const unapproved = take.claims.filter((c) => !brand.approvedClaims.some((a) => a.toLowerCase() === c.toLowerCase()));
  if (push({
    id: "claims", label: "Claims on the approved list", blocks: true,
    state: brand.approvedClaims.length === 0 ? "warn" : unapproved.length ? "fail" : "pass",
    detail: brand.approvedClaims.length === 0
      ? "No approved claims set for this brand yet (Brief)"
      : unapproved.length ? `Not approved: “${unapproved.join("”, “")}”` : `${take.claims.length} claim(s), all approved`,
  })) return out;

  const lateEnough = take.logoAt >= runtime - brand.endCardSeconds - 0.01;
  if (push({
    id: "logo", label: "Logo and app screen only at the end", blocks: true,
    state: lateEnough ? "pass" : "fail",
    detail: lateEnough
      ? `First shows at ${take.logoAt.toFixed(1)} s of ${runtime} s`
      : `Shows at ${take.logoAt.toFixed(1)} s; keep it to the last ${brand.endCardSeconds} s`,
  })) return out;

  const lint = lintHook(take.hook, { pace: brand.voicePace, dropAt: null });
  push({
    id: "hook", label: "Hook lands within 2.5 s", blocks: false,
    state: lint.landsAt <= 2.5 ? "pass" : "warn",
    detail: `About ${lint.landsAt} s at ${brand.name}'s VO pace (${lint.syllables} syllables)`,
  });

  const [lo, hi] = brand.targetSeconds;
  push({
    id: "runtime", label: `Runtime ${lo}–${hi} s`, blocks: false,
    state: runtime >= lo && runtime <= hi ? "pass" : "warn",
    detail: `${runtime} s planned`,
  });

  const a = take.animatic;
  push(a && a.lufs != null
    ? { id: "loudness", label: "Loudness −14 LUFS", blocks: false, state: Math.abs(a.lufs + 14) <= 2 ? "pass" : "warn", detail: `Measured ${a.lufs} LUFS on the animatic` }
    : { id: "loudness", label: "Loudness −14 LUFS", blocks: false, state: "later", detail: "Measured on the rendered file" });
  push(a
    ? { id: "size", label: "Under 10 MB per platform cut", blocks: false, state: a.sizeMB < 10 ? "pass" : "warn", detail: `Measured ${a.sizeMB} MB on the animatic` }
    : { id: "size", label: "Under 10 MB per platform cut", blocks: false, state: "later", detail: "Measured on the rendered file" });
  return out;
}

export function blockingFailure(results: CheckResult[]) {
  return results.find((r) => r.state === "fail" && r.blocks) ?? null;
}
