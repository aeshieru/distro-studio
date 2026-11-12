// "Post to…": pick platforms, get a caption written for each from the take and the brand
// profile (checked against the brand rules), then open each platform's upload page with the
// caption copied and the file shown in Finder. Distro does not post for you.
import { useMemo, useState } from "react";
import type { Brand, Take } from "../types";
import { codeLabel } from "../lib/codes";
import { Check, Copy, IcArrow } from "./Icons";

type Platform = { id: string; name: string; limit: number; url: (text: string) => string; prefill: boolean; dot: string; kind: "video" | "photo" | "both" };

const PLATFORMS: Platform[] = [
  { id: "tiktok", name: "TikTok", limit: 2200, url: () => "https://www.tiktok.com/tiktokstudio/upload", prefill: false, dot: "#111111", kind: "both" },
  { id: "ig", name: "Instagram", limit: 2200, url: () => "https://www.instagram.com/", prefill: false, dot: "#d62976", kind: "both" },
  { id: "fb", name: "Facebook Reels", limit: 2200, url: () => "https://www.facebook.com/reels/create", prefill: false, dot: "#1877f2", kind: "video" },
  { id: "yt", name: "YouTube Shorts", limit: 100, url: () => "https://studio.youtube.com/", prefill: false, dot: "#ff0000", kind: "video" },
  { id: "threads", name: "Threads", limit: 500, url: (t) => `https://www.threads.net/intent/post?text=${encodeURIComponent(t)}`, prefill: true, dot: "#555555", kind: "both" },
  { id: "x", name: "X", limit: 280, url: (t) => `https://x.com/intent/post?text=${encodeURIComponent(t)}`, prefill: true, dot: "#000000", kind: "both" },
];

const FREE = /\b(free|libre|walang bayad|no cost)\b/i;
const clean = (a?: string[]) => (a ?? []).map((s) => s.trim()).filter(Boolean);
const tag = (s: string) => `#${s.replace(/[^a-z0-9]+/gi, " ").trim().split(/\s+/).map((w) => w[0].toUpperCase() + w.slice(1)).join("")}`;
const trim = (s: string, n: number) => (s.length <= n ? s : `${s.slice(0, n - 1).trimEnd()}…`);

