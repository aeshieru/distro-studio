// Builds dist/artifact.html: the page body for publishing dist/ as a claude.ai artifact.
import { readFileSync, writeFileSync } from "node:fs";
const html = readFileSync("dist/index.html", "utf8");
const pick = (re) => (html.match(re) || [""])[0];
const page = [
  "<title>BEAT</title>",
  pick(/<link rel="icon"[^>]*>/),
  pick(/<link rel="stylesheet"[^>]*>/),
  '<div id="root"></div>',
  pick(/<script type="module"[^>]*><\/script>/),
].join("\n");
writeFileSync("dist/artifact.html", page + "\n");
console.log(page);
