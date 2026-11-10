"""Forge entry point for the Swarm anchor."""
import os
import sys
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from swarm_specialists import export

if __name__ == "__main__":
    export("anchor")
