#!/usr/bin/env python3
"""Review-only builds from pinned repository inputs into a NEW external directory."""
import argparse,hashlib,json,os,shutil,subprocess,sys
from pathlib import Path
HERE=Path(__file__).resolve().parent

def digest(path):return hashlib.sha256(path.read_bytes()).hexdigest()
def resolve_under(root,relative):
    p=(root/relative).resolve()
    if not p.is_relative_to(root):raise ValueError('Dependency escapes repository: '+relative)
    return p

def validate_inputs(repository,model,contract):
    manifest=json.loads((HERE/'DEPENDENCIES.json').read_text());row=manifest['models'][model]
    checked=[]
    for item in row['inputs']:
        p=resolve_under(repository,item['path'])
        if not p.is_file():raise ValueError('Missing dependency: '+item['path'])
        if digest(p)!=item['sha256']:raise ValueError('Changed dependency: '+item['path'])
        checked.append(item)
    for item in manifest['recipeFiles']:
        p=resolve_under(HERE,item['path'])
        if digest(p)!=item['sha256']:raise ValueError('Changed portable recipe dependency: '+item['path'])
    if digest(contract)!=row['contractSHA256']:raise ValueError('Input contract differs from the frozen recipe; author a new recipe/version before changing anatomy')
    return row,checked

def main():
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--repository-root',type=Path,required=True)
    parser.add_argument('--model',choices=['charger','mite','splitter'],required=True)
    parser.add_argument('--input-contract',type=Path,required=True)
    parser.add_argument('--output-root',type=Path,required=True,help='New directory outside the repository; never overwritten')
    parser.add_argument('--blender',default='blender')
    parser.add_argument('--check-only',action='store_true')
    args=parser.parse_args();repo=args.repository_root.resolve();out=args.output_root.resolve();contract=args.input_contract.resolve()
    if out==repo or out.is_relative_to(repo) or repo.is_relative_to(out):raise ValueError('Output and repository must be disjoint')
    if out==HERE or out.is_relative_to(HERE) or HERE.is_relative_to(out):raise ValueError('Output must be disjoint from the portable recipe')
    if out.exists():raise ValueError('Output already exists; choose a new version directory')
    row,checked=validate_inputs(repo,args.model,contract)
    if args.check_only:print(json.dumps({'valid':True,'model':args.model,'checked':len(checked)}));return
    out.mkdir(parents=True);logs=out/'logs';logs.mkdir()
    env=os.environ.copy();env['PYTHONDONTWRITEBYTECODE']='1';env['BLENDER_USER_CONFIG']=str(out/'blender-config')
    job={'repositoryRoot':str(repo),'inputRoot':str(repo/row['inputRoot']),'inputContract':str(contract),'outputRoot':str(out),'forgeRoot':str(HERE/'dependencies/forge')}
    (out/'job.json').write_text(json.dumps(job,indent=2)+'\n');env['SPACEFACE_PORTABLE_JOB']=str(out/'job.json')
    steps=[]
    if args.model=='charger':
        steps=[('lod'+str(i),HERE/'recipes/charger/build_charger.py',{'CHARGER_LOD':str(i)})for i in range(3)]
        steps += [(name,HERE/'recipes/charger'/file,{})for name,file in [('assemble','assemble_candidate.py'),('motion','bake_motion.py'),('topology','verify_source.py')]]
    elif args.model=='mite':steps=[(name,HERE/'recipes/mite'/file,{})for name,file in [('lods','export_lods.py'),('assemble','assemble_candidate.py')]]
    else:
        # Preserve the original sealed relative package layout. No script rewriting.
        # Copies avoid shared mutable input inodes. Nothing invokes publish.mjs.
        stage=out/'staging';stage.mkdir()
        for item in checked:
            if 'stagePath' not in item:continue
            target=stage/item['stagePath'];target.parent.mkdir(parents=True,exist_ok=True)
            shutil.copy2(repo/item['path'],target)
        steps=[('export',stage/'tools/blender/forge/brood_splitter_a6.py',{})]
    receipt={'schema':'spaceface.portableRejectedModelRecipe.v1','model':args.model,'status':'running','artAccepted':False,'runtimeAdmitted':False,'historicalModel':row['historicalIdentity'],'inputContractSHA256':digest(contract),'inputs':checked,'recipeManifestSHA256':digest(HERE/'DEPENDENCIES.json'),'steps':[]}
    try:
        for label,script,extra in steps:
            command=[args.blender,'--background','--factory-startup','--python-exit-code','1','--python-expr','import sys; sys.dont_write_bytecode = True','--python',str(script)]
            with (logs/(label+'.log')).open('w') as log:
                result=subprocess.run(command,cwd=out,env={**env,**extra},stdout=log,stderr=subprocess.STDOUT)
            receipt['steps'].append({'step':label,'exitCode':result.returncode,'log':'logs/'+label+'.log'})
            if result.returncode:raise RuntimeError('Build failed at '+label+'; inspect '+str(logs/(label+'.log')))
        receipt['status']='generated-unverified';receipt['outputs']=[{'path':str(p.relative_to(out)),'sha256':digest(p),'bytes':p.stat().st_size}for p in sorted(out.rglob('*'))if p.is_file()and p.suffix in {'.glb','.blend'}]
    except Exception:
        receipt['status']='failed';raise
    finally:(out/'recipe-receipt.json').write_text(json.dumps(receipt,indent=2)+'\n')
    print(json.dumps({'output':str(out),'status':receipt['status'],'artAccepted':False}))

if __name__=='__main__':main()
