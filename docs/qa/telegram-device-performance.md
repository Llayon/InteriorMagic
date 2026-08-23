# Telegram Mini App — Physical Device Performance Runbook

This is the Track D manual benchmark procedure for real Telegram Android/iOS
WebViews. It is **not** a browser QA document and never replaces one: emulated
Chromium results must never be reported as Telegram results.

Goal: MEASURE → IDENTIFY BOTTLENECK → MINIMAL FIX → RE-MEASURE.
This runbook only produces measurements; optimization decisions come after the
first physical baseline exists ("no evidence yet" is a valid result).

## Prerequisites

Device QA needs a deployed build containing this branch reachable with
`?deviceQa=1`. The current GitHub workflow does NOT deploy pull-request
builds (`build-pages`/`deploy` are guarded by `github.event_name !=
'pull_request'`), so there is **no automatic branch-specific Pages URL** for
this PR. Physical Telegram measurement begins after either:

- this opt-in diagnostics branch is deployed through an explicitly chosen
  preview host, or
- this reviewed measurement-only PR is merged and deployed to normal Pages.

Note: manually triggering the existing workflow (`workflow_dispatch`) targets
the **shared** GitHub Pages environment, not a private branch preview — only
do that deliberately.

Also required:

- Physical devices: at least one iPhone (Telegram iOS) and one representative
  mid-range Android phone (Telegram Android).
- Primary orientation: **portrait**. Keep the app in portrait for all steps.
- A place to paste reports (e.g. Saved Messages inside Telegram itself).

## Enabling device QA

Open the Mini App URL with `?deviceQa=1` appended (Telegram Mini Apps keep
query parameters when launched via a bot menu button / direct link). A small
DEVICE QA panel appears above the bottom sheet:

- **A / B / C / D chips** — select the current benchmark checkpoint (see below);
  the selected checkpoint is embedded in every exported report.
- **ORBIT / PINCH / SHEET** — start a fixed 5-second frame-pacing capture.
  Start the chip, then perform the gesture continuously until it auto-stops.
- **drag** — captured automatically while an object is being dragged.
- **COPY REPORT** — copies a JSON report to the clipboard (falls back to a
  selectable text dialog). Paste it into chat immediately after each
  checkpoint below.

The panel is opt-in only; normal sessions are unaffected.

## Frozen benchmark scenario

Use exactly this flow so future runs stay comparable. Do not substitute
assets or reorder steps without renaming the checkpoint scheme.

**Checkpoint labels**

| Checkpoint | Meaning | Comparison |
|---|---|---|
| **A** cold-ready | Room visible & usable right after cold open | startup baseline |
| **B** loaded-session | After loading the standard asset set | A → B shows asset accumulation |
| **C** post-resume | After background + resume cycle | B → C shows Telegram lifecycle health |
| **D** heavy-stress *(optional)* | After adding the Sheen Chair | B → D isolates intentionally heavyweight PBR impact |

Important: the **Sheen Chair is a heavyweight stress object, NOT the
representative production furniture target**. If D degrades relative to B,
the conclusion is "this specific PBR asset is expensive", not "our production
asset direction is too heavy". Do not skip B before D.

### Steps

1. Kill Telegram (swipe away), relaunch, open the Mini App cold from the bot.
2. Wait until the room is visibly usable. Select checkpoint **A**, tap
   COPY REPORT → paste as "REPORT A".
3. Open the catalog. Add, one by one: sofa, table, chair, rug, plant, lamp,
   side table, bookcase — all current legal production assets from main.
4. Select checkpoint **B**, tap COPY REPORT → "REPORT B".
5. Tap **ORBIT**, then orbit continuously ~5 s until capture stops.
6. Tap **PINCH**, pinch-zoom in/out continuously ~5 s.
7. Drag the largest upholstered object across the room twice (auto-captured
   `drag` windows; note their p95 values shown under the panel afterwards).
8. Rotate an object twice with the toolbar rotate buttons (observe hitches).
9. Expand/collapse the workspace sheet twice (**SHEET** chip captures one
   expansion; note that sheet animation is CSS-driven and may legitimately
   render few frames).
10. Reopen catalog and browse/load several DISTINCT assets you have not added
    yet (repeat taps on loaded assets are the warm-cache check; new assets
    are cold loads). Add 3–4 more objects for a meaningful session state.
