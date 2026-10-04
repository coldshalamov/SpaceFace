import copy,hashlib,importlib.util,json,struct,sys,tempfile,unittest
from pathlib import Path
from unittest.mock import patch
HERE=Path(__file__).resolve().parents[1];sys.path.insert(0,str(HERE))
import regenerate as R
from check_outputs import compare_glb,compare_motion

def fixture(path,positions=None,indices=(0,1,2),material=None,translation=None,image=b'packed-test-image'):
    positions=positions or [(0,0,0),(1,0,0),(0,1,0)];raw=b''.join(struct.pack('<3f',*v)for v in positions)+struct.pack('<3H',*indices)+b'\0\0'+image
    d={'asset':{'version':'2.0'},'buffers':[{'byteLength':len(raw)}],'bufferViews':[{'buffer':0,'byteOffset':0,'byteLength':36},{'buffer':0,'byteOffset':36,'byteLength':6},{'buffer':0,'byteOffset':44,'byteLength':len(image)}],'accessors':[{'bufferView':0,'componentType':5126,'count':3,'type':'VEC3'},{'bufferView':1,'componentType':5123,'count':3,'type':'SCALAR'}],'nodes':[{'name':'LOD0_BODY','mesh':0}],'meshes':[{'primitives':[{'attributes':{'POSITION':0},'indices':1,'material':0}]}],'materials':[material or {'name':'Material_Test','pbrMetallicRoughness':{'roughnessFactor':.6}}],'images':[{'bufferView':2,'mimeType':'image/png'}]}
    if translation:d['nodes'][0]['translation']=translation
    js=json.dumps(d).encode();js+=b' '*((-len(js))%4);raw+=b'\0'*((-len(raw))%4)
    path.write_bytes(struct.pack('<III',0x46546c67,2,28+len(js)+len(raw))+struct.pack('<II',len(js),0x4e4f534a)+js+struct.pack('<II',len(raw),0x004e4942)+raw)

class PortableTests(unittest.TestCase):
    def setUp(self):self.temp=tempfile.TemporaryDirectory();self.root=Path(self.temp.name);self.a=self.root/'a.glb';self.b=self.root/'b.glb';fixture(self.a)
    def tearDown(self):self.temp.cleanup()
    def test_exact_geometry_passes(self):fixture(self.b);self.assertTrue(compare_glb(self.a,self.b)['passed'])
    def test_index_reorder_preserves_triangle(self):fixture(self.b,[(0,1,0),(0,0,0),(1,0,0)],(1,2,0));self.assertTrue(compare_glb(self.a,self.b)['passed'])
    def test_winding_change_fails(self):fixture(self.b,indices=(0,2,1));self.assertFalse(compare_glb(self.a,self.b)['passed'])
    def test_position_change_fails(self):fixture(self.b,[(0,0,0),(1.001,0,0),(0,1,0)]);self.assertFalse(compare_glb(self.a,self.b)['passed'])
    def test_material_change_fails(self):fixture(self.b,material={'name':'Material_Test','pbrMetallicRoughness':{'roughnessFactor':.61}});self.assertFalse(compare_glb(self.a,self.b)['passed'])
    def test_transform_change_fails(self):fixture(self.b,translation=[1,0,0]);self.assertFalse(compare_glb(self.a,self.b)['passed'])
    def test_image_change_fails(self):fixture(self.b,image=b'changed-image');self.assertFalse(compare_glb(self.a,self.b)['passed'])
    def test_external_path_rejected(self):
        with self.assertRaises(ValueError):R.resolve_under(self.root,'../escape')
    def test_symlink_path_rejected(self):
        (self.root/'escape').symlink_to(self.root.parent,target_is_directory=True)
        with self.assertRaises(ValueError):R.resolve_under(self.root,'escape/x')
    def test_motion_reseal_required(self):
        a=self.root/'a.json';b=self.root/'b.json';base={'sourceGlbSha256':hashlib.sha256(self.a.read_bytes()).hexdigest(),'bindings':[],'clips':[]};a.write_text(json.dumps(base));b.write_text(json.dumps(base));self.assertTrue(compare_motion(a,b,self.a)['passed']);base['sourceGlbSha256']='wrong';b.write_text(json.dumps(base));self.assertFalse(compare_motion(a,b,self.a)['passed'])
    def test_changed_dependency_rejected(self):
        contract=self.root/'contract.json';contract.write_text('{}');dep=self.root/'dependency.py';dep.write_text('a')
        manifest={'models':{'charger':{'inputs':[{'path':dep.name,'sha256':'wrong'}],'contractSHA256':R.digest(contract)}},'recipeFiles':[]};(self.root/'DEPENDENCIES.json').write_text(json.dumps(manifest))
        with patch.object(R,'HERE',self.root),self.assertRaisesRegex(ValueError,'Changed dependency'):R.validate_inputs(self.root,'charger',contract)
    def test_existing_output_refused(self):
        repo=self.root/'repo';repo.mkdir();out=self.root/'out';out.mkdir();args=['regenerate.py','--repository-root',str(repo),'--model','charger','--input-contract',str(repo/'x'),'--output-root',str(out)]
        with patch.object(sys,'argv',args),self.assertRaisesRegex(ValueError,'Output already exists'):R.main()
    def test_output_inside_repository_refused(self):
        repo=self.root/'repo';repo.mkdir();args=['regenerate.py','--repository-root',str(repo),'--model','charger','--input-contract',str(repo/'x'),'--output-root',str(repo/'out')]
        with patch.object(sys,'argv',args),self.assertRaisesRegex(ValueError,'disjoint'):R.main()

if __name__=='__main__':unittest.main()
