export type Beat = {
  id: string;
  label: string;
  line: string;
  start: number;
  end: number;
};

export type RetentionPoint = { t: number; pct: number };

export type RetentionSource =
  | { kind: "reported"; note: string }
  | { kind: "imported"; fileName: string };

export type Reel = {
  id: string;
  title: string;
  brandId: string;
  platform: string;
  posted: string;
  videoUrl: string;
  duration: number;
  hookWords: { w: string; start: number; end: number }[];
  beats: Beat[];
  stats: { label: string; value: string }[];
  statsSource: string;
  retention: RetentionPoint[];
  retentionSource: RetentionSource;
  reportedDropAt: number | null;
};

export type Brand = {
  id: string;
  name: string;
  site?: string;
  tagline?: string;
  values?: string[];
  tone?: string[];
  aesthetic?: string[];
  colors?: string[];
  links?: string[];
  oneLiner: string;
  audience: string;
  voice: string;
  voicePace: number; // syllables per second of the brand's voice-over
  paidFeatures: string[];
  approvedClaims: string[];
  bannedPhrases: string[];
  cta: string;
  targetSeconds: [number, number];
  endCardSeconds: number;
};

// One picture in a slideshow (TikTok / Instagram photo mode): a real moment or an app screen.
export type Slide = { kind: "moment" | "app"; caption: string; scene: string; sticker?: string; screen?: string };

export type TakeStatus = "hooks" | "script" | "checks" | "rendered" | "rejected";

export type Take = {
  code: string;
  format: string;
  title: string;
  hook: string;
  beats: { label: string; seconds: number }[];
  claims: string[];
  logoAt: number; // second the logo or app screen first appears
  captions: boolean;
  status: TakeStatus;
  note?: string;
  // "slideshow" takes are photo posts: slides instead of a timed video.
  kind?: "reel" | "slideshow";
  slides?: Slide[];
  slideset?: { name: string; url: string }[];
  // How a style reference shows up in renders: caption look and cut rhythm (seconds per shot).
  look?: { captions: "balloon" | "bold" | "lower"; cutEvery?: number; ref?: string };
  animatic?: { url: string; path: string; sizeMB: number; lufs: number | null; duration: number; voice: string | null; plan?: { label: string; source: string }[]; lines?: string[] };
};

export type HookOption = { text: string; why: string };

export type AiMode = "artifact" | "proxy" | "saved";

// Content language for hooks, takes and AI output. English is the default.
export type ContentLang = "en" | "taglish";
