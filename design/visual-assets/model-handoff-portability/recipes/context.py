"""Explicit paths for portable recipe copies; no historical script is rewritten."""
import json,os,sys
from pathlib import Path
JOB=json.loads(Path(os.environ['SPACEFACE_PORTABLE_JOB']).read_text())
REPOSITORY=Path(JOB['repositoryRoot'])
INPUT=Path(JOB['inputRoot'])
OUT=Path(JOB['outputRoot'])
CONTRACT=Path(JOB['inputContract'])
FORGE=Path(JOB['forgeRoot'])
sys.path.insert(0,str(FORGE))
