import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const SOURCE_URL = new URL(
  '../tools/blender/remaster_opening_dock_interior_v2.py',
  import.meta.url,
);

async function source() {
  return readFile(SOURCE_URL, 'utf8');
}

test('H-04 dock builder is output-only and exposes the complete candidate CLI', async () => {
  const text = await source();

  for (const flag of ['--maps-root', '--output-blend', '--output-glb', '--report']) {
    assert.match(text, new RegExp(`parser\\.add_argument\\("${flag}"`));
  }
  assert.doesNotMatch(text, /parser\.add_argument\("--variant"/);
  assert.match(text, /def validate_output_only_paths\(/);
  assert.match(text, /must be a scratch\/candidate path/);
  assert.doesNotMatch(text, /copyfile|shutil\.copy|Copy-Item/);
  assert.doesNotMatch(text, /parts_manifest\.json|release_manifest\.json/);
});

test('H-04 form contract keeps the preview aperture open and parks structure at the rear', async () => {
  const text = await source();

  assert.match(text, /PORTAL_DEPTHS_M = \(16\.0,\)/);
  assert.match(text, /"deep_floor_rooted_portal_jamb"/);
  assert.match(text, /"deep_transverse_portal_header"/);
  assert.match(text, /"sparse_portal_knee_haunch"/);
  assert.match(text, /"full_depth_roof_edge_stringer"/);
  assert.match(text, /"depth_axis_overhead_crane_runway"/);
  assert.match(text, /\(1\.05, 32\.5, 0\.88\)/);
  assert.match(text, /CRANE_RUNWAY_X_M = 18\.0/);
  assert.match(text, /"transverse_traveling_crane_bridge"/);
  assert.match(text, /CRANE_PARK_DEPTH_M = 15\.5/);
  assert.match(text, /bridge_y = CRANE_PARK_DEPTH_M/);
  assert.match(text, /CRANE_APERTURE_GROUP = "rear_parked_crane_stack"/);
  assert.match(text, /tag_crane_stack\(component\)/);
  assert.match(text, /"rear_pressure_bulkhead_frame"/);
  assert.match(text, /"low_cutaway_service_plinth"/);
  assert.match(text, /CLEAR_APERTURE_M = \{/);
});

test('H-04 builder fails closed on any mesh in the aperture or crane stack outside rear parking', async () => {
  const text = await source();

  assert.match(text, /CLEAR_APERTURE_FLOOR_Z_M = -3\.40/);
  assert.match(text, /def world_aabb\(obj\) -> dict:/);
  assert.match(text, /def aabb_intersects_open_volume\(aabb: dict, minimum, maximum\) -> bool:/);
  assert.match(text, /def assert_clear_aperture\(\) -> dict:/);
  assert.match(text, /if not meshes:\s*\n\s*raise RuntimeError\("Clear-aperture preflight found no authored mesh objects"\)/);
  assert.match(text, /obstructions = \[/);
  assert.match(text, /missing_stack = \[/);
  assert.match(text, /unexpected_stack = sorted\(/);
  assert.match(text, /stack_not_rear_parked = \[/);
  assert.match(text, /"Dock clear-aperture preflight failed: "/);
  assert.match(
    text,
    /failures = apply_modifiers\(\)\s*\n\s*aperture_validation = assert_clear_aperture\(\)\s*\n\s*join_draw_groups\(/,
  );
  assert.match(text, /"clearAperturePreflight": aperture_validation/);
  assert.match(text, /"previewMount": PREVIEW_MOUNT_POLICY/);
  assert.match(text, /"floorLocalY": -3\.44/);
  assert.match(text, /"referenceShipSpan": 24\.08/);
  assert.match(text, /"maximumScale": 12\.5/);
  assert.match(text, /"width": 28\.0/);
  assert.match(text, /"depth": 28\.0/);
  assert.match(text, /"heightAboveFloor": 13\.0/);
});

test('H-04 builder restores the canonical dock identity, bounds and semantic markers', async () => {
  const text = await source();

  assert.match(text, /ASSET_ID = "place_dock_interior"/);
  assert.match(text, /"min": \(-26\.0, -18\.0, -4\.425\)/);
  assert.match(text, /"max": \(26\.0, 18\.0, 13\.0\)/);
  assert.match(text, /"size": \(52\.0, 36\.0, 17\.425\)/);
  assert.doesNotMatch(text, /add_empty\(\s*\n\s*"HOOK_Emissive"/);
  assert.match(text, /retained unsupported historical HOOK_Emissive/);
  assert.match(text, /"SOCKET_Structure_Core"/);
  assert.match(text, /"registration": "H-04 SHIPWORKS"/);
  assert.match(text, /"forward": "\+X"/);
  assert.match(text, /"mountAtOrigin": True/);
  assert.doesNotMatch(text, /"registration":\s*"MERIDIAN YARDS"/i);
  assert.doesNotMatch(text, /curve\.body\s*=\s*["']MERIDIAN YARDS["']/i);
});

test('preview GLB exports LOD0 only while the editable blend retains all three authored LODs', async () => {
  const text = await source();

  assert.match(text, /for lod in range\(3\):\s*\n\s*build_lod\(/);
  assert.match(text, /def export_lod0_glb\(/);
  assert.match(text, /is_descendant\(obj, lod0_root\)/);
  assert.match(text, /"authoringLods": \["lod0", "lod1", "lod2"\]/);
  assert.match(text, /"exportedLods": \["lod0"\]/);
  assert.match(text, /shipPreviewMount\.groupFromBlueprint instantiates every primitive/);
  assert.match(text, /accidentally contains non-selected LOD primitives/);
});

test('surface contract binds authored base color, tangent normal and packed ORM maps', async () => {
  const text = await source();

  for (const role of [
    'dock_painted_armor',
    'dock_structural_alloy',
    'dock_floor_plate',
    'dock_machinery',
    'dock_radiator',
    'dock_safety_surface',
    'dock_optic',
    'dock_worklight',
    'dock_identity_decal',
    'dock_rubber',
  ]) {
    assert.match(text, new RegExp(`"${role}"`));
  }
  assert.match(text, /f"\{role\}_basecolor\.png"/);
  assert.match(text, /f"\{role\}_normal\.png"/);
  assert.match(text, /f"\{role\}_orm\.png"/);
  assert.match(text, /"R=AO,G=Roughness,B=Metallic"/);
  assert.match(text, /"textureRoleMode": "bound-base-normal-orm"/);
  assert.match(text, /"deliverableRole": "production_single_lod_preview"/);
  assert.match(text, /"wiringStatus": "source_checkpoint_release_pending"/);
  assert.match(text, /H-04 surface manifest artifact set drifted/);
  assert.match(text, /H-04 surface artifact hash mismatch/);
  assert.match(text, /calc_tangents/);
  assert.match(text, /smart_project/);
});
