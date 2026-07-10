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
    def __init__(self, name: str, *, selected: bool, hidden: bool, hide_viewport: bool, hide_render: bool):
        self.name = name
        self.type = 'EMPTY'
        self._selected = selected
        self._hidden = hidden
        self.hide_viewport = hide_viewport
        self.hide_render = hide_render

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


export_target = FakeObject(
    'EXPORT_TARGET',
    selected=False,
    hidden=True,
    hide_viewport=True,
    hide_render=True,
)
previously_selected = FakeObject(
    'PREVIOUSLY_SELECTED',
    selected=True,
    hidden=False,
    hide_viewport=False,
    hide_render=False,
)
objects = FakeObjectCollection([export_target, previously_selected])


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
    data=SimpleNamespace(objects=objects, scenes=[{}]),
    context=context,
    ops=SimpleNamespace(
        object=SimpleNamespace(select_all=select_all),
        export_scene=SimpleNamespace(gltf=fail_export),
    ),
)
exporter.IN_BLENDER = True

try:
    exporter.export_gltf(
        'ignored.glb',
        {'id': 'fixture_export_state', 'assetId': 'SF_FIXTURE', 'slot': 'engine'},
        [export_target],
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

print('PASS Blender exporter state: selection, None active object, and visibility restore on failure')
