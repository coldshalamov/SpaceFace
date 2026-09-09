"""Static safety/recipe check for the non-destructive Rock A golden geology builder."""
from __future__ import annotations

import ast
import io
import json
from pathlib import Path
import sys
import traceback
from types import SimpleNamespace


ROOT = Path(__file__).resolve().parents[1]
TARGET = ROOT / "assets" / "ships" / "m4_helios_hub" / "scripts" / "golden_geology_v3.py"


def fail(message: str) -> None:
    raise AssertionError(message)


def literal_assignment(tree: ast.AST, name: str):
    for node in ast.walk(tree):
        if not isinstance(node, (ast.Assign, ast.AnnAssign)):
            continue
        targets = node.targets if isinstance(node, ast.Assign) else [node.target]
        if any(isinstance(target, ast.Name) and target.id == name for target in targets):
            value = node.value
            try:
                return ast.literal_eval(value)
            except (ValueError, TypeError):
                return value
    fail(f"missing assignment: {name}")


def call_name(node: ast.Call) -> str:
    parts: list[str] = []
    cursor = node.func
    while isinstance(cursor, ast.Attribute):
        parts.append(cursor.attr)
        cursor = cursor.value
    if isinstance(cursor, ast.Name):
        parts.append(cursor.id)
    return ".".join(reversed(parts))


