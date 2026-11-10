"""Lamellar Mite candidate. Explicit --contract and --out; never invoke --live here."""
from pathlib import Path
import sys
sys.path.insert(0,str(Path(__file__).resolve().parents[1]))
from brood_lamellar_mite import build
from brood_kit import main
sys.path.insert(0,str(Path(__file__).resolve().parents[1]/'animations'))
from ANI_BROOD_MITE import build as animation_builder
if __name__=='__main__':
    if '--live' in sys.argv:raise RuntimeError('This candidate entry cannot activate production')
    main('brood_mite',builder=build,animation_builder=animation_builder,source_file=__file__)
