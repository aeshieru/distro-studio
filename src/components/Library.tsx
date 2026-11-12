// What the brand already owns and what Distro made: footage shots, app screens, renders.
import { useRef, useState } from "react";
import { codeLabel } from "../lib/codes";
import type { Brand, Take } from "../types";
import { FOOTAGE } from "../data/footage";
import { SCREENS } from "../data/screens";
import { useFrames } from "../lib/useFrames";
import { Check, Play, Upload } from "./Icons";

const fmt = (t: number) => `${Math.floor(t / 60)}:${String(Math.floor(t % 60)).padStart(2, "0")}`;

export function Library({ brand, takes, onOpenTake }: { brand: Brand; takes: Take[]; onOpenTake: (code: string) => void }) {
  const lib = FOOTAGE[brand.id];
  const frames = useFrames(lib?.src ?? "", lib ? lib.shots.map((s) => (s.start + s.end) / 2) : []);
  const screens = SCREENS[brand.id] ?? [];
  const made = takes.filter((t) => t.animatic || t.slideset?.length);
  // Uploads stay in this browser for the session: a progress bar plays, then the file joins the library.
  const fileRef = useRef<HTMLInputElement>(null);
  const [ups, setUps] = useState<{ id: string; name: string; url: string; video: boolean; size: number; pct: number }[]>([]);
  const addFiles = (files: FileList | null) => {
    if (!files?.length) return;
    const fresh = [...files].filter((f) => /^(image|video)\//.test(f.type)).map((f) => ({ id: `${f.name}-${f.size}-${Math.random().toString(36).slice(2, 6)}`, name: f.name, url: URL.createObjectURL(f), video: f.type.startsWith("video/"), size: f.size, pct: 0 }));
    setUps((u) => [...fresh, ...u]);
    fresh.forEach((f) => {
      const ms = Math.min(4200, 900 + f.size / 4000);
      const t0 = performance.now();
      const tick = () => {
        const pct = Math.min(100, ((performance.now() - t0) / ms) * 100);
        setUps((u) => u.map((x) => (x.id === f.id ? { ...x, pct } : x)));
        if (pct < 100) requestAnimationFrame(tick);
      };
      requestAnimationFrame(tick);
    });
  };
  const [over, setOver] = useState(false);
  return (
    <div className="library">
      <section className={`card-panel upload-zone${over ? " over" : ""}`}
        onDragOver={(e) => { e.preventDefault(); setOver(true); }} onDragLeave={() => setOver(false)}
        onDrop={(e) => { e.preventDefault(); setOver(false); addFiles(e.dataTransfer.files); }}>
        <div className="cp-head">
          <div><h2>Upload to your library</h2><span className="lbl">footage, app screenshots or product photos · MP4, MOV, PNG, JPG</span></div>
          <input ref={fileRef} type="file" multiple accept="video/*,image/*" className="sr" aria-label="Upload footage or screenshots" onChange={(e) => { addFiles(e.target.files); e.target.value = ""; }} />
          <button type="button" className="pri" onClick={() => fileRef.current?.click()}><Upload />Upload files</button>
        </div>
        {ups.length > 0 ? (
          <div className="lib-grid">
            {ups.map((u) => (
              <figure key={u.id} className="lib-tile">
                <div className="lib-img tall">
                  {u.video ? <video src={u.url} muted playsInline preload="metadata" /> : <img src={u.url} alt="" />}
                  {u.pct < 100
                    ? <span className="up-bar"><i style={{ width: `${u.pct}%` }} /></span>
                    : <span className="lib-badge ok"><Check />Uploaded</span>}
                </div>
                <figcaption><b>{u.name}</b><span>{u.pct < 100 ? `Uploading… ${Math.round(u.pct)}%` : `${(u.size / 1048576).toFixed(1)} MB · ready to use`}</span></figcaption>
              </figure>
            ))}
          </div>
        ) : <p className="drop-line">Drop files here, or press Upload files.</p>}
      </section>
      <section className="card-panel">
        <div className="cp-head"><h2>Your footage</h2><span className="lbl">{lib ? `${lib.shots.length} shots from ${lib.title}` : "none yet"}</span></div>
        {lib ? (
          <div className="lib-grid">
            {lib.shots.map((s, i) => (
              <figure key={s.id} className="lib-tile">
                <div className="lib-img">{frames[i] && <img src={frames[i]!} alt="" />}</div>
                <figcaption><b>{s.label}</b><span>{fmt(s.start)}–{fmt(s.end)}</span></figcaption>
              </figure>
            ))}
          </div>
        ) : <div className="empty">No footage for {brand.name} yet. Draft cuts use 3D scenes until you add some.</div>}
      </section>
      <section className="card-panel">
        <div className="cp-head"><h2>App screens</h2><span className="lbl">{screens.length ? `${screens.length} screens, used on slideshow app slides` : "none yet"}</span></div>
        {screens.length ? (
          <div className="lib-grid screens">
            {screens.map((s) => (
              <figure key={s.id} className="lib-tile">
                <div className="lib-img tall"><img src={s.src} alt="" loading="lazy" /></div>
                <figcaption><b>{s.label}</b></figcaption>
              </figure>
            ))}
          </div>
        ) : <div className="empty">No app screens for {brand.name} yet. Slideshows draw a plain card in your colors instead.</div>}
      </section>
      <section className="card-panel">
        <div className="cp-head"><h2>Made with Distro</h2><span className="lbl">this session</span></div>
        {made.length ? (
          <div className="lib-grid">
            {made.map((t) => (
              <button key={t.code} type="button" className="lib-tile made" onClick={() => onOpenTake(t.code)}>
                <div className="lib-img tall">
                  {t.slideset?.length ? <img src={t.slideset[0].url} alt="" /> : t.animatic ? <video src={t.animatic.url} muted preload="metadata" /> : null}
                  <span className="lib-badge">{t.slideset?.length ? `${t.slideset.length} slides` : <><Play />{t.animatic!.duration.toFixed(0)} s</>}</span>
                </div>
                <span className="lib-cap"><b>{codeLabel(t.code)} · {t.format}</b><span>“{t.hook}”</span></span>
              </button>
            ))}
          </div>
        ) : <div className="empty">Nothing rendered yet. Render a draft cut or slides on the board and it shows up here.</div>}
      </section>
    </div>
  );
}