def main() -> int:
    source = TARGET.read_text(encoding="utf-8")
    tree = ast.parse(source, filename=str(TARGET))
    functions = {node.name for node in tree.body if isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef))}
    required_functions = {
        "validate_paths", "find_targets", "subdivide_once", "deform_geology",
        "derive_role_textures", "assign_material_roles", "create_ferrite_inclusions",
        "update_collision", "geometry_fingerprint", "export_glb", "_verify_success_artifacts",
        "_flush_streams", "blender_cli_entry", "main",
    }
    missing_functions = sorted(required_functions - functions)
    if missing_functions:
        fail(f"missing recipe functions: {missing_functions}")

    if literal_assignment(tree, "RECIPE_ID") != "helios-rock-a-golden-geology-v3":
        fail("recipe identity drift")
    if literal_assignment(tree, "SOURCE_ASSET_ID") != "place_asteroid_rock_a":
        fail("builder no longer targets the live representative asteroid")
    if literal_assignment(tree, "ROOT_NAME") != "SF_M4_HELIOS_ROCK_A_ROOT":
        fail("canonical authoring root drift")
    seed = literal_assignment(tree, "SEED")
    if not isinstance(seed, int):
        fail("deterministic integer seed missing")

    # Safety is behavioral in the Blender script, but these static checks prevent accidental removal
    # of the fail-closed boundaries before the heavier authoring command is ever launched.
    required_safety_tokens = (
        'PACKET_ROOT / "candidates" / "golden_geology_v3"',
        'ROOT / "assets" / "ships" / "parts"',
        'ROOT / "assets" / "ships" / "release"',
        'ROOT / "assets" / "ships" / "release.__building"',
        "if RELEASE_LOCK.exists()",
        "bpy.ops.wm.open_mainfile",
        'promotion": "candidate_requires_normal_route_visual_acceptance"',
        'except BaseException as exc:',
        "traceback.print_exc(file=sys.stderr)",
        "os._exit(1)",
    )
    missing_tokens = [token for token in required_safety_tokens if token not in source]
    if missing_tokens:
        fail(f"non-destructive safety boundary missing: {missing_tokens}")

    calls = [call_name(node) for node in ast.walk(tree) if isinstance(node, ast.Call)]
    forbidden_ambient_random = {"random.random", "random.uniform", "random.randrange", "random.choice"}
    bad_random = sorted(set(calls) & forbidden_ambient_random)
    if bad_random:
        fail(f"ambient nondeterministic randomness used: {bad_random}")
    if "random.Random" not in calls:
        fail("seeded local RNG is required for mineral placement")

    # The visual recipe must contain at least one material dictionary, multiple oriented structures,
    # explicit face-role assignment, packed ORM derivation, and collision regeneration. Exact counts
    # and artistic slider values remain Blender/game-camera review decisions rather than test policy.
    semantic_assignment = literal_assignment(tree, "SEMANTIC_MATERIALS")
    if not isinstance(semantic_assignment, ast.Dict) or len(semantic_assignment.keys) < 4:
        fail("semantic geology roles were collapsed")
    fracture_assignment = literal_assignment(tree, "FRACTURES")
    if not isinstance(fracture_assignment, ast.Tuple) or len(fracture_assignment.elts) < 2:
        fail("oriented fracture system was collapsed")
    for token in (
        "Asteroid_Geology_Matrix", "Asteroid_Fracture_Wall", "Asteroid_Regolith_Matrix",
        "Asteroid_Ore_Matrix_Ferrite", "roughnessStd", "normal_strength", "materialEmissionAllowed",
        "collisionBoundsRegenerated", "mining/drilling interaction proof",
    ):
        if token not in source:
            fail(f"missing recipe contract token: {token}")

    # Prove the success ordering from the actual target AST: save/export, atomic report write, report
    # replacement, independent reread/hash verification, return to guard, then stdout receipt.
    function_nodes = {
        node.name: node for node in tree.body if isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef))
    }

    def calls_in(function_name: str) -> list[tuple[str, int]]:
        return [
            (call_name(node), node.lineno)
            for node in ast.walk(function_nodes[function_name])
            if isinstance(node, ast.Call)
        ]

    main_calls = calls_in("main")
    main_line = {name: min(line for candidate, line in main_calls if candidate == name) for name in (
        "bpy.ops.wm.save_as_mainfile", "export_glb", "report_temp.write_text",
        "report_temp.replace", "_verify_success_artifacts",
    )}
    if not (
        main_line["bpy.ops.wm.save_as_mainfile"]
        < main_line["export_glb"]
        < main_line["report_temp.write_text"]
        < main_line["report_temp.replace"]
        < main_line["_verify_success_artifacts"]
    ):
        fail(f"candidate/report verification ordering regressed: {main_line}")
    entry_calls = calls_in("blender_cli_entry")
    entry_line = {name: min(line for candidate, line in entry_calls if candidate == name) for name in (
        "main", "sys.stdout.write", "traceback.print_exc", "os._exit",
    )}
    if not entry_line["main"] < entry_line["sys.stdout.write"]:
        fail("success receipt can be printed before main artifact verification returns")

    entry = function_nodes["blender_cli_entry"]
    handlers = [node for node in ast.walk(entry) if isinstance(node, ast.ExceptHandler)]
    base_handler = next((handler for handler in handlers if isinstance(handler.type, ast.Name)
                         and handler.type.id == "BaseException"), None)
    if base_handler is None:
        fail("Blender CLI boundary does not catch BaseException")
    exit_calls = [node for node in ast.walk(base_handler) if isinstance(node, ast.Call)
                  and call_name(node) == "os._exit"]
    if len(exit_calls) != 1 or not exit_calls[0].args or ast.literal_eval(exit_calls[0].args[0]) != 1:
        fail("Blender CLI failure boundary does not force process exit 1")

    # Execute the target guard itself without importing bpy. A sentinel failure must emit a
    # traceback, emit no success receipt, flush, and call the injected process-exit boundary with 1.
    guard_module = ast.Module(
        body=[function_nodes["_flush_streams"], function_nodes["blender_cli_entry"]],
        type_ignores=[],
    )
    ast.fix_missing_locations(guard_module)

    class ForcedExit(BaseException):
        def __init__(self, code: int):
            self.code = code

    stdout = io.StringIO()
    stderr = io.StringIO()

    def fail_main():
        raise RuntimeError("GEO_V3_FORCED_FAILURE_PROBE")

    def force_exit(code: int):
        raise ForcedExit(code)

    namespace = {
        "main": fail_main,
        "json": json,
        "os": SimpleNamespace(_exit=force_exit),
        "sys": SimpleNamespace(stdout=stdout, stderr=stderr),
        "traceback": traceback,
        "RECIPE_ID": "helios-rock-a-golden-geology-v3",
    }
    exec(compile(guard_module, str(TARGET), "exec"), namespace)
    try:
        namespace["blender_cli_entry"]()
        fail("forced failure probe returned instead of exiting nonzero")
    except ForcedExit as exc:
        if exc.code != 1:
            fail(f"forced failure probe used status {exc.code}, expected 1")
    if "Traceback" not in stderr.getvalue() or "GEO_V3_FORCED_FAILURE_PROBE" not in stderr.getvalue():
        fail("forced failure probe did not flush its actionable traceback")
    if '"ok": true' in stdout.getvalue().lower():
        fail("forced failure probe emitted a false success receipt")

    print("PASS golden geology v3: deterministic recipe, semantic PBR roles, safe candidate outputs")
    return 0


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except Exception as exc:
        print(f"FAIL golden geology v3: {exc}", file=sys.stderr)
        raise
