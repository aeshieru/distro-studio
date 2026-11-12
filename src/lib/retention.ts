import type { RetentionPoint } from "../types";

// Monotone (Fritsch–Carlson) interpolation through the points we actually have.
export function interpolate(points: RetentionPoint[], t: number): number {
  const p = [...points].sort((a, b) => a.t - b.t);
  if (t <= p[0].t) return p[0].pct;
  if (t >= p[p.length - 1].t) return p[p.length - 1].pct;
  const n = p.length;
  const d: number[] = [];
  for (let i = 0; i < n - 1; i++) d.push((p[i + 1].pct - p[i].pct) / (p[i + 1].t - p[i].t));
  const m: number[] = [d[0]];
  for (let i = 1; i < n - 1; i++) m.push(d[i - 1] * d[i] <= 0 ? 0 : (d[i - 1] + d[i]) / 2);
  m.push(d[n - 2]);
  for (let i = 0; i < n - 1; i++) {
    if (d[i] === 0) { m[i] = 0; m[i + 1] = 0; continue; }
    const a = m[i] / d[i], b = m[i + 1] / d[i], s = a * a + b * b;
    if (s > 9) { const k = 3 / Math.sqrt(s); m[i] = k * a * d[i]; m[i + 1] = k * b * d[i]; }
  }
  const i = p.findIndex((q, j) => j < n - 1 && t >= q.t && t <= p[j + 1].t);
  const h = p[i + 1].t - p[i].t, x = (t - p[i].t) / h;
  const h00 = 2 * x ** 3 - 3 * x ** 2 + 1, h10 = x ** 3 - 2 * x ** 2 + x;
  const h01 = -2 * x ** 3 + 3 * x ** 2, h11 = x ** 3 - x ** 2;
  return h00 * p[i].pct + h10 * h * m[i] + h01 * p[i + 1].pct + h11 * h * m[i + 1];
}

// Largest one-second fall in a dense curve. Returns null for sparse data.
export function steepestDrop(points: RetentionPoint[]): number | null {
  if (points.length < 8) return null;
  const p = [...points].sort((a, b) => a.t - b.t);
  let best = 0, at: number | null = null;
  for (let i = 1; i < p.length; i++) {
    const fall = (p[i - 1].pct - p[i].pct) / Math.max(0.25, p[i].t - p[i - 1].t);
    if (fall > best) { best = fall; at = p[i].t; }
  }
  return at;
}

// Accepts a CSV/TSV with a time column (seconds or m:ss) and a percent column.
export function parseRetentionCsv(text: string): RetentionPoint[] {
  const rows = text.trim().split(/\r?\n/).map((r) => r.split(/[,\t;]/).map((c) => c.trim().replace(/^"|"$/g, "")));
  const toSec = (s: string) => {
    const m = s.match(/^(\d+):(\d{1,2}(?:\.\d+)?)$/);
    return m ? Number(m[1]) * 60 + Number(m[2]) : Number(s.replace(/s$/, ""));
  };
  const out: RetentionPoint[] = [];
  for (const r of rows) {
    if (r.length < 2) continue;
    const t = toSec(r[0]);
    const raw = Number(r[1].replace("%", ""));
    if (!Number.isFinite(t) || !Number.isFinite(raw)) continue;
    out.push({ t, pct: raw <= 1 && !r[1].includes("%") ? raw * 100 : raw });
  }
  if (out.length < 2) throw new Error("Found fewer than 2 rows of time and percent. Use two columns: seconds, retention %.");
  return out.sort((a, b) => a.t - b.t);
}
