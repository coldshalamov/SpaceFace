from __future__ import annotations

import importlib.util
from pathlib import Path
from types import SimpleNamespace


ROOT = Path(__file__).resolve().parents[1]
MODULE_PATH = ROOT / 'tools' / 'blender' / 'spaceface_export.py'
SPEC = importlib.util.spec_from_file_location('spaceface_export_under_test', MODULE_PATH)
assert SPEC and SPEC.loader
exporter = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(exporter)


class FakeObject:
    def __init__(
        self,
        name: str,
        *,
        selected: bool,
        hidden: bool,
        hide_viewport: bool,
        hide_render: bool,
        object_type: str = 'EMPTY',
        hard_edge: bool = False,
        custom_properties: dict | None = None,
    ):
        self.name = name
        self.type = object_type
        self._selected = selected
        self._hidden = hidden
        self.hide_viewport = hide_viewport
        self.hide_render = hide_render
        self._custom_properties = dict(custom_properties or {})
        self.modifiers = []
        self.material_slots = []
        self.data = SimpleNamespace(
            edges=[SimpleNamespace(index=7, use_edge_sharp=True, crease=0.0)] if hard_edge else [],
            polygons=[],
            attributes={},
        ) if object_type == 'MESH' else None

    def get(self, key: str, default=None):
        return self._custom_properties.get(key, default)

    def keys(self):
        return self._custom_properties.keys()

    def __setitem__(self, key: str, value) -> None:
        self._custom_properties[key] = value

    def __delitem__(self, key: str) -> None:
        del self._custom_properties[key]

    def select_get(self) -> bool:
        return self._selected

    def select_set(self, value: bool) -> None:
        self._selected = value

    def hide_get(self) -> bool:
        return self._hidden

    def hide_set(self, value: bool) -> None:
        self._hidden = value


class FakeObjectCollection(list):
    def __contains__(self, value):
        if isinstance(value, str):
            return any(obj.name == value for obj in self)
        return super().__contains__(value)


class FakeIDPropertyGroup:
    def __init__(self, value: dict):
        self._value = value

    def __deepcopy__(self, _memo):
        raise TypeError("cannot pickle 'IDPropertyGroup' object")

    def to_dict(self) -> dict:
        return dict(self._value)


export_target = FakeObject(
    'EXPORT_TARGET',
    selected=False,
    hidden=True,
    hide_viewport=True,
    hide_render=True,
    object_type='MESH',
)
prior_claim_target = FakeObject(
    'PRIOR_CLAIM_TARGET',
    selected=False,
    hidden=False,
    hide_viewport=False,
    hide_render=False,
    object_type='MESH',
    custom_properties={'spaceface_chamfered': 'author-provided-claim'},
)
previously_selected = FakeObject(
    'PREVIOUSLY_SELECTED',
    selected=True,
    hidden=False,
    hide_viewport=False,
    hide_render=False,
)
hard_edge_target = FakeObject(
    'UNCHAMFERED_TARGET',
    selected=False,
    hidden=True,
    hide_viewport=True,
    hide_render=True,
    object_type='MESH',
    hard_edge=True,
)
modern_crease_target = FakeObject(
    'MODERN_CREASE_TARGET',
    selected=False,
    hidden=False,
    hide_viewport=False,
    hide_render=False,
    object_type='MESH',
)
modern_crease_target.data.edges.append(SimpleNamespace(index=0, use_edge_sharp=False))
modern_crease_target.data.attributes['crease_edge'] = SimpleNamespace(
    domain='EDGE',
    data=[SimpleNamespace(value=0.5)],
)
objects = FakeObjectCollection([
    export_target,
    prior_claim_target,
    previously_selected,
    hard_edge_target,
    modern_crease_target,
])


class FakeContext:
    def __init__(self):
        self.view_layer = SimpleNamespace(objects=SimpleNamespace(active=None))

    @property
    def selected_objects(self):
        return [obj for obj in objects if obj.select_get()]


context = FakeContext()


def select_all(*, action: str) -> None:
    assert action == 'DESELECT'
    for obj in objects:
        obj.select_set(False)


def fail_export(**_kwargs) -> None:
    assert context.view_layer.objects.active is export_target
    assert export_target.select_get() is True
    raise RuntimeError('injected exporter failure')


exporter.bpy = SimpleNamespace(
    data=SimpleNamespace(
        objects=objects,
        scenes=[
            {'spacefaceAsset': FakeIDPropertyGroup({'prior': 'scene-metadata'})},
            {},
        ],
    ),
    context=context,
    ops=SimpleNamespace(
        object=SimpleNamespace(select_all=select_all),
        export_scene=SimpleNamespace(gltf=fail_export),
    ),
)
exporter.IN_BLENDER = True

# Blender 5.1 removed MeshEdge.crease. A smooth edge with no crease attribute must
# remain valid instead of crashing merely because the legacy property is absent.
export_target.data.edges.append(SimpleNamespace(index=0, use_edge_sharp=False))
assert exporter.hard_edges_unbeveled(export_target) == []

