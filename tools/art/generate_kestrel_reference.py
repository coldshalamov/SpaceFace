#!/usr/bin/env python3
"""Generate the engine-neutral SF-K0 Kestrel reference package.

No third-party packages are required. The committed GLB is a review/DCC interchange asset; the live
Three.js game uses src/render/ships/kestrelHero.js so the zero-build runtime remains intact.

Authoring convention: right-handed, +X forward, +Y up, +Z starboard, metres.
"""
from __future__ import annotations

import argparse
import json
import math
import random
import struct
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any, Iterable, Sequence

Vec3 = tuple[float, float, float]
Face = tuple[int, int, int]
TAU = math.tau


def add(a: Vec3, b: Vec3) -> Vec3:
    return (a[0] + b[0], a[1] + b[1], a[2] + b[2])


def sub(a: Vec3, b: Vec3) -> Vec3:
    return (a[0] - b[0], a[1] - b[1], a[2] - b[2])


def mul(a: Vec3, s: float) -> Vec3:
    return (a[0] * s, a[1] * s, a[2] * s)


def dot(a: Vec3, b: Vec3) -> float:
    return a[0] * b[0] + a[1] * b[1] + a[2] * b[2]


def cross(a: Vec3, b: Vec3) -> Vec3:
    return (
        a[1] * b[2] - a[2] * b[1],
        a[2] * b[0] - a[0] * b[2],
        a[0] * b[1] - a[1] * b[0],
    )


def norm(a: Vec3) -> Vec3:
    n = math.sqrt(dot(a, a))
    return (0.0, 1.0, 0.0) if n < 1e-12 else (a[0] / n, a[1] / n, a[2] / n)


def clamp(v: float, lo: float = 0.0, hi: float = 1.0) -> float:
    return min(hi, max(lo, v))


def hex_rgb(value: str) -> tuple[float, float, float]:
    value = value.lstrip('#')
    return tuple(int(value[i:i + 2], 16) / 255 for i in (0, 2, 4))  # type: ignore



def srgb_channel_to_linear(value: float) -> float:
    return value / 12.92 if value <= 0.04045 else ((value + 0.055) / 1.055) ** 2.4


def srgb_to_linear(rgb: Sequence[float]) -> tuple[float, float, float]:
    return tuple(srgb_channel_to_linear(value) for value in rgb[:3])  # type: ignore


def rgb_hex(rgb: Sequence[float]) -> str:
    return '#' + ''.join(f'{round(clamp(c) * 255):02x}' for c in rgb[:3])


@dataclass(frozen=True)
class Material:
    name: str
    color: str
    metallic: float
    roughness: float
    emissive: str | None = None
    alpha: float = 1.0
    double_sided: bool = False


MATERIALS = [
    Material('Shell_Aged_Warm_Gray', '#817b70', 0.18, 0.58),
    Material('Shell_Replacement_Dark', '#4e5050', 0.28, 0.62),
    Material('Mechanical_Graphite', '#10161b', 0.78, 0.42),
    Material('Load_Gunmetal', '#252b30', 0.88, 0.29),
    Material('Frontier_Cyan', '#4ecbe0', 0.08, 0.52),
    Material('Canopy_Smoked', '#061a22', 0.08, 0.14, '#0a3040', 0.92, True),
    Material('Sensor_Cyan', '#a0eef8', 0.05, 0.18, '#8adce8'),
    Material('Drive_Core', '#e6fdff', 0.02, 0.16, '#ffffff'),
    Material('Drive_Cyan', '#4ecbe0', 0.04, 0.20, '#4ecbe0'),
    Material('Practical_Amber', '#e9a34a', 0.04, 0.38, '#e9a34a'),
    Material('Warning_Mustard', '#c28b35', 0.06, 0.66),
    Material('Field_Repair_Sage', '#53665a', 0.22, 0.72),
    Material('Oxidized_Rust', '#6b3f2b', 0.02, 0.86),
]
MAT = {m.name: i for i, m in enumerate(MATERIALS)}


@dataclass
class Mesh:
    name: str
    material: int
    vertices: list[Vec3] = field(default_factory=list)
    faces: list[Face] = field(default_factory=list)
    extras: dict[str, Any] = field(default_factory=dict)


def box(name: str, center: Vec3, size: Vec3, material: int, extras: dict[str, Any] | None = None) -> Mesh:
    x, y, z = center
    hx, hy, hz = size[0] / 2, size[1] / 2, size[2] / 2
    vertices = [
        (x - hx, y - hy, z - hz), (x + hx, y - hy, z - hz),
        (x + hx, y + hy, z - hz), (x - hx, y + hy, z - hz),
        (x - hx, y - hy, z + hz), (x + hx, y - hy, z + hz),
        (x + hx, y + hy, z + hz), (x - hx, y + hy, z + hz),
    ]
    faces = [
        (0, 2, 1), (0, 3, 2), (4, 5, 6), (4, 6, 7),
        (0, 1, 5), (0, 5, 4), (3, 7, 6), (3, 6, 2),
        (1, 2, 6), (1, 6, 5), (0, 4, 7), (0, 7, 3),
    ]
    return Mesh(name, material, vertices, faces, extras or {})


