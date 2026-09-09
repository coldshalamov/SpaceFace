"""run_variants.py — Lane F headless entry that builds all 8 variant GLBs.

Invokes the three family builders in sequence. Each builder imports its donor,
adds VAR_<TREATMENT>_<what> macro construction per FACTION_SURFACE_LANGUAGE.md,
and exports the full variant (donor + additions) as a GLB.

Headless:
  blender -b --factory-startup -P tools/foundry/variants/run_variants.py
"""
from __future__ import annotations

import os
import sys

_HERE = os.path.dirname(os.path.abspath(__file__))
if _HERE not in sys.path:
    sys.path.insert(0, _HERE)

import build_span_variants    as span    # noqa: E402
import build_rig_variants     as rig     # noqa: E402
import build_cannon_variants  as cannon  # noqa: E402


def main():
    os.makedirs(span.OUT_DIR, exist_ok=True)
    print("=== Lane F: building 3 helios_span variants ===")
    for name in span.TREATMENTS:
        span.build_variant(name, span.OUT_DIR)
    print("=== Lane F: building 2 ashline_rig variants ===")
    for name in rig.TREATMENTS:
        rig.build_variant(name, rig.OUT_DIR)
    print("=== Lane F: building 3 weapon_pulse_cannon variants ===")
    for name in cannon.TREATMENTS:
        cannon.build_variant(name, cannon.OUT_DIR)
    print("RUN_VARIANTS_DONE")


if __name__ == "__main__":
    main()