# Creases moved to the generic edge-domain attribute API; keep enforcing them.
assert exporter.hard_edges_unbeveled(modern_crease_target) == [0]

try:
    exporter.validate_scene_objects(
        {'id': 'fixture_hard_edge', 'required_maps': []},
        [hard_edge_target],
    )
except exporter.ExportContractError as error:
    assert error.assertion == 'unchamfered hard edge'
else:
    raise AssertionError('a hard edge without bevel or author claim must fail validation')
assert 'spaceface_chamfered' not in hard_edge_target.keys(), (
    'validation must not stamp a chamfer claim before checking actual geometry'
)

prior_scene_metadata = {'prior': 'scene-metadata'}

try:
    exporter.export_gltf(
        'ignored.glb',
        {
            'id': 'fixture_export_state',
            'assetId': 'SF_FIXTURE',
            'slot': 'engine',
            'required_maps': [],
        },
        [export_target, prior_claim_target],
    )
except RuntimeError as error:
    assert str(error) == 'injected exporter failure'
else:
    raise AssertionError('fixture export must fail')

assert export_target.select_get() is False, 'export target selection must restore'
assert previously_selected.select_get() is True, 'prior selection must restore'
assert context.view_layer.objects.active is None, 'a prior active object of None must restore explicitly'
assert export_target.hide_get() is True, 'hide_set state must restore after exporter failure'
assert export_target.hide_viewport is True, 'hide_viewport state must restore after exporter failure'
assert export_target.hide_render is True, 'hide_render state must restore after exporter failure'
assert 'spaceface_chamfered' not in export_target.keys(), (
    'failure must restore absence of an exporter-stamped object claim'
)
assert prior_claim_target.get('spaceface_chamfered') == 'author-provided-claim', (
    'failure must restore a prior object custom-property value'
)
assert exporter.bpy.data.scenes[0]['spacefaceAsset'] == prior_scene_metadata, (
    'failure must restore prior scene metadata value'
)
assert 'spacefaceAsset' not in exporter.bpy.data.scenes[1], (
    'failure must restore prior absence of scene metadata'
)


def unexpected_export(**_kwargs) -> None:
    raise AssertionError('validation failure must occur before Blender export')


exporter.bpy.ops.export_scene.gltf = unexpected_export
try:
    exporter.export_gltf(
        'ignored-hard-edge.glb',
        {
            'id': 'fixture_validation_rollback',
            'assetId': 'SF_FIXTURE_VALIDATION',
            'slot': 'engine',
            'required_maps': [],
        },
        [hard_edge_target],
    )
except exporter.ExportContractError as error:
    assert error.assertion == 'unchamfered hard edge'
else:
    raise AssertionError('export_gltf must preserve the hard-edge validation gate')
assert 'spaceface_chamfered' not in hard_edge_target.keys()
assert hard_edge_target.select_get() is False
assert hard_edge_target.hide_get() is True
assert hard_edge_target.hide_viewport is True
assert hard_edge_target.hide_render is True
assert exporter.bpy.data.scenes[0]['spacefaceAsset'] == prior_scene_metadata
assert 'spacefaceAsset' not in exporter.bpy.data.scenes[1]


def successful_export(**_kwargs) -> None:
    assert context.view_layer.objects.active is export_target
    assert export_target.select_get() is True


exporter.bpy.ops.export_scene.gltf = successful_export
exporter.export_gltf(
    'ignored-success.glb',
    {
        'id': 'fixture_export_success',
        'assetId': 'SF_FIXTURE_SUCCESS',
        'slot': 'engine',
        'required_maps': [],
    },
    [export_target],
)
assert export_target.get('spaceface_chamfered') is True, (
    'successful export retains the post-validation chamfer claim used by GLB extras'
)
assert exporter.bpy.data.scenes[0]['spacefaceAsset']['assetId'] == 'SF_FIXTURE_SUCCESS'
assert exporter.bpy.data.scenes[1]['spacefaceAsset']['assetId'] == 'SF_FIXTURE_SUCCESS'
assert export_target.select_get() is False, 'successful export still restores selection'
assert export_target.hide_get() is True, 'successful export still restores hide_set state'
assert export_target.hide_viewport is True, 'successful export still restores viewport hiding'
assert export_target.hide_render is True, 'successful export still restores render hiding'

# A successful export stamp is provenance, not a permanent waiver for later geometry edits.
export_target.data.edges.append(SimpleNamespace(index=19, use_edge_sharp=True, crease=0.0))
try:
    exporter.validate_scene_objects(
        {'id': 'fixture_stale_chamfer_stamp', 'required_maps': []},
        [export_target],
    )
except exporter.ExportContractError as error:
    assert error.assertion == 'unchamfered hard edge'
    assert 'edge index 19' in error.detail
else:
    raise AssertionError('a persisted exporter stamp must not conceal a newly added sharp unbeveled edge')
assert export_target.get('spaceface_chamfered') is True, (
    'failed revalidation may retain provenance, but it must not bypass current geometry inspection'
)

print('PASS Blender exporter state: chamfer validation plus selection, metadata, property, and visibility rollback')
