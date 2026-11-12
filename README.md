# Distro

**You build it. We handle distribution.** Distro turns one idea into short reels and photo slideshows for your app, checks every take against your brand rules, renders it, helps you post it, and then shows the second viewers left so you can rewrite the hook and render the fix.

Built for ManilaHack's "Content" bucket: *make the work people actually stop for.*

## What it does

| Screen | What you do there |
| --- | --- |
| **Brand profile** | Your app's rules: paid features (never pitched as free), approved claims, banned phrases, voice, links. Import from your website, App Store page or a PRD, or tell **Ask Distro** in plain words. |
| **Create** | Pick **Reels**, **Slideshows**, **Recreate a style** or **Fix a posted reel**. One idea becomes ten angles, ranked by the brand checks, with the best three picked for you. Recreate a style uses Claude in Chrome to read a reference post's structure (slides, pacing, captions), never its content. |
| **Board** | Takes move Hooks → Script → Checks → Ready. **Auto-run the board** runs every brand check in plain code (no AI) and stops any take that breaks a rule, with the reason. Ready takes render from your footage, a soft-lit 3D scene or motion graphics; slideshows export as 1080×1920 images. **Post…** writes a checked caption per platform and opens the upload page. |
| **Library** | Your footage, real app screens and everything made this session. |
| **Results** | A posted reel split into beats, the retention curve on the same timeline, and where viewers left. Pick or write a shorter hook, preview it over the real footage, render the new MP4 and compare before and after. |

The demo data is real: Moonsill's "What if it only rained on your street?" (FB, 6 Nov 2026, 10,691 views in 24 h). The chart draws only the points FB reported (3 s: 43%, 20 s: 9.3%) and marks everything between them as an estimate until a full retention export is imported.

## Run it locally

```bash
npm install       # if npm asks, allow install scripts: npm install-scripts approve ffmpeg-static esbuild
npm run dev       # http://localhost:5178
```

- **AI engine:** Distro uses whichever is available and lets you switch in the sidebar:
  - the logged-in [Claude Code](https://claude.com/claude-code) CLI (default), plus Claude in Chrome for Recreate a style
  - `ANTHROPIC_API_KEY` in `.env.local` (Claude API)
  - the logged-in OpenAI **Codex** CLI
  - `OPENAI_API_KEY` in `.env.local` (set `OPENAI_MODEL` to choose one, default `gpt-5`)
  - the **Gemini** CLI (supported, not yet tested)

  Set `BEAT_AI=codex` (or another id) in `.env.local` to pick the default.
- **Voice-over for renders:** an ElevenLabs key in `~/.elevenlabs_key`. Without it, renders are captions only.
- **Video:** ffmpeg comes from the `ffmpeg-static` package. Renders are saved to `renders/` (not committed).

## Honest limits

- Hook lint checks rules (length, talks to the viewer, language), not predicted views.
- Voice-over lines written at render time aren't re-checked yet; a person approves every take before posting.
- Distro doesn't post for you yet: it opens the upload page with the caption copied.
- A new hook's retention only exists after you post it; judge it at 24 h.
- The render pipeline and the Moonsill reel predate the hackathon.
