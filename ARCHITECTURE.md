# Architecture

## Testing pyramid

Framework-independent editor logic проверяется Vitest. Chromium Playwright поверх него выполняет реальные DOM/canvas pointer-сценарии и читает только диагностические snapshots через test-mode API. Финальный уровень — ручная проверка физического Telegram Android/iOS WebView; browser emulation её не заменяет.

`window.__INTERIOR_MAGIC_TEST__` устанавливается только в Vite mode `test`. Scene registry проецирует interaction proxies через текущую camera и CSS bounding rect canvas; API не содержит editor mutations и отсутствует в production Pages runtime.

## State boundaries

`RoomProject` version 1 is the only persistent source of truth: room, finishes and furniture instances. Asset metadata, Three.js objects, selection and history are not serialized.

`EditorSession` contains selection, active tool, catalog category, interaction mode and a 50-entry snapshot history. Loading or resetting a project starts a new history.

High-frequency `InteractionState` lives inside `DragController`: pointer ID, initial transform, grab offset, preview, last-valid transform and snap targets. Pointer movement mutates the Three.js group and editor overlays directly; Zustand receives one Move at completion.

## Drag flow

The interaction proxy, not visual mesh geometry, receives pointer events. Pointer-down intersects the ground and stores `objectPosition - floorIntersection`. Subsequent intersections retain this offset, so edge grabs do not move the pivot under the finger.

Raw desired coordinates are evaluated by `SnapResolver` before room clamping. This preserves true wall distance: a pointer far outside the room may be constrained to an edge without falsely entering wall hysteresis. Wall targets take priority over the 5 cm grid, engage at 5 cm and release after 9 cm. Snap state records target identity independently for X and Z.

The resolved candidate is constrained with rotated footprint extents, then physical collisions are validated. Valid previews advance `lastValidTransform`; invalid previews use a separate red overlay. Commit writes once, invalid release returns to last-valid, and cancel returns to the initial transform.

Camera controls are disabled both imperatively at drag start and declaratively from session mode. Pointer-up, cancel and lost capture share cleanup, guaranteeing camera restoration.

## Collision and clearance

Footprints remain 2D oriented rectangles tested with SAT. Room bounds use transformed corners. Collision filtering is symmetric:

```ts
(a.mask & b.group) !== 0 && (b.mask & a.group) !== 0
```

Furniture and decor collide; rugs may overlap both. Clearance evaluation is a separate warning channel and does not affect placement validity.

## Asset system

The registry owns URLs, dimensions, footprint, placement anchor, collision, snapping, rotation, interaction proxy, variants and normalization metadata. Only `floor` is executable today, while the schema names future anchors.

`AssetLoader` fetches and parses GLB, records byte size, normalizes the scene once and audits bounds. `AssetCache` keeps one source scene/promise per asset for the session. Instance clones share geometry, textures and unchanged materials; only variant-overridden materials are cloned and owned by the instance.

Visual meshes have raycast disabled. Each instance has a metadata-sized invisible BoxGeometry proxy with `instanceId`. Selection, invalid placement and future guides belong to the editor overlay layer and never modify GLB state.

Catalog thumbnails do not preload models. Concurrent selection uses latest-request-wins tokens: stale loads may populate cache but cannot add an unexpected object. Project load/reset invalidate pending catalog intent; saved instances load their assets independently.

## Rendering

R3F reconstructs the scene from the project using `frameloop="demand"`. Camera movement, drag and asset completion request frames; idle does not run a WebGL loop. DPR profiles remain capped at 1.5. There are no physics, realtime shadows or post-processing.

## Mobile workspace

On portrait screens the 3D room is the workspace; the header, global/context controls and one shared catalog/materials bottom sheet overlay it. `workspacePanel`, `sheetState` and Fit Room intent are `EditorSession` data and never enter `RoomProject`, persistence or command history.

Camera fitting is centralized in `scene/camera/fitRoom.ts`. It derives the usable CSS rectangle from the canvas and settled header/sheet occupancy, fits the room dimensions against the usable horizontal and vertical FOV, and applies a focal offset from the canvas center to the usable-area center. Sheet transitions trigger one fit after settling rather than camera updates on every gesture pixel. The explicit Home action restores the canonical dollhouse direction through the same algorithm.
