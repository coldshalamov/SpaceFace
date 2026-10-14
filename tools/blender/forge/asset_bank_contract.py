"""Small authoring contracts that do not import Blender or perform filesystem writes."""
import re


def validate_asset_id(asset_id):
    if not isinstance(asset_id, str) or not re.fullmatch(r'[a-z0-9_-]+', asset_id):
        raise ValueError('Invalid portable asset identity: ' + repr(asset_id))
    return asset_id


def select_asset_ids(available, requested=None):
    """Resolve a complete selection before scene reset or any export begins."""
    available = list(available)
    if requested is None:
        return available
    selected = requested.split(',') if isinstance(requested, str) else list(requested)
    selected = [name.strip() for name in selected]
    if not selected or any(not name for name in selected):
        raise ValueError('Empty asset selection')
    if len(set(selected)) != len(selected):
        raise ValueError('Duplicate asset selection')
    unknown = sorted(set(selected) - set(available))
    if unknown:
        raise ValueError('Unknown asset selection: ' + ', '.join(unknown))
    return selected
