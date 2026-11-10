#!/bin/bash
cd /tmp/sf-research/repos/endless-sky/data
echo "=== news per file ==="
grep -i news /tmp/alltxt.txt | while IFS= read -r f; do
  if [ -f "$f" ]; then
    c=$(grep -c "^news " "$f" 2>/dev/null)
    echo "$c | $f"
  fi
done | sort -rn
echo "=== TOTAL news ==="
grep -i news /tmp/alltxt.txt | while IFS= read -r f; do
  if [ -f "$f" ]; then
    grep -c "^news " "$f" 2>/dev/null
  fi
done | awk '{s+=$1} END {print s}'

echo "=== hail files ==="
grep -i hail /tmp/alltxt.txt
echo "=== hails per file ==="
grep -iE "hail" /tmp/alltxt.txt | while IFS= read -r f; do
  if [ -f "$f" ]; then
    c=$(grep -cE "^hail " "$f" 2>/dev/null)
    echo "$c | $f"
  fi
done | sort -rn

echo "=== inspect hails.txt structure ==="
head -30 human/hails.txt