def loft_x(name: str, sections: Sequence[tuple[float, float, float, float]], segments: int, material: int, extras: dict[str, Any] | None = None) -> Mesh:
    """Sections are (x, half_y, half_z, y_offset)."""
    vertices: list[Vec3] = []
    for x, hy, hz, yo in sections:
        for i in range(segments):
            a = TAU * i / segments
            sy = math.sin(a)
            belly = (abs(sy) - 0.25) * hy * 0.12 if sy < -0.25 else 0
            vertices.append((x, yo + sy * hy + belly, math.cos(a) * hz))
    faces: list[Face] = []
    for section in range(len(sections) - 1):
        a = section * segments
        b = (section + 1) * segments
        for i in range(segments):
            j = (i + 1) % segments
            faces.extend([(a + i, b + i, b + j), (a + i, b + j, a + j)])
    aft_center = len(vertices)
    vertices.append((sections[0][0], sections[0][3], 0))
    fore_center = len(vertices)
    vertices.append((sections[-1][0], sections[-1][3], 0))
    for i in range(segments):
        j = (i + 1) % segments
        faces.append((aft_center, j, i))
        off = (len(sections) - 1) * segments
        faces.append((fore_center, off + i, off + j))
    return Mesh(name, material, vertices, faces, extras or {})


def extrude_xz(name: str, points: Sequence[tuple[float, float]], thickness: float, y_center: float, material: int, extras: dict[str, Any] | None = None) -> Mesh:
    n = len(points)
    y0, y1 = y_center - thickness / 2, y_center + thickness / 2
    vertices = [(x, y0, z) for x, z in points] + [(x, y1, z) for x, z in points]
    faces: list[Face] = []
    for i in range(1, n - 1):
        faces.append((0, i + 1, i))
        faces.append((n, n + i, n + i + 1))
    for i in range(n):
        j = (i + 1) % n
        faces.extend([(i, j, n + j), (i, n + j, n + i)])
    return Mesh(name, material, vertices, faces, extras or {})


def mirror_z(mesh: Mesh, name: str) -> Mesh:
    return Mesh(name, mesh.material, [(x, y, -z) for x, y, z in mesh.vertices], [(a, c, b) for a, b, c in mesh.faces], dict(mesh.extras))


def cylinder_x(name: str, a: Vec3, b: Vec3, radius: float, segments: int, material: int, extras: dict[str, Any] | None = None) -> Mesh:
    axis = sub(b, a)
    w = norm(axis)
    helper: Vec3 = (0, 1, 0) if abs(w[1]) < 0.85 else (0, 0, 1)
    u = norm(cross(helper, w))
    v = norm(cross(w, u))
    vertices: list[Vec3] = []
    for p in (a, b):
        for i in range(segments):
            angle = TAU * i / segments
            ring = add(mul(u, radius * math.cos(angle)), mul(v, radius * math.sin(angle)))
            vertices.append(add(p, ring))
    faces: list[Face] = []
    for i in range(segments):
        j = (i + 1) % segments
        faces.extend([(i, segments + i, segments + j), (i, segments + j, j)])
    ia, ib = len(vertices), len(vertices) + 1
    vertices.extend([a, b])
    for i in range(segments):
        j = (i + 1) % segments
        faces.append((ia, j, i))
        faces.append((ib, segments + i, segments + j))
    return Mesh(name, material, vertices, faces, extras or {})


def torus_x(name: str, center: Vec3, major: float, tube: float, major_segments: int, minor_segments: int, material: int, extras: dict[str, Any] | None = None) -> Mesh:
    cx, cy, cz = center
    vertices: list[Vec3] = []
    for i in range(major_segments):
        a = TAU * i / major_segments
        ca, sa = math.cos(a), math.sin(a)
        for j in range(minor_segments):
            b = TAU * j / minor_segments
            cb, sb = math.cos(b), math.sin(b)
            r = major + tube * cb
            vertices.append((cx + tube * sb, cy + r * sa, cz + r * ca))
    faces: list[Face] = []
    for i in range(major_segments):
        ni = (i + 1) % major_segments
        for j in range(minor_segments):
            nj = (j + 1) % minor_segments
            a = i * minor_segments + j
            b = ni * minor_segments + j
            c = ni * minor_segments + nj
            d = i * minor_segments + nj
            faces.extend([(a, b, c), (a, c, d)])
    return Mesh(name, material, vertices, faces, extras or {})


