// A recording clock that only runs while the tab is visible. Browsers stop drawing hidden
// tabs, so the recorder pauses with them and the timeline picks up where it left off.
export function visibleClock(rec: MediaRecorder) {
  const t0 = performance.now();
  let hiddenAt: number | null = null;
  let hidden = 0;
  const on = () => {
    if (document.hidden) {
      if (hiddenAt == null) { hiddenAt = performance.now(); if (rec.state === "recording") rec.pause(); }
    } else if (hiddenAt != null) {
      hidden += performance.now() - hiddenAt; hiddenAt = null;
      if (rec.state === "paused") rec.resume();
    }
  };
  document.addEventListener("visibilitychange", on);
  on();
  return {
    now: () => ((hiddenAt ?? performance.now()) - t0 - hidden) / 1000,
    stop: () => document.removeEventListener("visibilitychange", on),
  };
}

// A recording this small has no picture in it.
export function assertRecorded(webm: Blob) {
  if (webm.size < 20_000) {
    throw new Error("The browser recorded nothing. Keep the Distro tab open and in front until “Animate and record” finishes, then render again. In Brave, also set Shields' fingerprinting block to Standard for localhost, since it can stop canvas recording.");
  }
}
