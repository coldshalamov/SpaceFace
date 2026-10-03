"""P03 Second Measure keel; see ceres_second_measure_kit for the authored contract."""
import sys
from pathlib import Path
sys.path.insert(0,str(Path(__file__).resolve().parent.parent))
import ceres_second_measure_kit as K

def build():
    return K.section('keel')

if __name__ == "__main__":
    K.main("keel")
