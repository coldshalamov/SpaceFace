#!/usr/bin/env python3
"""Dependency-free checks for the Helios Blender surface-export contract."""
from __future__ import annotations

import ast
import json
import math
from pathlib import Path
import sys


ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from tools.blender.surface_export_contract import (  # noqa: E402
    assert_tangent_receipts,
    deterministic_mesh_data_name,
    measure_tangent_vectors,
)


def expect_failure(receipts: list[dict]) -> str:
    try:
        assert_tangent_receipts(receipts)
    except RuntimeError as error:
        return str(error)
    raise AssertionError("invalid tangent receipts did not fail closed")


def main() -> None:
    assert deterministic_mesh_data_name("LOD1 perimeter / cyan") == "LOD1_perimeter_cyan_Mesh"
    assert deterministic_mesh_data_name(".temp.001") == "temp.001_Mesh"
    assert deterministic_mesh_data_name("  ") == "Mesh_Mesh"

    valid = measure_tangent_vectors([(1.0, 0.0, 0.0), (0.0, -1.0, 0.0)])
    assert valid["valid"] and valid["invalid"] == 0
    empty = measure_tangent_vectors([])
    assert not empty["valid"] and empty["minLength"] is None and empty["maxLength"] is None
    invalid = measure_tangent_vectors([
        (0.0, 0.0, 0.0),
        (2.0, 0.0, 0.0),
        (math.nan, 0.0, 0.0),
    ])
    assert invalid == {
        "total": 3,
        "zero": 1,
        "nonFinite": 1,
        "nonUnit": 1,
        "invalid": 3,
        "minLength": 0.0,
        "maxLength": 2.0,
        "valid": False,
    }
    message = expect_failure([
        {"object": "Z_object", "meshData": ".temp.003", "tangentValidation": invalid},
        {"object": "A_object", "meshData": ".temp.001", "tangentValidation": invalid},
    ])
    assert message.index("A_object") < message.index("Z_object"), message
    assert "zero=1" in message and "nonFinite=1" in message and "nonUnit=1" in message

    remaster_path = ROOT / "tools/blender/remaster_m4_surface_roles.py"
    inspect_path = ROOT / "tools/blender/inspect_surface_roles.py"
    for path in (remaster_path, inspect_path):
        ast.parse(path.read_text(encoding="utf-8"), filename=str(path))
    remaster_source = remaster_path.read_text(encoding="utf-8")
    inspect_source = inspect_path.read_text(encoding="utf-8")
    for token in (
        "modifier_apply",
        "project_perimeter_uvs",
        "ensure_gltf_occlusion_binding",
        "assert_tangent_receipts",
        "deterministic_mesh_data_name",
    ):
        assert token in remaster_source, f"remaster pipeline is missing {token}"
    for token in ("meshDataName", "tangentStats", "ormBinding", "strict"):
        assert token in inspect_source, f"surface audit is missing {token}"

    print(json.dumps({
        "ok": True,
        "schema": "spaceface.heliosSurfaceExportContractCheck.v1",
        "validTangentFixture": valid,
        "emptyTangentFixture": empty,
        "invalidTangentFixture": invalid,
        "failureOrder": ["A_object", "Z_object"],
        "meshNaming": [
            deterministic_mesh_data_name("LOD1 perimeter / cyan"),
            deterministic_mesh_data_name(".temp.001"),
        ],
    }, indent=2))


if __name__ == "__main__":
    main()
