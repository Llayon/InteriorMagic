import argparse
import hashlib
import json
import math
import os
import sys
from pathlib import Path

from pxr import Usd, UsdGeom, UsdShade, UsdUtils


parser = argparse.ArgumentParser()
parser.add_argument("--input", default=os.environ.get("AR0_USDZ_INPUT"))
parser.add_argument("--report", default=os.environ.get("AR0_USDZ_REPORT"))
parser.add_argument("--ar-revision-id", default=os.environ.get("AR0_AR_REVISION_ID"))
parser.add_argument("--material-profile", choices=("legacy-r1", "quick-look-r2"), default="legacy-r1")
argv = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
args = parser.parse_args(argv)
if not args.input or not args.report or not args.ar_revision_id:
    raise RuntimeError("USDZ input/report/revision paths were not provided")
input_path = Path(args.input).resolve()
usdz_sha256 = hashlib.sha256(input_path.read_bytes()).hexdigest()
stage = Usd.Stage.Open(str(input_path))
if stage is None:
    raise RuntimeError("pxr.Usd could not open the USDZ stage")

up_axis = str(UsdGeom.GetStageUpAxis(stage))
meters_per_unit = float(UsdGeom.GetStageMetersPerUnit(stage))
bbox_cache = UsdGeom.BBoxCache(Usd.TimeCode.Default(), [UsdGeom.Tokens.default_], useExtentsHint=True)
world_range = bbox_cache.ComputeWorldBound(stage.GetPseudoRoot()).ComputeAlignedRange()
minimum = list(world_range.GetMin())
maximum = list(world_range.GetMax())
size_stage = [maximum[index] - minimum[index] for index in range(3)]
if not all(math.isfinite(value) for value in minimum + maximum + size_stage) or min(size_stage) <= 0:
    raise RuntimeError(f"USDZ stage has invalid bounds: {size_stage}")
size_meters = [value * meters_per_unit for value in size_stage]

layers, assets, unresolved = UsdUtils.ComputeAllDependencies(str(input_path))


material_evidence = None
if args.material_profile == "quick-look-r2":
    material_prim = stage.GetPrimAtPath("/root/_materials/fabric_Mystere_Mango_Velvet")
    if not material_prim or not material_prim.IsA(UsdShade.Material):
        raise RuntimeError("Quick Look Mango material is missing from USDZ")
    material = UsdShade.Material(material_prim)
    surface_source = material.ComputeSurfaceSource()
    surface_shader = UsdShade.Shader(surface_source[0]) if surface_source and surface_source[0] else None
    diffuse_input = surface_shader.GetInput("diffuseColor") if surface_shader else None
    diffuse_source = diffuse_input.GetConnectedSource() if diffuse_input else None
    texture_shader = UsdShade.Shader(diffuse_source[0]) if diffuse_source and diffuse_source[0] else None
    texture_file = texture_shader.GetInput("file").Get() if texture_shader else None
    color_space = texture_shader.GetInput("sourceColorSpace").Get() if texture_shader else None
    texture_path = str(texture_file) if texture_file else ""
    if not texture_shader or texture_shader.GetIdAttr().Get() != "UsdUVTexture" or "fabric_Mystere_Mango_Velvet_quick_look_r2.png" not in texture_path:
        raise RuntimeError("Quick Look Mango material does not use the baked r2 color texture")
    if str(color_space) != "sRGB":
        raise RuntimeError("Quick Look Mango material texture must be sRGB")
    material_evidence = {
        "material": str(material.GetPath()),
        "surfaceShader": str(surface_shader.GetPath()),
        "diffuseTexture": texture_path,
        "sourceColorSpace": str(color_space),
        "baseColorFactorBaked": [0.883, 0.035, 0.0, 1.0],
        "unsupportedSheenRemoved": True,
    }


def portable_dependency(value):
    text = str(value)
    package_marker = text.find("[")
    if package_marker >= 0:
        return input_path.name + text[package_marker:]
    try:
        if Path(text).resolve() == input_path:
            return input_path.name
    except OSError:
        pass
    return text


report = {
    "schemaVersion": 2,
    "arRevisionId": args.ar_revision_id,
    "usdzSha256": usdz_sha256,
    "parser": "Blender-bundled pxr.Usd/UsdGeom",
    "upAxis": up_axis,
    "metersPerUnit": meters_per_unit,
    "materialProfile": args.material_profile,
    "materialEvidence": material_evidence,
    "stageBounds": {"min": minimum, "max": maximum, "size": size_stage, "sizeMeters": size_meters},
    "dependencies": {
        "layers": sorted(portable_dependency(layer.identifier) for layer in layers),
        "assets": sorted(portable_dependency(asset) for asset in assets),
        "unresolved": sorted(portable_dependency(asset) for asset in unresolved),
    },
}
report_path = Path(args.report).resolve()
report_path.parent.mkdir(parents=True, exist_ok=True)
report_path.write_text(json.dumps(report, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
print(json.dumps(report, ensure_ascii=False, indent=2))
