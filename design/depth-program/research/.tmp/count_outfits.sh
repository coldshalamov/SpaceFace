#!/bin/bash
cd /tmp/sf-research/repos/endless-sky/data
echo "=== outfits ==="
grep -i outfit /tmp/alltxt.txt | while IFS= read -r f; do
  if [ -f "$f" ]; then
    c=$(grep -c "^outfit " "$f" 2>/dev/null)
    echo "$c | $f"
  fi
done | sort -rn
echo "=== weapons (counted as outfit tokens, since these files are gun/launcher defs) ==="
grep -i weapon /tmp/alltxt.txt | while IFS= read -r f; do
  if [ -f "$f" ]; then
    c=$(grep -c "^outfit " "$f" 2>/dev/null)
    echo "$c | $f"
  fi
done | sort -rn
echo "=== engines ==="
grep -i engine /tmp/alltxt.txt | while IFS= read -r f; do
  if [ -f "$f" ]; then
    c=$(grep -c "^outfit " "$f" 2>/dev/null)
    echo "$c | $f"
  fi
done | sort -rn
echo "=== TOTAL OUTFITS (excluding _deprecated) ==="
grep -i outfit /tmp/alltxt.txt | grep -v deprecated | while IFS= read -r f; do
  if [ -f "$f" ]; then
    grep -c "^outfit " "$f" 2>/dev/null
  fi
done | awk '{s+=$1} END {print s}'
echo "=== TOTAL WEAPONS files (outfit count) ==="
grep -i weapon /tmp/alltxt.txt | grep -v deprecated | while IFS= read -r f; do
  if [ -f "$f" ]; then
    grep -c "^outfit " "$f" 2>/dev/null
  fi
done | awk '{s+=$1} END {print s}'
echo "=== TOTAL ENGINES (outfit count) ==="
grep -i engine /tmp/alltxt.txt | grep -v deprecated | while IFS= read -r f; do
  if [ -f "$f" ]; then
    grep -c "^outfit " "$f" 2>/dev/null
  fi
done | awk '{s+=$1} END {print s}'
echo "=== ALL outfit counts everywhere ==="
/usr/bin/find . -type f -name '*.txt' -print0 | xargs -0 grep -hc "^outfit " | awk '{s+=$1} END {print s}'
