"""The Fulfillment faction station kit — row 512. Hospital-white barcode: clinical panel
band, black barcode stripe rows printed on it, red seal stamps — the station reads as a
processed consignment, packed and accounted."""
import math
import os
import sys

sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), '..'))
import forge as F  # noqa: E402
import station_kit as K  # noqa: E402

SHIP_ID = 'var_station_kit_fulfillment_v01'
COLORS = {
    'paint': '#b8b8ac',            # hospital white, authored grey
    'paint2': '#5a5a52',
    'stripe': '#8a1a1a',           # fulfillment stamp red, authored dark
    'dark': '#161614',             # barcode black
    'gunmetal': '#4a4a44',
    'glow_warm.ff': '#f0f0e8',     # clinical white lamp
    'glow_red.ff': '#a02020',
}

SEGMENTS = 12


def dress(s):
    # the consignment band: hospital-white cladding with a barcode course
    K.ring_wall(s, 'ConsignBand', K.SHELL_R + 0.8, 10.0, 24.0, 2.4, 'paint', segs=56)
    K.ring_wall(s, 'ConsignBase', K.SHELL_R + 1.0, 10.0, 11.4, 2.6, 'paint2', segs=56)
    # the barcode: deterministic black bars of varied width printed round the white course
    s.detail = 1
    bars = []
    for i in range(72):
        a = 2.5 + i * 5.0
        w_tan = 0.5 + ((i * 29) % 4) * 0.6     # irregular bar widths — a real code
        if (i * 13) % 7 == 0:
            continue                          # whitespace gaps in the code
        bars.append(K.tangent_box(a, K.SHELL_R + 1.15, 20.4, 0.5, w_tan, 5.2))
    F.boxes(s, 'Barcode', bars, 'dark', bevel=0.02)
    # the order number row: small white ticks above the barcode
    ticks = [K.tangent_box(6.0 + i * 14.0, K.SHELL_R + 1.15, 24.8, 0.4, 1.8, 0.9)
             for i in range(25)]
    F.boxes(s, 'OrderTicks', ticks, 'paint2', bevel=0.02)
    s.detail = 0
    # red seal stamps at four azimuths — the consignment is signed
    for i, a in enumerate((20.0, 110.0, 200.0, 290.0)):
        F.cylinder(s, f'Seal{i}', K.polar(K.SHELL_R + 1.0, a, 15.0),
                   K.polar(K.SHELL_R + 2.0, a, 15.0), 2.0, 2.0, material='stripe',
                   segments=18, bevel=0.04)
        s.detail = 1
        F.box(s, f'Seal{i}Mark', K.polar(K.SHELL_R + 2.15, a, 15.0), (0.2, 1.6, 0.5),
              material='paint', rot_z=math.radians(a), bevel=0.0)
        s.detail = 0
    # the dispatch crown: a white packing block with a red routing arrow and white lamps
    F.box(s, 'Dispatch', (0.0, 0.0, 38.0), (16.0, 10.0, 4.0), material='paint', bevel=0.12)
    F.box(s, 'DispatchArrow', (0.0, 0.0, 40.2), (10.0, 1.2, 0.8), material='stripe',
          bevel=0.04)
    F.box(s, 'DispatchHead', (6.0, 0.0, 40.2), (2.4, 2.4, 0.8), material='stripe', bevel=0.04)
    s.detail = 1
    K.lamp_ring(s, 'Clinical', 'glow_warm.ff', r=K.SHELL_R + 1.6, z=26.6, count=16, size=0.4)
    s.detail = 0


def build():
    return K.build_kit(SHIP_ID, COLORS, dress)


if __name__ == '__main__':
    import forge_export as E
    ship = build().finish()
    E.export_ship(ship, E.fleet_spec(SHIP_ID), preview='--live' not in sys.argv)
