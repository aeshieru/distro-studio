// Vercel function: live AI for the deployed site. Needs ANTHROPIC_API_KEY or OPENAI_API_KEY
// in the project's environment variables; without one the site runs on the saved run.
import type { IncomingMessage, ServerResponse } from "node:http";
import { defaultEngine, engines, handleAi } from "../server/ai";

type Req = IncomingMessage & { body?: unknown };

export default async function handler(req: Req, res: ServerResponse) {
  const ready = engines(process.env).length > 0;
  res.setHeader("content-type", "application/json");
  if (req.method === "GET") {
    res.end(JSON.stringify({ ready: engines(process.env).length > 0, engines: engines(process.env), default: defaultEngine(process.env) }));
    return;
  }
  if (!ready) {
    res.statusCode = 503;
    res.end(JSON.stringify({ error: "no_key", message: "This deployment has no AI key. Add ANTHROPIC_API_KEY or OPENAI_API_KEY in Vercel." }));
    return;
  }
  const body = typeof req.body === "string" ? req.body : JSON.stringify(req.body ?? {});
  const { status, json } = await handleAi(body, process.env);
  res.statusCode = status;
  res.end(JSON.stringify(json));
}
