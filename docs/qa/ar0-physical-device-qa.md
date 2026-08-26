# AR0 physical-device QA — Sheen Chair r1

Status: **NOT RUN**. Browser automation does not validate native Scene Viewer or Quick Look.

Production activation remains **OFF**. `VITE_AR0_ENABLED=true` may be considered only after R2 verification and both device sections below pass; setting the flag does not itself prove QA. The staged revision is not copied into Pages `dist/`; remote R2 publication remains a separate, explicitly authorized step.

## Locked acceptance before observation

- Authoritative width: **82.7 cm**.
- Authoritative depth: **57.1 cm**.
- Mark both dimensions on a clear floor with tape or physical markers.
- Repeat placement and measurement from approximately **1 m** and **2 m** viewing distance.
- Width and depth must each be within **3 cm** of the markers. This tolerance must not be changed after observing results.

## Android — Scene Viewer

- [ ] Scene Viewer launches from revision `sheen-chair-r1`.
- [ ] The fetched asset is the canonical GLB with SHA256 `a38f20af9f527b1d1cef1220ce5d19489498f7b2cd0ca0ca6ea35f82b0cb8f22`.
- [ ] Floor contact is plausible at ~1 m and ~2 m.
- [ ] Width and depth are within the locked 3 cm tolerance at both distances.
- [ ] Pinch does not resize the chair.
- [ ] Orientation and materials are acceptable.

Result: **NOT RUN**.

## iOS — Quick Look

- [ ] Quick Look launches the prebuilt `model.usdz`, not an auto-generated file.
- [ ] The fetched USDZ SHA256 is `4b0bec120f9db100b888b7083a8e2d7873d7c2f56d5343b65eb4c8fc69330618`.
- [ ] Floor contact is plausible at ~1 m and ~2 m.
- [ ] Width and depth are within the locked 3 cm tolerance at both distances.
- [ ] Pinch does not resize the chair.
- [ ] Orientation is correct and materials acceptably match the canonical GLB.

Result: **NOT RUN — IOS MATERIAL QA PENDING**.
