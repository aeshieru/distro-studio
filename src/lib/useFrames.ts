import { useEffect, useState } from "react";

// Grabs one still per time from the reel itself, for the komiks panels.
export function useFrames(url: string, times: number[]) {
  const [frames, setFrames] = useState<(string | null)[]>(() => times.map(() => null));
  const key = times.join(",");

  useEffect(() => {
    let cancelled = false;
    const video = document.createElement("video");
    video.muted = true;
    video.preload = "auto";
    video.playsInline = true;
    video.src = url;
    const canvas = document.createElement("canvas");
    canvas.width = 270;
    canvas.height = 480;
    const ctx = canvas.getContext("2d");

    const seek = (t: number) =>
      new Promise<void>((resolve) => {
        const done = () => { video.removeEventListener("seeked", done); resolve(); };
        video.addEventListener("seeked", done);
        video.currentTime = t;
      });

    (async () => {
      await new Promise<void>((resolve, reject) => {
        video.addEventListener("loadeddata", () => resolve(), { once: true });
        video.addEventListener("error", () => reject(new Error("video")), { once: true });
      }).catch(() => null);
      if (cancelled || !ctx || video.readyState < 2) return;
      for (let i = 0; i < times.length; i++) {
        await seek(times[i]);
        if (cancelled) return;
        ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
        const data = canvas.toDataURL("image/jpeg", 0.72);
        setFrames((prev) => prev.map((f, j) => (j === i ? data : f)));
      }
    })();

    return () => { cancelled = true; video.removeAttribute("src"); video.load(); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [url, key]);

  return frames;
}
