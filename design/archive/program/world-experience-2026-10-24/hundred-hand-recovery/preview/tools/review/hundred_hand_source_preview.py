#!/usr/bin/env python3
"""CPU source comparison only: not PBR, gameplay, or visual-quality acceptance."""
import argparse
import io
import json
import struct
from pathlib import Path
import numpy as np
from PIL import Image, ImageDraw, ImageFont

parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument("--root", type=Path, default=Path("."))
parser.add_argument("--output", type=Path, required=True)
parser.add_argument("--font", default="DejaVuSans.ttf")
args = parser.parse_args()
W, H, S = 1024, 690, 2
canvas = Image.new("RGB", (W*S, H*S), (17, 23, 30))
draw = ImageDraw.Draw(canvas)
font = ImageFont.truetype(args.font, 16*S)
small = ImageFont.truetype(args.font, 12*S)
title = ImageFont.truetype(args.font, 22*S)
draw.text((24*S, 16*S), "Hundred-Hand | original matched source set", font=title, fill=(231,236,241))
draw.text((24*S, 47*S), "CPU geometry preview: source-v4 / guide paint2. Independent fit; not live-game appearance.", font=small, fill=(159,176,189))
panels = [("mile",(20,80,1004,330)), ("power",(20,350,340,635)),
          ("guide",(352,350,672,635)), ("cargo",(684,350,1004,635))]
for role, box in panels:
    data = (args.root / f"assets/ships/parts/places/place_hundred_hand_{role}.glb").read_bytes()
    json_length = struct.unpack_from("<I", data, 12)[0]
    gltf = json.loads(data[20:20+json_length])
    binary = data[28+json_length:]
    def accessor(index):
        item = gltf["accessors"][index]
        view = gltf["bufferViews"][item["bufferView"]]
        dtype = {5126:"<f4",5125:"<u4",5123:"<u2",5121:"u1"}[item["componentType"]]
        width = {"SCALAR":1,"VEC2":2,"VEC3":3,"VEC4":4}[item["type"]]
        size = np.dtype(dtype).itemsize
        return np.ndarray((item["count"],width), dtype=dtype, buffer=binary,
            offset=view.get("byteOffset",0)+item.get("byteOffset",0),
            strides=(view.get("byteStride",size*width),size)).copy()
    def transform(node):
        if "matrix" in node:
            return np.array(node["matrix"]).reshape(4,4).T
        x,y,z,w = node.get("rotation",[0,0,0,1])
        matrix = np.eye(4)
        matrix[:3,:3] = np.array([
            [1-2*(y*y+z*z),2*(x*y-z*w),2*(x*z+y*w)],
            [2*(x*y+z*w),1-2*(x*x+z*z),2*(y*z-x*w)],
            [2*(x*z-y*w),2*(y*z+x*w),1-2*(x*x+y*y)]
        ]) @ np.diag(node.get("scale",[1,1,1]))
        matrix[:3,3] = node.get("translation",[0,0,0])
        return matrix
    matrices = {}
    def walk(index, parent):
        node = gltf["nodes"][index]
        matrices[index] = parent @ transform(node)
        for child in node.get("children",[]):
            walk(child, matrices[index])
    for index in gltf["scenes"][gltf.get("scene",0)]["nodes"]:
        walk(index, np.eye(4))
    triangles, colors = [], []
    for index, node in enumerate(gltf["nodes"]):
        if ("mesh" not in node or node.get("extras",{}).get("nonRender")
                or node.get("name","").startswith("COLLISION_")):
            continue
        for primitive in gltf["meshes"][node["mesh"]]["primitives"]:
            positions = accessor(primitive["attributes"]["POSITION"])
            positions = (np.c_[positions,np.ones(len(positions))] @ matrices[index].T)[:,:3]
            indices = accessor(primitive["indices"]).ravel().reshape(-1,3)
            tri = positions[indices]
            material = gltf["materials"][primitive["material"]]
            pbr = material.get("pbrMetallicRoughness",{})
            factor = np.array(pbr.get("baseColorFactor",[1,1,1,1]))[:3]
            color = np.repeat(factor[None,:],len(indices),axis=0)
            if "baseColorTexture" in pbr and "TEXCOORD_0" in primitive["attributes"]:
                texture = gltf["textures"][pbr["baseColorTexture"]["index"]]
                image = gltf["images"][texture["source"]]
                view = gltf["bufferViews"][image["bufferView"]]
                start = view.get("byteOffset",0)
                pixels = np.array(Image.open(io.BytesIO(binary[start:start+view["byteLength"]])).convert("RGB"))/255.
                uv = accessor(primitive["attributes"]["TEXCOORD_0"])[indices].mean(axis=1)%1
                sampled = pixels[(uv[:,1]*pixels.shape[0]).astype(int)%pixels.shape[0],
                                 (uv[:,0]*pixels.shape[1]).astype(int)%pixels.shape[1]]
                color *= sampled**2.2
            normals = np.cross(tri[:,1]-tri[:,0],tri[:,2]-tri[:,0])
            normals /= np.maximum(np.linalg.norm(normals,axis=1)[:,None],1e-12)
            shade = .34+.66*np.abs(normals @ np.array([-.3,.85,.43]))
            color = np.clip(color*shade[:,None]+np.array(material.get("emissiveFactor",[0,0,0]))[None,:]*.7,0,1)**(1/2.2)
            triangles.append(tri)
            colors.append((color*255).astype("uint8"))
    triangles = np.concatenate(triangles)
    colors = np.concatenate(colors)
    view = np.array([.38,.65,.66])
    view /= np.linalg.norm(view)
    right = np.cross([0,1,0],view)
    right /= np.linalg.norm(right)
    up = np.cross(view,right)
    projection = np.stack([triangles@right,-triangles@up],axis=-1)
    depth = triangles@view
    x0,y0,x1,y1 = box
    low, high = projection.min(axis=(0,1)), projection.max(axis=(0,1))
    scale = min((x1-x0-36)/(high[0]-low[0]),(y1-y0-62)/(high[1]-low[1]))
    points = ((projection-(low+high)/2)*scale+[(x0+x1)/2,(y0+y1)/2+12])*S
    draw.rounded_rectangle(tuple(value*S for value in box),radius=8*S,
        fill=(24,32,41),outline=(51,67,80),width=S)
    for index in np.argsort(depth.mean(axis=1)):
        draw.polygon([tuple(point) for point in points[index]],fill=tuple(colors[index]))
    draw.text(((x0+14)*S,(y0+10)*S),role.upper()+(" / paint2" if role=="guide" else " / source-v4"),
        font=font,fill=(219,230,236))
    draw.text(((x0+14)*S,(y1-23)*S),f"{len(triangles):,} visible triangles | +Y up",
        font=small,fill=(153,175,192))
draw.text((24*S,652*S),
    "Actual GLB geometry and material factors; centroid texture sampling + flat light, no PBR or gameplay claims.",
    font=small,fill=(159,176,189))
canvas = canvas.resize((W,H),Image.Resampling.LANCZOS)
canvas.save(args.output,format="WEBP",quality=80,method=6)
