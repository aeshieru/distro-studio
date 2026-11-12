// The front door: what Distro does in one line, the real Moonsill reel in a phone, and the
// retention curve that runs through the brand mark sweeping past it.
import { useState } from "react";
import { WHATIF_REEL } from "../data/reel";
import { useFrames } from "../lib/useFrames";
import { IcArrow, IcResults, Play, Spark, Undo } from "./Icons";

type Props = { onStart: () => void; onTour: () => void };

export function Welcome({ onStart, onTour }: Props) {
  const [steps, setSteps] = useState(false);
  if (steps) return <Steps onStart={onStart} onTour={onTour} onBack={() => setSteps(false)} />;
  const start = () => setSteps(true);
  return (
    <div className="landing">
      <header className="land-nav">
        <img className="land-logo" src="brand/distro-logo.png" alt="Distro" />
        <nav aria-label="Distro">
          <button type="button" className="ghost" onClick={onTour}>How it works</button>
          <button type="button" className="ghost" onClick={onTour}>Demo</button>
        </nav>
        <button type="button" className="pri" onClick={start}>Start a project</button>
      </header>

      <section className="hero">
        <div className="hero-copy">
          <p className="hero-tagline">You build it. We handle distribution.</p>
          <h1>Turn one idea into <em>better short videos.</em></h1>
          <p>Go from idea → angles → render → results, as reels or photo slideshows, and see exactly where viewers left. Then fix it.</p>
          <div className="hero-acts">
            <button type="button" className="pri big" onClick={start}>Start a project <IcArrow /></button>
            <button type="button" className="big" onClick={onTour}><Play />Watch the demo</button>
          </div>
          <ul className="hero-feats">
            <li><Spark /><span>Generate<br />angles</span></li>
            <li><span className="ic-text" aria-hidden="true">Aa</span><span>Hook lint<br />(English, Taglish)</span></li>
            <li><IcResults /><span>Retention<br />analysis</span></li>
            <li><Undo /><span>Rewrite and<br />re-render</span></li>
          </ul>
        </div>
        <div className="hero-art" aria-hidden="true">
          <svg className="hero-curve" viewBox="0 0 640 520" preserveAspectRatio="none">
            <path d="M-20 70 C 90 60 150 120 210 210 C 270 300 330 360 420 392 C 500 420 570 430 680 436" fill="none" stroke="#FF5A1F" strokeWidth="14" strokeLinecap="round" />
            <circle cx="214" cy="216" r="15" fill="#FF5A1F" stroke="#fff" strokeWidth="5" />
            <circle cx="560" cy="428" r="12" fill="#FF5A1F" stroke="#fff" strokeWidth="4" />
          </svg>
          <div className="hero-phone">
            <video src={WHATIF_REEL.videoUrl} autoPlay muted loop playsInline preload="auto" />
          </div>
          <span className="hero-tag t1">0:02 · they left here</span>
          <span className="hero-tag t2">Shorter hook, re-rendered</span>
        </div>
      </section>
    </div>
  );
}

// After "Start a project": the four steps at a glance, each with a small live preview, then one button.
function Steps({ onStart, onTour, onBack }: Props & { onBack: () => void }) {
  const frames = useFrames(WHATIF_REEL.videoUrl.replace(/\.mp4$/, "-clean.mp4"), [2.5, 8.5, 14.5, 25.5]);
  return (
    <div className="landing steps-page">
      <header className="land-nav">
        <button type="button" className="logo-btn" onClick={onBack} aria-label="Back to the Distro home page"><img className="land-logo" src="brand/distro-logo.png" alt="Distro" /></button>
      </header>
      <section className="welcome">
        <h1 className="serif">Welcome to Distro</h1>
        <p className="welcome-sub">You build it. We handle distribution.</p>
        <ol className="welcome-steps">
          <li>
            <span className="w-n">1</span>
            <h2>Build your<br />brand profile</h2>
            <p>Paste your app's website or App Store link, or drop a PRD. Distro drafts what's paid, what you may claim and how you sound.</p>
            <div className="w-prev w-brief" aria-hidden="true">
              <div className="w-mock">
                <b>Moonsill</b>
                <span className="w-line" />
                <div className="w-dots"><i style={{ background: "#3b4a8c" }} /><i style={{ background: "#7fb069" }} /><i style={{ background: "#f2c14e" }} /><i style={{ background: "#151515" }} /></div>
                <div className="w-chips"><i>full garden</i><i className="ok">nothing dies</i><i className="ok">no ads</i><i className="ok">free to play</i></div>
                <div className="w-meter"><i /></div>
              </div>
            </div>
          </li>
          <li>
            <span className="w-n">2</span>
            <h2>Get angles,<br />reels and slideshows</h2>
            <p>One idea becomes the best three angles to start, as reels, photo slideshows, or a style you want to recreate.</p>
            <div className="w-prev w-explore" aria-hidden="true">
              <div className="w-mock w-row">
                {["What if rain was yours?", "I forgot to water them.", "Is it raining yet?"].map((h, i) => (
                  <div className="w-take" key={h}><div className="w-pic">{frames[i] && <img src={frames[i]!} alt="" />}<em>{h}</em></div><span>#{i + 1} best</span></div>
                ))}
              </div>
            </div>
          </li>
          <li>
            <span className="w-n">3</span>
            <h2>Check it<br />against your rules</h2>
            <p>Drag takes through your brand rules. Anything that breaks one stops with the reason and a one-click fix, then renders.</p>
            <div className="w-prev w-arrange" aria-hidden="true">
              <div className="w-mock w-row two">
                <div className="w-lane"><b>Checks</b><div className="w-card bad"><span>Reel 05</span><em>Blocked · paid feature</em></div></div>
                <div className="w-lane"><b>Ready</b><div className="w-card good"><span>Reel 01</span><em>checks passed</em></div></div>
              </div>
            </div>
          </li>
          <li>
            <span className="w-n">4</span>
            <h2>Track it<br />and fix the hook</h2>
            <p>See the second viewers left on a posted reel, rewrite the hook, preview it on the real footage and render the new cut.</p>
            <div className="w-prev w-track" aria-hidden="true">
              <div className="w-mock">
                <div className="w-strip">{frames.map((f, i) => <div key={i} className={i === 0 ? "drop" : ""}>{f && <img src={f} alt="" />}</div>)}</div>
                <svg viewBox="0 0 200 60" preserveAspectRatio="none">
                  <path d="M2 4 C14 6 20 30 30 38 C60 46 120 50 198 54" fill="none" stroke="#FF5A1F" strokeWidth="2.5" />
                  <line x1="22" x2="22" y1="0" y2="60" stroke="#E5484D" strokeWidth="2" />
                </svg>
                <span className="w-balloon">They left here · 0:02</span>
              </div>
            </div>
          </li>
        </ol>
        <div className="welcome-acts">
          <button type="button" className="pri big lets" onClick={onStart}>Let's go!</button>
          <button type="button" className="ghost" onClick={onTour}><Play />Watch the demo tour</button>
        </div>
      </section>
    </div>
  );
}
