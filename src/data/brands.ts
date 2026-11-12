import type { Brand } from "../types";

// Facts come from Moonsill docs/full-garden.md and docs/store (Oct 2026).
export const MOONSILL: Brand = {
  id: "moonsill",
  name: "Moonsill",
  oneLiner: "A cozy weather garden: your plants grow with the real weather on your street.",
  audience: "PH 18-34, cozy-game and plant people, mostly on FB Reels and TikTok",
  voice: "Warm, cozy, second person. Short sentences.",
  voicePace: 3.3,
  paidFeatures: [
    "full garden",
    "shelf",
    "hooks",
    "moonflower",
    "kingfisher",
    "scrapbook",
    "all 28 plants",
    "all 14 visitors",
    "all 8 widgets",
  ],
  approvedClaims: [
    "grows with your real weather",
    "nothing dies",
    "free to play",
    "one purchase, no subscription",
    "no ads",
    "friends can send plants",
    "live rain",
  ],
  bannedPhrases: ["forecast", "AI-made", "guaranteed"],
  cta: "Moonsill — free on the App Store",
  targetSeconds: [15, 25],
  endCardSeconds: 4,
};

export const CLEANR: Brand = {
  id: "cleanr",
  name: "Cleanr",
  oneLiner: "A macOS app that makes cleaning your Mac (and your desk) less of a chore.",
  audience: "Mac users, students and creators in PH",
  voice: "Dry, playful, a little dramatic. The Mac has a face.",
  voicePace: 3.6,
  paidFeatures: [],
  approvedClaims: [],
  bannedPhrases: ["AI-made", "guaranteed"],
  cta: "Cleanr — fundrstudio.com/cleanr",
  targetSeconds: [15, 25],
  endCardSeconds: 4,
};

export const BRANDS = [MOONSILL, CLEANR];
