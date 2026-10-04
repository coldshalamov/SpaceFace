"""Faction variants: the same forged hull under another operator's paint.

A variant file sets SHIP_ID and a colour override and calls build_variant(base_module, ...). The base
ship's own build() runs with the overridden palette, so the variant can never drift from its hull.
"""
import importlib
import os
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
sys.path.insert(0, os.path.join(HERE, 'ships'))
sys.path.insert(0, os.path.join(HERE, 'animations'))


def build_variant(base_name, ship_id, colors, extra=None):
    base = importlib.import_module(base_name)
    base.SHIP_ID = ship_id
    base.COLORS = {**base.COLORS, **colors}
    ship = base.build()
    if extra:
        extra(ship)
    return ship


def main(base_name, ship_id, colors, extra=None):
    import forge_export as E
    ship = build_variant(base_name, ship_id, colors, extra).finish()
    live = '--live' in sys.argv
    written = E.export_ship(ship, E.fleet_spec(ship_id), preview=not live)
    if live and hasattr(ship, 'ani38_bank'):
        # Variants rebuild the banked hull under their own fleet spec, so the bank's
        # bindings/rest poses are already theirs — bake it under the variant's key.
        import ANI_38
        ANI_38.bake_ship_banks(ship, written,
                               bank_key=E.fleet_spec(ship_id)['file'].replace('_', '-'))
