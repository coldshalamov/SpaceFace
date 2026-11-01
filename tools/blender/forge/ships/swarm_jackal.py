"""Forge entry point for the Swarm jackal."""
import os
import sys
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from swarm_specialists import export

if __name__ == "__main__":
    export("jackal")
