// The demo tour: Brand profile → Create → Board → Results, one Intro.js tour per screen,
// chained so the whole loop plays in order. Skipping at any point ends it.
import introJs from "intro.js";
import "intro.js/introjs.css";

export type TourSection = "brief" | "choose" | "explore" | "arrange" | "library" | "track";

type Step = { element?: string; title: string; intro: string; position?: "top" | "bottom" | "left" | "right" };

const TOUR: { section: TourSection; next: string; steps: Step[] }[] = [
  {
    section: "brief", next: "Next: Create",
    steps: [
      { title: "Distro in one minute", intro: "You build it. We handle distribution. Distro plans short videos and slideshows for your app, checks them against your brand rules, renders them, then finds the second viewers left on a posted reel and fixes it. <b>Brand profile · Create · Board · Results.</b>" },
      { element: '[data-tour="upload"]', title: "1 · Brand profile: bring in your app", intro: "Paste your website or App Store link, or upload a PRD, README or PDF. The AI pulls out your tone, colors, what's paid, what you may claim and banned phrases. You review it before anything is saved." },
      { element: '[data-tour="rules"]', title: "The rules Distro enforces", intro: "Paid features are never pitched as free. Only approved claims may appear. Banned phrases are blocked. Every take is checked against these." },
      { element: ".ask-btn", title: "Ask Distro", intro: "Tell Distro what changed in your own words (\"we're on Android now, keep it playful\") and it updates the profile for you." },
      { element: ".profile-foot", title: "Finish and go", intro: "The bar shows what's still missing. <b>Let's go</b> asks what you want to make next." },
      { element: ".nav-tools", title: "Language and AI", intro: "Switch content between English and Taglish, and pick which AI writes for you: Claude, Codex or ChatGPT." },
    ],
  },
  {
    section: "choose", next: "Next: Your idea",
    steps: [
      { element: ".make-grid", title: "Four ways to start", intro: "<b>Reels</b>: short videos with a voice-over. <b>Slideshows</b>: photo posts mixing real moments with your app's screens. <b>Recreate a style</b>: copy the structure of a post you like. <b>Fix a posted reel</b>: jump to Results." },
      { element: '[data-tour="make-slideshow"]', title: "Slideshows", intro: "Distro writes 5 to 8 slides: real moments from your footage cut with your real app screens, with captions like a real person posted them. They export as 1080×1920 images for TikTok and Instagram photo mode." },
      { element: '[data-tour="make-recreate"]', title: "Recreate a style", intro: "Paste a reel or photo post. Claude in Chrome opens it and reads how it's built, then Distro makes yours on brand. Reels can render as a motion-graphics explainer in that style." },
    ],
  },
  {
    section: "explore", next: "Next: Board",
    steps: [
      { element: ".kind-tabs", title: "Switch anytime", intro: "Change between Reels, Slideshows and Recreate a style without losing your idea." },
      { element: '[data-tour="idea"]', title: "2 · Create: one idea", intro: "Write one sentence about what you want to make. Tap the pencil to edit it." },
      { element: '[data-tour="style"]', title: "Borrow a style, not the content", intro: "Paste a TikTok, Instagram, Facebook or YouTube post you like. If the link hides its details, Claude in Chrome opens it and reads its structure: slides, pacing, caption style. Never its content." },
      { element: '[data-tour="plan"]', title: "Generate angles", intro: "Choose how many. The AI (Claude, Codex or ChatGPT, switch it in the sidebar) writes each one in a different format: what-if, POV, myth-bust, countdown and more, with hooks timed to your voice-over pace." },
      { element: '[data-tour="takes"]', title: "The best three first", intro: "Distro ranks the angles and shows the best three, already selected. Show more, regenerate one with ↻, or regenerate them all. Then send them to the board." },
    ],
  },
  {
    section: "arrange", next: "Next: Library",
    steps: [
      { element: '[data-tour="autorun"]', title: "Or let it run", intro: "<b>Auto-run the board</b> walks every take through Hooks, Script, Checks and Ready to render on its own. Cards fly between columns, checks play on each card, and anything that breaks a rule stops in Checks with its fix." },
      { element: '[data-tour="board"]', title: "3 · Board: brand checks as columns", intro: "Drag takes from Hooks to Script to Checks to <b>Ready to render</b>. Entering Checks runs the brand rules, cheapest first." },
      { element: '[data-tour="detail"]', title: "Something's off? It stops.", intro: "Reel 05 calls the moonflower free, but it's part of the paid full garden, so it can't reach Ready to render. You get the reason and a one-click or AI fix. A ready take renders from your own footage, a 3D scene or a motion-graphics explainer, with a full voice-over. Slideshows render as images." },
    ],
  },
  {
    section: "library", next: "Next: Results",
    steps: [
      { element: ".library", title: "Library", intro: "Your footage cut into reusable shots, your real app screens, and everything Distro rendered this session: draft cuts, motion graphics and slideshows." },
    ],
  },
  {
    section: "track", next: "Finish",
    steps: [
      { element: '[data-tour="steps"]', title: "4 · Results: after you post", intro: "This is a real Moonsill reel: 10,691 views in about 24 hours. The guide walks the fix in four steps." },
      { element: '[data-tour="strip"]', title: "Every beat is a panel", intro: "The reel is split into beats from its own voice-over timing. The red tag marks where viewers left: <b>0:02</b>." },
      { element: "svg.chart", title: "Retention on the same timeline", intro: "Only the numbers Facebook reported are solid; the dashes between them are estimates. The old hook kept talking until 5.4 s, long after most viewers had gone." },
      { element: '[data-tour="hooks"]', title: "Rewrite the hook", intro: "Pick a shorter hook, ask the AI for four more, or type your own. Hook lint times it at your voice-over's real pace." },
      { element: '[data-tour="preview"]', title: "Preview it on the real footage", intro: "The new hook plays as captions over the original first seconds, then the reel continues." },
      { element: '[data-tour="render"]', title: "Render the fixed MP4", intro: "Distro records the new voice-over and cuts a real video, loudness-matched and under 10 MB, then shows before and after." },
      { title: "That's the loop", intro: "Post the new cut, import its retention, and Distro shows the next weak beat. What you learn goes back into <b>Create</b> for the next batch. You build it. We handle distribution." },
    ],
  },
];

let running = false;

export function startTour(go: (s: TourSection) => void, prepare?: (s: TourSection) => void, from = 0) {
  if (running && from === 0) return;
  running = true;
  const part = TOUR[from];
  if (!part) { running = false; return; }
  prepare?.(part.section);
  go(part.section);
  setTimeout(() => {
    let completed = false;
    const last = from === TOUR.length - 1;
    const steps = part.steps.filter((s) => !s.element || document.querySelector(s.element));
    introJs.tour()
      .setOptions({
        steps: steps.map((s) => ({ ...s, element: s.element ?? undefined, ...(s.position ? { position: s.position } : {}) })),
        showProgress: true,
        showBullets: false,
        exitOnOverlayClick: false,
        scrollToElement: true,
        nextLabel: "Next",
        prevLabel: "Back",
        doneLabel: last ? "Finish" : `${part.next} →`,
        disableInteraction: true,
      })
      .onComplete(() => { completed = true; })
      .onExit(() => {
        if (completed && !last) startTour(go, prepare, from + 1);
        else running = false;
      })
      .start();
  }, 450);
}
