"""Fail-closed texture-role ownership for generic Blender sprint exports."""
from __future__ import annotations


BLENDER_BAKED_OWNER = 'blender-baked'
FINALIZER_V1_OWNER = 'finalizer-v1'


def resolve_texture_role_mode(value: str | None) -> tuple[str, list[str]]:
    owner = value or BLENDER_BAKED_OWNER
    if owner == BLENDER_BAKED_OWNER:
        return owner, ['ao', 'roughness']
    if owner == FINALIZER_V1_OWNER:
        return owner, []
    raise RuntimeError(
        f"unsupported SF_TEXTURE_ROLE_OWNER={owner!r}; expected "
        f"{BLENDER_BAKED_OWNER!r} or explicit {FINALIZER_V1_OWNER!r}"
    )
