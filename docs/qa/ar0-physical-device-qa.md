# AR0 physical-device QA — Sheen Chair

Browser automation validates delivery and the web landing, but it does not replace native Scene Viewer or Quick Look QA.

## Locked scale acceptance

- Authoritative width: **82.7 cm**.
- Authoritative depth: **57.1 cm**.
- Mark both dimensions on a clear floor.
- Repeat placement from approximately **1 m** and **2 m** viewing distance.
- Width and depth must each be within **3 cm** of the markers.

## Sheen Chair r1 — superseded on iOS

- iPhone Safari Quick Look launch: **PASS**, observed 2026-08-29.
- Geometry and floor placement: visible.
- Upholstery material: **FAIL**. Quick Look rendered the Mango upholstery white because the Blender USD export omitted the glTF base-color factor from the texture-backed `UsdPreviewSurface` material.
- Telegram iOS in-app browser: native Quick Look launch is not supported reliably; open the link in Safari.
- Immutable USDZ SHA256: `4b0bec120f9db100b888b7083a8e2d7873d7c2f56d5343b65eb4c8fc69330618`.

The immutable `r1` objects are retained and are not overwritten.

## Sheen Chair r2 — current catalog revision

- Canonical GLB SHA256: `a38f20af9f527b1d1cef1220ce5d19489498f7b2cd0ca0ca6ea35f82b0cb8f22` (geometry and scale unchanged from r1).
- USDZ SHA256: `ad1e36abcf95b44f1de5494c4104ad9b28200b9b0e83862df798e7377e5254cb`.
- Mango `[0.883, 0.035, 0, 1]` and wood base-color factors are baked into their texture pixels before USD export.
- The Mango `UsdPreviewSurface.diffuseColor` connects directly to the packaged sRGB texture `fabric_Mystere_Mango_Velvet_quick_look_r2.png`.
- Unsupported sheen is removed from the Quick Look material profile; normal-map detail is retained.
- Structural USD validation: **PASS** (Y-up, meter units, no unresolved dependencies, dimensions within 1% of the canonical GLB).
- iPhone Safari launch and material match: **PENDING PHYSICAL QA**.
- Android Scene Viewer: **NOT RUN**.

### iOS checklist

- [ ] Open `?ar=sheen-chair-r2` in Safari.
- [ ] Quick Look launches the prebuilt `model.usdz` without downloading it as a document.
- [ ] Upholstery is red/orange and acceptably matches the web GLB.
- [ ] Floor contact and orientation are plausible at ~1 m and ~2 m.
- [ ] Width and depth are within the locked 3 cm tolerance.
- [ ] Pinch does not resize the chair.

### Android checklist

- [ ] Scene Viewer launches from revision `sheen-chair-r2`.
- [ ] The canonical GLB loads with correct materials.
- [ ] Floor contact and orientation are plausible at ~1 m and ~2 m.
- [ ] Width and depth are within the locked 3 cm tolerance.
- [ ] Pinch does not resize the chair.
