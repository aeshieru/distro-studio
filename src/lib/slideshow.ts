// Slideshow takes: photo posts told in 5-8 slides, real moments cut with app screens.
// The AI returns slides; Distro keeps a parallel beat list (3 s a slide, the photo-mode
// default) so the board, storyboard and checks treat both kinds the same way.
import type { ContentLang, Slide, Take } from "../types";

type RawSlides = { format: string; title: string; hook: string; claims: string[]; slides: { kind: "moment" | "app"; scene: string; caption: string; sticker?: string }[] };

export const SLIDE_SECONDS = 3;

export function toSlideshow(raw: RawSlides, format = raw.format): Omit<Take, "code" | "status"> {
  const slides: Slide[] = raw.slides.map((s) => ({ kind: s.kind === "app" ? "app" : "moment", scene: s.scene.trim(), caption: s.caption.trim(), sticker: s.sticker?.trim() || undefined }));
  const beats = slides.map((s, i) => ({
    label: i === slides.length - 1 ? `End card: ${s.scene}` : `${s.kind === "app" ? "App screen: " : ""}${s.scene}`,
    seconds: SLIDE_SECONDS,
  }));
  return {
    format, title: raw.title, hook: raw.hook || slides[0]?.caption || "", claims: raw.claims ?? [],
    beats, logoAt: SLIDE_SECONDS * Math.max(0, slides.length - 1), captions: true, kind: "slideshow", slides,
  };
}

// Saved Moonsill slideshows for the stage demo (written 12 Nov; only approved claims).
const SAVED_EN: RawSlides[] = [
  { format: "Story with the app", title: "Forgot all week", hook: "I forgot to water them all week…", claims: ["nothing dies", "live rain"], slides: [
    { kind: "moment", scene: "Dry pots on a sunny sill", caption: "I forgot to water them all week…", sticker: "" },
    { kind: "app", scene: "Garden screen, plants still green", caption: "ok but they're… fine??", sticker: "" },
    { kind: "moment", scene: "Storm clouds over the street", caption: "then this rolled in", sticker: "" },
    { kind: "app", scene: "Live rain falling in the garden", caption: "it's raining in there too", sticker: "WAIT" },
    { kind: "moment", scene: "Moonflower opens at night", caption: "and THIS opened tonight", sticker: "" },
    { kind: "app", scene: "Moonsill garden at night", caption: "Moonsill. nothing dies. live rain.", sticker: "" },
  ] },
  { format: "POV", title: "Rainy commute", hook: "POV: you got soaked on the way home", claims: ["grows with your real weather"], slides: [
    { kind: "moment", scene: "Wet street at dusk", caption: "POV: you got soaked on the way home", sticker: "" },
    { kind: "moment", scene: "Rain on the window", caption: "still raining btw", sticker: "" },
    { kind: "app", scene: "Garden with rain falling", caption: "my garden is having the best day", sticker: "OKAAY" },
    { kind: "app", scene: "Sprouts after the rain", caption: "new sprouts. from MY rain", sticker: "" },
    { kind: "app", scene: "Moonsill sky screen", caption: "Moonsill grows with your real weather", sticker: "" },
  ] },
  { format: "Before/After", title: "One rainy week", hook: "my sill on Monday vs Sunday", claims: ["grows with your real weather", "no ads"], slides: [
    { kind: "moment", scene: "Empty pots on the sill", caption: "my sill on Monday vs Sunday", sticker: "" },
    { kind: "app", scene: "Garden on day 1, tiny sprouts", caption: "day 1. tiny.", sticker: "" },
    { kind: "moment", scene: "Rain clouds over the city", caption: "rained 4 days straight", sticker: "" },
    { kind: "app", scene: "Garden on day 7, full and green", caption: "day 7.", sticker: "WOW" },
    { kind: "app", scene: "Moonsill garden screen", caption: "Moonsill. real weather, no ads.", sticker: "" },
  ] },
];

const SAVED_TAGLISH: RawSlides[] = [
  { format: "Story with the app", title: "Nakalimutan ko", hook: "Isang linggo ko silang nakalimutan…", claims: ["nothing dies", "live rain"], slides: [
    { kind: "moment", scene: "Dry pots on a sunny sill", caption: "Isang linggo ko silang nakalimutan…", sticker: "" },
    { kind: "app", scene: "Garden screen, plants still green", caption: "pero okay pa sila??", sticker: "" },
    { kind: "moment", scene: "Storm clouds over the street", caption: "tapos biglang dumilim", sticker: "" },
    { kind: "app", scene: "Live rain falling in the garden", caption: "umuulan din sa loob", sticker: "TEKA" },
    { kind: "moment", scene: "Moonflower opens at night", caption: "at bumukas 'to ngayong gabi", sticker: "" },
    { kind: "app", scene: "Moonsill garden at night", caption: "Moonsill. nothing dies. live rain.", sticker: "" },
  ] },
  ...SAVED_EN.slice(1),
];

export const savedSlideshows = (lang: ContentLang): Take[] =>
  (lang === "taglish" ? SAVED_TAGLISH : SAVED_EN).map((r, i) => ({ ...toSlideshow(r), code: `S${String(i + 1).padStart(2, "0")}`, status: "hooks" }));
