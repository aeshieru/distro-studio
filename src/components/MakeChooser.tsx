// "What do you want to make?" Four big choices, each with a small live preview built from
// the brand's own footage: a reel, a photo slideshow, a style to recreate, or a posted reel to fix.
import { useFrames } from "../lib/useFrames";
import { WHATIF_REEL } from "../data/reel";
import type { MakeKind } from "./Ideate";

type Pick = MakeKind | "fix";
const CLEAN = WHATIF_REEL.videoUrl.replace(/\.mp4$/, "-clean.mp4");

export function MakeChooser({ onPick, current }: { onPick: (k: Pick) => void; current?: Pick }) {
  const f = useFrames(CLEAN, [2.5, 8.5, 14.5, 20.5, 25.5]);
  const img = (i: number) => (f[i] ? <img src={f[i]!} alt="" /> : null);
  const cards: { id: Pick; title: string; sub: string; prev: JSX.Element }[] = [
    {
      id: "reel", title: "Reels", sub: "Short vertical videos with a voice-over, ten formats from one idea",
      prev: (
        <div className="mk-reels">
          {[0, 1, 2].map((i) => (
            <div key={i} className={`mk-phone p${i}`}>{img(i + 1)}{i === 1 && <span className="mk-cap">What if it only rained on your street?</span>}</div>
          ))}
        </div>
      ),
    },
    {
      id: "slideshow", title: "Slideshows", sub: "Photo posts: real moments cut with your app's screens, captions like a real person",
      prev: (
        <div className="mk-slides">
          {[["I forgot to water them…", 0], ["ok but they're fine??", 2], ["it's raining in there too", 3]].map(([c, i], k) => (
            <div key={k} className={`mk-slide s${k}`}>{img(i as number)}<span className="tt-cap">{c}</span></div>
          ))}
          <span className="mk-dots" aria-hidden="true"><i className="on" /><i /><i /><i /><i /></span>
        </div>
      ),
    },
    {
      id: "recreate", title: "Recreate a style", sub: "Paste a reel or photo post you like. Distro reads its structure and makes yours on brand",
      prev: (
        <div className="mk-recreate">
          <span className="mk-link">tiktok.com/@…/photo/75146…</span>
          <span className="mk-arrow" aria-hidden="true">↓</span>
          <div className="mk-structure">
            {["moment", "app", "moment", "app", "moment", "end"].map((s, i) => <i key={i} className={s}>{s}</i>)}
          </div>
          <span className="mk-note">Structure only. Never the content.</span>
        </div>
      ),
    },
    {
      id: "fix", title: "Fix a posted reel", sub: "See the second viewers left, rewrite the hook and render the new cut",
      prev: (
        <div className="mk-fix">
          <div className="mk-thumb">{img(0)}</div>
          <svg viewBox="0 0 200 110" preserveAspectRatio="none" aria-hidden="true">
            <defs><linearGradient id="mkfill" x1="0" x2="0" y1="0" y2="1"><stop offset="0" stopColor="#FF5A1F" stopOpacity=".28" /><stop offset="1" stopColor="#FF5A1F" stopOpacity="0" /></linearGradient></defs>
            <path d="M4 8 C16 10 22 52 34 62 C70 78 130 84 196 88 L196 108 L4 108 Z" fill="url(#mkfill)" />
            <path d="M4 8 C16 10 22 52 34 62 C70 78 130 84 196 88" fill="none" stroke="#FF5A1F" strokeWidth="3" />
            <circle cx="24" cy="38" r="5.5" fill="#FF5A1F" stroke="#fff" strokeWidth="2" />
          </svg>
          <span className="mk-tag">0:02 · hook (big drop)</span>
        </div>
      ),
    },
  ];
  return (
    <div className="make-grid" role="list">
      {cards.map((c) => (
        <button key={c.id} type="button" role="listitem" className={`make-card${current === c.id ? " on" : ""}`} onClick={() => onPick(c.id)} data-tour={`make-${c.id}`}>
          <span className="make-txt"><b>{c.title}</b><span>{c.sub}</span></span>
          <span className="make-prev" aria-hidden="true">{c.prev}</span>
        </button>
      ))}
    </div>
  );
}
