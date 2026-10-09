#!/usr/bin/env python3
"""Compare decoded GLB triangles, attributes, named hierarchy, materials and motion."""
import argparse,collections,hashlib,json,struct
from pathlib import Path

def sha(raw):return hashlib.sha256(raw).hexdigest()
def stable(value):return json.dumps(value,sort_keys=True,separators=(',',':'),allow_nan=False)
class GLB:
    def __init__(self,path):
        self.raw=Path(path).read_bytes();magic,version,length=struct.unpack_from('<III',self.raw)
        assert magic==0x46546c67 and version==2 and length==len(self.raw),'Invalid GLB'
        size,kind=struct.unpack_from('<II',self.raw,12);assert kind==0x4e4f534a
        self.doc=json.loads(self.raw[20:20+size]);self.bin=self.raw[28+size:]
        assert not any('uri'in b for b in self.doc.get('buffers',[])),'External buffer'
    def view(self,index):
        v=self.doc['bufferViews'][index];start=v.get('byteOffset',0);return self.bin[start:start+v['byteLength']]
    def accessor(self,index):
        a=self.doc['accessors'][index];assert 'sparse'not in a,'Sparse accessor not implemented'
        v=self.doc['bufferViews'][a['bufferView']];n={'SCALAR':1,'VEC2':2,'VEC3':3,'VEC4':4}[a['type']]
        code={5120:'b',5121:'B',5122:'h',5123:'H',5125:'I',5126:'f'}[a['componentType']];fmt='<'+code*n;size=struct.calcsize(fmt)
        offset=v.get('byteOffset',0)+a.get('byteOffset',0);stride=v.get('byteStride',size)
        return [struct.unpack_from(fmt,self.bin,offset+i*stride)for i in range(a['count'])]
    def image(self,index):
        im=self.doc['images'][index];assert 'uri'not in im,'External texture';return {'mimeType':im.get('mimeType'),'sha256':sha(self.view(im['bufferView']))}
    def material(self,index):
        m=json.loads(json.dumps(self.doc['materials'][index]))
        def normalize(obj):
            if isinstance(obj,dict):
                for key,value in list(obj.items()):
                    if key.endswith('Texture')and isinstance(value,dict)and 'index'in value:
                        tex=self.doc['textures'][value['index']];value['index']={'image':self.image(tex['source']),'sampler':self.doc.get('samplers',[])[tex['sampler']]if 'sampler'in tex else {}}
                    normalize(value)
            elif isinstance(obj,list):
                for v in obj:normalize(v)
        normalize(m);return m
    def signature(self):
        d=self.doc;names=[n.get('name','')for n in d['nodes']];assert len(set(names))==len(names),'Duplicate node names'
        materials={m['name']:self.material(i)for i,m in enumerate(d.get('materials',[]))};meshes={};attribute_geometry={};triangles=collections.Counter();nodes={}
        for index,node in enumerate(d['nodes']):
            name=node['name'];nodes[name]={k:node[k]for k in ['translation','rotation','scale','matrix']if k in node};nodes[name]['children']=sorted(names[i]for i in node.get('children',[]))
            if 'mesh'not in node:continue
            for primitive in d['meshes'][node['mesh']]['primitives']:
                assert primitive.get('mode',4)==4,'Nontriangular primitive'
                attrs=sorted(primitive['attributes']);arrays=[self.accessor(primitive['attributes'][a])for a in attrs];indices=[v[0]for v in self.accessor(primitive['indices'])];assert len(indices)%3==0
                material=d['materials'][primitive['material']]['name']if 'material'in primitive else '<unassigned>';key=name+'|'+material;rows=[]
                for i in range(0,len(indices),3):
                    vs=[tuple(tuple(array[j])for array in arrays)for j in indices[i:i+3]]
                    # Cyclic normalization preserves winding while ignoring vertex/index order.
                    rows.append(min(tuple(vs[j:]+vs[:j])for j in range(3)))
                value={'attributes':attrs,'triangles':sorted(rows)}
                assert key not in meshes,'Repeated material primitive needs explicit merge'
                meshes[key]=sha(stable(value).encode())
                attribute_geometry[key]={attr:sha(stable(sorted(min(tuple(tuple(vertex[ai])for vertex in triangle[j:]+triangle[:j])for j in range(3))for triangle in rows)).encode())for ai,attr in enumerate(attrs)}
                triangles[name.split('_')[0]]+=len(rows)
        return {'geometry':meshes,'attributeGeometry':attribute_geometry,'nodes':nodes,'materials':materials,'images':sorted((self.image(i)for i in range(len(d.get('images',[])))),key=stable),'triangles':dict(sorted(triangles.items()))}

def compare_glb(reference,output):
    a,b=GLB(reference),GLB(output);sa,sb=a.signature(),b.signature()
    checks={k:sa[k]==sb[k]for k in sa}
    changed=[k for k in sorted(set(sa['geometry'])|set(sb['geometry']))if sa['geometry'].get(k)!=sb['geometry'].get(k)]
    attributes={attr:all(sa['attributeGeometry'].get(key,{}).get(attr)==sb['attributeGeometry'].get(key,{}).get(attr)for key in set(sa['attributeGeometry'])|set(sb['attributeGeometry']))for attr in sorted({attr for sig in [sa,sb]for v in sig['attributeGeometry'].values()for attr in v})}
    return {'exactTriangleAttributes':attributes,'referenceSHA256':sha(a.raw),'outputSHA256':sha(b.raw),'byteIdentical':a.raw==b.raw,'checks':checks,'changedPrimitiveAttributes':changed,'outputTriangles':sb['triangles'],'passed':all(checks.values())}

def compare_motion(reference,output,glb):
    a=json.loads(Path(reference).read_text());b=json.loads(Path(output).read_text());ref=a.pop('sourceGlbSha256');new=b.pop('sourceGlbSha256')
    return {'allNamedClipsKeysBindingsExact':a==b,'sourceSealMatchesOutput':new==sha(Path(glb).read_bytes()),'historicalSourceSHA256':ref,'outputSourceSHA256':new,'passed':a==b and new==sha(Path(glb).read_bytes())}

def main():
    p=argparse.ArgumentParser();p.add_argument('--reference',type=Path,required=True);p.add_argument('--output',type=Path,required=True);p.add_argument('--reference-motion',type=Path);p.add_argument('--output-motion',type=Path);p.add_argument('--report',type=Path,required=True);a=p.parse_args()
    result={'geometry':compare_glb(a.reference,a.output)}
    if a.reference_motion:result['motion']=compare_motion(a.reference_motion,a.output_motion,a.output)
    result['passed']=all(row['passed']for row in result.values());a.report.write_text(json.dumps(result,indent=2)+'\n');print(json.dumps(result,indent=2));raise SystemExit(0 if result['passed']else 1)
if __name__=='__main__':main()
