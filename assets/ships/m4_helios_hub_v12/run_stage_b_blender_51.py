"""Blender 5.1 compatibility entrypoint for the reproducible V12 Stage-B build."""
from pathlib import Path

target = Path(__file__).resolve().with_name("build_helios_v12_stage_b.py")
source = target.read_text(encoding="utf-8").replace("BLENDER_EEVEE_NEXT", "BLENDER_EEVEE")
source = source.replace(
    'source = BASE.read_text(encoding="utf-8")',
    'source = BASE.read_text(encoding="utf-8").replace("BLENDER_EEVEE_NEXT", "BLENDER_EEVEE")',
)
namespace = {"__file__": str(target), "__name__": "__main__"}
exec(compile(source, str(target), "exec"), namespace)
