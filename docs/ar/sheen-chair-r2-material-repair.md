# Sheen Chair r2 — iOS material repair

Physical iPhone Safari QA of immutable `sheen-chair-r1` confirmed that Quick Look launched and displayed the correct geometry, but rendered the upholstered parts white.

## Root cause

The canonical glTF material multiplies a neutral fabric texture by the Mango base-color factor `[0.883, 0.035, 0, 1]`. Blender imports that operation as a `Mix` node. The r1 USDZ connected the neutral texture to `UsdPreviewSurface.diffuseColor`, but did not serialize the Mango multiplier. Apple Quick Look therefore received an almost white base texture.

## Bounded repair

`sheen-chair-r2` keeps the exact r1 canonical GLB and physical dimensions. During the USDZ-only conversion, the known glTF base-color factors are multiplied into copies of the affected texture pixels. The baked sRGB texture is then connected directly to the Principled base color before Blender exports `UsdPreviewSurface`. The unsupported fabric sheen input is removed while the normal map remains connected.

The validator requires the r2 Mango material to resolve to the packaged `fabric_Mystere_Mango_Velvet_quick_look_r2.png` sRGB texture. It also preserves the existing meter, Y-up, dependency and dimension checks.

## Immutable identity

- Revision: `sheen-chair-r2`
- Prefix: `ar0/sheen-chair/r2/`
- Canonical GLB SHA256: `a38f20af9f527b1d1cef1220ce5d19489498f7b2cd0ca0ca6ea35f82b0cb8f22`
- USDZ SHA256: `ad1e36abcf95b44f1de5494c4104ad9b28200b9b0e83862df798e7377e5254cb`
- USDZ bytes: `5,157,083`
- Poster SHA256: `0b0a1db85b90a152787b89c5c1526559b3d63a12aa78310e1686bf36888b5da4`

`r1` remains immutable and addressable for audit/backward compatibility. The catalog resolves Sheen Chair to `r2`.

Native iPhone material fidelity remains a physical QA gate and cannot be proven by Chromium or Windows Blender rendering.
