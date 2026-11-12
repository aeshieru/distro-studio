// Vercel function: product document to brand rules. Markdown, text and PDF work here;
// Word files need the local app (macOS textutil).
import type { IncomingMessage, ServerResponse } from "node:http";
import { engines, handleDoc } from "../server/ai";

type Req = IncomingMessage & { body?: unknown };

export default async function handler(req: Req, res: ServerResponse) {
  const ready = engines(process.env).length > 0;
  res.setHeader("content-type", "application/json");
  if (!ready) {
    res.statusCode = 503;
    res.end(JSON.stringify({ error: "no_key", message: "This deployment has no AI key. Add ANTHROPIC_API_KEY or OPENAI_API_KEY in Vercel." }));
    return;
  }
  const body = typeof req.body === "string" ? req.body : JSON.stringify(req.body ?? {});
  const { status, json } = await handleDoc(body, process.env);
  res.statusCode = status;
  res.end(JSON.stringify(json));
}
