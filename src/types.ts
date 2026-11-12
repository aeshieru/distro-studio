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
  animatic?: { url: string; path: string; sizeMB: number; lufs: number | null; duration: number; voice: string | null };
};

export type HookOption = { text: string; why: string };

export type AiMode = "artifact" | "proxy" | "saved";

// Content language for hooks, takes and AI output. English is the default.
export type ContentLang = "en" | "taglish";
