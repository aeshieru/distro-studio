# BEAT

**Brief · Explore · Arrange · Track.** BEAT finds the beat where a short video lost its viewers, rewrites the hook with Claude, and renders the fixed version, then plans and checks the next batch of takes against your app's own rules.

Built for the "Content" bucket: *make the work people actually stop for.*

## What it does

| Screen | What you do there |
| --- | --- |
| **Track** | See a posted reel split into beats (from its real voice-over timing), the retention curve on the same timeline, and where viewers left. Pick or write a shorter hook, preview it over the real footage, and render a new MP4 with a new voice-over. Compare before and after. |
| **Explore** | Turn one idea into ten takes in ten different formats. Paste an Instagram, Facebook, TikTok or YouTube link (and optionally a video file) as a style reference: BEAT reads the public caption and measures the file's cut rhythm. |
| **Arrange** | Drag takes across a board. Brand checks run cheapest first and stop any take that breaks a rule, with the reason. Each take has a sketch storyboard; a ready take renders an animatic MP4 (voice-over + timed beat cards) and a production pack for your editor. |
| **Brief** | Your app's rules: paid features (never pitched as free), approved claims, banned phrases, voice. Upload a PRD, README or PDF and Claude drafts them for you. |

The demo data is a real reel: Moonsill's "What if it only rained on your street?" (FB, 6 Nov 2026, 10,691 views in 24 h). The chart shows only the numbers FB reported (3 s: 43%, 20 s: 9.3%) and marks everything between them as an estimate until a full retention export is imported.

## Run it locally (everything works here)

```bash
npm install       # if npm asks, allow install scripts: npm install-scripts approve ffmpeg-static esbuild
npm run dev       # http://localhost:5178
```

- **AI engine:** BEAT uses whichever is available and lets you switch in the top bar:
  - `ANTHROPIC_API_KEY` in `.env.local` (Claude API)
  - the logged-in [Claude Code](https://claude.com/claude-code) CLI
  - the logged-in OpenAI **Codex** CLI
  - `OPENAI_API_KEY` in `.env.local` (ChatGPT models; set `OPENAI_MODEL` to choose one, default `gpt-5`)
  - the **Gemini** CLI (supported, not yet tested)

  Set `BEAT_AI=codex` (or another id) in `.env.local` to pick the default.
- **Voice-over for renders:** an ElevenLabs key in `~/.elevenlabs_key`. Without it, renders are captions only.
- **Video:** ffmpeg comes from the `ffmpeg-static` package. Renders are saved to `renders/` (not committed).

## Deployed version

The Vercel deployment serves the app with the saved demo run. Rendering needs the local app (ffmpeg and the voice key live there). For live Claude on Vercel, add `ANTHROPIC_API_KEY` to the project's environment variables.

## Honest limits

- Hook lint checks rules (length, talks to the viewer, language), not predicted views.
- A new hook's retention only exists after you post it; judge it at 24 h.
- The render pipeline and the Moonsill reel predate the hackathon.