def build_model() -> list[Mesh]:
    meshes: list[Mesh] = []
    meshes.append(loft_x('Kestrel_Pressure_Hull', [
        (-13.35, 1.35, 1.80, -0.05), (-8.2, 2.05, 2.55, 0.05),
        (-2.0, 2.25, 2.75, 0.12), (4.8, 1.90, 2.35, 0.12),
        (9.4, 1.25, 1.62, 0.06), (13.90, 0.20, 0.22, -0.03),
    ], 12, MAT['Shell_Aged_Warm_Gray'], {'role': 'hero_hull'}))
    meshes.extend([
        box('Kestrel_Ventral_Keel', (-1.4, -1.72, 0), (17.8, 0.72, 1.18), MAT['Mechanical_Graphite']),
        box('Kestrel_Dorsal_Spine', (-2.1, 2.0, 0), (13.2, 0.48, 0.72), MAT['Shell_Replacement_Dark']),
        box('Kestrel_Broken_Centerline_A', (5.4, 2.03, 0), (5.4, 0.09, 0.22), MAT['Frontier_Cyan']),
        box('Kestrel_Broken_Centerline_B', (-2.3, 2.18, 0), (3.5, 0.09, 0.22), MAT['Frontier_Cyan']),
        box('Kestrel_Centerline_Service_Break', (1.25, 2.18, 0), (1.0, 0.10, 0.28), MAT['Warning_Mustard']),
    ])

    shoulder = [(-8.0, -2.45), (-2.0, -2.75), (6.7, -2.1), (8.2, -3.25), (1.8, -4.75), (-6.3, -4.45), (-9.6, -3.15)]
    port = extrude_xz('Kestrel_Shoulder_Port', shoulder, 0.42, 0.15, MAT['Shell_Aged_Warm_Gray'])
    meshes.extend([port, mirror_z(port, 'Kestrel_Shoulder_Starboard')])
    outer = [(-7.8, -5.05), (-1.8, -5.35), (3.2, -4.55), (1.8, -6.75), (-5.8, -6.8), (-9.4, -5.85)]
    outer_mesh = extrude_xz('Kestrel_Radiator_Pod_Port', outer, 0.54, 0.02, MAT['Shell_Replacement_Dark'])
    meshes.extend([outer_mesh, mirror_z(outer_mesh, 'Kestrel_Radiator_Pod_Starboard')])
    for z, side in ((-5.0, 'Port'), (5.0, 'Starboard')):
        meshes.append(box(f'Kestrel_Shoulder_Strut_Fore_{side}', (2.2, 0, z), (1.9, 0.28, 1.8), MAT['Load_Gunmetal']))
        meshes.append(box(f'Kestrel_Shoulder_Strut_Aft_{side}', (-5.2, 0, z), (1.9, 0.28, 1.8), MAT['Load_Gunmetal']))
        for i in range(4):
            meshes.append(box(f'Kestrel_Radiator_{side}_{i+1}', (-5.7 + i * 1.55, 0.42, z * 1.13), (1.0, 0.16, 0.18), MAT['Mechanical_Graphite']))

    meshes.append(loft_x('Kestrel_Recessed_Canopy', [
        (1.6, 0.18, 1.22, 1.88), (4.8, 0.62, 1.08, 1.98), (7.1, 0.34, 0.74, 1.72),
    ], 10, MAT['Canopy_Smoked'], {'role': 'cockpit'}))
    meshes.extend([
        box('Kestrel_Armored_Brow', (7.0, 1.75, 0), (4.7, 0.38, 2.45), MAT['Mechanical_Graphite']),
        box('Kestrel_Sensor_Slit_Port', (10.55, 0.68, -0.72), (1.1, 0.16, 0.26), MAT['Sensor_Cyan']),
        box('Kestrel_Sensor_Slit_Starboard', (10.55, 0.68, 0.72), (1.1, 0.16, 0.26), MAT['Sensor_Cyan']),
        box('Kestrel_Nose_Chin', (10.5, -0.68, 0), (3.2, 0.48, 1.32), MAT['Shell_Replacement_Dark']),
        box('Kestrel_Nose_Service_Mark', (11.4, -0.42, 0), (1.45, 0.08, 0.24), MAT['Warning_Mustard']),
    ])

    meshes.extend([
        cylinder_x('Kestrel_Axial_Drive_Housing', (-13.35, -0.05, 0), (-8.95, -0.05, 0), 2.05, 16, MAT['Mechanical_Graphite'], {'role': 'engine'}),
        torus_x('Kestrel_Drive_Forward_Ring', (-8.95, -0.05, 0), 1.86, 0.20, 18, 6, MAT['Load_Gunmetal']),
        torus_x('Kestrel_Drive_Aft_Ring', (-13.35, -0.05, 0), 1.87, 0.22, 18, 6, MAT['Frontier_Cyan']),
        cylinder_x('Kestrel_Drive_Fan', (-13.62, -0.05, 0), (-13.44, -0.05, 0), 1.48, 14, MAT['Drive_Cyan']),
        cylinder_x('Kestrel_Drive_Core', (-13.79, -0.05, 0), (-13.63, -0.05, 0), 0.94, 14, MAT['Drive_Core']),
    ])

    meshes.extend([
        box('Kestrel_Pulse_Mount', (7.4, 0.82, 0), (2.1, 0.52, 0.84), MAT['Load_Gunmetal'], {'role': 'weapon_mount'}),
        cylinder_x('Kestrel_Pulse_Barrel', (7.8, 0.82, 0), (11.8, 0.82, 0), 0.18, 10, MAT['Load_Gunmetal']),
        torus_x('Kestrel_Pulse_Service_Ring', (8.15, 0.82, 0), 0.28, 0.07, 12, 5, MAT['Warning_Mustard']),
        cylinder_x('Kestrel_Mining_Emitter_Body', (10.75, -0.98, 0), (12.15, -0.98, 0), 0.38, 10, MAT['Mechanical_Graphite'], {'role': 'mining_emitter'}),
        cylinder_x('Kestrel_Mining_Emitter_Lens', (12.15, -0.98, 0), (12.28, -0.98, 0), 0.27, 12, MAT['Practical_Amber']),
        box('Kestrel_Mining_Hazard_Band', (10.94, -0.98, 0), (0.28, 0.64, 0.92), MAT['Warning_Mustard']),
    ])

    meshes.extend([
        box('Kestrel_Field_Repair_Port', (-0.8, 0.53, -3.55), (4.2, 0.18, 2.05), MAT['Field_Repair_Sage'], {'story': 'field_repair'}),
        box('Kestrel_Utility_Pod_Starboard', (-1.4, 1.3, 3.75), (3.25, 1.0, 1.65), MAT['Field_Repair_Sage'], {'role': 'utility_pod'}),
        box('Kestrel_Utility_Pod_Band', (-0.55, 1.3, 3.75), (0.28, 1.08, 1.74), MAT['Warning_Mustard']),
        cylinder_x('Kestrel_Antenna_Mast', (-3.1, 2.65, -1.28), (-3.1, 3.55, -1.28), 0.08, 7, MAT['Load_Gunmetal']),
        torus_x('Kestrel_Antenna_Loop', (-3.1, 3.55, -1.28), 0.34, 0.055, 14, 5, MAT['Sensor_Cyan']),
    ])
    for x in (-2.45, 0.85):
        for z in (-4.25, -2.90):
            meshes.append(cylinder_x(f'Kestrel_Repair_Fastener_{x}_{z}', (x - 0.075, 0.66, z), (x + 0.075, 0.66, z), 0.075, 6, MAT['Warning_Mustard']))
    for z, side in ((-2.65, 'Port'), (2.65, 'Starboard')):
        meshes.extend([
            box(f'Kestrel_Landing_Skid_{side}', (-1.8, -2.38, z), (6.7, 0.34, 0.36), MAT['Mechanical_Graphite']),
            box(f'Kestrel_Landing_Strut_Fore_{side}', (1.2, -1.62, z), (0.28, 1.5, 0.28), MAT['Load_Gunmetal']),
            box(f'Kestrel_Landing_Strut_Aft_{side}', (-4.4, -1.62, z), (0.28, 1.5, 0.28), MAT['Load_Gunmetal']),
        ])
    meshes.extend([
        box('Kestrel_Cabin_Practical', (4.1, 2.39, 0), (0.22, 0.16, 1.3), MAT['Practical_Amber']),
        box('Kestrel_Nav_Port', (1.6, 0.45, -6.45), (0.38, 0.18, 0.16), MAT['Sensor_Cyan']),
        box('Kestrel_Nav_Starboard', (1.6, 0.45, 6.45), (0.38, 0.18, 0.16), MAT['Sensor_Cyan']),
    ])
    return meshes


