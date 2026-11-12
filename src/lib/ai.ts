import type { AiMode, HookOption, Take } from "../types";
import { HOOKS_JSON_HINT, TAKES_JSON_HINT, hooksPrompt, takesPrompt, type HooksRequest, type TakesRequest } from "./prompts";

type SampleFn = ((input: string, opts?: { modelTier?: string; cache?: boolean }) => Promise<{ text: string }>) & {
  json: (input: string, opts?: { modelTier?: string; cache?: boolean }) => Promise<unknown>;
};

declare global {
  interface Window {
    claude?: { use: (name: string) => Promise<unknown> };
  }
}

let samplePromise: Promise<SampleFn | null> | null = null;
function getSample(): Promise<SampleFn | null> {
  if (!samplePromise) {
    samplePromise = window.claude?.use
      ? (window.claude.use("sample") as Promise<SampleFn | null>).catch(() => null)
      : Promise.resolve(null);
  }
  return samplePromise;
}

// AI engines the local server can use (Claude, Codex, ChatGPT, Gemini) and the one chosen.
export type Engine = { id: string; label: string };
export let aiEngines: Engine[] = [];
let engine: string | null = null;
export const currentEngine = () => aiEngines.find((e) => e.id === engine) ?? null;
export function setEngine(id: string) {
  engine = id;
  try { localStorage.setItem("beat.engine", id); } catch { /* storage blocked */ }
}

// Which live path this view can use. Saved runs always work.
export async function detectAiMode(): Promise<AiMode> {
  if (await getSample()) return "artifact";
  try {
    const r = await fetch("api/ai", { method: "GET" });
    const j = r.ok ? await r.json() : null;
    if (j?.ready) {
      aiEngines = j.engines ?? [];
      let saved: string | null = null;
      try { saved = localStorage.getItem("beat.engine"); } catch { /* storage blocked */ }
      engine = aiEngines.some((e) => e.id === saved) ? saved : j.default ?? aiEngines[0]?.id ?? null;
      return "proxy";
    }
  } catch {
    /* no dev server */
  }
  return "saved";
}

export class AiError extends Error {
  constructor(public code: string, message: string) {
    super(message);
  }
}

async function viaProxy(body: HooksRequest | TakesRequest) {
  const r = await fetch("api/ai", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ ...body, engine }) });
  const json = await r.json();
  if (!r.ok) throw new AiError(json.error ?? "api", json.message ?? "Claude request failed.");
  return json;
}

async function viaArtifact(prompt: string, hint: string) {
  const sample = await getSample();
  if (!sample) throw new AiError("unavailable", "Claude is not available in this view.");
  try {
    return await sample.json(`${prompt}\n\n${hint}`, { modelTier: "default", cache: false });
  } catch (e) {
    const code = (e as { code?: string }).code ?? "api";
    throw new AiError(code, code === "not_granted" ? "Claude access was declined for this page." : "Claude request failed.");
  }
}

export async function generateHooks(mode: AiMode, req: HooksRequest): Promise<HookOption[]> {
  const json = (mode === "artifact" ? await viaArtifact(hooksPrompt(req), HOOKS_JSON_HINT) : await viaProxy(req)) as { hooks?: HookOption[] };
  if (!json?.hooks?.length) throw new AiError("unparsed", "Claude's answer had no hooks.");
  return json.hooks.slice(0, 4);
}

export async function generateTakes(mode: AiMode, req: TakesRequest): Promise<Omit<Take, "code" | "status">[]> {
  const json = (mode === "artifact" ? await viaArtifact(takesPrompt(req), TAKES_JSON_HINT) : await viaProxy(req)) as { takes?: Omit<Take, "code" | "status">[] };
  if (!json?.takes?.length) throw new AiError("unparsed", "Claude's answer had no takes.");
  return json.takes.slice(0, 10);
}

export type BriefDraft = {
  name: string; oneLiner: string; audience: string; voice: string;
  paidFeatures: string[]; approvedClaims: string[]; bannedPhrases: string[]; cta: string; notes: string;
};

const BRIEF_HINT = `Reply with JSON only: {"name":"","oneLiner":"","audience":"","voice":"","paidFeatures":[],"approvedClaims":[],"bannedPhrases":[],"cta":"","notes":""}`;

function toBase64(buf: ArrayBuffer) {
  let s = "";
  const bytes = new Uint8Array(buf);
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(s);
}

// Reads a PRD, README or other product doc and drafts the brand rules from it.
export async function extractBrief(mode: AiMode, file: File): Promise<BriefDraft> {
  if (mode === "saved") throw new AiError("unavailable", "No AI engine is connected in this view, so it can't read documents.");
  if (mode === "proxy") {
    const r = await fetch("api/doc", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ name: file.name, base64: toBase64(await file.arrayBuffer()), engine }) });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) throw new AiError(j.error ?? "api", j.message ?? "Could not read that document.");
    return j as BriefDraft;
  }
  if (!/\.(md|markdown|txt|text|json|csv|html?)$/i.test(file.name)) {
    throw new AiError("type", "This hosted page reads Markdown and text files. Open the local app for PDF and Word files.");
  }
  const { briefPrompt } = await import("./prompts");
  const text = (await file.text()).slice(0, 200_000);
  return (await viaArtifact(briefPrompt(file.name, text), BRIEF_HINT)) as BriefDraft;
}

export type LinkPreview = { site: string; url: string; title: string; caption: string; image: string; found: boolean };

// Public preview data for a style-reference link (no video download).
export async function readLink(url: string): Promise<LinkPreview> {
  const r = await fetch("api/link", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ url }) }).catch(() => null);
  if (!r) throw new AiError("network", "Links can be read on the local app or the deployed site.");
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new AiError(j.error ?? "link", j.message ?? "Could not read that link.");
  return j as LinkPreview;
}
