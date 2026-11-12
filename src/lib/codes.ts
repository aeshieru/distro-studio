// What a take's code reads as on screen: T01 → "Reel 01", S01 → "Slideshow 01".
export function codeLabel(code: string) {
  const m = code.match(/^([TS])(\d+)$/);
  if (!m) return code;
  return `${m[1] === "S" ? "Slideshow" : "Reel"} ${m[2]}`;
}
