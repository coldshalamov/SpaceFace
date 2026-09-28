"""pod_cargo_container — the ordinary tow can, Forge rebuild (GFX-9, same pods/ slot).

The generic freight can every non-rescue payload on the default route wears
(visualOverrides' GENERIC_TOW_PACKAGED_PROP path). ISO container language shared with the 47-A
evidence can: corrugated shell, corner blocks, door face with latches and hinges — but plain
freight: an oxide-drab shell, a single freight band, an ID plate. No custody tells.

Contract: the packaged-prop path instantiates the LOD0 primitives and fits them to the entity
envelope, and contract pod mounts hang the body from a socket — so the origin stays where the
PQ-era file put it: just forward of the door end, floor-standing.
"""
import os
import sys

sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), '..'))
import forge as F  # noqa: E402

SHIP_ID = 'pod_cargo_container'
COLORS = {
    'paint': '#5a5348',          # faded oxide-drab freight shell
    'stripe': '#8a7418',         # mid-value freight band
    'gunmetal': '#4a5058',
    'dark': '#16191d',
}


def build():
    F.reset_scene()
    s = F.Ship(SHIP_ID, COLORS)

    # --- ISO can shell, floor-standing, door on the -X end (origin just forward of it) ----------
    F.box(s, 'Shell', (2.10, 0.0, 1.06), (5.05, 2.88, 2.12), material='paint', bevel=0.045)
    F.box(s, 'RoofLid', (2.10, 0.0, 2.16), (4.92, 2.72, 0.10), material='paint', bevel=0.02)
    for i in range(8):
        x = 0.18 + i * (4.55 / 7)
        F.box(s, f'Rib{i}', (x, 1.46, 1.02), (0.16, 0.08, 1.85), material='paint', bevel=0.008)
        F.box(s, f'RibM{i}', (x, -1.46, 1.02), (0.16, 0.08, 1.85), material='paint', bevel=0.008)
    for x in (-0.32, 4.58):
        for y in (-1.38, 1.38):
            for z in (0.10, 2.02):
                F.box(s, f'Iso{x}_{y}_{z}', (x, y, z), (0.24, 0.24, 0.24), material='gunmetal',
                      bevel=0.012)

    # --- Door face: two leaves, latches, hinges --------------------------------------------------
    F.box(s, 'DoorFace', (-0.42, 0.0, 1.05), (0.08, 2.55, 1.95), material='paint', bevel=0.02)
    F.box(s, 'DoorLatchP', (-0.48, 0.62, 1.05), (0.08, 0.10, 1.45), material='gunmetal', bevel=0.008)
    F.box(s, 'DoorLatchS', (-0.48, -0.62, 1.05), (0.08, 0.10, 1.45), material='gunmetal', bevel=0.008)
    for i in range(5):
        F.box(s, f'DoorHinge{i}', (-0.46, 1.18, 0.35 + i * 0.40), (0.07, 0.18, 0.12),
              material='gunmetal', bevel=0.006)

    # --- Plain freight marks: one band around the waist and an ID plate on the flank -------------
    F.box(s, 'FreightBandP', (2.10, 1.50, 1.06), (4.70, 0.06, 0.30), material='stripe', bevel=0.008)
    F.box(s, 'FreightBandS', (2.10, -1.50, 1.06), (4.70, 0.06, 0.30), material='stripe', bevel=0.008)
    F.box(s, 'FreightBandDoor', (-0.49, 0.0, 1.78), (0.06, 2.30, 0.24), material='stripe', bevel=0.008)
    F.box(s, 'IdPlate', (3.60, 1.49, 1.55), (0.80, 0.05, 0.42), material='gunmetal', bevel=0.008)
    # Roof grab rails + a tow eye on the far (+X) end where the tow line picks it up.
    F.cylinder(s, 'RoofRailP', (0.10, 0.95, 2.24), (4.10, 0.95, 2.24), 0.03, material='gunmetal',
               segments=8, bevel=0.0)
    F.cylinder(s, 'RoofRailS', (0.10, -0.95, 2.24), (4.10, -0.95, 2.24), 0.03, material='gunmetal',
               segments=8, bevel=0.0)
    F.cylinder(s, 'TowEyeBase', (4.62, 0.0, 1.06), (4.80, 0.0, 1.06), 0.16, material='gunmetal',
               segments=12, bevel=0.01)
    F.cylinder(s, 'TowEye', (4.80, 0.0, 1.06), (4.90, 0.0, 1.06), 0.09, material='dark',
               segments=12, bevel=0.0)
    return s


if __name__ == '__main__':
    import forge_export as E
    ship = build().finish()
    E.export_ship(ship, E.fleet_spec(SHIP_ID), preview='--live' not in sys.argv)
