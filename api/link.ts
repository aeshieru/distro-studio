// Vercel function: public preview data for a style-reference link.
import type { IncomingMessage, ServerResponse } from "node:http";
import { handleLink } from "../server/link";

type Req = IncomingMessage & { body?: unknown };

export default async function handler(req: Req, res: ServerResponse) {
  const body = typeof req.body === "string" ? req.body : JSON.stringify(req.body ?? {});
  const { status, json } = await handleLink(body);
  res.statusCode = status;
  res.setHeader("content-type", "application/json");
  res.end(JSON.stringify(json));
}
