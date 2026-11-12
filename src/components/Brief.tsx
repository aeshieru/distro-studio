import { useRef, useState } from "react";
import type { AiMode, Brand } from "../types";
import { extractBrief, AiError, type BriefDraft } from "../lib/ai";
import { Spark, Upload } from "./Icons";

type Props = { brand: Brand; aiMode: AiMode; onChange: (b: Brand) => void; onCreate: (b: Brand) => void };

// Keep blank lines while typing; the checks ignore them.
const list = (v: string) => v.split("\n");
const slug = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "app";

export function Brief({ brand, aiMode, onChange, onCreate }: Props) {
  const set = <K extends keyof Brand>(k: K, v: Brand[K]) => onChange({ ...brand, [k]: v });
  const fileRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [draft, setDraft] = useState<(BriefDraft & { file: string }) | null>(null);
  const [over, setOver] = useState(false);

  const read = async (file: File) => {
    setErr(null);
    setDraft(null);
    setBusy(`AI is reading ${file.name}…`);
    try {
      const d = await extractBrief(aiMode, file);
      setDraft({ ...d, file: file.name });
    } catch (e) {
      setErr(e instanceof AiError ? e.message : "Could not read that document.");
    } finally {
      setBusy(null);
    }
  };

  const fromDraft = (d: BriefDraft, base: Brand): Brand => ({
    ...base,
    name: d.name || base.name,
    oneLiner: d.oneLiner || base.oneLiner,
    audience: d.audience || base.audience,
    voice: d.voice || base.voice,
    paidFeatures: d.paidFeatures,
    approvedClaims: d.approvedClaims,
    bannedPhrases: d.bannedPhrases.length ? d.bannedPhrases : base.bannedPhrases,
    cta: d.cta || base.cta,
  });

  const create = () => {
    if (!draft) return;
    onCreate(fromDraft(draft, {
      ...brand, id: `${slug(draft.name)}-${Date.now().toString(36)}`, voicePace: 3.3, targetSeconds: [15, 25], endCardSeconds: 4,
      paidFeatures: [], approvedClaims: [], bannedPhrases: ["guaranteed"], cta: draft.name,
    }));
    setDraft(null);
  };
  const replace = () => { if (draft) { onChange({ ...fromDraft(draft, brand), id: brand.id }); setDraft(null); } };

  return (
    <>
      <section className="head">
        <div>
          <h1>{brand.name} brief</h1>
          <p className="howto"><b>What to do:</b> upload your app's PRD or README and let the AI fill this in, or edit the rules by hand. These rules decide what BEAT blocks and what the AI may say.</p>
        </div>
      </section>

      <section
        className={`upload${over ? " over" : ""}`}
        onDragOver={(e) => { e.preventDefault(); setOver(true); }}
        onDragLeave={() => setOver(false)}
        onDrop={(e) => { e.preventDefault(); setOver(false); const f = e.dataTransfer.files?.[0]; if (f) read(f); }}
        aria-label="Upload a product document"
      >
        <input ref={fileRef} type="file" className="sr" aria-label="Product document"
          accept=".md,.markdown,.txt,.pdf,.docx,.doc,.rtf,.json,.html"
          onChange={(e) => { const f = e.target.files?.[0]; if (f) read(f); e.target.value = ""; }} />
        <div>
          <h2>Start from your app's document</h2>
          <p className="note">Drop a PRD, README, pitch or notes here: Markdown, text, PDF or Word. The AI pulls out what's paid, what you may claim and how you sound. Nothing is saved until you choose below.</p>
        </div>
        <button type="button" className="pri" onClick={() => fileRef.current?.click()} disabled={Boolean(busy) || aiMode === "saved"}>
          {busy ? <span className="spinner" /> : <Upload />}{busy ? "Reading…" : "Upload document"}
        </button>
        {busy && <p className="note" role="status">{busy}</p>}
        {err && <p className="err">{err}</p>}
        {aiMode === "saved" && <p className="note">No AI engine is connected in this view, so uploads are off. Edit the rules below by hand.</p>}
      </section>

      {draft && (
        <section className="draft" aria-label="What the AI found">
          <div className="sec-bar">
            <h2><Spark className="i" /> Found in {draft.file}</h2>
            <span className="lbl">Check it before you use it</span>
          </div>
          <dl className="facts two">
            <div><dt>App</dt><dd><b>{draft.name || "not found"}</b> · {draft.oneLiner}</dd></div>
            <div><dt>Audience</dt><dd>{draft.audience || "not found"}</dd></div>
            <div><dt>Voice</dt><dd>{draft.voice || "not found"}</dd></div>
            <div><dt>End card</dt><dd>{draft.cta || "not found"}</dd></div>
            <div><dt>Paid features ({draft.paidFeatures.length})</dt><dd>{draft.paidFeatures.join(" · ") || "none stated"}</dd></div>
            <div><dt>Approved claims ({draft.approvedClaims.length})</dt><dd>{draft.approvedClaims.join(" · ") || "none stated"}</dd></div>
            <div><dt>Banned phrases ({draft.bannedPhrases.length})</dt><dd>{draft.bannedPhrases.join(" · ") || "none stated"}</dd></div>
            {draft.notes && <div><dt>Notes</dt><dd>{draft.notes}</dd></div>}
          </dl>
          <div className="acts-row">
            <button type="button" className="pri" onClick={create}>Create brand “{draft.name || "New app"}”</button>
            <button type="button" onClick={replace}>Replace the {brand.name} brief</button>
            <button type="button" className="ghost" onClick={() => setDraft(null)}>Discard</button>
          </div>
        </section>
      )}

      <form className="brief" onSubmit={(e) => e.preventDefault()}>
        <label className="field" htmlFor="bname">App name
          <input id="bname" type="text" value={brand.name} onChange={(e) => set("name", e.target.value)} />
        </label>
        <label className="field" htmlFor="one">What it is
          <input id="one" type="text" value={brand.oneLiner} onChange={(e) => set("oneLiner", e.target.value)} />
        </label>
        <label className="field" htmlFor="aud">Audience
          <input id="aud" type="text" value={brand.audience} onChange={(e) => set("audience", e.target.value)} />
        </label>
        <label className="field" htmlFor="voice">Voice
          <input id="voice" type="text" value={brand.voice} onChange={(e) => set("voice", e.target.value)} />
        </label>
        <label className="field" htmlFor="paid">Paid features (never pitched as free), one per line
          <textarea id="paid" rows={brand.paidFeatures.length + 1} value={brand.paidFeatures.join("\n")} onChange={(e) => set("paidFeatures", list(e.target.value))} />
        </label>
        <label className="field" htmlFor="claims">Approved claims, one per line
          <textarea id="claims" rows={brand.approvedClaims.length + 1} value={brand.approvedClaims.join("\n")} onChange={(e) => set("approvedClaims", list(e.target.value))} />
        </label>
        <label className="field" htmlFor="banned">Banned phrases, one per line
          <textarea id="banned" rows={brand.bannedPhrases.length + 1} value={brand.bannedPhrases.join("\n")} onChange={(e) => set("bannedPhrases", list(e.target.value))} />
        </label>
        <label className="field" htmlFor="cta">End card
          <input id="cta" type="text" value={brand.cta} onChange={(e) => set("cta", e.target.value)} />
        </label>
        <label className="field" htmlFor="vp">VO pace, syllables per second (Moonsill's real VO measures 3.3)
          <input id="vp" type="text" inputMode="decimal" value={String(brand.voicePace)}
            onChange={(e) => { const n = Number(e.target.value); if (n > 0 && n < 10) set("voicePace", n); }} />
        </label>
        <label className="field" htmlFor="ec">Logo allowed only in the last … seconds
          <input id="ec" type="text" inputMode="numeric" value={String(brand.endCardSeconds)}
            onChange={(e) => { const n = Number(e.target.value); if (n >= 0 && n < 30) set("endCardSeconds", n); }} />
        </label>
      </form>
    </>
  );
}
