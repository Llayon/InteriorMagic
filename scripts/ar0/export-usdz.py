import argparse
import json
import math
import sys
from pathlib import Path

import bpy
from mathutils import Vector


def parse_args():
    parser = argparse.ArgumentParser()
    parser.add_argument("--input", required=True)
    parser.add_argument("--output", required=True)
    parser.add_argument("--poster", required=True)
    parser.add_argument("--report", required=True)
    return parser.parse_args(sys.argv[sys.argv.index("--") + 1:])


def look_at(obj, target):
    obj.rotation_euler = (Vector(target) - obj.location).to_track_quat("-Z", "Y").to_euler()


def scene_bounds(objects):
    minimum = Vector((math.inf, math.inf, math.inf))
    maximum = Vector((-math.inf, -math.inf, -math.inf))
    mesh_count = 0
    for obj in objects:
        if obj.type != "MESH":
            continue
        mesh_count += 1
        for corner in obj.bound_box:
            point = obj.matrix_world @ Vector(corner)
            minimum.x = min(minimum.x, point.x)
            minimum.y = min(minimum.y, point.y)
            minimum.z = min(minimum.z, point.z)
            maximum.x = max(maximum.x, point.x)
            maximum.y = max(maximum.y, point.y)
            maximum.z = max(maximum.z, point.z)
    if not mesh_count or not all(math.isfinite(value) for value in (*minimum, *maximum)):
        raise RuntimeError("Imported GLB has no finite mesh geometry")
    return minimum, maximum, mesh_count


args = parse_args()
input_path = Path(args.input).resolve()
output_path = Path(args.output).resolve()
poster_path = Path(args.poster).resolve()
report_path = Path(args.report).resolve()
output_path.parent.mkdir(parents=True, exist_ok=True)
poster_path.parent.mkdir(parents=True, exist_ok=True)

bpy.ops.object.select_all(action="SELECT")
bpy.ops.object.delete(use_global=False)
bpy.context.scene.unit_settings.system = "METRIC"
bpy.context.scene.unit_settings.scale_length = 1.0
bpy.ops.import_scene.gltf(filepath=str(input_path))
model_objects = list(bpy.context.scene.objects)
minimum, maximum, mesh_count = scene_bounds(model_objects)
size = maximum - minimum
if min(size) <= 0:
    raise RuntimeError(f"Imported GLB has invalid bounds: {tuple(size)}")

bpy.ops.object.select_all(action="DESELECT")
for obj in model_objects:
    obj.select_set(True)

bpy.ops.wm.usd_export(
    filepath=str(output_path),
    selected_objects_only=True,
    export_animation=False,
    export_hair=False,
    export_uvmaps=True,
    export_mesh_colors=True,
    export_normals=True,
    export_materials=True,
    export_shapekeys=False,
    generate_preview_surface=True,
    generate_materialx_network=False,
    convert_orientation=True,
    export_global_forward_selection="Z",
    export_global_up_selection="Y",
    export_textures_mode="NEW",
    overwrite_textures=True,
    relative_paths=True,
    export_lights=False,
    export_cameras=False,
    export_volumes=False,
    usdz_downscale_size="KEEP",
    convert_scene_units="METERS",
    meters_per_unit=1.0,
)

# Poster-only camera and lights are added after export and therefore cannot
# become part of the immutable runtime model.
center = (minimum + maximum) * 0.5
radius = max(size) * 1.35
bpy.ops.object.camera_add(location=(center.x + radius, center.y - radius * 1.45, center.z + radius * 0.85))
camera = bpy.context.object
camera.data.lens = 58
look_at(camera, center)
bpy.context.scene.camera = camera

for location, energy, area_size in [
    ((center.x - radius, center.y - radius, center.z + radius * 1.7), 850, radius * 1.8),
    ((center.x + radius, center.y + radius * 0.5, center.z + radius), 450, radius * 1.4),
]:
    bpy.ops.object.light_add(type="AREA", location=location)
    light = bpy.context.object
    light.data.energy = energy
    light.data.shape = "DISK"
    light.data.size = area_size
    look_at(light, center)

scene = bpy.context.scene
scene.render.engine = "BLENDER_EEVEE"
scene.render.resolution_x = 512
scene.render.resolution_y = 512
scene.render.resolution_percentage = 100
scene.render.image_settings.file_format = "WEBP"
scene.render.image_settings.color_mode = "RGBA"
scene.render.image_settings.quality = 88
scene.render.film_transparent = True
scene.render.filepath = str(poster_path)
scene.world.color = (0.055, 0.05, 0.045)
bpy.ops.render.render(write_still=True)

materials = sorted({slot.material.name for obj in model_objects if obj.type == "MESH" for slot in obj.material_slots if slot.material})
report = {
    "schemaVersion": 1,
    "converter": {"name": "Blender", "version": bpy.app.version_string},
    "route": "canonical GLB -> Blender glTF import (meters) -> Blender USDZ export (meters, Y-up, +Z forward)",
    "input": str(input_path),
    "output": str(output_path),
    "importedBlenderBounds": {"min": list(minimum), "max": list(maximum), "size": list(size)},
    "meshCount": mesh_count,
    "materials": materials,
    "materialQa": "IOS_MATERIAL_QA_PENDING",
}
report_path.write_text(json.dumps(report, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
print(json.dumps(report, ensure_ascii=False, indent=2))
