// Measures a reference video's cut rhythm in the browser: samples frames, compares them,
// and counts hard cuts. The file never leaves the computer.
export type Pacing = { duration: number; cuts: number; avgShot: number; firstCut: number | null };

export async function measurePacing(file: File, onProgress?: (p: number) => void): Promise<Pacing> {
  const url = URL.createObjectURL(file);
  const v = document.createElement("video");
  v.muted = true; v.preload = "auto"; v.playsInline = true; v.src = url;
  await new Promise<void>((res, rej) => { v.onloadeddata = () => res(); v.onerror = () => rej(new Error("This video can't be read here. Try an MP4.")); });
  const duration = Math.min(v.duration || 0, 120);
  const c = document.createElement("canvas"); c.width = 32; c.height = 56;
  const ctx = c.getContext("2d", { willReadFrequently: true })!;
  const step = 0.2;
  let prev: Uint8ClampedArray | null = null;
  const cuts: number[] = [];
  for (let t = 0; t < duration; t += step) {
    await new Promise<void>((res) => { v.onseeked = () => res(); v.currentTime = t; });
    ctx.drawImage(v, 0, 0, c.width, c.height);
    const px = ctx.getImageData(0, 0, c.width, c.height).data;
    if (prev) {
      let diff = 0;
      for (let i = 0; i < px.length; i += 4) diff += Math.abs(px[i] - prev[i]) + Math.abs(px[i + 1] - prev[i + 1]) + Math.abs(px[i + 2] - prev[i + 2]);
      const mean = diff / (px.length / 4) / 3;
      if (mean > 38 && (!cuts.length || t - cuts[cuts.length - 1] > 0.5)) cuts.push(t);
    }
    prev = px;
    onProgress?.(t / duration);
  }
  URL.revokeObjectURL(url);
  return { duration, cuts: cuts.length, avgShot: duration / (cuts.length + 1), firstCut: cuts[0] ?? null };
}
