# Ashline V2 material-truth component references

Date: 2026-07-28
Disposition: **reference-only; generated pixels are not shipped textures or evidence**

These images isolate one component at a time so Blender construction is directed by fictional
manufacturing logic rather than by whichever primitive is fastest to add. They do not authorize a
new hull, do not replace the Quaternius donor, and are not physically authoritative PBR maps.

| Artifact | SHA-256 | Decision |
|---|---|---|
| `dart_twin_drive_component_reference.png` | `7F1F1F682250CD6566777E60D4F445356E412056A52E9005A0A04D5169C33C47` | Selected for faceted pressure cases, stepped hot sections, segmented clamps, recessed throats, and visible mounts |
| `dart_forward_pulse_projector_reference.png` | `B6F7D7E9EDC2DD6AF13311EE3EEDED8A3AD271058C658A4414DB4DE2D9771F16` | Selected for a compact fixed pulse-laser projector with cooling jacket, gimbal saddle, cable/flex service, and a recessed refractory aperture |
| `rejected/dart_forward_coilgun_reference_rejected.png` | `02044DBABAB8A5E209023E92B90E7E304A3B7E3D082C0568F5F669FC3855B231` | Rejected because a recoil/accelerator assembly contradicts the Dart's authoritative `wpn_pulse_laser_s` loadout |

## Generation briefs

The twin-drive brief requested a compact used frontier interceptor drive assembly: welded
chrome-moly outer cases, nickel-superalloy hot sections, ceramic throats, gimbal clevises, feed
lines, clamp segments, service fasteners, and believable repair history, isolated without a ship.

The accepted weapon brief requested a small fixed pulse-laser projector rather than a gun barrel:
nitrided-steel protective structure, nickel-alloy cooling jacket, refractory ceramic collimator,
root saddle, power/coolant connections, shutter details, and no ammo feed or recoil mechanism.

The rejected brief explored the wrong weapon class. It is retained to make the correction auditable
and to prevent that visual language from being reintroduced accidentally.

## Translation rule

The deterministic Blender builder may borrow construction logic, material boundaries, and service
access from these sheets. It must not trace their silhouette blindly, wrap them onto geometry, or
claim visual acceptance from them. Current evidence must be rendered from the exact generated
`.blend`/source-GLB epoch and bound through `evidenceEpoch`.
