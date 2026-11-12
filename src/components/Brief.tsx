import { useRef, useState, type ReactNode } from "react";
import type { AiMode, Brand } from "../types";
import { chatProfile, extractBrief, readSiteText, AiError, currentEngine, type BriefDraft } from "../lib/ai";
import { Progress, useSteps } from "./Progress";
import { Check, IcChat, IcLink, IcPencil, Spark, Upload } from "./Icons";
import { MakeChooser } from "./MakeChooser";
import type { MakeKind } from "./Ideate";

type Tab = "brand" | "rules";
type Props = {
  brand: Brand;
  aiMode: AiMode;
  onChange: (b: Brand) => void;
  onCreate: (b: Brand) => void;
  onPick: (k: MakeKind | "fix") => void;
};

// Keep blank lines while typing; the checks ignore them.
const list = (v: string) => v.split("\n");
const filled = (a?: string[]) => (a ?? []).map((s) => s.trim()).filter(Boolean);
const slug = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "app";

// A profile card: shows the value; the round pencil opens the field in place.
function Card({ label, hint, wide, empty, view, editor, className }: { label: string; hint?: string; wide?: boolean; empty?: boolean; view: ReactNode; editor: ReactNode; className?: string }) {
  const [open, setOpen] = useState(false);
  return (
    <div className={`pcard${wide ? " wide" : ""}${empty ? " empty" : ""}${open ? " editing" : ""}${className ? ` ${className}` : ""}`}>
      <div className="pcard-head">
        <span className="pk">{label}{hint && <span className="hint">{hint}</span>}</span>
        <button type="button" className="pencil" onClick={() => setOpen((o) => !o)} aria-expanded={open} aria-label={open ? `Done editing ${label}` : `${empty ? "Add" : "Edit"} ${label}`}>
          {open ? <Check /> : <IcPencil />}
        </button>
      </div>
      {open ? editor : view}
    </div>
  );
}

const Chips = ({ items, tone }: { items?: string[]; tone?: "good" | "" }) =>
  filled(items).length ? <div className="chips">{filled(items).map((x) => <span className={`chip outline ${tone ?? ""}`} key={x}>{x}</span>)}</div> : <p className="muted">Not set yet</p>;

const SITE: [RegExp, string][] = [[/apps\.apple\.com/, "App Store"], [/play\.google/, "Google Play"], [/tiktok/, "TikTok"], [/instagram/, "Instagram"], [/facebook|fb\.com/, "Facebook"], [/x\.com|twitter/, "X"], [/youtu/, "YouTube"], [/threads/, "Threads"]];
const siteName = (u: string) => SITE.find(([re]) => re.test(u))?.[1] ?? u.replace(/^https?:\/\/(www\.)?/, "").split("/")[0];