11. Background Telegram (home screen), wait ~30 s, resume, interact briefly.
12. Select checkpoint **C**, tap COPY REPORT → "REPORT C".
13. Optional stress step: add the Sheen Chair (Бархатное кресло), orbit/pinch
    once each, drag it once.
14. Select checkpoint **D**, tap COPY REPORT → "REPORT D".
15. Continue using the room normally for 5–10 minutes (orbit, drag, undo/redo,
    open/close sheet repeatedly). Watch for heat, throttling, corruption.
16. Final report: select the last relevant checkpoint, COPY REPORT → "FINAL".

### What to return

For each run: REPORT A, REPORT B, REPORT C, (REPORT D), FINAL JSON dumps plus
free-form notes:

- visual corruption / flicker / black canvas?
- unexpected reload of the Mini App (report would show fresh lifecycle log)?
- severe hitching during which gesture?
- device heating / throttling perception?
- touch input regressions (dead taps, lost drags, camera stuck)?

## Reading the reports

- `renderer.frameloop` is always `demand`. There is deliberately **no idle
  FPS metric** — idle FPS is meaningless here. Judge interaction smoothness by
  the completed pacing windows (`completedWindows[]`): every number there is
  an **interval BETWEEN rendered frames while the captured interaction ran**
  (p50Ms/p95Ms/worstMs, plus >33 ms / >50 ms counts and shares). These are not
  GPU render-duration measurements, and the report carries this note in
  `pacingNote`. Fixed windows close on a wall-clock timer at exactly their
  requested duration; a gesture that stops early simply contributes no more
  samples — no late idle interval can enter the stats.
- `renderer.textures` (count) is authoritative renderer state.
- `textureMemory` is explicitly `kind: "estimate"` produced by a
  dimensions×bytes4×mip1.33 heuristic over scene-discoverable textures only.
  It excludes PMREM/environment intermediates and driver-internal formats.
  Never quote it as measured GPU memory; use it only as a trend indicator
  between checkpoints, together with per-texture `textureDetails`.
- `assets.entries[].byteSize` is known transferred GLB size (measured);
  repeat catalog taps on an already-loaded asset should not increase
  `loadedAssets` — that is the warm-load check.
- `lifecycle[]` records visibility changes, pagehide/show, Telegram
  activated/deactivated and WebGL context loss/restoration. Context events are
  purely observational — no recovery machinery exists or should be inferred.
- Environment contains Telegram platform/version, `isActive`, stable viewport
  height and both officially documented inset sources — `safeAreaInset` and
  `contentSafeAreaInset` — plus viewport/DPR and unmasked WebGL
  vendor/renderer when available.

## First-run analysis checklist (Phase 4 questions)

Answer explicitly after the first physical run:

1. Interaction smooth enough in Telegram WebView? (pacing windows vs 33 ms)
2. If not, dominant bottleneck class: GPU/frame pacing, network/asset load,
   texture pressure, main-thread JS, Telegram viewport/lifecycle, other?
3. Does browsing many distinct assets grow `renderer.textures` /
   `textureMemory.bytes` monotonically, and does anything degrade or reload?
4. Is DPR cap 1.5 appropriate on both device classes? (compare window stats)
5. Does background/resume preserve a healthy scene? (lifecycle + C vs B)
6. Telegram-specific viewport/safe-area defects absent in browsers?
7. Are orbit/pinch/drag/sheet gestures reliable in real Telegram?
8. Evidence for any of: texture downscaling policy, KTX2, cache eviction,
   lower DPR, asset concurrency changes?

Classification policy for findings: **P0** crash/reload/context loss/unusable
input/broken safe-area/persistent stalls; **P1** repeated hitching, problematic
startup, measurable degradation; **P2** polish. Fixes land only when a finding
is reproduced, isolated, and addressable by a small local change verifiable by
this same benchmark. Everything else waits for a dedicated follow-up PR.

## Known limitations of this harness

- No automatic startup timing: "cold-ready" is defined by human judgment of
  "room visibly usable"; the report marks when it was taken instead.
- Sheet animation is CSS-driven; its pacing window may contain very few
  rendered frames by design.
- Fixed windows close at exactly their wall-clock duration even if no frames
  rendered (frames: 0) — start interacting immediately after tapping a chip.
- When `?deviceQa=1` is absent, device QA causes no behavioral or runtime
  measurement activity; no zero-bundle-payload claim is made beyond that.
