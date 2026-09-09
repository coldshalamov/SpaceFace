#!/usr/bin/env python3
"""Focused dependency-free contract check for the Helios golden station recipe."""
from __future__ import annotations

import ast
import importlib.util
import json
from pathlib import Path
import sys
import unittest


RECIPE_PATH = Path(__file__).with_name("golden_station_v4.py")


def load_recipe():
    spec = importlib.util.spec_from_file_location("spaceface_helios_golden_station_v4", RECIPE_PATH)
    if spec is None or spec.loader is None:
        raise RuntimeError(f"cannot import {RECIPE_PATH}")
    module = importlib.util.module_from_spec(spec)
    sys.modules[spec.name] = module
    spec.loader.exec_module(module)
    return module


class GoldenStationRecipeContractTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.module = load_recipe()
        cls.validation = cls.module.validate_recipe_contracts()

    def test_recipe_contract_is_complete(self):
        self.assertTrue(self.validation["ok"], self.validation["errors"])
        self.assertGreaterEqual(self.validation["assemblyCount"], 8)
        self.assertIn("missing docking wear/contact identity", self.validation["coveredAuditDefects"])
        self.assertIn("missing inhabited windows", self.validation["coveredAuditDefects"])
        self.assertIn("missing human-scale cues", self.validation["coveredAuditDefects"])

    def test_recipe_uses_only_existing_surface_foundry_roles(self):
        roles = set(self.validation["materialRoles"])
        self.assertEqual(set(), roles - set(self.module.MATERIAL_ALIASES))
        for role in roles:
            self.assertTrue(self.module.MATERIAL_ALIASES[role], role)
        self.assertTrue(self.module.REQUIRED_DISTINCT_PBR_ROLES <= roles)
        self.assertEqual("SF_CyanEmission", self.module.MATERIAL_ALIASES["accent"][0])
        self.assertEqual("SF_AmberEmission", self.module.MATERIAL_ALIASES["warm"][0])
        self.assertNotEqual(
            self.module.MATERIAL_ALIASES["accent"][0],
            self.module.MATERIAL_ALIASES["warm"][0],
        )

    def test_every_declared_builder_is_implemented(self):
        declared = {recipe.builder for recipe in self.module.ASSEMBLY_RECIPES}
        self.assertEqual(declared, set(self.module.BUILDERS))

    def test_lod_membership_is_ordered_and_physically_scaled(self):
        order = {name: index for index, name in enumerate(self.module.VALID_LODS)}
        for recipe in self.module.ASSEMBLY_RECIPES:
            indices = [order[name] for name in recipe.lods]
            self.assertEqual(indices, sorted(indices), recipe.id)
        safety = next(item for item in self.module.ASSEMBLY_RECIPES if item.id == "human_scale_safety")
        self.assertAlmostEqual(1.05, safety.parameters["rail_height_m"])
        access = next(item for item in self.module.ASSEMBLY_RECIPES if item.id == "maintenance_access")
        self.assertAlmostEqual(2.1, access.parameters["door_height_m"])

    def test_exact_donor_trim_blocker_has_complete_lod_zone_parity(self):
        names = self.module.DONOR_TRIM_EXPECTED_OBJECTS
        self.assertEqual(12, len(names))
        parsed = [self.module.DONOR_TRIM_OBJECT_PATTERN.fullmatch(name) for name in names]
        self.assertTrue(all(parsed))
        pairs = {(int(match.group("lod")), match.group("zone")) for match in parsed}
        expected = {
            (lod, zone)
            for lod in range(3)
            for zone in ("citadel", "docking", "habitat", "industrial")
        }
        self.assertEqual(expected, pairs)
        self.assertEqual("SF_QuaterniusTrim_CC0", self.module.DONOR_ROLE_BLOCKER["material"])

    def test_donor_rebind_is_reversible_and_reports_exact_face_counts(self):
        source = RECIPE_PATH.read_text(encoding="utf-8")
        self.assertIn("sf_golden_original_material_slots", source)
        self.assertIn("sf_golden_original_face_material_indices_zlib_u16", source)
        self.assertIn("donor trim mesh has {obj.data.users} users", source)
        self.assertIn("PREBOUND_DONOR_MATERIAL_BY_ZONE", source)
        self.assertIn("expected donor material in {sorted(allowed_sources)}", source)
        self.assertEqual(
            {"citadel", "docking", "habitat", "industrial"},
            set(self.module.PREBOUND_DONOR_MATERIAL_BY_ZONE),
        )
        self.assertIn('"faceCount": len(obj.data.polygons)', source)
        self.assertIn('"reboundFaceCounts": dict(sorted(face_counts.items()))', source)
        self.assertIn('"lodParity": {zone: ["lod0", "lod1", "lod2"]', source)

    def test_barrel_articulation_is_asymmetric_and_load_bearing(self):
        shell = next(item for item in self.module.ASSEMBLY_RECIPES if item.id == "shell_articulation")
        variants = shell.parameters["pad_module_variants"]
        self.assertEqual(("freight", "passenger", "maintenance", "utility"), variants)
        arcs = shell.parameters["tower_collar_arcs"]
        self.assertEqual(3, len(arcs))
        self.assertGreater(len(set(arcs)), 1)
        source = RECIPE_PATH.read_text(encoding="utf-8")
        self.assertIn("PadAxialSeam_", source)
        self.assertIn("PadLoadFoot_", source)
        self.assertIn("TowerServiceCollar_", source)

    def test_radiators_are_framed_mounted_and_grouped_by_thermal_zone(self):
        thermal = next(item for item in self.module.ASSEMBLY_RECIPES if item.id == "thermal_rejection")
        zones = thermal.parameters["thermal_zones"]
        self.assertEqual(4, len(zones))
        self.assertEqual({"habitation", "freight", "utilities"}, {zone["id"] for zone in zones})
        self.assertGreater(len({tuple(zone["fin_offsets_m"]) for zone in zones}), 1)
        source = RECIPE_PATH.read_text(encoding="utf-8")
        self.assertNotIn("RadiatorBack_", source)
        for token in ("RadiatorFrameSide_", "RadiatorFrameRail_", "RadiatorMount_", "RadiatorManifold_", "RadiatorFeed_"):
            self.assertIn(token, source)

    def test_signal_channels_are_physical_with_subordinate_emission(self):
        docking = next(item for item in self.module.ASSEMBLY_RECIPES if item.id == "docking_contact_system")
        self.assertEqual("service", docking.parameters["signal_housing_role"])
        self.assertEqual("accent", docking.parameters["signal_lamp_role"])
        self.assertLessEqual(docking.parameters["signal_lamps_per_arm"], 3)
        safety = next(item for item in self.module.ASSEMBLY_RECIPES if item.id == "human_scale_safety")
        self.assertNotIn("accent", safety.material_roles)
        self.assertNotIn("warm", safety.material_roles)
        self.assertLessEqual(self.module.MATERIAL_RESPONSE_GUIDANCE["accent"]["emissiveCoverageMax"], 0.08)
        source = RECIPE_PATH.read_text(encoding="utf-8")
        self.assertIn("SignalChannelHousing_", source)
        self.assertIn("SignalChannelLip_", source)
        self.assertIn("ShieldedGuideLamp_", source)

    def test_material_guidance_defines_mid_value_non_glow_hierarchy(self):
        guidance = self.module.MATERIAL_RESPONSE_GUIDANCE
        self.assertEqual(
            {"coated_structural", "armor", "armor_dark", "mechanical", "radiator", "docking", "service", "marking", "accent", "warm"},
            set(guidance),
        )
        self.assertGreaterEqual(guidance["service"]["baseColorLinearLuminance"][0], 0.16)
        self.assertGreaterEqual(guidance["coated_structural"]["roughness"][1] - guidance["coated_structural"]["roughness"][0], 0.20)
        self.assertIn("nonuniform", guidance["coated_structural"]["purpose"])
        self.assertIn("never a flat chocolate-brown tile", guidance["radiator"]["purpose"])
        self.assertLessEqual(guidance["marking"]["metallic"][1], 0.08)
        self.assertIn("non-emissive", guidance["marking"]["purpose"])

    def test_module_has_no_eager_blender_dependency_or_random_detail(self):
        tree = ast.parse(RECIPE_PATH.read_text(encoding="utf-8"))
        top_level_imports = set()
        for node in tree.body:
            if isinstance(node, ast.Import):
                top_level_imports.update(alias.name for alias in node.names)
            elif isinstance(node, ast.ImportFrom) and node.module:
                top_level_imports.add(node.module)
        self.assertNotIn("bpy", top_level_imports)
        self.assertNotIn("bmesh", top_level_imports)
        source = RECIPE_PATH.read_text(encoding="utf-8").lower()
        self.assertNotIn("import random", source)
        self.assertNotIn("uniform procedural", source)

    def test_idempotence_and_non_destructive_cli_contract_are_explicit(self):
        source = RECIPE_PATH.read_text(encoding="utf-8")
        self.assertIn("_remove_collection(bpy_module, COLLECTION_NAME)", source)
        self.assertIn("--output-blend must differ", source)
        self.assertNotIn("export_scene", source)

    def test_blender_cli_reports_success_after_artifacts_and_forces_failure_status(self):
        source = RECIPE_PATH.read_text(encoding="utf-8")
        save_index = source.index("bpy.ops.wm.save_as_mainfile")
        report_index = source.index("args.report.resolve().write_text")
        receipt_index = source.index('print(json.dumps({"ok": True')
        self.assertLess(save_index, report_index)
        self.assertLess(report_index, receipt_index)
        self.assertIn("traceback.print_exc()", source)
        self.assertIn("os._exit(1)", source)


if __name__ == "__main__":
    suite = unittest.defaultTestLoader.loadTestsFromTestCase(GoldenStationRecipeContractTest)
    result = unittest.TextTestRunner(verbosity=2).run(suite)
    summary = {
        "schema": "spaceface.heliosGoldenStationRecipeCheck.v1",
        "ok": result.wasSuccessful(),
        "testsRun": result.testsRun,
        "failures": len(result.failures),
        "errors": len(result.errors),
        "recipe": str(RECIPE_PATH),
    }
    print(json.dumps(summary, sort_keys=True))
    raise SystemExit(0 if result.wasSuccessful() else 1)