export function Brief({ brand, aiMode, onChange, onCreate, onPick }: Props) {
  const set = <K extends keyof Brand>(k: K, v: Brand[K]) => onChange({ ...brand, [k]: v });
  const fileRef = useRef<HTMLInputElement>(null);
  const [site, setSite] = useState(brand.site ?? "");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [draft, setDraft] = useState<(BriefDraft & { from: string; site?: string }) | null>(null);
  const [over, setOver] = useState(false);
  const [tab, setTab] = useState<Tab>("brand");
  const [chat, setChat] = useState<{ who: "you" | "beat"; text: string }[]>([]);
  const [msg, setMsg] = useState("");
  const [chatBusy, setChatBusy] = useState(false);
  const [askOpen, setAskOpen] = useState(false);
  const [ready, setReady] = useState(false);
  const prog = useSteps();
  const engine = currentEngine()?.label ?? "The AI";
  const canAi = aiMode !== "saved";

  // Completeness, the way the profile is used by Explore, Arrange and the renders.
  const checks: [boolean, string][] = [
    [Boolean(brand.name.trim()), "app name"],
    [Boolean(brand.oneLiner.trim()), "what it is"],
    [Boolean(brand.tagline?.trim()), "tagline"],
    [filled(brand.tone).length > 0, "tone"],
    [filled(brand.values).length > 0, "values"],
    [Boolean(brand.audience.trim()), "audience"],
    [filled(brand.paidFeatures).length > 0, "paid features"],
    [filled(brand.approvedClaims).length > 0, "approved claims"],
    [filled(brand.bannedPhrases).length > 0, "banned phrases"],
    [Boolean(brand.cta.trim()), "end card"],
  ];
  const pct = Math.round((checks.filter(([ok]) => ok).length / checks.length) * 100);
  const missing = checks.filter(([ok]) => !ok).map(([, l]) => l);

  const fromDraft = (d: BriefDraft & { site?: string }, base: Brand): Brand => ({
    ...base,
    name: d.name || base.name,
    site: d.site ?? base.site,
    oneLiner: d.oneLiner || base.oneLiner,
    audience: d.audience || base.audience,
    voice: d.voice || base.voice,
    paidFeatures: d.paidFeatures ?? base.paidFeatures,
    approvedClaims: d.approvedClaims ?? base.approvedClaims,
    bannedPhrases: d.bannedPhrases?.length ? d.bannedPhrases : base.bannedPhrases,
    cta: d.cta || base.cta,
    tagline: d.tagline || base.tagline,
    values: d.values?.length ? d.values : base.values,
    tone: d.tone?.length ? d.tone : base.tone,
    aesthetic: d.aesthetic?.length ? d.aesthetic : base.aesthetic,
    colors: d.colors?.length ? d.colors.filter((c) => /^#[0-9a-f]{6}$/i.test(c)) : base.colors,
    links: d.links?.length ? d.links : base.links,
  });

  const fromFile = async (file: File) => {
    setErr(null); setDraft(null); setBusy(true);
    prog.reset([{ id: "read", label: `Read ${file.name}` }, { id: "draft", label: `${engine} drafts your brand profile` }]);
    prog.update("read", "done", `${(file.size / 1024).toFixed(0)} KB`);
    prog.update("draft", "now", "name, tagline, tone, values, colors, what's paid, what you may claim");
    try {
      const d = await extractBrief(aiMode, file);
      prog.update("draft", "done", `${d.paidFeatures.length} paid features, ${d.approvedClaims.length} claims, ${d.tone?.length ?? 0} tone words`);
      setDraft({ ...d, from: file.name });
    } catch (e) {
      const m = e instanceof AiError ? e.message : "Could not read that document.";
      prog.update("draft", "fail", m); setErr(m);
    } finally { setBusy(false); }
  };

  const fromSite = async () => {
    if (!site.trim()) return;
    setErr(null); setDraft(null); setBusy(true);
    prog.reset([{ id: "open", label: "Open your page" }, { id: "draft", label: `${engine} drafts your brand profile` }]);
    prog.update("open", "now", site.trim());
    try {
      const page = await readSiteText(site);
      prog.update("open", "done", `${page.words.toLocaleString()} words read from ${page.host}${(page as { colors?: string[] }).colors?.length ? `, ${(page as { colors?: string[] }).colors!.length} colors found` : ""}`);
      prog.update("draft", "now", "name, tagline, tone, values, colors, what's paid, what you may claim");
      const d = await extractBrief(aiMode, new File([page.text], `${page.host}.txt`, { type: "text/plain" }));
      prog.update("draft", "done", `${d.paidFeatures.length} paid features, ${d.approvedClaims.length} claims, ${d.tone?.length ?? 0} tone words`);
      setDraft({ ...d, from: page.host, site: page.url });
    } catch (e) {
      const m = e instanceof AiError ? e.message : "Could not read that site.";
      prog.steps.forEach((s) => s.state === "now" && prog.update(s.id, "fail", m));
      setErr(m);
    } finally { setBusy(false); }
  };

  const create = () => {
    if (!draft) return;
    onCreate(fromDraft(draft, {
      ...brand, id: `${slug(draft.name)}-${Date.now().toString(36)}`, voicePace: 3.3, targetSeconds: [15, 25], endCardSeconds: 4,
      paidFeatures: [], approvedClaims: [], bannedPhrases: ["guaranteed"], cta: draft.name, tagline: "", values: [], tone: [], aesthetic: [], colors: [], links: [],
    }));
    setDraft(null);
  };
  const replace = () => { if (draft) { onChange({ ...fromDraft(draft, brand), id: brand.id }); setDraft(null); } };

  // Ask Distro: plain words in, the profile updated, and a note on what changed.
  const send = async () => {
    const text = msg.trim();
    if (!text) return;
    setMsg(""); setChat((c) => [...c, { who: "you", text }]); setChatBusy(true);
    try {
      const { id: _id, voicePace: _p, targetSeconds: _t, endCardSeconds: _e, ...profile } = brand;
      void _id; void _p; void _t; void _e;
      const d = await chatProfile(aiMode, profile, text);
      const next = { ...fromDraft(d, brand), id: brand.id };
      const norm = (v: unknown) => JSON.stringify(Array.isArray(v) ? filled(v as string[]) : v ?? "");
      const names: Partial<Record<keyof Brand, string>> = { oneLiner: "what it is", approvedClaims: "approved claims", paidFeatures: "paid features", bannedPhrases: "banned phrases", aesthetic: "look", cta: "end card", site: "link" };
      const changed = (Object.keys(next) as (keyof Brand)[]).filter((k) => norm(next[k]) !== norm(brand[k])).map((k) => names[k] ?? k);
      onChange(next);
      setChat((c) => [...c, { who: "beat", text: `${d.notes || "Done."}${changed.length ? ` Updated: ${changed.join(", ")}.` : ""}` }]);
    } catch (e) {
      setChat((c) => [...c, { who: "beat", text: e instanceof AiError ? e.message : "I couldn't update the profile. Try again." }]);
    } finally { setChatBusy(false); }
  };

  const edText = (k: "oneLiner" | "audience" | "voice" | "tagline" | "cta" | "name", rows = 2) => (
    <textarea rows={rows} value={(brand[k] as string) ?? ""} onChange={(e) => set(k, e.target.value)} aria-label={k} autoFocus />
  );
  const edList = (k: "paidFeatures" | "approvedClaims" | "bannedPhrases" | "values" | "tone" | "aesthetic" | "links" | "colors") => (
    <textarea rows={Math.max(3, (brand[k]?.length ?? 0) + 1)} value={(brand[k] ?? []).join("\n")} onChange={(e) => set(k, list(e.target.value))} aria-label={k} autoFocus />
  );

  return (
    <div className="profile">
      <header className="profile-hero">
        <h2 className="serif">Your brand profile</h2>
        <p>Everything Distro writes, checks and renders follows it.</p>
      </header>

      <section className="import-bar" data-tour="upload"
        onDragOver={(e) => { e.preventDefault(); setOver(true); }}
        onDragLeave={() => setOver(false)}
        onDrop={(e) => { e.preventDefault(); setOver(false); const f = e.dataTransfer.files?.[0]; if (f) fromFile(f); }}>
        <div className={`import-row${over ? " over" : ""}`}>
          <form className="own-row grow" onSubmit={(e) => { e.preventDefault(); fromSite(); }}>
            <span className="in-ico"><IcLink /></span>
            <input type="text" inputMode="url" aria-label="Website or App Store link" placeholder="Your website or App Store link" value={site}
              onChange={(e) => setSite(e.target.value)} disabled={busy} />
            <button type="submit" className="pri" disabled={busy || !site.trim() || aiMode !== "proxy"}
              title={aiMode !== "proxy" ? "Reading a website needs the local app with an AI engine" : undefined}><Spark />Read it</button>
          </form>
          <span className="or">or</span>
          <input ref={fileRef} type="file" className="sr" aria-label="Product document" accept=".md,.markdown,.txt,.pdf,.docx,.doc,.rtf,.json,.html"
            onChange={(e) => { const f = e.target.files?.[0]; if (f) fromFile(f); e.target.value = ""; }} />
          <button type="button" onClick={() => fileRef.current?.click()} disabled={busy || !canAi}><Upload />Upload a PRD or doc</button>
        </div>
        {(busy || prog.steps.some((s) => s.state !== "todo")) && prog.steps.length > 0 && <Progress steps={prog.steps} />}
        {!canAi && <p className="note">No AI engine is connected in this view. Edit the profile by hand below.</p>}
        {err && !busy && <p className="err">{err}</p>}
      </section>

      {draft && (
        <section className="profile-box draft" aria-label="What the AI found">
          <div className="box-head">
            <h3><Spark className="i" />Found on {draft.from}</h3>
            <p>Check it before you use it.</p>
          </div>
          <div className="cards2">
            <div className="pcard wide"><span className="pk">App</span><b className="big">{draft.name || "not found"}</b>{draft.tagline && <p className="tagline">{draft.tagline}</p>}<p>{draft.oneLiner}</p></div>
            {!!draft.colors?.length && <div className="pcard wide"><span className="pk">Colors</span><div className="swatches">{draft.colors.map((c) => <span key={c}><i style={{ background: c }} />{c}</span>)}</div></div>}
            <div className="pcard"><span className="pk">Tone</span><Chips items={draft.tone} /></div>
            <div className="pcard"><span className="pk">Values</span><Chips items={draft.values} /></div>
            <div className="pcard"><span className="pk">Paid features ({draft.paidFeatures.length})</span><Chips items={draft.paidFeatures} /></div>
            <div className="pcard"><span className="pk">Approved claims ({draft.approvedClaims.length})</span><Chips items={draft.approvedClaims} tone="good" /></div>
            {draft.notes && <div className="pcard wide"><span className="pk">Notes</span><p>{draft.notes}</p></div>}
          </div>
          <div className="acts-row">
            <button type="button" className="pri" onClick={create}>Create brand “{draft.name || "New app"}”</button>
            <button type="button" onClick={replace}>Replace the {brand.name} profile</button>
            <button type="button" className="ghost" onClick={() => setDraft(null)}>Discard</button>
          </div>
        </section>
      )}

      <section className="profile-box" data-tour="rules">
        <div className="seg-tabs" role="tablist" aria-label="Profile sections">
          {([["brand", "Brand overview"], ["rules", "Rules and links"]] as [Tab, string][]).map(([id, l]) => (
            <button key={id} type="button" role="tab" aria-selected={tab === id} className={tab === id ? "on" : ""} onClick={() => setTab(id)}>{l}</button>
          ))}
        </div>

        {tab === "brand" && (
          <>
            <div className="box-head"><h3>Brand overview</h3><p>Guidelines that keep every video and slideshow on brand.</p></div>
            <div className="cards2">
              <Card wide className="hero-card" label="App" view={<><b className="huge">{brand.name}</b>{brand.site ? <a className="plink" href={brand.site} target="_blank" rel="noreferrer"><IcLink />{brand.site.replace(/^https?:\/\//, "")}</a> : <p className="muted">No link yet</p>}</>}
                editor={<div className="stack">{edText("name", 1)}<input type="text" aria-label="Website" placeholder="Website or store link" value={brand.site ?? ""} onChange={(e) => set("site", e.target.value)} /></div>} />
              <Card wide label="Colors" hint="hex codes, one per line" empty={!filled(brand.colors).length}
                view={filled(brand.colors).length ? <div className="swatches">{filled(brand.colors).map((c) => <span key={c}><i style={{ background: c }} />{c}</span>)}</div> : <p className="muted">Not set yet</p>} editor={edList("colors")} />
              <Card label="Tagline" empty={!brand.tagline?.trim()} view={brand.tagline ? <p className="tagline">{brand.tagline}</p> : <p className="muted">Not set yet</p>} editor={edText("tagline", 2)} />
              <Card label="Brand values" empty={!filled(brand.values).length} view={<Chips items={brand.values} />} editor={edList("values")} />
              <Card label="Tone of voice" empty={!filled(brand.tone).length} view={<Chips items={brand.tone} />} editor={edList("tone")} />
              <Card label="Look" empty={!filled(brand.aesthetic).length} view={<Chips items={brand.aesthetic} />} editor={edList("aesthetic")} />
              <Card wide label="App overview" empty={!brand.oneLiner.trim()} view={<p className="lede">{brand.oneLiner || <span className="muted">Not set yet</span>}</p>} editor={edText("oneLiner", 3)} />
              <Card label="Audience" empty={!brand.audience.trim()} view={<p>{brand.audience || <span className="muted">Not set yet</span>}</p>} editor={edText("audience", 3)} />
              <Card label="How videos should sound" empty={!brand.voice.trim()} view={<p>{brand.voice || <span className="muted">Not set yet</span>}</p>} editor={edText("voice", 3)} />
            </div>
          </>
        )}

        {tab === "rules" && (
          <>
            <div className="box-head"><h3>Rules and links</h3><p>What Distro checks on every take, and where viewers find you.</p></div>
            <div className="cards2">
              <Card label="Paid features" hint="never pitched as free" empty={!filled(brand.paidFeatures).length} view={<Chips items={brand.paidFeatures} />} editor={edList("paidFeatures")} />
              <Card label="Approved claims" hint="the only facts captions may state" empty={!filled(brand.approvedClaims).length} view={<Chips items={brand.approvedClaims} tone="good" />} editor={edList("approvedClaims")} />
              <Card label="Banned phrases" hint="never said or shown" empty={!filled(brand.bannedPhrases).length} view={<Chips items={brand.bannedPhrases} />} editor={edList("bannedPhrases")} />
              <Card label="Store and social links" hint="one per line" empty={!filled(brand.links).length}
                view={filled(brand.links).length ? <div className="social">{filled(brand.links).map((l) => <a key={l} href={l} target="_blank" rel="noreferrer" title={l}>{siteName(l)}</a>)}</div> : <p className="muted">Not set yet</p>} editor={edList("links")} />
              <Card label="End card" empty={!brand.cta.trim()} view={<p>{brand.cta || <span className="muted">Not set yet</span>}</p>} editor={edText("cta", 2)} />
              <Card label="Voice-over pace" hint="syllables per second" view={<p className="big">{brand.voicePace}</p>}
                editor={<input type="text" inputMode="decimal" autoFocus aria-label="Voice-over pace" value={String(brand.voicePace)} onChange={(e) => { const n = Number(e.target.value); if (n > 0 && n < 10) set("voicePace", n); }} />} />
              <Card label="Logo only in the last" hint="seconds of a reel" view={<p className="big">{brand.endCardSeconds} s</p>}
                editor={<input type="text" inputMode="numeric" autoFocus aria-label="Logo seconds" value={String(brand.endCardSeconds)} onChange={(e) => { const n = Number(e.target.value); if (n >= 0 && n < 30) set("endCardSeconds", n); }} />} />
            </div>
          </>
        )}
      </section>

      <footer className="profile-foot">
        <div className="meter">
          <span>{pct}% complete{missing.length ? ` · missing ${missing.slice(0, 3).join(", ")}${missing.length > 3 ? "…" : ""}` : ""}</span>
          <div className="meter-bar"><i style={{ width: `${pct}%` }} /></div>
        </div>
        <button type="button" className={`ask-btn${askOpen ? " on" : ""}`} onClick={() => setAskOpen((o) => !o)} aria-expanded={askOpen}><IcChat />Ask Distro</button>
        <button type="button" className="pri big" onClick={() => setReady(true)}>Let's go</button>
      </footer>

      {askOpen && (
        <aside className="ask-pop" aria-label="Ask Distro">
          <div className="guide-head"><Spark className="i" /><b>Ask Distro</b><button type="button" className="ghost x" aria-label="Close" onClick={() => setAskOpen(false)}>×</button></div>
          <div className="chat" aria-live="polite">
            <p className="bubble beat">{pct === 100
              ? `${brand.name}'s profile is complete. Tell me anything that changed and I'll update it.`
              : `${brand.name}'s profile is ${pct}% complete. Still missing: ${missing.join(", ")}. Tell me about it in your own words and I'll fill it in.`}</p>
            {chat.map((m, i) => <p key={i} className={`bubble ${m.who}`}>{m.text}</p>)}
            {chatBusy && <p className="bubble beat typing"><span className="spinner" /> {engine} is updating the profile…</p>}
          </div>
          <form className="chat-in" onSubmit={(e) => { e.preventDefault(); send(); }}>
            <input type="text" aria-label="Message to Distro" placeholder={canAi ? "e.g. We're also on Android. Keep it playful." : "Connect an AI engine to chat"} value={msg} onChange={(e) => setMsg(e.target.value)} disabled={!canAi || chatBusy} />
            <button type="submit" className="pri" disabled={!canAi || chatBusy || !msg.trim()}>Send</button>
          </form>
        </aside>
      )}

      {ready && (
        <div className="modal" role="dialog" aria-modal="true" aria-labelledby="ready-t" onClick={(e) => { if (e.target === e.currentTarget) setReady(false); }}>
          <div className="modal-card">
            <button type="button" className="modal-x" aria-label="Close" onClick={() => setReady(false)}>×</button>
            <h2 id="ready-t">Your brand profile is ready</h2>
            <p>Distro can now make on-brand videos and posts for {brand.name}. What do you want to do next?</p>
            <MakeChooser onPick={(k) => { setReady(false); onPick(k); }} />
          </div>
        </div>
      )}
    </div>
  );
}
