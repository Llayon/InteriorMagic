import argparse
import json
import math
import sys
from pathlib import Path

import bpy
import numpy as np
from mathutils import Vector


def parse_args():
    parser = argparse.ArgumentParser()
    parser.add_argument("--input", required=True)
    parser.add_argument("--output", required=True)
    parser.add_argument("--poster", required=True)
    parser.add_argument("--report", required=True)
    parser.add_argument("--material-profile", choices=("legacy-r1", "quick-look-r2"), default="legacy-r1")
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


QUICK_LOOK_BASE_COLOR_FACTORS = {
    "fabric Mystere Mango Velvet": (0.883, 0.035, 0.0, 1.0),
    "fabric Mystere Peacock Velvet": (0.0, 0.094, 0.099, 1.0),
    "wood Brown": (0.14, 0.07, 0.01, 1.0),
    "wood Black": (0.036, 0.036, 0.036, 1.0),
}


def find_upstream_color_texture(socket, visited=None):
    visited = visited or set()
    for link in socket.links:
        node = link.from_node
        if node in visited:
            continue
        visited.add(node)
        if node.bl_idname == "ShaderNodeTexImage" and node.image:
            color_space = node.image.colorspace_settings.name.casefold()
            if "non-color" not in color_space and "raw" not in color_space:
                return node
        for node_input in node.inputs:
            texture = find_upstream_color_texture(node_input, visited)
            if texture:
                return texture
    return None


def apply_quick_look_material_profile(output_directory):
    baked = []
    for material_name, factor in QUICK_LOOK_BASE_COLOR_FACTORS.items():
        material = bpy.data.materials.get(material_name)
        if not material or not material.node_tree:
            continue
        principled = next((node for node in material.node_tree.nodes if node.bl_idname == "ShaderNodeBsdfPrincipled"), None)
        if not principled:
            raise RuntimeError(f"Quick Look material has no Principled BSDF: {material_name}")
        base_color = principled.inputs.get("Base Color")
        texture_node = find_upstream_color_texture(base_color)
        if not texture_node:
            raise RuntimeError(f"Quick Look material has no upstream color texture: {material_name}")

        source_image = texture_node.image
        width, height = source_image.size
        if width <= 0 or height <= 0:
            raise RuntimeError(f"Quick Look source texture has invalid dimensions: {material_name}")
        pixels = np.empty(width * height * 4, dtype=np.float32)
        source_image.pixels.foreach_get(pixels)
        pixels[0::4] *= factor[0]
        pixels[1::4] *= factor[1]
        pixels[2::4] *= factor[2]
        pixels[3::4] *= factor[3]

        safe_name = material_name.replace(" ", "_")
        baked_image = bpy.data.images.new(f"{safe_name}_quick_look_r2", width=width, height=height, alpha=True)
        baked_image.colorspace_settings.name = "sRGB"
        baked_image.pixels.foreach_set(pixels)
        baked_image.file_format = "PNG"
        baked_image.filepath_raw = str(output_directory / f"{safe_name}_quick_look_r2.png")
        baked_image.save()
        texture_node.image = baked_image

        for link in list(base_color.links):
            material.node_tree.links.remove(link)
        material.node_tree.links.new(texture_node.outputs["Color"], base_color)
        sheen_weight = principled.inputs.get("Sheen Weight")
        if sheen_weight:
            sheen_weight.default_value = 0.0
        baked.append({
            "material": material_name,
            "baseColorFactor": list(factor),
            "sourceImage": source_image.name,
            "bakedImage": baked_image.name,
            "dimensions": [width, height],
        })

    required = {"fabric Mystere Mango Velvet", "wood Brown"}
    actual = {entry["material"] for entry in baked}
    if not required.issubset(actual):
        raise RuntimeError(f"Required Quick Look materials were not baked: {sorted(required - actual)}")
    return baked


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
material_bakes = apply_quick_look_material_profile(output_path.parent) if args.material_profile == "quick-look-r2" else []

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
    "materialProfile": args.material_profile,
    "materialBakes": material_bakes,
    "materialQa": "IOS_MATERIAL_QA_PENDING" if args.material_profile == "legacy-r1" else "QUICK_LOOK_SAFE_BAKED_BASE_COLOR_PHYSICAL_QA_PENDING",
}
report_path.write_text(json.dumps(report, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
print(json.dumps(report, ensure_ascii=False, indent=2))
