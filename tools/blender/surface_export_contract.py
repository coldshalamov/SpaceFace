"""Pure helpers shared by Blender surface export and inspection tools.

The module intentionally has no ``bpy`` dependency so its determinism and failure
semantics can be checked without launching Blender.
"""
from __future__ import annotations

import math
import re
from typing import Iterable, Mapping, Sequence


TANGENT_ZERO_EPSILON = 1.0e-6
TANGENT_UNIT_TOLERANCE = 1.0e-3


def deterministic_mesh_data_name(object_name: str) -> str:
    """Return a stable, exporter-safe mesh datablock name derived from an object."""
    stem = re.sub(r"[^A-Za-z0-9_.-]+", "_", str(object_name)).strip("._")
    return f"{stem or 'Mesh'}_Mesh"


def measure_tangent_vectors(
    vectors: Iterable[Sequence[float]],
    *,
    zero_epsilon: float = TANGENT_ZERO_EPSILON,
    unit_tolerance: float = TANGENT_UNIT_TOLERANCE,
) -> dict[str, int | float | bool | None]:
    """Measure actual XYZ tangent lengths rather than trusting calc_tangents success."""
    total = 0
    zero = 0
    non_finite = 0
    non_unit = 0
    minimum = math.inf
    maximum = -math.inf
    for vector in vectors:
        total += 1
        try:
            x, y, z = (float(vector[index]) for index in range(3))
        except (IndexError, TypeError, ValueError) as error:
            raise ValueError(f"tangent {total - 1} is not a three-component vector") from error
        length = math.sqrt(x * x + y * y + z * z)
        if not math.isfinite(length):
            non_finite += 1
            continue
        minimum = min(minimum, length)
        maximum = max(maximum, length)
        if length <= zero_epsilon:
            zero += 1
        elif abs(length - 1.0) > unit_tolerance:
            non_unit += 1
    invalid = zero + non_finite + non_unit
    return {
        "total": total,
        "zero": zero,
        "nonFinite": non_finite,
        "nonUnit": non_unit,
        "invalid": invalid,
        "minLength": None if total == 0 or minimum == math.inf else minimum,
        "maxLength": None if total == 0 or maximum == -math.inf else maximum,
        "valid": total > 0 and invalid == 0,
    }


def tangent_failure_message(object_name: str, mesh_data_name: str, metrics: Mapping[str, object]) -> str:
    """Produce a stable error string suitable for CI logs and Blender batch runs."""
    return (
        f"{object_name} [{mesh_data_name}]: invalid loop tangents "
        f"(total={int(metrics.get('total', 0))}, zero={int(metrics.get('zero', 0))}, "
        f"nonFinite={int(metrics.get('nonFinite', 0))}, nonUnit={int(metrics.get('nonUnit', 0))})"
    )


def assert_tangent_receipts(receipts: Iterable[Mapping[str, object]]) -> None:
    """Fail once with all invalid objects sorted by object and mesh name."""
    failures = []
    for receipt in receipts:
        metrics = receipt.get("tangentValidation")
        if metrics is None or bool(metrics.get("valid")):
            continue
        failures.append((
            str(receipt.get("object", "<unknown>")),
            str(receipt.get("meshData", "<unknown>")),
            metrics,
        ))
    if not failures:
        return
    lines = [
        tangent_failure_message(object_name, mesh_name, metrics)
        for object_name, mesh_name, metrics in sorted(failures, key=lambda item: (item[0], item[1]))
    ]
    raise RuntimeError("surface export tangent validation failed:\n" + "\n".join(lines))
