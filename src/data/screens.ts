// Real app screens a brand already has, for the app slides in a photo story.
// Moonsill's are cropped from its own App Store screenshots (phone screen only, no headline).
export type AppScreen = { id: string; label: string; src: string; tags: string[] };

export const SCREENS: Record<string, AppScreen[]> = {
  moonsill: [
    { id: "rain", label: "Rain on the sill", src: "screens/moonsill/rain.jpg", tags: ["rain", "raining", "rains", "storm", "wet", "water", "watered", "live rain", "arrives", "barrel", "monsoon", "garden", "alive", "sill"] },
    { id: "moon", label: "Full moon, moonflower", src: "screens/moonsill/moon.jpg", tags: ["moon", "full moon", "moonflower", "night", "tonight", "bloom", "blooms", "opens", "flower"] },
    { id: "clear", label: "Clear and dry", src: "screens/moonsill/clear.jpg", tags: ["clear", "dry", "sun", "sunny", "hot", "heat", "week", "still alive", "nothing dies", "fine", "okay"] },
    { id: "visitors", label: "Visitors drop by", src: "screens/moonsill/visitors.jpg", tags: ["visitor", "visitors", "frog", "gecko", "butterfly", "dragonfly", "critter", "drop by", "guest"] },
    { id: "seedbook", label: "Seed book", src: "screens/moonsill/seedbook.jpg", tags: ["seed", "seeds", "seed book", "plants", "collection", "collect", "28 plants", "unlock", "new plant"] },
    { id: "almanac", label: "Almanac of the year", src: "screens/moonsill/almanac.jpg", tags: ["almanac", "calendar", "month", "days", "history", "year", "scrapbook", "pressed", "rain days"] },
    { id: "sky", label: "Sky over your city", src: "screens/moonsill/sky.jpg", tags: ["sky", "moon phase", "phases", "meteor", "meteors", "shower", "upcoming", "next full moon", "stars"] },
    { id: "resting", label: "Garden rests in a storm", src: "screens/moonsill/resting.jpg", tags: ["resting", "rest", "rests", "typhoon", "warning", "calm", "gentle", "no streaks", "pagasa", "safe"] },
  ],
};

// The screen whose tags best match the slide, or null when the brand has none.
// Falls back to the brand's first screen so an app slide always shows the real app.
export function matchScreen(scene: string, brandId: string): AppScreen | null {
  const list = SCREENS[brandId];
  if (!list?.length) return null;
  const l = scene.toLowerCase();
  let best: AppScreen | null = null, score = 0;
  for (const s of list) {
    const sc = s.tags.reduce((n, t) => n + (l.includes(t) ? t.length : 0), 0);
    if (sc > score) { score = sc; best = s; }
  }
  return best ?? list[0];
}

export const screenById = (brandId: string, id?: string) => (id ? SCREENS[brandId]?.find((s) => s.id === id) ?? null : null);
