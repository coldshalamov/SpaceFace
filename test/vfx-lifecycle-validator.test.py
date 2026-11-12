import importlib.util
from pathlib import Path
import sys
import unittest


ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "scripts"))
SPEC = importlib.util.spec_from_file_location(
    "vfx_lifecycle", ROOT / "scripts" / "capture-vfx-field-lifecycle.py")
MODULE = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(MODULE)


def release_row(pixels=120, light=60):
    route = {"motion": {"changed": 200, "changedFraction": 0.2},
             "frozenControl": {"changed": 0}, "noDescriptorUploads": True}
    return {"kind": "seed", "empty": route, "contact": route, "flash": route,
            "reduced": {"motion": {"changed": 0}}, "birthPixels": 0,
            "earlyPixels": 10, "sustainPixels": 200, "releasePixels": 100,
            "dissipatingPixels": pixels, "releaseLight": 100,
            "dissipatingLight": light,
            "quietStats": {"stats": {"surfaces": 0}, "instances": []},
            "shader": [{"runnable": True}]}


class ReleaseValidation(unittest.TestCase):
    def test_separating_fragments_can_cover_more_pixels_while_cooling(self):
        self.assertEqual(MODULE.check_row(release_row()), [])

    def test_smaller_but_brighter_release_is_rejected(self):
        self.assertTrue(MODULE.check_row(release_row(pixels=50, light=110)))

    def test_motionless_brightness_is_not_a_cooling_release(self):
        self.assertTrue(MODULE.check_row(release_row(light=100)))

    def test_instant_disappearance_is_rejected(self):
        self.assertTrue(MODULE.check_row(release_row(pixels=0, light=0)))


if __name__ == "__main__":
    unittest.main()
