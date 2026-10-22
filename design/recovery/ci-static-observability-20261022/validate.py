from pathlib import Path
import copy,itertools,os,subprocess,yaml
r=Path(__file__).parent
before=yaml.safe_load((r/'baseline/.github/workflows/check.yml').read_text())
after=yaml.safe_load((r/'candidate/.github/workflows/check.yml').read_text())
steps=after['jobs']['static']['steps']
install=next(s for s in steps if s['name']=='Install dependencies')
runner=next(s for s in steps if s['name'].startswith('Run static check group'))
assert install=={'name':'Install dependencies','id':'install_dependencies','run':'npm ci'}
assert 'if' not in steps[0] and 'if' not in steps[1]
assert runner['if']=="${{ !cancelled() && steps.install_dependencies.outcome == 'success' }}"
# Assert the only semantic changes are the step id and runner condition.
restored=copy.deepcopy(after)
for s in restored['jobs']['static']['steps']:
 if s['name']=='Install dependencies': del s['id']
 if s['name'].startswith('Run static check group'): del s['if']
assert restored==before
assert not any('continue-on-error' in s for s in steps)
assert after['jobs']['static']['strategy']['fail-fast'] is False
assert after['concurrency']['cancel-in-progress'] is True
assert after['jobs']['check']['if']=='${{ !cancelled() }}'
# Evaluate this restricted expression's Boolean/string subset, not a GitHub runner emulator.
expr=runner['if'][3:-2].strip().replace('!cancelled()', 'not cancelled').replace('&&','and').replace('steps.install_dependencies.outcome','install_outcome')
count=0
for cancelled,checkout,node,dependency,precheck in itertools.product([False,True],*([['success','failure','skipped','cancelled']]*4)):
 # Earlier setup uses implicit success(): dependency installation never executes if either setup fails.
 install_outcome=dependency if checkout==node=='success' else 'skipped'
 actual=eval(expr,{'__builtins__':{}},{'cancelled':cancelled,'install_outcome':install_outcome})
 expected=not cancelled and checkout==node==dependency=='success'
 assert actual==expected,(cancelled,checkout,node,dependency,precheck)
 count+=1
print(f'PASS: {count} setup/precheck/cancellation condition cases; existing YAML semantics unchanged outside two fields')
# Execute the actual unchanged final aggregation shell: a precheck failure remains red even if matrix passes;
# an independent matrix failure also remains red; skipped/cancelled dependencies cannot turn green.
script=after['jobs']['check']['steps'][0]['run']
for result in ['success','failure','skipped','cancelled']:
 env=dict(os.environ,STATIC_RESULT=result,SIM_RESULT='success',FEEL_RESULT='success',BROWSER_RESULT='success')
 p=subprocess.run(['bash','-e','-c',script],env=env,capture_output=True,text=True)
 assert p.returncode==(0 if result=='success' else 1),(result,p)
 print(f'PASS: final aggregation static={result}: exit {p.returncode}')
assert 'continue-on-error' not in after['jobs']['static']
print('PASS: precheck failure and independent check failure remain job failures (no continue-on-error)')
