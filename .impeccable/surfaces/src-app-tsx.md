---
version: 1
slug: "src-app-tsx"
primary_target: "src/App.tsx"
related_targets: []
---

# Surface: BIDA studio app (all four sections; Analyze is the lead screen)

Mode: Operate. Code-led build. Audience: small PH studios / indie devs; demo audience: hackathon judges (Content bucket).
Job: see which beat of a posted reel lost viewers, rewrite that beat's hook in Taglish, preview the fix; then plan the next batch of takes, run brand checks, move takes across a board.
Proof/content: real Moonsill "what if" reel (public/reels), its real VO word timing (beats derived from render data), reported FB figures (10,691 views/24 h, 3 s views 43%, 20 s rate 9.3%, avg watch 7 s of 31 s, biggest drop 0:02). Curve between reported points is interpolated and labelled so.
Constraints: never fake views/curves/predictions; hook lint is rules not prediction; live AI with labelled saved-run fallback.

## Direction contract

THESIS: A reel is a komiks strip. Every beat is a panel cut from the real video, and the panel where readers stopped gets the balloon. Refuses the category default: a grey SaaS dashboard with a line chart in a card and a kanban of identical tiles.

OWN-WORLD: Night edition (user, 12 Nov: palette after paralleldistribution.com/careers). Near-black violet ground #080410, deep navy shell #141833/#1A1F3D gradient top bar, surfaces #0F0C1A/#17132A, hairline frames #3D3760, white type with #B9B4CC secondary, violet #8E51FF and lilac #A684FF accent with soft violet glow on selection, pill-shaped controls, white primary button. Komiks grammar stays: square-framed beat panels with real frames and halftone, violet halftone retention area, white speech balloons, Patrick Hand SC captions. Coral #FF6B5E only for the drop and blocked checks. Product name BEAT (Brief · Explore · Arrange · Track).

STORY: The judge sees the strip, the balloon on the hook panel and the halftone cliff under it; understands the hook was too slow (lands 5.4 s, left at 0:02); watches a Taglish rewrite get linted and previewed over the real footage; then sees the next batch of takes moved across a board with checks blocking a bad one.

FIRST VIEWPORT: Navy rail left (B E A T), navy top bar with crumb and Import FB export. Title row with the reported stats and their source. Left ~64%: panel strip (widths proportional to beat seconds, frames grabbed from the video, violet-tinted caption boxes), halftone retention area on the same axis beneath, drop flag. Right ~36%: 9:16 player synced to the chart playhead, then Hook rewrite (current hook + lint, three Taglish rewrites, Preview new hook as the primary action). Bottom: ten takes T01–T10 strip linking to Direct.

FORM: Komiks Weekly, position 1 of my ordered list (the pick), seed:97923948337715b9.

Signature interaction: scrubbing the retention chart moves the video and lights the panel under the playhead; Preview new hook plays the new Taglish hook as word-by-word balloon captions over the original first seconds, then cuts to Step 1.

FINISH: unreviewed and undocumented is unfinished; this build ends with the finish review, the verdict, DESIGN.md, and every shipping raster carrying its provenance
