# Конвертация 3D-лого из FBX в лёгкий GLB для сайта (Blender в фоне).
# Запуск:  /Applications/Blender.app/Contents/MacOS/Blender -b --python tools/fbx2glb.py -- "путь/к/модели.fbx"
# Результат: assets/logo.glb (упрощение до ~90k граней, сглаживание, сжатие Draco, без текстур:
# материал «тёмный хром» назначается на сайте).
import bpy, sys, os
argv = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
src = argv[0] if argv else "source/logo-3d/logo.fbx"
out = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), 'assets', 'logo.glb')
TARGET_FACES = 90000

bpy.ops.wm.read_factory_settings(use_empty=True)
ext = os.path.splitext(src)[1].lower()
if ext == '.fbx': bpy.ops.import_scene.fbx(filepath=src)
elif ext == '.obj': bpy.ops.wm.obj_import(filepath=src)
elif ext in ('.glb', '.gltf'): bpy.ops.import_scene.gltf(filepath=src)
else: raise SystemExit('unsupported: ' + ext)

meshes = [o for o in bpy.data.objects if o.type == 'MESH']
total = sum(len(o.data.polygons) for o in meshes)
ratio = min(1.0, TARGET_FACES / max(1, total))
bpy.ops.object.select_all(action='DESELECT')
for o in meshes:
    o.data.materials.clear()
    if ratio < 1.0:
        m = o.modifiers.new('dec', 'DECIMATE'); m.ratio = ratio
    o.select_set(True)
bpy.context.view_layer.objects.active = meshes[0]
bpy.ops.object.shade_smooth()
print('faces', total, '-> ratio', round(ratio, 3))

kw = dict(filepath=out, export_format='GLB', export_apply=True, export_materials='NONE', export_yup=True,
          export_texcoords=False, export_normals=True, export_skins=False, export_animations=False, export_morph=False,
          export_draco_mesh_compression_enable=True, export_draco_mesh_compression_level=6,
          export_draco_position_quantization=14, export_draco_normal_quantization=10)
try:
    bpy.ops.export_scene.gltf(**kw)
except TypeError as e:
    print('draco options not supported, exporting plain:', e)
    bpy.ops.export_scene.gltf(**{k: v for k, v in kw.items() if not k.startswith('export_draco')})
print('exported', out)