SOCKETS = [
    {'name': 'SOCKET_Weapon_Front', 'translation': [12.0, 0.82, 0], 'role': 'weapon', 'forward': [1, 0, 0]},
    {'name': 'SOCKET_Mining_Front', 'translation': [12.35, -0.98, 0], 'role': 'mining', 'forward': [1, 0, 0]},
    {'name': 'SOCKET_Engine_Main', 'translation': [-12.75, -0.05, 0], 'role': 'engine', 'forward': [-1, 0, 0]},
    {'name': 'SOCKET_Utility_Dorsal', 'translation': [-1.4, 1.95, 3.75], 'role': 'utility', 'forward': [0, 1, 0]},
    {'name': 'SOCKET_Cargo_Ventral', 'translation': [-0.8, -2.05, 0], 'role': 'cargo', 'forward': [0, -1, 0]},
    {'name': 'SOCKET_Trail_Main', 'translation': [-13.1, -0.05, 0], 'role': 'vfx', 'forward': [-1, 0, 0]},
    {'name': 'SOCKET_Camera_Focus', 'translation': [0, 0.3, 0], 'role': 'camera', 'forward': [1, 0, 0]},
]


def flatten(mesh: Mesh) -> tuple[list[float], list[float], list[int], Vec3, Vec3]:
    positions: list[float] = []
    normals: list[float] = []
    indices: list[int] = []
    mins = [float('inf')] * 3
    maxs = [float('-inf')] * 3
    for face in mesh.faces:
        a, b, c = (mesh.vertices[i] for i in face)
        normal = norm(cross(sub(b, a), sub(c, a)))
        base = len(indices)
        for vertex in (a, b, c):
            positions.extend(vertex)
            normals.extend(normal)
            indices.append(base)
            base += 1
            for axis in range(3):
                mins[axis] = min(mins[axis], vertex[axis])
                maxs[axis] = max(maxs[axis], vertex[axis])
    return positions, normals, indices, tuple(mins), tuple(maxs)  # type: ignore


