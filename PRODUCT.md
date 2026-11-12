# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Stack

React + Vite (user's choice, 2026-11-12). A demo prototype for a hackathon, not production yet.

## Users

Small Philippine studios and indie developers who promote their own apps or brands with short vertical videos (TikTok, FB Reels, IG Reels, Threads, X). One person usually does everything: the idea, the hooks, the edit, the posting and reading the numbers. The first real user is the builder's own studio (Moonsill, a cozy weather-garden game; Cleanr, a macOS cleaning app).

Secondary audience for this build: hackathon judges for the "Content" bucket (prize: Best Content), who reward work "people actually stop for": hooks, craft and payoff, made fast and on brand.

## Product Purpose

BEAT (Brief · Explore · Arrange · Track; renamed from BEAT on 12 Nov 2026 for a universal name) turns one idea into a set of short-video takes and, more importantly, closes the loop after posting. It shows which beat of a posted reel lost viewers, then helps rewrite that beat (usually the hook) in Taglish and re-render it.

Success: a maker can see exactly where a reel lost people and ship a fixed version faster than they could by guessing.

## Positioning

The postmortem loop is the hero: the real retention curve laid over the script's own beat timeline (beats come from BEAT's own render data), so a drop lands on a named beat, followed by a rewrite of that beat. Competitors already generate variants and score hooks (OpusClip virality score, Creatify batch mode, TikTok Symphony, a free Taglish hook generator on Product Hunt). BEAT does not compete on "ten variants" or a magic hook score.

## Operating Context

- Flow on a card board: Idea → Angles → Hooks → Script → Checks → Render → Results.
- One idea fans out into up to ten angle cards (what-if, "I forgot", arguing, POV, myth-bust, countdown, before/after, skit, quick tutorial, reaction). Three get fully rendered; the rest stay as script cards.
- Hook Lab: Taglish openers checked by rules ("hook lint": does it land within 2.5 s, does it talk to "you", word count, code-switch). This is lint, not a prediction of views.
- Brand checks run cheapest first and block a card: paid features not pitched as free, logo or app UI only at the end (read from the scene timeline, not pixels), captions on, loudness −14 LUFS, file size per platform.
- Results come from pasted numbers or a CSV export, or from the Meta Graph API retention graph later. No auto-posting.
- Drag and drop like the builder's "Question Line" board: drag to approve, to the bin to reject, back with a note to remake.

## Capabilities and Constraints

- AI on stage: live generation of angles and Taglish hooks, with a clearly labelled saved run as backup when wifi fails.
- Open decision: the live-AI path, either an Anthropic API key behind a local proxy or the built app published as a claude.ai artifact using its ask-Claude capability.
- Rendering uses the builder's existing pipeline (Three.js/HTML scenes rendered by Playwright, voice-over, sound effects, ffmpeg mix). It may predate the event, and that must be declared to the judges.
- Reference videos only as local uploads; never download from TikTok or FB.
- Never fake: views, retention curves, "predicted performance", or a claim that a new hook beat an old one. A "live" render must really be live.

## Brand Commitments

- Name: BEAT, read as Brief · Explore · Arrange · Track (formerly BEAT).
- Content is English by default for a universal audience; a Taglish switch keeps Taglish hooks and takes.
- The builder's studio rules carry over: no "AI-assisted" labels volunteered on posts, paid-only features never pitched as free, every promo video gets custom motion, sound effects on every cut and a voice-over.

## Evidence on Hand

- Moonsill FB reel "what if it rained on your street" (6 Nov 2026): 10,691 views in ~24 h vs 9–56 for every other Page reel; 99.8% non-followers; big drop at 0:02; average watch 7 s of 31 s; 0 comments, 5 clicks, 3 follows. Source: Moonsill docs/marketing/viral-whatif-rain.md. Its point-by-point retention curve is not in hand yet; export it from FB insights before drawing it as real.
- 14 Cleanr 3D skit reels scheduled 7–20 Nov 2026 (cleanr brag-output/2026-11-06-skits), with scripts in script.json form.
- No customers, testimonials or benchmarks exist; do not invent any.

## Product Principles

1. Find where people left before you make more.
2. Lint, don't predict: rules are labelled as rules, and data is labelled with its source.
3. Make the reel itself good; the tool earns its place by the output.
4. Fewer, finished takes beat ten re-skins.
