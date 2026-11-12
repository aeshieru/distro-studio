// BEAT's AI layer. One prompt and one JSON schema per job; several engines can answer it:
//   claude-api   ANTHROPIC_API_KEY (Anthropic SDK, structured output)
//   claude-code  the logged-in Claude Code CLI (`claude -p --json-schema`)
//   codex        the logged-in OpenAI Codex CLI (`codex exec --output-schema`)
//   openai       OPENAI_API_KEY (ChatGPT models via the Responses API; OPENAI_MODEL, default gpt-5)
//   gemini       the Gemini CLI (`gemini -p`), JSON asked for in the prompt
// "auto" uses the first available in that order; BEAT_AI in .env.local picks a default.
import Anthropic from "@anthropic-ai/sdk";
import { betaZodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod";
import { z } from "zod";
import { execFile, execFileSync, spawn } from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { briefPrompt, hooksPrompt, takesPrompt, type AiRequest } from "../src/lib/prompts";

const HooksSchema = z.object({
  hooks: z.array(z.object({ text: z.string(), why: z.string() })),
});

const TakesSchema = z.object({
  takes: z.array(
    z.object({
      format: z.string(),
      title: z.string(),
      hook: z.string(),
      beats: z.array(z.object({ label: z.string(), seconds: z.number() })),
      claims: z.array(z.string()),
      logoAt: z.number(),
      captions: z.boolean(),
    }),
  ),
});

export const BriefSchema = z.object({
  name: z.string(),
  oneLiner: z.string(),
  audience: z.string(),
  voice: z.string(),
  paidFeatures: z.array(z.string()),
  approvedClaims: z.array(z.string()),
  bannedPhrases: z.array(z.string()),
  cta: z.string(),
  notes: z.string(),
});

export type Env = Record<string, string | undefined>;
type Result = { status: number; json: unknown };
type Job = { prompt: string; schema: z.ZodType; effort: "low" | "medium"; pdf?: { path: string; base64: string } };

export type EngineId = "claude-api" | "claude-code" | "codex" | "openai" | "gemini";
const LABELS: Record<EngineId, string> = {
  "claude-api": "Claude (API key)",
  "claude-code": "Claude Code",
  codex: "Codex",
  openai: "ChatGPT (OpenAI API)",
  gemini: "Gemini CLI",
};
const ORDER: EngineId[] = ["claude-api", "claude-code", "codex", "openai", "gemini"];

const cliCache: Record<string, string | null> = {};
function cli(name: string): string | null {
  if (name in cliCache) return cliCache[name];
  try {
    cliCache[name] = execFileSync("/bin/sh", ["-lc", `command -v ${name}`], { encoding: "utf8" }).trim() || null;
  } catch {
    cliCache[name] = null;
  }
  return cliCache[name];
}

export function engines(env: Env): { id: EngineId; label: string }[] {
  const have: Record<EngineId, boolean> = {
    "claude-api": Boolean(env.ANTHROPIC_API_KEY),
    "claude-code": Boolean(cli("claude")),
    codex: Boolean(cli("codex")),
    openai: Boolean(env.OPENAI_API_KEY),
    gemini: Boolean(cli("gemini")),
  };
  return ORDER.filter((id) => have[id]).map((id) => ({ id, label: LABELS[id] }));
}

export function defaultEngine(env: Env): EngineId | null {
  const list = engines(env).map((e) => e.id);
  const wanted = env.BEAT_AI as EngineId | undefined;
  if (wanted && list.includes(wanted)) return wanted;
  return list[0] ?? null;
}

// Kept for the deployed function and older callers.
export function aiBackend(apiKey: string | undefined) {
  return defaultEngine({ ...process.env, ANTHROPIC_API_KEY: apiKey });
}

const NO_ENGINE: Result = {
  status: 503,
  json: { error: "no_key", message: "No AI engine found. Log in to Claude Code or Codex, or add ANTHROPIC_API_KEY or OPENAI_API_KEY to .env.local, then restart npm run dev." },
};

function pick(env: Env, requested?: string): EngineId | null {
  const list = engines(env).map((e) => e.id);
  if (requested && list.includes(requested as EngineId)) return requested as EngineId;
  return defaultEngine(env);
}

function run(job: Job, env: Env, requested?: string): Promise<Result> {
  const engine = pick(env, requested);
  if (!engine) return Promise.resolve(NO_ENGINE);
  if (job.pdf && engine !== "claude-api" && engine !== "claude-code") {
    return Promise.resolve({ status: 415, json: { error: "pdf", message: `${LABELS[engine]} can't read PDFs here. Switch the AI to Claude, or upload Markdown or Word.` } });
  }
  switch (engine) {
    case "claude-api": return viaClaudeApi(job, env.ANTHROPIC_API_KEY!);
    case "claude-code": return viaClaudeCode(job);
    case "codex": return viaCodex(job);
    case "openai": return viaOpenAi(job, env.OPENAI_API_KEY!, env.OPENAI_MODEL || "gpt-5");
    case "gemini": return viaGemini(job);
  }
}

export async function handleAi(body: string, envOrKey: Env | string | undefined): Promise<Result> {
  const env = typeof envOrKey === "object" ? envOrKey : { ...process.env, ANTHROPIC_API_KEY: envOrKey };
  let req: AiRequest & { engine?: string };
  try {
    req = JSON.parse(body);
  } catch {
    return { status: 400, json: { error: "bad_request", message: "Body is not JSON." } };
  }
  return req.task === "hooks"
    ? run({ prompt: hooksPrompt(req), schema: HooksSchema, effort: "low" }, env, req.engine)
    : run({ prompt: takesPrompt(req), schema: TakesSchema, effort: "medium" }, env, req.engine);
}

const TEXT_EXT = /\.(md|markdown|txt|text|json|csv|html?|xml|ya?ml)$/i;
const OFFICE_EXT = /\.(docx?|rtf|rtfd|odt|pages|webarchive)$/i;

// A product document in, the brand rules out. Word and RTF go through macOS textutil;
// PDFs are read by Claude itself.
export async function handleDoc(body: string, envOrKey: Env | string | undefined): Promise<Result> {
  const env = typeof envOrKey === "object" ? envOrKey : { ...process.env, ANTHROPIC_API_KEY: envOrKey };
  const { name, base64, engine } = JSON.parse(body) as { name: string; base64: string; engine?: string };
  const safe = name.replace(/[^\w.\- ]/g, "_").slice(-80) || "document";
  const buf = Buffer.from(base64, "base64");
  if (buf.length > 20 * 1024 * 1024) return { status: 413, json: { error: "too_big", message: "That file is over 20 MB." } };
  const dir = join(tmpdir(), "beat-docs", String(Date.now()));
  mkdirSync(dir, { recursive: true });
  const path = join(dir, safe);
  writeFileSync(path, buf);

  let text: string | null = null;
  let pdf: Job["pdf"];
  if (TEXT_EXT.test(safe)) text = buf.toString("utf8");
  else if (OFFICE_EXT.test(safe)) {
    if (!existsSync("/usr/bin/textutil")) return { status: 415, json: { error: "type", message: "Word files need the local app on a Mac. Upload Markdown or PDF here." } };
    text = await new Promise<string | null>((res) =>
      execFile("/usr/bin/textutil", ["-convert", "txt", "-stdout", path], { maxBuffer: 32 * 1024 * 1024 }, (err, out) => res(err ? null : out)));
    if (text == null) return { status: 415, json: { error: "unreadable", message: "Could not read that document. Try saving it as PDF or Markdown." } };
  } else if (/\.pdf$/i.test(safe)) pdf = { path, base64 };
  else return { status: 415, json: { error: "type", message: "Use a .md, .txt, .pdf, .docx or .rtf file." } };

  if (text != null && text.length > 400_000) text = text.slice(0, 400_000);
  return run({ prompt: briefPrompt(safe, text) + (pdf ? `\n\nPath: ${pdf.path}` : ""), schema: BriefSchema, effort: "low", pdf }, env, engine);
}

// ---- Schema helpers -------------------------------------------------------

// JSON Schema without zod's 2020-12 "$schema" marker (the CLIs reject it), and strict:
// every object closed and every property required, as OpenAI structured output wants.
function strictSchema(schema: z.ZodType): Record<string, unknown> {
  const { $schema: _drop, ...raw } = z.toJSONSchema(schema) as Record<string, unknown>;
  void _drop;
  const walk = (node: unknown): unknown => {
    if (Array.isArray(node)) return node.map(walk);
    if (!node || typeof node !== "object") return node;
    const o = { ...(node as Record<string, unknown>) };
    for (const k of Object.keys(o)) o[k] = walk(o[k]);
    if (o.type === "object" && o.properties) {
      o.additionalProperties = false;
      o.required = Object.keys(o.properties as object);
    }
    return o;
  };
  return walk(raw) as Record<string, unknown>;
}

function parseLoose(text: string, schema: z.ZodType): Result {
  const cleaned = text.trim().replace(/^```(?:json)?\s*|\s*```$/g, "");
  const start = cleaned.indexOf("{"), end = cleaned.lastIndexOf("}");
  try {
    const parsed = schema.safeParse(JSON.parse(cleaned.slice(start, end + 1)));
    if (parsed.success) return { status: 200, json: parsed.data };
  } catch { /* fall through */ }
  return { status: 502, json: { error: "unparsed", message: "The AI's answer did not match the expected shape. Try again." } };
}

function cleanEnv() {
  const env = { ...process.env };
  delete env.CLAUDECODE;
  delete env.CLAUDE_CODE_ENTRYPOINT;
  return env;
}

function runCli(cmd: string, args: string[], stdin: string, opts: { cwd?: string; timeoutMs?: number } = {}) {
  return new Promise<{ code: number | null; out: string; err: string; timedOut: boolean }>((resolve) => {
    const child = spawn(cmd, args, { env: cleanEnv(), stdio: ["pipe", "pipe", "pipe"], cwd: opts.cwd });
    let out = "", err = "", timedOut = false;
    child.stdout.on("data", (d) => (out += d));
    child.stderr.on("data", (d) => (err += d));
    child.on("error", (e) => { err += String(e); });
    child.stdin.end(stdin);
    const timer = setTimeout(() => { timedOut = true; child.kill(); }, opts.timeoutMs ?? 180_000);
    child.on("close", (code) => { clearTimeout(timer); resolve({ code, out, err, timedOut }); });
  });
}

const TIMEOUT: Result = { status: 504, json: { error: "timeout", message: "The AI took too long. Try again." } };

// ---- Engines --------------------------------------------------------------

async function viaClaudeApi(job: Job, apiKey: string): Promise<Result> {
  const client = new Anthropic({ apiKey });
  const content: Anthropic.Beta.BetaContentBlockParam[] = job.pdf
    ? [{ type: "document", source: { type: "base64", media_type: "application/pdf", data: job.pdf.base64 } }, { type: "text", text: job.prompt.replace(/Read the document at the path given below with the Read tool, then answer\.[\s\S]*$/, "The document is attached above.") }]
    : [{ type: "text", text: job.prompt }];
  try {
    const response = await client.beta.messages.parse({
      model: "claude-opus-5-5",
      max_tokens: 16000,
      // A declined request is re-run on a fallback model inside the same call.
      betas: ["server-side-fallback-2026-07-01"],
      fallbacks: "default",
      output_config: { effort: job.effort, format: betaZodOutputFormat(job.schema) },
      messages: [{ role: "user", content }],
    });
    if (response.stop_reason === "refusal") return { status: 422, json: { error: "refusal", message: "Claude declined this request." } };
    if (!response.parsed_output) return { status: 502, json: { error: "unparsed", message: "Claude's answer did not match the expected shape." } };
    return { status: 200, json: response.parsed_output };
  } catch (error) {
    if (error instanceof Anthropic.AuthenticationError) return { status: 401, json: { error: "auth", message: "The Anthropic API key was rejected." } };
    if (error instanceof Anthropic.RateLimitError) return { status: 429, json: { error: "rate_limited", message: "Rate limited. Try again in a minute." } };
    if (error instanceof Anthropic.APIError) return { status: 502, json: { error: "api", message: `Claude API error ${error.status}` } };
    return { status: 502, json: { error: "network", message: "Could not reach the Claude API." } };
  }
}

// Claude Code: no MCP, structured output, prompt on stdin. A PDF job gets only the Read tool.
async function viaClaudeCode(job: Job): Promise<Result> {
  const tools = job.pdf ? ["--tools", "Read", "--allowedTools", "Read"] : ["--tools", ""];
  const r = await runCli(cli("claude")!, [
    "-p", "--output-format", "json", "--no-session-persistence", ...tools, "--strict-mcp-config",
    "--json-schema", JSON.stringify(strictSchema(job.schema)),
  ], job.prompt, { cwd: job.pdf ? join(job.pdf.path, "..") : undefined });
  if (r.timedOut) return TIMEOUT;
  try {
    const env = JSON.parse(r.out);
    if (env.is_error) return { status: 502, json: { error: "api", message: "Claude Code returned an error." } };
    if (env.structured_output) return parseLoose(JSON.stringify(env.structured_output), job.schema);
    return parseLoose(String(env.result), job.schema);
  } catch {
    console.error("[beat] Claude Code output:", r.out.slice(0, 400), r.err.slice(0, 600));
    return { status: 502, json: { error: "unparsed", message: "Could not read Claude Code's answer." } };
  }
}

// Codex: read-only sandbox, no git check, the final message constrained by a schema file.
async function viaCodex(job: Job): Promise<Result> {
  const dir = join(tmpdir(), "beat-codex", String(Date.now()) + Math.random().toString(36).slice(2, 6));
  mkdirSync(dir, { recursive: true });
  const schemaFile = join(dir, "schema.json"), outFile = join(dir, "out.json");
  writeFileSync(schemaFile, JSON.stringify(strictSchema(job.schema)));
  const r = await runCli(cli("codex")!, [
    "exec", "--skip-git-repo-check", "--ephemeral", "-s", "read-only", "--output-schema", schemaFile, "-o", outFile, "-",
  ], job.prompt, { cwd: dir });
  if (r.timedOut) return TIMEOUT;
  if (!existsSync(outFile)) {
    console.error("[beat] Codex output:", r.out.slice(-400), r.err.slice(-600));
    return { status: 502, json: { error: "api", message: "Codex did not answer. Check that `codex` is logged in." } };
  }
  return parseLoose(readFileSync(outFile, "utf8"), job.schema);
}

// ChatGPT models through the OpenAI Responses API with strict structured output.
async function viaOpenAi(job: Job, apiKey: string, model: string): Promise<Result> {
  const r = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: { authorization: `Bearer ${apiKey}`, "content-type": "application/json" },
    body: JSON.stringify({
      model,
      input: job.prompt,
      text: { format: { type: "json_schema", name: "beat_output", schema: strictSchema(job.schema), strict: true } },
    }),
  }).catch(() => null);
  if (!r) return { status: 502, json: { error: "network", message: "Could not reach the OpenAI API." } };
  if (r.status === 401) return { status: 401, json: { error: "auth", message: "The OpenAI API key was rejected." } };
  if (r.status === 429) return { status: 429, json: { error: "rate_limited", message: "OpenAI rate limit. Try again in a minute." } };
  if (!r.ok) return { status: 502, json: { error: "api", message: `OpenAI API error ${r.status}` } };
  const data = (await r.json()) as { output_text?: string; output?: { content?: { type: string; text?: string }[] }[] };
  const text = data.output_text ?? (data.output ?? []).flatMap((o) => o.content ?? []).filter((c) => c.type === "output_text").map((c) => c.text ?? "").join("");
  return parseLoose(text, job.schema);
}

// Gemini CLI: no schema flag, so the prompt carries the JSON shape.
async function viaGemini(job: Job): Promise<Result> {
  const prompt = `${job.prompt}\n\nReply with only one JSON object that matches this JSON Schema, no prose and no code fences:\n${JSON.stringify(strictSchema(job.schema))}`;
  const r = await runCli(cli("gemini")!, ["-p", prompt], "");
  if (r.timedOut) return TIMEOUT;
  if (!r.out.trim()) return { status: 502, json: { error: "api", message: "Gemini CLI did not answer. Check that `gemini` is logged in." } };
  return parseLoose(r.out, job.schema);
}