def pad4(data: bytearray, byte: int = 0) -> None:
    while len(data) % 4:
        data.append(byte)


def write_glb(path: Path, meshes: Sequence[Mesh]) -> dict[str, Any]:
    binary = bytearray()
    buffer_views: list[dict[str, Any]] = []
    accessors: list[dict[str, Any]] = []
    gltf_meshes: list[dict[str, Any]] = []
    nodes: list[dict[str, Any]] = []

    def append_blob(blob: bytes, target: int | None = None) -> int:
        pad4(binary)
        offset = len(binary)
        binary.extend(blob)
        view: dict[str, Any] = {'buffer': 0, 'byteOffset': offset, 'byteLength': len(blob)}
        if target is not None:
            view['target'] = target
        buffer_views.append(view)
        return len(buffer_views) - 1

    def add_accessor(view: int, component: int, count: int, kind: str, minv: Sequence[float] | None = None, maxv: Sequence[float] | None = None) -> int:
        accessor: dict[str, Any] = {'bufferView': view, 'componentType': component, 'count': count, 'type': kind}
        if minv is not None:
            accessor['min'] = [round(float(v), 6) for v in minv]
        if maxv is not None:
            accessor['max'] = [round(float(v), 6) for v in maxv]
        accessors.append(accessor)
        return len(accessors) - 1

    triangle_count = 0
    for mesh in meshes:
        positions, normals, indices, minv, maxv = flatten(mesh)
        pv = append_blob(struct.pack('<' + 'f' * len(positions), *positions), 34962)
        nv = append_blob(struct.pack('<' + 'f' * len(normals), *normals), 34962)
        iv = append_blob(struct.pack('<' + 'I' * len(indices), *indices), 34963)
        pa = add_accessor(pv, 5126, len(positions) // 3, 'VEC3', minv, maxv)
        na = add_accessor(nv, 5126, len(normals) // 3, 'VEC3')
        ia = add_accessor(iv, 5125, len(indices), 'SCALAR', [0], [max(indices) if indices else 0])
        gltf_meshes.append({
            'name': mesh.name,
            'primitives': [{'attributes': {'POSITION': pa, 'NORMAL': na}, 'indices': ia, 'material': mesh.material, 'mode': 4}],
            'extras': {'triangleCount': len(mesh.faces), **mesh.extras},
        })
        nodes.append({'name': mesh.name, 'mesh': len(gltf_meshes) - 1, 'extras': dict(mesh.extras)})
        triangle_count += len(mesh.faces)

    for socket in SOCKETS:
        nodes.append({
            'name': socket['name'],
            'translation': socket['translation'],
            'extras': {'spacefaceSocket': True, 'role': socket['role'], 'forward': socket['forward']},
        })

    materials: list[dict[str, Any]] = []
    for material in MATERIALS:
        color = srgb_to_linear(hex_rgb(material.color))
        entry: dict[str, Any] = {
            'name': material.name,
            'pbrMetallicRoughness': {
                'baseColorFactor': [*color, material.alpha],
                'metallicFactor': material.metallic,
                'roughnessFactor': material.roughness,
            },
            'doubleSided': material.double_sided,
        }
        if material.emissive:
            entry['emissiveFactor'] = list(srgb_to_linear(hex_rgb(material.emissive)))
        if material.alpha < 1:
            entry['alphaMode'] = 'BLEND'
        materials.append(entry)

    minv, maxv = bounds(meshes)
    actual_dimensions = [round(maxv[i] - minv[i], 6) for i in range(3)]
    document = {
        'asset': {
            'version': '2.0',
            'generator': 'SpaceFace tools/art/generate_kestrel_reference.py',
            'extras': {
                'assetId': 'SF_K0_KESTREL_BORROWED_TIME',
                'displayName': 'Kestrel / BORROWED TIME',
                'role': 'starter_ship_reference',
                'unit': 'metre',
                'upAxis': '+Y',
                'forwardAxis': '+X',
                'starboardAxis': '+Z',
                'triangleCount': triangle_count,
                'nominalDimensionsM': [28.0, 6.0, 14.0],
                'actualBoundsDimensionsM': actual_dimensions,
                'runtimeSource': 'src/render/ships/kestrelHero.js',
            },
        },
        'scene': 0,
        'scenes': [{'name': 'SF-K0 Kestrel', 'nodes': list(range(len(nodes)))}],
        'nodes': nodes,
        'meshes': gltf_meshes,
        'materials': materials,
        'buffers': [{'byteLength': len(binary)}],
        'bufferViews': buffer_views,
        'accessors': accessors,
    }

    json_bytes = bytearray(json.dumps(document, separators=(',', ':'), ensure_ascii=False).encode('utf-8'))
    pad4(json_bytes, 0x20)
    pad4(binary, 0)
    total = 12 + 8 + len(json_bytes) + 8 + len(binary)
    glb = bytearray(struct.pack('<III', 0x46546C67, 2, total))
    glb.extend(struct.pack('<II', len(json_bytes), 0x4E4F534A))
    glb.extend(json_bytes)
    glb.extend(struct.pack('<II', len(binary), 0x004E4942))
    glb.extend(binary)
    path.write_bytes(glb)
    return {'triangles': triangle_count, 'meshes': len(meshes), 'nodes': len(nodes), 'bytes': len(glb)}


def bounds(meshes: Sequence[Mesh]) -> tuple[Vec3, Vec3]:
    vertices = [v for mesh in meshes for v in mesh.vertices]
    return (
        tuple(min(v[i] for v in vertices) for i in range(3)),
        tuple(max(v[i] for v in vertices) for i in range(3)),
    )  # type: ignore


def camera_basis(camera: Vec3, target: Vec3 = (0, 0, 0)) -> tuple[Vec3, Vec3, Vec3]:
    forward = norm(sub(target, camera))
    right = norm(cross(forward, (0, 1, 0)))
    up = norm(cross(right, forward))
    return right, up, forward


def project(point: Vec3, camera: Vec3, width: int, height: int, focal: float) -> tuple[float, float, float]:
    right, up, forward = camera_basis(camera)
    rel = sub(point, camera)
    depth = max(0.01, dot(rel, forward))
    return width / 2 + focal * dot(rel, right) / depth, height / 2 - focal * dot(rel, up) / depth, depth


def write_hero_svg(path: Path, meshes: Sequence[Mesh], width: int = 1600, height: int = 900) -> None:
    camera = (-29, 20, -28)
    light = norm((0.7, 1.0, -0.5))
    polygons: list[tuple[float, str]] = []
    for mesh in meshes:
        material = MATERIALS[mesh.material]
        base = hex_rgb(material.color)
        for face in mesh.faces:
            points3 = [mesh.vertices[i] for i in face]
            normal = norm(cross(sub(points3[1], points3[0]), sub(points3[2], points3[0])))
            center = mul(add(add(points3[0], points3[1]), points3[2]), 1 / 3)
            if dot(normal, norm(sub(camera, center))) <= 0:
                continue
            points = [project(p, camera, width, height, 1340) for p in points3]
            depth = sum(p[2] for p in points) / 3
            diffuse = 0.25 + 0.75 * clamp(dot(normal, light))
            if material.emissive:
                diffuse = 1.18
            color = rgb_hex(tuple(clamp(c * diffuse) for c in base))
            opacity = material.alpha
            point_string = ' '.join(f'{x:.2f},{y:.2f}' for x, y, _ in points)
            glow = ' filter="url(#glow)"' if material.emissive else ''
            polygons.append((depth, f'<polygon points="{point_string}" fill="{color}" stroke="#071015" stroke-width="0.45" opacity="{opacity:.3f}"{glow}/>'))
    polygons.sort(key=lambda row: row[0], reverse=True)

    rng = random.Random(13013)
    stars = ''.join(f'<circle cx="{rng.uniform(0, width):.1f}" cy="{rng.uniform(0, height):.1f}" r="{rng.choice((0.4,0.6,0.8,1.1))}" fill="#d9f7ff" opacity="{rng.uniform(0.12,0.65):.2f}"/>' for _ in range(180))
    path.write_text(f'''<svg xmlns="http://www.w3.org/2000/svg" width="{width}" height="{height}" viewBox="0 0 {width} {height}">
<defs>
  <radialGradient id="bg"><stop offset="0" stop-color="#183343"/><stop offset="0.52" stop-color="#07131b"/><stop offset="1" stop-color="#020508"/></radialGradient>
  <linearGradient id="title"><stop stop-color="#edf5ef"/><stop offset="1" stop-color="#69d8e7"/></linearGradient>
  <filter id="glow" x="-250%" y="-250%" width="600%" height="600%"><feGaussianBlur stdDeviation="3" result="b"/><feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge></filter>
  <filter id="shadow"><feDropShadow dx="0" dy="18" stdDeviation="24" flood-color="#000" flood-opacity="0.8"/></filter>
</defs>
<rect width="100%" height="100%" fill="url(#bg)"/>
<path d="M0 680 C330 570 620 760 1020 635 C1280 555 1455 590 1600 525 L1600 900 L0 900Z" fill="#071017" opacity="0.7"/>
{stars}
<g filter="url(#shadow)">{''.join(p for _, p in polygons)}</g>
<g font-family="Inter,Segoe UI,Arial,sans-serif">
  <text x="72" y="92" fill="url(#title)" font-size="52" font-weight="800" letter-spacing="3">SF-K0 KESTREL</text>
  <text x="75" y="134" fill="#9bb0b6" font-size="18" letter-spacing="5">BORROWED TIME / STARTER SHIP VISUAL STANDARD</text>
  <line x1="76" y1="157" x2="548" y2="157" stroke="#4ecbe0" stroke-width="4"/>
  <text x="76" y="782" fill="#d3ddd9" font-size="21">A death ship that still starts every morning.</text>
  <text x="76" y="817" fill="#71888f" font-size="15">28 m long · 14 m beam · 6 m high · +X forward · +Y up · one axial M drive</text>
</g>
</svg>''', encoding='utf-8')


def write_blueprint_svg(path: Path, meshes: Sequence[Mesh], width: int = 1600, height: int = 1000) -> None:
    minv, maxv = bounds(meshes)
    views = [
        ('TOP / +Y', (50, 112, 930, 760), (0, 2), (1, 1)),
        ('PORT / -Z', (1030, 112, 520, 350), (0, 1), (1, -1)),
        ('FRONT / +X', (1030, 560, 520, 312), (2, 1), (1, -1)),
    ]
    parts: list[str] = []
    for x in range(0, width + 1, 40):
        parts.append(f'<line x1="{x}" y1="0" x2="{x}" y2="{height}" stroke="#12303a"/>')
    for y in range(0, height + 1, 40):
        parts.append(f'<line x1="0" y1="{y}" x2="{width}" y2="{y}" stroke="#12303a"/>')
    for label, rect, axes, flips in views:
        ox, oy, rw, rh = rect
        a0, a1 = axes
        f0, f1 = flips
        ranges = [maxv[i] - minv[i] for i in range(3)]
        scale = min(rw / max(ranges[a0], 1e-6), rh / max(ranges[a1], 1e-6)) * 0.87
        c0 = (minv[a0] + maxv[a0]) / 2
        c1 = (minv[a1] + maxv[a1]) / 2
        cx, cy = ox + rw / 2, oy + rh / 2
        parts.append(f'<rect x="{ox}" y="{oy}" width="{rw}" height="{rh}" fill="#061119" fill-opacity="0.78" stroke="#2c5965"/>')
        parts.append(f'<text x="{ox+18}" y="{oy+30}" fill="#78d9e6" font-size="17" font-weight="700">{label}</text>')
        seen: set[tuple[tuple[int, int], tuple[int, int]]] = set()
        for mesh in meshes:
            for face in mesh.faces:
                ids = [*face, face[0]]
                for i in range(3):
                    p, q = mesh.vertices[ids[i]], mesh.vertices[ids[i + 1]]
                    x1 = cx + f0 * (p[a0] - c0) * scale
                    y1 = cy + f1 * (p[a1] - c1) * scale
                    x2 = cx + f0 * (q[a0] - c0) * scale
                    y2 = cy + f1 * (q[a1] - c1) * scale
                    key = tuple(sorted(((round(x1), round(y1)), (round(x2), round(y2)))))
                    if key in seen:
                        continue
                    seen.add(key)
                    parts.append(f'<line x1="{x1:.2f}" y1="{y1:.2f}" x2="{x2:.2f}" y2="{y2:.2f}" stroke="#a8bec1" stroke-opacity="0.28" stroke-width="0.75"/>')
        parts.append(f'<line x1="{cx-10}" y1="{cy}" x2="{cx+10}" y2="{cy}" stroke="#c28b35"/><line x1="{cx}" y1="{cy-10}" x2="{cx}" y2="{cy+10}" stroke="#c28b35"/>')

    callouts = [
        (260, 188, 545, 305, 'GUARDED MASK PROW', 'paired sensor slits; face is discovered, not literal'),
        (640, 742, 745, 630, 'SPLIT SHOULDERS', 'negative space carries identity at gameplay distance'),
        (1150, 195, 1230, 305, 'ONE AXIAL M DRIVE', 'outboard masses are radiators, not false engines'),
        (1190, 680, 1265, 748, 'GROUND-CREDIBLE SKIDS', 'Tier 0 lives close to rock, drill, and service crews'),
    ]
    for tx, ty, px, py, title, detail in callouts:
        parts.append(f'<circle cx="{px}" cy="{py}" r="4" fill="#c28b35"/><path d="M{px} {py} L{tx-12} {ty-6}" stroke="#c28b35" fill="none"/>')
        parts.append(f'<text x="{tx}" y="{ty}" fill="#e4ece8" font-size="15" font-weight="700">{title}</text><text x="{tx}" y="{ty+21}" fill="#789098" font-size="12">{detail}</text>')

    swatches = []
    for index, material in enumerate(MATERIALS[:11]):
        x = 50 + index * 137
        swatches.append(f'<rect x="{x}" y="925" width="124" height="17" rx="2" fill="{material.color}"/><text x="{x}" y="961" fill="#70878e" font-size="9">{material.name[:18].replace("_", " ")}</text>')
    path.write_text(f'''<svg xmlns="http://www.w3.org/2000/svg" width="{width}" height="{height}" viewBox="0 0 {width} {height}">
<rect width="100%" height="100%" fill="#030a0f"/>
<g font-family="Inter,Segoe UI,Arial,sans-serif">{''.join(parts)}
<text x="50" y="58" fill="#e8f0ec" font-size="36" font-weight="800" letter-spacing="2">SF-K0 KESTREL / DESIGN &amp; SCALE SHEET</text>
<text x="53" y="87" fill="#6f8790" font-size="14" letter-spacing="3">SPACEFACE — BORROWED TIME — STARTER SHIP REFERENCE IMPLEMENTATION</text>
{''.join(swatches)}</g></svg>''', encoding='utf-8')


def validate(meshes: Sequence[Mesh]) -> dict[str, Any]:
    errors: list[str] = []
    for mesh in meshes:
        if not mesh.vertices or not mesh.faces:
            errors.append(f'{mesh.name}: empty mesh')
        for face in mesh.faces:
            if len(set(face)) != 3 or any(index < 0 or index >= len(mesh.vertices) for index in face):
                errors.append(f'{mesh.name}: invalid face {face}')
    minv, maxv = bounds(meshes)
    dimensions = [maxv[i] - minv[i] for i in range(3)]
    return {
        'ok': not errors,
        'errors': errors,
        'meshCount': len(meshes),
        'sourceVertexCount': sum(len(mesh.vertices) for mesh in meshes),
        'triangleCount': sum(len(mesh.faces) for mesh in meshes),
        'boundsMin': [round(v, 4) for v in minv],
        'boundsMax': [round(v, 4) for v in maxv],
        'dimensionsM': [round(v, 4) for v in dimensions],
    }


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument('--output', type=Path, default=Path(__file__).resolve().parents[2] / 'assets' / 'ships' / 'kestrel')
    args = parser.parse_args()
    out = args.output
    out.mkdir(parents=True, exist_ok=True)
    meshes = build_model()
    checks = validate(meshes)
    if not checks['ok']:
        print(json.dumps(checks, indent=2))
        return 1
    glb_stats = write_glb(out / 'kestrel_reference.glb', meshes)
    write_hero_svg(out / 'kestrel_hero.svg', meshes)
    write_blueprint_svg(out / 'kestrel_blueprint.svg', meshes)
    manifest = {
        'schemaVersion': 1,
        'assetId': 'SF_K0_KESTREL_BORROWED_TIME',
        'displayName': 'SF-K0 Kestrel / BORROWED TIME',
        'role': 'starter ship; graphics quality benchmark',
        'fiction': {
            'sentence': 'A death ship that still starts every morning.',
            'class': 'Tier-0 scout / manual miner / courier',
            'history': 'Haunted ex-gangster runner nobody else would fly.',
            'motto': 'BORROWED TIME',
            'mascot': 'ghost service stencil',
            'tally': 13,
        },
        'coordinateSystem': {'handedness': 'right', 'forward': '+X', 'up': '+Y', 'starboard': '+Z', 'unit': 'metre'},
        'nominalDimensionsM': {'length': 28, 'height': 6, 'beam': 14},
        'actualBoundsDimensionsM': {'length': checks['dimensionsM'][0], 'height': checks['dimensionsM'][1], 'beam': checks['dimensionsM'][2]},
        'runtimeSource': 'src/render/ships/kestrelHero.js',
        'files': {
            'referenceModel': 'kestrel_reference.glb',
            'heroSheet': 'kestrel_hero.svg',
            'blueprint': 'kestrel_blueprint.svg',
            'readme': 'README.md',
        },
        'metrics': {'geometry': checks, 'glb': glb_stats},
        'materials': [material.__dict__ for material in MATERIALS],
        'sockets': SOCKETS,
        'visualContract': {
            'threeSecondRead': ['guarded wedge hull', 'split shoulders', 'single axial cyan drive', 'broken cyan centerline', 'paired sensor brow'],
            'thirtySecondRead': ['port field repair', 'starboard utility pod', 'landing skids', 'visible pulse weapon', 'visible mining emitter', 'BORROWED TIME stencil'],
            'wearRule': 'Only contact, heat, service, leading-edge, and repair zones receive strong wear.',
        },
        'authoring': {'generator': 'tools/art/generate_kestrel_reference.py', 'thirdPartyDependencies': [], 'deterministic': True},
    }
    (out / 'kestrel_manifest.json').write_text(json.dumps(manifest, indent=2) + '\n', encoding='utf-8')
    print(json.dumps({'output': str(out), 'validation': checks, 'glb': glb_stats}, indent=2))
    return 0


if __name__ == '__main__':
    raise SystemExit(main())
