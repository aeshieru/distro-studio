import { defineConfig, loadEnv, type Plugin } from "vite";
import react from "@vitejs/plugin-react";
import type { IncomingMessage, ServerResponse } from "node:http";
import { defaultEngine, engines, handleAi, handleDoc, handleSite, handleSiteText } from "./server/ai";
import { handleAnimatic, handleRender, handleReveal, handleRoughCut, handleSceneCut, handleTts, renderStatus, serveRender } from "./server/render";
import { handleLink } from "./server/link";
import { handleLook, lookStatus } from "./server/look";

async function readBody(req: IncomingMessage) {
  let body = "";
  for await (const chunk of req) body += chunk;
  return body;
}

function send(res: ServerResponse, status: number, json: unknown) {
  res.statusCode = status;
  res.setHeader("content-type", "application/json");
  res.end(JSON.stringify(json));
}

// Dev-only server: the AI engines (Claude, Codex, ChatGPT, Gemini), voice-over and renders.
// Keys stay on this machine; nothing secret reaches the browser.
function studioServer(fileEnv: Record<string, string>): Plugin {
  const env = { ...process.env, ...fileEnv };
  return {
    name: "beat-studio-server",
    configureServer(server) {
      server.middlewares.use("/api/ai", async (req, res) => {
        if (req.method === "GET") return send(res, 200, { ready: engines(env).length > 0, engines: engines(env), default: defaultEngine(env) });
        const { status, json } = await handleAi(await readBody(req), env);
        send(res, status, json);
      });
      server.middlewares.use("/api/doc", async (req, res) => {
        try { const { status, json } = await handleDoc(await readBody(req), env); send(res, status, json); }
        catch { send(res, 500, { error: "doc", message: "Could not read that document." } ); }
      });
      server.middlewares.use("/api/site-text", async (req, res) => {
        try { const { status, json } = await handleSiteText(await readBody(req)); send(res, status, json); }
        catch { send(res, 500, { error: "site", message: "Could not read that site." }); }
      });
      server.middlewares.use("/api/site", async (req, res) => {
        try { const { status, json } = await handleSite(await readBody(req), env); send(res, status, json); }
        catch { send(res, 500, { error: "site", message: "Could not read that site." }); }
      });
      server.middlewares.use("/api/reveal", async (req, res) => {
        try { const { status, json } = await handleReveal(await readBody(req)); send(res, status, json); }
        catch { send(res, 500, { error: "reveal", message: "Couldn't open Finder." }); }
      });
      server.middlewares.use("/api/look", async (req, res) => {
        if (req.method === "GET") return send(res, 200, lookStatus());
        try { const { status, json } = await handleLook(await readBody(req)); send(res, status, json); }
        catch { send(res, 500, { error: "look", message: "Claude in Chrome couldn't look at that link." }); }
      });
      server.middlewares.use("/api/link", async (req, res) => {
        try { const { status, json } = await handleLink(await readBody(req)); send(res, status, json); }
        catch { send(res, 500, { error: "link", message: "Could not read that link." }); }
      });
      server.middlewares.use("/api/tts", async (req, res) => {
        try { const { status, json } = await handleTts(await readBody(req)); send(res, status, json); }
        catch { send(res, 500, { error: "tts", message: "The voice-over failed." }); }
      });
      server.middlewares.use("/api/render", async (req, res) => {
        if (req.method === "GET") return send(res, 200, renderStatus());
        try { const { status, json } = await handleRender(await readBody(req)); send(res, status, json); }
        catch { send(res, 500, { error: "render", message: "The render failed." }); }
      });
      server.middlewares.use("/api/scenecut", async (req, res) => {
        try {
          const chunks: Buffer[] = [];
          for await (const c of req) chunks.push(c as Buffer);
          const q = new URL(req.url ?? "", "http://x").searchParams;
          const { status, json } = await handleSceneCut(Buffer.concat(chunks), q);
          send(res, status, json);
        } catch { send(res, 500, { error: "scenecut", message: "Couldn't turn the browser recording into an MP4." }); }
      });
      server.middlewares.use("/api/roughcut", async (req, res) => {
        try { const { status, json } = await handleRoughCut(await readBody(req)); send(res, status, json); }
        catch { send(res, 500, { error: "roughcut", message: "The draft cut failed." }); }
      });
      server.middlewares.use("/api/animatic", async (req, res) => {
        try { const { status, json } = await handleAnimatic(await readBody(req)); send(res, status, json); }
        catch { send(res, 500, { error: "animatic", message: "The animatic failed." }); }
      });
      server.middlewares.use("/renders", serveRender);
    },
  };
}

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "");
  return {
    plugins: [react(), studioServer(env)],
    base: "./",
    server: { port: 5178 },
  };
});