// A caption per platform, built only from the take and the brand profile.
function captionFor(p: Platform, take: Take, brand: Brand) {
  const hook = take.hook.replace(/[“”"]/g, "").trim();
  const claims = take.claims.filter((c) => clean(brand.approvedClaims).some((a) => a.toLowerCase() === c.toLowerCase()));
  const line = claims.length ? `${claims.slice(0, 2).map((c) => c.charAt(0).toUpperCase() + c.slice(1)).join(". ")}.` : brand.tagline ?? "";
  const tags = [tag(brand.name), tag(take.format), ...clean(brand.tone).slice(0, 1).map(tag)].join(" ");
  if (p.id === "yt") return trim(`${hook} | ${brand.name}`, p.limit);
  if (p.id === "x") return trim(`${hook}\n\n${brand.cta}`, p.limit);
  if (p.id === "threads") return trim(`${hook}\n\n${line}\n${brand.cta}`, p.limit);
  return trim(`${hook}\n\n${line}\n${brand.cta}\n\n${tags}`, p.limit);
}

// The same rules the board enforces, run on the caption text.
function captionIssues(text: string, brand: Brand) {
  const lower = text.toLowerCase();
  const out: string[] = [];
  const banned = clean(brand.bannedPhrases).filter((b) => lower.includes(b.toLowerCase()));
  if (banned.length) out.push(`uses “${banned.join("”, “")}”`);
  const paidFree = clean(brand.paidFeatures).filter((f) => text.split("\n").some((l) => FREE.test(l) && l.toLowerCase().includes(f.toLowerCase())));
  if (paidFree.length) out.push(`calls ${paidFree.join(", ")} free`);
  return out;
}

type Props = { take: Take; brand: Brand; file?: { url: string; path?: string; name: string }; slides?: boolean; onClose: () => void; onSlidesZip?: () => void };

export function PostDialog({ take, brand, file, slides, onClose, onSlidesZip }: Props) {
  const list = PLATFORMS.filter((p) => !slides || p.kind !== "video");
  const [picked, setPicked] = useState<Set<string>>(() => new Set(["tiktok", "ig"]));
  const initial = useMemo(() => Object.fromEntries(list.map((p) => [p.id, captionFor(p, take, brand)])), [take.code]); // eslint-disable-line react-hooks/exhaustive-deps
  const [caps, setCaps] = useState<Record<string, string>>(initial);
  const [opened, setOpened] = useState<Set<string>>(new Set());
  const [note, setNote] = useState<string | null>(null);

  const reveal = async () => {
    if (slides) { onSlidesZip?.(); return "the slides zip is downloading"; }
    if (file?.path) {
      const r = await fetch("api/reveal", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ path: file.path }) }).catch(() => null);
      if (r?.ok) return "the MP4 is selected in Finder";
    }
    if (file) { const a = document.createElement("a"); a.href = file.url; a.download = file.name; a.click(); return "the MP4 is downloading"; }
    return "";
  };

  const open = async (p: Platform) => {
    const text = caps[p.id];
    // Open the tab first, straight from the click, so the browser doesn't block it.
    window.open(p.url(text), "_blank", "noopener");
    try { await navigator.clipboard.writeText(text); } catch { /* clipboard blocked */ }
    const where = await reveal();
    setOpened((o) => new Set(o).add(p.id));
    setNote(`${p.name} opened. Caption copied${p.prefill ? " and filled in" : ""}; ${where}. Drag it into the upload page${p.prefill ? "" : " and paste the caption"}.`);
  };

  return (
    <div className="modal" role="dialog" aria-modal="true" aria-labelledby="post-t" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="modal-card post-card">
        <button type="button" className="modal-x" aria-label="Close" onClick={onClose}>×</button>
        <h2 id="post-t">Post {codeLabel(take.code)}</h2>
        <p>Pick where it goes. Distro writes a caption for each from this take and your {brand.name} profile, checks it against your rules, then opens the upload page with the caption copied. You press post.</p>

        <div className="post-platforms" role="group" aria-label="Platforms">
          {list.map((p) => (
            <button key={p.id} type="button" className={`plat${picked.has(p.id) ? " on" : ""}`} aria-pressed={picked.has(p.id)}
              onClick={() => setPicked((s) => { const n = new Set(s); if (n.has(p.id)) n.delete(p.id); else n.add(p.id); return n; })}>
              <i style={{ background: p.dot }} />{p.name}{picked.has(p.id) && <Check />}
            </button>
          ))}
        </div>

        <div className="post-list">
          {list.filter((p) => picked.has(p.id)).map((p) => {
            const issues = captionIssues(caps[p.id], brand);
            const over = caps[p.id].length > p.limit;
            return (
              <div key={p.id} className="post-row">
                <div className="post-head">
                  <b><i style={{ background: p.dot }} />{p.name}{p.id === "yt" && <span className="hint">title</span>}</b>
                  <span className={`chip ${issues.length || over ? "bad" : "good"}`}>{issues.length ? `Blocked: ${issues.join("; ")}` : over ? `${caps[p.id].length}/${p.limit}, too long` : `Passes your rules · ${caps[p.id].length}/${p.limit}`}</span>
                </div>
                <textarea rows={p.id === "yt" || p.id === "x" ? 2 : 5} value={caps[p.id]} aria-label={`${p.name} caption`} onChange={(e) => setCaps((c) => ({ ...c, [p.id]: e.target.value }))} />
                <div className="acts-row">
                  <button type="button" className={opened.has(p.id) ? "" : "pri"} disabled={issues.length > 0 || over} onClick={() => open(p)}>
                    {opened.has(p.id) ? <><Check />Opened · open again</> : <>Open {p.name} <IcArrow /></>}
                  </button>
                  <button type="button" className="ghost" onClick={async () => { try { await navigator.clipboard.writeText(caps[p.id]); setNote(`${p.name} caption copied.`); } catch { setNote("Copy was blocked. Select the caption and copy it."); } }}><Copy />Copy caption</button>
                </div>
              </div>
            );
          })}
          {picked.size === 0 && <div className="empty">Pick at least one platform.</div>}
        </div>
        {note && <p className="post-note" role="status">{note}</p>}
        <p className="fine">Distro doesn't post for you yet. Captions use only your approved claims and end card; you can edit them before opening.</p>
      </div>
    </div>
  );
}
