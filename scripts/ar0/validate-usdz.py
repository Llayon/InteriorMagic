import argparse
import json
import math
import os
import sys
from pathlib import Path

from pxr import Usd, UsdGeom, UsdUtils


parser = argparse.ArgumentParser()
parser.add_argument("--input", default=os.environ.get("AR0_USDZ_INPUT"))
parser.add_argument("--report", default=os.environ.get("AR0_USDZ_REPORT"))
argv = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
args = parser.parse_args(argv)
if not args.input or not args.report:
    raise RuntimeError("USDZ input/report paths were not provided")
input_path = Path(args.input).resolve()
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
report = {
    "schemaVersion": 1,
    "parser": "Blender-bundled pxr.Usd/UsdGeom",
    "upAxis": up_axis,
    "metersPerUnit": meters_per_unit,
    "stageBounds": {"min": minimum, "max": maximum, "size": size_stage, "sizeMeters": size_meters},
    "dependencies": {
        "layers": sorted(str(layer.identifier) for layer in layers),
        "assets": sorted(str(asset) for asset in assets),
        "unresolved": sorted(str(asset) for asset in unresolved),
    },
}
Path(args.report).resolve().write_text(json.dumps(report, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
print(json.dumps(report, ensure_ascii=False, indent=2))
