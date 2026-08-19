# Real-device test

## URLs

- Normal: <https://llayon.github.io/InteriorMagic/>
- Diagnostics: <https://llayon.github.io/InteriorMagic/?debug=1>

The diagnostic query shows viewport, touch points, FPS/frame time during active rendering, draw calls, triangles, renderer memory, DPR, selection and loaded GLB bytes. `FPS idle` is expected after interaction stops because the Canvas uses demand rendering.

## P0 pass

Run first in the device browser, then from Telegram. A true Telegram Mini App pass requires the Pages URL to be registered for a test bot in BotFather.

1. Open portrait at the normal device zoom; verify catalog and toolbar are not clipped by safe areas.
2. Orbit with one finger and pinch zoom; camera must not cross the floor or lose the room.
3. Open Chairs and add **Бархатное кресло**. Confirm the thumbnail appears before its 4.1 MB GLB request completes.
4. Tap the chair at its edge and drag. The pivot must not jump under the finger and the camera must remain still.
5. Approach a wall, move 5–9 cm away, then farther away; verify engage, stable hysteresis and release.
6. Drag toward a corner and verify independent X/Z wall targets feel stable.
7. Rotate, undo and redo.
8. Add a rug, place a sofa over it, then try to overlap chair/sofa. Rug overlap must be allowed; furniture overlap must be rejected.
9. Rapidly tap two different catalog items while the first model loads. Only the latest choice may appear.
10. Background/foreground Telegram, rotate the phone and return to portrait. The project and camera controls must remain usable.
11. Save, reload, load the project and confirm exact transforms and finishes.

## Record

For each device record model/OS, browser or Telegram version, viewport, DPR profile, peak active frame time, calls/triangles with the external chair visible, cold chair load time, and any gesture conflict. Screen recording is more useful than subjective notes for snap/camera defects.

## Furnished-room visual pass

Open `https://llayon.github.io/InteriorMagic/?demo=1&debug=1` after deployment.

1. Let all nine trial assets appear and record the subjective cold-load delay.
2. Orbit and pinch; confirm the curated room remains framed above the sheet.
3. Select and drag the sofa, both armchairs, table, lamp and plants through their proxies.
4. Expand/collapse the catalog and background/foreground Telegram.
5. Record active frame time, calls, triangles, DPR, renderer memory and loaded bytes.
6. Inspect fabric, wood, metal, rug and foliage; look for clipping, floating, overexposure or crushed colors.
7. Repeat in the device browser and Telegram WebView, then capture a short screen recording.
