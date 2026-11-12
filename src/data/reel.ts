import timing from "./whatif-timing.json";
import type { Reel } from "../types";

// Word timings are the reel's own voice-over alignment (whatif-rain/timing.json).
const words = (timing as [string, number, number][]).map(([w, start, end]) => ({ w, start, end }));
const hookEndIdx = words.findIndex((x) => x.w === "street?");

export const WHATIF_REEL: Reel = {
  id: "whatif-rain",
  title: "What if it only rained on your street?",
  brandId: "moonsill",
  platform: "FB Reel",
  posted: "6 Nov, 8:00 PM",
  videoUrl: "reels/whatif-rain.mp4",
  duration: 32.58,
  hookWords: words.slice(0, hookEndIdx + 1),
  // Beats follow the render's STEP timings in scene.html and the VO alignment.
  beats: [
    { id: "B1", label: "Hook: frog at the sill", line: "What if your plants only grew… when it actually rained on your street?", start: 0, end: 5.97 },
    { id: "B2", label: "Step 1: cloud rolls in", line: "It checks your real sky.", start: 5.97, end: 11.75 },
    { id: "B3", label: "Step 2: rain on your pots", line: "That rain lands here. Same street, same minute.", start: 11.75, end: 17.89 },
    { id: "B4", label: "Step 3: dry week, nothing dies", line: "A dry week? Nothing dies.", start: 17.89, end: 22.95 },
    { id: "B5", label: "Moonflower opens", line: "On a full moon, one flower opens.", start: 22.95, end: 29.4 },
    { id: "B6", label: "End card", line: "The next one is in late November.", start: 29.4, end: 32.58 },
  ],
  stats: [
    { label: "views in 24 h", value: "10,691" },
    { label: "still watching at 3 s", value: "43%" },
    { label: "avg watch of 31 s", value: "7 s" },
    { label: "non-followers", value: "99.8%" },
  ],
  statsSource: "From FB insights",
  // Only the points FB reported. Everything between them is drawn as an estimate.
  retention: [
    { t: 0, pct: 100 },
    { t: 3, pct: 43 },
    { t: 20, pct: 9.3 },
  ],
  retentionSource: {
    kind: "reported",
    note: "3 reported points (start, 3 s views 43%, 20 s rate 9.3%). Import the FB retention export for the full curve.",
  },
  reportedDropAt: 2,
};
